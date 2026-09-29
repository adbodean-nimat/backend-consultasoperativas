import { createHash } from "node:crypto";

const STOP_STATE_NAMES = {
  ENTREGADA: "Entregada",
  NO_ENTREGADA: "No entregada",
  CANCELADA: "Cancelada",
  CERRADA_PARCIAL: "Cerrada parcialmente",
  CLIENTE_AVISADO: "Cliente avisado",
  EN_REPARTO: "En reparto",
  ASIGNADA: "Asignada",
  PROGRAMADA: "Programada",
};

const TERMINAL_STOP_STATES = new Set([
  "ENTREGADA",
  "NO_ENTREGADA",
  "CANCELADA",
]);

export function normalizeStopText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toUpperCase().replace(/\s+/g, " ");
}

export function createStopGroupId({
  viajeId,
  clienteCodigo,
  domicilio,
  localidad,
}) {
  const stopKey = JSON.stringify([
    String(viajeId ?? ""),
    String(clienteCodigo ?? ""),
    normalizeStopText(domicilio),
    normalizeStopText(localidad),
  ]);
  const digest = createHash("sha256").update(stopKey).digest("hex");
  return `stop_${digest.slice(0, 12)}`;
}

export function deriveStopState(entregas) {
  const states = entregas.map((entrega) =>
    entrega.estado?.codigo ?? entrega.estadoCodigo ?? entrega.estado_codigo,
  );
  let codigo = "PROGRAMADA";

  if (states.length > 0 && states.every((state) => state === "ENTREGADA")) {
    codigo = "ENTREGADA";
  } else if (
    states.length > 0 &&
    states.every((state) => state === "NO_ENTREGADA")
  ) {
    codigo = "NO_ENTREGADA";
  } else if (
    states.length > 0 &&
    states.every((state) => state === "CANCELADA")
  ) {
    codigo = "CANCELADA";
  } else if (
    states.length > 0 &&
    states.every((state) => TERMINAL_STOP_STATES.has(state))
  ) {
    codigo = "CERRADA_PARCIAL";
  } else if (states.includes("CLIENTE_AVISADO")) {
    codigo = "CLIENTE_AVISADO";
  } else if (states.includes("EN_REPARTO")) {
    codigo = "EN_REPARTO";
  } else if (states.includes("ASIGNADA")) {
    codigo = "ASIGNADA";
  }

  return { codigo, nombre: STOP_STATE_NAMES[codigo] };
}
