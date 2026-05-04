import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';

const { WHATSAPP_TOKEN, WABA_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME, WHATSAPP_TEMPLATE_LANG, WABA_VERSION } = process.env;

function validarConfigWhatsapp() {
    const faltantes = [];

    if (!WHATSAPP_TOKEN) faltantes.push('WHATSAPP_TOKEN');
    if (!WABA_PHONE_NUMBER_ID) faltantes.push('WHATSAPP_PHONE_NUMBER_ID');
    if (!WHATSAPP_TEMPLATE_NAME) faltantes.push('WHATSAPP_TEMPLATE_NAME');
    if (!WABA_VERSION) faltantes.push('WABA_VERSION');

    if (faltantes.length > 0) {
        throw new Error(`Faltan variables de entorno: ${faltantes.join(', ')}`);
    }
}

function limpiarTelefonoWhatsapp(telefono) {
    return String(telefono || '').replace(/\D/g, '');
}

async function parseMetaResponse(response) {
    const result = await response.json().catch(() => null);

    if (!response.ok) {
        const message = result?.error?.message || result?.error?.error_user_msg || 'Error desconocido de Meta WhatsApp API';

        throw new Error(
            JSON.stringify(
                {
                    status: response.status,
                    message,
                    meta: result,
                },
                null,
                2
            )
        );
    }

    return result;
}

async function subirPdfAMeta(pdfPath) {
    validarConfigWhatsapp();

    if (!fs.existsSync(pdfPath)) {
        throw new Error(`No existe el PDF: ${pdfPath}`);
    }

    const url = `https://graph.facebook.com/${WABA_VERSION}/${WABA_PHONE_NUMBER_ID}/media`;

    const form = new FormData();

    form.append('messaging_product', 'whatsapp');

    form.append('file', fs.createReadStream(pdfPath), {
        filename: path.basename(pdfPath),
        contentType: 'application/pdf',
    });

    const response = await axios.post(url, form, {
        headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            ...form.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
    });

    return response.data.id;
}

async function enviarTemplateDeudaConPdf({ telefono, nombreCliente, pdfPath, filename }) {
    validarConfigWhatsapp();

    const telefonoLimpio = limpiarTelefonoWhatsapp(telefono);

    if (!telefonoLimpio) {
        throw new Error('Teléfono WhatsApp vacío o inválido');
    }

    if (!nombreCliente) {
        throw new Error('Falta nombreCliente para la variable {{1}}');
    }

    const nombreArchivo = filename || path.basename(pdfPath);

    const mediaId = await subirPdfAMeta(pdfPath);

    const url = `https://graph.facebook.com/${WABA_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;

    const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: telefonoLimpio,
        type: 'template',
        template: {
            name: WHATSAPP_TEMPLATE_NAME,
            language: {
                code: WHATSAPP_TEMPLATE_LANG || 'es_AR',
            },
            components: [
                {
                    type: 'header',
                    parameters: [
                        {
                            type: 'document',
                            document: {
                                id: mediaId,
                                filename: nombreArchivo,
                            },
                        },
                    ],
                },
                {
                    type: 'body',
                    parameters: [
                        {
                            type: 'text',
                            text: nombreCliente,
                        },
                    ],
                },
            ],
        },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const result = await parseMetaResponse(response);

    return {
        ok: true,
        telefono: telefonoLimpio,
        nombreCliente,
        mediaId,
        filename: nombreArchivo,
        result,
    };
}

export { subirPdfAMeta, enviarTemplateDeudaConPdf, limpiarTelefonoWhatsapp };
