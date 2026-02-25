import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';
import FormData from 'form-data';
import { pipeline } from 'node:stream/promises';
import { google } from 'googleapis';

const {
  WABA_VERSION,
  WHATSAPP_TOKEN,
  WABA_PHONE_NUMBER_ID,
  TEMPLATE_NAME,
  GDRIVE_FILE_ID_REA,
  GDRIVE_FILE_ID_REB,
  PDF_FILENAME_REA,
  PDF_FILENAME_REB,
  TIMEZONE,
} = process.env;

if (!WHATSAPP_TOKEN || !WABA_PHONE_NUMBER_ID) {
  console.error('❌ Faltan WHATSAPP_TOKEN o WABA_PHONE_NUMBER_ID en .env');
  process.exit(1);
}
if (!GDRIVE_FILE_ID_REA || !GDRIVE_FILE_ID_REB) {
  console.error('❌ Faltan GDRIVE_FILE_ID_REA o GDRIVE_FILE_ID_REB en .env');
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('❌ Falta GOOGLE_APPLICATION_CREDENTIALS en .env');
  process.exit(1);
}

const PERFILES = {
  REA: { fileId: GDRIVE_FILE_ID_REA, filename: PDF_FILENAME_REA },
  REB: { fileId: GDRIVE_FILE_ID_REB, filename: PDF_FILENAME_REB }
};

function fechaHoyAR(tz = TIMEZONE) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date());
}

function asegurarPerfil(v) {
  const p = String(v || '').trim().toUpperCase();
  if (p === 'REA' || p === 'REB') return p;
  throw new Error('perfil inválido (use REA o REB)');
}

function asegurarE164(num) {
  const n = String(num || '').trim();
  if (!/^\+\d{8,15}$/.test(n)) throw new Error('to debe estar en formato E.164 (ej. +5493511234567)');
  return n;
}

/* async function descargarDesdeDrive(fileId, targetPath) {
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const resp = await axios.get(url, {
    responseType: 'stream', maxRedirects: 5,
    validateStatus: s => s >= 200 && s < 400
  });
  const ct = (resp.headers['content-type'] || '').toLowerCase();
  if (ct.includes('text/html')) {
    throw new Error('Drive devolvió HTML (posible no público o pantalla de confirmación). Verificá "Cualquiera con el enlace".');
  }
  await pipeline(resp.data, fs.createWriteStream(targetPath));
  return targetPath;
} */

export async function descargarDesdeDriveAPI(fileId, targetPath) {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, // ruta al JSON
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  await new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(targetPath);
    res.data
      .pipe(dest)
      .on('finish', resolve)
      .on('error', reject);
  });

  return targetPath;
}

async function subirPdfAWhatsApp(filePath, fileName) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF no encontrado en ${filePath}`);
  }
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', fs.createReadStream(filePath), {
    filename: fileName, contentType: 'application/pdf'
  });
  const url = `https://graph.facebook.com/${WABA_VERSION}/${WABA_PHONE_NUMBER_ID}/media`;
  const resp = await axios.post(url, form, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, Accept: 'application/json', ...form.getHeaders() },
    validateStatus: s => s >= 200 && s < 500,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 20000 // 20s timeout para uploads grandes o conexiones lentas
  });
  if (resp.status >= 400) {
    const emsg = resp.data?.error?.message || JSON.stringify(resp.data);
    throw new Error(`WhatsApp /media ${resp.status}: ${emsg}`);
  }
  if (!resp.data?.id) {
    throw new Error(`WhatsApp /media respondió sin id: ${JSON.stringify(resp.data)}`);
  }
  return resp.data.id; // media_id
}

async function enviarTemplateConMedia({ toE164, templateName, mediaId, filename, fecha }) {
  
  if (!mediaId) throw new Error('mediaId vacío (falló upload del PDF)');
  if (!templateName) throw new Error('templateName vacío');
  
  const to = toE164.replace(/^\+/, ''); // Cloud API: sin "+"
  
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template', // 'template' o 'product'
    template: {
      name: templateName,
      language: { code: 'es_AR' }, // si tu plantilla está en es_AR, poné es_AR
      components: [
        { type: 'header', parameters: [ { type: 'document', document: { id: mediaId, filename } } ] },
        { type: 'body', parameters: [ { type: 'text', text: fecha } ] }
      ]
    }
  };
  const url = `https://graph.facebook.com/${WABA_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;
  const resp = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    validateStatus: s => s >= 200 && s < 500,
    timeout: 30000 // 30s timeout para uploads grandes o conexiones lentas
  });
  if (resp.status >= 400) {
    const emsg = resp.data?.error?.message || JSON.stringify(resp.data);
    throw new Error(`WhatsApp /messages ${resp.status}: ${emsg}`);
  }
  return resp.data;
}

// ==============================
// Función principal expuesta
// ==============================
export default async function enviarListaPreciosPorPerfil({ to, perfil }) {
  const toE164 = asegurarE164(to);
  const pf = asegurarPerfil(perfil);
  const { fileId, filename } = PERFILES[pf];
  const fechaTexto = fechaHoyAR();

  const tmp = path.join(os.tmpdir(), `nimat_${pf}_${Date.now()}.pdf`);

  try {
    // 1) Descargar PDF desde Drive a /tmp
    await descargarDesdeDriveAPI(fileId, tmp);

    // 2) Subir a WhatsApp → media_id
    const mediaId = await subirPdfAWhatsApp(tmp, filename);

    // 3) Enviar plantilla con header document
    const result = await enviarTemplateConMedia({
      toE164,
      templateName: TEMPLATE_NAME,
      mediaId,
      filename,
      fecha: fechaTexto
    });

    return { ok: true, to: toE164, perfil: pf, mediaId, fecha: fechaTexto, wa: result };
    
  } catch (err) {
    // Log útil (especialmente para Axios/TLS/AggregateError)
    console.error('Fallo enviarListaPreciosPorPerfil:', {
      message: err?.message,
      code: err?.code,
      name: err?.name,
      cause: err?.cause,
      errors: err?.errors, // AggregateError suele traer esto
      stack: err?.stack,
    });

    // IMPORTANTE: propagar para que el router responda con error y no "ok"
    return { ok: false, error: err?.message || 'Error', to: toE164, perfil: pf };
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
  }
}