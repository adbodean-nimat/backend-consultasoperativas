import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fault, attachmentDiagnostic } from "./report.config.js";

const WORKER = fileURLToPath(new URL("./ews_worker.py", import.meta.url));
const MAX_OUTPUT = 30 * 1024 * 1024;

export function runExchangeWorker(python, request, { spawnProcess = spawn, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    // Explicit credentials go through stdin, never command-line arguments or logs.
    const env = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "LANG", "LC_ALL", "HOME", "USERPROFILE"]
      .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
    Object.assign(env, { PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1", LM_COMPAT_LEVEL: "3" });
    const child = spawnProcess(python, ["-B", WORKER], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env });
    let chunks = [], bytes = 0, settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chunks = [];
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(Object.assign(fault("REPORT_EXCHANGE_WORKER_TIMEOUT"), { status: 503 }));
    }, timeoutMs);
    child.on("error", () => finish(fault("REPORT_EXCHANGE_WORKER_START_FAILED")));
    child.stdin.on("error", () => {});
    child.stderr.on("data", () => {}); // Never forward raw provider/Python diagnostics.
    child.stdout.on("data", chunk => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT) {
        child.kill(); finish(fault("REPORT_EXCHANGE_RESPONSE_LIMIT")); return;
      }
      if (!settled) chunks.push(chunk);
    });
    child.on("close", code => {
      if (settled) return;
      let result;
      try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { finish(fault("REPORT_EXCHANGE_RESPONSE_INVALID")); return; }
      if (code !== 0 || result.ok !== true) {
        const safeCode = typeof result.code === "string" && /^(EWS_[A-Z0-9_]{1,80}|Error[A-Za-z]{1,70})$/.test(result.code) ? result.code : "REPORT_EXCHANGE_FAILED";
        const error = fault(safeCode);
        if (safeCode === "EWS_ATTACHMENT_INCOMPLETE") Object.assign(error, attachmentDiagnostic(result));
        if (result.retryable === true) error.status = result.status === 429 ? 429 : 503;
        finish(error); return;
      }
      finish(null, result.result);
    });
    child.stdin.end(JSON.stringify(request));
  });
}

export function createExchangeSource(config, { env = process.env, runner = runExchangeWorker } = {}) {
  if (config.protocol !== "ews" || config.auth !== "ntlm") throw fault("REPORT_EXCHANGE_PROTOCOL_UNSUPPORTED");
  if (config.ordering !== "message_sent" || !config.freshReportPerMessageConfirmed) throw fault("REPORT_ORDERING_NOT_CONFIRMED");
  const required = name => { if (!env[name]) throw fault(`MISSING_${name}`); return env[name]; };
  const python = required("PRODUCTOS_WEB_PYTHON");
  const names = ["PRODUCTOS_WEB_EXCHANGE_DOMAIN", "PRODUCTOS_WEB_EXCHANGE_USER", "PRODUCTOS_WEB_EXCHANGE_PASSWORD"];
  const workerEnv = Object.fromEntries(names.map(name => [name, required(name)]));
  Object.assign(workerEnv, {
    PRODUCTOS_WEB_EXCHANGE_URL: config.endpoint, PRODUCTOS_WEB_EXCHANGE_PROTOCOL: config.protocol,
    PRODUCTOS_WEB_EXCHANGE_AUTH: config.auth, PRODUCTOS_WEB_MAILBOX: config.mailbox,
    PRODUCTOS_WEB_EXCHANGE_CA_FILE: env.PRODUCTOS_WEB_EXCHANGE_CA_FILE || "",
  });
  const requestConfig = { env: workerEnv, subject: config.subject, sender: config.sender,
    filename: config.filename, folder: config.folder, ordering: config.ordering,
    freshReportPerMessageConfirmed: config.freshReportPerMessageConfirmed };
  return {
    async list({ cursor, mailbox, folder }) {
      if (mailbox !== config.mailbox || folder !== config.folder) throw fault("REPORT_EXCHANGE_FOLDER_MISMATCH");
      const page = await runner(python, { action: "list", config: requestConfig, cursor });
      if (!page || !Array.isArray(page.messages) || typeof page.cursor !== "string" || page.cursor.length > 2 * 1024 * 1024 || typeof page.hasMore !== "boolean") throw fault("REPORT_EXCHANGE_RESPONSE_INVALID");
      return page;
    },
    async download({ messageId, attachmentId, maxBytes }) {
      const response = await runner(python, { action: "download", config: requestConfig, messageId, attachmentId, maxBytes });
      if (typeof response?.base64 !== "string" || response.base64.length % 4 !== 0 || response.base64.length > Math.ceil(maxBytes / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(response.base64)) throw fault("REPORT_EXCHANGE_ATTACHMENT_INVALID");
      const buffer = Buffer.from(response.base64, "base64");
      if (!Number.isSafeInteger(response.byteLength) || response.byteLength !== buffer.length || !buffer.length || buffer.length > maxBytes || buffer.toString("base64") !== response.base64) throw fault("REPORT_EXCHANGE_ATTACHMENT_INVALID");
      return buffer;
    },
  };
}
