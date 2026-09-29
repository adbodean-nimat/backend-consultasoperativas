import dotenv from "dotenv";
dotenv.config();
import cron from "node-cron";
import {
  procesoEnvio,
  procesoEnvioRevendedores,
} from "../services/procesoEnvio.service.js";
import Pg, { pool } from "../../dboperacion_pg.js";

let task = null;
const ENVIO_ADVISORY_LOCK_KEY = 1_948_271_605;

async function ejecutarEnviosConLock() {
  const client = await pool.connect();
  let lockAdquirido = false;

  try {
    const result = await client.query(
      "SELECT pg_try_advisory_lock($1) AS adquirido",
      [ENVIO_ADVISORY_LOCK_KEY],
    );
    lockAdquirido = result.rows[0].adquirido;

    if (!lockAdquirido) {
      console.warn(
        "⚠️ Envío de avisos omitido: otra instancia ya está ejecutando el proceso",
      );
      return;
    }

    await procesoEnvio();
    await procesoEnvioRevendedores();
  } finally {
    if (lockAdquirido) {
      await client
        .query("SELECT pg_advisory_unlock($1)", [ENVIO_ADVISORY_LOCK_KEY])
        .catch((error) =>
          console.error("Error liberando lock de avisos de deuda:", error),
        );
    }
    client.release();
  }
}

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
      try {
        await ejecutarEnviosConLock();
      } catch (error) {
        console.error("❌ Error ejecutando cron de avisos de deuda:", error);
      }
    },
    {
      scheduled: false,
      timezone: config.timezone || "America/Argentina/Buenos_Aires",
      noOverlap: true,
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
