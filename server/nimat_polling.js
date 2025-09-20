/*
NIMAT — Polling simple de Google Drive + envío por perfil (REA/REB)
===================================================================

Este script usa el SDK mini (`createNimatSdk`) para:
- Consultar si cambiaron los PDFs de Drive por perfil (REA / REB)
- Si hay cambio: subir una vez a WhatsApp (media_id) y enviar a los destinatarios del perfil
- Respetar horario comercial Cba (Lun–Vie 07:30–19:00, Sáb 08:00–12:30)
- Correr cada 2 horas por cron (configurable)

Requisitos:
- Node 18+
- `npm i dotenv node-cron`
- Tener `nimat_whatsapp_sdk.js` en el mismo directorio
- Credenciales de Google: `GOOGLE_APPLICATION_CREDENTIALS`→ JSON de Service Account con acceso a los PDFs

.env ejemplo:
-------------
WHATSAPP_TOKEN=EAAG_xxx
WABA_PHONE_NUMBER_ID=123456789012345
TEMPLATE_NAME=nimat_aviso_precios_doc_fecha

# Google Drive (IDs fijos de cada perfil)
GDRIVE_FILE_ID_REA=1ID_REA
GDRIVE_FILE_ID_REB=1ID_REB

# Nombres mostrados al cliente (opcional)
PDF_FILENAME_REA="REA DISTRIBUCION.pdf"
PDF_FILENAME_REB="REB DISTRIBUCION.pdf"

# Recipients por perfil (coma separada, E.164)
RECIPIENTS_REA=+5493511111111,+5493512222222
RECIPIENTS_REB=+5493513333333

# Zona horaria y cron
TIMEZONE=America/Argentina/Cordoba
CRON_SPEC=0 *2 * * *

# Estado local para cachear md5/modifiedTime
STATE_PATH=./nimat_drive_state.json
*/

import 'dotenv/config';
import cron from 'node-cron';
import { createNimatSdk } from './nimat_whatsapp_sdk.js';

const {
  WHATSAPP_TOKEN,
  WABA_PHONE_NUMBER_ID,
  TEMPLATE_NAME,
  GDRIVE_FILE_ID_REA,
  GDRIVE_FILE_ID_REB,
  PDF_FILENAME_REA,
  PDF_FILENAME_REB,
  RECIPIENTS_REA,
  RECIPIENTS_REB,
  TIMEZONE,
  CRON_SPEC,
  STATE_PATH
} = process.env;

if (!WHATSAPP_TOKEN || !WABA_PHONE_NUMBER_ID) {
  console.error('❌ Faltan WHATSAPP_TOKEN/WABA_PHONE_NUMBER_ID');
  process.exit(1);
}
if (!GDRIVE_FILE_ID_REA || !GDRIVE_FILE_ID_REB) {
  console.error('❌ Faltan GDRIVE_FILE_ID_REA/GDRIVE_FILE_ID_REB');
  process.exit(1);
}

function parseRecipients(s) {
  return String(s || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
}

const recipientsByPerfil = {
  REA: parseRecipients(RECIPIENTS_REA),
  REB: parseRecipients(RECIPIENTS_REB)
};

function dentroDeHorarioComercial(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now);
  const wd = parts.find(p => p.type === 'weekday').value.toLowerCase();
  const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
  const minutes = h * 60 + m;
  const M = (hh, mm) => hh * 60 + mm;
  if (['mon','tue','wed','thu','fri'].includes(wd)) return minutes >= M(7,30) && minutes <= M(19,0);
  if (wd === 'sat') return minutes >= M(8,0) && minutes <= M(12,30);
  return false;
}

const sdk = createNimatSdk({
  waToken: WHATSAPP_TOKEN,
  waPhoneNumberId: WABA_PHONE_NUMBER_ID,
  templateName: TEMPLATE_NAME,
  drive: { reaFileId: GDRIVE_FILE_ID_REA, rebFileId: GDRIVE_FILE_ID_REB },
  filenames: { rea: PDF_FILENAME_REA, reb: PDF_FILENAME_REB },
  timezone: TIMEZONE,
  statePath: STATE_PATH
});

async function runOnceForPerfil(pf) {
  const recipients = recipientsByPerfil[pf] || [];
  if (!recipients.length) {
    console.log(`[${pf}] No hay recipients configurados, salto.`);
    return { ok: true, sent: 0, reason: 'no-recipients' };
  }
  console.log(`[${pf}] Chequeando cambios en Drive…`);
  const r = await sdk.sendIfChanged({ perfil: pf, recipients });
  if (r.reason === 'no-change') {
    console.log(`[${pf}] Sin cambios → no se envía.`);
  } else {
    console.log(`[${pf}] Envíos realizados: ${r.sent}`);
  }
  return r;
}

async function runOnce() {
  if (!dentroDeHorarioComercial()) {
    const now = new Date().toLocaleString('es-AR', { timeZone: TIMEZONE });
    console.log(`[SKIP] Fuera de horario comercial (${now} ${TIMEZONE})`);
    return;
  }
  await runOnceForPerfil('REA');
  await runOnceForPerfil('REB');
}

// CLI helpers
const ONCE = process.argv.includes('--once');
const PF = (process.argv.find(a => a.startsWith('--perfil=')) || '').split('=')[1];
const TO = (process.argv.find(a => a.startsWith('--to=')) || '').split('=')[1];

(async () => {
  if (ONCE) {
    if (PF && TO) {
      // prueba directa a una lista (coma separada) del perfil indicado
      const recs = parseRecipients(TO);
      const out = await sdk.sendIfChanged({ perfil: PF.toUpperCase(), recipients: recs });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    await runOnce();
    return;
  }

  // Scheduler
  cron.schedule(CRON_SPEC, runOnce, { timezone: TIMEZONE });
  console.log(`⏱️ Polling activo: ${CRON_SPEC} TZ=${TIMEZONE} (profiles: REA/REB)`);
  console.log('• Envío inmediato si cambió: node nimat_polling.js --once');
  console.log('• Test perfil puntual: node nimat_polling.js --once --perfil=REB --to=+5493511234567');
})();
