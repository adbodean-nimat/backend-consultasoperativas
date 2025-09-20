import { createNimatSdk } from './nimat_whatsapp_sdk.js';

export const sdk = createNimatSdk({
  waToken: process.env.WHATSAPP_TOKEN,
  waPhoneNumberId: process.env.WABA_PHONE_NUMBER_ID,
  templateName: process.env.TEMPLATE_NAME, // ej: nimat_aviso_precios_doc_fecha
  drive: { reaFileId: process.env.GDRIVE_FILE_ID_REA, rebFileId: process.env.GDRIVE_FILE_ID_REB },
  filenames: { rea: process.env.PDF_FILENAME_REA, reb: process.env.PDF_FILENAME_REB },
  timezone: process.env.TIMEZONE,
  statePath: './nimat_drive_state.json' // cache local de md5/modifiedTime
});
