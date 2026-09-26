import wepPostgresPool from "./wep-postgres.js";

export class WepTrackingRepository {
  constructor({ postgresPool } = {}) {
    this.postgresPool = postgresPool || wepPostgresPool;
  }

  async findStopDeliveries({ viajeId, clienteCodigo }) {
    const result = await this.postgresPool.query(
      `SELECT e.id, e.domicilio, e.localidad, e.fecha_entrega::text,
              e.hora_desde, e.hora_hasta, e.updated_at,
              ee.codigo AS estado_codigo
       FROM public.entregas e
       INNER JOIN public.entrega_estados ee ON ee.id = e.estado_id
       WHERE e.viaje_id = $1
         AND e.cliente_codigo = $2
       ORDER BY e.orden_secuencia ASC NULLS LAST, e.id`,
      [viajeId, clienteCodigo],
    );
    return result.rows;
  }

  async getOrCreateActiveStopTracking({
    publicId,
    viajeId,
    clienteCodigo,
    domicilioNormalizado,
    localidadNormalizada,
    entregaId,
    expiraAt,
  }) {
    const client = await this.postgresPool.connect();
    let transactionStarted = false;
    const stopLockKey = JSON.stringify([
      String(viajeId),
      String(clienteCodigo),
      domicilioNormalizado,
      localidadNormalizada,
    ]);

    try {
      await client.query("BEGIN");
      transactionStarted = true;
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1::text))",
        [stopLockKey],
      );
      await client.query(
        `UPDATE public.tracking_tokens
         SET activo = FALSE
         WHERE viaje_id = $1
           AND cliente_codigo = $2
           AND domicilio_normalizado = $3
           AND localidad_normalizada = $4
           AND activo = TRUE
           AND public_id IS NOT NULL
           AND (expira_at IS NULL OR expira_at <= NOW())`,
        [
          viajeId,
          clienteCodigo,
          domicilioNormalizado,
          localidadNormalizada,
        ],
      );
      const existing = await client.query(
        `SELECT public_id, expira_at
         FROM public.tracking_tokens
         WHERE viaje_id = $1
           AND cliente_codigo = $2
           AND domicilio_normalizado = $3
           AND localidad_normalizada = $4
           AND activo = TRUE
           AND public_id IS NOT NULL
           AND expira_at > NOW()
         LIMIT 1`,
        [
          viajeId,
          clienteCodigo,
          domicilioNormalizado,
          localidadNormalizada,
        ],
      );

      let row = existing.rows[0];
      if (!row) {
        const inserted = await client.query(
          `INSERT INTO public.tracking_tokens
             (public_id, viaje_id, cliente_codigo, domicilio_normalizado,
              localidad_normalizada, entrega_id, activo, expira_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, NOW())
           RETURNING public_id, expira_at`,
          [
            publicId,
            viajeId,
            clienteCodigo,
            domicilioNormalizado,
            localidadNormalizada,
            entregaId,
            expiraAt,
          ],
        );
        row = inserted.rows[0];
      }

      await client.query("COMMIT");
      transactionStarted = false;
      return row;
    } catch (error) {
      if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async findPublicTracking(publicId) {
    const tokenResult = await this.postgresPool.query(
      `SELECT t.id, t.viaje_id, t.cliente_codigo,
              t.domicilio_normalizado, t.localidad_normalizada,
              v.iniciado_at, v.finalizado_at, v.updated_at AS viaje_updated_at,
              vh.patente
       FROM public.tracking_tokens t
       INNER JOIN public.viajes v ON v.id = t.viaje_id
       LEFT JOIN public.entregas te ON te.id = t.entrega_id
       LEFT JOIN public.vehiculos vh
         ON vh.id = COALESCE(te.vehiculo_id, v.vehiculo_id)
       WHERE t.public_id = $1
         AND t.activo = TRUE
         AND t.expira_at > NOW()
       LIMIT 1`,
      [publicId],
    );
    const token = tokenResult.rows[0];
    if (!token) return null;

    const deliveries = await this.findStopDeliveries({
      viajeId: token.viaje_id,
      clienteCodigo: token.cliente_codigo,
    });
    return { token, deliveries };
  }

  async touchAccess(id) {
    await this.postgresPool.query(
      `UPDATE public.tracking_tokens
       SET ultimo_acceso_at = NOW()
       WHERE id = $1`,
      [id],
    );
  }
}

export default new WepTrackingRepository();
