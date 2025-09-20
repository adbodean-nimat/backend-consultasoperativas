/*
NIMAT — SDK mini para enviar listas por WhatsApp con PDFs REA/REB + ver cambios en Drive
=======================================================================================

Exporta una factoría `createNimatSdk(config)` que devuelve métodos:
- `sendPriceList({ to, perfil, fecha? })` → descarga desde Drive el PDF del perfil, lo sube a WhatsApp (media_id) y envía la plantilla.
- `checkDriveChanged(perfil)` → devuelve { changed, meta } comparando md5Checksum/modifiedTime con un estado local.
- `sendIfChanged({ perfil, recipients, fecha? })` → si detecta cambios en el PDF del perfil, envía a todos los `recipients`.

Dependencias: `npm i axios form-data googleapis`
Requiere credenciales de Google (Service Account) con acceso a los archivos de Drive (compartir con el mail del SA),
y WhatsApp Cloud API (token + phoneNumberId) y una plantilla aprobada con Header=Document.

Config mínima esperada en `createNimatSdk`:
{
  waToken: 'EAAG_...',
  waPhoneNumberId: '1234567890',
  templateName: 'nimat_aviso_precios_doc_fecha',
  drive: { reaFileId: '1ID_REA', rebFileId: '1ID_REB' },
  filenames: { rea: 'REA DISTRIBUCION.pdf', reb: 'REB DISTRIBUCION.pdf' },
  timezone: 'America/Argentina/Cordoba', // opcional
  statePath: './nimat_drive_state.json'   // opcional, para cache de md5/modifiedTime
}

Para Google Auth: define `GOOGLE_APPLICATION_CREDENTIALS` apuntando al JSON del Service Account,
o bien inyectá credenciales vía variables de entorno compatibles con google-auth-library.
*/

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';
import FormData from 'form-data';
import { google } from 'googleapis';

function ensureE164(num) {
  const n = String(num || '').trim();
  if (!/^\+\d{8,15}$/.test(n)) throw new Error('`to` debe estar en formato E.164 (ej. +5493511234567)');
  return n;
}
function ensurePerfil(v) {
  const p = String(v || '').trim().toUpperCase();
  if (p === 'REA' || p === 'REB') return p;
  throw new Error('`perfil` inválido (use REA o REB)');
}
function todayAR(tz = 'America/Argentina/Buenos_Aires') {
  return new Intl.DateTimeFormat('es-AR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
}

function loadState(statePath) {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return {}; }
}
function saveState(statePath, obj) {
  fs.writeFileSync(statePath, JSON.stringify(obj, null, 2));
}

