import { enviarTemplateEntregaProgramada } from "../../services/whatsapp.service.js";
import { sanitizeProviderError } from "./wep-client-notice.service.js";
import wepProgrammedNotificationsRepository from "./wep-programmed-notifications.repository.js";
import {
  buildProgrammedTemplateData,
  formatProgrammedTime,
  WepProgrammedTemplateNotConfiguredError,
} from "./wep-programmed-notifications.service.js";
import wepTrackingService from "./wep-tracking.service.js";

export class WepProgrammedTestScheduleError extends Error {}
export class WepProgrammedTestWhatsappError extends Error {}

function maskPhone(phone) {
  const value = String(phone);
  return value.length <= 4
    ? "*".repeat(value.length)
    : `${value.slice(0, 3)}${"*".repeat(value.length - 7)}${value.slice(-4)}`;
}

export class WepProgrammedNotificationTestService {
  constructor({
    repository = wepProgrammedNotificationsRepository,
    trackingService = wepTrackingService,
    whatsappSender = enviarTemplateEntregaProgramada,
    templateName =
      process.env.WEP_WHATSAPP_TEMPLATE_PROGRAMADA_TEST ||
      process.env.WEP_WHATSAPP_TEMPLATE_PROGRAMADA ||
      null,
    templateLanguage =
      process.env.WEP_WHATSAPP_TEMPLATE_PROGRAMADA_TEST_LANG ||
      process.env.WEP_WHATSAPP_TEMPLATE_PROGRAMADA_LANG ||
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

  async send({ entregaRepresentativaId, telefono }) {
    if (!this.templateName) {
      throw new WepProgrammedTemplateNotConfiguredError(
        "Plantilla PROGRAMADA TEST no configurada",
      );
    }

    const stop = await this.repository.findStopByRepresentativeDelivery(
      entregaRepresentativaId,
    );
    const baseDatos = buildProgrammedTemplateData(stop);
    const datos = {
      ...baseDatos,
      horaDesde: formatProgrammedTime(baseDatos.horaDesde),
      horaHasta: formatProgrammedTime(baseDatos.horaHasta),
    };
    if (!datos.horaDesde || !datos.horaHasta) {
      throw new WepProgrammedTestScheduleError(
        "La parada no tiene un horario válido para la plantilla",
      );
    }

    const tracking = await this.trackingService.getOrCreateTrackingForStop({
      viajeId: stop.viajeId,
      clienteCodigo: stop.cliente.codigo,
      domicilio: stop.domicilio,
      localidad: stop.localidad,
    });
    const notificationId = await this.repository.reserveTestNotice({
      entregaId: entregaRepresentativaId,
      telefono,
      templateName: this.templateName,
    });

    let sent;
    try {
      this.logger.log(
        `[WEP PROGRAMADA TEST] DESTINO grupoId=${stop.grupoId} telefono=${telefono}`,
      );
      sent = await this.whatsappSender({
        telefono,
        templateName: this.templateName,
        templateLanguage: this.templateLanguage,
        datos: { ...datos, trackingUrl: tracking.url },
        publicId: tracking.publicId,
      });
    } catch (error) {
      const sanitized = sanitizeProviderError(error);
      await this.repository
        .markTestFailed({
          notificationId,
          errorCode: sanitized.code,
          errorDetail: sanitized.detail,
        })
        .catch(() => {});
      throw new WepProgrammedTestWhatsappError(sanitized.detail);
    }
    await this.repository.confirmTestSent({
      notificationId,
      messageId: sent.messageId,
      templateName: sent.templateName || this.templateName,
    });

    this.logger.log(
      `[WEP PROGRAMADA TEST] entregaRepresentativaId=${entregaRepresentativaId} ` +
        `grupoId=${stop.grupoId} telefono=${maskPhone(telefono)} ` +
        `template=${this.templateName} horaDesde=${datos.horaDesde} ` +
        `horaHasta=${datos.horaHasta} publicId=${tracking.publicId} ` +
        `messageId=${sent.messageId}`,
    );

    return {
      ok: true,
      test: true,
      template: sent.templateName || this.templateName,
      telefono,
      grupoId: stop.grupoId,
      entregaRepresentativaId,
      horaDesde: datos.horaDesde,
      horaHasta: datos.horaHasta,
      tracking: { publicId: tracking.publicId, url: tracking.url },
      whatsapp: { messageId: sent.messageId, status: "SENT" },
    };
  }
}

export default new WepProgrammedNotificationTestService();
