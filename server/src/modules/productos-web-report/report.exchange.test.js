import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createExchangeSource, runExchangeWorker } from "./report.exchange.js";
import { PRODUCTOS_WEB_PROFILE as profile } from "./report.profile.js";
import { validateReport } from "./report.validator.js";
import xlsx from "xlsx";

const config = { protocol: "ews", auth: "ntlm", endpoint: "https://exchange.example.test:8443/ews/exchange.asmx",
  ordering: "message_sent", freshReportPerMessageConfirmed: true, mailbox: "mail@example.test",
  folder: "Bandeja de entrada\\Reportes", sender: "erp@example.test", subject: "Reporte2", filename: "Reporte2.xlsx" };
const env = { PRODUCTOS_WEB_PYTHON: "/venv/bin/python", PRODUCTOS_WEB_EXCHANGE_DOMAIN: "TEST",
  PRODUCTOS_WEB_EXCHANGE_USER: "svc_prodweb", PRODUCTOS_WEB_EXCHANGE_PASSWORD: "private-secret" };

function processFixture(response, { exitCode = 0, stderr = "" } = {}) {
  let options, args, command, input = "", killed = false;
  const spawnProcess = (c, a, o) => {
    command = c; args = a; options = o;
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.stdin.on("data", bytes => { input += bytes.toString(); });
    child.kill = () => { killed = true; };
    child.stdin.on("finish", () => queueMicrotask(() => {
      if (response === null) return;
      child.stderr.write(stderr); child.stdout.write(response);
      child.emit("close", exitCode);
    }));
    return child;
  };
  return { spawnProcess, state: () => ({ options, args, command, input, killed }) };
}

test("bridge sends credentials only through stdin and suppresses raw stderr", async () => {
  const p = processFixture(JSON.stringify({ ok: true, result: { cursor: "next" } }), { stderr: "private-secret raw request" });
  const request = { config: { password: "private-secret" } };
  assert.deepEqual(await runExchangeWorker("/venv/bin/python", request, { spawnProcess: p.spawnProcess }), { cursor: "next" });
  const state = p.state();
  assert.equal(JSON.parse(state.input).config.password, "private-secret");
  assert.equal(state.options.shell, false); assert.equal(state.options.windowsHide, true);
  assert.ok(!JSON.stringify([state.command, state.args, state.options.env]).includes("private-secret"));
  assert.equal(state.options.env.PRODUCTOS_WEB_EXCHANGE_PASSWORD, undefined);
});
test("bridge returns bounded safe errors, retries only marked transient failures", async () => {
  for (const response of ["not-json private-secret", JSON.stringify({ ok: false, code: "invalid private-secret" })]) {
    const p = processFixture(response, { exitCode: 1 });
    await assert.rejects(runExchangeWorker("python", {}, { spawnProcess: p.spawnProcess }), error => !error.message.includes("private-secret"));
  }
  const p = processFixture(JSON.stringify({ ok: false, code: "ErrorServerBusy", retryable: true, status: 503 }), { exitCode: 1 });
  await assert.rejects(runExchangeWorker("python", {}, { spawnProcess: p.spawnProcess }), error => error.status === 503);
});
test("bridge terminates hung worker and exposes no provider text", async () => {
  const p = processFixture(null);
  await assert.rejects(runExchangeWorker("python", {}, { spawnProcess: p.spawnProcess, timeoutMs: 10 }), /REPORT_EXCHANGE_WORKER_TIMEOUT/);
  assert.equal(p.state().killed, true);
});
test("source preserves cursor and validates configured folder", async () => {
  const calls = [];
  const source = createExchangeSource(config, { env, runner: async (python, request) => {
    calls.push({ python, request }); return { messages: [], cursor: "next", hasMore: false };
  } });
  await source.list({ cursor: "saved", mailbox: config.mailbox, folder: config.folder });
  assert.equal(calls[0].request.cursor, "saved");
  assert.equal(calls[0].request.config.env.PRODUCTOS_WEB_EXCHANGE_PASSWORD, "private-secret");
  await assert.rejects(source.list({ cursor: null, mailbox: "other", folder: config.folder }), /FOLDER_MISMATCH/);
});
test("source requires confirmed ordering and explicit private credentials", () => {
  assert.throws(() => createExchangeSource({ ...config, freshReportPerMessageConfirmed: false }, { env }), /ORDERING_NOT_CONFIRMED/);
  assert.throws(() => createExchangeSource(config, { env: { ...env, PRODUCTOS_WEB_EXCHANGE_PASSWORD: "" } }), /MISSING_PRODUCTOS_WEB_EXCHANGE_PASSWORD/);
});
test("source rejects malformed attachment transport and caps decoded bytes", async () => {
  for (const base64 of ["??", "YWJj\n", "YWJj====", Buffer.alloc(11).toString("base64")]) {
    const source = createExchangeSource(config, { env, runner: async () => ({ base64 }) });
    await assert.rejects(source.download({ messageId: "message", attachmentId: "file", maxBytes: 10 }), /ATTACHMENT_INVALID/);
  }
  const source = createExchangeSource(config, { env, runner: async () => ({ base64: Buffer.from("abc").toString("base64") }) });
  assert.equal((await source.download({ messageId: "message", attachmentId: "file", maxBytes: 10 })).toString(), "abc");
});

const validationConfig = { profile: profile.name, sheet: profile.sheet, columns: profile.columns,
  requiredValues: profile.requiredValues, maxBytes: 20 * 1024 * 1024 };
function workbook(rows) {
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([profile.columns, ...rows]), profile.sheet);
  return xlsx.write(book, { type: "buffer", bookType: "xlsx" });
}
const row = [1, "000123", "Producto", "", "https://www.nimat.com.ar/image.jpg", "https://www.nimat.com.ar/producto", ""];
test("real profile permits observed optional blanks and preserves SKU leading zeros", () => {
  const bytes = workbook([row, [2, "", "Otro", "", row[4], row[5], ""]]);
  assert.equal(validateReport(bytes, validationConfig).rows, 2);
  assert.equal(xlsx.utils.sheet_to_json(xlsx.read(bytes).Sheets[profile.sheet])[0].Sku, "000123");
});
test("real profile rejects missing core values, duplicate IDs, non-text SKU and foreign URLs", () => {
  for (const rows of [[row, row], [[...row.slice(0, 2), "", ...row.slice(3)]],
    [[1, 123, ...row.slice(2)]], [[...row.slice(0, 5), "javascript:alert(1)", ""]],
    [[...row.slice(0, 4), "https://other.example.test/a", row[5], ""]]]) {
    assert.throws(() => validateReport(workbook(rows), validationConfig), /REPORT_/);
  }
});
test("XLSX workbook content type can be declared by Default, as in the real report", () => {
  const zip = xlsx.CFB.read(workbook([row]), { type: "buffer" });
  const types = zip.FileIndex.find(entry => entry.name === "[Content_Types].xml");
  const declaration = types.content.toString().replace(/<Override\b[^>]*PartName="\/xl\/workbook.xml"[^>]*\/>/, "")
    .replace(/(<Default\b[^>]*Extension="xml"[^>]*ContentType=")[^"]+/, '$1application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
  types.content = Buffer.from(declaration); types.size = types.content.length;
  assert.equal(validateReport(xlsx.CFB.write(zip, { type: "buffer", fileType: "zip" }), validationConfig).rows, 1);
});
