import assert from "node:assert/strict";
import test from "node:test";
import { DuplicateTransferMonitorService } from "./duplicate-transfer-monitor.service.js";
import { WhatsAppNotificationService } from "./whatsapp-notification.service.js";
import { DuplicateTransferError, sanitizeError } from "./duplicate-transfer.errors.js";
import { maskPhone, normalizeDecimal, normalizeMovements } from "./duplicate-transfer.normalizer.js";
import { parseIsoInstant, validateConfig, validateRunBody, validateWindow } from "./duplicate-transfer.validator.js";
import { SqlServerDuplicateTransferRepository } from "./sql-server-duplicate-transfer.repository.js";
import { DuplicateTransferScheduler, isDuplicateTransferSchedulerProcess } from "./duplicate-transfer-scheduler.js";

const validConfig = (overrides = {}) => ({
  id: 1, enabled: true, cron_expression: "0 */4 * * *", timezone: "America/Argentina/Buenos_Aires",
  lookback_days: 60, minimum_coincidences: 2, erp_origin: "CCCV", account_codes: ["11010201"],
  query_timeout_seconds: 120, max_results: 5000, notify_new_occurrences: true, dry_run: false,
  whatsapp_provider: "meta_cloud_api", whatsapp_recipient: "+5491112345678",
  whatsapp_template_name: "alerta_transferencias_duplicadas_v1", whatsapp_template_language: "es_AR",
  version: 1, updated_at: new Date(), updated_by: "test", ...overrides,
});

function raw({ asiento = 1, renglon = asiento, cuenta = "11010201", importe = "100.00", cliente = 10, fecha = "2026-07-01", nombre = "Cliente", signo = "D", comprobante = "1 - REC - 123" } = {}) {
  return { CASI_FECHA: new Date(`${fecha}T00:00:00Z`), CASI_DIVISION: 1, CASI_ASIENTO: asiento, RASI_RENGLON: renglon, CUEN_CUENTA: cuenta, CUEN_NOMBRE: "Banco", RASI_IMP_LOC: importe, RASI_SIGNO: signo, CASI_ORIGEN: "CCCV", CLIE_CLIENTE: cliente, CLIE_NOMBRE: nombre, CTEC_CTACTE_CTEC: 123, CTEC_DIVISION: 1, CTEC_SUCURSAL_IMP: 1, COMPROBANTE: comprobante, CANTIDAD_COINCIDENCIAS: 2, PRIMERA_FECHA: new Date("2026-07-01T00:00:00Z"), ULTIMA_FECHA: new Date("2026-07-02T00:00:00Z"), DIAS_ENTRE_COINCIDENCIAS: 1 };
}

class MemoryRepository {
  constructor() { this.runs = new Map(); this.movements = new Map(); this.alerts = []; this.nextRun = 1; this.nextMovement = 1; this.locked = false; this.forceLocked = false; }
  async acquireExecutionLock() {
    const acquired = !this.forceLocked && !this.locked;
    if (acquired) this.locked = true;
    const self = this;
    return { acquired, client: { release() {}, async query(_sql, values) { const run = self.runs.get(Number(values?.[0])); return { rows: run ? [{ status: run.status }] : [] }; } } };
  }
  async releaseExecutionLock() { this.locked = false; }
  async createRun(_client, data) { const row = { id: this.nextRun++, status: "running", ...data }; this.runs.set(row.id, row); return row; }
  async finishRun(_client, id, fields) { const row = { ...this.runs.get(id), ...fields, finished_at: new Date() }; this.runs.set(id, row); return row; }
  async persistMovements(runId, movements) {
    const saved = [];
    for (const item of movements) {
      let row = this.movements.get(item.sourceKey);
      if (!row) row = { id: this.nextMovement++, source_key: item.sourceKey, group_key: item.groupKey, movement_date: item.movementDate, notifiedAt: null, first_seen_run_id: runId };
      row.last_seen_run_id = runId; this.movements.set(item.sourceKey, row); saved.push(row);
    }
    return saved;
  }
  async findEligibleGroups(groupKeys, from, to, minimum) {
    const grouped = new Map();
    for (const row of this.movements.values()) if (groupKeys.includes(row.group_key) && row.movement_date >= from && row.movement_date <= to) {
      if (!grouped.has(row.group_key)) grouped.set(row.group_key, []);
      grouped.get(row.group_key).push(row);
    }
    return [...grouped.entries()].filter(([, rows]) => rows.length >= minimum && rows.some((row) => !row.notifiedAt)).map(([group_key, rows]) => ({ group_key, movement_count: rows.length, unnotified_count: rows.filter((row) => !row.notifiedAt).length, movements: rows.map((row) => ({ id: row.id, notifiedAt: row.notifiedAt })) }));
  }
  async createAlert(data) { const alert = { id: this.alerts.length + 1, ...data }; this.alerts.push(alert); return alert; }
  async saveDryRunAlert(id) { this.alerts.find((alert) => alert.id === id).saved = true; }
  async confirmAlertSent(id, groups, providerMessageId) { this.alerts.find((alert) => alert.id === id).providerMessageId = providerMessageId; for (const group of groups) for (const movement of group.movements) for (const stored of this.movements.values()) if (stored.id === movement.id && !stored.notifiedAt) stored.notifiedAt = new Date(); }
  async failAlert(id, error) { Object.assign(this.alerts.find((alert) => alert.id === id), error); }
}

