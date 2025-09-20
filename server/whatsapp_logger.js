/*
NIMAT — Logger v2 (éxitos y errores) 
====================================

Provee dos helpers:
- logEnviadoOk({ to, perfil, messageId?, filename?, mediaId?, templateName?, date?, logPath?, timezone? })
- logErrorEnvio({ to, perfil, err, templateName?, filename?, mediaId?, date?, logPath?, timezone? })

Salida:
- ./logs/envios_ok.csv    → date_iso,date_local,to,perfil,status,message_id,template_name,filename,media_id
- ./logs/envios_error.csv → date_iso,date_local,to,perfil,status,http_status,wa_code,wa_subcode,wa_type,fbtrace_id,error_message,template_name,filename,media_id

Uso mínimo:
import { logEnviadoOk, logErrorEnvio } from './nimat_logger_v2.js';

try {
  const out = await sdk.sendPriceList({ to: '+5493511234567', perfil: 'REA' });
  const waId = out?.wa?.messages?.[0]?.id || '';
  logEnviadoOk({ to: out.to, perfil: out.perfil, messageId: waId, mediaId: out.mediaId, templateName: 'nimat_aviso_precios_doc_fecha' });
} catch (err) {
  logErrorEnvio({ to: '+5493511234567', perfil: 'REA', err, templateName: 'nimat_aviso_precios_doc_fecha' });
}
*/

import fs from 'node:fs';
import path from 'node:path';

function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function csvEscape(v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

function formatLocal(date, timezone) {
  return new Date(date).toLocaleString('es-AR', { timeZone: timezone });
}

function extractWaError(err) {
  const out = { httpStatus: '', waCode: '', waSubcode: '', waType: '', fbtraceId: '', message: '' };
  // axios-like error
  const r = err?.response;
  if (r) {
    out.httpStatus = r.status || '';
    const e = r.data?.error || {};
    out.waCode = e.code ?? '';
    out.waSubcode = e.error_subcode ?? '';
    out.waType = e.type ?? '';
    out.fbtraceId = e.fbtrace_id ?? '';
    out.message = e.message ?? (typeof err.message === 'string' ? err.message : '');
    return out;
  }
  // generic error
  if (typeof err?.message === 'string') out.message = err.message;
  return out;
}

export function logEnviadoOk({
  to,
  perfil,
  messageId,
  filename,
  mediaId = '',
  templateName = '',
  date = new Date(),
  logPath = './logs/envios_ok.csv',
  timezone = 'America/Argentina/Buenos_Aires'
} = {}) {
  if (!to) throw new Error('to requerido');
  const dateIso = new Date(date).toISOString();
  const dateLocal = formatLocal(date, timezone);

  ensureDir(logPath);
  const header = 'date_iso,date_local,to,perfil,status,message_id,template_name,filename,media_id\n';
  if (!exists(logPath)) fs.writeFileSync(logPath, header);

  const row = [dateIso, dateLocal, to, perfil, 'ENVIADO_OK', messageId, templateName, filename, mediaId]
    .map(csvEscape).join(',') + '\n';
  fs.appendFileSync(logPath, row);
  return { ok: true, logPath };
}

export function logErrorEnvio({
  to,
  perfil,
  err,
  templateName,
  filename,
  mediaId = '',
  date = new Date(),
  logPath = './logs/envios_error.csv',
  timezone = 'America/Argentina/Buenos_Aires'
} = {}) {
  const dateIso = new Date(date).toISOString();
  const dateLocal = formatLocal(date, timezone);
  const det = extractWaError(err);

  ensureDir(logPath);
  const header = 'date_iso,date_local,to,perfil,status,http_status,wa_code,wa_subcode,wa_type,fbtrace_id,error_message,template_name,filename,media_id\n';
  if (!exists(logPath)) fs.writeFileSync(logPath, header);

  const row = [
    dateIso,
    dateLocal,
    to || '',
    perfil,
    'ENVIADO_ERROR',
    det.httpStatus,
    det.waCode,
    det.waSubcode,
    det.waType,
    det.fbtraceId,
    det.message,
    templateName,
    filename,
    mediaId
  ].map(csvEscape).join(',') + '\n';

  fs.appendFileSync(logPath, row);
  return { ok: true, logPath };
}

export default { logEnviadoOk, logErrorEnvio };
