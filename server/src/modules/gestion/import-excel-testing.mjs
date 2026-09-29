import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../../../dboperacion_pg.js";

const APPLY_FLAG = "--apply";
const extractedPath = process.argv
  .slice(2)
  .find((argument) => argument !== APPLY_FLAG);
const shouldApply = process.argv.includes(APPLY_FLAG);

if (!extractedPath) {
  throw new Error(
    "Uso: node src/modules/gestion/import-excel-testing.mjs <extracted.json> [--apply]",
  );
}

const absoluteExtractedPath = path.resolve(extractedPath);
const sourceBuffer = await fs.readFile(absoluteExtractedPath);
const sourceHash = crypto.createHash("sha256").update(sourceBuffer).digest("hex");
const extracted = JSON.parse(sourceBuffer.toString("utf8"));

const records = extracted.records;
if (!Array.isArray(records) || records.length !== 619) {
  throw new Error("La extracción debe contener exactamente 619 fechas");
}

const uniqueDates = new Set(records.map((record) => record.fecha));
if (uniqueDates.size !== records.length || !uniqueDates.has("2026-06-26")) {
  throw new Error("La extracción contiene fechas duplicadas o no incluye 2026-06-26");
}

const latest = records.find((record) => record.fecha === "2026-06-26");
if (Math.abs(latest.values.ventasNetas - 143905639.88429752) > 0.000001) {
  throw new Error("El valor de ventas netas del 26/06/2026 no coincide con la planilla validada");
}

const FIELD_TO_INDICATOR = Object.freeze({
  ventasNetas: "ventas_netas",
  stockCostoReposicion: "stock_costo_reposicion",
  acopioCierreMes: "acopio_cierre_mes",
  acopioMesActual: "acopio_mes_actual",
  cuentaCorrienteClientes: "cuenta_corriente_clientes",
  anticipos: "anticipos",
  acopiosEspeciales: "acopios_especiales",
});
const importableRecords = records.filter((record) =>
  Object.keys(FIELD_TO_INDICATOR).some((field) => {
    const value = record.values[field];
    return typeof value === "number" && Number.isFinite(value);
  }),
);
const importableDates = new Set(importableRecords.map((record) => record.fecha));

const client = await pool.connect();
let backupPath = null;