function fixture({ config = validConfig(), rows = [], repository = new MemoryRepository(), send } = {}) {
  let detects = 0; let sends = 0;
  const service = new DuplicateTransferMonitorService({
    configLoader: async () => config,
    sqlRepository: { async detect() { detects += 1; if (rows instanceof Error) throw rows; return typeof rows === "function" ? rows() : rows; } },
    notificationService: { buildPayload: ({ groups }) => ({ groups: groups.length }), async send() { sends += 1; return send ? send() : { providerMessageId: "wamid.test" }; } },
    repository,
  });
  return { service, repository, counts: () => ({ detects, sends }) };
}

const manual = { trigger: "manual", notify: true, from: new Date("2026-06-01T03:00:00Z"), to: new Date("2026-08-01T03:00:00Z") };

test("configuración desactivada omite SQL Server en cron", async () => {
  const f = fixture({ config: validConfig({ enabled: false }), rows: [raw()] });
  const result = await f.service.run({ trigger: "cron", notify: true });
  assert.equal(result.status, "skipped_disabled"); assert.equal(f.counts().detects, 0);
});

test("dry_run construye alerta pero no envía ni marca movimientos", async () => {
  const f = fixture({ config: validConfig({ dry_run: true }), rows: [raw({ asiento: 1 }), raw({ asiento: 2 })] });
  const result = await f.service.run(manual);
  assert.equal(result.status, "success"); assert.equal(f.repository.alerts[0].status, "dry_run"); assert.equal(f.counts().sends, 0); assert.equal([...f.repository.movements.values()].every((row) => !row.notifiedAt), true);
});

test("acepta cron válido", () => assert.doesNotThrow(() => validateConfig(validConfig())));
test("rechaza cron inválido", () => assert.throws(() => validateConfig(validConfig({ cron_expression: "no-es-cron" })), /válidos/i));
test("rechaza intervalo invertido", () => assert.throws(() => validateWindow(new Date("2026-08-02"), new Date("2026-08-01")), /válidos/i));
test("rechaza intervalo mayor a 180 días", () => assert.throws(() => validateWindow(new Date("2026-01-01"), new Date("2026-08-01")), /válidos/i));
test("requiere ISO 8601 con zona explícita", () => assert.throws(() => parseIsoInstant("2026-08-01T10:00:00", "from"), /válidos/i));

test("stored procedure sin resultados finaliza success", async () => {
  const f = fixture(); const result = await f.service.run({ ...manual, notify: false });
  assert.equal(result.status, "success"); assert.equal(result.foundMovementCount, 0);
});

test("primera transferencia se guarda sin alerta", async () => {
  const f = fixture({ rows: [raw()] }); await f.service.run(manual);
  assert.equal(f.repository.movements.size, 1); assert.equal(f.repository.alerts.length, 0);
});

test("dos transferencias del mismo grupo generan una alerta", async () => {
  const f = fixture({ rows: [raw({ asiento: 1 }), raw({ asiento: 2 })] }); const result = await f.service.run(manual);
  assert.equal(f.repository.alerts.length, 1); assert.equal(result.notifiedGroupCount, 1); assert.equal(result.notifiedMovementCount, 2);
});

test("la reaparición de las mismas transferencias no vuelve a alertar", async () => {
  const f = fixture({ rows: [raw({ asiento: 1 }), raw({ asiento: 2 })] }); await f.service.run(manual); await f.service.run(manual);
  assert.equal(f.repository.alerts.length, 1); assert.equal(f.counts().sends, 1);
});

test("una tercera transferencia nueva genera otra alerta con el grupo completo", async () => {
  let current = [raw({ asiento: 1 }), raw({ asiento: 2 })]; const f = fixture({ rows: () => current }); await f.service.run(manual);
  current = [...current, raw({ asiento: 3 })]; const result = await f.service.run(manual);
  assert.equal(f.repository.alerts.length, 2); assert.equal(result.notifiedMovementCount, 1); assert.equal(f.repository.alerts[1].movementCount, 3);
});

