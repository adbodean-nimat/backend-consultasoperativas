import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  mapAutomaticosPlataforma,
  mapRegistro,
  normalizeNumeric,
} from "./gestion.mapper.js";
import { MANUAL_INDICATORS } from "./gestion.constants.js";
import {
  isValidDate,
  validateCreateBody,
  validateListQuery,
  validateUpdateBody,
} from "./gestion.validator.js";

const validCreate = () => ({
  fecha: "2026-07-16",
  automaticos: {
    caja: 0,
    valores: 0,
    fondosFci: 0,
    proveedores: 0,
    proveedoresAVencer: 0,
    cobranzas: 0,
    ventasNetas: null,
    stockCostoReposicion: 0,
    acopioMesActual: 0,
    cuentaCorrienteClientes: 0,
    diasCaja: null,
  },
  manuales: {
    ajusteCaja: null,
    bancos: 0,
    bancosDescubierto: 0,
    opvOtros: 0,
    otrosActual: null,
    otrosPagosProyectados: 0,
    anticipos: 0,
    acopiosEspeciales: 0,
    acopioCierreMes: 0,
    ajusteProveedoresAVencer: null,
    observacion: null,
  },
});

test("valida fechas reales con formato estricto", () => {
  assert.equal(isValidDate("2026-07-16"), true);
  assert.equal(isValidDate("2026-02-29"), false);
  assert.equal(isValidDate("2026-7-16"), false);
});

test("POST final deriva semana, estado y sincronización", () => {
  const validated = validateCreateBody(validCreate());
  assert.equal(validated.periodoEtiqueta, "16/07/2026 a 22/07/2026");
  assert.equal(validated.estado, "GUARDADO");
  assert.equal(validated.fechaSincronizacionPlataforma, null);
});

test("la semana derivada cruza de año desde la fecha seleccionada", () => {
  const body = validCreate();
  body.fecha = "2026-12-29";
  const validated = validateCreateBody(body);
  assert.equal(validated.periodoEtiqueta, "29/12/2026 a 04/01/2027");
});

test("acepta semana y sincronizadoEn del contrato nuevo", () => {
  const body = {
    ...validCreate(),
    semana: "Semana de prueba",
    sincronizadoEn: "2026-07-16T10:30:00.000Z",
  };
  const validated = validateCreateBody(body);
  assert.equal(validated.periodoEtiqueta, "Semana de prueba");
  assert.equal(
    validated.fechaSincronizacionPlataforma,
    "2026-07-16T10:30:00.000Z",
  );
  assert.equal(Object.hasOwn(validated, "semana"), false);
});

test("acepta cero y ajustes negativos", () => {
  const body = validCreate();
  body.manuales.ajusteCaja = -100;
  const validated = validateCreateBody(body);
  assert.equal(validated.manuales.ajusteCaja, -100);
  assert.equal(validated.manuales.bancos, 0);
});

test("acepta acopio al cierre del mes manual y rechaza negativos", () => {
  const body = validCreate();
  body.manuales.acopioCierreMes = 465501904.65;
  const validated = validateCreateBody(body);
  assert.equal(validated.manuales.acopioCierreMes, 465501904.65);
  assert.equal(MANUAL_INDICATORS.acopioCierreMes, "acopio_cierre_mes");

  body.manuales.acopioCierreMes = -1;
  assert.throws(() => validateCreateBody(body), /no son válidos/);
});

test("rechaza bancos negativo y calculados enviados", () => {
  const negative = validCreate();
  negative.manuales.bancos = -1;
  assert.throws(() => validateCreateBody(negative), /no son válidos/);

  const calculated = { ...validCreate(), calculados: { liquidezNeta: 1 } };
  assert.throws(() => validateCreateBody(calculated), /no son válidos/);
});

