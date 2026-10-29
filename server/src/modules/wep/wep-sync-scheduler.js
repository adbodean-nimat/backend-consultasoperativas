import cron from "node-cron";
import wepSyncService from "./wep-sync.service.js";
import wepMonitorRepository from "./wep-monitor.repository.js";

const TIMEZONE = "America/Argentina/Buenos_Aires";

function integer(env, key, fallback, min, max) {
  const value = env[key] === undefined || env[key] === "" ? fallback : Number(env[key]);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${key} debe ser un entero entre ${min} y ${max}`);
  }
  return value;
}

export function buildWepSyncSchedule(env = process.env) {
  const enabled = String(env.WEP_SYNC_ENABLED ?? "false").toLowerCase();
  if (!["true", "false"].includes(enabled)) throw new Error("WEP_SYNC_ENABLED debe ser true o false");
  const expression = env.WEP_SYNC_CRON || "*/5 * * * *";
  if (!cron.validate(expression)) throw new Error("WEP_SYNC_CRON inválido");
  return {
    enabled: enabled === "true",
    expression,
    daysBack: integer(env, "WEP_SYNC_DAYS_BACK", 0, 0, 30),
    daysAhead: integer(env, "WEP_SYNC_DAYS_AHEAD", 7, 0, 90),
    timezone: TIMEZONE,
  };
}

export function wepSyncWindow(now, config) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const date = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const midnight = Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day));
  const shift = (days) => new Date(midnight + days * 86400000).toISOString().slice(0, 10);
  return { fechaDesde: shift(-config.daysBack), fechaHasta: shift(config.daysAhead), vehiculo: null, vuelta: null };
}

export class WepSyncScheduler {
  constructor({ service = wepSyncService, env = process.env, scheduler = cron, logger = console, now = () => new Date(), monitor = wepMonitorRepository } = {}) {
    Object.assign(this, { service, env, scheduler, logger, now, monitor });
    this.task = null;
    this.running = false;
  }

  async execute() {
    if (!this.task || this.running) return;
    this.running = true;
    const runId = await this.monitor.start("SYNC");
    try {
      const result = await this.service.synchronize(wepSyncWindow(this.now(), this.config));
      this.logger.info?.("[WEP AUTO SYNC] Resultado", {
        skipped: result.skipped || null,
        sourceRows: result.sourceRows,
        entregas: result.entregas,
        filasOmitidas: result.filasOmitidas,
      });
      await this.monitor.finish(runId, result.skipped ? "OMITIDA" : "OK", {
        filasOrigen: result.sourceRows ?? 0, procesadas: result.entregas?.procesadas ?? 0, omitidas: result.filasOmitidas ?? 0,
      });
    } catch {
      // El servicio registra el error saneado. No imprimir conexiones ni datos ERP aquí.
      this.logger.error?.("[WEP AUTO SYNC] Ejecución fallida; se reintentará en el próximo horario");
      await this.monitor.finish(runId, "ERROR");
    } finally {
      this.running = false;
    }
  }

  start() {
    if (this.task) return;
    this.config = buildWepSyncSchedule(this.env);
    if (!this.config.enabled || ![undefined, null, "", "0"].includes(this.env.NODE_APP_INSTANCE)) return;
    this.task = this.scheduler.createTask(this.config.expression, () => this.execute(), {
      timezone: this.config.timezone, noOverlap: true, name: "wep-erp-sync",
    });
    this.task.start();
    this.logger.info?.("[WEP AUTO SYNC] Programado", this.config);
  }

  stop() {
    this.task?.stop();
    this.task?.destroy();
    this.task = null;
  }
}

export default new WepSyncScheduler();
