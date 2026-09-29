export const GESTION_SCHEDULE_CONFIG_KEY = "gestion_sincronizacion_automatica";
export const GESTION_SCHEDULE_ADVISORY_LOCK_KEY = 1_948_271_606;
export const GESTION_SCHEDULE_REFRESH_MS = 60_000;
export const GESTION_SCHEDULE_SYSTEM_USER = "sistema:gestion-cron";

export const DEFAULT_GESTION_SCHEDULE = Object.freeze({
  activo: true,
  cron: "30 10 * * 5",
  timezone: "America/Argentina/Buenos_Aires",
});
