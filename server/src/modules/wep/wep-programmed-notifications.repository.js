import { normalizeAvailablePhone } from "./wep-client-notice.repository.js";
import wepPostgresPool from "./wep-postgres.js";
import { groupPwaViajes } from "./wep-pwa.repository.js";

export const PROGRAMMED_NOTICE_TYPE = "PROGRAMADA";
export const PROGRAMMED_TEST_NOTICE_TYPE = "PROGRAMADA_TEST";
export const SUCCESSFUL_NOTICE_STATES = new Set([
  "ENVIADO",
  "ENTREGADO",
  "LEIDO",
]);

const ELIGIBLE_DELIVERY_STATES = new Set([
  "PROGRAMADA",
  "ASIGNADA",
  "EN_REPARTO",
]);

const DELIVERY_ROWS_SELECT = `
  SELECT
    v.id AS viaje_id,
    v.numero_vuelta,
    v.estado AS viaje_estado,
    v.iniciado_at,
    v.finalizado_at,
    vh.id AS vehiculo_id,
    vh.codigo_erp,
    vh.nombre AS vehiculo_nombre,
    vh.patente,
    e.id AS entrega_id,
    e.orden_secuencia,
    ee.codigo AS estado_codigo,
    ee.nombre AS estado_nombre,
    e.orden_preparacion_division,
    e.orden_preparacion_tipo,
    e.orden_preparacion_numero,
    e.nota_pedido_division,
    e.nota_pedido_tipo,
    e.nota_pedido_numero,
    e.cliente_codigo,
    e.cliente_nombre,
    e.telefono,
    e.telefono_alternativo,
    e.domicilio,
    e.localidad,
    e.fecha_entrega::text AS fecha_entrega,
    e.hora_desde,
    e.hora_hasta,
    e.peso_calculado,
    e.volumen_calculado,
    e.bultos_calculados,
    n.id AS notificacion_id,
    n.estado AS notificacion_estado
  FROM public.entregas e
  INNER JOIN public.entrega_estados ee
    ON ee.id = e.estado_id
  INNER JOIN public.viajes v
    ON v.id = e.viaje_id
  INNER JOIN public.vehiculos vh
    ON vh.id = v.vehiculo_id
  LEFT JOIN public.notificaciones n
    ON n.entrega_id = e.id
   AND n.tipo = '${PROGRAMMED_NOTICE_TYPE}'
`;

function compareRowsByStopOrder(left, right) {
  const leftOrder = left.orden_secuencia ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.orden_secuencia ?? Number.MAX_SAFE_INTEGER;
  return (
    Number(leftOrder) - Number(rightOrder) ||
    Number(left.orden_preparacion_numero ?? Number.MAX_SAFE_INTEGER) -
      Number(right.orden_preparacion_numero ?? Number.MAX_SAFE_INTEGER) ||
    Number(left.entrega_id) - Number(right.entrega_id)
  );
}

function notificationPriority(state) {
  if (SUCCESSFUL_NOTICE_STATES.has(state)) return 0;
  if (state === "PENDIENTE") return 1;
  if (state === "ERROR") return 2;
  return 3;
}

export function mapProgrammedNotificationStops(rows) {
  const viajes = groupPwaViajes(rows);
  const rowsById = new Map(
    rows.map((row) => [String(row.entrega_id), row]),
  );

  return viajes.flatMap((viaje) =>
    viaje.paradas.map((parada) => {
      const deliveryRows = parada.entregas
        .map((entrega) => rowsById.get(String(entrega.id)))
        .filter(Boolean)
        .sort(compareRowsByStopOrder);
      const eligibleDeliveryRows = deliveryRows.filter((row) =>
        ELIGIBLE_DELIVERY_STATES.has(row.estado_codigo),
      );
      const notifications = deliveryRows
        .filter((row) => row.notificacion_id !== null)
        .map((row) => ({
          id: Number(row.notificacion_id),
          entregaId: Number(row.entrega_id),
          estado: row.notificacion_estado,
        }))
        .sort(
          (left, right) =>
            notificationPriority(left.estado) -
              notificationPriority(right.estado) ||
            left.id - right.id,
        );
      const phoneRow = eligibleDeliveryRows.find((row) =>
        normalizeAvailablePhone(row),
      );
      const eligibleHoursFrom = eligibleDeliveryRows
        .map((row) => row.hora_desde)
        .filter((value) => value !== null)
        .sort();
      const eligibleHoursTo = eligibleDeliveryRows
        .map((row) => row.hora_hasta)
        .filter((value) => value !== null)
        .sort();

      return {
        ...parada,
        horaDesde: eligibleHoursFrom[0] ?? null,
        horaHasta: eligibleHoursTo.at(-1) ?? null,
        viajeId: viaje.id,
        fechaEntrega: deliveryRows[0]?.fecha_entrega ?? null,
        entregaRepresentativaId:
          Number(eligibleDeliveryRows[0]?.entrega_id) || null,
        telefonoDestino: phoneRow
          ? normalizeAvailablePhone(phoneRow)
          : null,
        deliveryRows,
        eligibleDeliveryRows,
        notifications,
      };
    }),
  );
}

