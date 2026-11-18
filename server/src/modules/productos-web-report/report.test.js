import test from "node:test";
import assert from "node:assert/strict";
import xlsx from "xlsx";
import { EventEmitter } from "node:events";
import { validateReport } from "./report.validator.js";
import { ReportService } from "./report.service.js";
import { ReportDropbox, contentHash, retry } from "./report.dropbox.js";
import { ReportRepository } from "./report.repository.js";
import { readConfig, TARGET_PATH } from "./report.config.js";
import { startReportScheduler } from "./report.scheduler.js";

// Synthetic in-memory fixtures exercise the engine, not the unconfirmed real schema.
function excel(rows = [["SKU", "URL"], ["123", "https://example.test/123"]], type = "xlsx") {
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet(rows), "Productos");
  return xlsx.write(book, { type: "buffer", bookType: type });
}
const config = { path: TARGET_PATH, version: "test", protocol: "fake", auth: "fake", mailbox: "reports", folder: "Inbox", sender: "erp@example.test", subject: "Productos Web II", filename: "report.xlsx", sheet: "Productos", columns: ["SKU", "URL"], maxBytes: 20 * 1024 * 1024, initialDate: "2026-11-01T00:00:00Z", initialRev: "baseline", dryRun: false };
function mail(id, date, buffer = excel()) {
  return { id, sender: config.sender, subject: config.subject, reportAt: date,
    attachments: [{ id: `attachment-${id}`, name: config.filename, size: buffer.length }], buffer };
}
function fixture(messages = []) {
  let durable = null, uploads = 0, downloads = 0, metadataCalls = 0, locked = false;
  let remote = { rev: "baseline", content_hash: "initial" };
  const store = { guard() {}, async load() { return structuredClone(durable); }, async save(state) { durable = structuredClone(state); } };
  const repository = { async withLock(work) { if (locked) return { skipped: "locked" }; locked = true; try { return await work(store); } finally { locked = false; } } };
  const source = {
    async list() { return { messages, cursor: "next", hasMore: false }; },
    async download({ messageId }) { downloads++; return messages.find(m => m.id === messageId).buffer; },
  };
  const dropbox = { async metadata() { metadataCalls++; return { ...remote }; }, async upload(path, bytes, rev) { assert.equal(path, TARGET_PATH); assert.equal(rev, remote.rev); uploads++; remote = { rev: `rev-${uploads}`, content_hash: contentHash(bytes) }; return { ...remote }; } };
  const service = c => new ReportService({ repository, source, dropbox, config: { ...config, ...c }, logger: { info() {}, error() {} } });
  return { service, repository, store, source, dropbox, messages, state: () => durable, uploads: () => uploads, downloads: () => downloads, metadataCalls: () => metadataCalls, setRemote: v => { remote = v; } };
}

