import "dotenv/config";
import { buildService } from "./report.scheduler.js";
import { fault, attachmentDiagnostic } from "./report.config.js";

// Explicit single-run maintenance CLI. Importing this file never starts the API.
try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--dry-run", "--publish"].includes(args[0])) throw fault("REPORT_USAGE_DRY_RUN_OR_PUBLISH");
  const service = await buildService({ ...process.env, PRODUCTOS_WEB_DRY_RUN: args[0] === "--publish" ? "false" : "true" });
  console.info(JSON.stringify(await service.run()));
} catch (error) {
  const code = typeof error?.code === "string" && /^(REPORT_[A-Z0-9_]+|MISSING_PRODUCTOS_WEB_[A-Z0-9_]+)$/.test(error.code) ? error.code : "REPORT_RUN_FAILED";
  console.error(JSON.stringify({ ok: false, code, ...(error?.code === "REPORT_RUN_FAILED" && error.detail ? { detail: error.detail, ...attachmentDiagnostic(error) } : {}) }));
  process.exitCode = 1;
} finally {
  const { pool } = await import("../../../dboperacion_pg.js");
  await pool.end();
}