export function isProgrammedStopEligible(stop) {
  return stop.eligibleDeliveryRows.length > 0;
}

export function hasBlockingProgrammedNotification(stop) {
  return stop.notifications.some(
    ({ estado }) => estado !== "ERROR",
  );
}

export class WepProgrammedNoticeConflictError extends Error {}
export class WepProgrammedTestDeliveryNotFoundError extends Error {}
export class WepProgrammedTestStopConflictError extends Error {}

export class WepProgrammedNotificationsRepository {
  constructor({ postgresPool } = {}) {
    this.postgresPool = postgresPool || wepPostgresPool;
  }

  async findStopsForDate(fecha) {
    const result = await this.postgresPool.query(
      `${DELIVERY_ROWS_SELECT}
       WHERE e.fecha_entrega = $1::date
         AND e.cliente_codigo IS NOT NULL
         AND BTRIM(e.cliente_codigo::text) <> ''
       ORDER BY v.id, e.orden_secuencia ASC NULLS LAST,
                e.hora_desde ASC NULLS LAST,
                e.orden_preparacion_numero ASC NULLS LAST, e.id`,
      [fecha],
    );
    return mapProgrammedNotificationStops(result.rows).filter(
      isProgrammedStopEligible,
    );
  }

  async findStopByRepresentativeDelivery(entregaId) {
    const deliveryResult = await this.postgresPool.query(
      `SELECT viaje_id FROM public.entregas WHERE id = $1`,
      [entregaId],
    );
    const delivery = deliveryResult.rows[0];
    if (!delivery) throw new WepProgrammedTestDeliveryNotFoundError();

    const result = await this.postgresPool.query(
      `${DELIVERY_ROWS_SELECT}
       WHERE e.viaje_id = $1
       ORDER BY e.orden_secuencia ASC NULLS LAST,
                e.hora_desde ASC NULLS LAST,
                e.orden_preparacion_numero ASC NULLS LAST, e.id`,
      [delivery.viaje_id],
    );
    const matches = mapProgrammedNotificationStops(result.rows).filter((stop) =>
      stop.deliveryRows.some((row) => Number(row.entrega_id) === entregaId),
    );
    if (matches.length === 0) throw new WepProgrammedTestDeliveryNotFoundError();
    if (matches.length !== 1) throw new WepProgrammedTestStopConflictError();
    return matches[0];
  }

  async reserveTestNotice({ entregaId, telefono, templateName }) {
    const result = await this.postgresPool.query(
      `INSERT INTO public.notificaciones
         (entrega_id, tipo, canal, telefono_destino, template_name,
          estado, message_id, enviado_at, error_codigo, error_detalle, created_at)
       VALUES ($1, $2, 'WHATSAPP', $3, $4, 'PENDIENTE', NULL, NULL, NULL, NULL, NOW())
       ON CONFLICT (entrega_id, tipo) DO UPDATE SET
         canal = 'WHATSAPP',
         telefono_destino = EXCLUDED.telefono_destino,
         template_name = EXCLUDED.template_name,
         estado = 'PENDIENTE',
         message_id = NULL,
         enviado_at = NULL,
         error_codigo = NULL,
         error_detalle = NULL
       RETURNING id`,
      [entregaId, PROGRAMMED_TEST_NOTICE_TYPE, telefono, templateName],
    );
    return Number(result.rows[0].id);
  }

  async confirmTestSent({ notificationId, messageId, templateName }) {
    const result = await this.postgresPool.query(
      `UPDATE public.notificaciones
       SET template_name = $1, message_id = $2, estado = 'ENVIADO',
           enviado_at = NOW(), error_codigo = NULL, error_detalle = NULL
       WHERE id = $3 AND tipo = $4 AND estado = 'PENDIENTE'
       RETURNING enviado_at`,
      [templateName, messageId, notificationId, PROGRAMMED_TEST_NOTICE_TYPE],
    );
    if (!result.rows[0]) throw new WepProgrammedTestStopConflictError();
    return result.rows[0].enviado_at;
  }

  async markTestFailed({ notificationId, errorCode, errorDetail }) {
    await this.postgresPool.query(
      `UPDATE public.notificaciones
       SET estado = 'ERROR', error_codigo = $1, error_detalle = $2
       WHERE id = $3 AND tipo = $4 AND estado = 'PENDIENTE'`,
      [errorCode, errorDetail, notificationId, PROGRAMMED_TEST_NOTICE_TYPE],
    );
  }

