import { enviarTemplateEntregaEnCaminoConEta } from "../../services/whatsapp.service.js";
import geocodingService from "./geocoding.service.js";
import gestyaService from "./gestya.service.js";
import routingService from "./routing.service.js";
import { formatFriendlyEta } from "./wep-eta.util.js";
import wepTrackingService from "./wep-tracking.service.js";
import {
  sanitizeProviderError,
  WEP_WHATSAPP_PUBLIC_SEND_ERROR,
  WepPwaWhatsappError,
} from "./wep-client-notice.service.js";
import wepStopActionsRepository, {
  validateStopOperation,
} from "./wep-stop-actions.repository.js";
import { deriveStopState } from "./wep-stop.util.js";

export const ETA_UNAVAILABLE_CODE = "ETA_NO_DISPONIBLE";
export const ETA_UNAVAILABLE_MESSAGE =
  "No se pudo calcular el tiempo estimado de llegada.";
export class WepEtaUnavailableError extends Error {
  constructor(cause) {
    super(ETA_UNAVAILABLE_MESSAGE, { cause });
    this.code = ETA_UNAVAILABLE_CODE;
  }
}

function validCoordinates(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180
  );
}

function notificationMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function contextSummary(context) {
  return {
    grupoId: context.grupoId,
    estado: deriveStopState(context.entregas),
    cantidadOrdenes: context.entregas.length,
    entregasActualizadas: 0,
    entregas: context.entregas.map((delivery) => ({
      id: Number(delivery.entrega_id),
      estado: {
        codigo: delivery.estado_codigo,
        nombre: delivery.estado_nombre,
      },
    })),
  };
}

export class WepStopActionsService {
  constructor({
    repository = wepStopActionsRepository,
    vehiclePositionService = gestyaService,
    geocoder = geocodingService,
    routeCalculator = routingService,
    trackingService = wepTrackingService,
    whatsappSender = enviarTemplateEntregaEnCaminoConEta,
    templateName = process.env.WEP_WHATSAPP_TEMPLATE_EN_CAMINO || null,
    approximateAreaTemplateName = process.env.WEP_WHATSAPP_TEMPLATE_EN_CAMINO_ZONA || null,
    logger = console,
  } = {}) {
    this.repository = repository;
    this.vehiclePositionService = vehiclePositionService;
    this.geocoder = geocoder;
    this.routeCalculator = routeCalculator;
    this.trackingService = trackingService;
    this.whatsappSender = whatsappSender;
    this.templateName = templateName;
    this.approximateAreaTemplateName = approximateAreaTemplateName;
    this.logger = logger;
  }

  async getPositionForStop(viajeId, grupoId, vehiculoId, action) {
    const context = await this.repository.getStopContext(
      viajeId,
      grupoId,
      vehiculoId,
    );
    validateStopOperation(context, action);

    try {
      this.logger.log?.(
        `[WEP PWA] Consultando GESTYA para parada=${grupoId}`,
      );
      return await this.vehiclePositionService.getCurrentPositionByPlate(
        context.viaje.patente,
      );
    } catch {
      this.logger.warn?.(
        `[WEP PWA] No se pudo obtener posición GESTYA para parada=${grupoId}`,
      );
      return null;
    }
  }

  async deliverStop(viajeId, grupoId, vehiculoId) {
    const position = await this.getPositionForStop(
      viajeId,
      grupoId,
      vehiculoId,
      "entregar",
    );
    const parada = await this.repository.changeStopState({
      viajeId,
      grupoId,
      vehiculoId,
      action: "entregar",
      position,
    });
    return {
      ...parada,
      posicion: {
        latitud: position?.latitude ?? null,
        longitud: position?.longitude ?? null,
        obtenidaDesdeGestya: position !== null,
      },
    };
  }

  async markStopNotDelivered(
    viajeId,
    grupoId,
    { motivo, observacion },
    vehiculoId,
  ) {
    const position = await this.getPositionForStop(
      viajeId,
      grupoId,
      vehiculoId,
      "noEntregado",
    );
    const parada = await this.repository.changeStopState({
      viajeId,
      grupoId,
      vehiculoId,
      action: "noEntregado",
      motivo,
      observacion,
      position,
    });
    return {
      ...parada,
      posicion: {
        latitud: position?.latitude ?? null,
        longitud: position?.longitude ?? null,
        obtenidaDesdeGestya: position !== null,
      },
    };
  }

