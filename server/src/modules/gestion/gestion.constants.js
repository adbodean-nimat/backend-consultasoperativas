export const ESTADOS_GESTION = new Set([
  "BORRADOR",
  "SINCRONIZADO",
  "GUARDADO",
  "ERROR",
]);

export const AUTOMATIC_INDICATORS = Object.freeze({
  caja: "caja",
  valores: "valores",
  fondosFci: "fondos_fci",
  proveedores: "proveedores",
  otrosOpv: "opv_otros",
  proveedoresAVencer: "proveedores_a_vencer",
  cobranzas: "cobranzas",
  ventasNetas: "ventas_netas",
  stockCostoReposicion: "stock_costo_reposicion",
  acopioCierreMes: "acopio_cierre_mes",
  acopioMesActual: "acopio_mes_actual",
  cuentaCorrienteClientes: "cuenta_corriente_clientes",
  diasCaja: "dias_caja",
});

export const MANUAL_INDICATORS = Object.freeze({
  ajusteCaja: "ajuste_caja",
  bancos: "bancos",
  bancosDescubierto: "bancos_descubierto",
  opvOtros: "opv_otros",
  otrosPagosProyectados: "opv_otros_proyectado_semana",
  anticipos: "anticipos",
  acopiosEspeciales: "acopios_especiales",
  acopioCierreMes: "acopio_cierre_mes",
  ajusteProveedoresAVencer: "ajuste_proveedores_a_vencer",
});

export const NON_NEGATIVE_MANUAL_INDICATORS = new Set([
  "bancos",
  "bancosDescubierto",
  "opvOtros",
  "otrosPagosProyectados",
  "anticipos",
  "acopiosEspeciales",
  "acopioCierreMes",
]);

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
