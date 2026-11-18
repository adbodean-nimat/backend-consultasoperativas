import cron from "node-cron";
import { readConfig, fault } from "./report.config.js";
import { createExchangeSource } from "./report.exchange.js";
import { ReportService } from "./report.service.js";
import { ReportRepository } from "./report.repository.js";
import { ReportDropbox } from "./report.dropbox.js";

export async function buildService(env = process.env) {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw fault("REPORT_TLS_REQUIRED");
  const config = readConfig(env);
  const source = createExchangeSource(config, { env });
  const { pool } = await import("../../../dboperacion_pg.js");
  return new ReportService({ config, source, repository: new ReportRepository(pool),
    dropbox: config.dryRun ? null : new ReportDropbox({ env }) });
}

export async function startReportScheduler(env = process.env) {
  if (env.PRODUCTOS_WEB_ENABLED !== "true" || ![undefined, "", "0"].includes(env.NODE_APP_INSTANCE)) return null;
  const expression = env.PRODUCTOS_WEB_CRON || "*/5 * * * *";
  if (!cron.validate(expression)) throw fault("REPORT_CRON_INVALID");
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw fault("REPORT_TLS_REQUIRED");
  const service = await buildService(env);
  const task = cron.createTask(expression, () => service.run().catch(() => {}), {
    timezone: "America/Argentina/Buenos_Aires", noOverlap: true, name: "productos-web-report",
  });
  task.start();
  return task;
}
