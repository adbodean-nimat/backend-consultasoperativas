import { enviarTemplateEntregaProgramada } from "../../services/whatsapp.service.js";
import { sanitizeProviderError } from "./wep-client-notice.service.js";
import wepProgrammedNotificationsRepository, {
  hasBlockingProgrammedNotification,
  WepProgrammedNoticeConflictError,
} from "./wep-programmed-notifications.repository.js";
import wepTrackingService from "./wep-tracking.service.js";

export const WEP_BUSINESS_TIME_ZONE = "America/Argentina/Buenos_Aires";

export class WepProgrammedTemplateNotConfiguredError extends Error {}

export function getBusinessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WEP_BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeOrderPart(value) {
  return value === null || value === undefined || value === ""
    ? null
    : String(value);
}

export function buildProgrammedTemplateData(stop, tracking = null) {
  const uniqueOrders = new Map();
  const eligibleIds = new Set(
    stop.eligibleDeliveryRows?.map((row) => Number(row.entrega_id)) || [],
  );
  const deliveries =
    eligibleIds.size > 0
      ? stop.entregas.filter((entrega) => eligibleIds.has(entrega.id))
      : stop.entregas;
  for (const entrega of deliveries) {
    const order = {
      division: normalizeOrderPart(entrega.notaPedido.division),
      tipo: normalizeOrderPart(entrega.notaPedido.tipo),
      numero: normalizeOrderPart(entrega.notaPedido.numero),
    };
    const key = JSON.stringify(order);
    if (order.division || order.tipo || order.numero) uniqueOrders.set(key, order);
  }
  const orders = [...uniqueOrders.values()];

  return {
    cliente: stop.cliente.nombre,
    pedido: {
      cantidad: orders.length,
      notaPedido: orders.length === 1 ? orders[0] : null,
    },
    fechaEntrega: stop.fechaEntrega,
    horaDesde: stop.horaDesde,
    horaHasta: stop.horaHasta,
    trackingUrl: tracking?.url ?? null,
  };
}

export function formatProgrammedTime(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  const match = text.match(/(?:^|T)(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${match[1]}:${match[2]}`;
}

function publicStopResult(stop, result, extra = {}) {
  return {
    grupoId: stop.grupoId,
    viajeId: stop.viajeId,
    entregaRepresentativaId: stop.entregaRepresentativaId,
    resultado: result,
    datos: buildProgrammedTemplateData(stop),
    ...extra,
  };
}

export class WepProgrammedNotificationsService {
  constructor({
    repository = wepProgrammedNotificationsRepository,
    trackingService = wepTrackingService,
    whatsappSender = enviarTemplateEntregaProgramada,
    templateName = process.env.WEP_WHATSAPP_TEMPLATE_PROGRAMADA || null,
    templateLanguage =
      process.env.WEP_WHATSAPP_TEMPLATE_PROGRAMADA_LANG || "es_AR",
    logger = console,
  } = {}) {
    this.repository = repository;
    this.trackingService = trackingService;
    this.whatsappSender = whatsappSender;
    this.templateName = templateName;
    this.templateLanguage = templateLanguage;
    this.logger = logger;
  }

  async processProgrammedDeliveryNotifications({
    fecha = getBusinessDate(),
    dryRun = true,
  } = {}) {
    if (!dryRun && !this.templateName) {
      throw new WepProgrammedTemplateNotConfiguredError(
        "Plantilla PROGRAMADA no configurada",
      );
    }

    this.logger.log(`[WEP PROGRAMADA] Inicio fecha=${fecha} dryRun=${dryRun}`);
    const stops = await this.repository.findStopsForDate(fecha);
    this.logger.log(`[WEP PROGRAMADA] Paradas encontradas=${stops.length}`);

    const summary = {
      paradasEncontradas: stops.length,
      listasParaEnviar: 0,
      enviadas: 0,
      yaNotificadas: 0,
      sinTelefono: 0,
      errores: 0,
    };
    const resultados = [];

    for (const stop of stops) {
      if (hasBlockingProgrammedNotification(stop)) {
        summary.yaNotificadas += 1;
        resultados.push(publicStopResult(stop, "YA_NOTIFICADA"));
        this.logger.log(
          `[WEP PROGRAMADA] Omitida ya notificada grupoId=${stop.grupoId}`,
        );
        continue;
      }
      if (!stop.telefonoDestino) {
        summary.sinTelefono += 1;
        resultados.push(publicStopResult(stop, "SIN_TELEFONO"));
        this.logger.log(`[WEP PROGRAMADA] Sin teléfono grupoId=${stop.grupoId}`);
        continue;
      }

      summary.listasParaEnviar += 1;
      if (dryRun) {
        resultados.push(publicStopResult(stop, "LISTA_PARA_ENVIAR"));
        continue;
      }

      let reservation;
      try {
        reservation = await this.repository.reserveStop({
          fecha,
          viajeId: stop.viajeId,
          grupoId: stop.grupoId,
          templateName: this.templateName,
        });
        const tracking = await this.trackingService.getOrCreateTrackingForStop({
          viajeId: reservation.stop.viajeId,
          clienteCodigo: reservation.stop.cliente.codigo,
          domicilio: reservation.stop.domicilio,
          localidad: reservation.stop.localidad,
        });
        const datos = buildProgrammedTemplateData(reservation.stop, tracking);
        this.logger.log(
          `[WEP PROGRAMADA] DESTINO grupoId=${stop.grupoId} telefono=${reservation.telefonoDestino}`,
        );
        const sent = await this.whatsappSender({
          telefono: reservation.telefonoDestino,
          templateName: this.templateName,
          templateLanguage: this.templateLanguage,
          datos,
          publicId: tracking.publicId,
        });
        await this.repository.confirmSent({
          notificationId: reservation.notificationId,
          messageId: sent.messageId,
          templateName: sent.templateName || this.templateName,
        });
        summary.enviadas += 1;
        resultados.push(
          publicStopResult(reservation.stop, "ENVIADA", {
            reintento: reservation.retried,
            datos,
          }),
        );
        this.logger.log(`[WEP PROGRAMADA] Enviada grupoId=${stop.grupoId}`);
      } catch (error) {
        if (error instanceof WepProgrammedNoticeConflictError) {
          summary.yaNotificadas += 1;
          resultados.push(publicStopResult(stop, "OMITIDA_CONCURRENCIA"));
          this.logger.log(
            `[WEP PROGRAMADA] Omitida por revalidación grupoId=${stop.grupoId}`,
          );
          continue;
        }

        summary.errores += 1;
        const sanitized = sanitizeProviderError(error);
        if (reservation) {
          await this.repository
            .markFailed({
              notificationId: reservation.notificationId,
              errorCode: sanitized.code,
              errorDetail: sanitized.detail,
            })
            .catch(() => {});
        }
        resultados.push(
          publicStopResult(stop, "ERROR", { errorCodigo: sanitized.code }),
        );
        this.logger.error(
          `[WEP PROGRAMADA] Error grupoId=${stop.grupoId} codigo=${sanitized.code}`,
        );
      }
    }

    this.logger.log(
      `[WEP PROGRAMADA] Finalizadas enviadas=${summary.enviadas} errores=${summary.errores}`,
    );
    return {
      ok: true,
      fecha,
      dryRun,
      plantillaConfigurada: Boolean(this.templateName),
      resumen: summary,
      resultados,
    };
  }
}

export default new WepProgrammedNotificationsService();
