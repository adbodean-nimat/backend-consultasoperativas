import { fault } from "./report.config.js";
const LOCK = 1948271610;
export class ReportRepository {
  constructor(pool) { this.pool = pool; }
  async withLock(work) {
    const client = await this.pool.connect();
    let locked = false, lost = false;
    const onError = () => { lost = true; };
    client.on("error", onError);
    try {
      locked = (await client.query("SELECT pg_try_advisory_lock($1) AS locked", [LOCK])).rows[0].locked;
      if (!locked) return { skipped: "locked" };
      const guard = () => { if (lost) throw fault("REPORT_LOCK_LOST"); };
      return await work({
        guard,
        load: async () => {
          guard();
          return (await client.query("SELECT state FROM productos_web_report_state WHERE id = 1")).rows[0]?.state || null;
        },
        save: async state => {
          guard();
          await client.query(`INSERT INTO productos_web_report_state(id,state) VALUES (1,$1::jsonb)
            ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state, updated_at=now()`, [JSON.stringify(state)]);
        },
      });
    } finally {
      if (locked && !lost) await client.query("SELECT pg_advisory_unlock($1)", [LOCK]).catch(() => { lost = true; });
      client.removeListener("error", onError);
      client.release(lost);
    }
  }
}
