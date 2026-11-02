import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import axios from "axios";
import settingsService, { WepSettingsService, defaultWepSettings, validateWepSettings } from "./wep-settings.service.js";
import { WepSettingsRuntime, settingsScheduleEnv } from "./wep-settings-runtime.js";
import { WepSyncService } from "./wep-sync.service.js";
import { createWepAdminRouter } from "./wep-admin.routes.js";
import { enviarTemplateEntregaEnReparto, enviarTemplateDeudaConPdf } from "../../services/whatsapp.service.js";

const actor = { id: 1, displayName: "Sistemas", role: "TIC" };
const env = { WEP_SETTINGS_ENABLED: "true", WEP_SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
function fixture() {
  const queries = []; let saved = null;
  const client = { async query(sql, params = []) {
    queries.push({ sql, params });
    if (sql.startsWith("SELECT") && sql.includes("FROM public.wep_settings WHERE")) return { rows: saved ? [saved] : [] };
    if (sql.startsWith("INSERT INTO public.wep_settings (")) saved = { revision: params[0], config: JSON.parse(params[1]), encrypted_token: params[2] };
    return { rows: [] };
  }, release() { queries.push({ sql: "RELEASE", params: [] }); } };
  const pool = { query: client.query, async connect() { return client; } };
  return { service: new WepSettingsService({ env, postgresPool: pool }), queries, setSaved(value) { saved = value; } };
}

test("valida horarios, cron de cinco campos, límites, códigos únicos, días y plantillas", () => {
  const config = defaultWepSettings({});
  assert.deepEqual(validateWepSettings(config), config);
  for (const mutate of [c => c.sync.daysAhead = 91, c => c.sync.enabled = "true", c => c.sync.cron = "* * * * * *",
    c => c.sync.vehicleCodes = ["101", "101"], c => c.sync.vehicleCodes = ["x'; DROP TABLE"], c => c.programmed.weekdays = [],
    c => c.programmed.start = "22:00", c => c.meta.phoneNumberId = "https://host", c => c.meta.apiVersion = "https://host",
    c => c.meta.templates.programmed.name = "Nombre Inválido", c => c.meta.templates.programmed.language = ""] ) {
    const next = structuredClone(config); mutate(next); assert.throws(() => validateWepSettings(next));
  }
  assert.deepEqual(validateWepSettings({ ...config, ignored: "value" }).ignored, undefined);
});

test("guarda una revisión con token cifrado y auditoría sin secretos; vacío conserva el token", async () => {
  const f = fixture(), config = defaultWepSettings({});
  const result = await f.service.save({ config, revision: 0, token: "token-exclusivo-wep" }, actor);
  assert.equal(result.revision, 1); assert.equal(result.tokenConfigured, true);
  assert.equal(JSON.stringify(result).includes("token-exclusivo"), false);
  const encrypted = f.queries.find(q => q.sql.startsWith("INSERT INTO public.wep_settings (")).params[2];
  assert.notEqual(encrypted, "token-exclusivo-wep"); assert.equal(f.service.decrypt(encrypted), "token-exclusivo-wep");
  const audit = f.queries.find(q => q.sql.includes("INSERT INTO public.wep_settings_audit"));
  assert.equal(JSON.stringify(audit).includes("token-exclusivo"), false); assert.equal(JSON.parse(audit.params[5]).tokenReplaced, true);
  await f.service.save({ config, revision: 1, token: "" }, actor);
  const writes = f.queries.filter(q => q.sql.startsWith("INSERT INTO public.wep_settings ("));
  assert.equal(writes[1].params[2], encrypted);
  await assert.rejects(f.service.save({ config, revision: 1 }, actor), e => e.status === 409);
  assert.equal(f.queries.at(-2).sql, "ROLLBACK");
  const wrongKey = new WepSettingsService({ env: { ...env, WEP_SETTINGS_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64") } });
  assert.throws(() => wrongKey.decrypt(encrypted), e => e.status === 503);
});

test("no habilita avisos reales incompletos y exige activar la configuración del servidor", async () => {
  const f = fixture(), config = defaultWepSettings({}); config.programmed.enabled = true; config.programmed.dryRun = false;
  await assert.rejects(f.service.save({ config, revision: 0 }, actor), /Completá Meta/);
  assert.equal(f.queries.some(q => q.sql.startsWith("INSERT INTO public.wep_settings (")), false);
  const disabled = new WepSettingsService({ env: {} });
  await assert.rejects(disabled.read(), e => e.status === 503);
  assert.throws(() => disabled.encrypt("test"), e => e.status === 503);
});

test("el bloqueo global impide acceder al ERP y a la conexión de importación", async () => {
  const config = defaultWepSettings({}); config.sync.blocked = true;
  const service = new WepSyncService({ settings: { async runtime() { return { config }; } },
    sourceRepository: { getEntregasProgramadas() { assert.fail("No debe leer ERP"); } },
    postgresPool: { connect() { assert.fail("No debe iniciar importación"); } } });
  const result = await service.synchronize({ fechaDesde: "2026-10-30", fechaHasta: "2026-10-30" });
  assert.equal(result.skipped, "IMPORTS_BLOCKED");
  config.sync.blocked = false; config.sync.enabled = false;
  assert.equal(settingsScheduleEnv(config, {}).WEP_SYNC_ENABLED, "false");
  assert.equal(settingsScheduleEnv(config, {}).WEP_PROGRAMMED_ENABLED, "false");
  config.programmed.enabled = true;
  assert.equal(settingsScheduleEnv(config, {}).WEP_PROGRAMMED_ENABLED, "true");
  config.sync.blocked = true;
  assert.equal(settingsScheduleEnv(config, {}).WEP_PROGRAMMED_ENABLED, "false");
});

test("aplica nuevas revisiones sin reiniciar y ante fallo pausa ambas automatizaciones", async () => {
  let revision = 1, fail = false; const events = [], config = defaultWepSettings({});
  function scheduler(name) { return { stop() { events.push(`${name}:stop`); }, start() { events.push(`${name}:start`); } }; }
  const runtime = new WepSettingsRuntime({ env: { NODE_APP_INSTANCE: "0" }, logger: { error() {} }, sync: scheduler("sync"), programmed: scheduler("programmed"),
    settings: { async runtime() { if (fail) throw new Error(); return { config, revision }; }, pool: { async query(sql, params) { events.push(params); } } } });
  await runtime.refresh(); assert.equal(runtime.revision, 1);
  const starts = events.filter(v => typeof v === "string" && v.endsWith(":start")).length;
  await runtime.refresh(); assert.equal(events.filter(v => typeof v === "string" && v.endsWith(":start")).length, starts);
  revision++; await runtime.refresh(); assert.equal(runtime.revision, 2);
  fail = true; await runtime.refresh(); assert.equal(runtime.revision, null); assert.deepEqual(events.slice(-2), ["sync:stop", "programmed:stop"]);
});

test("cambiar PIN y bloquear acceso revoca tokens y audita sin PIN ni hash", async () => {
  const queries = [];
  const client = { async query(sql, params = []) {
    queries.push({ sql, params });
    if (sql.startsWith("SELECT id")) return { rows: [{ id: 3, activo: true, es_externo: false, wep_login_activo: true, wep_pin_hash: "previous-hash" }] };
    return { rows: [] };
  }, release() {} };
  const service = new WepSettingsService({ env, postgresPool: { async connect() { return client; } }, passwordHasher: { async hash(pin, rounds) { assert.equal(rounds, 12); return `hashed-${pin}`; } } });
  await service.saveVehicle(3, { loginEnabled: true, pin: "982345" }, actor);
  assert.equal(queries.some(q => q.sql.includes("UPDATE public.vehiculo_tokens")), true);
  assert.equal(JSON.stringify(queries.find(q => q.sql.includes("INSERT INTO public.wep_settings_audit"))).includes("982345"), false);
  queries.length = 0; await service.saveVehicle(3, { loginEnabled: false }, actor);
  assert.equal(queries.some(q => q.sql.includes("UPDATE public.vehiculo_tokens")), true);
  await assert.rejects(service.saveVehicle(3, { loginEnabled: true, pin: "abcd" }, actor), e => e.status === 400);
});

test("CONSULTA no puede leer ni escribir configuración, historial ni camiones", async () => {
  const app = express(); app.use(express.json());
  app.use(createWepAdminRouter({ auth: { async authenticate() { return { ...actor, role: "CONSULTA" }; } }, settings: new Proxy({}, { get() { assert.fail("Acceso a configuración sin rol TIC"); } }) }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  try {
    for (const [method, path] of [["GET", "/settings"], ["PUT", "/settings"], ["GET", "/settings/history"], ["GET", "/vehicles"], ["PATCH", "/vehicles/3"]]) {
      assert.equal((await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method })).status, 403);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("el emisor WEP nunca utiliza credenciales de deuda, respeta pausa y sanea errores de Meta", async () => {
  const originalEnv = settingsService.env, post = axios.post;
  settingsService.env = { WHATSAPP_TOKEN: "shared-debt-token", WABA_PHONE_NUMBER_ID: "111", WABA_VERSION: "v1.0" };
  let calls = 0;
  axios.post = async (url, body, options) => {
    calls++; assert.equal(url, "https://graph.facebook.com/v99.0/222/messages");
    assert.equal(options.headers.Authorization, "Bearer wep-only"); assert.equal(body.template.name, "reparto");
    return { data: { messages: [{ id: "message-id" }] } };
  };
  const args = { telefono: "5493451234567", templateName: "reparto", pedidoPrincipal: "123", publicId: "a".repeat(24) };
  try {
    await assert.rejects(enviarTemplateEntregaEnReparto(args), /exclusiva/); assert.equal(calls, 0);
    settingsService.env = { ...settingsService.env, WEP_WHATSAPP_TOKEN: "wep-only", WEP_WABA_PHONE_NUMBER_ID: "222", WEP_WABA_VERSION: "v99.0" };
    assert.equal((await enviarTemplateEntregaEnReparto(args)).messageId, "message-id");
    settingsService.env.WEP_WHATSAPP_PAUSED = "true";
    await assert.rejects(enviarTemplateEntregaEnReparto(args), e => e.code === "WEP_WHATSAPP_PAUSED"); assert.equal(calls, 1);
    settingsService.env.WEP_WHATSAPP_PAUSED = "false";
    axios.post = async () => { throw { response: { status: 401, data: { error: { code: 190, message: "wep-only shared-debt-token" } } }, config: { headers: { Authorization: "Bearer wep-only" } } }; };
    await assert.rejects(enviarTemplateEntregaEnReparto(args), e => !JSON.stringify(e).includes("wep-only") && e.meta.error.code === 190);
    assert.equal(typeof enviarTemplateDeudaConPdf, "function");
  } finally { settingsService.env = originalEnv; axios.post = post; }
});