try {
  const databaseResult = await client.query(
    `SELECT current_database() AS database, current_setting('server_version') AS version`,
  );
  const database = databaseResult.rows[0];
  if (database.database !== "dbNode" || database.version !== "10.22") {
    throw new Error(
      `Entorno rechazado: se esperaba PostgreSQL Testing dbNode 10.22 y se obtuvo ${database.database} ${database.version}`,
    );
  }

  const headersResult = await client.query(
    `SELECT id, fecha_corte::text AS fecha
     FROM gestion.registro
     WHERE fecha_corte = ANY($1::date[])`,
    [[...importableDates]],
  );
  if (headersResult.rowCount !== importableRecords.length) {
    const allHeadersResult = await client.query(
      `SELECT fecha_corte::text AS fecha FROM gestion.registro ORDER BY fecha_corte`,
    );
    const databaseDates = new Set(allHeadersResult.rows.map((row) => row.fecha));
    const workbookDates = new Set(records.map((record) => record.fecha));
    throw new Error(
      `PostgreSQL contiene ${headersResult.rowCount} de las ${importableRecords.length} fechas con datos a importar. ` +
        `Sólo Excel: ${[...workbookDates].filter((date) => !databaseDates.has(date)).join(", ")}. ` +
        `Sólo PostgreSQL: ${[...databaseDates].filter((date) => !workbookDates.has(date)).join(", ")}`,
    );
  }
  const registroIdByDate = new Map(
    headersResult.rows.map((row) => [row.fecha, row.id]),
  );

  const codes = Object.values(FIELD_TO_INDICATOR);
  const existingResult = await client.query(
    `SELECT r.fecha_corte::text AS fecha, r.id AS registro_id,
            i.codigo, rv.valor::text, rv.fuente_registro,
            rv.usuario_carga, rv.observacion
     FROM gestion.registro_valor rv
     JOIN gestion.registro r ON r.id = rv.registro_id
     JOIN gestion.indicador i ON i.id = rv.indicador_id
     WHERE i.codigo = ANY($1::varchar[])
     ORDER BY r.fecha_corte, i.codigo`,
    [codes],
  );
  const indicatorsResult = await client.query(
    `SELECT *
     FROM gestion.indicador
     WHERE codigo = ANY($1::varchar[])
        OR codigo = 'ventas_netas'
     ORDER BY id`,
    [codes],
  );

  const backup = {
    createdAt: new Date().toISOString(),
    database,
    source: {
      path: absoluteExtractedPath,
      sha256: sourceHash,
      recordCount: records.length,
    },
    indicators: indicatorsResult.rows,
    values: existingResult.rows,
  };

  if (shouldApply) {
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const backupDirectory = path.join(projectRoot, "data", "gestion-imports");
    await fs.mkdir(backupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = path.join(
      backupDirectory,
      `backup-antes-import-gestion-2026-06-26-${timestamp}.json`,
    );
    await fs.writeFile(backupPath, JSON.stringify(backup, null, 2), "utf8");
  }

  const existingByKey = new Map(
    existingResult.rows.map((row) => [`${row.fecha}|${row.codigo}`, row]),
  );
  const operations = [];
  const protectedValues = [];

  for (const record of importableRecords) {
    for (const [field, code] of Object.entries(FIELD_TO_INDICATOR)) {
      const value = record.values[field];
      if (value === null || value === "") continue;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Importe inválido para ${record.fecha} / ${field}`);
      }

      const existing = existingByKey.get(`${record.fecha}|${code}`);
      if (existing && existing.fuente_registro !== "EXCEL") {
        protectedValues.push({
          fecha: record.fecha,
          code,
          source: existing.fuente_registro,
        });
        continue;
      }

      const roundedValue = Math.round((value + Number.EPSILON) * 100) / 100;
      const currentValue = existing ? Number(existing.valor) : null;
      operations.push({
        fecha: record.fecha,
        registroId: registroIdByDate.get(record.fecha),
        code,
        value: roundedValue,
        action:
          existing && Math.abs(currentValue - roundedValue) <= 0.005
            ? "unchanged"
            : existing
              ? "update"
              : "insert",
      });
    }
  }

  const stats = operations.reduce(
    (result, operation) => {
      result[operation.code] ??= { insert: 0, update: 0, unchanged: 0 };
      result[operation.code][operation.action] += 1;
      return result;
    },
    {},
  );

  if (!shouldApply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          database,
          sourceHash,
          stats,
          protectedValues,
          instruction: `Repita con ${APPLY_FLAG} para ejecutar la transacción`,
        },
        null,
        2,
      ),
    );
    process.exitCode = 0;
  } else {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO gestion.indicador (
           codigo, nombre, grupo, modo_carga, unidad, orden, activo, configuracion
         )
         VALUES (
           'ventas_netas',
           'Ventas netas',
           'INDICADORES',
           'AUTOMATICO',
           'ARS',
           65,
           true,
           '{"fuente":"Excel historico","formula":"cobranzas / 1.21"}'::jsonb
         )
         ON CONFLICT (codigo) DO NOTHING`,
      );
      await client.query(
        `UPDATE gestion.indicador
         SET nombre = 'Acopio actualizado al cierre del mes',
             grupo = 'INDICADORES',
             modo_carga = 'AUTOMATICO',
             unidad = 'ARS',
             orden = 85,
             activo = true,
             configuracion = COALESCE(configuracion, '{}'::jsonb) ||
               '{"fuente":"Excel historico"}'::jsonb,
             actualizado_en = NOW()
         WHERE codigo = 'acopio_cierre_mes'`,
      );

      for (const operation of operations) {
        if (operation.action === "unchanged") continue;
        await client.query(
          `SELECT gestion.fn_upsert_valor($1, $2, $3, 'EXCEL', $4, $5)`,
          [
            operation.registroId,
            operation.code,
            operation.value,
            "migracion_excel_2026_06_26",
            "Reimportado desde gestion al 26-06-2026.xlsx",
          ],
        );
      }

      const verification = await client.query(
        `SELECT fecha_corte::text, ventas_netas::text,
                stock_costo_reposicion::text, acopio_mes_actual::text,
                cuenta_corriente_clientes::text
         FROM gestion.vw_resumen_por_fecha
         WHERE fecha_corte IN ('2026-06-12', '2026-06-19', '2026-06-26')
         ORDER BY fecha_corte`,
      );
      const countVerification = await client.query(
        `SELECT i.codigo, COUNT(*)::int AS cantidad
         FROM gestion.registro_valor rv
         JOIN gestion.indicador i ON i.id = rv.indicador_id
         WHERE i.codigo = ANY($1::varchar[])
         GROUP BY i.codigo
         ORDER BY i.codigo`,
        [codes],
      );

      const verifiedLatest = verification.rows.at(-1);
      if (
        verifiedLatest?.ventas_netas !== "143905639.88" ||
        verifiedLatest?.stock_costo_reposicion !== "4510187176.70" ||
        verifiedLatest?.acopio_mes_actual !== "32143004.64" ||
        verifiedLatest?.cuenta_corriente_clientes !== "147363935.43"
      ) {
        throw new Error("La verificación de valores del 26/06/2026 no coincide");
      }

      await client.query("COMMIT");
      console.log(
        JSON.stringify(
          {
            mode: "applied",
            database,
            sourceHash,
            backupPath,
            stats,
            protectedValues,
            counts: countVerification.rows,
            verification: verification.rows,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