test("grupos diferentes se consolidan en un solo envío", async () => {
  const f = fixture({ rows: [raw({ asiento: 1 }),raw({ asiento: 2 }),raw({ asiento: 3,cliente: 20 }),raw({ asiento: 4,cliente: 20 })] }); const result = await f.service.run(manual);
  assert.equal(result.notifiedGroupCount, 2); assert.equal(f.repository.alerts.length, 1); assert.equal(f.counts().sends, 1);
});

test("normaliza decimal exactamente sin punto flotante", () => {
  assert.equal(normalizeDecimal("000123.4500"), "123.45"); assert.equal(normalizeDecimal(-0), "0"); assert.equal(normalizeDecimal("9999999999999.99"), "9999999999999.99");
});

test("detecta colisión de sourceKey", () => assert.throws(() => normalizeMovements([raw(), raw({ nombre: "Otro nombre" })]), /colisión/));
test("RASI_RENGLON distingue movimientos contablemente idénticos", () => assert.equal(normalizeMovements([raw({ asiento: 1, renglon: 1 }), raw({ asiento: 1, renglon: 2 })]).length, 2));
test("rechaza filas sin campos suficientes para sourceKey", () => assert.throws(() => normalizeMovements([{ ...raw(), CASI_ASIENTO: null }]), /identificadores/));

test("límite max_results produce partial y no persiste", async () => {
  const f = fixture({ config: validConfig({ max_results: 1 }), rows: [raw({ asiento: 1 }),raw({ asiento: 2 })] }); const result = await f.service.run(manual);
  assert.equal(result.status, "partial"); assert.equal(f.repository.movements.size, 0);
});

test("propaga error de SQL Server y registra failed", async () => {
  const error = new DuplicateTransferError("ERP caído", { code: "SQL_SERVER_ERROR" }); const f = fixture({ rows: error });
  await assert.rejects(f.service.run(manual), /ERP caído/); assert.equal(f.repository.runs.get(1).status, "failed");
});

test("propaga timeout de SQL Server sanitizado", async () => {
  const error = new DuplicateTransferError("Timeout ERP", { code: "SQL_SERVER_TIMEOUT", transient: true }); const f = fixture({ rows: error });
  await assert.rejects(f.service.run(manual), /Timeout/); assert.equal(f.repository.runs.get(1).errorCode, "SQL_SERVER_TIMEOUT");
});

test("error de PostgreSQL durante persistencia marca failed", async () => {
  const repository = new MemoryRepository(); repository.persistMovements = async () => { throw new Error("pg unavailable"); };
  const f = fixture({ repository, rows: [raw()] }); await assert.rejects(f.service.run(manual)); assert.equal(repository.runs.get(1).status, "failed");
});

test("advisory lock ocupado registra skipped_locked y omite ERP", async () => {
  const repository = new MemoryRepository(); repository.forceLocked = true; const f = fixture({ repository, rows: [raw()] }); const result = await f.service.run(manual);
  assert.equal(result.status, "skipped_locked"); assert.equal(f.counts().detects, 0);
});

test("dos instancias simultáneas ejecutan el ERP una sola vez", async () => {
  const repository = new MemoryRepository(); let detects = 0;
  const make = () => new DuplicateTransferMonitorService({ configLoader: async () => validConfig(), repository, sqlRepository: { async detect() { detects += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return []; } }, notificationService: { buildPayload() {}, async send() {} } });
  const results = await Promise.all([make().run(manual), make().run(manual)]);
  assert.equal(detects, 1); assert.equal(results.some((row) => row.status === "skipped_locked"), true);
});

function metaService(post) {
  return new WhatsAppNotificationService({ httpClient: { post }, env: { WHATSAPP_ACCESS_TOKEN: "secret", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_GRAPH_API_VERSION: "v99", WHATSAPP_API_BASE_URL: "https://graph.facebook.com" } });
}

test("construye las cuatro variables Meta en el orden aprobado", () => {
  const service = metaService(); const payload = service.buildPayload({ config: validConfig(), groups: [{ movement_count: 3 }], from: new Date("2026-07-01T12:00:00Z"), to: new Date("2026-08-01T12:00:00Z") });
  assert.deepEqual(payload.template.components[0].parameters.map((item) => item.text), ["1","3","01/07/2026","01/08/2026"]);
});

test("respuesta Meta exitosa devuelve wamid", async () => {
  const result = await metaService(async () => ({ data: { messages: [{ id: "wamid.abc" }] } })).send({}); assert.equal(result.providerMessageId, "wamid.abc");
});

test("error 4xx de Meta es permanente", async () => {
  const error = Object.assign(new Error("bad request"), { response: { status: 400 } }); await assert.rejects(metaService(async () => { throw error; }).send({}), (e) => e.code === "WHATSAPP_HTTP_400" && !e.transient);
});

