import { WepValidationError } from "./wep.validator.js";

const QR_PREFIX = "WEP";

export function normalizeNumericQrSegment(value) {
  if (!/^\d+$/.test(value)) return value;
  return value.replace(/^0+(?=\d)/, "");
}

export function parseWepQr(body) {
  if (typeof body?.qr !== "string") {
    throw new WepValidationError("El código QR es obligatorio");
  }

  const value = body.qr.trim();
  if (!value) {
    throw new WepValidationError("El código QR es obligatorio");
  }

  const parts = value.split("|");
  if (parts.length !== 4) {
    throw new WepValidationError("El código QR tiene un formato inválido");
  }

  const [rawPrefix, rawDivision, rawTipo, rawPedido] = parts;
  const prefix = rawPrefix.trim().toUpperCase();
  if (prefix !== QR_PREFIX) {
    throw new WepValidationError("El código QR no corresponde a WEP");
  }

  const division = rawDivision.trim();
  const tipo = rawTipo.trim().toUpperCase();
  const pedido = rawPedido.trim();
  if (!division || !tipo || !pedido) {
    throw new WepValidationError("El código QR tiene un formato inválido");
  }

  return { division, tipo, pedido };
}
