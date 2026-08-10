import { pool } from "../../../dboperacion_pg.js";
import { ADVISORY_LOCK_KEY } from "./duplicate-transfer.constants.js";
import { DuplicateTransferError } from "./duplicate-transfer.errors.js";

export { pool as duplicateTransferPool };

export async function getConfigRow(executor = pool) {
  const result = await executor.query("SELECT * FROM public.duplicate_transfer_monitor_config WHERE id = 1");
  if (!result.rows[0]) throw new Error("No existe la configuración singleton del monitor");
  return result.rows[0];
}

export async function updateConfigRow(changes, username, executor = pool) {
  const allowed = new Set(["enabled", "cron_expression", "timezone", "lookback_days", "minimum_coincidences", "erp_origin", "account_codes", "query_timeout_seconds", "max_results", "notify_new_occurrences", "dry_run", "whatsapp_provider", "whatsapp_recipient", "whatsapp_template_name", "whatsapp_template_language"]);
  const entries = Object.entries(changes).filter(([key]) => allowed.has(key));
  const values = entries.map(([, value]) => value);
  values.push(username || null);
  const sets = entries.map(([key], index) => `${key} = $${index + 1}`);
  const result = await executor.query(
    `UPDATE public.duplicate_transfer_monitor_config SET ${sets.join(", ")}, updated_by = $${values.length}, updated_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = 1 RETURNING *`,
    values,
  );
  return result.rows[0];
}

export async function acquireExecutionLock() {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT pg_try_advisory_lock($1) AS acquired", [ADVISORY_LOCK_KEY]);
    return { client, acquired: result.rows[0].acquired };
  } catch (error) {
    client.release();
    throw error;
  }
}

export async function releaseExecutionLock(client) {
  try { await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]); }
  finally { client.release(); }
}

export async function createRun(executor, { trigger, windowFrom, windowTo, lookbackDays, configSnapshot }) {
  const result = await executor.query(
    `INSERT INTO public.duplicate_transfer_monitor_runs (trigger_type,status,window_from,window_to,lookback_days,config_snapshot) VALUES ($1,'running',$2,$3,$4,$5::jsonb) RETURNING *`,
    [trigger, windowFrom, windowTo, lookbackDays, JSON.stringify(configSnapshot)],
  );
  return result.rows[0];
}

export async function finishRun(executor, runId, fields) {
  const result = await executor.query(
    `UPDATE public.duplicate_transfer_monitor_runs SET status=$2,found_movement_count=$3,found_group_count=$4,new_movement_count=$5,notified_movement_count=$6,notified_group_count=$7,error_code=$8,error_message=$9,finished_at=CURRENT_TIMESTAMP,duration_ms=GREATEST(0,EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-started_at))*1000)::integer WHERE id=$1 RETURNING *`,
    [runId, fields.status, fields.foundMovementCount || 0, fields.foundGroupCount || 0, fields.newMovementCount || 0, fields.notifiedMovementCount || 0, fields.notifiedGroupCount || 0, fields.errorCode || null, fields.errorMessage || null],
  );
  return result.rows[0];
}

export async function persistMovements(runId, movements) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saved = [];
    for (const item of movements) {
      const existing = await client.query(
        "SELECT id FROM public.duplicate_transfer_movements WHERE source_key=$1",
        [item.sourceKey],
      );
      if (!existing.rowCount) {
        const legacy = await client.query(
          `SELECT id FROM public.duplicate_transfer_movements
           WHERE rasi_signo IS NULL
             AND casi_division IS NOT DISTINCT FROM $1
             AND casi_asiento=$2
             AND movement_date=$3::date
             AND account_code=$4
             AND amount=$5::numeric
             AND client_code=$6
             AND erp_origin=$7
           FOR UPDATE`,
          [item.division,item.entry,item.movementDate,item.accountCode,item.amount,item.clientCode,item.origin],
        );
        if (legacy.rowCount > 1) {
          throw new DuplicateTransferError("Más de un movimiento histórico coincide con la nueva clave de origen", { code: "LEGACY_SOURCE_KEY_COLLISION" });
        }
        if (legacy.rowCount === 1) {
          await client.query(
            `UPDATE public.duplicate_transfer_movements
             SET source_key=$2,group_key=$3,rasi_signo=$4,ctec_ctacte_ctec=$5,comprobante=$6,updated_at=CURRENT_TIMESTAMP
             WHERE id=$1`,
            [legacy.rows[0].id,item.sourceKey,item.groupKey,item.sign,item.currentAccount,item.receipt],
          );
        }
      }
      const result = await client.query(
        `INSERT INTO public.duplicate_transfer_movements (source_key,group_key,casi_division,casi_asiento,source_line_key,movement_date,account_code,account_name,amount,client_code,client_name,erp_origin,rasi_signo,ctec_ctacte_ctec,comprobante,first_seen_run_id,last_seen_run_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10,$11,$12,$13,$14,$15,$16,$16) ON CONFLICT (source_key) DO UPDATE SET group_key=EXCLUDED.group_key,casi_division=EXCLUDED.casi_division,casi_asiento=EXCLUDED.casi_asiento,source_line_key=COALESCE(EXCLUDED.source_line_key,public.duplicate_transfer_movements.source_line_key),movement_date=EXCLUDED.movement_date,account_code=EXCLUDED.account_code,account_name=EXCLUDED.account_name,amount=EXCLUDED.amount,client_code=EXCLUDED.client_code,client_name=EXCLUDED.client_name,erp_origin=EXCLUDED.erp_origin,rasi_signo=EXCLUDED.rasi_signo,ctec_ctacte_ctec=EXCLUDED.ctec_ctacte_ctec,comprobante=EXCLUDED.comprobante,last_seen_run_id=$16,last_seen_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP RETURNING *, (first_seen_run_id=$16) AS inserted_this_run`,
        [item.sourceKey,item.groupKey,item.division,item.entry,item.sourceLineKey,item.movementDate,item.accountCode,item.accountName,item.amount,item.clientCode,item.clientName,item.origin,item.sign,item.currentAccount,item.receipt,runId],
      );
      saved.push(result.rows[0]);
    }
    await client.query("COMMIT");
    return saved;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function findEligibleGroups(groupKeys, fromDate, toDate, minimum, executor = pool) {
  if (!groupKeys.length) return [];
  const result = await executor.query(
    `SELECT group_key,COUNT(*)::integer AS movement_count,COUNT(*) FILTER (WHERE notified_at IS NULL)::integer AS unnotified_count,jsonb_agg(jsonb_build_object('id',id,'notifiedAt',notified_at) ORDER BY movement_date,id) AS movements FROM public.duplicate_transfer_movements WHERE group_key=ANY($1::varchar[]) AND movement_date BETWEEN $2::date AND $3::date GROUP BY group_key HAVING COUNT(*) >= $4 AND COUNT(*) FILTER (WHERE notified_at IS NULL) > 0`,
    [groupKeys, fromDate, toDate, minimum],
  );
  return result.rows;
}

