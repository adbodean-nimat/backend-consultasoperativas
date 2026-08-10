import monitorService from "./duplicate-transfer-monitor.service.js";
import scheduler from "./duplicate-transfer-scheduler.js";
import { getConfig, mapConfig, updateConfig } from "./duplicate-transfer-config.service.js";
import { getRun, getStatusData, listDetections, listRuns } from "./duplicate-transfer.repository.js";
import { DuplicateTransferError } from "./duplicate-transfer.errors.js";
import { maskPhone } from "./duplicate-transfer.normalizer.js";
import reviewService from "./duplicate-transfer-review.service.js";
import { validateListQuery, validateReviewQuery, validateRunBody } from "./duplicate-transfer.validator.js";

function username(req) {
  return req.user?.sAMAccountName || req.user?.mail || req.user?.displayName || "authenticated-admin";
}

function safeRun(row) {
  if (!row) return null;
  const config = row.config_snapshot ? { ...row.config_snapshot, whatsappRecipient: row.config_snapshot.whatsappRecipient ? maskPhone(row.config_snapshot.whatsappRecipient) : null } : null;
  return { ...row, config_snapshot: config };
}

export async function getConfigController(_req, res, next) {
  try { return res.json({ ok: true, data: mapConfig(await getConfig()) }); }
  catch (error) { return next(error); }
}

export async function putConfigController(req, res, next) {
  try {
    const data = await updateConfig(req.body, username(req));
    await scheduler.refresh();
    return res.json({ ok: true, data });
  } catch (error) { return next(error); }
}

export async function getStatusController(_req, res, next) {
  try {
    const config = await getConfig();
    const history = await getStatusData();
    const lastError = history.lastRun?.error_message ? { code: history.lastRun.error_code, message: history.lastRun.error_message } : null;
    return res.json({ ok: true, data: {
      enabled: config.enabled, dryRun: config.dry_run, nextRun: scheduler.status().nextRun,
      lastRun: safeRun(history.lastRun), lastSuccess: safeRun(history.lastSuccess), lastError,
      windowDays: config.lookback_days,
      template: { provider: config.whatsapp_provider, name: config.whatsapp_template_name, language: config.whatsapp_template_language, recipientMasked: maskPhone(config.whatsapp_recipient), environmentConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_GRAPH_API_VERSION) },
    } });
  } catch (error) { return next(error); }
}

export async function previewController(req, res, next) {
  try {
    const input = validateRunBody({ ...req.body, notify: false });
    return res.json({ ok: true, data: await monitorService.preview(input) });
  } catch (error) { return next(error); }
}

export async function runController(req, res, next) {
  try {
    const input = validateRunBody(req.body);
    const result = await monitorService.run({ trigger: "manual", ...input });
    return res.status(202).json({ ok: true, data: safeRun(result) });
  } catch (error) { return next(error); }
}

export async function listRunsController(req, res, next) {
  try {
    const pagination = validateListQuery(req.query);
    const result = await listRuns(pagination);
    return res.json({ ok: true, data: result.rows.map(safeRun), pagination: { ...pagination, total: result.total } });
  } catch (error) { return next(error); }
}

export async function getRunController(req, res, next) {
  try {
    if (!/^\d+$/.test(req.params.id)) throw new DuplicateTransferError("Identificador de ejecución inválido", { status: 400, code: "INVALID_RUN_ID" });
    const result = await getRun(req.params.id);
    if (!result) throw new DuplicateTransferError("Ejecución no encontrada", { status: 404, code: "RUN_NOT_FOUND" });
    return res.json({ ok: true, data: safeRun(result) });
  } catch (error) { return next(error); }
}

export async function listDetectionsController(req, res, next) {
  try {
    const pagination = validateListQuery(req.query);
    const result = await listDetections(pagination);
    return res.json({ ok: true, data: result.rows, pagination: { ...pagination, total: result.total } });
  } catch (error) { return next(error); }
}

export async function reviewController(req, res, next) {
  try { return res.json({ ok: true, data: await reviewService.review(validateReviewQuery(req.query)) }); }
  catch (error) { return next(error); }
}
