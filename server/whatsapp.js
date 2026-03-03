/*
NIMAT — Servicio Express para enviar PDF por perfil comercial (REA/REB)
======================================================================

Provee:
- Función: enviarListaPreciosPorPerfil({ to, perfil, fecha? })
- Endpoint Express: POST /api/whatsapp/lista-precios  { to, perfil, fecha? }

Flujo:
1) Según `perfil` (REA|REB) toma el ID fijo de Drive (.env) y descarga el PDF.
2) Sube el PDF a WhatsApp Cloud API (/media) → obtiene `media_id`.
3) Envía la plantilla `TEMPLATE_NAME` con header Document (ese `media_id`) y {{1}} = `fecha`.

Requisitos:
- Node 18+
- `npm i express axios form-data dotenv`
- Plantilla aprobada en Meta (ej.: nimat_aviso_precios_doc_fecha) con Header=Document y Footer="El equipo de NIMAT"

.env esperado:
--------------
WHATSAPP_TOKEN=EAAG_xxx
WABA_PHONE_NUMBER_ID=123456789012345
TEMPLATE_NAME=nimat_aviso_precios_doc_fecha

# Google Drive (ID fijos de cada perfil, archivo público con enlace)
GDRIVE_FILE_ID_REA=1ID_XXXX_REA
GDRIVE_FILE_ID_REB=1ID_XXXX_REB

# Nombres que verá el cliente (opcional)
PDF_FILENAME_REA=REA DISTRIBUCION.pdf
PDF_FILENAME_REB=REB DISTRIBUCION.pdf

# Server
PORT=3000
TIMEZONE=America/Argentina/Cordoba
*/

import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';
import FormData from 'form-data';
import { pipeline } from 'node:stream/promises';
import crypto from 'crypto';
import { google } from 'googleapis';

function hashFile(path) {
  const data = fs.readFileSync(path);
  return crypto.createHash('md5').update(data).digest('hex');
}

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
  GOOGLE_APPLICATION_CREDENTIALS
} = process.env;

if (!WHATSAPP_TOKEN || !WABA_PHONE_NUMBER_ID) {
  console.error('❌ Faltan WHATSAPP_TOKEN o WABA_PHONE_NUMBER_ID en .env');
  process.exit(1);
}
if (!GDRIVE_FILE_ID_REA || !GDRIVE_FILE_ID_REB) {
  console.error('❌ Faltan GDRIVE_FILE_ID_REA o GDRIVE_FILE_ID_REB en .env');
  process.exit(1);
}
if (!GOOGLE_APPLICATION_CREDENTIALS) {
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

async function descargarDesdeDriveAPI(fileId, targetPath) {
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_APPLICATION_CREDENTIALS, // ruta al JSON
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
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', fs.createReadStream(filePath), {
    filename: fileName, contentType: 'application/pdf'
  });
  const url = `https://graph.facebook.com/${WABA_VERSION}/${WABA_PHONE_NUMBER_ID}/media`;
  const resp = await axios.post(url, form, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, ...form.getHeaders() },
    maxContentLength: Infinity, maxBodyLength: Infinity,
    validateStatus: s => s >= 200 && s < 500
  });
  if (resp.status >= 400) {
    throw new Error(`Error /media ${resp.status}: ${JSON.stringify(resp.data)}`);
  }
  return resp.data.id; // media_id
}

async function enviarTemplateConMedia({ toE164, templateName, mediaId, filename, fecha }) {
  const to = toE164.replace(/^\+/, ''); // Cloud API: sin "+"
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template', // 'template' o 'product'
    message_activity_type: 'MARKETING',
    ttl: 86400,
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
    validateStatus: s => s >= 200 && s < 500
  });
  if (resp.status >= 400) {
    throw {
      status: resp.status,
      error: resp.data?.error || 'Error desconocido',
    };
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
  const MEDIA_CACHE = {
    REA: null,
    REB: null
  };

  try {
    // 1) Descargar PDF desde Drive a /tmp
    const tmp = path.join(os.tmpdir(), `nimat_${pf}_${Date.now()}.pdf`);
    await descargarDesdeDriveAPI(fileId, tmp);
    
    // 2) Subir a WhatsApp → media_id
    if (!MEDIA_CACHE[pf]) {
      MEDIA_CACHE[pf] = await subirPdfAWhatsApp(tmp, filename);
    }

    const mediaId = MEDIA_CACHE[pf];

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