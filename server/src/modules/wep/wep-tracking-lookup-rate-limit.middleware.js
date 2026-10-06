import { auditTrackingLookup } from "./wep-tracking-lookup.service.js";

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createWepTrackingLookupRateLimit({
  windowMs = positiveInteger(process.env.WEP_TRACKING_LOOKUP_RATE_LIMIT_WINDOW_MINUTES, 10) * 60_000,
  maxAttempts = positiveInteger(process.env.WEP_TRACKING_LOOKUP_RATE_LIMIT_MAX, 5),
  now = () => Date.now(),
  logger = console,
} = {}) {
  const attemptsByIp = new Map();
  let nextCleanup = 0;
  return function trackingLookupRateLimit(request, response, next) {
    response.set("Cache-Control", "no-store");
    const currentTime = now();
    if (currentTime >= nextCleanup) {
      for (const [ip, entry] of attemptsByIp) {
        if (entry.resetAt <= currentTime) attemptsByIp.delete(ip);
      }
      nextCleanup = currentTime + windowMs;
    }
    // req.ip respeta el trust proxy configurado por Express; no confiar en headers crudos.
    const key = request.ip || request.socket?.remoteAddress || "unknown";
    let entry = attemptsByIp.get(key);
    if (!entry || entry.resetAt <= currentTime) {
      entry = { attempts: 0, resetAt: currentTime + windowMs };
      attemptsByIp.set(key, entry);
    }
    if (entry.attempts >= maxAttempts) {
      auditTrackingLookup(request, "RATE_LIMITED", logger);
      response.set("Retry-After", String(Math.ceil((entry.resetAt - currentTime) / 1000)));
      return response.status(429).json({
        ok: false,
        message: "Realizaste varios intentos. Esperá unos minutos antes de volver a intentar.",
      });
    }
    entry.attempts += 1;
    return next();
  };
}

export default createWepTrackingLookupRateLimit();
