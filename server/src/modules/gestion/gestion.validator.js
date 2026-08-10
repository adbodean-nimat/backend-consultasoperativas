import {
  AUTOMATIC_INDICATORS,
  DEFAULT_LIMIT,
  ESTADOS_GESTION,
  MANUAL_INDICATORS,
  MAX_LIMIT,
  NON_NEGATIVE_MANUAL_INDICATORS,
} from "./gestion.constants.js";
import { ValidationError } from "./gestion.errors.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ROOT_FIELDS = new Set([
  "fecha",
  "semana",
  "periodoEtiqueta",
  "estado",
  "sincronizadoEn",
  "fechaSincronizacionPlataforma",
  "automaticos",
  "manuales",
]);

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function isValidDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function addUnknownFieldErrors(value, allowedFields, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) {
      errors.push({ field: `${path}${key}`, message: "Campo no permitido" });
    }
  }
}

function validateNullableNumber(value, path, errors, { nonNegative = false } = {}) {
  if (value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push({ field: path, message: "Debe ser un número finito o null" });
    return;
  }
  if (nonNegative && value < 0) {
    errors.push({ field: path, message: "No puede ser negativo" });
  }
}

function validateIndicatorObject(
  value,
  mapping,
  path,
  errors,
  { required, requireAll, manual = false, optionalFields = new Set() },
) {
  if (value === undefined) {
    if (required) errors.push({ field: path.slice(0, -1), message: "Es obligatorio" });
    return;
  }
  if (!isObject(value)) {
    errors.push({ field: path.slice(0, -1), message: "Debe ser un objeto" });
    return;
  }

  const allowed = new Set(Object.keys(mapping));
  if (manual) {
    allowed.add("observacion");
    allowed.add("otrosActual");
    allowed.add("opvOtrosProyectadoSemana");
  }
  addUnknownFieldErrors(value, allowed, path, errors);

  for (const key of Object.keys(mapping)) {
    if (!hasOwn(value, key)) {
      if (requireAll && !optionalFields.has(key)) {
        errors.push({ field: `${path}${key}`, message: "Es obligatorio" });
      }
      continue;
    }
    validateNullableNumber(value[key], `${path}${key}`, errors, {
      nonNegative: manual && NON_NEGATIVE_MANUAL_INDICATORS.has(key),
    });
  }

  if (manual && hasOwn(value, "observacion")) {
    const observation = value.observacion;
    if (observation !== null && typeof observation !== "string") {
      errors.push({ field: `${path}observacion`, message: "Debe ser texto o null" });
    }
  }

  if (manual && hasOwn(value, "opvOtrosProyectadoSemana")) {
    validateNullableNumber(
      value.opvOtrosProyectadoSemana,
      `${path}opvOtrosProyectadoSemana`,
      errors,
      { nonNegative: true },
    );
  }

  if (manual && hasOwn(value, "otrosActual")) {
    validateNullableNumber(value.otrosActual, `${path}otrosActual`, errors, {
      nonNegative: true,
    });
    if (value.otrosActual !== null) {
      errors.push({
        field: `${path}otrosActual`,
        message: "Todavía no existe una fuente persistible para otrosActual; debe enviarse null",
      });
    }
  }

  if (
    manual &&
    hasOwn(value, "otrosPagosProyectados") &&
    hasOwn(value, "opvOtrosProyectadoSemana") &&
    value.otrosPagosProyectados !== value.opvOtrosProyectadoSemana
  ) {
    errors.push({
      field: `${path}otrosPagosProyectados`,
      message: "No puede diferir del alias temporal opvOtrosProyectadoSemana",
    });
  }
}

function validateIsoTimestamp(value, field, errors) {
  if (value === null) return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    errors.push({ field, message: "Debe ser una fecha y hora ISO 8601 o null" });
    return;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    errors.push({ field, message: "Debe ser una fecha y hora ISO 8601 válida" });
  }
}

