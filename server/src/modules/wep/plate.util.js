export function normalizePlate(value) {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim().replace(/\s+/g, "").toUpperCase();
  return normalized || null;
}

