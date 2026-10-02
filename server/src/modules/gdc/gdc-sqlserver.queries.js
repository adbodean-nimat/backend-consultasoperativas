// Every ERP statement is a SELECT with CTEs. Configuration values are bound inputs.
import sql from "mssql";
import { LIMITS } from "./gdc.validator.js";

function builder(readUncommitted) {
  const inputs = [];
  const bind = (value, type = sql.VarChar(20)) => {
    const name = `p${inputs.length}`;
    inputs.push({ name, type, value });
    return `@${name}`;
  };
  const values = (name, columns, rows, types) => {
    if (rows.length > LIMITS.list) throw new Error("GDC_CONFIG_LIMIT");
    const content = rows.length
      ? `SELECT * FROM (VALUES ${rows.map((row) => `(${row.map((v, i) => bind(v, types[i])).join(",")})`).join(",")}) AS v(${columns.join(",")})`
      : `SELECT ${columns.map((column, i) => `${bind(null, types[i])} AS ${column}`).join(",")} WHERE 1 = 0`;
    return `${name} AS (${content})`;
  };
  const table = (name, alias) => `dbo.${name} AS ${alias}${readUncommitted ? " WITH (READUNCOMMITTED)" : ""}`;
  const finish = (text) => { if (inputs.length > 2000) throw new Error("GDC_PARAMETER_LIMIT"); return { text, inputs }; };
  return { bind, values, table, finish };
}
function families(b, config) {
  return b.values("Families", ["classifier5", "hl", "ref1050", "ref13m"], config.familias.map((f) => [f.clasificador_5, f.codigo_ref_hl, f.codigo_ref_1050, f.codigo_ref_13m]), [sql.VarChar(4), sql.VarChar(20), sql.VarChar(20), sql.VarChar(20)]);
}
const badFactor = "(factor IS NULL OR factor <= 0)";
const tonSum = (quantity = "quantity") => `CASE WHEN SUM(CASE WHEN ${badFactor} AND ${quantity} <> 0 THEN 1 ELSE 0 END) > 0 THEN NULL ELSE COALESCE(SUM(${quantity} / NULLIF(CASE WHEN factor > 0 THEN factor END, 0)),0) END`;

export function consumptionQuery(config, parameters, production, readUncommitted = false) {
  const b = builder(readUncommitted);
  const f = families(b, config);
  const from = b.bind(parameters.dateFrom, sql.Date), to = b.bind(parameters.dateToExclusive, sql.Date);
  const rotationFrom = b.bind(parameters.rotationDateFrom, sql.Date), rotationTo = b.bind(parameters.rotationDateToExclusive, sql.Date);
  const queryFrom = b.bind(parameters.dateFrom < parameters.rotationDateFrom ? parameters.dateFrom : parameters.rotationDateFrom, sql.Date);
  const vouchers = production ? "" : `, ${b.values("Vouchers", ["code"], config["comprobantes-consumo-ventas"].map((v) => [v.codigo_comprobante]), [sql.VarChar(3)])}`;
  // EXISTS keeps a movement line single even if MSMV or TCSP repeats its link.
  const movement = production
    ? `FROM ${b.table("STOC_MOSD", "d")}
       JOIN ${b.table("STOC_ARTS", "a")} ON a.ARTS_ARTICULO = d.MOSD_ARTICULO
       JOIN Families AS f ON f.classifier5 = a.ARTS_CLASIF_5 AND f.hl = a.ARTS_ARTICULO_EMP
       JOIN ${b.table("STOC_MSVA", "c")} ON EXISTS (
         SELECT 1 FROM ${b.table("STOC_MSMV", "m")}
         WHERE m.MSMV_MOVSTO_MOST = d.MOSD_MOVSTO_MOST
           AND m.MSMV_DIVISION_MSVA = c.MSVA_DIVISION_MSVA AND m.MSMV_SUCURSAL_MSVA = c.MSVA_SUCURSAL_MSVA
           AND m.MSMV_TIPO_MSVA = c.MSVA_TIPO_MSVA AND m.MSMV_NUMERO_MSVA = c.MSVA_NUMERO_MSVA)
       WHERE c.MSVA_FECHA_EMI >= ${queryFrom} AND c.MSVA_FECHA_EMI < ${to}
         AND EXISTS (SELECT 1 FROM ${b.table("PROD_TCSP", "t")} WHERE t.TCSP_TIPO_TCSP = c.MSVA_TIPO_MSVA)`
    : `FROM ${b.table("STOC_MOSD", "d")}
       JOIN ${b.table("STOC_ARTS", "a")} ON a.ARTS_ARTICULO = d.MOSD_ARTICULO
       JOIN Families AS f ON f.classifier5 = a.ARTS_CLASIF_5
       JOIN ${b.table("STOC_MOST", "s")} ON s.MOST_MOVSTO_MOST = d.MOSD_MOVSTO_MOST
       WHERE s.MOST_FECHA_EMI >= ${queryFrom} AND s.MOST_FECHA_EMI < ${to}
         AND EXISTS (SELECT 1 FROM ${b.table("STOC_MSMV", "m")} JOIN Vouchers AS v ON v.code = m.MSMV_TIPO_MSVA
                     WHERE m.MSMV_MOVSTO_MOST = d.MOSD_MOVSTO_MOST)`;
  return b.finish(`WITH ${f}${vouchers},
    Ranges AS (SELECT 'monthly' AS scope, ${from} AS dateFrom, ${to} AS dateTo
               UNION ALL SELECT 'rotation', ${rotationFrom}, ${rotationTo}),
    Movements AS (
      SELECT f.classifier5, ${production ? "c.MSVA_FECHA_EMI" : "s.MOST_FECHA_EMI"} AS movementDate,
        CAST(d.MOSD_CANT_ING AS decimal(28,8)) ${production ? "" : "* CASE WHEN d.MOSD_SIGNO = 'S' THEN 1 ELSE -1 END"} AS quantity,
        a.ARTS_FACTOR_HOMSTO AS factor ${movement}
    )
    SELECT m.classifier5, r.scope,
      CASE WHEN r.scope = 'monthly' THEN CONVERT(char(7), m.movementDate, 126) END AS period,
      ${tonSum()} AS ton,
      SUM(CASE WHEN ${badFactor} AND quantity <> 0 THEN 1 ELSE 0 END) AS invalidFactors
    FROM Movements AS m JOIN Ranges AS r ON m.movementDate >= r.dateFrom AND m.movementDate < r.dateTo
    GROUP BY m.classifier5, r.scope, CASE WHEN r.scope = 'monthly' THEN CONVERT(char(7), m.movementDate, 126) END`);
}

