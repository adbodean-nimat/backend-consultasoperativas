import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import bcrypt from "bcryptjs";
import cron from "node-cron";
import pool from "./wep-postgres.js";
import { WepAdminError } from "./wep-admin-auth.js";
import { normalizeTestPhone, notificationRouting, assertNotificationRouting } from "./wep-notification-context.js";

const TYPES = ["programmed", "enReparto", "enCamino", "enCaminoZona"];
const templateKeys = { programmed: "PROGRAMADA", enReparto: "EN_REPARTO", enCamino: "EN_CAMINO", enCaminoZona: "EN_CAMINO_ZONA" };
export function defaultWepIntegrations(env = process.env) {
  const option = (enabled, timeout) => ({ enabled: enabled !== "false", timeoutMs: Number(timeout) > 0 ? Number(timeout) : 10000 });
  return { gestya: option(env.WEP_GESTYA_ENABLED, env.GESTYA_TIMEOUT_MS), google: option(env.WEP_GOOGLE_ENABLED, env.WEP_GEOCODING_TIMEOUT_MS), heigit: option(env.WEP_HEIGIT_ENABLED, env.WEP_ROUTING_TIMEOUT_MS) };
}
export function defaultWepSettings(env = process.env) {
  const flag = (key, fallback) => env[key] === undefined ? fallback : env[key] === "true";
  const template = type => {
    const key = templateKeys[type];
    const name = env[`WEP_WHATSAPP_TEMPLATE_${key}`] || "";
    const specificLanguage = env[`WEP_WHATSAPP_TEMPLATE_${key}_LANG`];
    const inheritedLanguage = type === "enReparto" ? env.WEP_WHATSAPP_TEMPLATE_PROGRAMADA_LANG
      : type === "enCaminoZona" ? env.WEP_WHATSAPP_TEMPLATE_EN_CAMINO_LANG : null;
    return { enabled: true, name, language: specificLanguage || inheritedLanguage || env.WEP_WHATSAPP_TEMPLATE_LANG || "es_AR" };
  };
  return {
    integrations: defaultWepIntegrations(env),
    sync: { enabled: flag("WEP_SYNC_ENABLED", false), blocked: flag("WEP_IMPORTS_BLOCKED", false), cron: env.WEP_SYNC_CRON || "*/5 * * * *",
      daysBack: Number(env.WEP_SYNC_DAYS_BACK || 0), daysAhead: Number(env.WEP_SYNC_DAYS_AHEAD || 7), vehicleCodes: (env.WEP_SYNC_VEHICLE_CODES || "101,102,103").split(",").map(v => v.trim()).filter(Boolean) },
    programmed: { enabled: flag("WEP_PROGRAMMED_ENABLED", false), dryRun: flag("WEP_PROGRAMMED_DRY_RUN", true), cron: env.WEP_PROGRAMMED_CRON || "*/5 * * * *",
      start: env.WEP_PROGRAMMED_START || "06:00", end: env.WEP_PROGRAMMED_END || "21:00", weekdays: [0, 1, 2, 3, 4, 5, 6] },
    meta: { paused: flag("WEP_WHATSAPP_PAUSED", false), testRouting: { enabled: flag("WEP_WHATSAPP_TEST_MODE", false), phone: normalizeTestPhone(env.WEP_WHATSAPP_TEST_PHONE || "") || "" }, phoneNumberId: env.WEP_WABA_PHONE_NUMBER_ID || "", apiVersion: env.WEP_WABA_VERSION || "",
      templates: Object.fromEntries(TYPES.map(type => [type, template(type)])) },
  };
}

