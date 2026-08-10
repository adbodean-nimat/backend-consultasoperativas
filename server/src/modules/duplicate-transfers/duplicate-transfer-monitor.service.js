import { CONTROL_CODE_PREFIX, RUN_STATUSES } from "./duplicate-transfer.constants.js";
import { sanitizeError, DuplicateTransferError } from "./duplicate-transfer.errors.js";
import { getConfig, mapConfig } from "./duplicate-transfer-config.service.js";
import sqlServerRepository from "./sql-server-duplicate-transfer.repository.js";
import whatsappService from "./whatsapp-notification.service.js";
import {
  acquireExecutionLock, releaseExecutionLock, createRun, finishRun, persistMovements,
  findEligibleGroups, createAlert, saveDryRunAlert, confirmAlertSent, failAlert,
} from "./duplicate-transfer.repository.js";
import { localParts, maskPhone, normalizeMovements } from "./duplicate-transfer.normalizer.js";
import { validateWindow } from "./duplicate-transfer.validator.js";
import { logMonitor } from "./duplicate-transfer.logger.js";

function snapshot(config) {
  const mapped = mapConfig(config);
  return { ...mapped, whatsappRecipient: maskPhone(mapped.whatsappRecipient) };
}

function resolveWindow(config, from, to, now = new Date()) {
  const end = to ? new Date(to) : now;
  const start = from ? new Date(from) : new Date(end.valueOf() - config.lookback_days * 86_400_000);
  return validateWindow(start, end);
}

function localDate(date, timezone) {
  const p = localParts(date, timezone);
  return `${p.year}-${p.month}-${p.day}`;
}

function baseCounts(rows = [], groups = []) {
  return {
    foundMovementCount: rows.length,
    foundGroupCount: new Set(rows.map((row) => row.groupKey)).size,
    newMovementCount: groups.reduce((sum, group) => sum + Number(group.unnotified_count || 0), 0),
  };
}

export class DuplicateTransferMonitorService {
  constructor({ sqlRepository = sqlServerRepository, notificationService = whatsappService, configLoader = getConfig, repository = {} } = {}) {
    this.sqlRepository = sqlRepository;
    this.notificationService = notificationService;
    this.configLoader = configLoader;
    const defaults = {
      acquireExecutionLock, releaseExecutionLock, createRun, finishRun, persistMovements,
      findEligibleGroups, createAlert, saveDryRunAlert, confirmAlertSent, failAlert,
    };
    this.repository = Object.fromEntries(Object.entries(defaults).map(([name, fallback]) => [
      name,
      typeof repository[name] === "function" ? repository[name].bind(repository) : fallback,
    ]));
  }

  async preview({ from, to } = {}) {
    const config = await this.configLoader();
    const window = resolveWindow(config, from, to);
    const rows = await this.sqlRepository.detect({
      from: window.from, to: window.to, timezone: config.timezone, origin: config.erp_origin,
      accountCodes: config.account_codes, minimumCoincidences: config.minimum_coincidences,
      timeoutSeconds: config.query_timeout_seconds,
    });
    if (rows.length > config.max_results) throw new DuplicateTransferError("El resultado supera el máximo configurado", { status: 422, code: "MAX_RESULTS_EXCEEDED" });
    const movements = normalizeMovements(rows);
    const grouped = new Map();
    for (const movement of movements) grouped.set(movement.groupKey, (grouped.get(movement.groupKey) || 0) + 1);
    return {
      window: { from: window.from, to: window.to, timezone: config.timezone },
      movementCount: movements.length,
      groupCount: grouped.size,
      groups: [...grouped.entries()].slice(0, 50).map(([key, count]) => ({ groupRef: `${key.slice(0, 12)}…`, movementCount: count })),
      truncated: grouped.size > 50,
    };
  }

