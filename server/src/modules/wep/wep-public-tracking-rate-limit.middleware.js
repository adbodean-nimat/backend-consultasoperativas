export function createWepPublicTrackingRateLimit({
  windowMs = 15 * 60 * 1000,
  maxAttempts = 120,
  now = () => Date.now(),
} = {}) {
  const attemptsByIp = new Map();
  return function wepPublicTrackingRateLimit(request, response, next) {
    const currentTime = now();
    const key = request.ip || request.socket?.remoteAddress || "unknown";
    let entry = attemptsByIp.get(key);
    if (!entry || entry.resetAt <= currentTime) {
      entry = { attempts: 0, resetAt: currentTime + windowMs };
      attemptsByIp.set(key, entry);
    }
    if (entry.attempts >= maxAttempts) {
      response.set("Retry-After", String(Math.ceil((entry.resetAt - currentTime) / 1000)));
      return response.status(429).json({
        ok: false,
        message: "Demasiadas consultas. Intente nuevamente más tarde",
      });
    }
    entry.attempts += 1;
    return next();
  };
}

export default createWepPublicTrackingRateLimit();
