import { enviarTemplateEntregaEnCamino } from "../../services/whatsapp.service.js";
import wepClientNoticeRepository from "./wep-client-notice.repository.js";

export const WEP_WHATSAPP_PUBLIC_SEND_ERROR =
  "No se pudo enviar el aviso por WhatsApp";

export class WepPwaWhatsappError extends Error {}

export function sanitizeProviderError(error) {
  const providerError = error?.meta?.error;
  const status = Number(error?.status) || null;
  const providerCode = providerError?.code;
  const code = String(
    providerCode
      ? `META_${providerCode}`
      : status
        ? `WHATSAPP_HTTP_${status}`
        : "WHATSAPP_SEND_ERROR",
  ).slice(0, 100);
  const detail = String(
    providerError?.error_user_msg ||
      providerError?.message ||
      WEP_WHATSAPP_PUBLIC_SEND_ERROR,
  )
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .slice(0, 1000);

  return { code, detail };
}

export class WepClientNoticeService {
  constructor({
    repository = wepClientNoticeRepository,
    whatsappSender = enviarTemplateEntregaEnCamino,
    templateName = process.env.WEP_WHATSAPP_TEMPLATE_NAME || null,
  } = {}) {
    this.repository = repository;
    this.whatsappSender = whatsappSender;
    this.templateName = templateName;
  }

  async notifyClient(entregaId, vehiculoId) {
    const reservation = await this.repository.reserveNotice(
      entregaId,
      vehiculoId,
      this.templateName,
    );

    let sent;
    try {
      sent = await this.whatsappSender({
        telefono: reservation.telefonoDestino,
        nombreCliente: reservation.entrega.clienteNombre,
      });
    } catch (error) {
      const sanitized = sanitizeProviderError(error);
      await this.repository
        .failNotice({
          notificationId: reservation.notificationId,
          errorCode: sanitized.code,
          errorDetail: sanitized.detail,
        })
        .catch(() => {});
      throw new WepPwaWhatsappError(WEP_WHATSAPP_PUBLIC_SEND_ERROR);
    }

    return this.repository.confirmNotice({
      entregaId,
      vehiculoId,
      notificationId: reservation.notificationId,
      messageId: sent.messageId,
      templateName: sent.templateName || this.templateName,
    });
  }
}

export default new WepClientNoticeService();
