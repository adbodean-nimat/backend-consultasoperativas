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

export class WepPwaNoDeliveryNotFoundError extends Error {}

export class WepPwaNoDeliveryStateConflictError extends Error {}

export function validateNoDeliveryState(delivery) {
  if (delivery.estado_codigo === "NO_ENTREGADA") {
    throw new WepPwaNoDeliveryStateConflictError(
      "La entrega ya fue marcada como no entregada",
    );
  }

  if (!["EN_REPARTO", "CLIENTE_AVISADO"].includes(delivery.estado_codigo)) {
    throw new WepPwaNoDeliveryStateConflictError(
      "La entrega no puede marcarse como no entregada en su estado actual",
    );
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapDeliveryContext(row) {
  if (!row) return null;

  return {
    id: Number(row.entrega_id),
    estadoId: Number(row.estado_id),
    estadoCodigo: row.estado_codigo,
    estadoNombre: row.estado_nombre,
    viajeId: numberOrNull(row.viaje_id),
    vehiculoId: numberOrNull(row.vehiculo_id),
    patente: row.patente,
    domicilio: row.domicilio,
    clienteNombre: row.cliente_nombre,
    ordenPreparacion: {
      division: row.orden_preparacion_division,
      tipo: row.orden_preparacion_tipo,
      numero: numberOrNull(row.orden_preparacion_numero),
    },
  };
}

export class WepNonDeliveryRepository {
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

  async markAsNotDelivered(
    entregaId,
    { motivo, observacion = null, position = null },
    vehiculoId,
  ) {
    let client;
    let transactionStarted = false;

    try {
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const deliveryResult = await client.query(LOCKED_DELIVERY_QUERY, [
        entregaId,
        vehiculoId,
      ]);
      const delivery = deliveryResult.rows[0];
      if (!delivery) {
        throw new WepPwaNoDeliveryNotFoundError("Entrega no encontrada");
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
      validateNoDeliveryState({ estado_codigo: currentState.codigo });

      const targetStateResult = await client.query(
        `SELECT id, codigo, nombre
         FROM public.entrega_estados
         WHERE codigo = 'NO_ENTREGADA'
         LIMIT 1`,
      );
      const targetState = targetStateResult.rows[0];
      if (!targetState) {
        throw new Error(
          "No existe el estado NO_ENTREGADA en entrega_estados",
        );
      }

      const latitude = position?.latitude ?? null;
      const longitude = position?.longitude ?? null;
      const updateResult = await client.query(
        `UPDATE public.entregas
         SET estado_id = $1,
             no_entregado_at = NOW(),
             no_entregado_motivo = $2,
             no_entregado_observacion = $3,
             no_entregado_latitud = $4,
             no_entregado_longitud = $5,
             updated_at = NOW()
         WHERE id = $6
           AND estado_id = $7
           AND vehiculo_id = $8
         RETURNING id, no_entregado_at, no_entregado_motivo,
                   no_entregado_observacion, no_entregado_latitud,
                   no_entregado_longitud`,
        [
          targetState.id,
          motivo,
          observacion,
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

      const detail = `Entrega no realizada. Motivo: ${motivo}${
        observacion ? `. Observación: ${observacion}` : ""
      }`;
      await client.query(
        `INSERT INTO public.entrega_eventos
           (entrega_id, estado_anterior_id, estado_nuevo_id, tipo_evento,
            usuario_tipo, usuario_id, detalle, latitud, longitud, created_at)
         VALUES ($1, $2, $3, 'ENTREGA_NO_REALIZADA', 'VEHICULO', $7,
                 $4, $5, $6, NOW())`,
        [
          entregaId,
          currentState.id,
          targetState.id,
          detail,
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
        noEntregadoAt: updatedDelivery.no_entregado_at,
        motivo: updatedDelivery.no_entregado_motivo,
        observacion: updatedDelivery.no_entregado_observacion,
        posicion: {
          latitud: numberOrNull(updatedDelivery.no_entregado_latitud),
          longitud: numberOrNull(updatedDelivery.no_entregado_longitud),
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

export default new WepNonDeliveryRepository();
