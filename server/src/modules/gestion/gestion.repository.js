import { pool } from "../../../dboperacion_pg.js";
import { DatabaseContractError } from "./gestion.errors.js";

const VIEW_COLUMNS = `
  v.caja,
  v.ajuste_caja,
  v.caja_final,
  v.bancos,
  v.bancos_descubierto,
  v.valores,
  v.fondos_fci,
  v.proveedores,
  v.proveedores_a_vencer,
  v.ajuste_proveedores_a_vencer,
  v.proveedores_a_vencer_final,
  v.opv_otros,
  v.opv_otros_proyectado_semana,
  v.anticipos,
  v.acopios_especiales,
  v.cobranzas,
  v.cobranzas_proyectadas,
  v.ventas_netas,
  previous_week.ventas_netas AS ventas_netas_semana_anterior,
  v.stock_costo_reposicion,
  (
    SELECT rv_acopio_cierre.valor
    FROM gestion.registro_valor rv_acopio_cierre
    INNER JOIN gestion.indicador i_acopio_cierre
      ON i_acopio_cierre.id = rv_acopio_cierre.indicador_id
    WHERE rv_acopio_cierre.registro_id = r.id
      AND i_acopio_cierre.codigo = 'acopio_cierre_mes'
    LIMIT 1
  ) AS acopio_cierre_mes,
  v.acopio_mes_actual,
  v.cuenta_corriente_clientes,
  (
    SELECT rv_dias.valor
    FROM gestion.registro_valor rv_dias
    INNER JOIN gestion.indicador i_dias
      ON i_dias.id = rv_dias.indicador_id
    WHERE rv_dias.registro_id = r.id
      AND i_dias.codigo = 'dias_caja'
    LIMIT 1
  ) AS dias_caja,
  v.total_disponibilidades,
  v.total_pasivos,
  v.liquidez_neta
`;

const BASE_SELECT = `
  SELECT
    r.id AS registro_id,
    r.fecha_corte,
    r.periodo_etiqueta,
    r.estado,
    r.fecha_sincronizacion_plataforma,
    r.usuario_sincronizacion,
    r.usuario_carga,
    r.observacion,
    r.creado_en,
    r.actualizado_en,
    ${VIEW_COLUMNS}
  FROM gestion.registro r
  LEFT JOIN gestion.vw_resumen_por_fecha v ON v.fecha_corte = r.fecha_corte
  LEFT JOIN gestion.vw_resumen_por_fecha previous_week
    ON previous_week.fecha_corte = r.fecha_corte - 7
`;

export { pool as gestionPool };

export async function findByFecha(executor, fecha) {
  const result = await executor.query(`${BASE_SELECT} WHERE r.fecha_corte = $1`, [fecha]);
  return result.rows[0] ?? null;
}

export async function findHeaderByFecha(executor, fecha) {
  const result = await executor.query(
    `SELECT * FROM gestion.registro WHERE fecha_corte = $1`,
    [fecha],
  );
  return result.rows[0] ?? null;
}

export async function list(executor, filters) {
  const clauses = [];
  const values = [];
  const addFilter = (sql, value) => {
    values.push(value);
    clauses.push(`${sql} $${values.length}`);
  };

  if (filters.desde) addFilter("r.fecha_corte >=", filters.desde);
  if (filters.hasta) addFilter("r.fecha_corte <=", filters.hasta);
  if (filters.estado) addFilter("r.estado =", filters.estado);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const countResult = await executor.query(
    `SELECT COUNT(*)::bigint AS total FROM gestion.registro r ${where}`,
    values,
  );

  const paginatedValues = [...values, filters.limit, filters.offset];
  const rowsResult = await executor.query(
    `${BASE_SELECT}
     ${where}
     ORDER BY r.fecha_corte DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    paginatedValues,
  );

  return { rows: rowsResult.rows, total: Number(countResult.rows[0].total) };
}

function normalizeArgumentName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/^_+/, "")
    .replace(/^p_/, "");
}

const ARGUMENT_ALIASES = Object.freeze({
  fecha: "fecha_corte",
  codigo: "codigo_indicador",
  indicador_codigo: "codigo_indicador",
  fuente: "fuente_registro",
});

export async function resolveFunctionContract(client, functionName) {
  const result = await client.query(
    `SELECT
       p.oid,
       p.proname,
       p.pronargs,
       p.proargnames,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'gestion' AND p.proname = $1`,
    [functionName],
  );

  if (result.rowCount !== 1) {
    throw new DatabaseContractError(
      `La función gestion.${functionName} no está disponible con una firma única en Testing`,
    );
  }

  const contract = result.rows[0];
  if (!contract.proargnames || contract.proargnames.length < contract.pronargs) {
    throw new DatabaseContractError(
      `La función gestion.${functionName} debe declarar nombres para todos sus parámetros de entrada`,
    );
  }
  return contract;
}

function extractInputType(argumentDefinition) {
  const withoutDefault = argumentDefinition.replace(/\s+DEFAULT\s+.+$/i, "").trim();
  const firstSpace = withoutDefault.indexOf(" ");
  const type = firstSpace === -1 ? withoutDefault : withoutDefault.slice(firstSpace + 1).trim();
  if (!/^[a-zA-Z0-9_ ."\[\]]+$/.test(type)) {
    throw new DatabaseContractError("La firma de la función contiene un tipo no soportado");
  }
  return type;
}

export async function executeFunction(client, contract, argumentValues) {
  const definitions = contract.identity_arguments
    ? contract.identity_arguments.split(",").map((value) => value.trim())
    : [];
  if (definitions.length !== contract.pronargs) {
    throw new DatabaseContractError(
      `No se pudo interpretar la firma de gestion.${contract.proname}`,
    );
  }

  const values = [];
  const placeholders = [];
  for (let index = 0; index < contract.pronargs; index += 1) {
    const rawName = normalizeArgumentName(contract.proargnames[index]);
    const semanticName = ARGUMENT_ALIASES[rawName] ?? rawName;
    if (!Object.prototype.hasOwnProperty.call(argumentValues, semanticName)) {
      throw new DatabaseContractError(
        `El parámetro ${contract.proargnames[index]} de gestion.${contract.proname} no coincide con el contrato soportado`,
      );
    }
    values.push(argumentValues[semanticName]);
    placeholders.push(`$${index + 1}::${extractInputType(definitions[index])}`);
  }

  const allowedFunctions = new Set(["fn_upsert_registro", "fn_upsert_valor"]);
  if (!allowedFunctions.has(contract.proname)) {
    throw new DatabaseContractError("Función de Gestión no permitida");
  }
  return client.query(
    `SELECT * FROM gestion.${contract.proname}(${placeholders.join(", ")})`,
    values,
  );
}

export function extractRegistroId(functionResult) {
  const row = functionResult.rows[0];
  if (!row) throw new DatabaseContractError("fn_upsert_registro no devolvió registro_id");
  const value = row.registro_id ?? row.fn_upsert_registro ?? Object.values(row)[0];
  if (value === undefined || value === null) {
    throw new DatabaseContractError("fn_upsert_registro no devolvió registro_id");
  }
  return value;
}

export async function deleteIndicator(client, registroId, indicatorCode) {
  await client.query(
    `DELETE FROM gestion.registro_valor rv
     USING gestion.indicador i
     WHERE rv.registro_id = $1
       AND rv.indicador_id = i.id
       AND i.codigo = $2`,
    [registroId, indicatorCode],
  );
}
