import dotenv from 'dotenv';
dotenv.config();
import jsonToExcel from './jsontoexcel.js';
import { sincronizarCompleto } from './sync-productos-cateogorias.js';
import { syncOpenAI } from './sync-openai.js';
import { CronJob } from 'cron';

let job_lunvie = null;
let job_sab = null;

function stopIfRunning(job) {
  try { if (job) job.stop(); } catch (_) {}
}

export async function initJobs() {
  try {
    const raw = await jsonToExcel.getActualizacionWeb();

    // Si getActualizacionWeb devuelve array, descomentá:
    // const data = Array.isArray(raw) ? raw[0] : raw;
    const data = raw;

    console.log('Configuración de actualización obtenida', data);

    // Siempre limpiar jobs previos antes de recrear
    stopIfRunning(job_lunvie);
    stopIfRunning(job_sab);

    job_lunvie = new CronJob(
      data.actualizacion_cron_lunesaviernes,
      async function () {
        try {
          
          await jsonToExcel.jsontosheet();
          await jsonToExcel.actualizadoWeb();
          
          console.log("▶ Iniciando sincronización completa");
          await sincronizarCompleto();
          
          console.log("▶ Iniciando SyncOpenAI");
          await syncOpenAI();
          
        } catch (err) {
          console.error('Error en job lun-vie:', err);
        }
      },
      null,
      false,
      'America/Argentina/Buenos_Aires'
    );

    job_sab = new CronJob(
      data.actualizacion_cron_sabados,
      async function () {
        try {
          await jsonToExcel.jsontosheet();
          await jsonToExcel.actualizadoWeb();
          
          console.log("▶ Iniciando sincronización completa");
          await sincronizarCompleto();
          
          console.log("▶ Iniciando SyncOpenAI");
          await syncOpenAI();
        } catch (err) {
          console.error('Error en job sábado:', err);
        }
      },
      null,
      false,
      'America/Argentina/Buenos_Aires'
    );

    if (data.actualizacion_automatica === true) {
      job_lunvie.start();
      job_sab.start();
      console.log('Actualización automática: Iniciado');
    } else {
      console.log('Actualización automática: Detenido');
    }
  } catch (error) {
    console.error(error);
  } finally {
    console.log('Todas las tareas están hechas');
  }
}

export function startJobs() {
  if (job_lunvie) job_lunvie.start();
  if (job_sab) job_sab.start();
}

export function stopJobs() {
  if (job_lunvie) job_lunvie.stop();
  if (job_sab) job_sab.stop();
}

initJobs();