test("XLSX legible con columnas y datos", () => {
  assert.equal(validateReport(excel(), config).rows, 1);
});
test("rechaza CSV renombrado, XLS, ZIP truncado, columnas ausentes, filas incompletas, vacío y errores", () => {
  for (const bytes of [Buffer.from("SKU,URL\n1,test"), excel(undefined, "biff8"), excel(undefined, "xlsm"), excel().subarray(0, -12), excel([["Otro"], [1]]), excel([["SKU", "URL"], [1, ""]]), excel([["SKU", "URL"]]), excel([["SKU", "URL"], [1, { t: "e", v: 7 }]])]) {
    assert.throws(() => validateReport(bytes, config), /REPORT_/);
  }
});
test("rechaza CRC alterado, fórmulas y límite de tamaño", () => {
  const corrupt = Buffer.from(excel()); corrupt[100] ^= 1;
  assert.throws(() => validateReport(corrupt, config));
  assert.throws(() => validateReport(excel([["SKU", "URL"], [1, { t: "s", f: '"url"', v: "url" }]]), config));
  assert.throws(() => validateReport(excel(), { ...config, maxBytes: 10 }));
});
test("duplica correo y contenido: persiste entre instancias sin repetir carga", async () => {
  const f = fixture([mail("1", "2026-11-02T00:00:00Z")]);
  await f.service().run(); await f.service().run();
  f.messages.push(mail("2", "2026-11-03T00:00:00Z"));
  await f.service().run();
  assert.equal(f.uploads(), 1);
  assert.equal(f.state().watermark, "2026-11-03T00:00:00.000Z");
  assert.equal(Object.keys(f.state().processed).length, 2);
});
test("ordena todas las páginas antes de procesar y descarta antiguos tardíos", async () => {
  const old = mail("old", "2026-11-02T00:00:00Z");
  const newer = mail("new", "2026-11-03T00:00:00Z", excel([["SKU", "URL"], [2, "https://example.test/2"]]));
  const f = fixture([newer, old]);
  f.source.list = async ({ cursor }) => cursor === null ? { messages: [newer], cursor: "page2", hasMore: true } : { messages: [old], cursor: "done", hasMore: false };
  await f.service().run(); assert.equal(f.uploads(), 2);
  f.messages.push(mail("late", "2026-11-01T12:00:00Z"));
  f.source.list = async () => ({ messages: f.messages, cursor: "done2", hasMore: false });
  await f.service().run(); assert.equal(f.uploads(), 2);
  assert.ok(Object.values(f.state().processed).some(p => p.status === "out_of_order"));
});
test("adjunto inválido conserva último válido; no descarga remitente/asunto/nombre ajenos", async () => {
  const bad = mail("bad", "2026-11-02T00:00:00Z", Buffer.from("invalid file"));
  const other = mail("other", "2026-11-03T00:00:00Z"); other.sender = "other@example.test";
  const wrongSubject = { ...other, sender: config.sender, subject: "Otro" };
  const wrongName = mail("name", "2026-11-03T00:00:00Z"); wrongName.attachments[0].name = "otro.xlsx";
  const f = fixture([bad, other, wrongSubject, wrongName]); await f.service().run();
  assert.equal(f.uploads(), 0); assert.equal(f.downloads(), 1); assert.equal(f.state().rev, "baseline");
});
test("dry-run valida sin Dropbox ni cambios persistentes; después se puede publicar", async () => {
  const f = fixture([mail("1", "2026-11-02T00:00:00Z")]);
  const result = await f.service({ dryRun: true }).run();
  assert.equal(result.results[0].status, "validated");
  assert.equal(result.results[0].reportAt, "2026-11-02T00:00:00.000Z");
  assert.equal(result.results[0].contentHash, contentHash(f.messages[0].buffer));
  assert.equal(f.state(), null); assert.equal(f.uploads(), 0); assert.equal(f.metadataCalls(), 0);
  await f.service().run(); assert.equal(f.uploads(), 1);
});
test("descarga incompleta conserva cursor para reintentar", async () => {
  const m = mail("1", "2026-11-02T00:00:00Z"); m.attachments[0].size++;
  const f = fixture([m]); await assert.rejects(f.service().run(), /REPORT_RUN_FAILED/);
  assert.equal(f.state(), null); assert.equal(f.uploads(), 0);
  m.attachments[0].size--; await f.service().run(); assert.equal(f.uploads(), 1);
});
test("fallo de conexión no adelanta cursor y próxima ejecución recupera", async () => {
  const f = fixture([mail("1", "2026-11-02T00:00:00Z")]);
  const list = f.source.list; f.source.list = async () => { throw new Error("connection failed with secret"); };
  await assert.rejects(f.service().run(), /REPORT_RUN_FAILED/); assert.equal(f.state(), null);
  f.source.list = list; await f.service().run(); assert.equal(f.uploads(), 1);
});
test("retry reintenta 429, 5xx y conexión; no reintenta autenticación ni TLS", async () => {
  for (const error of [{ status: 429 }, { status: 503 }, { code: "ECONNRESET" }]) {
    let calls = 0;
    assert.equal(await retry(async () => { if (++calls < 3) throw error; return "ok"; }, { sleep: async () => {} }), "ok");
    assert.equal(calls, 3);
  }
  for (const error of [{ status: 401 }, { code: "CERT_HAS_EXPIRED" }]) {
    let calls = 0;
    await assert.rejects(retry(async () => { calls++; throw Object.assign(new Error("private"), error); }, { sleep: async () => {} }));
    assert.equal(calls, 1);
  }
});
test("recupera caída tras commit remoto sin otra carga", async () => {
  const f = fixture([mail("1", "2026-11-02T00:00:00Z")]);
  const save = f.store.save; let failed = false;
  f.store.save = async state => { if (state.watermark.includes("11-02") && !state.pending && !failed) { failed = true; throw new Error("db offline"); } return save(state); };
  await assert.rejects(f.service().run()); assert.ok(f.state().pending); assert.equal(f.uploads(), 1);
  await f.service().run(); assert.equal(f.uploads(), 1); assert.equal(f.state().pending, undefined); assert.equal(f.state().cursor, "next");
});
test("fallo antes de carga conserva intención y permite repetir", async () => {
  const f = fixture([mail("1", "2026-11-02T00:00:00Z")]);
  const upload = f.dropbox.upload; f.dropbox.upload = async () => { throw new Error("offline"); };
  await assert.rejects(f.service().run()); assert.ok(f.state().pending); assert.equal(f.state().cursor, null);
  f.dropbox.upload = upload; await f.service().run(); assert.equal(f.uploads(), 1);
});

