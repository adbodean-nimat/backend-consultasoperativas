import { pool } from "../../../dboperacion_pg.js";

export const CONFIG_RESOURCES = Object.freeze({
  "articulos-omitidos": {
    table: "gv_articulos_omitidos",
    codeField: "codigo_articulo",
    descriptionField: "descripcion",
    codeType: "text",
    codeMaxLength: 8,
    descriptionMaxLength: 255,
  },
  compradores: {
    table: "gv_compradores",
    codeField: "codigo_comprador",
    descriptionField: "nombre_comprador",
    codeType: "text",
    codeMaxLength: 3,
    descriptionMaxLength: 100,
  },
  "depositos-excluidos": {
    table: "gv_depositos_excluidos",
    codeField: "codigo_deposito",
    descriptionField: "nombre_deposito",
    codeType: "integer",
    descriptionMaxLength: 100,
  },
  "depositos-exhibidos": {
    table: "gv_depositos_exhibidos",
    codeField: "codigo_deposito",
    descriptionField: "descripcion",
    codeType: "integer",
    descriptionMaxLength: 100,
  },
  "tipos-articulo": {
    table: "gv_tipos_articulo",
    codeField: "codigo_tipo_articulo",
    descriptionField: "nombre_tipo_articulo",
    codeType: "text",
    codeMaxLength: 3,
    descriptionMaxLength: 100,
  },
  "tipos-comprobante-recepcion": {
    table: "gv_tipos_comprobante_recepcion",
    codeField: "codigo_tipo_comprobante",
    descriptionField: "nombre_tipo_comprobante",
    codeType: "text",
    codeMaxLength: 3,
    descriptionMaxLength: 150,
  },
  "tipos-npca": {
    table: "gv_tipos_npca",
    codeField: "codigo_tipo_npca",
    descriptionField: "nombre_tipo_npca",
    codeType: "text",
    codeMaxLength: 3,
    descriptionMaxLength: 150,
  },
});

export class RotacionProductosConfigRepository {
  constructor(database = pool) {
    this.database = database;
  }

  async list(definition) {
    const result = await this.database.query(
      `SELECT ${definition.codeField}, ${definition.descriptionField}, activo, actualizado_en
       FROM public.${definition.table}
       ORDER BY ${definition.codeField}`,
    );
    return result.rows;
  }

  async create(definition, { code, description, activo }) {
    const result = await this.database.query(
      `INSERT INTO public.${definition.table}
         (${definition.codeField}, ${definition.descriptionField}, activo, actualizado_en)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING ${definition.codeField}, ${definition.descriptionField}, activo, actualizado_en`,
      [code, description, activo],
    );
    return result.rows[0] ?? null;
  }

  async update(definition, code, changes) {
    const values = [];
    const assignments = [];
    if (changes.description !== undefined) {
      values.push(changes.description);
      assignments.push(`${definition.descriptionField} = $${values.length}`);
    }
    if (changes.activo !== undefined) {
      values.push(changes.activo);
      assignments.push(`activo = $${values.length}`);
    }
    values.push(code);

    const result = await this.database.query(
      `UPDATE public.${definition.table}
       SET ${assignments.join(", ")}, actualizado_en = CURRENT_TIMESTAMP
       WHERE ${definition.codeField} = $${values.length}
       RETURNING ${definition.codeField}, ${definition.descriptionField}, activo, actualizado_en`,
      values,
    );
    return result.rows[0] ?? null;
  }

  async delete(definition, code) {
    const result = await this.database.query(
      `DELETE FROM public.${definition.table}
       WHERE ${definition.codeField} = $1
       RETURNING ${definition.codeField}, ${definition.descriptionField}, activo, actualizado_en`,
      [code],
    );
    return result.rows[0] ?? null;
  }
}

export default new RotacionProductosConfigRepository();
