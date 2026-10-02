import { GdcError, GdcValidationError } from "./gdc.errors.js";

export const LIMITS = Object.freeze({ months: 60, rotationDays: 3660, list: 300 });
export const RESOURCES = Object.freeze({
  familias: { table: "gdc_familias_chapas", key: "clasificador_5", fields: ["nombre", "codigo_ref_hl", "codigo_ref_1050", "codigo_ref_13m", "notas", "orden", "activo"] },
  "tipos-articulo-chapa": { table: "gdc_tipos_articulo_chapa", key: "codigo", fields: ["nombre", "activo"] },
  "depositos-excluidos": { table: "gdc_depositos_excluidos", key: "codigo_deposito", fields: ["nombre", "activo"] },
  "comprobantes-consumo-ventas": { table: "gdc_comprobantes_consumo_ventas", key: "codigo_comprobante", fields: ["nombre", "activo"] },
  "tipos-np": { table: "gdc_tipos_nota_pedido", key: "codigo_tipo_np", fields: ["nombre", "activo"] },
  general: { table: "gdc_configuracion", key: "id", fields: ["meses_consumo_default", "dias_rotacion_default", "deposito_principal", "proveedor_oc", "clasificador_8_excluido_stock"] },
});

function invalid(field, message) { throw new GdcValidationError([{ field, message }]); }
export function positiveInteger(value, field, max = 2147483647) {
  if ((typeof value !== "string" && typeof value !== "number") || !/^\d+$/.test(String(value))) invalid(field, "Debe ser un entero positivo");
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) invalid(field, `Debe estar entre 1 y ${max}`);
  return number;
}
function text(value, field, max, pattern) {
  if (typeof value !== "string" || !value.trim() || value.length > max || (pattern && !pattern.test(value))) invalid(field, "Formato de texto inválido");
  return value.trim();
}
export function resourceDefinition(resource) {
  const definition = Object.hasOwn(RESOURCES, resource) && RESOURCES[resource];
  if (!definition) throw new GdcError("Recurso inexistente", { status: 404, code: "GDC_RESOURCE_NOT_FOUND" });
  return definition;
}
export function validateKey(definition, value) {
  if (definition.key === "id") return positiveInteger(value, "id", 1);
  if (definition.key === "codigo_deposito") return positiveInteger(value, definition.key);
  const length = definition.key === "clasificador_5" ? 4 : 3;
  const numeric = ["clasificador_5", "codigo"].includes(definition.key);
  return text(value, definition.key, length, numeric ? new RegExp(`^[0-9]{${length}}$`) : /^[A-Za-z0-9]{1,3}$/);
}
export function validateChanges(definition, body, key, create = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("body", "Debe ser un objeto JSON");
  const allowed = new Set([...definition.fields, definition.key]);
  for (const field of Object.keys(body)) if (!allowed.has(field)) invalid(field, "Campo no permitido");
  if (body[definition.key] !== undefined && validateKey(definition, body[definition.key]) !== key) invalid(definition.key, "El código no puede modificarse");
  const changes = {};
  for (const field of definition.fields) {
    if (body[field] === undefined) continue;
    const value = body[field];
    if (field === "activo") { if (typeof value !== "boolean") invalid(field, "Debe ser booleano"); changes[field] = value; }
    else if (field === "notas") { if (value !== null && (typeof value !== "string" || value.length > 10000)) invalid(field, "Texto de hasta 10000 caracteres o null"); changes[field] = value; }
    else if (field.startsWith("codigo_ref_")) changes[field] = value === null ? null : text(value, field, 20);
    else if (field === "nombre") changes[field] = text(value, field, 150);
    else if (field === "clasificador_8_excluido_stock") changes[field] = text(value, field, 4, /^[0-9]{4}$/);
    else if (field === "proveedor_oc" && value === null) changes[field] = null;
    else changes[field] = positiveInteger(value, field, field === "meses_consumo_default" ? LIMITS.months : field === "dias_rotacion_default" ? LIMITS.rotationDays : field === "orden" ? 32767 : 2147483647);
  }
  if (create && definition.key !== "id") changes.activo ??= true;
  if (!Object.keys(changes).length) invalid("body", "Debe enviar cambios");
  return changes;
}
export function validateRecord(definition, record) {
  validateKey(definition, record[definition.key]);
  validateChanges(definition, record, record[definition.key]);
  for (const field of definition.fields) {
    if (["codigo_ref_hl", "codigo_ref_1050", "codigo_ref_13m", "notas", "proveedor_oc"].includes(field)) continue;
    if (record[field] === undefined || record[field] === null) invalid(field, "Campo obligatorio");
  }
  if (definition.key === "clasificador_5") {
    if (!record.codigo_ref_hl && !record.codigo_ref_13m) invalid("codigo_ref_hl", "Debe existir una referencia HL o 13 m");
    if (Boolean(record.codigo_ref_1050) !== Boolean(record.codigo_ref_13m)) invalid("codigo_ref_1050", "Las referencias 10,50 m y 13 m deben estar completas");
  }
}
export function calculationParameters(query, config, now = new Date()) {
  for (const field of Object.keys(query)) if (!["months", "rotationDays"].includes(field)) invalid(field, "Parámetro no permitido");
  const months = positiveInteger(query.months ?? config.meses_consumo_default, "months", LIMITS.months);
  const rotationDays = positiveInteger(query.rotationDays ?? config.dias_rotacion_default, "rotationDays", LIMITS.rotationDays);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type) => Number(parts.find((item) => item.type === type).value);
  const year = part("year"), month = part("month") - 1;
  const iso = (date) => date.toISOString().slice(0, 10);
  const today = new Date(Date.UTC(year, month, part("day")));
  const periods = Array.from({ length: months + 1 }, (_, i) => iso(new Date(Date.UTC(year, month - months + i, 1))).slice(0, 7));
  const rotationFrom = iso(new Date(today.getTime() - rotationDays * 86400000));
  return { parameters: { months, rotationDays, mainWarehouse: config.deposito_principal, purchaseOrderSupplier: config.proveedor_oc, dateFrom: `${periods[0]}-01`, dateToExclusive: iso(new Date(Date.UTC(year, month + 1, 1))), rotationDateFrom: rotationFrom, rotationDateToExclusive: iso(today) }, periods };
}