export function salesOrderQuery(config, readUncommitted = false) {
  const b = builder(readUncommitted);
  const f = families(b, config);
  const types = b.values("TypesNP", ["code"], config["tipos-np"].map((v) => [v.codigo_tipo_np]), [sql.VarChar(3)]);
  return b.finish(`WITH ${f}, ${types}, Detail AS (
    SELECT f.classifier5, CAST(d.NPDE_CANT_PEDIDA - d.NPDE_CANT_ENTREG AS decimal(28,8)) AS quantity, a.ARTS_FACTOR_HOMSTO AS factor
    FROM ${b.table("VENT_NPDE", "d")}
    JOIN ${b.table("VENT_NPCA", "c")} ON d.NPDE_DIVISION_NPCA = c.NPCA_DIVISION_NPCA AND d.NPDE_TIPO_NPCA = c.NPCA_TIPO_NPCA AND d.NPDE_NUMERO_NPCA = c.NPCA_NUMERO_NPCA
    JOIN ${b.table("STOC_ARTS", "a")} ON a.ARTS_ARTICULO = d.NPDE_ARTICULO
    JOIN Families AS f ON f.classifier5 = a.ARTS_CLASIF_5
    WHERE d.NPDE_CANT_PEDIDA - d.NPDE_CANT_ENTREG > 0 AND d.NPDE_MOTIVO_CANC IS NULL
      AND EXISTS (SELECT 1 FROM TypesNP AS t WHERE t.code = c.NPCA_TIPO_NPCA)
  ) SELECT classifier5, ${tonSum()} AS ton, SUM(CASE WHEN ${badFactor} THEN 1 ELSE 0 END) AS invalidFactors
    FROM Detail GROUP BY classifier5`);
}

export function purchaseOrderQuery(config, readUncommitted = false) {
  const b = builder(readUncommitted), f = families(b, config);
  const supplier = b.bind(config.general.proveedor_oc, sql.Int);
  return b.finish(`WITH ${f}, Detail AS (
    SELECT f.classifier5, a.ARTS_ARTICULO_EMP AS code,
      CAST(COALESCE(r.RODC_CANT_PEDIDA,0) - COALESCE(r.RODC_CANT_RECIB,0) AS decimal(28,8)) AS quantity, a.ARTS_FACTOR_HOMSTO AS factor
    FROM ${b.table("COMP_RODC", "r")}
    JOIN ${b.table("COMP_CODC", "c")} ON r.RODC_DIVISION = c.CODC_DIVISION AND r.RODC_TIPO_OC = c.CODC_TIPO_OC AND r.RODC_NUM_OC = c.CODC_NUM_OC
    JOIN ${b.table("STOC_ARTS", "a")} ON a.ARTS_ARTICULO = r.RODC_ARTICULO
    JOIN Families AS f ON f.classifier5 = a.ARTS_CLASIF_5
    WHERE COALESCE(r.RODC_CANT_PEDIDA,0) - COALESCE(r.RODC_CANT_RECIB,0) > 0
      AND r.RODC_MOTIVO_CANC IS NULL AND r.RODC_FECHA_CANC IS NULL
      AND (${supplier} IS NULL OR c.CODC_PROVEEDOR = ${supplier})
  ) SELECT classifier5, code, SUM(quantity) AS units, ${tonSum()} AS ton,
      SUM(CASE WHEN ${badFactor} THEN 1 ELSE 0 END) AS invalidFactors
    FROM Detail GROUP BY classifier5, code`);
}

