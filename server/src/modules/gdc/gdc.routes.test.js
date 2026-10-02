import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { requirePermission } from "../../../auth.middleware.js";
import { createGdcRouter } from "./gdc.routes.js";
import { createGdcController } from "./gdc.controller.js";
import { GdcError } from "./gdc.errors.js";
import { validateRecord } from "./gdc.validator.js";

let server, baseUrl, previousSecret;
const calls = [], logs = [];
const rows = new Map();
const token = (name = "admin") => jwt.sign({ username: name }, "gdc-test-only", { expiresIn: "1h" });
const bodyFamily = () => ({ clasificador_5: "0027", nombre: "Cincalum", codigo_ref_hl: null, codigo_ref_1050: "91201050", codigo_ref_13m: "91201300", orden: 1 });
const repository = {
  async list(definition) { calls.push({ operation: "list", definition }); return [...rows.values()]; },
  async create(definition, key, changes, actor) {
    validateRecord(definition, { [definition.key]: key, ...changes });
    if (rows.has(key)) throw Object.assign(new Error("SQL-sensitive"), { code: "23505" });
    const row = { [definition.key]: key, ...changes, created_by: actor, updated_by: actor }; rows.set(key, row); calls.push({ operation: "create", actor }); return row;
  },
  async update(definition, key, changes, actor) {
    if (!rows.has(key)) throw new GdcError("Registro inexistente", { status: 404, code: "GDC_ROW_NOT_FOUND" });
    const row = { ...rows.get(key), ...changes };
    validateRecord(definition, Object.fromEntries([definition.key, ...definition.fields].map((field) => [field, row[field]])));
    rows.set(key, row); calls.push({ operation: "update", key, changes, actor });
    return { ...row, updated_by: actor };
  },
};
let failingService = false;
const service = { async get(query) { if (failingService) throw new Error("password=secret SELECT sensitive"); calls.push({ operation: "get", query }); return { parameters: { months: 12 }, periods: [], families: [], warnings: [] }; } };
const lookup = async (_pool, name) => ({ id: 1, sam_account_name: name, activo: name !== "disabled", roles: [], permissions: name === "admin" ? ["gdc.consultar", "gdc.configurar"] : name === "reader" ? ["gdc.consultar"] : [] });
test.before(async () => {
  previousSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = "gdc-test-only";
  const app = express(); app.use(express.json());
  app.use("/api/gdc", createGdcRouter({ controller: createGdcController(service, repository), permission: (p) => requirePermission(p, { lookup }), logger: { error: (...args) => logs.push(args) } }));
  server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve)); baseUrl = `http://127.0.0.1:${server.address().port}/api/gdc/revestidos-laf`;
});
test.after(async () => { await new Promise((resolve) => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
const send = (path = "", { name = "admin", method = "GET", body, authorization = `Bearer ${token(name)}` } = {}) => fetch(`${baseUrl}${path}`, { method, headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
test("HTTP sin token o token inválido rechaza antes de consultar motores", async () => {
  const before = calls.length;
  for (const authorization of [null, "Bearer invalid"]) assert.equal((await send("", { authorization })).status, 401);
  assert.equal(calls.length, before);
});
test("HTTP JWT y permisos actuales habilitan lectura; usuario desactivado se rechaza", async () => {
  const response = await send("?months=12&rotationDays=120", { name: "reader" }); assert.equal(response.status, 200); assert.equal((await response.json()).parameters.months, 12);
  assert.equal((await send("", { name: "disabled" })).status, 403); assert.equal((await send("", { name: "without-access" })).status, 403);
});
test("HTTP configuración requiere permiso administrativo incluso para listar", async () => {
  assert.equal((await send("/configuracion/familias", { name: "reader" })).status, 403);
  const response = await send("/configuracion/familias"); assert.equal(response.status, 200); assert.equal((await response.json()).ok, true);
});
test("HTTP crea familia con ceros y auditoría del usuario autenticado", async () => {
  const response = await send("/configuracion/familias", { method: "POST", body: bodyFamily() }); assert.equal(response.status, 201);
  const { row } = await response.json(); assert.equal(row.clasificador_5, "0027"); assert.equal(row.codigo_ref_13m, "91201300"); assert.equal(row.updated_by, "admin");
});
test("HTTP conflicto de código no filtra SQL", async () => {
  const response = await send("/configuracion/familias", { method: "POST", body: bodyFamily() }); assert.equal(response.status, 409); assert.equal((await response.json()).code, "GDC_DUPLICATE_CODE");
});
test("HTTP rechaza auditoría manipulada, referencias numéricas y pareja incompleta", async () => {
  for (const body of [{ ...bodyFamily(), created_at: "2020" }, { ...bodyFamily(), updated_by: "otro" }, { ...bodyFamily(), codigo_ref_13m: 91201300 }, { ...bodyFamily(), codigo_ref_1050: null }]) {
    const response = await send("/configuracion/familias", { method: "POST", body }); assert.equal(response.status, 400); assert.equal((await response.json()).code, "VALIDATION_ERROR");
  }
});
test("HTTP PUT/PATCH permite cambios parciales y protege pareja de referencias", async () => {
  const response = await send("/configuracion/familias/0027", { method: "PATCH", body: { nombre: "Nueva familia" } }); assert.equal(response.status, 200); assert.equal((await response.json()).row.codigo_ref_13m, "91201300");
  assert.equal((await send("/configuracion/familias/0027", { method: "PUT", body: { codigo_ref_1050: null } })).status, 400);
  assert.equal((await send("/configuracion/familias/0027", { method: "PUT", body: { clasificador_5: "0028", nombre: "Otra" } })).status, 400);
});
test("HTTP DELETE desactiva y conserva fila; inexistente devuelve 404", async () => {
  const response = await send("/configuracion/familias/0027", { method: "DELETE" }); assert.equal(response.status, 200); assert.equal((await response.json()).row.activo, false); assert.equal(rows.has("0027"), true);
  assert.deepEqual(calls.at(-1).changes, { activo: false }); assert.equal((await send("/configuracion/familias/9999", { method: "DELETE" })).status, 404);
});
test("HTTP seis recursos administrativos y general singleton", async () => {
  for (const path of ["familias", "tipos-articulo-chapa", "depositos-excluidos", "comprobantes-consumo-ventas", "tipos-np", "general"]) assert.equal((await send(`/configuracion/${path}`)).status, 200);
  rows.set(1, { id: 1, meses_consumo_default: 12, dias_rotacion_default: 120, deposito_principal: 973, proveedor_oc: null, clasificador_8_excluido_stock: "0145" });
  const response = await send("/configuracion/general", { method: "PUT", body: { proveedor_oc: 1335 } }); assert.equal(response.status, 200); assert.equal((await response.json()).row.proveedor_oc, 1335);
  assert.equal((await send("/configuracion/general", { method: "POST", body: {} })).status, 405);
  assert.equal((await send("/configuracion/general/1", { method: "DELETE" })).status, 405);
  assert.equal((await send("/configuracion/general/2", { method: "PUT", body: { proveedor_oc: 1335 } })).status, 400);
  assert.equal((await send("/configuracion/__proto__")).status, 404);
});
test("HTTP error imprevisto se oculta en respuesta y logs", async () => {
  failingService = true;
  const response = await send(); assert.equal(response.status, 500);
  const body = await response.json(); assert.equal(body.code, "GDC_INTERNAL_ERROR"); assert.ok(!JSON.stringify(body).includes("secret")); assert.ok(!JSON.stringify(logs).includes("secret"));
  failingService = false;
});