test("recupera intención pendiente antes de procesar un correo antiguo llegado entre ejecuciones", async () => {
  const f = fixture([mail("pending", "2026-11-04T00:00:00Z")]);
  const upload = f.dropbox.upload; f.dropbox.upload = async () => { throw new Error("offline"); };
  await assert.rejects(f.service().run());
  f.messages.unshift(mail("late", "2026-11-02T00:00:00Z", excel([["SKU", "URL"], [2, "https://example.test/2"]])));
  f.dropbox.upload = upload;
  await f.service().run();
  assert.equal(f.uploads(), 1);
  assert.equal(f.state().watermark, "2026-11-04T00:00:00.000Z");
  assert.ok(Object.values(f.state().processed).some(item => item.status === "out_of_order"));
});
test("no sobrescribe cambios externos de Dropbox", async () => {
  const f = fixture([mail("1", "2026-11-02T00:00:00Z")]);
  f.setRemote({ rev: "external", content_hash: "external" });
  await assert.rejects(f.service().run()); assert.equal(f.uploads(), 0);
});
test("ejecuciones simultáneas se omiten", async () => {
  const f = fixture(); let resume;
  f.source.list = () => new Promise(resolve => { resume = () => resolve({ messages: [], cursor: "done", hasMore: false }); });
  const service = f.service(); const first = service.run();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await service.run(), { skipped: "running" });
  assert.deepEqual(await f.service().run(), { skipped: "locked" }); resume(); await first;
});
test("SDK Dropbox usa revisión estricta y nunca autorename", async () => {
  let args;
  const dbx = new ReportDropbox({ client: { async filesUpload(input) { args = input; return { result: { rev: "next" } }; } } });
  await dbx.upload(TARGET_PATH, excel(), "expected");
  assert.deepEqual(args.mode, { ".tag": "update", update: "expected" }); assert.equal(args.autorename, false); assert.equal(args.strict_conflict, true);
});
test("repositorio PostgreSQL bloquea, persiste y libera aun ante error", async () => {
  const calls = []; const client = new EventEmitter(); let released = false;
  client.query = async (sql, values) => { calls.push({ sql, values }); return { rows: [{ locked: true, state: { cursor: "saved" } }] }; };
  client.release = () => { released = true; };
  const repository = new ReportRepository({ async connect() { return client; } });
  await assert.rejects(repository.withLock(async store => { assert.equal((await store.load()).cursor, "saved"); await store.save({ cursor: "next" }); throw new Error("fail"); }));
  assert.ok(calls[0].sql.includes("pg_try_advisory_lock")); assert.ok(calls.at(-1).sql.includes("pg_advisory_unlock")); assert.ok(released);
});
test("sin datos Exchange falla cerrado y scheduler está desactivado por defecto", async () => {
  assert.throws(() => readConfig({ EXCEL_URLS_PATH: TARGET_PATH }), /MISSING_PRODUCTOS_WEB_EXCHANGE_VERSION/);
  assert.equal(await startReportScheduler({}), null);
  assert.equal(await startReportScheduler({ PRODUCTOS_WEB_ENABLED: "true", NODE_APP_INSTANCE: "1" }), null);
  await assert.rejects(startReportScheduler({ PRODUCTOS_WEB_ENABLED: "true", NODE_TLS_REJECT_UNAUTHORIZED: "0" }), /REPORT_TLS_REQUIRED/);
});

