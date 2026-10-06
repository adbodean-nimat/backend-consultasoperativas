import wepPostgresPool from "./wep-postgres.js";
import { normalizeAvailablePhone } from "./wep-client-notice.repository.js";
import { normalizeStopText } from "./wep-stop.util.js";
import { PUBLIC_ID_PATTERN } from "./wep-tracking.service.js";
import { WepValidationError } from "./wep.validator.js";

export const LOOKUP_NOT_FOUND_MESSAGE = "No encontramos una entrega con los datos ingresados.";

export function validateTrackingLookupBody(body) {
  const rawPedido = body?.pedido;
  const pedido = typeof rawPedido === "string" ? rawPedido.trim()
    : Number.isSafeInteger(rawPedido) && rawPedido >= 0 ? String(rawPedido) : "";
  if (!/^\d{1,20}$/.test(pedido) || typeof body?.telefonoUltimos4 !== "string"
    || !/^\d{4}$/.test(body.telefonoUltimos4)) {
    throw new WepValidationError("Ingresá un número de pedido y los últimos 4 dígitos del teléfono válidos.");
  }
  return { pedido, telefonoUltimos4: body.telefonoUltimos4 };
}

export function auditTrackingLookup(request, resultado, logger = console) {
  const value = request.body?.pedido;
  // Nunca incluir valores arbitrarios del body ni los dígitos del teléfono.
  const pedido = typeof value === "string" || Number.isSafeInteger(value) ? String(value).trim() : "";
  logger.info("[WEP TRACKING LOOKUP]", {
    timestamp: new Date().toISOString(),
    pedido: /^\d{1,20}$/.test(pedido) ? pedido : null,
    resultado,
  });
}

export class WepTrackingLookupRepository {
  constructor({ postgresPool = wepPostgresPool } = {}) {
    this.postgresPool = postgresPool;
  }

  async findActiveCandidates(pedido) {
    const result = await this.postgresPool.query(
      `SELECT e.domicilio, e.localidad, e.telefono, e.telefono_alternativo,
              t.public_id, t.domicilio_normalizado, t.localidad_normalizada
       FROM public.entregas e
       INNER JOIN public.viajes v ON v.id = e.viaje_id
       INNER JOIN public.tracking_tokens t
         ON t.viaje_id = e.viaje_id AND t.cliente_codigo = e.cliente_codigo
       WHERE e.nota_pedido_numero::text = $1
         AND t.activo = TRUE AND t.expira_at > NOW()
         AND t.public_id IS NOT NULL
       ORDER BY t.created_at DESC, t.id DESC, e.id`,
      [pedido],
    );
    return result.rows;
  }
}

export class WepTrackingLookupService {
  constructor({ repository = new WepTrackingLookupRepository() } = {}) {
    this.repository = repository;
  }

  async lookup({ pedido, telefonoUltimos4 }) {
    const candidates = await this.repository.findActiveCandidates(pedido);
    const match = candidates.find((row) =>
      normalizeStopText(row.domicilio) === row.domicilio_normalizado
      && normalizeStopText(row.localidad) === row.localidad_normalizada
      && PUBLIC_ID_PATTERN.test(row.public_id)
      && normalizeAvailablePhone(row)?.slice(-4) === telefonoUltimos4,
    );
    return match ? { publicId: match.public_id } : null;
  }
}

export default new WepTrackingLookupService();
