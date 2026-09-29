import axios from "axios";

const DEFAULT_TIMEOUT_MS = 10_000;

export class WepRoutingError extends Error {}

function timeoutFrom(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function normalizePoint(point, label) {
  const latitude = Number(point?.lat);
  const longitude = Number(point?.lon);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new WepRoutingError(`${label} tiene coordenadas inválidas`);
  }
  return { latitude, longitude };
}

function decodeRouteGeometry(encoded) {
  if (encoded?.type === "LineString" && Array.isArray(encoded.coordinates)) {
    const coordinates = encoded.coordinates;
    if (coordinates.length >= 2 && coordinates.every((point) =>
      Array.isArray(point) && point.length === 2 &&
      Number.isFinite(point[0]) && Math.abs(point[0]) <= 180 &&
      Number.isFinite(point[1]) && Math.abs(point[1]) <= 90)) {
      return { type: "LineString", coordinates };
    }
    return null;
  }
  if (typeof encoded !== "string") return null;
  const coordinates = [];
  let latitude = 0;
  let longitude = 0;
  let index = 0;
  try {
    while (index < encoded.length) {
      const deltas = [];
      for (let axis = 0; axis < 2; axis += 1) {
        let shift = 0;
        let value = 0;
        let chunk;
        do {
          if (index >= encoded.length || shift > 30) return null;
          chunk = encoded.charCodeAt(index++) - 63;
          if (chunk < 0 || chunk > 63) return null;
          value |= (chunk & 31) << shift;
          shift += 5;
        } while (chunk >= 32);
        deltas.push(value & 1 ? ~(value >> 1) : value >> 1);
      }
      latitude += deltas[0];
      longitude += deltas[1];
      const lat = latitude / 1e5;
      const lon = longitude / 1e5;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      coordinates.push([lon, lat]);
    }
  } catch { return null; }
  return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
}

export class RoutingService {
  constructor({ httpClient = axios, env = process.env } = {}) {
    this.httpClient = httpClient;
    this.env = env;
  }

  getConfiguration() {
    const provider = String(this.env.WEP_ROUTING_PROVIDER || "")
      .trim()
      .toLowerCase();
    const apiKey = String(this.env.WEP_ROUTING_API_KEY || "").trim();
    if (provider !== "openrouteservice") {
      throw new WepRoutingError("Proveedor de rutas no configurado");
    }
    if (!apiKey) throw new WepRoutingError("Falta WEP_ROUTING_API_KEY");
    return {
      provider,
      apiKey,
      baseUrl: String(
        this.env.WEP_ROUTING_BASE_URL || "https://api.heigit.org/openrouteservice",
      ).replace(/\/+$/, ""),
      timeout: timeoutFrom(this.env.WEP_ROUTING_TIMEOUT_MS),
    };
  }

  async calculateRouteEta({ origin, destination }) {
    const from = normalizePoint(origin, "El origen");
    const to = normalizePoint(destination, "El destino");
    const { apiKey, baseUrl, timeout } = this.getConfiguration();

    try {
      const response = await this.httpClient.post(
        `${baseUrl}/v2/directions/driving-car`,
        {
          coordinates: [
            [from.longitude, from.latitude],
            [to.longitude, to.latitude],
          ],
        },
        {
          headers: {
            Authorization: apiKey,
            "Content-Type": "application/json",
          },
          timeout,
          validateStatus: () => true,
        },
      );
      if (response.status < 200 || response.status >= 300) {
        throw new WepRoutingError(
          `El proveedor de rutas respondió HTTP ${response.status}`,
        );
      }
      const providerRoute = response.data?.routes?.[0];
      const summary = providerRoute?.summary;
      const durationSeconds = Number(summary?.duration);
      const distanceMeters = Number(summary?.distance);
      if (
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0 ||
        !Number.isFinite(distanceMeters) ||
        distanceMeters < 0
      ) {
        throw new WepRoutingError("El proveedor no devolvió una ruta válida");
      }
      return {
        durationSeconds,
        durationMinutes: durationSeconds / 60,
        distanceMeters,
        routeGeometry: decodeRouteGeometry(providerRoute?.geometry),
      };
    } catch (error) {
      if (error instanceof WepRoutingError) throw error;
      throw new WepRoutingError("No se pudo calcular la ruta", { cause: error });
    }
  }
}

export default new RoutingService();
