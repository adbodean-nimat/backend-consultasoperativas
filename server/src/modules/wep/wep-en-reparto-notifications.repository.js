import { normalizeAvailablePhone } from "./wep-client-notice.repository.js";
import wepPostgresPool from "./wep-postgres.js";
import { groupPwaViajes } from "./wep-pwa.repository.js";

export const EN_REPARTO_NOTICE_TYPE = "EN_REPARTO";
export const SUCCESSFUL_EN_REPARTO_NOTICE_STATES = new Set([
  "ENVIADO",
  "ENTREGADO",
  "LEIDO",
]);

const TRIP_DELIVERIES_QUERY = `
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
    e.hora_desde,
    e.hora_hasta,
    e.peso_calculado,
    e.volumen_calculado,
    e.bultos_calculados
  FROM public.entregas e
  INNER JOIN public.entrega_estados ee
    ON ee.id = e.estado_id
  INNER JOIN public.viajes v
    ON v.id = e.viaje_id
  INNER JOIN public.vehiculos vh
    ON vh.id = v.vehiculo_id
  WHERE e.viaje_id = $1
  ORDER BY e.orden_secuencia ASC NULLS LAST,
           e.hora_desde ASC NULLS LAST,
           e.orden_preparacion_numero ASC NULLS LAST, e.id
`;

export function mapTransitionedStops(rows, transitionedDeliveryIds) {
  const transitionedIds = new Set(
    transitionedDeliveryIds.map((value) => Number(value)),
  );
  const rowsById = new Map(
    rows.map((row) => [Number(row.entrega_id), row]),
  );
  const trips = groupPwaViajes(rows);

  return trips.flatMap((trip) =>
    trip.paradas
      .filter((stop) =>
        stop.entregas.some((delivery) => transitionedIds.has(delivery.id)),
      )
      .map((stop) => {
        const deliveryRows = stop.entregas
          .map((delivery) => rowsById.get(delivery.id))
          .filter(Boolean);
        const transitionedRows = deliveryRows.filter((row) =>
          transitionedIds.has(Number(row.entrega_id)),
        );
        const phoneRow = deliveryRows.find((row) =>
          normalizeAvailablePhone(row),
        );

        return {
          ...stop,
          viajeId: trip.id,
          entregaIds: deliveryRows.map((row) => Number(row.entrega_id)),
          entregaRepresentativaId: Number(transitionedRows[0].entrega_id),
          telefonoDestino: phoneRow
            ? normalizeAvailablePhone(phoneRow)
            : null,
        };
      }),
  );
}

export class WepEnRepartoNotificationsRepository {
  constructor({ postgresPool } = {}) {
    this.postgresPool = postgresPool || wepPostgresPool;
  }

  async findTransitionedStops({ viajeId, entregaIds }) {
    if (!entregaIds?.length) return [];
    const result = await this.postgresPool.query(TRIP_DELIVERIES_QUERY, [
      viajeId,
    ]);
    return mapTransitionedStops(result.rows, entregaIds);
  }

  async reserveStop({ stop, templateName }) {
    let client;
    let transactionStarted = false;

    try {
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const existingResult = await client.query(
        `SELECT id, entrega_id, estado
         FROM public.notificaciones
         WHERE tipo = $1
           AND entrega_id = ANY($2::bigint[])
         ORDER BY id
         FOR UPDATE`,
        [EN_REPARTO_NOTICE_TYPE, stop.entregaIds],
      );
      const successful = existingResult.rows.find(({ estado }) =>
        SUCCESSFUL_EN_REPARTO_NOTICE_STATES.has(estado),
      );
      if (successful) {
        await client.query("COMMIT");
        transactionStarted = false;
        return { result: "YA_NOTIFICADA" };
      }

      // PENDIENTE evita un segundo envío concurrente. ERROR y SIN_TELEFONO
      // también son terminales para esta transición: reintentar requiere otra
      // transición real, que startPwaViaje no genera.
      if (existingResult.rows.length > 0) {
        await client.query("COMMIT");
        transactionStarted = false;
        return { result: "YA_PROCESADA" };
      }

      const estado = stop.telefonoDestino ? "PENDIENTE" : "SIN_TELEFONO";
      const insertResult = await client.query(
        `INSERT INTO public.notificaciones
           (entrega_id, tipo, canal, telefono_destino, template_name,
            estado, message_id, enviado_at, error_codigo, error_detalle,
            created_at)
         VALUES ($1, $2, 'WHATSAPP', $3, $4, $5, NULL, NULL, NULL, NULL,
                 NOW())
         ON CONFLICT (entrega_id, tipo) DO NOTHING
         RETURNING id`,
        [
          stop.entregaRepresentativaId,
          EN_REPARTO_NOTICE_TYPE,
          stop.telefonoDestino || "",
          templateName,
          estado,
        ],
      );
      const notificationId = insertResult.rows[0]?.id;
      if (notificationId === null || notificationId === undefined) {
        await client.query("COMMIT");
        transactionStarted = false;
        return { result: "YA_PROCESADA" };
      }

      await client.query("COMMIT");
      transactionStarted = false;
      return {
        result: stop.telefonoDestino ? "RESERVADA" : "SIN_TELEFONO",
        notificationId: Number(notificationId),
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
    await this.postgresPool.query(
      `UPDATE public.notificaciones
       SET template_name = $1,
           message_id = $2,
           estado = 'ENVIADO',
           enviado_at = NOW(),
           error_codigo = NULL,
           error_detalle = NULL
       WHERE id = $3
         AND tipo = $4
         AND estado = 'PENDIENTE'`,
      [templateName, messageId, notificationId, EN_REPARTO_NOTICE_TYPE],
    );
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
      [errorCode, errorDetail, notificationId, EN_REPARTO_NOTICE_TYPE],
    );
  }
}

export default new WepEnRepartoNotificationsRepository();