export function validateWepSettings(input) {
  const bad = message => { throw new WepAdminError(message); };
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  if (!object(input) || !object(input.sync) || !object(input.programmed) || !object(input.meta)) bad("Configuración incompleta.");
  const { sync: s, programmed: p, meta: m } = input;
  if (!object(m.testRouting) || typeof m.testRouting.enabled !== "boolean" || typeof m.testRouting.phone !== "string" || m.testRouting.phone.length > 40) bad("Actualizá el tablero: falta la configuración del teléfono de prueba.");
  const testPhone = m.testRouting.phone.trim() ? normalizeTestPhone(m.testRouting.phone) : "";
  if (testPhone === null || (m.testRouting.enabled && !testPhone)) bad("Ingresá un teléfono de prueba internacional válido, con código de país (por ejemplo +549…).");
  if (!object(input.integrations)) bad("Faltan las integraciones. Actualizá el tablero antes de guardar.");
  const integrations = {};
  for (const key of ["gestya", "google", "heigit"]) {
    const item = input.integrations[key];
    if (!object(item) || typeof item.enabled !== "boolean" || !Number.isInteger(item.timeoutMs) || item.timeoutMs < 1000 || item.timeoutMs > 60000) bad("Las integraciones requieren habilitación y un tiempo de espera de 1000 a 60000 ms.");
    integrations[key] = { enabled: item.enabled, timeoutMs: item.timeoutMs };
  }
  for (const v of [s.enabled, s.blocked, p.enabled, p.dryRun, m.paused]) if (typeof v !== "boolean") bad("Los interruptores deben ser booleanos.");
  for (const expression of [s.cron, p.cron]) if (typeof expression !== "string" || expression.length > 100 || expression.trim().split(/\s+/).length !== 5 || !cron.validate(expression)) bad("La frecuencia debe ser un cron válido de cinco campos.");
  if (!Number.isInteger(s.daysBack) || s.daysBack < 0 || s.daysBack > 30 || !Number.isInteger(s.daysAhead) || s.daysAhead < 0 || s.daysAhead > 90) bad("Rango de importación inválido: anteriores 0–30 y futuros 0–90.");
  if (!Array.isArray(s.vehicleCodes) || s.vehicleCodes.length > 200 || s.vehicleCodes.some(v => typeof v !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(v)) || new Set(s.vehicleCodes).size !== s.vehicleCodes.length) bad("Los códigos ERP deben ser únicos, de hasta 40 letras, números o guiones.");
  if (![p.start, p.end].every(v => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) || p.start >= p.end) bad("El horario de inicio debe ser anterior al de fin (HH:mm).");
  if (!Array.isArray(p.weekdays) || !p.weekdays.length || p.weekdays.some(v => !Number.isInteger(v) || v < 0 || v > 6) || new Set(p.weekdays).size !== p.weekdays.length) bad("Seleccioná al menos un día de la semana, sin repetir.");
  if (typeof m.phoneNumberId !== "string" || !/^\d{0,30}$/.test(m.phoneNumberId) || typeof m.apiVersion !== "string" || (m.apiVersion !== "" && !/^v\d{1,3}\.\d{1,2}$/.test(m.apiVersion))) bad("Identificador del número o versión de Meta inválidos.");
  if (!object(m.templates)) bad("Faltan las plantillas de WEP.");
  const templates = {};
  for (const type of TYPES) {
    const t = m.templates[type];
    if (!object(t) || typeof t.enabled !== "boolean" || typeof t.name !== "string" || !/^[a-z0-9_]{0,100}$/.test(t.name) || typeof t.language !== "string" || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(t.language)) bad("Plantilla o idioma inválidos.");
    templates[type] = { enabled: t.enabled, name: t.name, language: t.language };
  }
  return { integrations, sync: { enabled: s.enabled, blocked: s.blocked, cron: s.cron.trim(), daysBack: s.daysBack, daysAhead: s.daysAhead, vehicleCodes: [...s.vehicleCodes] },
    programmed: { enabled: p.enabled, dryRun: p.dryRun, cron: p.cron.trim(), start: p.start, end: p.end, weekdays: [...p.weekdays].sort() },
    meta: { paused: m.paused, testRouting: { enabled: m.testRouting.enabled, phone: testPhone }, phoneNumberId: m.phoneNumberId, apiVersion: m.apiVersion, templates } };
}