function validateBody(body, { partial }) {
  const errors = [];
  if (!isObject(body)) throw new ValidationError([{ field: "body", message: "Debe ser un objeto" }]);

  addUnknownFieldErrors(body, ROOT_FIELDS, "", errors);

  if (!partial || hasOwn(body, "fecha")) {
    if (!isValidDate(body.fecha)) {
      errors.push({ field: "fecha", message: "Debe ser una fecha real con formato YYYY-MM-DD" });
    }
  }

  if (hasOwn(body, "periodoEtiqueta")) {
    if (typeof body.periodoEtiqueta !== "string" || !body.periodoEtiqueta.trim()) {
      errors.push({ field: "periodoEtiqueta", message: "Debe ser texto no vacío" });
    }
  }

  if (hasOwn(body, "semana")) {
    if (typeof body.semana !== "string" || !body.semana.trim()) {
      errors.push({ field: "semana", message: "Debe ser texto no vacío" });
    }
  }

  if (
    hasOwn(body, "periodoEtiqueta") &&
    hasOwn(body, "semana") &&
    body.periodoEtiqueta !== body.semana
  ) {
    errors.push({
      field: "semana",
      message: "No puede diferir de periodoEtiqueta",
    });
  }

  if (hasOwn(body, "estado")) {
    if (!ESTADOS_GESTION.has(body.estado)) {
      errors.push({
        field: "estado",
        message: `Debe ser uno de: ${[...ESTADOS_GESTION].join(", ")}`,
      });
    }
  }

  if (hasOwn(body, "fechaSincronizacionPlataforma")) {
    validateIsoTimestamp(
      body.fechaSincronizacionPlataforma,
      "fechaSincronizacionPlataforma",
      errors,
    );
  }
  if (hasOwn(body, "sincronizadoEn")) {
    validateIsoTimestamp(body.sincronizadoEn, "sincronizadoEn", errors);
  }
  if (
    hasOwn(body, "fechaSincronizacionPlataforma") &&
    hasOwn(body, "sincronizadoEn") &&
    body.fechaSincronizacionPlataforma !== body.sincronizadoEn
  ) {
    errors.push({
      field: "sincronizadoEn",
      message: "No puede diferir de fechaSincronizacionPlataforma",
    });
  }

  validateIndicatorObject(body.automaticos, AUTOMATIC_INDICATORS, "automaticos.", errors, {
    required: !partial,
    requireAll: !partial,
    optionalFields: new Set(["ventasNetas", "acopioCierreMes", "diasCaja"]),
  });
  validateIndicatorObject(body.manuales, MANUAL_INDICATORS, "manuales.", errors, {
    required: !partial,
    requireAll: false,
    manual: true,
  });

  if (partial && Object.keys(body).length === 0) {
    errors.push({ field: "body", message: "Debe incluir al menos un campo para actualizar" });
  }

  if (errors.length) throw new ValidationError(errors);

  const normalized = { ...body };
  if (hasOwn(body, "semana")) {
    normalized.periodoEtiqueta = body.semana;
    delete normalized.semana;
  }
  if (hasOwn(body, "sincronizadoEn")) {
    normalized.fechaSincronizacionPlataforma = body.sincronizadoEn;
    delete normalized.sincronizadoEn;
  }
  if (!partial) {
    normalized.periodoEtiqueta ??= buildPeriodoEtiqueta(normalized.fecha);
    normalized.estado ??= "GUARDADO";
    normalized.fechaSincronizacionPlataforma ??= null;
    normalized.automaticos = {
      ...normalized.automaticos,
      ventasNetas: normalized.automaticos.ventasNetas ?? null,
      acopioCierreMes: normalized.automaticos.acopioCierreMes ?? null,
      diasCaja: normalized.automaticos.diasCaja ?? null,
    };
  }

  if (isObject(body.manuales)) {
    normalized.manuales = { ...body.manuales };
    if (
      !hasOwn(normalized.manuales, "otrosPagosProyectados") &&
      hasOwn(normalized.manuales, "opvOtrosProyectadoSemana")
    ) {
      normalized.manuales.otrosPagosProyectados =
        normalized.manuales.opvOtrosProyectadoSemana;
    }
    delete normalized.manuales.opvOtrosProyectadoSemana;
    delete normalized.manuales.otrosActual;
  }

  return normalized;
}

function buildPeriodoEtiqueta(fecha) {
  const start = new Date(`${fecha}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const format = (date) =>
    `${String(date.getUTCDate()).padStart(2, "0")}/${String(
      date.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
  return `${format(start)} a ${format(end)}`;
}

export function validateCreateBody(body) {
  return validateBody(body, { partial: false });
}

export function validateUpdateBody(body, fechaParam) {
  const result = validateBody(body, { partial: true });
  if (hasOwn(result, "fecha") && result.fecha !== fechaParam) {
    throw new ValidationError([
      { field: "fecha", message: "Debe coincidir con la fecha indicada en la URL" },
    ]);
  }
  return result;
}

export function validateDateParam(value, field = "fecha") {
  if (!isValidDate(value)) {
    throw new ValidationError([
      { field, message: "Debe ser una fecha real con formato YYYY-MM-DD" },
    ]);
  }
  return value;
}

function singleQueryValue(value, field, errors) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    errors.push({ field, message: "Debe tener un único valor" });
    return undefined;
  }
  return value;
}

function parseInteger(value, field, errors, { min, max }) {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) {
    errors.push({ field, message: "Debe ser un entero" });
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    errors.push({ field, message: `Debe estar entre ${min} y ${max}` });
    return undefined;
  }
  return parsed;
}

export function validateListQuery(query) {
  const errors = [];
  const allowed = new Set(["desde", "hasta", "estado", "limit", "offset"]);
  addUnknownFieldErrors(query, allowed, "", errors);

  const desde = singleQueryValue(query.desde, "desde", errors);
  const hasta = singleQueryValue(query.hasta, "hasta", errors);
  const estado = singleQueryValue(query.estado, "estado", errors);
  const limitValue = singleQueryValue(query.limit, "limit", errors);
  const offsetValue = singleQueryValue(query.offset, "offset", errors);

  if (desde !== undefined && !isValidDate(desde)) {
    errors.push({ field: "desde", message: "Debe ser una fecha real con formato YYYY-MM-DD" });
  }
  if (hasta !== undefined && !isValidDate(hasta)) {
    errors.push({ field: "hasta", message: "Debe ser una fecha real con formato YYYY-MM-DD" });
  }
  if (desde && hasta && desde > hasta) {
    errors.push({ field: "hasta", message: "No puede ser anterior a desde" });
  }
  if (estado !== undefined && !ESTADOS_GESTION.has(estado)) {
    errors.push({ field: "estado", message: "Estado no permitido" });
  }

  const limit = parseInteger(limitValue, "limit", errors, { min: 1, max: MAX_LIMIT });
  const offset = parseInteger(offsetValue, "offset", errors, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  });

  if (errors.length) throw new ValidationError(errors);
  return {
    desde,
    hasta,
    estado,
    limit: limit ?? DEFAULT_LIMIT,
    offset: offset ?? 0,
  };
}
