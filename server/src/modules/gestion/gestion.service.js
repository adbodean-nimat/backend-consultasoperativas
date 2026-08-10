import {
  AUTOMATIC_INDICATORS,
  MANUAL_INDICATORS,
} from "./gestion.constants.js";
import { GestionError } from "./gestion.errors.js";
import { mapRegistro } from "./gestion.mapper.js";
import { obtenerAutomaticos } from "./gestion-plataforma.repository.js";
import {
  deleteIndicator,
  executeFunction,
  extractRegistroId,
  findByFecha,
  findHeaderByFecha,
  gestionPool,
  list,
  resolveFunctionContract,
} from "./gestion.repository.js";

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function getAuthenticatedUsername(req) {
  const user = req.user;
  if (typeof user === "string" && user.trim()) return user.trim();
  const candidates = [
    user?.sAMAccountName,
    user?.mail,
    user?.displayName,
    user?.cn,
    user?.name,
  ];
  const username = candidates.find((value) => typeof value === "string" && value.trim());
  if (!username) {
    throw new GestionError("No se pudo identificar al usuario autenticado", {
      status: 400,
      code: "AUTHENTICATED_USER_UNAVAILABLE",
    });
  }
  return username.trim();
}

function duplicateError(error) {
  return error?.code === "23505" || error?.constraint?.includes("fecha_corte");
}

async function saveIndicators({
  client,
  contract,
  registroId,
  values,
  mapping,
  source,
  username,
  deleteNulls = false,
}) {
  if (!values) return;
  for (const [field, code] of Object.entries(mapping)) {
    if (!hasOwn(values, field)) continue;
    const value = values[field];
    if (value === null) {
      if (deleteNulls) await deleteIndicator(client, registroId, code);
      continue;
    }
    await executeFunction(client, contract, {
      registro_id: registroId,
      codigo_indicador: code,
      valor: value,
      fuente_registro: source,
      usuario: username,
      usuario_carga: username,
      observacion: null,
    });
  }
}

function headerArguments(data, username, current = null) {
  const updatesSynchronization = hasOwn(data, "fechaSincronizacionPlataforma");
  const synchronizedAt = updatesSynchronization
    ? data.fechaSincronizacionPlataforma
    : current?.fecha_sincronizacion_plataforma ?? null;
  const observation = hasOwn(data.manuales ?? {}, "observacion")
    ? data.manuales.observacion
    : current?.observacion ?? null;

  return {
    fecha_corte: data.fecha ?? current?.fecha_corte,
    periodo_etiqueta: hasOwn(data, "periodoEtiqueta")
      ? data.periodoEtiqueta
      : current?.periodo_etiqueta,
    estado: hasOwn(data, "estado") ? data.estado : current?.estado,
    fecha_sincronizacion_plataforma: synchronizedAt,
    usuario_sincronizacion: updatesSynchronization
      ? synchronizedAt
        ? username
        : null
      : current?.usuario_sincronizacion ?? null,
    usuario_carga: username,
    usuario: username,
    observacion: observation,
  };
}

export async function getAutomaticos(fecha) {
  return obtenerAutomaticos(fecha);
}

export async function getByFecha(fecha) {
  return mapRegistro(await findByFecha(gestionPool, fecha));
}

export async function getList(filters) {
  const result = await list(gestionPool, filters);
  return { data: result.rows.map(mapRegistro), total: result.total };
}

export async function create(data, req) {
  const username = getAuthenticatedUsername(req);
  const client = await gestionPool.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;

    if (await findHeaderByFecha(client, data.fecha)) {
      throw new GestionError("Ya existe un registro para la fecha indicada", {
        status: 409,
        code: "GESTION_DATE_ALREADY_EXISTS",
      });
    }

    const registroContract = await resolveFunctionContract(client, "fn_upsert_registro");
    const valorContract = await resolveFunctionContract(client, "fn_upsert_valor");
    const headerResult = await executeFunction(
      client,
      registroContract,
      headerArguments(data, username),
    );
    const registroId = extractRegistroId(headerResult);

    await saveIndicators({
      client,
      contract: valorContract,
      registroId,
      values: data.automaticos,
      mapping: AUTOMATIC_INDICATORS,
      source: "PLATAFORMA",
      username,
    });
    await saveIndicators({
      client,
      contract: valorContract,
      registroId,
      values: data.manuales,
      mapping: MANUAL_INDICATORS,
      source: "MANUAL",
      username,
    });

    const saved = await findByFecha(client, data.fecha);
    await client.query("COMMIT");
    transactionStarted = false;
    return mapRegistro(saved);
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    if (duplicateError(error)) {
      throw new GestionError("Ya existe un registro para la fecha indicada", {
        status: 409,
        code: "GESTION_DATE_ALREADY_EXISTS",
        cause: error,
      });
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function update(fecha, data, req) {
  const username = getAuthenticatedUsername(req);
  const client = await gestionPool.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    const current = await findHeaderByFecha(client, fecha);
    if (!current) {
      throw new GestionError("No existe un registro para la fecha indicada", {
        status: 404,
        code: "GESTION_NOT_FOUND",
      });
    }

    const registroContract = await resolveFunctionContract(client, "fn_upsert_registro");
    const valorContract = await resolveFunctionContract(client, "fn_upsert_valor");
    const headerResult = await executeFunction(
      client,
      registroContract,
      headerArguments({ ...data, fecha }, username, current),
    );
    const registroId = extractRegistroId(headerResult);

    await saveIndicators({
      client,
      contract: valorContract,
      registroId,
      values: data.automaticos,
      mapping: AUTOMATIC_INDICATORS,
      source: "PLATAFORMA",
      username,
    });
    await saveIndicators({
      client,
      contract: valorContract,
      registroId,
      values: data.manuales,
      mapping: MANUAL_INDICATORS,
      source: "MANUAL",
      username,
      deleteNulls: true,
    });

    const saved = await findByFecha(client, fecha);
    await client.query("COMMIT");
    transactionStarted = false;
    return mapRegistro(saved);
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
