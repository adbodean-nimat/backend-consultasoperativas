import { pool } from "../../../dboperacion_pg.js";
import { GdcError } from "./gdc.errors.js";
import { RESOURCES, LIMITS, validateRecord } from "./gdc.validator.js";

export class GdcConfigRepository {
  constructor(executor = pool) { this.pool = executor; }
  async load() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const config = {};
      for (const [name, definition] of Object.entries(RESOURCES)) {
        const { rows } = await client.query(`SELECT * FROM public.${definition.table} ${name === "general" ? "WHERE id = 1" : "WHERE activo = true"} ORDER BY ${name === "familias" ? "orden, clasificador_5" : definition.key}`);
        if (rows.length > LIMITS.list) throw new GdcError("La configuración excede el límite de registros activos", { status: 503, code: "GDC_CONFIG_LIMIT" });
        config[name] = name === "general" ? rows[0] : rows;
      }
      if (!config.general) throw new GdcError("Falta la configuración general de Compras", { status: 503, code: "GDC_CONFIG_MISSING" });
      for (const [name, definition] of Object.entries(RESOURCES)) {
        for (const row of name === "general" ? [config.general] : config[name]) {
          const editable = Object.fromEntries([definition.key, ...definition.fields].map((field) => [field, row[field]]));
          validateRecord(definition, editable);
        }
      }
      await client.query("COMMIT");
      return config;
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async list(definition) {
    return (await this.pool.query(`SELECT * FROM public.${definition.table} ORDER BY ${definition.table === "gdc_familias_chapas" ? "orden, clasificador_5" : definition.key}`)).rows;
  }
  async create(definition, key, changes, actor) {
    const record = { [definition.key]: key, ...changes };
    validateRecord(definition, record);
    const fields = Object.keys(record);
    const values = [...Object.values(record), actor];
    return (await this.pool.query(`INSERT INTO public.${definition.table} (${fields.join(",")}, created_by, updated_by) VALUES (${fields.map((_, i) => `$${i + 1}`).join(",")}, $${values.length}, $${values.length}) RETURNING *`, values)).rows[0];
  }
  async update(definition, key, changes, actor) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const old = (await client.query(`SELECT * FROM public.${definition.table} WHERE ${definition.key} = $1 FOR UPDATE`, [key])).rows[0];
      if (!old) throw new GdcError("Registro inexistente", { status: 404, code: "GDC_ROW_NOT_FOUND" });
      const record = Object.fromEntries([definition.key, ...definition.fields].map((field) => [field, old[field]]));
      validateRecord(definition, { ...record, ...changes });
      const fields = Object.keys(changes);
      const values = [...Object.values(changes), actor, key];
      const row = (await client.query(`UPDATE public.${definition.table} SET ${fields.map((field, i) => `${field} = $${i + 1}`).join(",")}, updated_by = $${values.length - 1}, updated_at = CURRENT_TIMESTAMP WHERE ${definition.key} = $${values.length} RETURNING *`, values)).rows[0];
      await client.query("COMMIT");
      return row;
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }
}
export default new GdcConfigRepository();
