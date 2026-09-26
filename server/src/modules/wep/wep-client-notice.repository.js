import { normalizeWepWhatsappPhone } from "./wep-phone.util.js";
import wepPostgresPool from "./wep-postgres.js";

const NOTICE_TYPE = "EN_CAMINO";

export class WepPwaEntregaNotFoundError extends Error {}

export class WepPwaEntregaStateConflictError extends Error {}

export class WepPwaEntregaPhoneConflictError extends Error {}

export class WepPwaEntregaNoticeConflictError extends Error {}

export function normalizeAvailablePhone(entrega) {
  for (const value of [entrega.telefono, entrega.telefono_alternativo]) {
    const normalized = normalizeWepWhatsappPhone(value);
    if (normalized) return normalized;
  }

  return null;
}

function validateNoticeState(entrega) {
  if (entrega.estado_codigo === "CLIENTE_AVISADO") {
    throw new WepPwaEntregaStateConflictError("El cliente ya fue avisado");
  }

  if (entrega.estado_codigo !== "EN_REPARTO") {
    throw new WepPwaEntregaStateConflictError(
      "La entrega no admite este aviso en su estado actual",
    );
  }
}

export class WepClientNoticeRepository {
  constructor({ postgresPool } = {}) {
    this.postgresPool = postgresPool || wepPostgresPool;
  }

  async reserveNotice(entregaId, vehiculoId, templateName = null) {
    let client;
    let transactionStarted = false;

    try {
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const entregaResult = await client.query(
        `SELECT
           e.id AS entrega_id,
           e.estado_id,
           ee.codigo AS estado_codigo,
           ee.nombre AS estado_nombre,
           e.cliente_nombre,
           e.telefono,
           e.telefono_alternativo,
           e.domicilio,
           e.orden_preparacion_division,
           e.orden_preparacion_tipo,
           e.orden_preparacion_numero,
           v.id AS viaje_id,
           v.numero_vuelta,
           vh.id AS vehiculo_id,
           vh.nombre AS vehiculo_nombre,
           vh.patente
         FROM public.entregas e
         INNER JOIN public.entrega_estados ee
           ON ee.id = e.estado_id
         LEFT JOIN public.viajes v
           ON v.id = e.viaje_id
         LEFT JOIN public.vehiculos vh
           ON vh.id = COALESCE(e.vehiculo_id, v.vehiculo_id)
         WHERE e.id = $1
           AND e.vehiculo_id = $2
         FOR UPDATE OF e`,
        [entregaId, vehiculoId],
      );
      const entrega = entregaResult.rows[0];

      if (!entrega) {
        throw new WepPwaEntregaNotFoundError("Entrega no encontrada");
      }

      validateNoticeState(entrega);

      const telefonoDestino = normalizeAvailablePhone(entrega);
      if (!telefonoDestino) {
        throw new WepPwaEntregaPhoneConflictError(
          "La entrega no tiene un número de teléfono válido para WhatsApp",
        );
      }

      const existingResult = await client.query(
        `SELECT id
         FROM public.notificaciones
         WHERE entrega_id = $1
           AND tipo = $2
         LIMIT 1`,
        [entregaId, NOTICE_TYPE],
      );
      if (existingResult.rows.length > 0) {
        throw new WepPwaEntregaNoticeConflictError(
          "El aviso al cliente ya fue solicitado",
        );
      }

      const notificationResult = await client.query(
        `INSERT INTO public.notificaciones
           (entrega_id, tipo, canal, telefono_destino, template_name,
            estado, created_at)
         VALUES ($1, $2, 'WHATSAPP', $3, $4, 'PENDIENTE', NOW())
         ON CONFLICT (entrega_id, tipo) DO NOTHING
         RETURNING id`,
        [entregaId, NOTICE_TYPE, telefonoDestino, templateName],
      );
      const notificationId = notificationResult.rows[0]?.id;
      if (notificationId === null || notificationId === undefined) {
        throw new WepPwaEntregaNoticeConflictError(
          "El aviso al cliente ya fue solicitado",
        );
      }

      await client.query("COMMIT");
      transactionStarted = false;

      return {
        notificationId: Number(notificationId),
        telefonoDestino,
        entrega: {
          id: Number(entrega.entrega_id),
          estadoId: Number(entrega.estado_id),
          estadoCodigo: entrega.estado_codigo,
          clienteNombre: entrega.cliente_nombre,
          domicilio: entrega.domicilio,
          ordenPreparacion: {
            division: entrega.orden_preparacion_division,
            tipo: entrega.orden_preparacion_tipo,
            numero: Number(entrega.orden_preparacion_numero),
          },
          viaje: {
            id: entrega.viaje_id === null ? null : Number(entrega.viaje_id),
            numeroVuelta: entrega.numero_vuelta,
          },
          vehiculo: {
            id:
              entrega.vehiculo_id === null ? null : Number(entrega.vehiculo_id),
            nombre: entrega.vehiculo_nombre,
            patente: entrega.patente,
          },
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

  async confirmNotice({
    entregaId,
    vehiculoId,
    notificationId,
    messageId,
    templateName,
  }) {
    let client;
    let transactionStarted = false;

    try {
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const entregaResult = await client.query(
        `SELECT e.id, e.estado_id, ee.codigo AS estado_codigo
         FROM public.entregas e
         INNER JOIN public.entrega_estados ee
           ON ee.id = e.estado_id
         WHERE e.id = $1
           AND e.vehiculo_id = $2
         FOR UPDATE OF e`,
        [entregaId, vehiculoId],
      );
      const entrega = entregaResult.rows[0];
      if (!entrega) {
        throw new WepPwaEntregaNotFoundError("Entrega no encontrada");
      }
      validateNoticeState(entrega);

      const targetStateResult = await client.query(
        `SELECT id, codigo, nombre
         FROM public.entrega_estados
         WHERE codigo = 'CLIENTE_AVISADO'
         LIMIT 1`,
      );
      const targetState = targetStateResult.rows[0];
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
        [templateName, messageId, notificationId, entregaId, NOTICE_TYPE],
      );
      const sentAt = notificationResult.rows[0]?.enviado_at;
      if (!sentAt) {
        throw new Error("No se pudo confirmar la notificación pendiente");
      }

      const deliveryUpdateResult = await client.query(
        `UPDATE public.entregas
         SET estado_id = $1,
             updated_at = NOW()
         WHERE id = $2
           AND estado_id = $3
           AND vehiculo_id = $4
         RETURNING id`,
        [targetState.id, entregaId, entrega.estado_id, vehiculoId],
      );
      if (deliveryUpdateResult.rows.length !== 1) {
        throw new Error("No se pudo actualizar el estado de la entrega");
      }

      await client.query(
        `INSERT INTO public.entrega_eventos
           (entrega_id, estado_anterior_id, estado_nuevo_id, tipo_evento,
            usuario_tipo, usuario_id, detalle, created_at)
         VALUES ($1, $2, $3, 'CLIENTE_AVISADO', 'VEHICULO', $4,
                 'Cliente avisado por WhatsApp: entrega en camino', NOW())`,
        [
          entregaId,
          entrega.estado_id,
          targetState.id,
          String(vehiculoId),
        ],
      );

      await client.query("COMMIT");
      transactionStarted = false;

      return {
        entrega: {
          id: Number(entregaId),
          estado: {
            codigo: targetState.codigo,
            nombre: targetState.nombre,
          },
        },
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

  async failNotice({ notificationId, errorCode, errorDetail }) {
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

export default new WepClientNoticeRepository();