  async reserveStop({ fecha, viajeId, grupoId, templateName }) {
    let client;
    let transactionStarted = false;

    try {
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const tripResult = await client.query(
        `SELECT id FROM public.viajes WHERE id = $1 FOR UPDATE`,
        [viajeId],
      );
      if (tripResult.rows.length === 0) {
        throw new WepProgrammedNoticeConflictError(
          "El viaje ya no está disponible",
        );
      }

      const deliveriesResult = await client.query(
        `${DELIVERY_ROWS_SELECT}
         WHERE e.viaje_id = $1
           AND e.fecha_entrega = $2::date
         ORDER BY e.orden_secuencia ASC NULLS LAST,
                  e.hora_desde ASC NULLS LAST,
                  e.orden_preparacion_numero ASC NULLS LAST, e.id
         FOR UPDATE OF e`,
        [viajeId, fecha],
      );
      const stop = mapProgrammedNotificationStops(deliveriesResult.rows).find(
        (item) => item.grupoId === grupoId,
      );
      if (!stop || !isProgrammedStopEligible(stop)) {
        throw new WepProgrammedNoticeConflictError(
          "La parada ya no es candidata",
        );
      }
      if (hasBlockingProgrammedNotification(stop)) {
        throw new WepProgrammedNoticeConflictError(
          "La parada ya tiene una notificación PROGRAMADA",
        );
      }
      if (!stop.telefonoDestino) {
        throw new WepProgrammedNoticeConflictError(
          "La parada ya no tiene un teléfono válido",
        );
      }

      const failed = stop.notifications.find(
        ({ estado }) => estado === "ERROR",
      );
      let notificationResult;
      if (failed) {
        notificationResult = await client.query(
          `UPDATE public.notificaciones
           SET canal = 'WHATSAPP',
               telefono_destino = $1,
               template_name = $2,
               message_id = NULL,
               estado = 'PENDIENTE',
               enviado_at = NULL,
               error_codigo = NULL,
               error_detalle = NULL
           WHERE id = $3
             AND estado = 'ERROR'
           RETURNING id, entrega_id`,
          [stop.telefonoDestino, templateName, failed.id],
        );
      } else {
        notificationResult = await client.query(
          `INSERT INTO public.notificaciones
             (entrega_id, tipo, canal, telefono_destino, template_name,
              estado, created_at)
           VALUES ($1, $2, 'WHATSAPP', $3, $4, 'PENDIENTE', NOW())
           ON CONFLICT (entrega_id, tipo) DO NOTHING
           RETURNING id, entrega_id`,
          [
            stop.entregaRepresentativaId,
            PROGRAMMED_NOTICE_TYPE,
            stop.telefonoDestino,
            templateName,
          ],
        );
      }

      const notification = notificationResult.rows[0];
      if (!notification) {
        throw new WepProgrammedNoticeConflictError(
          "La notificación fue reservada por otro proceso",
        );
      }

      await client.query("COMMIT");
      transactionStarted = false;
      return {
        stop,
        notificationId: Number(notification.id),
        anchorId: Number(notification.entrega_id),
        telefonoDestino: stop.telefonoDestino,
        retried: Boolean(failed),
      };
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => {});
      }
      throw error;
    } finally {
      client?.release();
    }
  }

  async confirmSent({ notificationId, messageId, templateName }) {
    const result = await this.postgresPool.query(
      `UPDATE public.notificaciones
       SET template_name = $1,
           message_id = $2,
           estado = 'ENVIADO',
           enviado_at = NOW(),
           error_codigo = NULL,
           error_detalle = NULL
       WHERE id = $3
         AND tipo = $4
         AND estado = 'PENDIENTE'
       RETURNING enviado_at`,
      [templateName, messageId, notificationId, PROGRAMMED_NOTICE_TYPE],
    );
    if (!result.rows[0]) {
      throw new WepProgrammedNoticeConflictError(
        "No se pudo confirmar la notificación PROGRAMADA",
      );
    }
    return result.rows[0].enviado_at;
  }

  async markFailed({ notificationId, errorCode, errorDetail }) {
    await this.postgresPool.query(
      `UPDATE public.notificaciones
       SET estado = 'ERROR',
           error_codigo = $1,
           error_detalle = $2
       WHERE id = $3
         AND tipo = $4
         AND estado = 'PENDIENTE'`,
      [errorCode, errorDetail, notificationId, PROGRAMMED_NOTICE_TYPE],
    );
  }
}

export default new WepProgrammedNotificationsRepository();