  async notifyStop(viajeId, grupoId, vehiculoId) {
    const context = await this.repository.getStopContext(
      viajeId,
      grupoId,
      vehiculoId,
    );
    const representativeId = Number(context.entregas[0].entrega_id);
    const logPrefix = `[WEP ETA] grupoId=${grupoId} viajeId=${viajeId} entregaRepresentativaId=${representativeId}`;
    const existing = await this.repository.findSuccessfulStopNotice(context);
    if (existing) {
      const metadata = notificationMetadata(existing.metadata);
      this.logger.log?.(`${logPrefix} resultadoWhatsApp=YA_NOTIFICADA`);
      return {
        parada: contextSummary(context),
        notificacion: {
          tipo: "EN_CAMINO",
          canal: "WHATSAPP",
          estado: "ENVIADO",
          enviadoAt: existing.enviado_at,
          resultado: "YA_NOTIFICADA",
          etaMinutos: metadata.etaMinutosEnviado ?? null,
          precisionDestino: metadata.precisionDestino ?? "DOMICILIO",
          messageId: existing.message_id ?? null,
        },
      };
    }
    validateStopOperation(context, "avisar");

    let position;
    let destination;
    let route;
    let approximateArea = false;
    let destinationSource = "no";
    try {
      position = await this.vehiclePositionService.getCurrentPositionByPlate(
        context.viaje.patente,
      );
      if (!validCoordinates(position?.latitude, position?.longitude)) {
        throw new Error("GESTYA devolvió coordenadas inválidas");
      }
      this.logger.log?.(`${logPrefix} posicionGestya=si`);

      const representative = context.entregas[0];
      const allowPersistentCoordinateCache =
        this.geocoder.canUsePersistentCoordinateCache?.() ?? true;
      const cached = allowPersistentCoordinateCache && context.entregas.find((delivery) =>
        delivery.destino_latitud !== null &&
        delivery.destino_latitud !== undefined &&
        delivery.destino_longitud !== null &&
        delivery.destino_longitud !== undefined &&
        validCoordinates(
          Number(delivery.destino_latitud),
          Number(delivery.destino_longitud),
        ),
      );
      if (cached) {
        destination = {
          latitude: Number(cached.destino_latitud),
          longitude: Number(cached.destino_longitud),
        };
        const allShareDestination = context.entregas.every(
          (delivery) =>
            Number(delivery.destino_latitud) === destination.latitude &&
            Number(delivery.destino_longitud) === destination.longitude,
        );
        if (!allShareDestination) {
          await this.repository.saveStopDestinationCoordinates(
            context,
            destination,
          );
        }
        destinationSource = "cache";
        this.logger.log?.(`${logPrefix} destino=cache`);
        this.geocoder.debug?.("OMITIDO_POR_CACHE", {
          domicilio: representative.domicilio || null,
          localidad: representative.localidad || null,
          latitud: destination.latitude,
          longitud: destination.longitude,
          motivo: "la parada ya tiene coordenadas persistidas",
        });
      } else {
        destination = await this.geocoder.geocodeDeliveryDestination({
          domicilio: representative.domicilio,
          zona: representative.zona_nombre,
          localidad: representative.localidad,
        });
        if (!validCoordinates(destination?.latitude, destination?.longitude)) {
          throw new Error("El geocodificador devolvió coordenadas inválidas");
        }
        approximateArea = destination.approximateArea === true;
        if (approximateArea && !this.approximateAreaTemplateName) {
          throw new Error("Falta WEP_WHATSAPP_TEMPLATE_EN_CAMINO_ZONA");
        }
        if (allowPersistentCoordinateCache && !approximateArea) {
          await this.repository.saveStopDestinationCoordinates(
            context,
            destination,
          );
          destinationSource = "geocodificado";
          this.logger.log?.(`${logPrefix} destino=geocodificado`);
        } else {
          destinationSource = approximateArea ? "zona_aproximada_sin_cache" : "geocodificado_sin_cache";
          this.logger.log?.(`${logPrefix} destino=${destinationSource}`);
        }
      }

      route = await this.routeCalculator.calculateRouteEta({
        origin: { lat: position.latitude, lon: position.longitude },
        destination: { lat: destination.latitude, lon: destination.longitude },
      });
      if (!Number.isFinite(route?.durationMinutes) || route.durationMinutes <= 0) {
        throw new Error("El motor de rutas devolvió una duración inválida");
      }
      this.logger.log?.(
        `${logPrefix} duracionSegundos=${Math.round(route.durationSeconds)}`,
      );
    } catch (error) {
      if (!position) this.logger.warn?.(`${logPrefix} posicionGestya=no`);
      this.logger.warn?.(
        `${logPrefix} destino=${destinationSource} etaDisponible=no`,
      );
      throw new WepEtaUnavailableError(error);
    }

    const etaCalculated = Math.max(1, Math.round(route.durationMinutes));
    const etaSent = formatFriendlyEta(route.durationMinutes);
    const selectedTemplateName = approximateArea
      ? this.approximateAreaTemplateName
      : this.templateName;
    const representative = context.entregas[0];
    const tracking = await this.trackingService.getOrCreateTrackingForStop({
      viajeId,
      clienteCodigo: representative.cliente_codigo,
      domicilio: representative.domicilio,
      localidad: representative.localidad,
    });
    const reservation = await this.repository.reserveStopNotice(
      viajeId,
      grupoId,
      vehiculoId,
      selectedTemplateName,
    );

    let sent;
    try {
      this.logger.log?.(
        `${logPrefix} DESTINO telefono=${reservation.telefonoDestino}`,
      );
      sent = await this.whatsappSender({
        telefono: reservation.telefonoDestino,
        templateName: selectedTemplateName,
        etaMinutes: etaSent,
        publicId: tracking.publicId,
      });
    } catch (error) {
      const sanitized = sanitizeProviderError(error);
      await this.repository
        .failStopNotice({
          notificationId: reservation.notificationId,
          errorCode: sanitized.code,
          errorDetail: sanitized.detail,
        })
        .catch(() => {});
      this.logger.warn?.(`${logPrefix} resultadoWhatsApp=ERROR`);
      throw new WepPwaWhatsappError(WEP_WHATSAPP_PUBLIC_SEND_ERROR);
    }

    const result = await this.repository.confirmStopNotice({
      viajeId,
      grupoId,
      vehiculoId,
      notificationId: reservation.notificationId,
      anchorId: reservation.anchorId,
      messageId: sent.messageId,
      templateName: sent.templateName || selectedTemplateName,
      metadata: {
        etaMinutosCalculado: etaCalculated,
        etaMinutosEnviado: etaSent,
        distanciaMetros: Math.round(route.distanceMeters),
        fechaPosicionGestya: position.positionDate ?? null,
        precisionDestino: approximateArea ? "ZONA_APROXIMADA" : "DOMICILIO",
      },
    });
    this.logger.log?.(
      `${logPrefix} etaEnviado=${etaSent} resultadoWhatsApp=ENVIADA`,
    );
    return result;
  }
}

export default new WepStopActionsService();
