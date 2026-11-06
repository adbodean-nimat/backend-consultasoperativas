import wepSettings from "../modules/wep/wep-settings.service.js";
import { requireStopOrder } from "../modules/wep/wep-stop-orders.util.js";
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";

const {
  WHATSAPP_TOKEN,
  WABA_PHONE_NUMBER_ID,
  WHATSAPP_TEMPLATE_NAME,
  WHATSAPP_TEMPLATE_LANG,
  WABA_VERSION,
} = process.env;

function validarConfigWhatsapp(
  templateName = WHATSAPP_TEMPLATE_NAME,
  templateVariableName = "WHATSAPP_TEMPLATE_NAME",
) {
  const faltantes = [];

  if (!WHATSAPP_TOKEN) faltantes.push("WHATSAPP_TOKEN");
  if (!WABA_PHONE_NUMBER_ID) faltantes.push("WABA_PHONE_NUMBER_ID");
  if (!templateName) faltantes.push(templateVariableName);
  if (!WABA_VERSION) faltantes.push("WABA_VERSION");

  if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno: ${faltantes.join(", ")}`);
  }
}

function limpiarTelefonoWhatsapp(telefono) {
  return String(telefono || "").replace(/\D/g, "");
}

function normalizarErrorMeta(error) {
  if (!axios.isAxiosError(error)) {
    return error;
  }

  const status = error.response?.status || null;
  const meta = error.response?.data || null;
  const message =
    meta?.error?.message ||
    meta?.error?.error_user_msg ||
    error.message ||
    "Error desconocido de Meta WhatsApp API";

  const normalized = new Error(
    JSON.stringify(
      {
        status,
        message,
        meta,
      },
      null,
      2,
    ),
  );

  normalized.status = status;
  normalized.meta = meta;
  return normalized;
}

async function postMetaWhatsapp(url, data, config) {
  try {
    return await axios.post(url, data, config);
  } catch (error) {
    throw normalizarErrorMeta(error);
  }
}

async function subirPdfAMeta(pdfPath) {
  validarConfigWhatsapp();

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`No existe el PDF: ${pdfPath}`);
  }

  const url = `https://graph.facebook.com/${WABA_VERSION}/${WABA_PHONE_NUMBER_ID}/media`;

  const form = new FormData();

  form.append("messaging_product", "whatsapp");

  form.append("file", fs.createReadStream(pdfPath), {
    filename: path.basename(pdfPath),
    contentType: "application/pdf",
  });

  const response = await postMetaWhatsapp(url, form, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 60000,
  });

  if (!response.data?.id) {
    throw new Error("Meta no devolvió el id del PDF subido");
  }

  return response.data.id;
}

