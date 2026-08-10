export function normalizeNumeric(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) {
    return value;
  }
  const trimmed = value.trim();
  const significantDigits = trimmed
    .replace(/^[+-]/, "")
    .replace(".", "")
    .replace(/^0+/, "")
    .replace(/0+$/, "").length;
  if (significantDigits > 15) return value;
  const normalized = Number(trimmed);
  return Number.isFinite(normalized) ? normalized : value;
}

function toNullableNumber(value) {
  const normalized = normalizeNumeric(value);
  if (normalized === null || normalized === undefined) return null;
  if (typeof normalized === "number") {
    return Number.isFinite(normalized) ? normalized : null;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function toDateOnly(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIso(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export function mapAutomaticosPlataforma(row) {
  return {
    fecha: toDateOnly(row.fecha),
    semana: row.semana ?? null,
    caja: toNullableNumber(row.caja),
    valores: toNullableNumber(row.valores),
    fondosFci: toNullableNumber(row.fondos_fci),
    proveedores: toNullableNumber(row.proveedores),
    proveedoresAVencer: toNullableNumber(row.proveedores_a_vencer),
    cobranzas: toNullableNumber(row.cobranzas),
    ventasNetas: toNullableNumber(row.ventas_netas),
    stockCostoReposicion: toNullableNumber(row.stock_costo_reposicion),
    acopioCierreMes: toNullableNumber(row.acopio_cierre_mes),
    acopioMesActual: toNullableNumber(row.acopio_mes_actual),
    cuentaCorrienteClientes: toNullableNumber(row.cuenta_corriente_clientes),
    diasCaja: toNullableNumber(row.dias_caja),
    sincronizadoEn: new Date().toISOString(),
  };
}

function roundAmount(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addRequired(requiredValues, optionalValues = []) {
  if (requiredValues.some((value) => value === null)) return null;
  return roundAmount(
    [...requiredValues, ...optionalValues].reduce(
      (total, value) => total + (value ?? 0),
      0,
    ),
  );
}

function subtractOptional(base, value) {
  return base === null ? null : roundAmount(base - (value ?? 0));
}

function calculateDiasCaja({
  cajaFinal,
  bancos,
  fondosFci,
  proveedores,
  opvOtros,
}) {
  const requiredValues = [
    cajaFinal,
    bancos,
    fondosFci,
    proveedores,
    opvOtros,
  ];
  if (requiredValues.some((value) => value === null)) return null;

  const denominator = proveedores + opvOtros;
  if (denominator === 0) return null;

  const result = (cajaFinal + bancos + fondosFci) / denominator;
  return Number.isFinite(result) ? result : null;
}

export function mapRegistro(row) {
  if (!row) return null;

  const automaticos = {
    caja: toNullableNumber(row.caja),
    valores: toNullableNumber(row.valores),
    fondosFci: toNullableNumber(row.fondos_fci),
    proveedores: toNullableNumber(row.proveedores),
    proveedoresAVencer: toNullableNumber(row.proveedores_a_vencer),
    cobranzas: toNullableNumber(row.cobranzas),
    ventasNetas: toNullableNumber(row.ventas_netas),
    stockCostoReposicion: toNullableNumber(row.stock_costo_reposicion),
    acopioCierreMes: toNullableNumber(row.acopio_cierre_mes),
    acopioMesActual: toNullableNumber(row.acopio_mes_actual),
    cuentaCorrienteClientes: toNullableNumber(row.cuenta_corriente_clientes),
    diasCaja: toNullableNumber(row.dias_caja),
  };
  const manuales = {
    ajusteCaja: toNullableNumber(row.ajuste_caja),
    bancos: toNullableNumber(row.bancos),
    bancosDescubierto: toNullableNumber(row.bancos_descubierto),
    opvOtros: toNullableNumber(row.opv_otros),
    otrosActual: null,
    otrosPagosProyectados: toNullableNumber(row.opv_otros_proyectado_semana),
    anticipos: toNullableNumber(row.anticipos),
    acopiosEspeciales: toNullableNumber(row.acopios_especiales),
    ajusteProveedoresAVencer: toNullableNumber(
      row.ajuste_proveedores_a_vencer,
    ),
    observacion: row.observacion ?? null,
  };

  const cajaFinal =
    automaticos.caja === null
      ? null
      : roundAmount(automaticos.caja + (manuales.ajusteCaja ?? 0));
  const proveedoresAVencerFinal =
    automaticos.proveedoresAVencer === null
      ? null
      : roundAmount(
          automaticos.proveedoresAVencer +
            (manuales.ajusteProveedoresAVencer ?? 0),
        );
  const disponibilidadesAntesDescubierto = addRequired(
    [
      cajaFinal,
      manuales.bancos,
      automaticos.valores,
      automaticos.fondosFci,
    ],
  );
  const totalDisponibilidades = subtractOptional(
    disponibilidadesAntesDescubierto,
    manuales.bancosDescubierto,
  );
  const totalPasivos = addRequired(
    [automaticos.proveedores, manuales.opvOtros],
  );
  const liquidezNeta =
    totalDisponibilidades === null || totalPasivos === null
      ? null
      : roundAmount(totalDisponibilidades - totalPasivos);
  const compromisosProyectados =
    proveedoresAVencerFinal === null ||
    manuales.otrosPagosProyectados === null
      ? null
      : roundAmount(
          proveedoresAVencerFinal + manuales.otrosPagosProyectados,
        );
  const cobranzasProyectadas = toNullableNumber(
    row.cobranzas_proyectadas ?? row.ventas_netas_semana_anterior,
  );
  const diasCaja = calculateDiasCaja({
    cajaFinal,
    bancos: manuales.bancos,
    fondosFci: automaticos.fondosFci,
    proveedores: automaticos.proveedores,
    opvOtros: manuales.opvOtros,
  });

  return {
    id: toNullableNumber(row.registro_id),
    fecha: toDateOnly(row.fecha_corte),
    semana: row.periodo_etiqueta ?? null,
    estado: row.estado ?? null,
    automaticos,
    manuales,
    calculados: {
      cajaFinal,
      proveedoresAVencerFinal,
      totalDisponibilidades,
      totalPasivos,
      liquidezNeta,
      compromisosProyectados,
      cobranzasProyectadas,
      diasCaja,
    },
    sincronizadoEn: toIso(row.fecha_sincronizacion_plataforma),
    guardadoEn: toIso(row.actualizado_en ?? row.creado_en),
    existeEnPostgres: true,
  };
}
