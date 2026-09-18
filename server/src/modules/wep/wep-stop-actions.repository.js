import wepPostgresPool from "./wep-postgres.js";
import {
  normalizeAvailablePhone,
  WepPwaEntregaNoticeConflictError,
  WepPwaEntregaPhoneConflictError,
} from "./wep-client-notice.repository.js";
import { createStopGroupId, deriveStopState } from "./wep-stop.util.js";

const NOTICE_TYPE = "EN_CAMINO";

export class WepPwaStopViajeNotFoundError extends Error {}
export class WepPwaStopForbiddenError extends Error {}
export class WepPwaStopNotFoundError extends Error {}
export class WepPwaStopStateConflictError extends Error {}

const STOP_DELIVERIES_SELECT = `
  SELECT
    e.id AS entrega_id,
    e.estado_id,
    ee.codigo AS estado_codigo,
    ee.nombre AS estado_nombre,
    e.viaje_id,
    e.vehiculo_id,
    e.cliente_codigo,
    e.cliente_nombre,
    e.domicilio,
    e.localidad,
    e.telefono,
    e.telefono_alternativo
  FROM public.entregas e
  INNER JOIN public.entrega_estados ee
    ON ee.id = e.estado_id
  WHERE e.viaje_id = $1
  ORDER BY e.id
`;

const ACTION_CONFIG = {
  entregar: {
    allowedStates: new Set(["EN_REPARTO", "CLIENTE_AVISADO"]),
    completedState: "ENTREGADA",
    alreadyMessage: "La parada ya fue marcada como entregada",
    incompatibleMessage:
      "La parada contiene entregas que no pueden marcarse como entregadas",
  },
  noEntregado: {
    allowedStates: new Set(["EN_REPARTO", "CLIENTE_AVISADO"]),
    completedState: "NO_ENTREGADA",
    alreadyMessage: "La parada ya fue marcada como no entregada",
    incompatibleMessage:
      "La parada contiene entregas que no pueden marcarse como no entregadas",
  },
  avisar: {
    allowedStates: new Set(["EN_REPARTO"]),
    completedState: "CLIENTE_AVISADO",
    alreadyMessage: "La parada ya fue avisada",
    incompatibleMessage:
      "La parada contiene entregas que no admiten el aviso en su estado actual",
  },
};

function resolveStopRows(viajeId, grupoId, rows) {
  const stopRows = rows.filter(
    (row) =>
      createStopGroupId({
        viajeId,
        clienteCodigo: row.cliente_codigo,
        domicilio: row.domicilio,
        localidad: row.localidad,
      }) === grupoId,
  );

  if (stopRows.length === 0) {
    throw new WepPwaStopNotFoundError("Parada no encontrada");
  }

  return stopRows;
}

export function validateStopOperation(context, action) {
  if (context.viaje.estado !== "EN_REPARTO") {
    throw new WepPwaStopStateConflictError(
      "El viaje debe estar en reparto para operar la parada",
    );
  }

  const config = ACTION_CONFIG[action];
  const nonCancelled = context.entregas.filter(
    (delivery) => delivery.estado_codigo !== "CANCELADA",
  );

  if (nonCancelled.length === 0) {
    throw new WepPwaStopStateConflictError(
      "La parada no tiene entregas operables",
    );
  }

  if (
    nonCancelled.every(
      (delivery) => delivery.estado_codigo === config.completedState,
    )
  ) {
    throw new WepPwaStopStateConflictError(config.alreadyMessage);
  }

  if (
    nonCancelled.some(
      (delivery) => !config.allowedStates.has(delivery.estado_codigo),
    )
  ) {
    throw new WepPwaStopStateConflictError(config.incompatibleMessage);
  }

  return nonCancelled;
}

function buildStopSummary(grupoId, deliveries, updatedCount) {
  return {
    grupoId,
    estado: deriveStopState(deliveries),
    cantidadOrdenes: deliveries.length,
    entregasActualizadas: updatedCount,
    entregas: deliveries.map((delivery) => ({
      id: Number(delivery.entrega_id),
      estado: {
        codigo: delivery.estado_codigo,
        nombre: delivery.estado_nombre,
      },
    })),
  };
}