test("página posterior fallida no descarga ni adelanta cursor", async () => {
  const f = fixture([mail("1", "2026-11-02T00:00:00Z")]);
  f.source.list = async ({ cursor }) => {
    if (cursor) throw new Error("connection failed");
    return { messages: f.messages, cursor: "page2", hasMore: true };
  };
  await assert.rejects(f.service().run());
  assert.equal(f.state(), null); assert.equal(f.downloads(), 0); assert.equal(f.uploads(), 0);
});
test("adjuntos ambiguos y fechas sin zona fallan antes de descargar", async () => {
  for (const ambiguous of [true, false]) {
    const m = mail("1", ambiguous ? "2026-11-02T00:00:00Z" : "2026-11-02");
    if (ambiguous) m.attachments.push({ ...m.attachments[0], id: "another" });
    const f = fixture([m]); await assert.rejects(f.service().run()); assert.equal(f.downloads(), 0); assert.equal(f.state(), null);
  }
});
test("una respuesta perdida tras carga se reconcilia en el retry", async () => {
  const f = fixture([mail("1", "2026-11-02T00:00:00Z")]);
  const upload = f.dropbox.upload;
  f.dropbox.upload = async (...args) => { await upload(...args); throw Object.assign(new Error("response lost"), { code: "ECONNRESET" }); };
  await f.service().run(); assert.equal(f.uploads(), 1); assert.equal(f.state().pending, undefined);
});
test("binding distinto no reutiliza cursor de otra carpeta", async () => {
  const f = fixture(); await f.service().run();
  await assert.rejects(f.service({ folder: "other" }).run()); assert.equal(f.downloads(), 0);
});
test("pérdida de sesión PostgreSQL invalida el guard y descarta cliente", async () => {
  const client = new EventEmitter(); let released;
  client.query = async () => ({ rows: [{ locked: true }] }); client.release = destroy => { released = destroy; };
  const repository = new ReportRepository({ async connect() { return client; } });
  await assert.rejects(repository.withLock(async store => { client.emit("error", new Error("lost")); store.guard(); }), /REPORT_LOCK_LOST/);
  assert.equal(released, true);
});

test("endpoint Exchange exige HTTPS sin credenciales incrustadas", () => {
  const env = {
    EXCEL_URLS_PATH: TARGET_PATH,
    PRODUCTOS_WEB_EXCHANGE_VERSION: "2019", PRODUCTOS_WEB_EXCHANGE_PROTOCOL: "ews",
    PRODUCTOS_WEB_EXCHANGE_URL: "https://exchange.example.test/ews/exchange.asmx",
    PRODUCTOS_WEB_EXCHANGE_AUTH: "test", PRODUCTOS_WEB_MAILBOX: "reports@example.test",
    PRODUCTOS_WEB_FOLDER: "Inbox", PRODUCTOS_WEB_SENDER: "erp@example.test",
    PRODUCTOS_WEB_SUBJECT: "Reporte2", PRODUCTOS_WEB_ATTACHMENT: "Reporte2.xlsx",
    PRODUCTOS_WEB_SHEET: "Productos", PRODUCTOS_WEB_COLUMNS: '["SKU","URL"]',
    PRODUCTOS_WEB_INITIAL_REPORT_AT: "2026-11-01T00:00:00Z",
    PRODUCTOS_WEB_INITIAL_DROPBOX_REV: "baseline", PRODUCTOS_WEB_REFERENCE_SHA256: "a".repeat(64),
  };
  assert.equal(readConfig(env).endpoint, env.PRODUCTOS_WEB_EXCHANGE_URL);
  for (const endpoint of ["http://exchange.example.test/ews/exchange.asmx", "https://user:secret@exchange.example.test/ews/exchange.asmx", "not-a-url", "https://exchange.example.test/ews/exchange.asmx?token=private"]) {
    assert.throws(() => readConfig({ ...env, PRODUCTOS_WEB_EXCHANGE_URL: endpoint }), /REPORT_EXCHANGE_URL_INVALID/);
  }
});
