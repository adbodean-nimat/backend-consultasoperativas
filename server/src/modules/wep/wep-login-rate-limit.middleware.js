const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 10;

export function createWepLoginRateLimit({
  windowMs = DEFAULT_WINDOW_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  now = () => Date.now(),
} = {}) {
  const attemptsByIp = new Map();

  return function wepLoginRateLimit(request, response, next) {
    const currentTime = now();
    const key = request.ip || request.socket?.remoteAddress || "unknown";
    let entry = attemptsByIp.get(key);

    if (!entry || entry.resetAt <= currentTime) {
      entry = { attempts: 0, resetAt: currentTime + windowMs };
      attemptsByIp.set(key, entry);
    }

    if (entry.attempts >= maxAttempts) {
      response.set(
        "Retry-After",
        String(Math.ceil((entry.resetAt - currentTime) / 1000)),
      );
      return response.status(429).json({
        ok: false,
        message: "Demasiados intentos de login. Intente nuevamente más tarde",
      });
    }

    entry.attempts += 1;
    return next();
  };
}

export const wepLoginRateLimit = createWepLoginRateLimit();

export default wepLoginRateLimit;