test("normaliza el alias temporal de otrosPagosProyectados", () => {
  const body = validCreate();
  delete body.manuales.otrosPagosProyectados;
  body.manuales.opvOtrosProyectadoSemana = 12000000;
  const validated = validateCreateBody(body);
  assert.equal(validated.manuales.otrosPagosProyectados, 12000000);
  assert.equal(
    Object.hasOwn(validated.manuales, "opvOtrosProyectadoSemana"),
    false,
  );
});

test("rechaza aliases proyectados con valores diferentes", () => {
  const body = validCreate();
  body.manuales.otrosPagosProyectados = 1;
  body.manuales.opvOtrosProyectadoSemana = 2;
  assert.throws(() => validateCreateBody(body), /no son válidos/);
});

test("otrosActual sólo admite null hasta tener fuente persistible", () => {
  assert.equal(
    validateCreateBody(validCreate()).manuales.otrosActual,
    undefined,
  );
  const body = validCreate();
  body.manuales.otrosActual = 1;
  assert.throws(() => validateCreateBody(body), /no son válidos/);
});

test("rechaza strings, NaN e infinito en importes", () => {
  for (const value of ["", "12000000", Number.NaN, Number.POSITIVE_INFINITY]) {
    const body = validCreate();
    body.manuales.otrosPagosProyectados = value;
    assert.throws(() => validateCreateBody(body), /no son válidos/);
  }
});

test("PUT parcial conserva ausentes y convierte null del alias", () => {
  const body = { manuales: { opvOtrosProyectadoSemana: null } };
  const validated = validateUpdateBody(body, "2026-07-16");
  assert.equal(validated.manuales.otrosPagosProyectados, null);
  assert.equal(Object.hasOwn(validated.manuales, "bancos"), false);
});

test("valida y limita paginación", () => {
  assert.deepEqual(validateListQuery({ limit: "50", offset: "0" }), {
    desde: undefined,
    hasta: undefined,
    estado: undefined,
    limit: 50,
    offset: 0,
  });
  assert.throws(() => validateListQuery({ limit: "101" }), /no son válidos/);
});

test("normaliza number/string sin perder cero ni null", () => {
  assert.equal(normalizeNumeric("12.50"), 12.5);
  assert.equal(normalizeNumeric(0), 0);
  assert.equal(normalizeNumeric(null), null);
});

test("automáticos siempre incluyen campos opcionales y diasCaja", () => {
  const mapped = mapAutomaticosPlataforma({
    fecha: "2026-07-16",
    semana: "16/07 a 22/07",
    caja: 0,
    valores: null,
    otros_opv: "8439817.95",
    ventas_netas: "199424866.75",
    dias_caja: null,
  });
  assert.equal(mapped.semana, "16/07 a 22/07");
  assert.equal(mapped.caja, 0);
  assert.equal(mapped.valores, null);
  assert.equal(mapped.otrosOpv, 8439817.95);
  assert.equal(mapped.ventasNetas, 199424866.75);
  assert.equal(mapped.acopioCierreMes, null);
  assert.equal(mapped.diasCaja, null);
  assert.equal(typeof mapped.sincronizadoEn, "string");
});

