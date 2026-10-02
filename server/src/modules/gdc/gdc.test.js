import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GdcError, GdcValidationError } from "./gdc.errors.js";
import { GdcService } from "./gdc.service.js";
import { GdcConfigRepository } from "./gdc-config.repository.js";
import { GdcSqlServerRepository, buildErpConfig } from "./gdc-sqlserver.repository.js";
import { calculationParameters, RESOURCES, validateKey, validateChanges, validateRecord } from "./gdc.validator.js";
import { consumptionQuery, stockQuery, salesOrderQuery, purchaseOrderQuery, dataQuery } from "./gdc-sqlserver.queries.js";
import { familyData } from "./gdc-data.service.js";
import { familyStock } from "./gdc-stock.service.js";
import { familyPurchaseOrders } from "./gdc-purchase-order.service.js";

const clock = () => new Date("2026-10-02T12:00:00Z");
const longFamily = () => ({ clasificador_5: "0027", nombre: "Cincalum", codigo_ref_hl: null, codigo_ref_1050: "91201050", codigo_ref_13m: "91201300", notas: "Compra", orden: 1, activo: true });
const hlFamily = () => ({ clasificador_5: "0030", nombre: "HL", codigo_ref_hl: "01400075", codigo_ref_1050: null, codigo_ref_13m: null, notas: null, orden: 2, activo: true });
const config = () => ({ familias: [longFamily(), hlFamily()], general: { id: 1, meses_consumo_default: 12, dias_rotacion_default: 120, deposito_principal: 973, proveedor_oc: null, clasificador_8_excluido_stock: "0145" }, "tipos-articulo-chapa": [{ codigo: "011", nombre: "Chapa", activo: true }], "depositos-excluidos": [{ codigo_deposito: 206, nombre: "Salida", activo: true }], "comprobantes-consumo-ventas": [{ codigo_comprobante: "RVP", nombre: "Remito", activo: true }, { codigo_comprobante: "DVC", nombre: "Devolución", activo: true }], "tipos-np": [{ codigo_tipo_np: "NPT", nombre: "NP", activo: true }] });
const params = () => calculationParameters({}, config().general, clock()).parameters;
const erpConnection = () => ({ server: "mock", database: "erp", user: "reader", password: "secret", port: 1433, requestTimeout: 300000, options: { trustServerCertificate: true, encrypt: false } });
function harness(overrides = {}, settings = config()) {
  const calls = [], logs = [];
  const erp = Object.fromEntries(["production", "salesRemittances", "salesOrders", "stock", "purchaseOrders", "data"].map((name) => [name, async (...args) => { calls.push({ name, args }); return overrides[name] ?? []; }]));
  const service = new GdcService({ config: { async load() { calls.push({ name: "config" }); return settings; } }, erp, clock, logger: { error: (...args) => logs.push(args) } });
  return { service, erp, calls, logs };
}
test("defaults provienen de PostgreSQL, no del servicio", async () => {
  const c = config(); c.general.meses_consumo_default = 2; c.general.dias_rotacion_default = 45;
  const h = harness({}, c); const result = await h.service.get();
  assert.equal(result.parameters.months, 2); assert.equal(result.parameters.rotationDays, 45);
  assert.equal(result.periods.length, 3); assert.equal(h.calls[0].name, "config");
});
test("12 meses anteriores más mes actual, cronológicos y límite exclusivo", () => {
  const { periods, parameters } = calculationParameters({}, config().general, clock());
  assert.equal(periods.length, 13); assert.equal(periods[0], "2025-10"); assert.equal(periods.at(-1), "2026-10");
  assert.equal(parameters.dateFrom, "2025-10-01"); assert.equal(parameters.dateToExclusive, "2026-11-01");
  assert.deepEqual([...periods].sort(), periods);
});
test("cruce de año, año bisiesto y fecha local Argentina", () => {
  const p = calculationParameters({ months: "2", rotationDays: "2" }, config().general, new Date("2024-03-01T02:59:00Z"));
  assert.deepEqual(p.periods, ["2023-12", "2024-01", "2024-02"]);
  assert.equal(p.parameters.dateToExclusive, "2024-03-01"); assert.equal(p.parameters.rotationDateToExclusive, "2024-02-29"); assert.equal(p.parameters.rotationDateFrom, "2024-02-27");
});
test("rotación tiene 120 días reales y termina ayer", () => {
  const p = params();
  assert.equal(p.rotationDateToExclusive, "2026-10-02");
  assert.equal((Date.parse(p.rotationDateToExclusive) - Date.parse(p.rotationDateFrom)) / 86400000, 120);
});
for (const query of [{ months: 0 }, { months: 61 }, { months: ["12", "13"] }, { rotationDays: -1 }, { rotationDays: 3661 }, { months: "1.2" }, { months: "" }, { rotationDays: true }, { extra: 1 }]) {
  test(`rechaza parámetros inválidos ${JSON.stringify(query)}`, () => assert.throws(() => calculationParameters(query, config().general), { code: "VALIDATION_ERROR" }));
}
test("conserva familias sin movimientos y referencias HL/10,50/13", async () => {
  const result = await harness().service.get();
  assert.equal(result.families.length, 2);
  const [long, hl] = result.families;
  assert.equal(long.classifier5, "0027"); assert.equal(hl.data.referenceCodeKg, "01400075");
  assert.equal(long.stock.units1050.referenceCode, "91201050"); assert.equal(long.stock.units13m.referenceCode, "91201300");
  assert.equal(hl.stock.unitsHl.referenceCode, "01400075");
  assert.equal(long.consumption.length, 13); assert.ok(long.consumption.every((v) => v.totalConsumptionTon === 0));
  assert.equal(long.pendingSalesOrderTon, 0); assert.equal(long.purchaseOrders.pendingTon, 0);
  assert.equal(long.stock.ton.days, null); assert.equal(long.stock.ton.daysStatus, "NO_CONSUMPTION");
});
test("consolida por familia/mes y calcula días con ambos canales y ventana exacta", async () => {
  const h = harness({
    production: [{ classifier5: "0030", scope: "monthly", period: "2026-09", ton: 4, invalidFactors: 0 }, { classifier5: "0030", scope: "rotation", period: null, ton: 120, invalidFactors: 0 }],
    salesRemittances: [{ classifier5: "0030", scope: "monthly", period: "2026-09", ton: -1, invalidFactors: 0 }, { classifier5: "0030", scope: "rotation", period: null, ton: 120, invalidFactors: 0 }],
    stock: [{ classifier5: "0030", code: "01400075", mainTon: 6, otherTon: 4, totalTon: 10, mainUnits: 60, otherUnits: 40, totalUnits: 100, invalidFactors: 0 }],
    salesOrders: [{ classifier5: "0030", ton: 2, invalidFactors: 0 }],
    purchaseOrders: [{ classifier5: "0030", code: "01400075", ton: 3, units: 30, invalidFactors: 0 }],
    data: [{ classifier5: "0030", matches: 2, distinctFactors: 1, factor: 10, invalidFactors: 0, classifier4Count: 1, classifier4: "0004", classifier4Name: "Galvanizado" }],
  });
  const result = await h.service.get(); const family = result.families[1];
  assert.deepEqual(family.consumption.find((v) => v.period === "2026-09"), { period: "2026-09", productionTon: 4, salesRemittancesTon: -1, totalConsumptionTon: 3 });
  assert.equal(family.stock.ton.days, 5); assert.equal(family.stock.ton.daysStatus, "OK"); assert.equal(family.stock.unitsHl.total, 100);
  assert.equal(family.pendingSalesOrderTon, 2); assert.equal(family.purchaseOrders.unitsHl, 30); assert.equal(family.data.kgPerMeterOrHl, 100); assert.equal(family.classifier4, "0004");
  assert.equal(h.calls.length, 7); assert.equal(new Set(h.calls.map((c) => c.name)).size, 7);
});
test("rotación más larga que meses mostrados conserva todo el rango", () => {
  const p = calculationParameters({ months: 1, rotationDays: 730 }, config().general, clock()).parameters;
  const q = consumptionQuery(config(), p, true);
  assert.ok(q.inputs.some((v) => v.value === p.rotationDateFrom)); assert.ok(p.rotationDateFrom < p.dateFrom);
});
test("factor inválido de consumo propaga null mensual y días", async () => {
  const result = await harness({ production: [{ classifier5: "0030", scope: "monthly", period: "2026-10", ton: null, invalidFactors: 1 }, { classifier5: "0030", scope: "rotation", period: null, ton: null, invalidFactors: 1 }] }).service.get();
  const f = result.families[1]; assert.equal(f.consumption.at(-1).totalConsumptionTon, null); assert.equal(f.stock.ton.daysStatus, "INVALID_CONSUMPTION_FACTOR"); assert.equal(f.warnings.length, 3);
});
test("stock inválido afecta toneladas y conserva unidades de referencia", () => {
  const s = familyStock(longFamily(), [{ code: "91201300", mainTon: null, otherTon: 0, totalTon: null, mainUnits: 5, otherUnits: 0, totalUnits: 5, invalidFactors: 1 }], 10, 120);
  assert.equal(s.stock.ton.total, null); assert.equal(s.stock.ton.mainWarehouse, null); assert.equal(s.stock.ton.otherWarehouses, 0); assert.equal(s.stock.units13m.total, 5); assert.equal(s.stock.ton.daysStatus, "INVALID_STOCK_FACTOR"); assert.equal(s.warnings[0].count, 1);
});
test("OC suma referencias distintas y propaga factor inválido", () => {
  const o = familyPurchaseOrders(longFamily(), [{ code: "91201300", ton: 2, units: 5, invalidFactors: 0 }, { code: "91201050", ton: null, units: 8, invalidFactors: 1 }]);
  assert.deepEqual(o.purchaseOrders, { pendingTon: null, units13m: 5, units1050: 8, unitsHl: 0 });
});
test("sin consumo o consumo neto negativo produce NO_CONSUMPTION", () => {
  for (const consumption of [0, -1]) assert.equal(familyStock(longFamily(), [], consumption, 120).stock.ton.daysStatus, "NO_CONSUMPTION");
});
for (const [status, row] of [["CODE_NOT_FOUND", undefined], ["INVALID_FACTOR", { matches: 1, distinctFactors: 0, factor: null, invalidFactors: 1 }], ["INVALID_FACTOR", { matches: 1, distinctFactors: 1, factor: 0, invalidFactors: 1 }], ["MULTIPLE_FACTORS", { matches: 2, distinctFactors: 2, factor: 10, invalidFactors: 0 }], ["OK", { matches: 2, distinctFactors: 1, factor: 19.538462440237, invalidFactors: 0 }]]) {
  test(`datos de referencia: ${status}, factor ${row?.factor}`, () => {
    const result = familyData(longFamily(), row); assert.equal(result.data.status, status); assert.equal(result.data.notes, "Compra");
    if (status !== "OK") assert.equal(result.data.factorHomogeneousStock, null); else assert.equal(result.data.kgPerMeterOrHl, 1000 / row.factor);
  });
}
test("clasificador 4 ambiguo se informa sin elegir arbitrariamente", () => {
  const d = familyData(longFamily(), { matches: 1, distinctFactors: 1, factor: 10, invalidFactors: 0, classifier4Count: 2, classifier4: "0003" });
  assert.equal(d.classifier4, null); assert.equal(d.warnings[0].code, "MULTIPLE_CLASSIFIER4");
});
test("SQL parametriza todos los códigos y preserva ceros", () => {
  const c = config(); c.familias[1].codigo_ref_hl = "x'); DELETE test;--";
  for (const q of [consumptionQuery(c, params(), true), consumptionQuery(c, params(), false), stockQuery(c), salesOrderQuery(c), purchaseOrderQuery(c), dataQuery(c)]) {
    assert.ok(q.text.startsWith("WITH ")); assert.doesNotMatch(q.text, /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|EXEC|INTO|SET)\b/i);
    assert.ok(!q.text.includes(c.familias[1].codigo_ref_hl)); assert.ok(q.inputs.some((v) => v.value === "0027"));
    assert.ok(q.inputs.some((v) => v.value === c.familias[1].codigo_ref_hl)); assert.ok(q.inputs.length < 2100);
  }
});
test("producción solo HL, límites exclusivos y TCSP mediante EXISTS", () => {
  const q = consumptionQuery(config(), params(), true);
  assert.match(q.text, /f\.hl = a\.ARTS_ARTICULO_EMP/); assert.match(q.text, /EXISTS \(SELECT 1 FROM dbo\.PROD_TCSP/);
  assert.match(q.text, /c\.MSVA_FECHA_EMI < @p/); assert.match(q.text, /GROUP BY m\.classifier5, r\.scope/);
  assert.doesNotMatch(q.text, /GETDATE|BETWEEN|DECLARE/);
});
test("remitos usa fecha MOST y signo S positivo, devoluciones negativo sin multiplicar MSMV", () => {
  const q = consumptionQuery(config(), params(), false);
  assert.match(q.text, /CASE WHEN d\.MOSD_SIGNO = 'S' THEN 1 ELSE -1 END/); assert.match(q.text, /s\.MOST_FECHA_EMI < @p/);
  assert.match(q.text, /EXISTS \(SELECT 1 FROM dbo\.STOC_MSMV/);
  assert.ok(q.inputs.some((v) => v.value === "DVC")); assert.ok(q.inputs.some((v) => v.value === "RVP"));
});
test("NP cancelada se excluye y una facturada no entregada permanece pendiente", () => {
  const q = salesOrderQuery(config()); assert.match(q.text, /NPDE_MOTIVO_CANC IS NULL/); assert.match(q.text, /NPDE_CANT_PEDIDA - d\.NPDE_CANT_ENTREG > 0/);
  assert.doesNotMatch(q.text, /FACTUR/); assert.ok(q.inputs.some((v) => v.value === "NPT"));
});
test("OC cancelada por motivo o fecha se excluye y proveedor es opcional enlazado", () => {
  const c = config(); const all = purchaseOrderQuery(c);
  assert.match(all.text, /RODC_MOTIVO_CANC IS NULL AND r\.RODC_FECHA_CANC IS NULL/);
  assert.match(all.text, /@p\d+ IS NULL OR c\.CODC_PROVEEDOR = @p\d+/);
  assert.equal(all.inputs.at(-1).value, null); c.general.proveedor_oc = 1335;
  const filtered = purchaseOrderQuery(c); assert.equal(filtered.inputs.at(-1).value, 1335); assert.ok(!filtered.text.includes("1335"));
});
test("stock usa orígenes disjuntos, neto positivo, depósito 973 y exclusiones enlazadas", () => {
  const q = stockQuery(config());
  assert.match(q.text, /dbo\.STOC_SDPP/); assert.match(q.text, /dbo\.STOC_STDP/);
  assert.match(q.text, /WHERE NOT EXISTS \(SELECT 1 FROM TypesSheet/); assert.match(q.text, /WHERE EXISTS \(SELECT 1 FROM TypesSheet/);
  assert.match(q.text, /HAVING SUM\(quantity\) > 0/); assert.equal((q.text.match(/NOT EXISTS \(SELECT 1 FROM Excluded/g) ?? []).length, 2);
  for (const value of [973, 206, "0145", "011"]) assert.ok(q.inputs.some((v) => v.value === value));
  assert.equal((q.text.match(/ARTS_CLASIF_8 <>/g) ?? []).length, 1);
});
test("listas vacías son CTE tipados vacíos y nunca valores históricos", () => {
  const c = config(); c.familias = []; c["tipos-articulo-chapa"] = []; c["depositos-excluidos"] = [];
  const q = stockQuery(c); assert.equal((q.text.match(/WHERE 1 = 0/g) ?? []).length, 3); assert.ok(!q.text.includes("VALUES )"));
});
test("READ_UNCOMMITTED es hint local opcional sin estado de sesión", () => {
  assert.doesNotMatch(stockQuery(config()).text, /READUNCOMMITTED/);
  assert.match(stockQuery(config(), true).text, /WITH \(READUNCOMMITTED\)/);
  assert.doesNotMatch(stockQuery(config(), true).text, /\bSET TRANSACTION\b|\bBEGIN TRAN\b|\bCOMMIT\b/);
});
test("pool independiente reutiliza plataforma sin modificar su configuración", () => {
  const shared = erpConnection();
  const c = buildErpConfig(shared);
  assert.notEqual(c, shared); assert.notEqual(c.options, shared.options);
  for (const field of ["server", "database", "user", "password", "port", "requestTimeout"]) assert.ok(c[field] === shared[field], `Reutiliza ${field}`);
  for (const field of Object.keys(shared.options)) if (!["useUTC", "appName"].includes(field)) assert.ok(c.options[field] === shared.options[field], `Conserva opción ${field}`);
  const source = readFileSync(new URL("gdc-sqlserver.repository.js", import.meta.url), "utf8");
  assert.match(source, /import \{ plataforma \} from "\.\.\/\.\.\/\.\.\/dbconfig\.js"/);
  assert.match(source, /connectionConfig = plataforma/);
  assert.equal(c.pool.max, 6); assert.equal(c.options.useUTC, true);
  const mock = buildErpConfig(erpConnection()); assert.equal(mock.options.encrypt, false); assert.equal(mock.options.trustServerCertificate, true); assert.equal(mock.requestTimeout, 300000);
  assert.throws(() => buildErpConfig({}), { code: "GDC_ERP_CONFIG_MISSING" });
  assert.throws(() => buildErpConfig({ ...erpConnection(), pool: { min: 7, max: 6 } }));
  assert.throws(() => buildErpConfig({ ...erpConnection(), requestTimeout: 0 }));
  assert.throws(() => new GdcSqlServerRepository({ readUncommitted: "true" }));
});
test("errores propios de GDC conservan el contrato HTTP y no importan Finanzas", () => {
  const cause = new Error("original");
  const error = new GdcError("Compras", { status: 503, code: "GDC_ERP_UNAVAILABLE", cause });
  assert.equal(error.name, "GdcError"); assert.equal(error.status, 503); assert.equal(error.cause, cause);
  const validation = new GdcValidationError([{ field: "months", message: "Inválido" }]);
  assert.ok(validation instanceof GdcError); assert.equal(validation.status, 400); assert.equal(validation.code, "VALIDATION_ERROR");
  for (const file of ["gdc.errors.js", "gdc-config.repository.js", "gdc.controller.js", "gdc.routes.js", "gdc.service.js", "gdc.validator.js", "gdc-sqlserver.repository.js"]) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /\.\.\/gestion\//);
  }
});
test("repositorio ERP expone únicamente operaciones fijas de lectura y close", () => {
  assert.deepEqual(Object.getOwnPropertyNames(GdcSqlServerRepository.prototype).sort(), ["constructor", "production", "salesRemittances", "salesOrders", "stock", "purchaseOrders", "data", "close"].sort());
});
test("driver comparte un único pool en paralelo y enlaza inputs", async () => {
  let connections = 0, closes = 0; const requests = [];
  const repo = new GdcSqlServerRepository({ connectionConfig: erpConnection(), poolFactory: () => ({ async connect() { connections++; return this; }, async close() { closes++; } }), requestFactory: (_pool, timeout) => {
    const r = { inputs: [], input(...args) { this.inputs.push(args); return this; }, async query(text) { assert.equal(timeout, 300000); assert.ok(text.startsWith("WITH ")); return { recordset: [] }; } }; requests.push(r); return r;
  } });
  await Promise.all([repo.production(config(), params()), repo.stock(config()), repo.data(config())]);
  assert.equal(connections, 1); assert.equal(requests.length, 3); assert.ok(requests[0].inputs.some((v) => v[2] === "01400075"));
  await repo.close(); assert.equal(closes, 1);
});
test("timeout cancela la petición y devuelve error seguro", async () => {
  let canceled = 0;
  const repo = new GdcSqlServerRepository({ connectionConfig: erpConnection(), poolFactory: () => ({ async connect() { return this; } }), requestFactory: () => ({ input() {}, cancel() { canceled++; }, async query() { throw Object.assign(new Error("secret SELECT"), { code: "ETIMEOUT" }); } }) });
  await assert.rejects(repo.stock(config()), { code: "GDC_ERP_TIMEOUT", status: 503, message: "No se pudo consultar el ERP de Compras" }); assert.equal(canceled, 1);
});
test("aborto cancela una consulta activa", async () => {
  let rejectQuery, ready; const started = new Promise((resolve) => { ready = resolve; }); const ac = new AbortController(); let canceled = false;
  const repo = new GdcSqlServerRepository({ connectionConfig: erpConnection(), poolFactory: () => ({ async connect() { return this; } }), requestFactory: () => ({ input() {}, query() { ready(); return new Promise((_resolve, reject) => { rejectQuery = reject; }); }, cancel() { canceled = true; rejectQuery(new Error("cancelled")); } }) });
  const pending = repo.stock(config(), ac.signal); await started; ac.abort(); await assert.rejects(pending, { code: "GDC_ERP_UNAVAILABLE" }); assert.equal(canceled, true);
});
test("conexión fallida puede reintentarse sin retener un pool rechazado", async () => {
  let attempts = 0;
  const repo = new GdcSqlServerRepository({ connectionConfig: erpConnection(), poolFactory: () => ({ async connect() { if (++attempts === 1) throw new Error("offline"); return this; } }), requestFactory: () => ({ input() {}, async query() { return { recordset: [] }; } }) });
  await assert.rejects(repo.data(config())); await repo.data(config()); assert.equal(attempts, 2);
});
test("error asíncrono del pool se registra sin mensaje sensible ni excepción no manejada", async () => {
  let handler;
  const logs = [];
  const repo = new GdcSqlServerRepository({ connectionConfig: erpConnection(), logger: { error: (...args) => logs.push(args) }, poolFactory: () => ({ on(event, callback) { assert.equal(event, "error"); handler = callback; }, async connect() { return this; } }), requestFactory: () => ({ input() {}, async query() { return { recordset: [] }; } }) });
  await repo.data(config());
  handler(Object.assign(new Error("password=secret"), { code: "ESOCKET" }));
  assert.equal(logs[0][1].block, "erpPool"); assert.equal(logs[0][1].code, "ESOCKET"); assert.ok(!JSON.stringify(logs).includes("secret"));
});
test("señal ya cancelada no abre pool ni consulta ERP", async () => {
  const ac = new AbortController(); ac.abort();
  const repo = new GdcSqlServerRepository({ connectionConfig: erpConnection(), poolFactory: () => { throw new Error("No debe conectar"); } });
  await assert.rejects(repo.stock(config(), ac.signal), (error) => error.cause.message === "ABORTED");
});
test("resultado ERP numérico inválido falla consolidación sin respuesta parcial", async () => {
  const h = harness({ salesOrders: [{ classifier5: "0027", ton: "bad", invalidFactors: 0 }] });
  await assert.rejects(h.service.get(), { code: "GDC_ERP_RESULT_INVALID", status: 503 });
  assert.equal(h.logs[0][1].block, "consolidation");
});
test("fallo PostgreSQL impide consultar ERP y no filtra secretos en logs", async () => {
  const h = harness(); h.service.config.load = async () => { throw new Error("password=secret"); };
  await assert.rejects(h.service.get(), { code: "GDC_CONFIG_UNAVAILABLE", status: 503 }); assert.equal(h.calls.length, 0); assert.ok(!JSON.stringify(h.logs).includes("secret")); assert.equal(h.logs[0][1].block, "postgresConfiguration");
});
for (const block of ["production", "salesRemittances", "salesOrders", "stock", "purchaseOrders", "data"]) {
  test(`fallo independiente ${block} cancela hermanos sin respuesta parcial`, async () => {
    const h = harness(); let signal;
    h.erp[block] = async (...args) => { signal = args.at(-1); throw new Error("password=secret; SELECT sensitive"); };
    await assert.rejects(h.service.get(), { code: "GDC_ERP_UNAVAILABLE", status: 503 }); assert.equal(signal.aborted, true);
    assert.equal(h.logs[0][1].block, block); assert.ok(!JSON.stringify(h.logs).includes("secret"));
  });
}
test("validadores conservan códigos y rechazan números para referencias", () => {
  assert.equal(validateKey(RESOURCES.familias, "0027"), "0027"); assert.equal(validateKey(RESOURCES["tipos-articulo-chapa"], "011"), "011");
  assert.throws(() => validateKey(RESOURCES.familias, 27)); assert.throws(() => validateChanges(RESOURCES.familias, { codigo_ref_hl: 1400075 }, "0030"));
  assert.equal(validateChanges(RESOURCES.familias, { codigo_ref_hl: "01400075" }, "0030").codigo_ref_hl, "01400075");
});
test("familia exige pareja completa de largos y al menos HL o 13m", () => {
  validateRecord(RESOURCES.familias, longFamily()); validateRecord(RESOURCES.familias, hlFamily());
  assert.throws(() => validateRecord(RESOURCES.familias, { ...longFamily(), codigo_ref_1050: null }));
  assert.throws(() => validateRecord(RESOURCES.familias, { ...hlFamily(), codigo_ref_hl: null }));
});
test("config rechaza created_at, updated_by, código mutable y valores no positivos", () => {
  for (const changes of [{ created_at: "now" }, { updated_by: "otro" }, { clasificador_5: "9999", nombre: "otro" }, { orden: 0 }, { activo: "false" }]) assert.throws(() => validateChanges(RESOURCES.familias, changes, "0027"));
  for (const changes of [{ meses_consumo_default: 0 }, { dias_rotacion_default: 0 }, { deposito_principal: 0 }, { proveedor_oc: -1 }, { clasificador_8_excluido_stock: "145" }]) assert.throws(() => validateChanges(RESOURCES.general, changes, 1));
  assert.deepEqual(validateChanges(RESOURCES.general, { proveedor_oc: null }, 1), { proveedor_oc: null });
});
function pgHarness(c = config()) {
  const calls = []; let released = false;
  const client = { async query(text, values) {
    calls.push({ text, values });
    const resource = Object.keys(RESOURCES).find((name) => text.includes(`public.${RESOURCES[name].table}`));
    return { rows: resource ? resource === "general" ? [c.general] : c[resource] : [] };
  }, release() { released = true; } };
  return { calls, client, released: () => released, pool: { async connect() { return client; }, query: (...args) => client.query(...args) } };
}
test("PostgreSQL carga seis tablas en snapshot coherente y libera conexión", async () => {
  const h = pgHarness(); const repository = new GdcConfigRepository(h.pool); const result = await repository.load();
  assert.equal(result.familias[0].clasificador_5, "0027"); assert.equal(h.calls.length, 8); assert.equal(h.released(), true);
  assert.match(h.calls[0].text, /REPEATABLE READ READ ONLY/); assert.match(h.calls[1].text, /WHERE activo = true ORDER BY orden, clasificador_5/); assert.equal(h.calls.at(-1).text, "COMMIT");
});
test("PostgreSQL falla con rollback y libera conexión", async () => {
  const h = pgHarness(); const query = h.client.query; h.client.query = async (text, values) => { if (text.includes("gdc_configuracion")) throw new Error("offline"); return query(text, values); };
  await assert.rejects(new GdcConfigRepository(h.pool).load()); assert.equal(h.calls.at(-1).text, "ROLLBACK"); assert.equal(h.released(), true);
});
test("modificación parcial bloquea fila, valida pareja completa y audita actor", async () => {
  const h = pgHarness(); const repo = new GdcConfigRepository(h.pool);
  await repo.update(RESOURCES.familias, "0027", { notas: "Nueva" }, "gabriel");
  assert.match(h.calls[1].text, /FOR UPDATE/); const update = h.calls.find((v) => v.text.startsWith("UPDATE"));
  assert.match(update.text, /updated_by = \$2/); assert.deepEqual(update.values, ["Nueva", "gabriel", "0027"]); assert.equal(h.calls.at(-1).text, "COMMIT");
  await assert.rejects(repo.update(RESOURCES.familias, "0027", { codigo_ref_1050: null }, "gabriel"), { code: "VALIDATION_ERROR" }); assert.equal(h.calls.at(-1).text, "ROLLBACK");
});
test("crear configura solamente PostgreSQL con valores enlazados y auditoría", async () => {
  const h = pgHarness(); const row = longFamily(); delete row.clasificador_5;
  await new GdcConfigRepository(h.pool).create(RESOURCES.familias, "0027", row, "javier");
  assert.match(h.calls[0].text, /^INSERT INTO public\.gdc_familias_chapas/); assert.ok(h.calls[0].values.includes("0027")); assert.equal(h.calls[0].values.at(-1), "javier"); assert.doesNotMatch(h.calls[0].text, /created_at/);
});
test("migraciones PG10 idempotentes sin recrear tablas ni sobrescribir datos", () => {
  const text = readFileSync(new URL("../../../database/20261002_gdc_configuracion.sql", import.meta.url), "utf8");
  assert.equal((text.match(/CREATE TABLE IF NOT EXISTS/g) ?? []).length, 6); assert.match(text, /EXECUTE PROCEDURE/); assert.match(text, /ON CONFLICT \(clasificador_5\) DO NOTHING/);
  assert.doesNotMatch(text, /DROP TABLE|TRUNCATE|DELETE FROM|GENERATED|EXECUTE FUNCTION/);
  const permissions = readFileSync(new URL("../../../database/20261002_gdc_permissions.sql", import.meta.url), "utf8");
  assert.match(permissions, /gdc\.configurar/); assert.doesNotMatch(permissions, /INSERT INTO public\.gf_usuario_roles/);
});
