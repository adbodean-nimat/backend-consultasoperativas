const LIST_FILTERS = [
  "compradores",
  "clasificacion4",
  "clasificacion5",
  "clasificacion6",
  "clasificacion8",
];

const EMPTY_OPTIONS = new Set(["todos", "todas"]);
const MAX_LIST_VALUES = 100;
const MAX_TEXT_LENGTH = 100;
const MAX_DAYS = 2147483647;

export class RotacionGeneralProductosValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RotacionGeneralProductosValidationError";
  }
}

function queryValues(query, name) {
  const values = [];
  for (const key of [name, `${name}[]`]) {
    if (query[key] === undefined) continue;
    values.push(...(Array.isArray(query[key]) ? query[key] : [query[key]]));
  }
  return values;
}

function parseList(query, name) {
  const values = queryValues(query, name)
    .map((value) => String(value).trim())
    .filter((value) => value && !EMPTY_OPTIONS.has(value.toLocaleLowerCase("es")));

  if (values.some((value) => value.length > MAX_TEXT_LENGTH)) {
    throw new RotacionGeneralProductosValidationError(
      `${name} contiene un valor demasiado largo`,
    );
  }

  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length > MAX_LIST_VALUES) {
    throw new RotacionGeneralProductosValidationError(
      `${name} admite hasta ${MAX_LIST_VALUES} valores`,
    );
  }
  return uniqueValues;
}

function parseEnum(query, name, allowedValues) {
  const values = queryValues(query, name);
  if (!values.length) return null;
  if (values.length !== 1) {
    throw new RotacionGeneralProductosValidationError(
      `${name} debe tener un solo valor`,
    );
  }

  const value = String(values[0]).trim().toLocaleLowerCase("es");
  if (!value || EMPTY_OPTIONS.has(value)) return null;
  if (!allowedValues.includes(value)) {
    throw new RotacionGeneralProductosValidationError(
      `${name} debe ser uno de: ${allowedValues.join(", ")}`,
    );
  }
  return value;
}

function parseDays(query, name) {
  const values = queryValues(query, name);
  if (!values.length || values[0] === "" || values[0] === null) return null;
  if (values.length !== 1 || !/^\d+$/.test(String(values[0]).trim())) {
    throw new RotacionGeneralProductosValidationError(
      `${name} debe ser un entero mayor o igual a cero`,
    );
  }

  const value = Number(values[0]);
  if (!Number.isSafeInteger(value) || value > MAX_DAYS) {
    throw new RotacionGeneralProductosValidationError(
      `${name} está fuera del rango permitido`,
    );
  }
  return value;
}

export function validarFiltrosRotacionGeneralProductos(query = {}) {
  const filters = Object.fromEntries(
    LIST_FILTERS.map((name) => [name, parseList(query, name)]),
  );

  filters.stock = parseEnum(query, "stock", ["positivo", "cero", "negativo"]);
  filters.exhibicion = parseEnum(query, "exhibicion", ["con", "sin"]);
  filters.diasDesde = parseDays(query, "diasDesde");
  filters.diasHasta = parseDays(query, "diasHasta");

  if (
    filters.diasDesde !== null &&
    filters.diasHasta !== null &&
    filters.diasDesde > filters.diasHasta
  ) {
    throw new RotacionGeneralProductosValidationError(
      "diasDesde no puede ser mayor que diasHasta",
    );
  }

  return filters;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasExhibition(value) {
  if (typeof value === "boolean") return value;
  const number = toFiniteNumber(value);
  if (number !== null) return number > 0;
  return ["si", "sí", "true", "s"].includes(
    String(value).trim().toLocaleLowerCase("es"),
  );
}

export function filtrarRotacionGeneralProductos(rows, filters) {
  const selected = {
    compradores: new Set(filters.compradores),
    clasificacion4: new Set(filters.clasificacion4),
    clasificacion5: new Set(filters.clasificacion5),
    clasificacion6: new Set(filters.clasificacion6),
    clasificacion8: new Set(filters.clasificacion8),
  };

  return rows.filter((row) => {
    if (
      selected.compradores.size &&
      !selected.compradores.has(row["Nombre Comprador"])
    )
      return false;
    if (
      selected.clasificacion4.size &&
      !selected.clasificacion4.has(row.CA04_NOMBRE)
    )
      return false;
    if (
      selected.clasificacion5.size &&
      !selected.clasificacion5.has(row.CA05_NOMBRE)
    )
      return false;
    if (
      selected.clasificacion6.size &&
      !selected.clasificacion6.has(row.CA06_NOMBRE)
    )
      return false;
    if (
      selected.clasificacion8.size &&
      !selected.clasificacion8.has(row.CA08_NOMBRE)
    )
      return false;

    const stock = toFiniteNumber(row["Stock Disp"]);
    if (filters.stock === "positivo" && !(stock > 0)) return false;
    if (filters.stock === "cero" && stock !== 0) return false;
    if (filters.stock === "negativo" && !(stock < 0)) return false;

    const exhibition = hasExhibition(row.Exhibido);
    if (filters.exhibicion === "con" && !exhibition) return false;
    if (filters.exhibicion === "sin" && exhibition) return false;

    const days = toFiniteNumber(row["Días sin venta"]);
    if (
      filters.diasDesde !== null &&
      (days === null || days < filters.diasDesde)
    )
      return false;
    if (
      filters.diasHasta !== null &&
      (days === null || days > filters.diasHasta)
    )
      return false;

    return true;
  });
}
