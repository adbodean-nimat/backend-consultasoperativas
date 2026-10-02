import { byFamily, numeric, factorWarning } from "./gdc.mapper.js";
export async function loadSalesOrders(repository, config, signal, readBlock) {
  return byFamily(await readBlock("salesOrders", () => repository.salesOrders(config, signal)));
}
export function familySalesOrder(row) {
  return { ton: row ? Number(row.invalidFactors) > 0 ? null : numeric(row.ton) : 0, warnings: row && Number(row.invalidFactors) > 0 ? [factorWarning("salesOrders", row.invalidFactors)] : [] };
}
