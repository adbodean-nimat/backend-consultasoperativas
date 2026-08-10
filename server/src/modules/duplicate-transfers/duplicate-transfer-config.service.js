import cron from "node-cron";
import { getConfigRow, updateConfigRow } from "./duplicate-transfer.repository.js";
import { validateConfig, validateConfigUpdate } from "./duplicate-transfer.validator.js";

export function mapConfig(row) {
  if (!row) return null;
  return {
    id: row.id,
    enabled: row.enabled,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
    lookbackDays: row.lookback_days,
    minimumCoincidences: row.minimum_coincidences,
    erpOrigin: row.erp_origin,
    accountCodes: row.account_codes,
    queryTimeoutSeconds: row.query_timeout_seconds,
    maxResults: row.max_results,
    notifyNewOccurrences: row.notify_new_occurrences,
    dryRun: row.dry_run,
    whatsappProvider: row.whatsapp_provider,
    whatsappRecipient: row.whatsapp_recipient,
    whatsappTemplateName: row.whatsapp_template_name,
    whatsappTemplateLanguage: row.whatsapp_template_language,
    version: row.version,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function getConfig({ requireNotification = false } = {}) {
  const row = await getConfigRow();
  validateConfig(row, { requireNotification });
  return row;
}

export async function updateConfig(body, username) {
  const changes = validateConfigUpdate(body);
  const current = await getConfigRow();
  validateConfig({ ...current, ...changes }, { requireNotification: changes.dry_run === false || (current.dry_run === false && changes.dry_run === undefined) });
  return mapConfig(await updateConfigRow(changes, username));
}

export function nextRun(cronExpression, timezone, from = new Date()) {
  const task = cron.createTask(cronExpression, () => {}, { timezone });
  const result = task.getNextRun?.() ?? null;
  task.destroy();
  return result && result > from ? result : result;
}
