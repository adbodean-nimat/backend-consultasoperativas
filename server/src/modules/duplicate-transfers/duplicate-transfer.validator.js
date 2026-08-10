import cron from "node-cron";
import { DuplicateTransferError, DuplicateTransferValidationError } from "./duplicate-transfer.errors.js";
import { MAX_WINDOW_DAYS } from "./duplicate-transfer.constants.js";

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const E164 = /^\+[1-9]\d{7,14}$/;
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimezone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function validateConfig(config, { requireNotification = false } = {}) {
  const errors = [];
  for (const field of ["enabled", "notify_new_occurrences", "dry_run"]) if (typeof config[field] !== "boolean") errors.push({ field, message: "Debe ser booleano" });
  if (!cron.validate(String(config.cron_expression || ""))) errors.push({ field: "cronExpression", message: "Cron inválido" });
  if (!isValidTimezone(config.timezone)) errors.push({ field: "timezone", message: "Zona horaria inválida" });
  if (!Number.isInteger(config.lookback_days) || config.lookback_days < 1 || config.lookback_days > MAX_WINDOW_DAYS) errors.push({ field: "lookbackDays", message: "Debe estar entre 1 y 180" });
  if (!Array.isArray(config.account_codes) || !config.account_codes.length || config.account_codes.some((value) => !String(value).trim())) errors.push({ field: "accountCodes", message: "Debe incluir al menos una cuenta válida" });
  if (!Number.isInteger(config.minimum_coincidences) || config.minimum_coincidences < 2) errors.push({ field: "minimumCoincidences", message: "Debe ser al menos 2" });
  if (!Number.isInteger(config.query_timeout_seconds) || config.query_timeout_seconds < 1) errors.push({ field: "queryTimeoutSeconds", message: "Debe ser un entero positivo" });
  if (!Number.isInteger(config.max_results) || config.max_results < 1) errors.push({ field: "maxResults", message: "Debe ser un entero positivo" });
  if (!String(config.erp_origin || "").trim() || String(config.erp_origin).length > 20) errors.push({ field: "erpOrigin", message: "Origen inválido" });
  if (!String(config.whatsapp_provider || "").trim()) errors.push({ field: "whatsappProvider", message: "Proveedor inválido" });
  const realNotification = requireNotification && !config.dry_run;
  if (realNotification && !E164.test(String(config.whatsapp_recipient || ""))) errors.push({ field: "whatsappRecipient", message: "Debe tener formato E.164" });
  if (realNotification && !String(config.whatsapp_template_name || "").trim()) errors.push({ field: "whatsappTemplateName", message: "La plantilla es obligatoria" });
  if (realNotification && !String(config.whatsapp_template_language || "").trim()) errors.push({ field: "whatsappTemplateLanguage", message: "El idioma es obligatorio" });
  if (errors.length) throw new DuplicateTransferValidationError(errors);
  return config;
}

export function parseIsoInstant(value, field) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return new Date(value);
  if (typeof value !== "string" || !ISO_WITH_ZONE.test(value)) throw new DuplicateTransferValidationError([{ field, message: "Debe ser ISO 8601 con zona horaria explícita" }]);
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new DuplicateTransferValidationError([{ field, message: "Fecha inválida" }]);
  return date;
}

export function validateWindow(from, to) {
  if (!(from instanceof Date) || !(to instanceof Date) || Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf()) || from >= to) throw new DuplicateTransferValidationError([{ field: "window", message: "from debe ser anterior a to" }]);
  if (to.valueOf() - from.valueOf() > MAX_WINDOW_DAYS * 86_400_000) throw new DuplicateTransferValidationError([{ field: "window", message: "El intervalo no puede superar 180 días" }]);
  return { from, to };
}

export function validateRunBody(body = {}) {
  const allowed = new Set(["from", "to", "notify", "confirmNotification"]);
  const errors = Object.keys(body).filter((key) => !allowed.has(key)).map((key) => ({ field: key, message: "Campo no permitido" }));
  if (hasOwn(body, "notify") && typeof body.notify !== "boolean") errors.push({ field: "notify", message: "Debe ser booleano" });
  if (body.notify === true && body.confirmNotification !== true) errors.push({ field: "confirmNotification", message: "Se requiere confirmación explícita para notificar" });
  if ((body.from && !body.to) || (!body.from && body.to)) errors.push({ field: "window", message: "from y to deben enviarse juntos" });
  if (errors.length) throw new DuplicateTransferValidationError(errors);
  const from = body.from ? parseIsoInstant(body.from, "from") : undefined;
  const to = body.to ? parseIsoInstant(body.to, "to") : undefined;
  if (from) validateWindow(from, to);
  return { from, to, notify: body.notify === true };
}

