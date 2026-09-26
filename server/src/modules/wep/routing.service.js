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
      const summary = response.data?.routes?.[0]?.summary;
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
      };
    } catch (error) {
      if (error instanceof WepRoutingError) throw error;
      throw new WepRoutingError("No se pudo calcular la ruta", { cause: error });
    }
  }
}

export default new RoutingService();
