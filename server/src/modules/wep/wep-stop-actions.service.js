import { enviarTemplateEntregaEnCamino } from "../../services/whatsapp.service.js";
import gestyaService from "./gestya.service.js";
import {
  sanitizeProviderError,
  WEP_WHATSAPP_PUBLIC_SEND_ERROR,
  WepPwaWhatsappError,
} from "./wep-client-notice.service.js";
import wepStopActionsRepository, {
  validateStopOperation,
} from "./wep-stop-actions.repository.js";

export class WepStopActionsService {
  constructor({
    repository = wepStopActionsRepository,
    vehiclePositionService = gestyaService,
    whatsappSender = enviarTemplateEntregaEnCamino,
    templateName = process.env.WEP_WHATSAPP_TEMPLATE_NAME || null,
    logger = console,
  } = {}) {
    this.repository = repository;
    this.vehiclePositionService = vehiclePositionService;
    this.whatsappSender = whatsappSender;
    this.templateName = templateName;
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
    const reservation = await this.repository.reserveStopNotice(
      viajeId,
      grupoId,
      vehiculoId,
      this.templateName,
    );

    let sent;
    try {
      sent = await this.whatsappSender({
        telefono: reservation.telefonoDestino,
        nombreCliente: reservation.clienteNombre,
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
      throw new WepPwaWhatsappError(WEP_WHATSAPP_PUBLIC_SEND_ERROR);
    }

    return this.repository.confirmStopNotice({
      viajeId,
      grupoId,
      vehiculoId,
      notificationId: reservation.notificationId,
      anchorId: reservation.anchorId,
      messageId: sent.messageId,
      templateName: sent.templateName || this.templateName,
    });
  }
}

export default new WepStopActionsService();
