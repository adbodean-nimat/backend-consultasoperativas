import axios from "axios";
import { normalizePlate } from "./plate.util.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const CURRENT_POSITION_OUTPUT = ["la", "lo", "fp", "se", "ve", "ev", "od"];

export const GESTYA_ERROR_CODES = Object.freeze({
  INVALID_PLATE: "GESTYA_INVALID_PLATE",
  CONFIG_ERROR: "GESTYA_CONFIG_ERROR",
  TIMEOUT: "GESTYA_TIMEOUT",
  HTTP_ERROR: "GESTYA_HTTP_ERROR",
  INVALID_RESPONSE: "GESTYA_INVALID_RESPONSE",
  VEHICLE_NOT_FOUND: "GESTYA_VEHICLE_NOT_FOUND",
});

export class GestyaError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message, { cause });
    this.name = "GestyaError";
    this.code = code;
  }
}

function createGestyaError(code, message, cause) {
  return new GestyaError(message, { code, cause });
}

function configuredTimeout(value) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0
    ? timeout
    : DEFAULT_TIMEOUT_MS;
}

function decodeText(value, field) {
  if (value === null || value === undefined || value === "") return null;

  try {
    return decodeURIComponent(String(value));
  } catch (error) {
    throw createGestyaError(
      GESTYA_ERROR_CODES.INVALID_RESPONSE,
      `GESTYA devolvió un valor inválido para ${field}`,
      error,
    );
  }
}

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredCoordinate(value, field) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  ) {
    throw createGestyaError(
      GESTYA_ERROR_CODES.INVALID_RESPONSE,
      `GESTYA no devolvió ${field}`,
    );
  }

  const coordinate = Number(value);
  if (!Number.isFinite(coordinate)) {
    throw createGestyaError(
      GESTYA_ERROR_CODES.INVALID_RESPONSE,
      `GESTYA devolvió ${field} no numérica`,
    );
  }

  return coordinate;
}

function normalizeVehicle(rawVehicle, requestedPlate) {
  if (
    !rawVehicle ||
    typeof rawVehicle !== "object" ||
    Array.isArray(rawVehicle)
  ) {
    throw createGestyaError(
      GESTYA_ERROR_CODES.INVALID_RESPONSE,
      "GESTYA devolvió una unidad con formato inválido",
    );
  }

  const providerPlate = decodeText(rawVehicle.patente, "patente");

  return {
    name: decodeText(rawVehicle.nombre, "nombre"),
    alias: decodeText(rawVehicle.alias, "alias"),
    plate: normalizePlate(providerPlate) || requestedPlate,
    latitude: requiredCoordinate(rawVehicle.latitud, "latitud"),
    longitude: requiredCoordinate(rawVehicle.longitud, "longitud"),
    positionDate: decodeText(rawVehicle.fecha, "fecha"),
    stoppedSince: decodeText(rawVehicle.detenido_desde, "detenido_desde"),
    heading: numberOrNull(rawVehicle.sentido),
    speed: numberOrNull(rawVehicle.velocidad),
    event: numberOrNull(rawVehicle.evento),
    odometer: numberOrNull(rawVehicle.odometro),
  };
}

function isTimeoutError(error) {
  return (
    error?.code === "ECONNABORTED" ||
    error?.code === "ETIMEDOUT" ||
    /timeout/i.test(String(error?.message || ""))
  );
}

export class GestyaService {
  constructor({ httpClient = axios, env = process.env, logger = console } = {}) {
    this.httpClient = httpClient;
    this.env = env;
    this.logger = logger;
  }

  getConfiguration() {
    const url = String(this.env.GESTYA_URL || "").trim();
    const user = String(this.env.GESTYA_USER || "").trim();
    const password = String(this.env.GESTYA_PASSWORD || "");

    if (!url || !user || !password.trim()) {
      throw createGestyaError(
        GESTYA_ERROR_CODES.CONFIG_ERROR,
        "La integración con GESTYA no está configurada",
      );
    }

    return {
      url,
      user,
      password,
      timeout: configuredTimeout(this.env.GESTYA_TIMEOUT_MS),
    };
  }

  async getCurrentPositionByPlate(patente) {
    const plate = normalizePlate(patente);
    if (!plate) {
      throw createGestyaError(
        GESTYA_ERROR_CODES.INVALID_PLATE,
        "La patente es obligatoria",
      );
    }
    this.logger.log?.(`[GESTYA] Consultando patente=${plate}`);

    try {
      const { url, user, password, timeout } = this.getConfiguration();
      const response = await this.httpClient.post(
        url,
        {
          action: "DATOSACTUALESV2",
          user,
          pwd: password,
          tipoID: "patente",
          vehiculos: [plate],
          output: CURRENT_POSITION_OUTPUT,
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout,
          validateStatus: () => true,
        },
      );

      if (
        !Number.isInteger(response?.status) ||
        response.status < 200 ||
        response.status >= 300
      ) {
        throw createGestyaError(
          GESTYA_ERROR_CODES.HTTP_ERROR,
          "GESTYA respondió con un estado HTTP no exitoso",
        );
      }

      if (!Array.isArray(response.data)) {
        throw createGestyaError(
          GESTYA_ERROR_CODES.INVALID_RESPONSE,
          "GESTYA devolvió una respuesta con formato inválido",
        );
      }

      if (response.data.length === 0) {
        throw createGestyaError(
          GESTYA_ERROR_CODES.VEHICLE_NOT_FOUND,
          "Vehículo no encontrado en GESTYA",
        );
      }

      const vehicle = normalizeVehicle(response.data[0], plate);
      this.logger.log?.(`[GESTYA] Posición recibida patente=${plate}`);
      this.logger.log?.(
        `[GESTYA] Lat=${vehicle.latitude} Lon=${vehicle.longitude}`,
      );
      this.logger.log?.(
        `[GESTYA] Fecha GPS=${vehicle.positionDate ?? "sin fecha"}`,
      );
      return vehicle;
    } catch (error) {
      let gestyaError = error;

      if (!(error instanceof GestyaError)) {
        gestyaError = isTimeoutError(error)
          ? createGestyaError(
              GESTYA_ERROR_CODES.TIMEOUT,
              "La consulta a GESTYA excedió el tiempo de espera",
              error,
            )
          : createGestyaError(
              GESTYA_ERROR_CODES.HTTP_ERROR,
              "No se pudo completar la consulta a GESTYA",
              error,
            );
      }

      this.logger.error?.(
        `[GESTYA] Error consultando patente=${plate}: ${gestyaError.code}`,
      );
      throw gestyaError;
    }
  }
}

const gestyaService = new GestyaService();

export function getCurrentPositionByPlate(patente) {
  return gestyaService.getCurrentPositionByPlate(patente);
}

export default gestyaService;
