import wepPostgresPool from "./wep-postgres.js";

const DELIVERY_CONTEXT_QUERY = `
  SELECT
    e.id AS entrega_id,
    e.estado_id,
    ee.codigo AS estado_codigo,
    ee.nombre AS estado_nombre,
    e.viaje_id,
    COALESCE(e.vehiculo_id, v.vehiculo_id) AS vehiculo_id,
    vh.patente,
    e.domicilio,
    e.cliente_nombre,
    e.orden_preparacion_division,
    e.orden_preparacion_tipo,
    e.orden_preparacion_numero
  FROM public.entregas e
  INNER JOIN public.entrega_estados ee
    ON ee.id = e.estado_id
  LEFT JOIN public.viajes v
    ON v.id = e.viaje_id
  LEFT JOIN public.vehiculos vh
    ON vh.id = COALESCE(e.vehiculo_id, v.vehiculo_id)
  WHERE e.id = $1
    AND e.vehiculo_id = $2
`;

const LOCKED_DELIVERY_QUERY = `
  SELECT
    e.id AS entrega_id,
    e.estado_id,
    e.viaje_id,
    COALESCE(e.vehiculo_id, v.vehiculo_id) AS vehiculo_id,
    vh.patente,
    e.domicilio,
    e.cliente_nombre,
    e.orden_preparacion_division,
    e.orden_preparacion_tipo,
    e.orden_preparacion_numero
  FROM public.entregas e
  LEFT JOIN public.viajes v
    ON v.id = e.viaje_id
  LEFT JOIN public.vehiculos vh
    ON vh.id = COALESCE(e.vehiculo_id, v.vehiculo_id)
  WHERE e.id = $1
    AND e.vehiculo_id = $2
  FOR UPDATE OF e
`;

export class WepPwaDeliveryNotFoundError extends Error {}

export class WepPwaDeliveryStateConflictError extends Error {}

export function validateDeliveryConfirmationState(delivery) {
  if (delivery.estado_codigo === "ENTREGADA") {
    throw new WepPwaDeliveryStateConflictError(
      "La entrega ya fue marcada como entregada",
    );
  }

  if (!["EN_REPARTO", "CLIENTE_AVISADO"].includes(delivery.estado_codigo)) {
    throw new WepPwaDeliveryStateConflictError(
      "La entrega no puede marcarse como entregada en su estado actual",
    );
  }
}

function mapDeliveryContext(row) {
  if (!row) return null;

  return {
    id: Number(row.entrega_id),
    estadoId: Number(row.estado_id),
    estadoCodigo: row.estado_codigo,
    estadoNombre: row.estado_nombre,
    viajeId: row.viaje_id === null ? null : Number(row.viaje_id),
    vehiculoId: row.vehiculo_id === null ? null : Number(row.vehiculo_id),
    patente: row.patente,
    domicilio: row.domicilio,
    clienteNombre: row.cliente_nombre,
    ordenPreparacion: {
      division: row.orden_preparacion_division,
      tipo: row.orden_preparacion_tipo,
      numero:
        row.orden_preparacion_numero === null
          ? null
          : Number(row.orden_preparacion_numero),
    },
  };
}

export class WepDeliveryConfirmationRepository {
  constructor({ postgresPool } = {}) {
    this.postgresPool = postgresPool || wepPostgresPool;
  }

  async getDeliveryContext(entregaId, vehiculoId) {
    const result = await this.postgresPool.query(DELIVERY_CONTEXT_QUERY, [
      entregaId,
      vehiculoId,
    ]);
    return mapDeliveryContext(result.rows[0]);
  }

  async confirmDelivery(entregaId, vehiculoId, position = null) {
    let client;
    let transactionStarted = false;

    try {
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const deliveryResult = await client.query(
        LOCKED_DELIVERY_QUERY,
        [entregaId, vehiculoId],
      );
      const delivery = deliveryResult.rows[0];

      if (!delivery) {
        throw new WepPwaDeliveryNotFoundError("Entrega no encontrada");
      }

      const currentStateResult = await client.query(
        `SELECT id, codigo, nombre
         FROM public.entrega_estados
         WHERE id = $1`,
        [delivery.estado_id],
      );
      const currentState = currentStateResult.rows[0];
      if (!currentState) {
        throw new Error("La entrega tiene un estado inexistente");
      }

      validateDeliveryConfirmationState({
        estado_codigo: currentState.codigo,
      });

      const targetStateResult = await client.query(
        `SELECT id, codigo, nombre
         FROM public.entrega_estados
         WHERE codigo = 'ENTREGADA'
         LIMIT 1`,
      );
      const targetState = targetStateResult.rows[0];
      if (!targetState) {
        throw new Error("No existe el estado ENTREGADA en entrega_estados");
      }

      const latitude = position?.latitude ?? null;
      const longitude = position?.longitude ?? null;
      const updateResult = await client.query(
        `UPDATE public.entregas
         SET estado_id = $1,
             entregado_at = NOW(),
             entregado_latitud = $2,
             entregado_longitud = $3,
             updated_at = NOW()
         WHERE id = $4
           AND estado_id = $5
           AND vehiculo_id = $6
         RETURNING id, entregado_at`,
        [
          targetState.id,
          latitude,
          longitude,
          entregaId,
          currentState.id,
          vehiculoId,
        ],
      );
      const updatedDelivery = updateResult.rows[0];
      if (!updatedDelivery) {
        throw new Error("No se pudo actualizar el estado de la entrega");
      }

      await client.query(
        `INSERT INTO public.entrega_eventos
           (entrega_id, estado_anterior_id, estado_nuevo_id, tipo_evento,
            usuario_tipo, usuario_id, detalle, latitud, longitud, created_at)
         VALUES ($1, $2, $3, 'ENTREGA_CONFIRMADA', 'VEHICULO', $6,
                 'Entrega confirmada por el chofer', $4, $5, NOW())`,
        [
          entregaId,
          currentState.id,
          targetState.id,
          latitude,
          longitude,
          String(vehiculoId),
        ],
      );

      await client.query("COMMIT");
      transactionStarted = false;

      return {
        id: Number(updatedDelivery.id),
        estado: {
          codigo: targetState.codigo,
          nombre: targetState.nombre,
        },
        entregadoAt: updatedDelivery.entregado_at,
        posicion: {
          latitud: latitude,
          longitud: longitude,
        },
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
}

export default new WepDeliveryConfirmationRepository();