function mapContext(viaje, grupoId, deliveries) {
  return {
    viaje: {
      id: Number(viaje.viaje_id),
      estado: viaje.viaje_estado,
      vehiculoId: Number(viaje.vehiculo_id),
      patente: viaje.patente,
    },
    grupoId,
    entregas: deliveries,
  };
}

export class WepStopActionsRepository {
  constructor({ postgresPool } = {}) {
    this.postgresPool = postgresPool || wepPostgresPool;
  }

  async getStopContext(viajeId, grupoId, vehiculoId) {
    const result = await this.postgresPool.query(
      `SELECT
         v.id AS viaje_id,
         v.estado AS viaje_estado,
         v.vehiculo_id,
         vh.patente,
         e.id AS entrega_id,
         e.estado_id,
         ee.codigo AS estado_codigo,
         ee.nombre AS estado_nombre,
         e.cliente_codigo,
         e.cliente_nombre,
         e.domicilio,
         e.localidad,
         e.telefono,
         e.telefono_alternativo
       FROM public.viajes v
       INNER JOIN public.vehiculos vh
         ON vh.id = v.vehiculo_id
       LEFT JOIN public.entregas e
         ON e.viaje_id = v.id
       LEFT JOIN public.entrega_estados ee
         ON ee.id = e.estado_id
       WHERE v.id = $1
       ORDER BY e.id`,
      [viajeId],
    );
    const viaje = result.rows[0];
    if (!viaje) {
      throw new WepPwaStopViajeNotFoundError("Viaje no encontrado");
    }
    if (Number(viaje.vehiculo_id) !== Number(vehiculoId)) {
      throw new WepPwaStopForbiddenError(
        "El viaje no pertenece al vehículo autenticado",
      );
    }

    const deliveries = resolveStopRows(
      viajeId,
      grupoId,
      result.rows.filter((row) => row.entrega_id !== null),
    );
    return mapContext(viaje, grupoId, deliveries);
  }

  async lockStop(client, viajeId, grupoId, vehiculoId) {
    const viajeResult = await client.query(
      `SELECT
         v.id AS viaje_id,
         v.estado AS viaje_estado,
         v.vehiculo_id,
         vh.patente
       FROM public.viajes v
       INNER JOIN public.vehiculos vh
         ON vh.id = v.vehiculo_id
       WHERE v.id = $1
       FOR UPDATE OF v`,
      [viajeId],
    );
    const viaje = viajeResult.rows[0];
    if (!viaje) {
      throw new WepPwaStopViajeNotFoundError("Viaje no encontrado");
    }
    if (Number(viaje.vehiculo_id) !== Number(vehiculoId)) {
      throw new WepPwaStopForbiddenError(
        "El viaje no pertenece al vehículo autenticado",
      );
    }

    const deliveriesResult = await client.query(
      `${STOP_DELIVERIES_SELECT} FOR UPDATE OF e`,
      [viajeId],
    );
    if (
      deliveriesResult.rows.some(
        (delivery) => Number(delivery.vehiculo_id) !== Number(vehiculoId),
      )
    ) {
      throw new WepPwaStopForbiddenError(
        "Una entrega no pertenece al vehículo autenticado",
      );
    }

    const deliveries = resolveStopRows(
      viajeId,
      grupoId,
      deliveriesResult.rows,
    );
    return mapContext(viaje, grupoId, deliveries);
  }

