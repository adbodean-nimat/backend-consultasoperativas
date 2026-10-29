import pool from "./wep-postgres.js";

export class WepMonitorRepository {
  constructor({ postgresPool = pool, env = process.env, logger = console } = {}) {
    Object.assign(this, { pool: postgresPool, env, logger });
  }
  async start(job) {
    if (this.env.WEP_MONITOR_ENABLED !== "true") return null;
    try {
      const result = await this.pool.query(
        "INSERT INTO public.wep_monitor_runs (job, instance, status) VALUES ($1, $2, 'RUNNING') RETURNING id",
        [job, String(this.env.NODE_APP_INSTANCE ?? "single").slice(0, 80)],
      );
      return result.rows[0].id;
    } catch { this.logger.error?.("[WEP MONITOR] No se pudo registrar el inicio de la tarea"); return null; }
  }
  async finish(id, status, summary = {}) {
    if (id === null) return;
    try {
      await this.pool.query("UPDATE public.wep_monitor_runs SET status = $2, summary = $3::jsonb, finished_at = NOW() WHERE id = $1", [id, status, JSON.stringify(summary)]);
    } catch { this.logger.error?.("[WEP MONITOR] No se pudo registrar el resultado de la tarea"); }
  }
}
export default new WepMonitorRepository();
