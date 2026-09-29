import crypto from "node:crypto";
import { hashWepToken } from "./wep-auth.middleware.js";
import wepAuthRepository from "./wep-auth.repository.js";

export class WepVehicleNotFoundError extends Error {}

export class WepTokenNotFoundError extends Error {}

export function createWepToken() {
  const plainToken = crypto.randomBytes(32).toString("hex");
  return {
    plainToken,
    tokenHash: hashWepToken(plainToken),
  };
}

export class WepTokenService {
  constructor({ repository = wepAuthRepository } = {}) {
    this.repository = repository;
  }

  async createForVehicle(vehiculoId) {
    const vehicle = await this.repository.findVehicleById(vehiculoId);
    if (!vehicle) {
      throw new WepVehicleNotFoundError("Vehículo no encontrado");
    }

    const token = createWepToken();
    await this.repository.createVehicleToken(vehiculoId, token.tokenHash);

    return { vehicle, token: token.plainToken };
  }

  async revoke(tokenId) {
    const revoked = await this.repository.revokeToken(tokenId);
    if (!revoked) {
      throw new WepTokenNotFoundError("Token no encontrado");
    }
  }
}

export default new WepTokenService();
