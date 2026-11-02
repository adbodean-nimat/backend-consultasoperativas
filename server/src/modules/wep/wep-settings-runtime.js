import { hostname } from "node:os";
import settingsService from "./wep-settings.service.js";
import syncScheduler from "./wep-sync-scheduler.js";
import programmedScheduler from "./wep-programmed-scheduler.js";

export function settingsScheduleEnv(config, env = process.env) {
  return { ...env, WEP_SYNC_ENABLED: String(config.sync.enabled && !config.sync.blocked), WEP_SYNC_CRON: config.sync.cron,
    WEP_SYNC_DAYS_BACK: String(config.sync.daysBack), WEP_SYNC_DAYS_AHEAD: String(config.sync.daysAhead),
    WEP_PROGRAMMED_ENABLED: String(config.programmed.enabled && !config.sync.blocked), WEP_PROGRAMMED_DRY_RUN: String(config.programmed.dryRun),
    WEP_PROGRAMMED_CRON: config.programmed.cron, WEP_PROGRAMMED_START: config.programmed.start, WEP_PROGRAMMED_END: config.programmed.end };
}
export class WepSettingsRuntime {
  constructor({ settings = settingsService, sync = syncScheduler, programmed = programmedScheduler, env = process.env, logger = console } = {}) {
    Object.assign(this, { settings, sync, programmed, env, logger }); this.revision = null; this.timer = null; this.refreshing = false;
  }
  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const { config, revision } = await this.settings.runtime();
      if (this.revision !== revision) {
        this.sync.stop(); this.programmed.stop();
        const env = settingsScheduleEnv(config, this.env);
        this.sync.env = env; this.programmed.env = env;
        this.sync.start(); this.programmed.start(); this.revision = revision;
      }
      await this.settings.pool.query(`INSERT INTO public.wep_settings_applied (instance, revision, executor, next_sync_at, next_programmed_at)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (instance) DO UPDATE SET revision = EXCLUDED.revision,
        executor = EXCLUDED.executor, next_sync_at = EXCLUDED.next_sync_at, next_programmed_at = EXCLUDED.next_programmed_at, applied_at = NOW()`,
      [`${hostname()}:${this.env.NODE_APP_INSTANCE || "0"}`, revision, [undefined, null, "", "0"].includes(this.env.NODE_APP_INSTANCE),
        this.sync.task?.getNextRun?.() || null, this.programmed.task?.getNextRun?.() || null]);
    } catch {
      this.sync.stop(); this.programmed.stop(); this.revision = null;
      this.logger.error?.("[WEP CONFIG] No se pudo aplicar la configuración; automatizaciones pausadas hasta recuperar la lectura.");
    } finally { this.refreshing = false; }
  }
  start() { if (this.timer || !this.settings.enabled()) return; void this.refresh(); this.timer = setInterval(() => void this.refresh(), 15000); this.timer.unref?.(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.sync.stop(); this.programmed.stop(); }
}
export default new WepSettingsRuntime();
