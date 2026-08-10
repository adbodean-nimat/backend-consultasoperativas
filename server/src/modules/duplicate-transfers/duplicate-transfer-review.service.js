import { getConfig } from "./duplicate-transfer-config.service.js";
import sqlRepository from "./sql-server-duplicate-transfer.repository.js";
import { DuplicateTransferError, DuplicateTransferValidationError } from "./duplicate-transfer.errors.js";
import { formatDecimal, localDateTimeToInstant, localParts, normalizeMovements, sumDecimals } from "./duplicate-transfer.normalizer.js";
import { validateWindow } from "./duplicate-transfer.validator.js";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseReviewDate(value, timezone, endOfDay) {
  const match = DATE_ONLY.exec(value);
  if (!match) return new Date(value);
  const [, year, month, day] = match;
  const instant = localDateTimeToInstant({
    year: Number(year), month: Number(month), day: Number(day),
    hour: endOfDay ? 23 : 0, minute: endOfDay ? 59 : 0, second: endOfDay ? 59 : 0,
  }, timezone);
  const local = localParts(instant, timezone);
  if (`${local.year}-${local.month}-${local.day}` !== value) throw new DuplicateTransferValidationError([{ field: endOfDay ? "to" : "from", message: "Fecha inválida" }]);
  return instant;
}

function localIsoDate(date, timezone) {
  const parts = localParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export class DuplicateTransferReviewService {
  constructor({ configLoader = getConfig, sql = sqlRepository, now = () => new Date() } = {}) {
    this.configLoader = configLoader;
    this.sql = sql;
    this.now = now;
  }

  async review({ from: fromInput, to: toInput, accountCode, clientCode, page, pageSize }) {
    const config = await this.configLoader();
    const timezone = config.timezone;
    let to = toInput ? parseReviewDate(toInput, timezone, true) : this.now();
    let from = fromInput ? parseReviewDate(fromInput, timezone, false) : new Date(to.valueOf() - config.lookback_days * 86_400_000);
    validateWindow(from, to);

    const normalizedAccount = accountCode ? String(accountCode).trim().toUpperCase() : null;
    const allowedAccounts = config.account_codes.map((value) => String(value).trim().toUpperCase());
    if (normalizedAccount && !allowedAccounts.includes(normalizedAccount)) throw new DuplicateTransferValidationError([{ field: "accountCode", message: "La cuenta no está habilitada para esta consulta" }]);

    const rows = await this.sql.detect({
      from, to, timezone,
      origin: config.erp_origin,
      accountCodes: normalizedAccount ? [normalizedAccount] : config.account_codes,
      minimumCoincidences: config.minimum_coincidences,
      timeoutSeconds: config.query_timeout_seconds,
    });
    if (rows.length > config.max_results) throw new DuplicateTransferError("La consulta superó el máximo de resultados permitido", { status: 422, code: "MAX_RESULTS_EXCEEDED" });

    const normalizedClient = clientCode ? String(clientCode).trim().toUpperCase() : null;
    const movements = normalizeMovements(rows)
      .filter((movement) => (!normalizedAccount || movement.accountCode === normalizedAccount) && (!normalizedClient || movement.clientCode === normalizedClient));
    const totalItems = movements.length;
    const offset = (page - 1) * pageSize;
    const items = movements.slice(offset, offset + pageSize).map((movement) => ({
      date: movement.movementDate,
      division: movement.division,
      entryNumber: movement.entry,
      receipt: movement.receipt,
      accountCode: movement.accountCode,
      accountName: movement.accountName,
      amount: formatDecimal(movement.amount),
      sign: movement.sign,
      clientCode: movement.clientCode,
      clientName: movement.clientName,
      coincidenceCount: movement.coincidenceCount,
      firstDate: movement.firstDate,
      lastDate: movement.lastDate,
      daysBetween: movement.daysBetween,
    }));

    return {
      filters: { from: localIsoDate(from, timezone), to: localIsoDate(to, timezone), accountCode: normalizedAccount, clientCode: normalizedClient },
      summary: { groupCount: new Set(movements.map((movement) => movement.groupKey)).size, movementCount: totalItems, totalAmount: sumDecimals(movements.map((movement) => movement.amount)) },
      pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
      items,
    };
  }
}

export default new DuplicateTransferReviewService();
