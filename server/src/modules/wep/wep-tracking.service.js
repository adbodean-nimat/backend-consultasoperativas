import { randomBytes } from "node:crypto";
import gestyaService from "./gestya.service.js";
import { deriveStopState, normalizeStopText } from "./wep-stop.util.js";
import wepTrackingRepository from "./wep-tracking.repository.js";

export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;
export const DEFAULT_TRACKING_URL = "https://wep.nimat.com.ar/s";

const PUBLIC_STATE_NAMES = {
  PROGRAMADA: "Entrega programada",
  ASIGNADA: "Entrega programada",
  EN_REPARTO: "En reparto",
  CLIENTE_AVISADO: "Tu entrega está en camino",
  ENTREGADA: "Entregada",
  NO_ENTREGADA: "No se pudo completar la entrega",
  CANCELADA: "Entrega cancelada",
  CERRADA_PARCIAL: "Entrega procesada parcialmente",
};

const LIVE_POSITION_STATES = new Set(["EN_REPARTO", "CLIENTE_AVISADO"]);

function parseExpirationDays(value) {
  const parsed = Number(value ?? 2);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 30 ? parsed : 2;
}

export function calculateTrackingExpiration(fechaEntrega, days = 2) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaEntrega))) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
  const date = new Date(`${fechaEntrega}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  const expirationDate = date.toISOString().slice(0, 10);
  return new Date(`${expirationDate}T23:59:59.999-03:00`);
}

function minValue(values) {
  return values.filter(Boolean).sort()[0] ?? null;
}

function maxValue(values) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

function maxTimestamp(values) {
  const timestamps = values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()));
  return timestamps.sort((left, right) => left - right).at(-1) ?? null;
}

export class WepTrackingStopNotFoundError extends Error {}

export class WepTrackingService {
  constructor({
    repository = wepTrackingRepository,
    baseUrl = process.env.WEP_PUBLIC_TRACKING_URL || DEFAULT_TRACKING_URL,
    expirationDays = parseExpirationDays(
      process.env.WEP_TRACKING_EXPIRATION_DAYS,
    ),
    randomId = () => randomBytes(24).toString("base64url"),
    vehiclePositionService = gestyaService,
    logger = console,
  } = {}) {
    this.repository = repository;
    this.baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.expirationDays = expirationDays;
    this.randomId = randomId;
    this.vehiclePositionService = vehiclePositionService;
    this.logger = logger;
  }

  async getOrCreateTrackingForStop({
    viajeId,
    clienteCodigo,
    domicilio,
    localidad,
  }) {
    const domicilioNormalizado = normalizeStopText(domicilio);
    const localidadNormalizada = normalizeStopText(localidad);
    const candidates = await this.repository.findStopDeliveries({
      viajeId,
      clienteCodigo,
    });
    const deliveries = candidates.filter(
      (row) =>
        normalizeStopText(row.domicilio) === domicilioNormalizado &&
        normalizeStopText(row.localidad) === localidadNormalizada,
    );
    if (deliveries.length === 0) {
      throw new WepTrackingStopNotFoundError("La parada no existe");
    }

    const fechaEntrega = minValue(deliveries.map((row) => row.fecha_entrega));
    const row = await this.repository.getOrCreateActiveStopTracking({
      publicId: this.randomId(),
      viajeId,
      clienteCodigo: String(clienteCodigo),
      domicilioNormalizado,
      localidadNormalizada,
      entregaId: Number(deliveries[0].id),
      expiraAt: calculateTrackingExpiration(
        fechaEntrega,
        this.expirationDays,
      ),
    });
    return {
      publicId: row.public_id,
      url: `${this.baseUrl}/${row.public_id}`,
      expiraAt: row.expira_at,
    };
  }

  async getPublicTracking(publicId) {
    if (!PUBLIC_ID_PATTERN.test(String(publicId || ""))) return null;
    const result = await this.repository.findPublicTracking(publicId);
    if (!result) return null;

    const { token } = result;
    const deliveries = result.deliveries.filter(
      (row) =>
        normalizeStopText(row.domicilio) === token.domicilio_normalizado &&
        normalizeStopText(row.localidad) === token.localidad_normalizada,
    );
    if (deliveries.length === 0) return null;

    this.repository.touchAccess(token.id).catch(() => {
      this.logger.error("[WEP TRACKING] No se pudo registrar el último acceso");
    });
    const estado = deriveStopState(deliveries);
    const ultimaActualizacion = maxTimestamp([
      token.viaje_updated_at,
      ...deliveries.map((row) => row.updated_at),
    ]);
    let vehiculo = { posicionDisponible: false };
    if (LIVE_POSITION_STATES.has(estado.codigo)) {
      try {
        const position = await this.vehiclePositionService.getCurrentPositionByPlate(
          token.patente,
        );
        if (
          Number.isFinite(position?.latitude) &&
          Number.isFinite(position?.longitude)
        ) {
          vehiculo = {
            posicionDisponible: true,
            latitud: position.latitude,
            longitud: position.longitude,
            fechaPosicion: position.positionDate ?? null,
          };
        }
      } catch (_error) {
        this.logger.error(
          "[WEP TRACKING] Posición del vehículo temporalmente no disponible",
        );
      }
    }

    return {
      estado: {
        codigo: estado.codigo,
        nombre: PUBLIC_STATE_NAMES[estado.codigo] || estado.nombre,
      },
      fechaEntrega: minValue(deliveries.map((row) => row.fecha_entrega)),
      horario: {
        desde: minValue(deliveries.map((row) => row.hora_desde))?.slice(0, 5) ?? null,
        hasta: maxValue(deliveries.map((row) => row.hora_hasta))?.slice(0, 5) ?? null,
      },
      destino: { localidad: token.localidad_normalizada },
      ultimaActualizacion: ultimaActualizacion?.toISOString() ?? null,
      viaje: {
        enCurso: Boolean(token.iniciado_at && !token.finalizado_at),
      },
      vehiculo,
    };
  }
}

export default new WepTrackingService();