test("error 429 o 5xx de Meta es transitorio", async () => {
  for (const status of [429, 503]) { const error = Object.assign(new Error("unavailable"), { response: { status } }); await assert.rejects(metaService(async () => { throw error; }).send({}), (e) => e.transient === true); }
});

test("timeout ambiguo de Meta queda identificado", async () => {
  const error = Object.assign(new Error("timeout"), { code: "ECONNABORTED" }); await assert.rejects(metaService(async () => { throw error; }).send({}), (e) => e.ambiguous === true && e.code === "WHATSAPP_TIMEOUT_AMBIGUOUS");
});

test("timeout ambiguo deja run partial y alerta revisable sin notificar movimientos", async () => {
  const ambiguous = new DuplicateTransferError("resultado ambiguo", { code: "WHATSAPP_TIMEOUT_AMBIGUOUS", ambiguous: true });
  const f = fixture({ rows: [raw({ asiento: 1 }), raw({ asiento: 2 })], send: () => { throw ambiguous; } });
  await assert.rejects(f.service.run(manual), /ambiguo/);
  assert.equal(f.repository.runs.get(1).status, "partial"); assert.equal(f.repository.alerts[0].status, "failed"); assert.equal([...f.repository.movements.values()].every((row) => !row.notifiedAt), true);
});

test("ejecución manual sin notificación persiste pero no envía", async () => {
  const f = fixture({ rows: [raw({ asiento: 1 }), raw({ asiento: 2 })] }); const result = await f.service.run({ ...manual, notify: false });
  assert.equal(result.status, "success"); assert.equal(f.counts().sends, 0); assert.equal(f.repository.alerts.length, 0);
});

test("ejecución real exige confirmación explícita", () => assert.throws(() => validateRunBody({ notify: true }), /válidos/i));

test("enmascara teléfono y secretos en errores", () => {
  assert.equal(maskPhone("+5491112345678"), "******5678"); const safe = sanitizeError(new DuplicateTransferError("Authorization=secret Bearer abc.def")); assert.equal(safe.message.includes("secret"), false); assert.equal(safe.message.includes("abc.def"), false);
});

test("SQL Server invoca exclusivamente el stored procedure con JSON y timeout", async () => {
  const inputs = []; let executed; let timeout;
  const connection = {
    request() { const request = { input(...args) { inputs.push(args); return request; }, async execute(name) { executed = name; timeout = request.timeout; return { recordset: [] }; } }; return request; },
    async close() {},
  };
  const repository = new SqlServerDuplicateTransferRepository({ poolFactory: () => ({ async connect() { return connection; } }) });
  await repository.detect({ from: new Date("2026-07-01T03:00:00Z"), to: new Date("2026-08-01T03:00:00Z"), timezone: "America/Argentina/Buenos_Aires", origin: "CCCV", accountCodes: ["1","2"], minimumCoincidences: 2, timeoutSeconds: 15 });
  assert.equal(executed, "dbo.spDetectarTransferenciasDuplicadas"); assert.equal(timeout, 15000);
  assert.equal(inputs.find(([name]) => name === "CuentasJson")[2], '["1","2"]');
});

test("scheduler recarga cron y se detiene al desactivar", async () => {
  let config = validConfig({ cron_expression: "0 */4 * * *" });
  const scheduler = new DuplicateTransferScheduler({ configLoader: async () => config, monitor: { async run() {} } });
  await scheduler.refresh(); assert.equal(scheduler.status().running, true); assert.ok(scheduler.status().nextRun instanceof Date);
  config = validConfig({ enabled: false, version: 2 }); await scheduler.refresh(); assert.equal(scheduler.status().running, false); scheduler.stop();
});

test("solo NODE_APP_INSTANCE 0 ejecuta el scheduler en PM2", async () => {
  assert.equal(isDuplicateTransferSchedulerProcess({}), true);
  assert.equal(isDuplicateTransferSchedulerProcess({ NODE_APP_INSTANCE: "0" }), true);
  assert.equal(isDuplicateTransferSchedulerProcess({ NODE_APP_INSTANCE: "1" }), false);
  assert.equal(isDuplicateTransferSchedulerProcess({ NODE_APP_INSTANCE: "3" }), false);

  let configReads = 0;
  const passive = new DuplicateTransferScheduler({
    enabledForProcess: false,
    configLoader: async () => { configReads += 1; return validConfig(); },
    monitor: { async run() { throw new Error("No debe ejecutarse"); } },
  });
  await passive.start();
  await passive.refresh();
  assert.equal(configReads, 0);
  assert.equal(passive.status().running, false);
  assert.equal(passive.status().enabledForProcess, false);
});