  async run({ trigger, notify, dryRun, from, to } = {}) {
    if (!new Set(["cron", "manual"]).has(trigger)) throw new DuplicateTransferError("Trigger inválido", { status: 400, code: "INVALID_TRIGGER" });
    const started = Date.now();
    let lock;
    let run;
    let config;
    let window;
    let counts = baseCounts();
    try {
      config = await this.configLoader({ requireNotification: Boolean(notify) });
      const effectiveDryRun = dryRun === undefined ? config.dry_run : Boolean(dryRun || config.dry_run);
      window = resolveWindow(config, from, to);
      lock = await this.repository.acquireExecutionLock();
      run = await this.repository.createRun(lock.client, {
        trigger, windowFrom: window.from, windowTo: window.to,
        lookbackDays: config.lookback_days, configSnapshot: snapshot(config),
      });
      if (!lock.acquired) {
        const result = await this.repository.finishRun(lock.client, run.id, { status: RUN_STATUSES.SKIPPED_LOCKED });
        logMonitor("info", "run_finished", { runId: run.id, triggerType: trigger, status: result.status, durationMs: Date.now() - started });
        return result;
      }
      if (!config.enabled && trigger === "cron") {
        const result = await this.repository.finishRun(lock.client, run.id, { status: RUN_STATUSES.SKIPPED_DISABLED });
        return result;
      }
      logMonitor("info", "run_started", { runId: run.id, triggerType: trigger, windowFrom: window.from, windowTo: window.to, recipient: config.whatsapp_recipient });
      const rawRows = await this.sqlRepository.detect({
        from: window.from, to: window.to, timezone: config.timezone, origin: config.erp_origin,
        accountCodes: config.account_codes, minimumCoincidences: config.minimum_coincidences,
        timeoutSeconds: config.query_timeout_seconds,
      });
      if (rawRows.length > config.max_results) {
        const error = new DuplicateTransferError("El resultado supera el máximo configurado; no se persistió ni notificó un resultado incompleto", { code: "MAX_RESULTS_EXCEEDED", status: 422 });
        const safe = sanitizeError(error);
        return await this.repository.finishRun(lock.client, run.id, { status: RUN_STATUSES.PARTIAL, foundMovementCount: rawRows.length, errorCode: safe.code, errorMessage: safe.message });
      }
      const movements = normalizeMovements(rawRows);
      await this.repository.persistMovements(run.id, movements);
      const groups = await this.repository.findEligibleGroups(
        [...new Set(movements.map((item) => item.groupKey))],
        localDate(window.from, config.timezone), localDate(window.to, config.timezone), config.minimum_coincidences,
      );
      counts = baseCounts(movements, groups);
      const shouldNotify = Boolean(notify && config.notify_new_occurrences && groups.length);
      let finalStatus = RUN_STATUSES.SUCCESS;
      let notifiedMovementCount = 0;
      let notifiedGroupCount = 0;
      if (shouldNotify) {
        const movementCount = groups.reduce((sum, group) => sum + Number(group.movement_count), 0);
        const alert = await this.repository.createAlert({
          runId: run.id, controlCode: `${CONTROL_CODE_PREFIX}-${run.id}`, provider: config.whatsapp_provider,
          templateName: config.whatsapp_template_name, templateLanguage: config.whatsapp_template_language,
          recipientMasked: maskPhone(config.whatsapp_recipient), status: effectiveDryRun ? "dry_run" : "pending",
          groupCount: groups.length, movementCount,
        });
        const payload = this.notificationService.buildPayload({ config, groups, from: window.from, to: window.to });
        if (effectiveDryRun) {
          await this.repository.saveDryRunAlert(alert.id, groups);
          // La restricción existente de runs no admite "dry_run"; la simulación
          // queda identificada en duplicate_transfer_alerts.status.
          finalStatus = RUN_STATUSES.SUCCESS;
        } else {
          let providerMessageId = null;
          try {
            const sent = await this.notificationService.send(payload);
            providerMessageId = sent.providerMessageId;
            try {
              await this.repository.confirmAlertSent(alert.id, groups, providerMessageId);
            } catch (cause) {
              throw new DuplicateTransferError("Meta confirmó el envío, pero no se pudo completar su auditoría", { code: "POST_SEND_PERSISTENCE_FAILED", status: 503, ambiguous: true, cause });
            }
            notifiedMovementCount = counts.newMovementCount;
            notifiedGroupCount = groups.length;
          } catch (error) {
            const safe = sanitizeError(error);
            // La restricción existente de alerts no admite "partial"; la alerta
            // queda failed y el run partial, con código ambiguo para revisión.
            await this.repository.failAlert(alert.id, { status: "failed", code: safe.code, message: safe.message, providerMessageId });
            await this.repository.finishRun(lock.client, run.id, { ...counts, status: safe.ambiguous ? RUN_STATUSES.PARTIAL : RUN_STATUSES.FAILED, errorCode: safe.code, errorMessage: safe.message });
            throw error;
          }
        }
      }
      const result = await this.repository.finishRun(lock.client, run.id, { ...counts, status: finalStatus, notifiedMovementCount, notifiedGroupCount });
      logMonitor("info", "run_finished", { runId: run.id, triggerType: trigger, durationMs: Date.now() - started, rowCount: counts.foundMovementCount, groupCount: counts.foundGroupCount, newMovementCount: counts.newMovementCount, notificationStatus: shouldNotify ? finalStatus : "not_requested", status: result.status });
      return result;
    } catch (error) {
      const safe = sanitizeError(error);
      if (run && lock?.client) {
        try {
          const current = await lock.client.query("SELECT status FROM public.duplicate_transfer_monitor_runs WHERE id=$1", [run.id]);
          if (current.rows[0]?.status === RUN_STATUSES.RUNNING) await this.repository.finishRun(lock.client, run.id, { ...counts, status: safe.ambiguous ? RUN_STATUSES.PARTIAL : RUN_STATUSES.FAILED, errorCode: safe.code, errorMessage: safe.message });
        } catch (persistenceError) {
          logMonitor("error", "run_persistence_failed", { runId: run.id, triggerType: trigger, code: persistenceError?.code });
        }
      }
      logMonitor("error", "run_failed", { runId: run?.id, triggerType: trigger, durationMs: Date.now() - started, code: safe.code, status: safe.ambiguous ? RUN_STATUSES.PARTIAL : RUN_STATUSES.FAILED });
      throw error;
    } finally {
      if (lock?.client) {
        if (lock.acquired) await this.repository.releaseExecutionLock(lock.client).catch((error) => logMonitor("error", "lock_release_failed", { runId: run?.id, code: error?.code }));
        else lock.client.release();
      }
    }
  }
}

export default new DuplicateTransferMonitorService();
