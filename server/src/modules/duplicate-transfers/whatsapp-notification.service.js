import axios from "axios";
import { DuplicateTransferError } from "./duplicate-transfer.errors.js";
import { formatLocalDate } from "./duplicate-transfer.normalizer.js";

export class WhatsAppNotificationService {
  constructor({ httpClient = axios, env = process.env } = {}) {
    this.httpClient = httpClient;
    this.env = env;
  }

  buildPayload({ config, groups, from, to }) {
    if (!String(config.whatsapp_recipient || "").trim() || !String(config.whatsapp_template_name || "").trim() || !String(config.whatsapp_template_language || "").trim()) {
      throw new DuplicateTransferError("No se puede construir el payload de WhatsApp con destinatario, plantilla o idioma vacíos", { code: "WHATSAPP_PAYLOAD_INVALID", status: 422 });
    }
    const movementCount = groups.reduce((sum, group) => sum + Number(group.movement_count), 0);
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: config.whatsapp_recipient,
      type: "template",
      template: {
        name: config.whatsapp_template_name,
        language: { code: config.whatsapp_template_language },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: String(groups.length) },
            { type: "text", text: String(movementCount) },
            { type: "text", text: formatLocalDate(from, config.timezone) },
            { type: "text", text: formatLocalDate(to, config.timezone) },
          ],
        }],
      },
    };
  }

  validateEnvironment() {
    const required = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_GRAPH_API_VERSION"];
    const missing = required.filter((key) => !this.env[key]);
    if (missing.length) throw new DuplicateTransferError(`Faltan variables de entorno de WhatsApp: ${missing.join(", ")}`, { code: "WHATSAPP_CONFIG_MISSING", status: 503 });
  }

  async send(payload) {
    this.validateEnvironment();
    const baseUrl = String(this.env.WHATSAPP_API_BASE_URL || "https://graph.facebook.com").replace(/\/$/, "");
    const url = `${baseUrl}/${this.env.WHATSAPP_GRAPH_API_VERSION}/${this.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    try {
      const response = await this.httpClient.post(url, payload, {
        headers: { Authorization: `Bearer ${this.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        timeout: 30_000,
      });
      const messageId = response.data?.messages?.[0]?.id;
      if (!messageId) throw new DuplicateTransferError("Meta no devolvió un identificador de mensaje", { code: "WHATSAPP_RESPONSE_INVALID", status: 502, ambiguous: true });
      return { providerMessageId: messageId };
    } catch (error) {
      if (error instanceof DuplicateTransferError) throw error;
      const status = error?.response?.status || null;
      const timeout = error?.code === "ECONNABORTED" || /timeout/i.test(error?.message || "");
      const transient = timeout || status === 429 || status >= 500;
      const ambiguous = timeout;
      throw new DuplicateTransferError(
        ambiguous ? "El resultado del envío a Meta es ambiguo y requiere revisión" : status >= 400 && status < 500 && status !== 429 ? "Meta rechazó permanentemente el mensaje" : "Meta no pudo procesar el mensaje",
        { code: ambiguous ? "WHATSAPP_TIMEOUT_AMBIGUOUS" : status ? `WHATSAPP_HTTP_${status}` : "WHATSAPP_NETWORK_ERROR", status: 502, transient, ambiguous, cause: error },
      );
    }
  }
}

export default new WhatsAppNotificationService();