export function validateListQuery(query = {}) {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  const errors = [];
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) errors.push({ field: "limit", message: "Debe estar entre 1 y 200" });
  if (!Number.isInteger(offset) || offset < 0) errors.push({ field: "offset", message: "Debe ser cero o positivo" });
  if (errors.length) throw new DuplicateTransferValidationError(errors);
  return { limit, offset };
}

export function validateReviewQuery(query = {}) {
  const allowed = new Set(["from", "to", "accountCode", "clientCode", "page", "pageSize"]);
  const errors = Object.keys(query).filter((key) => !allowed.has(key)).map((field) => ({ field, message: "Parámetro no permitido" }));
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 25 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1) errors.push({ field: "page", message: "Debe ser un entero positivo" });
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) errors.push({ field: "pageSize", message: "Debe estar entre 1 y 200" });
  if ((query.from && !query.to) || (!query.from && query.to)) errors.push({ field: "window", message: "from y to deben enviarse juntos" });
  for (const field of ["from", "to"]) if (query[field] && !DATE_ONLY.test(String(query[field])) && !ISO_WITH_ZONE.test(String(query[field]))) errors.push({ field, message: "Debe ser una fecha YYYY-MM-DD o ISO 8601 con zona horaria" });
  for (const field of ["accountCode", "clientCode"]) if (query[field] !== undefined && (!String(query[field]).trim() || String(query[field]).length > 50)) errors.push({ field, message: "Valor inválido" });
  if (errors.length) throw new DuplicateTransferValidationError(errors);
  return {
    from: query.from ? String(query.from) : undefined,
    to: query.to ? String(query.to) : undefined,
    accountCode: query.accountCode === undefined ? null : String(query.accountCode).trim(),
    clientCode: query.clientCode === undefined ? null : String(query.clientCode).trim(),
    page,
    pageSize,
  };
}

export function validateConfigUpdate(body = {}) {
  const mapping = {
    enabled: "enabled", cronExpression: "cron_expression", timezone: "timezone", lookbackDays: "lookback_days",
    minimumCoincidences: "minimum_coincidences", erpOrigin: "erp_origin", accountCodes: "account_codes",
    queryTimeoutSeconds: "query_timeout_seconds", maxResults: "max_results", notifyNewOccurrences: "notify_new_occurrences",
    dryRun: "dry_run", whatsappProvider: "whatsapp_provider", whatsappRecipient: "whatsapp_recipient",
    whatsappTemplateName: "whatsapp_template_name", whatsappTemplateLanguage: "whatsapp_template_language",
  };
  const unknown = Object.keys(body).filter((key) => !mapping[key]);
  if (unknown.length) throw new DuplicateTransferValidationError(unknown.map((field) => ({ field, message: "Campo no permitido" })));
  if (!Object.keys(body).length) throw new DuplicateTransferValidationError([{ field: "body", message: "Debe incluir al menos un cambio" }]);
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [mapping[key], value]));
}

export function requireAdmin(req, _res, next) {
  const configured = String(process.env.DUPLICATE_TRANSFER_ADMIN_GROUPS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const memberships = Array.isArray(req.user?.memberOf) ? req.user.memberOf : req.user?.memberOf ? [req.user.memberOf] : [];
  const normalized = memberships.map((value) => String(value).toLowerCase());
  const allowed = configured.length > 0 && configured.some((group) => normalized.some((membership) => membership === group || membership.includes(`cn=${group},`)));
  if (!allowed) return next(new DuplicateTransferError("Permiso administrativo requerido", { status: 403, code: "ADMIN_PERMISSION_REQUIRED" }));
  return next();
}

function userGroups(req) {
  const memberships = Array.isArray(req.user?.memberOf) ? req.user.memberOf : req.user?.memberOf ? [req.user.memberOf] : [];
  return memberships.map((value) => String(value).trim().toLowerCase());
}

function belongsToAny(req, groups) {
  const memberships = userGroups(req);
  return groups.some((group) => memberships.some((membership) => membership === group || membership.includes(`cn=${group},`)));
}

export function requireReviewPermission(req, _res, next) {
  const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : req.user?.permissions ? [req.user.permissions] : [];
  const hasPermission = permissions.some((value) => String(value).toLowerCase() === "duplicate-transfers:review");
  const reviewGroups = String(process.env.DUPLICATE_TRANSFER_REVIEW_GROUPS || "Gerencia,Administracion y Finanzas").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const adminGroups = String(process.env.DUPLICATE_TRANSFER_ADMIN_GROUPS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!hasPermission && !belongsToAny(req, [...reviewGroups, ...adminGroups])) return next(new DuplicateTransferError("Permiso de consulta requerido", { status: 403, code: "REVIEW_PERMISSION_REQUIRED" }));
  return next();
}
