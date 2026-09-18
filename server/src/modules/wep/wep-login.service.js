import bcrypt from "bcryptjs";
import wepLoginRepository from "./wep-login.repository.js";
import {
  createWepToken,
  WepVehicleNotFoundError,
} from "./wep-token.service.js";

const BCRYPT_ROUNDS = 12;
const DUMMY_PIN_HASH =
  "$2a$12$C6UzMDM.H6dfI/f/IKcEe.7tL4fR5tB6cP5L5/9z6.0K7wF6GqKfK";

export class WepLoginInvalidCredentialsError extends Error {}

export class WepLoginService {
  constructor({
    repository = wepLoginRepository,
    passwordHasher = bcrypt,
    logger = console,
  } = {}) {
    this.repository = repository;
    this.passwordHasher = passwordHasher;
    this.logger = logger;
  }

  async listVehicles() {
    return this.repository.listLoginVehicles();
  }

  async setVehiclePin(vehiculoId, pin) {
    const vehicle = await this.repository.findVehicleById(vehiculoId);
    if (!vehicle) {
      throw new WepVehicleNotFoundError("Vehículo no encontrado");
    }

    const pinHash = await this.passwordHasher.hash(pin, BCRYPT_ROUNDS);
    return this.repository.updateVehiclePin(vehiculoId, pinHash);
  }

  async login(vehiculoId, pin) {
    let result;
    try {
      result = await this.repository.runInTransaction(async (transaction) => {
        const authentication =
          await transaction.findEligibleVehicleForLogin(vehiculoId);
        const pinMatches = await this.passwordHasher.compare(
          pin,
          authentication?.pinHash || DUMMY_PIN_HASH,
        );

        if (!authentication || !pinMatches) {
          throw new WepLoginInvalidCredentialsError(
            "Camión o PIN incorrecto",
          );
        }

        const token = createWepToken();
        await transaction.revokeActiveVehicleTokens(vehiculoId);
        await transaction.createVehicleToken(vehiculoId, token.tokenHash);

        return {
          token: token.plainToken,
          vehicle: authentication.vehicle,
        };
      });
    } catch (error) {
      if (error instanceof WepLoginInvalidCredentialsError) {
        this.logger.warn?.("[WEP AUTH] Login inválido");
      }
      throw error;
    }

    this.logger.log?.(
      `[WEP AUTH] Nuevo token generado vehiculoId=${vehiculoId}`,
    );
    this.logger.log?.(`[WEP AUTH] Login correcto vehiculoId=${vehiculoId}`);
    return result;
  }
}

export default new WepLoginService();
