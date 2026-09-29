import sql from "mssql";
import { plataforma } from "../../../dbconfig.js";
import { GestionError } from "./gestion.errors.js";
import { mapAutomaticosPlataforma } from "./gestion.mapper.js";

export async function obtenerAutomaticos(fecha) {
  const startedAt = Date.now();
  try {
    const sqlServerPool = await sql.connect(plataforma);
    const result = await sqlServerPool
      .request()
      .input("fecha_corte", sql.Date, fecha)
      .input("dias_cobranzas_anteriores", sql.Int, -7)
      .input("dias_proveedores_vencer", sql.Int, 7)
      .execute("dbo.sp_gestion_finanzas_automaticos");

    const row = result.recordset?.[0];
    if (!row) {
      throw new GestionError("Plataforma no devolvió indicadores para la fecha solicitada", {
        status: 404,
        code: "PLATAFORMA_WITHOUT_DATA",
      });
    }

    console.info("[gestion] Sincronización Plataforma completada", {
      fecha,
      durationMs: Date.now() - startedAt,
    });
    return mapAutomaticosPlataforma(row);
  } catch (error) {
    if (error instanceof GestionError) throw error;
    console.error("[gestion] Falló la consulta de automáticos en Plataforma", {
      fecha,
      code: error?.code,
      durationMs: Date.now() - startedAt,
    });
    throw new GestionError("Plataforma no está disponible para sincronizar los indicadores", {
      status: 503,
      code: "PLATAFORMA_UNAVAILABLE",
      cause: error,
    });
  }
}
