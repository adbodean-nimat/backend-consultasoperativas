import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { once } from "node:events";
import { createWepAdminRouter } from "./wep-admin.routes.js";
import { WepAdminAuth, validateAdminUser, publicAdminUser, WepAdminError } from "./wep-admin-auth.js";
import { validateDashboardQuery, WepAdminDashboardRepository } from "./wep-admin-dashboard.repository.js";
import { WepMonitorRepository } from "./wep-monitor.repository.js";
import { WepProgrammedScheduler } from "./wep-programmed-scheduler.js";

const secret = "test-wep-admin-secret-independent-123456789";
const row = { id: 7, username: "ramiro", display_name: "Ramiro", role: "CONSULTA", active: true, session_version: 2, password_hash: "never-expose-this" };

test("valida fecha real, filtros y datos de usuario sin truncar contraseñas bcrypt", () => {
  for (const fecha of ["2026-02-30", "2026-99-12", ["2026-10-29"], "bad"]) assert.throws(() => validateDashboardQuery({ fecha }));
  for (const input of [{ page: "-1" }, { page: "1 OR 1=1" }, { estado: "bad" }, { q: ["bad"] }]) assert.throws(() => validateDashboardQuery(input));
  assert.equal(validateDashboardQuery({ fecha: "2026-10-29" }).page, 1);
  assert.throws(() => validateAdminUser({ username: "abc", displayName: "A", role: "TIC", password: "é".repeat(37) }));
  assert.throws(() => validateAdminUser({ username: "abc", displayName: "A", role: "ADMIN", password: "secure-password" }));
  assert.equal(publicAdminUser(row).password_hash, undefined);
});

test("login emite sesión acotada y verifica revocación/rol en base en cada solicitud", async () => {
  let current = { ...row };
  const auth = new WepAdminAuth({ env: { WEP_ADMIN_JWT_SECRET: secret },
    postgresPool: { async query(sql) { return { rows: sql.startsWith("SELECT") ? [current] : [] }; } },
    passwordHasher: { async compare(value, hash) { return value === "correct-password" && hash === row.password_hash; } },
  });
  await assert.rejects(auth.login("ramiro", "wrong-password"), { status: 401 });
  const session = await auth.login("RAMIRO", "correct-password");
  const decoded = jwt.decode(session.token);
  assert.equal(decoded.aud, "wep-admin"); assert.equal(decoded.exp - decoded.iat, 8 * 3600);
  assert.equal(decoded.password_hash, undefined);
  current.role = "TIC";
  assert.equal((await auth.authenticate(`Bearer ${session.token}`)).role, "TIC");
  current.session_version++;
  await assert.rejects(auth.authenticate(`Bearer ${session.token}`), { status: 401 });
  current.session_version--; current.active = false;
  await assert.rejects(auth.authenticate(`Bearer ${session.token}`), { status: 401 });
  const legacyToken = jwt.sign({ username: "ramiro" }, secret);
  await assert.rejects(auth.authenticate(`Bearer ${legacyToken}`), { status: 401 });
  await assert.rejects(auth.authenticate("opaque-driver-token"), { status: 401 });
});

test("no configura secreto compartido con la API histórica ni secreto vacío", () => {
  for (const env of [{}, { WEP_ADMIN_JWT_SECRET: "short" }, { WEP_ADMIN_JWT_SECRET: secret, JWT_SECRET: secret }]) assert.throws(() => new WepAdminAuth({ env }).secret(), { status: 503 });
});

test("protege el último TIC activo y serializa cambios de acceso", async () => {
  const queries = [];
  const client = { async query(sql) { queries.push(sql); return { rows: sql.includes("FOR UPDATE") ? [{ id: 7, role: "TIC", active: true }] : [] }; }, release() {} };
  const auth = new WepAdminAuth({ postgresPool: { async connect() { return client; } } });
  await assert.rejects(auth.saveUser({ displayName: "TIC", role: "CONSULTA", active: true }, 7), { status: 409 });
  assert.ok(queries.some(sql => sql.includes("pg_advisory_xact_lock")));
  assert.ok(queries.includes("ROLLBACK"));
});

