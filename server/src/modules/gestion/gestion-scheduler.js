import cron from "node-cron";
import {
  authPool,
  ensureGestionScheduleConfiguration,
  getConfigurationByKey,
} from "./gestion-auth.repository.js";
import { validateConfiguration } from "./gestion-auth.validator.js";
import { synchronizeAutomaticosScheduled } from "./gestion.service.js";
import {
  DEFAULT_GESTION_SCHEDULE,
  GESTION_SCHEDULE_ADVISORY_LOCK_KEY,
  GESTION_SCHEDULE_CONFIG_KEY,
  GESTION_SCHEDULE_REFRESH_MS,
  GESTION_SCHEDULE_SYSTEM_USER,
} from "./gestion-scheduler.constants.js";

export function isGestionSchedulerProcess(env = process.env) {
  const instance = env.NODE_APP_INSTANCE;
  return instance === undefined || instance === null || instance === "" || String(instance) === "0";
}

export function dateInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function getGestionScheduleConfig(pool = authPool) {
  await ensureGestionScheduleConfiguration(
    pool,
    GESTION_SCHEDULE_CONFIG_KEY,
    DEFAULT_GESTION_SCHEDULE,
  );
  const row = await getConfigurationByKey(pool, GESTION_SCHEDULE_CONFIG_KEY);
  const value = validateConfiguration(GESTION_SCHEDULE_CONFIG_KEY, { valor: row?.valor });
  return { ...value, updatedAt: row.actualizado_en ?? null };
}

export class GestionScheduler {
  constructor({
    sync = synchronizeAutomaticosScheduled,
    configLoader = getGestionScheduleConfig,
    pool = authPool,
    cronLibrary = cron,
    refreshMs = GESTION_SCHEDULE_REFRESH_MS,
    enabledForProcess = isGestionSchedulerProcess(),
    now = () => new Date(),
  } = {}) {
    this.sync = sync;
    this.configLoader = configLoader;
    this.pool = pool;
    this.cronLibrary = cronLibrary;
    this.refreshMs = refreshMs;
    this.enabledForProcess = enabledForProcess;
    this.now = now;
    this.task = null;
    this.timer = null;
    this.signature = null;
    this.config = null;
    this.localRunning = false;
  }

  async execute() {
    if (this.localRunning || !this.config?.activo) return { skipped: true };
    this.localRunning = true;
    let client = null;
    let locked = false;
    try {
      client = await this.pool.connect();
      const result = await client.query(
        "SELECT pg_try_advisory_lock($1) AS adquirido",
        [GESTION_SCHEDULE_ADVISORY_LOCK_KEY],
      );
      locked = result.rows[0]?.adquirido === true;
      if (!locked) {
        console.info("[gestion-cron] Ejecución omitida: otra instancia posee el lock");
        return { skipped: true };
      }
      const fecha = dateInTimezone(this.now(), this.config.timezone);
      const data = await this.sync(fecha, { username: GESTION_SCHEDULE_SYSTEM_USER });
      return { skipped: false, fecha, data };
    } catch (error) {
      console.error("[gestion-cron] Falló la sincronización programada", {
        code: error?.code ?? "GESTION_SCHEDULE_ERROR",
      });
      throw error;
    } finally {
      if (locked) {
        await client.query("SELECT pg_advisory_unlock($1)", [GESTION_SCHEDULE_ADVISORY_LOCK_KEY])
          .catch((error) => console.error("[gestion-cron] No se pudo liberar el lock", { code: error?.code }));
      }
      client?.release();
      this.localRunning = false;
    }
  }

  async refresh() {
    if (!this.enabledForProcess) return this.status();
    try {
      const config = await this.configLoader();
      const signature = `${config.activo}|${config.cron}|${config.timezone}|${config.updatedAt ?? ""}`;
      if (signature === this.signature) return this.status();
      if (this.task) {
        this.task.stop();
        this.task.destroy();
        this.task = null;
      }
      this.signature = signature;
      this.config = config;
      if (config.activo) {
        this.task = this.cronLibrary.createTask(
          config.cron,
          () => this.execute(),
          { timezone: config.timezone, noOverlap: true, name: "gestion-financiera-sync" },
        );
        this.task.start();
      }
      console.info("[gestion-cron] Programación cargada", {
        activo: config.activo,
        cron: config.cron,
        timezone: config.timezone,
      });
      return this.status();
    } catch (error) {
      if (this.task) {
        this.task.stop();
        this.task.destroy();
        this.task = null;
      }
      console.error("[gestion-cron] No se pudo cargar la programación", {
        code: error?.code ?? "GESTION_SCHEDULE_CONFIG_ERROR",
      });
      return this.status();
    }
  }

  async start() {
    if (!this.enabledForProcess) return this.status();
    await this.refresh();
    if (!this.timer) {
      this.timer = setInterval(() => this.refresh(), this.refreshMs);
      this.timer.unref?.();
    }
    return this.status();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.task) {
      this.task.stop();
      this.task.destroy();
    }
    this.timer = null;
    this.task = null;
    this.signature = null;
  }

  status() {
    return {
      running: Boolean(this.task),
      nextRun: this.task?.getNextRun?.() ?? null,
      localExecutionRunning: this.localRunning,
      enabledForProcess: this.enabledForProcess,
      config: this.config,
    };
  }
}

export default new GestionScheduler();
