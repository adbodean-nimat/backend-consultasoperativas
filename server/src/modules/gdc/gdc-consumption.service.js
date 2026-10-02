import { add, numeric, factorWarning } from "./gdc.mapper.js";

export async function loadConsumption(repository, config, parameters, signal, readBlock) {
  const [production, sales] = await Promise.all([
    readBlock("production", () => repository.production(config, parameters, signal)),
    readBlock("salesRemittances", () => repository.salesRemittances(config, parameters, signal)),
  ]);
  const index = (rows) => {
    const map = new Map();
    for (const row of rows) map.set(`${row.classifier5}:${row.scope}:${row.period ?? ""}`, row);
    return map;
  };
  return { production: index(production), sales: index(sales) };
}
export function familyConsumption(classifier5, periods, maps) {
  const warnings = [];
  const get = (map, scope, period, block) => {
    const row = map.get(`${classifier5}:${scope}:${period ?? ""}`);
    if (!row) return 0;
    if (Number(row.invalidFactors) > 0) { warnings.push(factorWarning(block, row.invalidFactors, { scope, period })); return null; }
    return numeric(row.ton);
  };
  const consumption = periods.map((period) => {
    const productionTon = get(maps.production, "monthly", period, "production");
    const salesRemittancesTon = get(maps.sales, "monthly", period, "salesRemittances");
    return { period, productionTon, salesRemittancesTon, totalConsumptionTon: add(productionTon, salesRemittancesTon) };
  });
  const rotationTon = add(get(maps.production, "rotation", null, "production"), get(maps.sales, "rotation", null, "salesRemittances"));
  return { consumption, rotationTon, warnings };
}