test("CONSULTA puede leer operación pero no diagnóstico ni administración de usuarios", async t => {
  const profile = publicAdminUser(row);
  const auth = {
    async authenticate(header) { if (header === "Bearer reader") return profile; if (header === "Bearer tic") return { ...profile, role: "TIC" }; throw new WepAdminError("Ingresá", 401); },
    async login() { throw new WepAdminError("Incorrecto", 401); },
    async listUsers() { return []; }, async saveUser() { return profile; },
  };
  const repository = { async dashboard() { return { deliveries: [] }; }, async technical() { return { runs: [] }; } };
  const app = express(); app.use(express.json()); app.use("/control", createWepAdminRouter({ auth, repository }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/control`;
  const call = (path, token = "reader", method = "GET") => fetch(`${url}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(method !== "GET" ? { body: "{}" } : {}) });
  assert.equal((await call("/dashboard")).status, 200);
  for (const [path, method] of [["/technical", "GET"], ["/users", "GET"], ["/users", "POST"], ["/users/7", "PATCH"]]) assert.equal((await call(path, "reader", method)).status, 403);
  assert.equal((await call("/technical", "tic")).status, 200);
  assert.equal((await call("/users", "tic")).status, 200);
  assert.equal((await call("/users", "tic", "POST")).status, 201);
  const unauthorized = await call("/dashboard", "bad");
  assert.equal(unauthorized.status, 401); assert.equal(unauthorized.headers.get("Cache-Control"), "no-store");
});

test("filtros SQL parametrizados, paginación acotada y diagnóstico sin secretos", async () => {
  const queries = [];
  const repository = new WepAdminDashboardRepository({ env: { WHATSAPP_TOKEN: "TOP-SECRET" }, postgresPool: { async query(sql, params) {
    queries.push({ sql, params }); return { rows: sql.includes("COUNT(*)::int AS total") ? [{ total: 0 }] : [] };
  } } });
  await repository.dashboard({ fecha: "2026-10-29", vehiculo: 2, estado: "", q: "' OR 1=1 --", page: 2 });
  assert.equal(queries.length, 3);
  assert.ok(queries.every(q => !q.sql.includes("' OR 1=1 --")));
  assert.equal(queries[1].params[4], 50);
  const technical = await repository.technical("2026-10-29");
  assert.ok(!JSON.stringify(technical).includes("TOP-SECRET"));
  assert.equal(technical.whatsappVerification, "NO_VERIFICADO");
});

test("monitor compartido persiste inicio/fin e impide que fallos de observabilidad detengan tareas", async () => {
  const calls = [];
  const monitor = new WepMonitorRepository({ env: { WEP_MONITOR_ENABLED: "true", NODE_APP_INSTANCE: "0" }, logger: { error() {} }, postgresPool: { async query(sql, params) { calls.push({ sql, params }); return { rows: [{ id: 9 }] }; } } });
  const id = await monitor.start("PROGRAMADA"); await monitor.finish(id, "OK", { enviadas: 2 });
  assert.equal(calls[0].params[1], "0"); assert.equal(calls[1].params[0], 9);
  monitor.pool.query = async () => { throw new Error("database offline"); };
  assert.equal(await monitor.start("SYNC"), null);
  await monitor.finish(9, "ERROR");
});

test("el scheduler guarda simulación o errores de avisos para que otra instancia pueda consultarlos", async () => {
  for (const errores of [0, 2]) {
    const recorded = [];
    const scheduler = new WepProgrammedScheduler({
      env: { WEP_PROGRAMMED_ENABLED: "true", WEP_PROGRAMMED_DRY_RUN: "true" },
      now: () => new Date("2026-10-29T12:00:00Z"), logger: { info() {}, error() {} },
      scheduler: { createTask() { return { start() {} }; } },
      monitor: { async start(job) { recorded.push(job); return 12; }, async finish(...args) { recorded.push(args); } },
      syncService: { async synchronize() { return { ok: true }; } },
      notificationsService: { async processProgrammedDeliveryNotifications() { return { resumen: { errores } }; } },
    });
    scheduler.start(); await scheduler.execute();
    assert.deepEqual(recorded, ["PROGRAMADA", [12, errores ? "ERROR" : "SIMULACION", { errores }]]);
  }
});
