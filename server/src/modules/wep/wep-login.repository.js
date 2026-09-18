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

export class WepLoginRepository {
  constructor({ postgresPool } = {}) {
    this.postgresPool = postgresPool || wepPostgresPool;
  }

  async listLoginVehicles() {
    const result = await this.postgresPool.query(
      `SELECT
         id AS vehiculo_id,
         codigo_erp,
         nombre,
         patente
       FROM public.vehiculos
       WHERE activo = TRUE
         AND es_externo = FALSE
         AND wep_login_activo = TRUE
         AND wep_pin_hash IS NOT NULL
       ORDER BY nombre ASC, patente ASC`,
    );
    return result.rows.map(mapVehicle);
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

  async updateVehiclePin(vehiculoId, pinHash) {
    const result = await this.postgresPool.query(
      `UPDATE public.vehiculos
       SET wep_pin_hash = $2
       WHERE id = $1
       RETURNING
         id AS vehiculo_id,
         codigo_erp,
         nombre,
         patente`,
      [vehiculoId, pinHash],
    );
    return mapVehicle(result.rows[0]);
  }

  async runInTransaction(callback) {
    const client = await this.postgresPool.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;
      const result = await callback(
        new WepLoginRepository({ postgresPool: client }),
      );
      await client.query("COMMIT");
      transactionStarted = false;
      return result;
    } catch (error) {
      if (transactionStarted) {
        await client.query("ROLLBACK").catch(() => {});
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async findEligibleVehicleForLogin(vehiculoId) {
    const result = await this.postgresPool.query(
      `SELECT
         id AS vehiculo_id,
         codigo_erp,
         nombre,
         patente,
         wep_pin_hash
       FROM public.vehiculos
       WHERE id = $1
         AND activo = TRUE
         AND es_externo = FALSE
         AND wep_login_activo = TRUE
         AND wep_pin_hash IS NOT NULL
       FOR UPDATE`,
      [vehiculoId],
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      vehicle: mapVehicle(row),
      pinHash: row.wep_pin_hash,
    };
  }

  async revokeActiveVehicleTokens(vehiculoId) {
    await this.postgresPool.query(
      `UPDATE public.vehiculo_tokens
       SET activo = FALSE
       WHERE vehiculo_id = $1
         AND activo = TRUE`,
      [vehiculoId],
    );
  }

  async createVehicleToken(vehiculoId, tokenHash) {
    await this.postgresPool.query(
      `INSERT INTO public.vehiculo_tokens
         (vehiculo_id, token_hash, activo, expira_at, created_at)
       VALUES ($1, $2, TRUE, NULL, NOW())`,
      [vehiculoId, tokenHash],
    );
  }
}

export default new WepLoginRepository();
