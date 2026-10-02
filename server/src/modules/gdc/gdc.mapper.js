export const add = (left, right) => left === null || right === null ? null : left + right;
export function numeric(value) {
  if (value === null) return null;
  const number = Number(value);
  if (value === undefined || !Number.isFinite(number)) throw new Error("GDC_INVALID_ERP_RESULT");
  return number;
}
export const zeroWarehouses = () => ({ mainWarehouse: 0, otherWarehouses: 0, total: 0 });
export const byFamily = (rows) => new Map(rows.map((row) => [row.classifier5, row]));
export function groupRows(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.classifier5)) map.set(row.classifier5, []);
    map.get(row.classifier5).push(row);
  }
  return map;
}
export function factorWarning(block, invalidFactors, extra = {}) {
  return { code: "INVALID_FACTOR", block, count: numeric(invalidFactors), ...extra };
}
