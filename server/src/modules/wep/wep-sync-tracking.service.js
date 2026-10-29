import { randomBytes } from "node:crypto";
import { normalizeStopText } from "./wep-stop.util.js";
import trackingService, { calculateTrackingExpiration } from "./wep-tracking.service.js";
import { WepTrackingRepository } from "./wep-tracking.repository.js";

// Sólo PostgreSQL: no llama servicios de avisos, WhatsApp ni posiciones GPS.
export class WepSyncTrackingService {
  constructor({
    expirationDays = trackingService.expirationDays,
    now = () => new Date(),
    randomId = () => randomBytes(24).toString("base64url"),
  } = {}) {
    this.expirationDays = expirationDays;
    this.now = now;
    this.randomId = randomId;
  }

  async ensureForTrips(client, viajeIds) {
    const summary = { disponibles: 0, omitidasSinDatos: 0, omitidasFueraVigencia: 0 };
    if (!viajeIds.length) return summary;

    // Leer después de TODOS los UPSERT: usa la asignación final persistida y la
    // fecha más temprana de la parada, incluyendo sus órdenes ya existentes.
    const result = await client.query(
      `SELECT id, viaje_id, cliente_codigo, domicilio, localidad, fecha_entrega::text
       FROM public.entregas
       WHERE viaje_id = ANY($1::bigint[])
       ORDER BY id`,
      [[...new Set(viajeIds)]],
    );
    const stops = new Map();
    for (const delivery of result.rows) {
      const clienteCodigo = delivery.cliente_codigo == null ? "" : String(delivery.cliente_codigo);
      const domicilio = normalizeStopText(delivery.domicilio);
      const localidad = normalizeStopText(delivery.localidad);
      const key = JSON.stringify([String(delivery.viaje_id), clienteCodigo, domicilio, localidad]);
      const previous = stops.get(key);
      const fecha = delivery.fecha_entrega;
      if (previous) {
        if (fecha && (!previous.fecha || fecha < previous.fecha)) previous.fecha = fecha;
        if (Number(delivery.id) < Number(previous.entregaId)) previous.entregaId = delivery.id;
      } else {
        stops.set(key, {
          viajeId: delivery.viaje_id, clienteCodigo,
          domicilioNormalizado: domicilio, localidadNormalizada: localidad,
          entregaId: delivery.id, fecha,
        });
      }
    }

    const repository = new WepTrackingRepository({ transactionClient: client });
    const now = this.now().getTime();
    // Orden estable de locks para ejecuciones concurrentes sobre varias paradas.
    for (const key of [...stops.keys()].sort()) {
      const stop = stops.get(key);
      if (!stop.clienteCodigo.trim() || !stop.domicilioNormalizado || !stop.fecha) {
        summary.omitidasSinDatos += 1;
        continue;
      }
      const expiraAt = calculateTrackingExpiration(stop.fecha, this.expirationDays);
      if (!Number.isFinite(expiraAt.getTime()) || expiraAt.getTime() <= now) {
        // No recrear tokens vencidos de históricos en cada pasada del cron.
        summary.omitidasFueraVigencia += 1;
        continue;
      }
      await repository.getOrCreateActiveStopTracking({
        ...stop, publicId: this.randomId(), expiraAt,
      });
      summary.disponibles += 1;
    }
    return summary;
  }
}

export default new WepSyncTrackingService();
