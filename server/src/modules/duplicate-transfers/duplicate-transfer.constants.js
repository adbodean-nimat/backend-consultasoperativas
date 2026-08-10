export const ADVISORY_LOCK_KEY = 1_948_271_604;
export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";
export const MAX_WINDOW_DAYS = 180;
export const CONFIG_REFRESH_MS = 60_000;
export const CONTROL_CODE_PREFIX = "duplicate-transfer";

export const RUN_STATUSES = Object.freeze({
  RUNNING: "running",
  SUCCESS: "success",
  DRY_RUN: "dry_run",
  PARTIAL: "partial",
  FAILED: "failed",
  SKIPPED_LOCKED: "skipped_locked",
  SKIPPED_DISABLED: "skipped_disabled",
});
