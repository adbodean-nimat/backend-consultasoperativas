export const TARGET_PATH = "/NIMAT/Productos Nimat Urls.xlsx";
export function fault(code) { return Object.assign(new Error(code), { code }); }
export function readConfig(env = process.env) {
  const required = (name) => { if (!env[name]?.trim()) throw fault(`MISSING_${name}`); return env[name].trim(); };
  if (env.EXCEL_URLS_PATH !== TARGET_PATH) throw fault("REPORT_DESTINATION_MISMATCH");
  const config = {
    path: TARGET_PATH,
    version: required("PRODUCTOS_WEB_EXCHANGE_VERSION"),
    protocol: required("PRODUCTOS_WEB_EXCHANGE_PROTOCOL"),
    endpoint: required("PRODUCTOS_WEB_EXCHANGE_URL"),
    auth: required("PRODUCTOS_WEB_EXCHANGE_AUTH"),
    mailbox: required("PRODUCTOS_WEB_MAILBOX"), folder: required("PRODUCTOS_WEB_FOLDER"),
    sender: required("PRODUCTOS_WEB_SENDER").toLowerCase(),
    subject: required("PRODUCTOS_WEB_SUBJECT"), filename: required("PRODUCTOS_WEB_ATTACHMENT"),
    sheet: required("PRODUCTOS_WEB_SHEET"),
    columns: JSON.parse(required("PRODUCTOS_WEB_COLUMNS")),
    initialDate: required("PRODUCTOS_WEB_INITIAL_REPORT_AT"),
    initialRev: required("PRODUCTOS_WEB_INITIAL_DROPBOX_REV"),
    referenceSha256: required("PRODUCTOS_WEB_REFERENCE_SHA256"),
    maxBytes: 20 * 1024 * 1024,
    dryRun: env.PRODUCTOS_WEB_DRY_RUN !== "false",
  };
  let endpoint;
  try { endpoint = new URL(config.endpoint); } catch { throw fault("REPORT_EXCHANGE_URL_INVALID"); }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash || endpoint.search) throw fault("REPORT_EXCHANGE_URL_INVALID");
  if (!Array.isArray(config.columns) || !config.columns.length || config.columns.some(c => typeof c !== "string" || !c.trim()) || new Set(config.columns).size !== config.columns.length) throw fault("REPORT_COLUMNS_CONFIG");
  if (!Number.isFinite(Date.parse(config.initialDate)) || !config.filename.endsWith(".xlsx")) throw fault("REPORT_CONFIG_INVALID");
  if (!/^[a-f0-9]{64}$/.test(config.referenceSha256)) throw fault("REPORT_REFERENCE_NOT_CONFIRMED");
  return config;
}