export function createNimatSdk(config) {
  const {
    waToken,
    waPhoneNumberId,
    templateName,
    drive: { reaFileId, rebFileId } = {},
    filenames: { rea: filenameREA = 'REA DISTRIBUCION.pdf', reb: filenameREB = 'REB DISTRIBUCION.pdf' } = {},
    timezone,
    statePath = path.resolve('./nimat_drive_state.json')
  } = config || {};

  if (!waToken || !waPhoneNumberId) throw new Error('Faltan waToken/waPhoneNumberId en config');
  if (!reaFileId || !rebFileId) throw new Error('Faltan drive.reaFileId / drive.rebFileId en config');

  const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth });

  const perfilMap = {
    REA: { fileId: reaFileId, filename: filenameREA },
    REB: { fileId: rebFileId, filename: filenameREB }
  };

  async function getDriveMeta(fileId) {
    const { data } = await drive.files.get({ fileId, fields: 'id,name,modifiedTime,md5Checksum,size' });
    return data; // { id, name, modifiedTime, md5Checksum, size }
  }

  async function downloadDriveToTmp(fileId, filename) {
    const tmp = path.join(os.tmpdir(), `nimat_${fileId}_${Date.now()}.pdf`);
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(tmp);
      res.data.on('error', reject).pipe(ws).on('finish', resolve).on('error', reject);
    });
    // rename to keep the desired filename if needed
    const withName = path.join(path.dirname(tmp), filename);
    fs.renameSync(tmp, withName);
    return withName;
  }

  async function uploadToWhatsApp(filePath, fileName) {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'application/pdf');
    form.append('file', fs.createReadStream(filePath), { filename: fileName, contentType: 'application/pdf' });

    const url = `https://graph.facebook.com/v20.0/${waPhoneNumberId}/media`;
    const resp = await axios.post(url, form, {
      headers: { Authorization: `Bearer ${waToken}`, ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: s => s >= 200 && s < 500
    });
    if (resp.status >= 400) throw new Error(`Error /media ${resp.status}: ${JSON.stringify(resp.data)}`);
    return resp.data.id; // media_id
  }

  async function sendTemplateWithMedia({ toE164, mediaId, filename, fecha }) {
    const to = toE164.replace(/^\+/, '');
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'es' },
        components: [
          { type: 'header', parameters: [ { type: 'document', document: { id: mediaId, filename } } ] },
          { type: 'body', parameters: [ { type: 'text', text: fecha } ] }
        ]
      }
    };
    const url = `https://graph.facebook.com/v20.0/${waPhoneNumberId}/messages`;
    const resp = await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      validateStatus: s => s >= 200 && s < 500
    });
    if (resp.status >= 400) throw new Error(`Error /messages ${resp.status}: ${JSON.stringify(resp.data)}`);
    return resp.data;
  }

  async function sendPriceList({ to, perfil, fecha }) {
    const toE164 = ensureE164(to);
    const pf = ensurePerfil(perfil);
    const { fileId, filename } = perfilMap[pf];
    const fechaTexto = fecha && String(fecha).trim() ? String(fecha).trim() : todayAR(timezone);

    const meta = await getDriveMeta(fileId);
    const filePath = await downloadDriveToTmp(fileId, filename);
    try {
      const mediaId = await uploadToWhatsApp(filePath, filename);
      const wa = await sendTemplateWithMedia({ toE164, mediaId, filename, fecha: fechaTexto });
      return { ok: true, to: toE164, perfil: pf, mediaId, fecha: fechaTexto, wa, meta };
    } finally {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }

  function stateKeyFor(fileId) { return `file:${fileId}`; }

  async function checkDriveChanged(perfil) {
    const pf = ensurePerfil(perfil);
    const { fileId } = perfilMap[pf];
    const meta = await getDriveMeta(fileId);

    const state = loadState(statePath);
    const key = stateKeyFor(fileId);
    const prev = state[key];

    const current = { md5: meta.md5Checksum || null, modified: meta.modifiedTime || null, size: meta.size || null };
    const changed = !prev || prev.md5 !== current.md5 || prev.modified !== current.modified || prev.size !== current.size;
    return { changed, meta: { ...meta }, current, prev, key, statePath };
  }

  async function sendIfChanged({ perfil, recipients, fecha }) {
    const pf = ensurePerfil(perfil);
    const { fileId, filename } = perfilMap[pf];
    const check = await checkDriveChanged(pf);
    if (!check.changed) return { ok: true, sent: 0, reason: 'no-change', meta: check.meta };

    const fechaTexto = fecha && String(fecha).trim() ? String(fecha).trim() : todayAR(timezone);

    // descarga una vez, sube una vez, reusa media_id para todos (eficiente)
    const filePath = await downloadDriveToTmp(fileId, filename);
    try {
      const mediaId = await uploadToWhatsApp(filePath, filename);
      const results = [];
      for (const to of recipients) {
        const toE164 = ensureE164(to);
        const wa = await sendTemplateWithMedia({ toE164, mediaId, filename, fecha: fechaTexto });
        results.push({ to: toE164, wa });
      }
      // actualizar estado
      const state = loadState(statePath);
      state[check.key] = { md5: check.current.md5, modified: check.current.modified, size: check.current.size, updatedAt: new Date().toISOString() };
      saveState(statePath, state);
      return { ok: true, sent: results.length, results, meta: check.meta };
    } finally {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }

  return { sendPriceList, checkDriveChanged, sendIfChanged };
}