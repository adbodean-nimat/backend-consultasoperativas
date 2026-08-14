import jwt from "jsonwebtoken";
import { authPool, findUserAccess, normalizeSam } from "./auth.repository.js";

const JWT_ALGORITHMS = ["HS256"];

function authError(res, status, code, message) {
  return res.status(status).json({ ok: false, code, message });
}

// Middleware global histórico de /api. Mantiene su contrato para no afectar
// Simulador ni Consultas Operativas; Gestión aplica además requirePermission.
export function verifyUserToken(req, res, next) {
  if (!req.headers.authorization) {
    return res.status(401).send("Solicitud no autorizada");
  }
  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send("Acceso denegado. No se proporcionó token.");
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = decoded;
    req.user = decoded.user;
    return next();
  } catch {
    return res.status(400).send("Token inválido.");
  }
}

export function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  const match =
    typeof authorization === "string"
      ? authorization.match(/^Bearer\s+([^\s]+)$/i)
      : null;
  if (!match) {
    return authError(
      res,
      401,
      "AUTH_TOKEN_REQUIRED",
      "Se requiere una sesión válida.",
    );
  }

  try {
    const decoded = jwt.verify(match[1], process.env.JWT_SECRET, {
      algorithms: JWT_ALGORITHMS,
    });
    if (!decoded || typeof decoded !== "object")
      throw new Error("JWT inválido");
    const username = normalizeSam(
      decoded.username ?? decoded.user?.sAMAccountName,
    );
    req.auth = { ...decoded, username };
    req.user = decoded.user ?? decoded;
    return next();
  } catch {
    return authError(
      res,
      401,
      "AUTH_TOKEN_INVALID",
      "La sesión es inválida o expiró.",
    );
  }
}

export function requirePermission(
  permission,
  { lookup = findUserAccess } = {},
) {
  return async function permissionMiddleware(req, res, next) {
    const username = normalizeSam(
      req.auth?.username ?? req.user?.sAMAccountName,
    );
    if (!username) {
      return authError(
        res,
        401,
        "AUTH_TOKEN_INVALID",
        "La sesión no identifica un usuario válido.",
      );
    }
    try {
      const access = await lookup(authPool, username);
      if (!access?.activo || !access.permissions.includes(permission)) {
        return authError(
          res,
          403,
          "GESTION_PERMISSION_DENIED",
          "No tenés permiso para realizar esta acción.",
        );
      }
      req.auth.userId = access.id;
      req.auth.roles = access.roles;
      req.auth.permissions = access.permissions;
      req.user = {
        ...(req.user ?? {}),
        sAMAccountName: access.sam_account_name,
      };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