test("el SP de producción conserva exactamente el contrato funcional aprobado", () => {
  const sql = readFileSync(
    new URL(
      "./scripts/sp_gestion_finanzas_automaticos_produccion.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const approvedSql = readFileSync(
    new URL(
      "./scripts/sp_gestion_finanzas_automaticos_testing_compatible.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const procedureBody = (source) => {
    const normalized = source.replace(/\r\n/g, "\n");
    const start = normalized.indexOf("CREATE OR ALTER PROCEDURE");
    const end = normalized.indexOf("\nGO", start);
    return normalized.slice(start, end).replace(/\s+/g, " ").trim();
  };
  assert.equal(
    procedureBody(sql),
    procedureBody(approvedSql),
    "Producción debe conservar los mismos tokens funcionales aprobados en Testing",
  );
  assert.match(sql, /AS otros_opv/);
  assert.match(sql, /OPPV_FECHA_EMI = @fecha_corte/);
  assert.match(sql, /valores_saldo_inicial AS/);
  assert.match(sql, /valores_fechacorte AS/);
  assert.match(sql, /c\.CASI_FECHA < @fecha_corte/);
  assert.match(sql, /c\.CASI_FECHA = @fecha_corte/);
  assert.match(sql, /CREATE OR ALTER PROCEDURE dbo\.sp_gestion_finanzas_automaticos/);
  assert.match(sql, /sys\.dm_exec_describe_first_result_set_for_object/);
  assert.doesNotMatch(sql, /^\s*DROP\s+PROCEDURE/im);

  const finalSelect = sql.slice(sql.lastIndexOf("\nSELECT\n    @fecha_corte AS fecha"));
  const expectedOrder = [
    "AS fecha", "AS semana", "AS caja", "AS valores", "AS fondos_fci",
    "AS proveedores", "AS otros_opv", "AS cobranzas",
    "AS proveedores_a_vencer", "AS ventas_netas", "AS stock_costo_reposicion",
    "AS acopio_mes_actual", "AS cuenta_corriente_clientes", "AS dias_caja",
  ];
  let previousIndex = -1;
  for (const alias of expectedOrder) {
    const index = finalSelect.indexOf(alias);
    assert.ok(index > previousIndex, `${alias} debe respetar el orden contractual`);
    previousIndex = index;
  }
});

test("mapea el contrato final y recalcula todos los derivados", () => {
  const mapped = mapRegistro({
    registro_id: "283",
    fecha_corte: "2026-06-26",
    periodo_etiqueta: "26/06 a 02/07",
    estado: "GUARDADO",
    caja: "13000000",
    ajuste_caja: null,
    bancos: "34836345.28",
    bancos_descubierto: null,
    valores: "184055915.61",
    fondos_fci: "48000000",
    proveedores: "33209011.52",
    proveedores_a_vencer: "117936716.90",
    ajuste_proveedores_a_vencer: null,
    opv_otros: "8439817.95",
    opv_otros_proyectado_semana: "117467409.87",
    anticipos: "115470495.81",
    acopios_especiales: "81816969.06",
    cobranzas: "174125824.26",
    cobranzas_proyectadas: null,
    ventas_netas: "143905639.88",
    ventas_netas_semana_anterior: "221901644.22",
    stock_costo_reposicion: "4510187176.70",
    acopio_cierre_mes: "465501904.65",
    acopio_mes_actual: "32143004.64",
    cuenta_corriente_clientes: "147363935.43",
    dias_caja: null,
    actualizado_en: "2026-07-24T17:00:32.602Z",
  });

  assert.equal(mapped.semana, "26/06 a 02/07");
  assert.equal(mapped.automaticos.ventasNetas, 143905639.88);
  assert.equal(mapped.automaticos.stockCostoReposicion, 4510187176.7);
  assert.equal(mapped.automaticos.acopioCierreMes, 465501904.65);
  assert.equal(mapped.automaticos.acopioMesActual, 32143004.64);
  assert.equal(mapped.automaticos.cuentaCorrienteClientes, 147363935.43);
  assert.equal(mapped.automaticos.diasCaja, null);
  assert.equal(mapped.manuales.opvOtros, 8439817.95);
  assert.equal(mapped.manuales.otrosActual, null);
  assert.equal(mapped.manuales.otrosPagosProyectados, 117467409.87);
  assert.equal(mapped.manuales.anticipos, 115470495.81);
  assert.equal(mapped.manuales.acopiosEspeciales, 81816969.06);
  assert.equal(mapped.manuales.acopioCierreMes, 465501904.65);
  assert.equal(mapped.calculados.cajaFinal, 13000000);
  assert.equal(mapped.calculados.proveedoresAVencerFinal, 117936716.9);
  assert.equal(mapped.calculados.totalDisponibilidades, 279892260.89);
  assert.equal(mapped.calculados.totalPasivos, 41648829.47);
  assert.equal(mapped.calculados.liquidezNeta, 238243431.42);
  assert.equal(mapped.calculados.compromisosProyectados, 235404126.77);
  assert.equal(mapped.calculados.cobranzasProyectadas, 221901644.22);
  assert.equal(mapped.calculados.diasCaja, 2.3010573526209597);
  assert.equal(mapped.guardadoEn, "2026-07-24T17:00:32.602Z");
  assert.equal(mapped.existeEnPostgres, true);
  assert.equal(Object.hasOwn(mapped, "periodoEtiqueta"), false);
  assert.equal(Object.hasOwn(mapped.manuales, "opvOtrosProyectadoSemana"), false);
});

test("cobranzasProyectadas usa la vista y luego ventas de semana anterior", () => {
  const fromView = mapRegistro({
    fecha_corte: "2026-07-16",
    cobranzas_proyectadas: "20",
    ventas_netas_semana_anterior: "10",
  });
  const fromPreviousWeek = mapRegistro({
    fecha_corte: "2026-07-23",
    cobranzas_proyectadas: null,
    ventas_netas_semana_anterior: "10",
  });
  assert.equal(fromView.calculados.cobranzasProyectadas, 20);
  assert.equal(fromPreviousWeek.calculados.cobranzasProyectadas, 10);
});

test("datos base faltantes producen calculados null sin alterar orígenes", () => {
  const mapped = mapRegistro({
    fecha_corte: "2026-07-16",
    caja: null,
    bancos: "0",
    valores: "0",
    fondos_fci: "0",
    proveedores: null,
    proveedores_a_vencer: "0",
  });
  assert.equal(mapped.automaticos.caja, null);
  assert.equal(mapped.manuales.bancos, 0);
  assert.equal(mapped.calculados.cajaFinal, null);
  assert.equal(mapped.calculados.totalDisponibilidades, null);
  assert.equal(mapped.calculados.totalPasivos, null);
  assert.equal(mapped.calculados.liquidezNeta, null);
  assert.equal(mapped.calculados.diasCaja, null);
});

test("diasCaja es null cuando el denominador es cero", () => {
  const mapped = mapRegistro({
    fecha_corte: "2026-07-16",
    caja: "0",
    bancos: "0",
    fondos_fci: "0",
    proveedores: "0",
    opv_otros: "0",
  });
  assert.equal(mapped.calculados.diasCaja, null);
});

test("todos los importes públicos son number o null y nunca guion", () => {
  const mapped = mapRegistro({
    fecha_corte: "2026-07-16",
    caja: "0",
    valores: "1",
    fondos_fci: "2",
    proveedores: "3",
    proveedores_a_vencer: "4",
    bancos: "5",
    opv_otros_proyectado_semana: "6",
  });
  for (const group of [
    mapped.automaticos,
    mapped.manuales,
    mapped.calculados,
  ]) {
    for (const [key, value] of Object.entries(group)) {
      if (key === "observacion") continue;
      assert.equal(value === null || typeof value === "number", true, key);
      assert.notEqual(value, "-");
    }
  }
});

test("nuevas escrituras usan sólo el código canónico proyectado", () => {
  assert.equal(
    MANUAL_INDICATORS.otrosPagosProyectados,
    "opv_otros_proyectado_semana",
  );
  assert.equal(
    Object.values(MANUAL_INDICATORS).includes("otros_proyectados_semana"),
    false,
  );
});

test("la migración registra y activa el indicador proyectado canónico", () => {
  const migration = readFileSync(
    new URL(
      "./scripts/ensure_opv_otros_proyectado_semana.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /'opv_otros_proyectado_semana'/);
  assert.match(migration, /ON CONFLICT \(codigo\) DO UPDATE/);
  assert.match(migration, /activo = true/);
});