async function enviarTemplateDeudaConPdf({
  telefono,
  clienteId,
  nombreCliente,
  totalSaldo,
  cantidadComprobantes,
  pdfPath,
  filename,
}) {
  validarConfigWhatsapp();

  const telefonoLimpio = limpiarTelefonoWhatsapp(telefono);

  if (!telefonoLimpio) {
    throw new Error("Teléfono WhatsApp vacío o inválido");
  }

  if (!nombreCliente) {
    throw new Error("Falta nombreCliente para la variable {{1}}");
  }

  if (!pdfPath) {
    throw new Error("Falta pdfPath para enviar el documento por WhatsApp");
  }

  const nombreArchivo = filename || path.basename(pdfPath);

  console.log(
    `Enviando template de deuda a ${telefonoLimpio} (${nombreCliente}) con PDF: ${nombreArchivo}`,
  );

  const mediaId = await subirPdfAMeta(pdfPath);

  const url = `https://graph.facebook.com/${WABA_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: telefonoLimpio,
    type: "template",
    template: {
      name: WHATSAPP_TEMPLATE_NAME,
      language: {
        code: WHATSAPP_TEMPLATE_LANG || "es_AR",
      },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: {
                id: mediaId,
                filename: "AVISO DE DEUDA VENCIDA.pdf",
              },
            },
          ],
        },
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: String(clienteId),
            },
            {
              type: "text",
              text: nombreCliente,
            },
            {
              type: "text",
              text: String(totalSaldo),
            },
            {
              type: "text",
              text: String(cantidadComprobantes),
            },
          ],
        },
      ],
    },
  };

  const response = await postMetaWhatsapp(url, body, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    timeout: 60000,
  });

  const result = response.data;

  //console.log("Respuesta Meta WhatsApp API:", JSON.stringify(result, null, 2));

  return {
    ok: true,
    telefono: telefonoLimpio,
    nombreCliente,
    mediaId,
    filename: nombreArchivo,
    result,
  };
}

async function sendWepPayload(type, options, buildPayload) {
  const config = await wepSettings.whatsapp(type, options);
  const body = buildPayload({ ...options, telefono: config.testPhone || options.telefono, templateName: config.templateName, templateLanguage: config.templateLanguage });
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
  // Axios incluye Authorization y datos del destinatario: no propagar su error original.
  let response;
  try {
    response = await axios.post(url, body, { headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" }, timeout: 60000 });
  } catch (cause) {
    const error = new Error("No se pudo enviar el aviso de WEP a Meta");
    error.status = Number(cause.response?.status) || null;
    error.meta = { error: { code: Number(cause.response?.data?.error?.code) || null, message: "No se pudo enviar el aviso de WEP a Meta" } };
    throw error;
  }
  const messageId = response.data?.messages?.[0]?.id;
  if (!messageId) throw new Error("Meta no devolvió un identificador de mensaje");
  return { messageId, templateName: config.templateName };
}

async function enviarTemplateEntregaEnCamino(options) {
  return sendWepPayload("legacy", options, ({ telefono, nombreCliente, templateName, templateLanguage }) => {
    const to = limpiarTelefonoWhatsapp(telefono);
    if (!to) throw new Error("Teléfono WhatsApp vacío o inválido");
    return { messaging_product: "whatsapp", recipient_type: "individual", to, type: "template",
      template: { name: templateName, language: { code: templateLanguage }, components: [
        { type: "body", parameters: [{ type: "text", text: String(nombreCliente || "cliente") }] },
      ] } };
  });
}

// Llegada estimada: BODY pedido/ETA; botón URL publicId independiente.
function buildEnCaminoEtaTemplatePayload({
  telefono,
  templateName,
  templateLanguage,
  etaMinutes,
  pedidoPrincipal,
  publicId,
}) {
  const telefonoLimpio = limpiarTelefonoWhatsapp(telefono);
  if (!telefonoLimpio) {
    throw new Error("Teléfono WhatsApp vacío o inválido");
  }
  if (!Number.isSafeInteger(etaMinutes) || etaMinutes < 1) {
    throw new Error("ETA de entrega inválido");
  }
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(String(publicId || ""))) {
    throw new Error("publicId de tracking inválido");
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: telefonoLimpio,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: requireStopOrder(pedidoPrincipal) },
            { type: "text", text: String(etaMinutes) },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: publicId }],
        },
      ],
    },
  };
}

async function enviarTemplateEntregaEnCaminoConEta(options) {
  return sendWepPayload(options.approximateArea ? "enCaminoZona" : "enCamino", options, buildEnCaminoEtaTemplatePayload);
}

// Contrato de wep_programada_test: tres variables BODY (pedido/franja) y el
// sufijo publicId del botón URL. Meta completa la URL configurada en la plantilla.
function buildProgrammedTemplatePayload({
  telefono,
  templateName,
  templateLanguage,
  datos,
  publicId,
}) {
  const telefonoLimpio = limpiarTelefonoWhatsapp(telefono);
  if (!telefonoLimpio) {
    throw new Error("Teléfono WhatsApp vacío o inválido");
  }
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(String(publicId || ""))) {
    throw new Error("publicId de tracking inválido");
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: telefonoLimpio,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: requireStopOrder(datos?.pedido?.principal) },
            { type: "text", text: String(datos?.horaDesde || "") },
            { type: "text", text: String(datos?.horaHasta || "") },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: publicId }],
        },
      ],
    },
  };
}

async function enviarTemplateEntregaProgramada(options) {
  return sendWepPayload(options.test ? "programmedTest" : "programmed", options, buildProgrammedTemplatePayload);
}

// wep_en_reparto_test: BODY pedido; botón URL publicId independiente.
function buildEnRepartoTemplatePayload({
  telefono,
  templateName,
  templateLanguage,
  pedidoPrincipal,
  publicId,
}) {
  const telefonoLimpio = limpiarTelefonoWhatsapp(telefono);
  if (!telefonoLimpio) {
    throw new Error("Teléfono WhatsApp vacío o inválido");
  }
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(String(publicId || ""))) {
    throw new Error("publicId de tracking inválido");
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: telefonoLimpio,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: requireStopOrder(pedidoPrincipal) }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: publicId }],
        },
      ],
    },
  };
}

async function enviarTemplateEntregaEnReparto(options) {
  return sendWepPayload("enReparto", options, buildEnRepartoTemplatePayload);
}

export {
  buildProgrammedTemplatePayload,
  buildEnCaminoEtaTemplatePayload,
  buildEnRepartoTemplatePayload,
  subirPdfAMeta,
  enviarTemplateDeudaConPdf,
  enviarTemplateEntregaEnCamino,
  enviarTemplateEntregaEnCaminoConEta,
  enviarTemplateEntregaEnReparto,
  enviarTemplateEntregaProgramada,
  limpiarTelefonoWhatsapp,
};
