import { add, numeric, zeroWarehouses, groupRows, factorWarning } from "./gdc.mapper.js";
export async function loadStock(repository, config, signal, readBlock) {
  return groupRows(await readBlock("stock", () => repository.stock(config, signal)));
}
export function familyStock(family, rows = [], rotationTon, rotationDays) {
  const warnings = [];
  const ton = zeroWarehouses();
  const stock = { ton };
  for (const [name, field] of [["units13m", "codigo_ref_13m"], ["units1050", "codigo_ref_1050"], ["unitsHl", "codigo_ref_hl"]]) stock[name] = { referenceCode: family[field] ?? null, ...zeroWarehouses() };
  for (const row of rows) {
    ton.mainWarehouse = add(ton.mainWarehouse, numeric(row.mainTon));
    ton.otherWarehouses = add(ton.otherWarehouses, numeric(row.otherTon));
    ton.total = add(ton.total, numeric(row.totalTon));
    if (Number(row.invalidFactors) > 0) warnings.push(factorWarning("stock", row.invalidFactors, { articleCode: row.code }));
    for (const name of ["units13m", "units1050", "unitsHl"]) {
      if (stock[name].referenceCode !== null && row.code === stock[name].referenceCode) {
        stock[name].mainWarehouse += numeric(row.mainUnits);
        stock[name].otherWarehouses += numeric(row.otherUnits);
        stock[name].total += numeric(row.totalUnits);
      }
    }
  }
  ton.days = null;
  ton.daysStatus = rotationTon === null ? "INVALID_CONSUMPTION_FACTOR" : ton.total === null ? "INVALID_STOCK_FACTOR" : rotationTon <= 0 ? "NO_CONSUMPTION" : "OK";
  if (ton.daysStatus === "OK") ton.days = ton.total / (rotationTon / rotationDays);
  return { stock, warnings };
}
