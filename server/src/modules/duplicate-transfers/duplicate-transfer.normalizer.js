import { createHash } from "node:crypto";
import { DuplicateTransferError } from "./duplicate-transfer.errors.js";

const text = (value) => String(value ?? "").trim().normalize("NFKC");
const keyText = (value) => text(value).toUpperCase();
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

export function normalizeDecimal(value, scale = 2) {
  if (value === null || value === undefined || value === "") throw new DuplicateTransferError("El procedimiento devolvió un importe vacío", { code: "INVALID_AMOUNT" });
  let raw = typeof value === "number" ? value.toFixed(scale) : String(value).trim().replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) throw new DuplicateTransferError("El procedimiento devolvió un importe inválido", { code: "INVALID_AMOUNT" });
  const negative = raw.startsWith("-");
  raw = raw.replace(/^[+-]/, "");
  let [integer, fraction = ""] = raw.split(".");
  integer = integer.replace(/^0+(?=\d)/, "") || "0";
  fraction = fraction.padEnd(scale, "0").slice(0, scale).replace(/0+$/, "");
  if (integer === "0" && !fraction) return "0";
  return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

export function formatDecimal(value, scale = 2) {
  const normalized = normalizeDecimal(value, scale);
  const negative = normalized.startsWith("-");
  const unsigned = normalized.replace(/^-/, "");
  const [integer, fraction = ""] = unsigned.split(".");
  return `${negative ? "-" : ""}${integer}.${fraction.padEnd(scale, "0")}`;
}

export function sumDecimals(values, scale = 2) {
  const factor = 10n ** BigInt(scale);
  const total = values.reduce((sum, value) => {
    const normalized = formatDecimal(value, scale);
    const negative = normalized.startsWith("-");
    const [integer, fraction] = normalized.replace(/^-/, "").split(".");
    const units = BigInt(integer) * factor + BigInt(fraction);
    return sum + (negative ? -units : units);
  }, 0n);
  const negative = total < 0n;
  const absolute = negative ? -total : total;
  const integer = absolute / factor;
  const fraction = String(absolute % factor).padStart(scale, "0");
  return `${negative ? "-" : ""}${integer}.${fraction}`;
}

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new DuplicateTransferError("El procedimiento devolvió una fecha inválida", { code: "INVALID_MOVEMENT_DATE" });
  return date.toISOString().slice(0, 10);
}

function optionalIsoDate(value) {
  return value === null || value === undefined || value === "" ? null : isoDate(value);
}

export function normalizeMovement(row) {
  const division = keyText(row.CASI_DIVISION);
  const entry = keyText(row.CASI_ASIENTO);
  const sourceLineKey = keyText(row.RASI_RENGLON);
  const movementDate = isoDate(row.CASI_FECHA);
  const accountCode = keyText(row.CUEN_CUENTA);
  const amount = normalizeDecimal(row.RASI_IMP_LOC, 2);
  const sign = keyText(row.RASI_SIGNO);
  const clientCode = keyText(row.CLIE_CLIENTE);
  const currentAccount = keyText(row.CTEC_CTACTE_CTEC);
  const origin = keyText(row.CASI_ORIGEN);
  if (!division || !entry || !accountCode || !clientCode || !currentAccount || !origin || !sign) throw new DuplicateTransferError("El procedimiento devolvió identificadores obligatorios vacíos", { code: "INVALID_SOURCE_ROW" });
  if (sign !== "D") throw new DuplicateTransferError("El procedimiento devolvió un movimiento con signo no permitido", { code: "UNEXPECTED_MOVEMENT_SIGN" });
  const groupKey = sha256(`${accountCode}|${amount}|${clientCode}|${sign}`);
  const fallback = sourceLineKey
    ? `${division}|${entry}|${sourceLineKey}`
    : `${division}|${entry}|${movementDate}|${accountCode}|${amount}|${sign}|${clientCode}|${currentAccount}`;
  return {
    sourceKey: sha256(fallback), groupKey, division, entry, sourceLineKey: sourceLineKey || null, movementDate,
    accountCode, accountName: text(row.CUEN_NOMBRE) || null, amount, clientCode,
    clientName: text(row.CLIE_NOMBRE) || null, sign, currentAccount,
    receipt: text(row.COMPROBANTE) || null, origin,
    coincidenceCount: row.CANTIDAD_COINCIDENCIAS === null || row.CANTIDAD_COINCIDENCIAS === undefined ? null : Number(row.CANTIDAD_COINCIDENCIAS),
    firstDate: optionalIsoDate(row.PRIMERA_FECHA),
    lastDate: optionalIsoDate(row.ULTIMA_FECHA),
    daysBetween: row.DIAS_ENTRE_COINCIDENCIAS === null || row.DIAS_ENTRE_COINCIDENCIAS === undefined ? null : Number(row.DIAS_ENTRE_COINCIDENCIAS),
  };
}

export function normalizeMovements(rows) {
  const movements = rows.map(normalizeMovement);
  const seen = new Set();
  for (const movement of movements) {
    if (seen.has(movement.sourceKey)) throw new DuplicateTransferError("Se detectó una colisión en sourceKey; la ejecución no puede notificarse", { code: "SOURCE_KEY_COLLISION" });
    seen.add(movement.sourceKey);
  }
  return movements;
}

export function maskPhone(value) {
  const phone = String(value || "");
  return phone ? `******${phone.slice(-4)}` : null;
}

export function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function localDateTimeToInstant({ year, month, day, hour = 0, minute = 0, second = 0 }, timezone) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = new Date(desired);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = localParts(instant, timezone);
    const observed = Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day), Number(current.hour), Number(current.minute), Number(current.second));
    instant = new Date(instant.valueOf() + desired - observed);
  }
  return instant;
}

export function toSqlServerLocalDate(date, timezone) {
  const p = localParts(date, timezone);
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)));
}

export function formatLocalDate(date, timezone) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