export class WepSettingsService {
  constructor({ postgresPool = pool, env = process.env, passwordHasher = bcrypt } = {}) { Object.assign(this, { pool: postgresPool, env, passwordHasher }); }
  enabled() { return this.env.WEP_SETTINGS_ENABLED === "true"; }
  requireEnabled() { if (!this.enabled()) throw new WepAdminError("TIC debe aplicar wep-settings.sql y habilitar WEP_SETTINGS_ENABLED en el servidor.", 503); }
  encryptionKey() {
    const raw = this.env.WEP_SETTINGS_ENCRYPTION_KEY || "";
    if (!/^[A-Za-z0-9+/]{43}=$/.test(raw) || Buffer.from(raw, "base64").length !== 32) throw new WepAdminError("Falta configurar una clave de cifrado de 32 bytes para WEP en el servidor.", 503);
    return Buffer.from(raw, "base64");
  }
  encrypt(token) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map(v => v.toString("base64")).join(".");
  }
  decrypt(value) {
    try {
      const [iv, tag, data] = value.split(".").map(v => Buffer.from(v, "base64"));
      const cipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), iv); cipher.setAuthTag(tag);
      return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
    } catch { throw new WepAdminError("No se pudo recuperar el token exclusivo de WEP. TIC debe revisar la clave de cifrado.", 503); }
  }
  async runtime() {
    if (!this.enabled()) return { config: defaultWepSettings(this.env), revision: 0, encrypted_token: null };
    const result = await this.pool.query("SELECT config, revision, encrypted_token, updated_at FROM public.wep_settings WHERE id = 1");
    const row = result.rows[0];
    return row ? { ...row, config: validateWepSettings({ ...row.config, meta: { ...row.config.meta, testRouting: row.config.meta?.testRouting ?? defaultWepSettings(this.env).meta.testRouting }, integrations: row.config.integrations ?? defaultWepIntegrations(this.env) }) } : { config: validateWepSettings(defaultWepSettings(this.env)), revision: 0, encrypted_token: null };
  }
  async read() {
    this.requireEnabled();
    const runtime = await this.runtime();
    const applied = await this.pool.query("SELECT instance, revision, executor, next_sync_at, next_programmed_at, applied_at FROM public.wep_settings_applied ORDER BY instance");
    return { config: runtime.config, revision: runtime.revision, updatedAt: runtime.updated_at || null,
      tokenConfigured: Boolean(runtime.encrypted_token || this.env.WEP_WHATSAPP_TOKEN), integrationStatus: this.integrationStatus(), applied: applied.rows };
  }
  integrationStatus() {
    const has = key => Boolean(String(this.env[key] || "").trim());
    return { gestya: { configured: ["GESTYA_URL", "GESTYA_USER", "GESTYA_PASSWORD"].every(has) },
      google: { configured: has("WEP_GOOGLE_GEOCODING_API_KEY") && [undefined, "", "google"].includes(this.env.WEP_GEOCODING_PROVIDER?.trim().toLowerCase()) },
      heigit: { configured: has("WEP_ROUTING_API_KEY") && this.env.WEP_ROUTING_PROVIDER?.trim().toLowerCase() === "openrouteservice" } };
  }
  async integration(key) {
    const { config } = await this.runtime();
    const option = config.integrations[key];
    if (!option?.enabled) throw new WepAdminError("La integración está pausada en la configuración de WEP.", 409);
    return option;
  }
  async token(runtime) { return runtime.encrypted_token ? this.decrypt(runtime.encrypted_token) : this.env.WEP_WHATSAPP_TOKEN || ""; }
  environmentTemplate(type) {
    if (type === "legacy") return { enabled: true, name: this.env.WEP_WHATSAPP_TEMPLATE_NAME || "", language: this.env.WEP_WHATSAPP_TEMPLATE_LANG || "es_AR" };
    if (type === "programmedTest") return { enabled: true, name: this.env.WEP_WHATSAPP_TEMPLATE_PROGRAMADA_TEST || this.env.WEP_WHATSAPP_TEMPLATE_PROGRAMADA || "",
      language: this.env.WEP_WHATSAPP_TEMPLATE_PROGRAMADA_TEST_LANG || this.env.WEP_WHATSAPP_TEMPLATE_PROGRAMADA_LANG || "es_AR" };
    return null;
  }
  async whatsapp(type, fallback = {}) {
    const runtime = await this.runtime(), meta = runtime.config.meta;
    const environmentOnly = this.environmentTemplate(type);
    const selected = environmentOnly || meta.templates[type];
    const routing = notificationRouting(meta);
    assertNotificationRouting(routing);
    if (meta.paused || !selected?.enabled) {
      const error = new Error("Los envíos de este tipo están pausados en WEP."); error.code = "WEP_WHATSAPP_PAUSED"; throw error;
    }
    const templateName = (environmentOnly || this.enabled()) ? selected.name : fallback.templateName || selected.name;
    const templateLanguage = (environmentOnly || this.enabled()) ? selected.language : fallback.templateLanguage || selected.language;
    const token = await this.token(runtime);
    if (!token || !meta.phoneNumberId || !meta.apiVersion || !templateName) {
      const error = new Error("Falta completar la configuración exclusiva de Meta para WEP."); error.code = "WEP_META_NOT_CONFIGURED"; throw error;
    }
    return { templateName, templateLanguage, token, phoneNumberId: meta.phoneNumberId, apiVersion: meta.apiVersion, testPhone: routing.enabled ? routing.phone : null };
  }
  async transaction(callback) {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const value = await callback(client); await client.query("COMMIT"); return value; }
    catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async audit(client, actor, action, target, previous, current) {
    await client.query(`INSERT INTO public.wep_settings_audit (actor_id, actor_name, action, target, previous, current)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`, [actor.id, actor.displayName, action, target, JSON.stringify(previous), JSON.stringify(current)]);
  }
  async save(input, actor) {
    this.requireEnabled();
    const config = validateWepSettings(input?.config);
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new WepAdminError("Versión de configuración inválida.");
    if (input.token !== undefined && (typeof input.token !== "string" || input.token.length > 4096 || /\s/.test(input.token))) throw new WepAdminError("Token de Meta inválido.");
    const encrypted = input.token ? this.encrypt(input.token) : null;
    await this.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(73021, 4)");
      const previous = (await client.query("SELECT * FROM public.wep_settings WHERE id = 1 FOR UPDATE")).rows[0];
      if ((previous?.revision || 0) !== input.revision) throw new WepAdminError("Otra persona modificó la configuración. Actualizá antes de guardar.", 409);
      if (config.programmed.enabled && !config.programmed.dryRun && !config.sync.blocked && !config.meta.paused && config.meta.templates.programmed.enabled
        && (!(encrypted || previous?.encrypted_token || this.env.WEP_WHATSAPP_TOKEN) || !config.meta.phoneNumberId || !config.meta.apiVersion || !config.meta.templates.programmed.name)) {
        throw new WepAdminError("Completá Meta y la plantilla programada antes de habilitar avisos en modo real.");
      }
      await client.query(`INSERT INTO public.wep_settings (id, revision, config, encrypted_token, updated_by)
        VALUES (1,$1,$2::jsonb,$3,$4) ON CONFLICT (id) DO UPDATE SET revision = EXCLUDED.revision,
        config = EXCLUDED.config, encrypted_token = EXCLUDED.encrypted_token, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [input.revision + 1, JSON.stringify(config), encrypted || previous?.encrypted_token || null, actor.id]);
      await this.audit(client, actor, "CONFIGURATION", "WEP", previous?.config || defaultWepSettings(this.env), { ...config, tokenReplaced: Boolean(encrypted) });
    });
    return this.read();
  }
  async history() {
    this.requireEnabled();
    return (await this.pool.query("SELECT id, actor_name, action, target, previous, current, created_at FROM public.wep_settings_audit ORDER BY id DESC LIMIT 50")).rows;
  }
  async vehicles() {
    this.requireEnabled();
    return (await this.pool.query(`SELECT v.id, v.codigo_erp, v.nombre, v.patente, v.activo, v.es_externo, v.wep_login_activo,
      (v.wep_pin_hash IS NOT NULL) AS pin_configured, MAX(e.sincronizado_desde_erp_at) AS last_imported_at
      FROM public.vehiculos v LEFT JOIN public.entregas e ON e.vehiculo_id = v.id
      GROUP BY v.id ORDER BY v.nombre, v.id`)).rows;
  }
  async saveVehicle(id, input, actor) {
    this.requireEnabled();
    if (!Number.isSafeInteger(id) || id < 1 || typeof input?.loginEnabled !== "boolean" || (input.pin !== undefined && (typeof input.pin !== "string" || !/^\d{4,8}$/.test(input.pin)))) throw new WepAdminError("Indicá el acceso y, si lo cambiás, un PIN de 4 a 8 dígitos.");
    const hash = input.pin ? await this.passwordHasher.hash(input.pin, 12) : null;
    await this.transaction(async client => {
      const vehicle = (await client.query("SELECT id, wep_login_activo, wep_pin_hash, activo, es_externo FROM public.vehiculos WHERE id = $1 FOR UPDATE", [id])).rows[0];
      if (!vehicle) throw new WepAdminError("Camión no encontrado.", 404);
      if (input.loginEnabled && (!vehicle.activo || vehicle.es_externo || !(hash || vehicle.wep_pin_hash))) throw new WepAdminError("El acceso requiere un camión activo, interno y con PIN.");
      await client.query("UPDATE public.vehiculos SET wep_login_activo = $2, wep_pin_hash = COALESCE($3, wep_pin_hash) WHERE id = $1", [id, input.loginEnabled, hash]);
      if (hash || !input.loginEnabled) await client.query("UPDATE public.vehiculo_tokens SET activo = FALSE WHERE vehiculo_id = $1 AND activo = TRUE", [id]);
      await this.audit(client, actor, "VEHICLE_ACCESS", String(id), { loginEnabled: vehicle.wep_login_activo }, { loginEnabled: input.loginEnabled, pinReplaced: Boolean(hash) });
    });
    return { ok: true };
  }
}
export default new WepSettingsService();