  async changeStopState({
    viajeId,
    grupoId,
    vehiculoId,
    action,
    motivo = null,
    observacion = null,
    position = null,
  }) {
    let client;
    let transactionStarted = false;

    try {
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const context = await this.lockStop(
        client,
        viajeId,
        grupoId,
        vehiculoId,
      );
      const operable = validateStopOperation(context, action);
      const targetCode = ACTION_CONFIG[action].completedState;
      const targetResult = await client.query(
        `SELECT id, codigo, nombre
         FROM public.entrega_estados
         WHERE codigo = $1
         LIMIT 1`,
        [targetCode],
      );
      const targetState = targetResult.rows[0];
      if (!targetState) {
        throw new Error(`No existe el estado ${targetCode} en entrega_estados`);
      }

      const ids = operable.map((delivery) => Number(delivery.entrega_id));
      const latitude = position?.latitude ?? null;
      const longitude = position?.longitude ?? null;
      const isDelivery = action === "entregar";
      const updateResult = await client.query(
        isDelivery
          ? `UPDATE public.entregas
             SET estado_id = $1,
                 entregado_at = NOW(),
                 entregado_latitud = $2,
                 entregado_longitud = $3,
                 updated_at = NOW()
             WHERE id = ANY($4::bigint[])
               AND viaje_id = $5
               AND vehiculo_id = $6
             RETURNING id, entregado_at`
          : `UPDATE public.entregas
             SET estado_id = $1,
                 no_entregado_at = NOW(),
                 no_entregado_motivo = $2,
                 no_entregado_observacion = $3,
                 no_entregado_latitud = $4,
                 no_entregado_longitud = $5,
                 updated_at = NOW()
             WHERE id = ANY($6::bigint[])
               AND viaje_id = $7
               AND vehiculo_id = $8
             RETURNING id, no_entregado_at`,
        isDelivery
          ? [targetState.id, latitude, longitude, ids, viajeId, vehiculoId]
          : [
              targetState.id,
              motivo,
              observacion,
              latitude,
              longitude,
              ids,
              viajeId,
              vehiculoId,
            ],
      );
      if (updateResult.rows.length !== ids.length) {
        throw new Error("No se pudieron actualizar todas las entregas");
      }

      for (const delivery of operable) {
        const detail = isDelivery
          ? `Entrega confirmada por el chofer para parada ${grupoId}`
          : `Entrega no realizada para parada ${grupoId}. Motivo: ${motivo}${
              observacion ? `. Observación: ${observacion}` : ""
            }`;
        await client.query(
          `INSERT INTO public.entrega_eventos
             (entrega_id, estado_anterior_id, estado_nuevo_id, tipo_evento,
              usuario_tipo, usuario_id, detalle, latitud, longitud, created_at)
           VALUES ($1, $2, $3, $4, 'VEHICULO', $5, $6, $7, $8, NOW())`,
          [
            delivery.entrega_id,
            delivery.estado_id,
            targetState.id,
            isDelivery ? "ENTREGA_CONFIRMADA" : "ENTREGA_NO_REALIZADA",
            String(vehiculoId),
            detail,
            latitude,
            longitude,
          ],
        );
        delivery.estado_id = targetState.id;
        delivery.estado_codigo = targetState.codigo;
        delivery.estado_nombre = targetState.nombre;
      }

      await client.query("COMMIT");
      transactionStarted = false;
      return buildStopSummary(grupoId, context.entregas, ids.length);
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => {});
      }
      throw error;
    } finally {
      client?.release();
    }
  }

  async reserveStopNotice(viajeId, grupoId, vehiculoId, templateName = null) {
    let client;
    let transactionStarted = false;

    try {
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;
      const context = await this.lockStop(
        client,
        viajeId,
        grupoId,
        vehiculoId,
      );
      const operable = validateStopOperation(context, "avisar");
      const destination = operable
        .map((delivery) => ({
          delivery,
          phone: normalizeAvailablePhone(delivery),
        }))
        .find(({ phone }) => phone);
      if (!destination) {
        throw new WepPwaEntregaPhoneConflictError(
          "La parada no tiene un número de teléfono válido para WhatsApp",
        );
      }

      const allIds = context.entregas.map((delivery) =>
        Number(delivery.entrega_id),
      );
      const existingResult = await client.query(
        `SELECT id
         FROM public.notificaciones
         WHERE entrega_id = ANY($1::bigint[])
           AND tipo = $2
         LIMIT 1`,
        [allIds, NOTICE_TYPE],
      );
      if (existingResult.rows.length > 0) {
        throw new WepPwaEntregaNoticeConflictError(
          "El aviso de la parada ya fue solicitado",
        );
      }

      const anchorId = Number(destination.delivery.entrega_id);
      const notificationResult = await client.query(
        `INSERT INTO public.notificaciones
           (entrega_id, tipo, canal, telefono_destino, template_name,
            estado, created_at)
         VALUES ($1, $2, 'WHATSAPP', $3, $4, 'PENDIENTE', NOW())
         ON CONFLICT (entrega_id, tipo) DO NOTHING
         RETURNING id`,
        [anchorId, NOTICE_TYPE, destination.phone, templateName],
      );
      const notificationId = notificationResult.rows[0]?.id;
      if (notificationId === null || notificationId === undefined) {
        throw new WepPwaEntregaNoticeConflictError(
          "El aviso de la parada ya fue solicitado",
        );
      }

      await client.query("COMMIT");
      transactionStarted = false;
      return {
        notificationId: Number(notificationId),
        anchorId,
        telefonoDestino: destination.phone,
        clienteNombre: destination.delivery.cliente_nombre,
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

  async confirmStopNotice({
    viajeId,
    grupoId,
    vehiculoId,
    notificationId,
    anchorId,
    messageId,
    templateName,
  }) {
    let client;
    let transactionStarted = false;

    try {
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;
      const context = await this.lockStop(
        client,
        viajeId,
        grupoId,
        vehiculoId,
      );
      const operable = validateStopOperation(context, "avisar");
      const targetResult = await client.query(
        `SELECT id, codigo, nombre
         FROM public.entrega_estados
         WHERE codigo = 'CLIENTE_AVISADO'
         LIMIT 1`,
      );
      const targetState = targetResult.rows[0];
      if (!targetState) {
        throw new Error(
          "No existe el estado CLIENTE_AVISADO en entrega_estados",
        );
      }

      const notificationResult = await client.query(
        `UPDATE public.notificaciones
         SET template_name = $1,
             message_id = $2,
             estado = 'ENVIADO',
             error_codigo = NULL,
             error_detalle = NULL,
             enviado_at = NOW()
         WHERE id = $3
           AND entrega_id = $4
           AND tipo = $5
           AND estado = 'PENDIENTE'
         RETURNING enviado_at`,
        [templateName, messageId, notificationId, anchorId, NOTICE_TYPE],
      );
      const sentAt = notificationResult.rows[0]?.enviado_at;
      if (!sentAt) {
        throw new WepPwaEntregaNoticeConflictError(
          "El aviso de la parada ya fue procesado",
        );
      }

      const ids = operable.map((delivery) => Number(delivery.entrega_id));
      const updateResult = await client.query(
        `UPDATE public.entregas
         SET estado_id = $1,
             updated_at = NOW()
         WHERE id = ANY($2::bigint[])
           AND viaje_id = $3
           AND vehiculo_id = $4
         RETURNING id`,
        [targetState.id, ids, viajeId, vehiculoId],
      );
      if (updateResult.rows.length !== ids.length) {
        throw new Error("No se pudieron actualizar todas las entregas");
      }

      for (const delivery of operable) {
        await client.query(
          `INSERT INTO public.entrega_eventos
             (entrega_id, estado_anterior_id, estado_nuevo_id, tipo_evento,
              usuario_tipo, usuario_id, detalle, created_at)
           VALUES ($1, $2, $3, 'CLIENTE_AVISADO', 'VEHICULO', $4, $5, NOW())`,
          [
            delivery.entrega_id,
            delivery.estado_id,
            targetState.id,
            String(vehiculoId),
            `Cliente avisado por WhatsApp para parada ${grupoId}; notificación ${notificationId}`,
          ],
        );
        delivery.estado_id = targetState.id;
        delivery.estado_codigo = targetState.codigo;
        delivery.estado_nombre = targetState.nombre;
      }

      await client.query("COMMIT");
      transactionStarted = false;
      return {
        parada: buildStopSummary(grupoId, context.entregas, ids.length),
        notificacion: {
          tipo: NOTICE_TYPE,
          canal: "WHATSAPP",
          estado: "ENVIADO",
          enviadoAt: sentAt,
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

  async failStopNotice({ notificationId, errorCode, errorDetail }) {
    await this.postgresPool.query(
      `UPDATE public.notificaciones
       SET estado = 'ERROR',
           error_codigo = $1,
           error_detalle = $2
       WHERE id = $3
         AND estado = 'PENDIENTE'`,
      [errorCode, errorDetail, notificationId],
    );
  }
}

export default new WepStopActionsRepository();
