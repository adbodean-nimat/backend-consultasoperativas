import dotenv from "dotenv";
dotenv.config();
import cron from "node-cron";
import {
  procesoEnvio,
  procesoEnvioRevendedores,
} from "../services/procesoEnvio.service.js";
import Pg from "../../dboperacion_pg.js";

let task = null;

export async function recargarCronDesdeDB() {
  const config = await Pg.obtenerConfigEnvio();
  //console.log('Recargando cron desde DB con config:', config);
  if (task) {
    task.stop();
    task.destroy();
    task = null;
  }

  task = cron.schedule(
    config.cron_schedule,
    async () => {
      await procesoEnvio();
      await procesoEnvioRevendedores();
    },
    {
      scheduled: false,
      timezone: config.timezone || "America/Argentina/Buenos_Aires",
    },
  );

  if (config.activo) {
    task.start();
  } else {
    task.stop();
  }

  return estadoCron();
}

export async function inicializarCronEnviosDesdeDB() {
  return await recargarCronDesdeDB();
}

export function startCron() {
  if (task) task.start();
  return estadoCron();
}

export function stopCron() {
  if (task) task.stop();
  return estadoCron();
}

export function estadoCron() {
  if (!task) return "NO_INICIALIZADO";
  return task.getStatus();
}
