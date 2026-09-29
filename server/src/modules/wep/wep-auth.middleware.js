import crypto from "node:crypto";
import wepAuthRepository from "./wep-auth.repository.js";

export function hashWepToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createRequireWepVehicle({
  repository = wepAuthRepository,
  logger = console,
  now = () => new Date(),
} = {}) {
  return async function requireWepVehicle(request, response, next) {
    const authorization = request.headers.authorization;
    if (authorization === undefined) {
      return response.status(401).json({
        ok: false,
        message: "Token WEP requerido",
      });
    }

    const match =
      typeof authorization === "string"
        ? authorization.match(/^Bearer ([^\s]+)$/i)
        : null;
    if (!match) {
      logger.warn?.("[WEP AUTH] Token inválido");
      return response.status(401).json({
        ok: false,
        message: "Token WEP inválido",
      });
    }

    try {
      const authentication = await repository.findTokenWithVehicle(
        hashWepToken(match[1]),
      );
      if (!authentication) {
        logger.warn?.("[WEP AUTH] Token inválido");
        return response.status(401).json({
          ok: false,
          message: "Token WEP inválido",
        });
      }

      if (!authentication.activo) {
        logger.warn?.("[WEP AUTH] Token revocado");
        return response.status(401).json({
          ok: false,
          message: "Token WEP inactivo",
        });
      }

      if (
        authentication.expiraAt !== null &&
        new Date(authentication.expiraAt).getTime() <= now().getTime()
      ) {
        logger.warn?.("[WEP AUTH] Token vencido");
        return response.status(401).json({
          ok: false,
          message: "Token WEP vencido",
        });
      }

      request.wepVehicle = authentication.vehicle;
      logger.log?.(
        `[WEP AUTH] Token válido vehiculoId=${authentication.vehicle.id}`,
      );

      repository.touchLastUsed(authentication.tokenId).catch((error) => {
        logger.warn?.(
          `[WEP AUTH] No se pudo actualizar ultimo_uso_at tokenId=${authentication.tokenId}: ${error.message}`,
        );
      });

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export const requireWepVehicle = createRequireWepVehicle();

export default requireWepVehicle;
