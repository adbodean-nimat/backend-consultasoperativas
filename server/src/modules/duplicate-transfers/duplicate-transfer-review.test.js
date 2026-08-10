import assert from "node:assert/strict";
import test from "node:test";
import { DuplicateTransferReviewService } from "./duplicate-transfer-review.service.js";
import { normalizeMovements } from "./duplicate-transfer.normalizer.js";
import { requireReviewPermission, validateReviewQuery } from "./duplicate-transfer.validator.js";

const config = (overrides = {}) => ({
  enabled: false, cron_expression: "0 */4 * * *", timezone: "America/Argentina/Buenos_Aires",
  lookback_days: 60, minimum_coincidences: 2, erp_origin: "CCCV", account_codes: ["11010201", "11010202"],
  query_timeout_seconds: 30, max_results: 100, notify_new_occurrences: true, dry_run: true,
  whatsapp_provider: "meta_cloud_api", whatsapp_recipient: null,
  whatsapp_template_name: "alerta_transferencias_duplicadas_v1", whatsapp_template_language: "es_AR", ...overrides,
});

function row({ asiento = 1, cuenta = "11010201", importe = "13725.00", cliente = "2107", signo = "D", comprobante = "1 - REC - 456789", fecha = "2026-07-06" } = {}) {
  return {
    CASI_FECHA: new Date(`${fecha}T12:00:00Z`), CASI_DIVISION: "1", CASI_ASIENTO: String(asiento), RASI_RENGLON: String(asiento),
    CUEN_CUENTA: cuenta, CUEN_NOMBRE: "Banco", RASI_IMP_LOC: importe, RASI_SIGNO: signo,
    CASI_ORIGEN: "CCCV", CLIE_CLIENTE: cliente, CLIE_NOMBRE: "Cliente",
    CTEC_CTACTE_CTEC: "99", CTEC_DIVISION: "1", CTEC_SUCURSAL_IMP: "1", COMPROBANTE: comprobante,
    CANTIDAD_COINCIDENCIAS: 2, PRIMERA_FECHA: new Date("2026-07-06T12:00:00Z"),
    ULTIMA_FECHA: new Date("2026-07-15T12:00:00Z"), DIAS_ENTRE_COINCIDENCIAS: 9,
  };
}

function fixture(rows = [], overrides = {}) {
  const calls = [];
  const service = new DuplicateTransferReviewService({
    configLoader: async () => config(overrides),
    now: () => new Date("2026-08-05T15:00:00Z"),
    sql: { async detect(input) { calls.push(input); return rows; } },
  });
  return { service, calls };
}

const query = (overrides = {}) => ({ from: "2026-06-01", to: "2026-07-31", accountCode: null, clientCode: null, page: 1, pageSize: 25, ...overrides });

test("review usa la ventana predeterminada configurada de 60 días", async () => {
  const f = fixture();
  const result = await f.service.review(query({ from: undefined, to: undefined }));
  assert.equal((f.calls[0].to - f.calls[0].from) / 86_400_000, 60);
  assert.deepEqual(result.filters, { from: "2026-06-06", to: "2026-08-05", accountCode: null, clientCode: null });
});

test("review rechaza intervalos invertidos y mayores a 180 días", async () => {
  await assert.rejects(fixture().service.review(query({ from: "2026-08-01", to: "2026-07-01" })), /válidos/i);
  await assert.rejects(fixture().service.review(query({ from: "2026-01-01", to: "2026-07-31" })), /válidos/i);
});

test("review acepta una cuenta configurada, reduce CuentasJson y rechaza otra", async () => {
  const f = fixture();
  await f.service.review(query({ accountCode: "11010202" }));
  assert.deepEqual(f.calls[0].accountCodes, ["11010202"]);
  await assert.rejects(f.service.review(query({ accountCode: "999" })), /válidos/i);
});

test("review devuelve resumen vacío sin efectos laterales", async () => {
  const f = fixture();
  const result = await f.service.review(query());
  assert.deepEqual(result.summary, { groupCount: 0, movementCount: 0, totalAmount: "0.00" });
  assert.deepEqual(result.items, []);
  assert.equal(f.calls.length, 1);
});

