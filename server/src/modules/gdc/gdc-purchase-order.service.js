import { add, numeric, groupRows, factorWarning } from "./gdc.mapper.js";
export async function loadPurchaseOrders(repository, config, signal, readBlock) {
  return groupRows(await readBlock("purchaseOrders", () => repository.purchaseOrders(config, signal)));
}
export function familyPurchaseOrders(family, rows = []) {
  const purchaseOrders = { pendingTon: 0, units13m: 0, units1050: 0, unitsHl: 0 };
  const warnings = [];
  for (const row of rows) {
    purchaseOrders.pendingTon = add(purchaseOrders.pendingTon, Number(row.invalidFactors) > 0 ? null : numeric(row.ton));
    for (const [name, field] of [["units13m", "codigo_ref_13m"], ["units1050", "codigo_ref_1050"], ["unitsHl", "codigo_ref_hl"]]) if (family[field] && row.code === family[field]) purchaseOrders[name] += numeric(row.units);
    if (Number(row.invalidFactors) > 0) warnings.push(factorWarning("purchaseOrders", row.invalidFactors, { articleCode: row.code }));
  }
  return { purchaseOrders, warnings };
}
