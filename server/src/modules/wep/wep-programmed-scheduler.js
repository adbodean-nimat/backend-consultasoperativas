import cron from "node-cron";
import wepSyncService from "./wep-sync.service.js";
import wepMonitorRepository from "./wep-monitor.repository.js";
import wepProgrammedNotificationsService, { getBusinessDate, WEP_BUSINESS_TIME_ZONE } from "./wep-programmed-notifications.service.js";

function boolean(env, key, fallback) {
  const value = String(env[key] ?? fallback).toLowerCase();
  if (!["true", "false"].includes(value)) throw new Error(`${key} debe ser true o false`);
  return value === "true";
}

function minutes(value, key) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${key} debe tener formato HH:mm`);
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function buildWepProgrammedSchedule(env = process.env) {
  const expression = env.WEP_PROGRAMMED_CRON || "*/5 * * * *";
  if (!cron.validate(expression)) throw new Error("WEP_PROGRAMMED_CRON inválido");
  const start = minutes(env.WEP_PROGRAMMED_START || "06:00", "WEP_PROGRAMMED_START");
  const end = minutes(env.WEP_PROGRAMMED_END || "21:00", "WEP_PROGRAMMED_END");
  if (start >= end) throw new Error("La hora de inicio debe ser anterior a la hora de fin");
  return {
    enabled: boolean(env, "WEP_PROGRAMMED_ENABLED", false),
    dryRun: boolean(env, "WEP_PROGRAMMED_DRY_RUN", true),
    expression, start, end, timezone: WEP_BUSINESS_TIME_ZONE,
  };
}

export class WepProgrammedScheduler {
  constructor({ env = process.env, syncService = wepSyncService,
    notificationsService = wepProgrammedNotificationsService,
    scheduler = cron, logger = console, now = () => new Date(), monitor = wepMonitorRepository } = {}) {
    Object.assign(this, { env, syncService, notificationsService, scheduler, logger, now, monitor });
    this.task = null;
    this.running = false;
  }

  async execute() {
    if (!this.task || this.running) return;
    const now = this.now();
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: this.config.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const current = Number(values.hour) * 60 + Number(values.minute);
    if (current < this.config.start || current >= this.config.end) return;
    this.running = true;
    const runId = await this.monitor.start("PROGRAMADA");
    try {
      const fecha = getBusinessDate(now);
      const sync = await this.syncService.synchronize({ fechaDesde: fecha, fechaHasta: fecha, vehiculo: null, vuelta: null });
      // Una importación omitida o fallida no habilita el envío sobre datos anteriores.
      if (!this.task || sync.skipped || sync.ok !== true) {
        await this.monitor.finish(runId, "OMITIDA");
        return;
      }
      const result = await this.notificationsService.processProgrammedDeliveryNotifications({ fecha, dryRun: this.config.dryRun });
      this.logger.info?.("[WEP AUTO PROGRAMADA] Resultado", { fecha, dryRun: this.config.dryRun, resumen: result.resumen });
      await this.monitor.finish(runId, result.resumen?.errores > 0 ? "ERROR" : this.config.dryRun ? "SIMULACION" : "OK", result.resumen);
    } catch {
      // No exponer respuestas de Meta, credenciales ni datos de clientes.
      this.logger.error?.("[WEP AUTO PROGRAMADA] Falló la ejecución; revisar sincronización y notificaciones WEP");
      await this.monitor.finish(runId, "ERROR");
    } finally {
      this.running = false;
    }
  }

  start() {
    if (this.task) return;
    this.config = buildWepProgrammedSchedule(this.env);
    if (!this.config.enabled || ![undefined, null, "", "0"].includes(this.env.NODE_APP_INSTANCE)) return;
    this.task = this.scheduler.createTask(this.config.expression, () => this.execute(), {
      timezone: this.config.timezone, noOverlap: true, name: "wep-programmed-notifications",
    });
    this.task.start();
    this.logger.info?.("[WEP AUTO PROGRAMADA] Programado", { cron: this.config.expression, dryRun: this.config.dryRun });
  }

  stop() {
    this.task?.stop();
    this.task?.destroy();
    this.task = null;
  }
}

export default new WepProgrammedScheduler();
