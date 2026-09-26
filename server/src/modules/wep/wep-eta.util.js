export function formatFriendlyEta(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError("El ETA debe ser un número positivo");
  }

  if (value <= 12) return 10;
  return Math.round(value / 5) * 5;
}