export async function createAlert({ runId, controlCode, provider, templateName, templateLanguage, recipientMasked, status, groupCount, movementCount }, executor = pool) {
  const result = await executor.query(
    `INSERT INTO public.duplicate_transfer_alerts (run_id,control_code,provider,template_name,template_language,recipient_masked,status,group_count,movement_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [runId,controlCode,provider,templateName,templateLanguage,recipientMasked,status,groupCount,movementCount],
  );
  return result.rows[0];
}

async function insertAlertItems(client, alertId, groups) {
  for (const group of groups) for (const movement of group.movements) await client.query(
    `INSERT INTO public.duplicate_transfer_alert_items (alert_id,movement_id,group_key,was_new_movement) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [alertId,movement.id,group.group_key,!movement.notifiedAt],
  );
}

export async function saveDryRunAlert(alertId, groups) {
  const client = await pool.connect();
  try { await client.query("BEGIN"); await insertAlertItems(client, alertId, groups); await client.query("COMMIT"); }
  catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function confirmAlertSent(alertId, groups, providerMessageId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE public.duplicate_transfer_alerts SET status='sent',provider_message_id=$2,sent_at=CURRENT_TIMESTAMP,error_code=NULL,error_message=NULL WHERE id=$1", [alertId,providerMessageId]);
    await insertAlertItems(client, alertId, groups);
    const newIds = groups.flatMap((group) => group.movements.filter((movement) => !movement.notifiedAt).map((movement) => movement.id));
    if (newIds.length) await client.query("UPDATE public.duplicate_transfer_movements SET notified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=ANY($1::bigint[]) AND notified_at IS NULL", [newIds]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function failAlert(alertId, { status, code, message, providerMessageId = null }, executor = pool) {
  await executor.query("UPDATE public.duplicate_transfer_alerts SET status=$2,error_code=$3,error_message=$4,provider_message_id=COALESCE($5,provider_message_id) WHERE id=$1", [alertId,status,code,message,providerMessageId]);
}

export async function getStatusData(executor = pool) {
  const [last,lastSuccess] = await Promise.all([
    executor.query("SELECT * FROM public.duplicate_transfer_monitor_runs ORDER BY started_at DESC LIMIT 1"),
    executor.query("SELECT * FROM public.duplicate_transfer_monitor_runs WHERE status IN ('success','dry_run') ORDER BY started_at DESC LIMIT 1"),
  ]);
  return { lastRun: last.rows[0] || null, lastSuccess: lastSuccess.rows[0] || null };
}

export async function listRuns({ limit, offset }, executor = pool) {
  const [rows,count] = await Promise.all([
    executor.query("SELECT * FROM public.duplicate_transfer_monitor_runs ORDER BY started_at DESC LIMIT $1 OFFSET $2", [limit,offset]),
    executor.query("SELECT COUNT(*)::integer AS total FROM public.duplicate_transfer_monitor_runs"),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

export async function getRun(id, executor = pool) {
  const run = await executor.query("SELECT * FROM public.duplicate_transfer_monitor_runs WHERE id=$1", [id]);
  if (!run.rows[0]) return null;
  const alerts = await executor.query("SELECT * FROM public.duplicate_transfer_alerts WHERE run_id=$1 ORDER BY id", [id]);
  return { ...run.rows[0], alerts: alerts.rows };
}

export async function listDetections({ limit, offset }, executor = pool) {
  const base = `FROM public.duplicate_transfer_movements GROUP BY group_key HAVING COUNT(*) >= 2`;
  const [rows,count] = await Promise.all([
    executor.query(`SELECT group_key,COUNT(*)::integer AS movement_count,MIN(movement_date) AS first_date,MAX(movement_date) AS last_date,COUNT(notified_at)::integer AS notified_count ${base} ORDER BY MAX(movement_date) DESC LIMIT $1 OFFSET $2`, [limit,offset]),
    executor.query(`SELECT COUNT(*)::integer AS total FROM (SELECT group_key ${base}) groups`),
  ]);
  return { rows: rows.rows.map((row) => ({ ...row, group_key: `${row.group_key.slice(0,12)}…` })), total: count.rows[0].total };
}
