import "dotenv/config";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateReport } from "./report.validator.js";
import { fault } from "./report.config.js";

// Local validation only: never connects to Exchange, PostgreSQL or Dropbox.
try {
  if (process.argv[2] !== "--validate" || !process.argv[3]) throw fault("REPORT_USAGE_VALIDATE_FILE");
  const filename = process.argv[3];
  const maxBytes = 20 * 1024 * 1024;
  if ((await fs.stat(filename)).size > maxBytes) throw fault("REPORT_SIZE_OR_FORMAT");
  const buffer = await fs.readFile(filename);
  const config = { maxBytes, sheet: process.env.PRODUCTOS_WEB_SHEET, columns: JSON.parse(process.env.PRODUCTOS_WEB_COLUMNS || "[]"),
    requiredValues: JSON.parse(process.env.PRODUCTOS_WEB_REQUIRED_VALUES || process.env.PRODUCTOS_WEB_COLUMNS || "[]"),
    profile: process.env.PRODUCTOS_WEB_SCHEMA_PROFILE || "", minRows: Number(process.env.PRODUCTOS_WEB_MIN_ROWS || 1) };
  if (!config.sheet || !config.columns.length) throw fault("REPORT_REFERENCE_SCHEMA_REQUIRED");
  const result = validateReport(buffer, config);
  console.info(JSON.stringify({ dryRun: true, ...result, sha256: createHash("sha256").update(buffer).digest("hex") }));
} catch {
  console.error("No se pudo validar. Uso: npm run report:validate -- --validate <archivo.xlsx>. Configurar PRODUCTOS_WEB_SHEET y PRODUCTOS_WEB_COLUMNS según el reporte real.");
  process.exitCode = 1;
}