export function stockQuery(config, readUncommitted = false) {
  const b = builder(readUncommitted), f = families(b, config);
  const types = b.values("TypesSheet", ["code"], config["tipos-articulo-chapa"].map((v) => [v.codigo]), [sql.VarChar(3)]);
  const excluded = b.values("Excluded", ["warehouse"], config["depositos-excluidos"].map((v) => [v.codigo_deposito]), [sql.Int]);
  const main = b.bind(config.general.deposito_principal, sql.Int);
  const classifier8 = b.bind(config.general.clasificador_8_excluido_stock, sql.VarChar(4));
  const source = (sheet) => {
    const prefix = sheet ? "STDP" : "SDPP";
    return `SELECT f.classifier5, a.ARTS_ARTICULO AS article, a.ARTS_ARTICULO_EMP AS code,
      a.ARTS_FACTOR_HOMSTO AS factor, s.${prefix}_DEPOSITO AS warehouse, CAST(s.${prefix}_STOCK_ACT AS decimal(28,8)) AS quantity
      FROM ${b.table(`STOC_${prefix}`, "s")}
      JOIN ${b.table("STOC_ARTS", "a")} ON a.ARTS_ARTICULO = s.${prefix}_ARTICULO
      JOIN Families AS f ON f.classifier5 = a.ARTS_CLASIF_5
      WHERE ${sheet ? "" : "NOT "}EXISTS (SELECT 1 FROM TypesSheet AS t WHERE t.code = a.ARTS_TIPO_ART)
        AND NOT EXISTS (SELECT 1 FROM Excluded AS e WHERE e.warehouse = s.${prefix}_DEPOSITO)
        AND EXISTS (SELECT 1 FROM ${b.table("STOC_DPOS", "dp")} WHERE dp.DPOS_DEPOSITO = s.${prefix}_DEPOSITO)
        ${sheet ? "" : `AND a.ARTS_CLASIF_8 <> ${classifier8}`}`;
  };
  return b.finish(`WITH ${f}, ${types}, ${excluded}, StockSource AS (${source(false)} UNION ALL ${source(true)}),
    ArticleStock AS (
      SELECT classifier5, article, code, factor,
        SUM(CASE WHEN warehouse = ${main} THEN quantity ELSE 0 END) AS mainUnits,
        SUM(CASE WHEN warehouse <> ${main} THEN quantity ELSE 0 END) AS otherUnits,
        SUM(quantity) AS quantity
      FROM StockSource GROUP BY classifier5, article, code, factor HAVING SUM(quantity) > 0
    ) SELECT classifier5, code, SUM(mainUnits) AS mainUnits, SUM(otherUnits) AS otherUnits, SUM(quantity) AS totalUnits,
      ${tonSum("mainUnits")} AS mainTon, ${tonSum("otherUnits")} AS otherTon, ${tonSum()} AS totalTon,
      SUM(CASE WHEN ${badFactor} THEN 1 ELSE 0 END) AS invalidFactors
    FROM ArticleStock GROUP BY classifier5, code`);
}

export function dataQuery(config, readUncommitted = false) {
  const b = builder(readUncommitted), f = families(b, config);
  return b.finish(`WITH ${f}, Codes AS (SELECT DISTINCT COALESCE(ref13m,hl) AS code FROM Families),
    Factors AS (
      SELECT a.ARTS_ARTICULO_EMP AS code, COUNT(*) AS matches,
        COUNT(DISTINCT a.ARTS_FACTOR_HOMSTO) AS distinctFactors,
        MIN(a.ARTS_FACTOR_HOMSTO) AS factor,
        SUM(CASE WHEN a.ARTS_FACTOR_HOMSTO IS NULL OR a.ARTS_FACTOR_HOMSTO <= 0 THEN 1 ELSE 0 END) AS invalidFactors
      FROM ${b.table("STOC_ARTS", "a")} JOIN Codes AS c ON c.code = a.ARTS_ARTICULO_EMP GROUP BY a.ARTS_ARTICULO_EMP
    ), Classifiers AS (
      SELECT a.ARTS_CLASIF_5 AS classifier5, COUNT(DISTINCT a.ARTS_CLASIF_4) AS classifier4Count,
        MIN(a.ARTS_CLASIF_4) AS classifier4, MIN(c.CA04_NOMBRE) AS classifier4Name
      FROM ${b.table("STOC_ARTS", "a")} LEFT JOIN ${b.table("STOC_CA04", "c")} ON c.CA04_CLASIF_4 = a.ARTS_CLASIF_4
      WHERE EXISTS (SELECT 1 FROM Families AS f WHERE f.classifier5 = a.ARTS_CLASIF_5)
      GROUP BY a.ARTS_CLASIF_5
    ) SELECT f.classifier5, e.matches, e.distinctFactors, e.factor, e.invalidFactors,
      c.classifier4Count, c.classifier4, c.classifier4Name
      FROM Families AS f LEFT JOIN Factors AS e ON e.code = COALESCE(f.ref13m,f.hl)
      LEFT JOIN Classifiers AS c ON c.classifier5 = f.classifier5`);
}
