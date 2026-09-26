import { enviarTemplateEntregaEnReparto } from "../../services/whatsapp.service.js";
import { sanitizeProviderError } from "./wep-client-notice.service.js";
import wepEnRepartoNotificationsRepository from "./wep-en-reparto-notifications.repository.js";
import wepTrackingService from "./wep-tracking.service.js";

export class WepEnRepartoNotificationsService {
  constructor({
    repository = wepEnRepartoNotificationsRepository,
    trackingService = wepTrackingService,
    whatsappSender = enviarTemplateEntregaEnReparto,
    templateName = process.env.WEP_WHATSAPP_TEMPLATE_EN_REPARTO || null,
    templateLanguage =
      process.env.WEP_WHATSAPP_TEMPLATE_PROGRAMADA_LANG ||
      process.env.WEP_WHATSAPP_TEMPLATE_LANG ||
      "es_AR",
    logger = console,
  } = {}) {
    this.repository = repository;
    this.trackingService = trackingService;
    this.whatsappSender = whatsappSender;
    this.templateName = templateName;
    this.templateLanguage = templateLanguage;
    this.logger = logger;
  }

  async notifyTransitionedStops({ viajeId, entregaIds }) {
    const summary = {
      enviadas: 0,
      yaNotificadas: 0,
      sinTelefono: 0,
      errores: 0,
    };
    if (!entregaIds?.length) return summary;

    const stops = await this.repository.findTransitionedStops({
      viajeId,
      entregaIds,
    });

    for (const stop of stops) {
      let reservation;
      try {
        reservation = await this.repository.reserveStop({
          stop,
          templateName: this.templateName,
        });
        if (
          reservation.result === "YA_NOTIFICADA" ||
          reservation.result === "YA_PROCESADA"
        ) {
          summary.yaNotificadas += 1;
          this.logger.log(
            `[WEP EN_REPARTO] YA_NOTIFICADA grupoId=${stop.grupoId}`,
          );
          continue;
        }
        if (reservation.result === "SIN_TELEFONO") {
          summary.sinTelefono += 1;
          this.logger.log(
            `[WEP EN_REPARTO] SIN_TELEFONO grupoId=${stop.grupoId}`,
          );
          continue;
        }

        const tracking = await this.trackingService.getOrCreateTrackingForStop({
          viajeId: stop.viajeId,
          clienteCodigo: stop.cliente.codigo,
          domicilio: stop.domicilio,
          localidad: stop.localidad,
        });
        this.logger.log(
          `[WEP EN_REPARTO] DESTINO grupoId=${stop.grupoId} telefono=${stop.telefonoDestino}`,
        );
        const sent = await this.whatsappSender({
          telefono: stop.telefonoDestino,
          templateName: this.templateName,
          templateLanguage: this.templateLanguage,
          publicId: tracking.publicId,
        });
        await this.repository.confirmSent({
          notificationId: reservation.notificationId,
          messageId: sent.messageId,
          templateName: sent.templateName || this.templateName,
        });
        summary.enviadas += 1;
        this.logger.log(`[WEP EN_REPARTO] ENVIADA grupoId=${stop.grupoId}`);
      } catch (error) {
        summary.errores += 1;
        const sanitized = sanitizeProviderError(error);
        if (reservation?.notificationId) {
          await this.repository
            .markFailed({
              notificationId: reservation.notificationId,
              errorCode: sanitized.code,
              errorDetail: sanitized.detail,
            })
            .catch(() => {});
        }
        this.logger.error(
          `[WEP EN_REPARTO] ERROR grupoId=${stop.grupoId} codigo=${sanitized.code}`,
        );
      }
    }

    return summary;
  }
}

export default new WepEnRepartoNotificationsService();