test("review incluye signo D, comprobantes concatenados y agrupa por la regla", async () => {
  const receipt = "1 - REC - 456789 | 1 - O/P - 987654";
  const f = fixture([row({ asiento: 1, comprobante: receipt }), row({ asiento: 2, comprobante: receipt })]);
  const result = await f.service.review(query());
  assert.equal(result.summary.groupCount, 1);
  assert.equal(result.summary.movementCount, 2);
  assert.equal(result.summary.totalAmount, "27450.00");
  assert.equal(result.items[0].sign, "D");
  assert.equal(result.items[0].receipt, receipt);
  assert.equal(result.items[0].coincidenceCount, 2);
});

test("el signo forma parte de groupKey y solo se admite D", () => {
  assert.throws(() => normalizeMovements([row({ signo: "H" })]), /signo no permitido/);
  const movements = normalizeMovements([row({ asiento: 1 }), row({ asiento: 2, cuenta: "11010202" })]);
  assert.notEqual(movements[0].groupKey, movements[1].groupKey);
});

test("review pagina y conserva precisión decimal sin Number", async () => {
  const f = fixture([
    row({ asiento: 1, importe: "9999999999999.99", fecha: "2026-07-02" }),
    row({ asiento: 2, importe: "0.01", fecha: "2026-07-01" }),
  ]);
  const result = await f.service.review(query({ page: 2, pageSize: 1 }));
  assert.deepEqual(result.pagination, { page: 2, pageSize: 1, totalItems: 2, totalPages: 2 });
  assert.equal(result.summary.totalAmount, "10000000000000.00");
  assert.equal(result.items[0].amount, "0.01");
});

test("review filtra cliente después del procedimiento sin alterar el origen", async () => {
  const f = fixture([row({ asiento: 1, cliente: "2107" }), row({ asiento: 2, cliente: "9999" })]);
  const result = await f.service.review(query({ clientCode: "2107" }));
  assert.equal(result.summary.movementCount, 1);
  assert.equal(f.calls[0].origin, "CCCV");
});

test("valida paginación y parámetros desconocidos", () => {
  assert.deepEqual(validateReviewQuery({ page: "2", pageSize: "10" }).page, 2);
  assert.throws(() => validateReviewQuery({ pageSize: "201" }), /válidos/i);
  assert.throws(() => validateReviewQuery({ sql: "select 1" }), /válidos/i);
});

function authorize(user) {
  let error = null; let passed = false;
  requireReviewPermission({ user }, null, (value) => { error = value || null; passed = !value; });
  return { error, passed };
}

test("endpoint review rechaza usuarios generales", () => {
  const result = authorize({ memberOf: ["CN=Usuarios,OU=Grupos,DC=nimit,DC=com"] });
  assert.equal(result.passed, false); assert.equal(result.error?.status, 403);
});

test("endpoint review admite permiso explícito, Finanzas y administradores configurados", () => {
  const old = process.env.DUPLICATE_TRANSFER_ADMIN_GROUPS;
  process.env.DUPLICATE_TRANSFER_ADMIN_GROUPS = "Sistemas";
  try {
    assert.equal(authorize({ permissions: ["duplicate-transfers:review"] }).passed, true);
    assert.equal(authorize({ memberOf: ["CN=Administracion y Finanzas,OU=Grupos,DC=nimit,DC=com"] }).passed, true);
    assert.equal(authorize({ memberOf: ["CN=Sistemas,OU=Grupos,DC=nimit,DC=com"] }).passed, true);
  } finally {
    if (old === undefined) delete process.env.DUPLICATE_TRANSFER_ADMIN_GROUPS; else process.env.DUPLICATE_TRANSFER_ADMIN_GROUPS = old;
  }
});

test("review no recibe dependencias capaces de enviar, notificar ni crear alertas", async () => {
  let sqlCalls = 0;
  const service = new DuplicateTransferReviewService({ configLoader: async () => config(), sql: { async detect() { sqlCalls += 1; return [row()]; } } });
  await service.review(query());
  assert.equal(sqlCalls, 1);
  assert.equal("repository" in service, false);
  assert.equal("notificationService" in service, false);
});
