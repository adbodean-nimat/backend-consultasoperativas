import wepPostgresPool from "./wep-postgres.js";

function mapVehicle(row) {
  if (!row) return null;

  return {
    id: Number(row.vehiculo_id),
    codigoErp: row.codigo_erp,
    nombre: row.nombre,
    patente: row.patente,
  };
}

export class WepAuthRepository {
  constructor({ postgresPool } = {}) {
    this.postgresPool = postgresPool || wepPostgresPool;
  }

  async findTokenWithVehicle(tokenHash) {
    const result = await this.postgresPool.query(
      `SELECT
         vt.id AS token_id,
         vt.activo,
         vt.expira_at,
         v.id AS vehiculo_id,
         v.codigo_erp,
         v.nombre,
         v.patente
       FROM public.vehiculo_tokens vt
       INNER JOIN public.vehiculos v
         ON v.id = vt.vehiculo_id
       WHERE vt.token_hash = $1
       LIMIT 1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      tokenId: Number(row.token_id),
      activo: row.activo,
      expiraAt: row.expira_at,
      vehicle: mapVehicle(row),
    };
  }

  async touchLastUsed(tokenId) {
    await this.postgresPool.query(
      `UPDATE public.vehiculo_tokens
       SET ultimo_uso_at = NOW()
       WHERE id = $1`,
      [tokenId],
    );
  }

  async findVehicleById(vehiculoId) {
    const result = await this.postgresPool.query(
      `SELECT
         id AS vehiculo_id,
         codigo_erp,
         nombre,
         patente
       FROM public.vehiculos
       WHERE id = $1`,
      [vehiculoId],
    );
    return mapVehicle(result.rows[0]);
  }

  async createVehicleToken(vehiculoId, tokenHash) {
    await this.postgresPool.query(
      `INSERT INTO public.vehiculo_tokens
         (vehiculo_id, token_hash, activo, expira_at, created_at)
       VALUES ($1, $2, TRUE, NULL, NOW())`,
      [vehiculoId, tokenHash],
    );
  }

  async revokeToken(tokenId) {
    const result = await this.postgresPool.query(
      `UPDATE public.vehiculo_tokens
       SET activo = FALSE
       WHERE id = $1
       RETURNING id`,
      [tokenId],
    );
    return result.rows.length === 1;
  }
}

export default new WepAuthRepository();
