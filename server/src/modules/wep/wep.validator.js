import {
  WEP_NO_ENTREGA_MOTIVOS,
  WEP_NO_ENTREGA_OBSERVACION_MAX_LENGTH,
} from "./wep-non-delivery.constants.js";
import { normalizeWepWhatsappPhone } from "./wep-phone.util.js";

const DATE_ERROR_MESSAGE =
  "Los parámetros fechaDesde y fechaHasta son obligatorios y deben tener formato YYYY-MM-DD";

export class WepValidationError extends Error {}

export function validatePositiveIntegerId(value, fieldName) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new WepValidationError(
      `El ${fieldName} debe ser un número entero válido`,
    );
  }

  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new WepValidationError(
      `El ${fieldName} debe ser un número entero válido`,
    );
  }

  return id;
}

export function validateWepPin(pin) {
  if (typeof pin !== "string" || !/^\d{4,8}$/.test(pin)) {
    throw new WepValidationError("El PIN debe tener entre 4 y 8 dígitos");
  }

  return pin;
}

export function validateWepPinBody(body) {
  return validateWepPin(body?.pin);
}

export function validateWepLoginBody(body) {
  const vehiculoId = body?.vehiculoId;
  if (!Number.isSafeInteger(vehiculoId) || vehiculoId <= 0) {
    throw new WepValidationError(
      "El vehiculoId debe ser un número entero positivo",
    );
  }

  return {
    vehiculoId,
    pin: validateWepPin(body?.pin),
  };
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateEntregasProgramadasQuery(query) {
  const { fechaDesde, fechaHasta } = query;

  if (
    !isValidDate(fechaDesde) ||
    !isValidDate(fechaHasta) ||
    fechaDesde > fechaHasta
  ) {
    throw new WepValidationError(DATE_ERROR_MESSAGE);
  }

  let vuelta = null;
  if (query.vuelta !== undefined) {
    if (
      typeof query.vuelta !== "string" ||
      !/^-?\d+$/.test(query.vuelta)
    ) {
      throw new WepValidationError(
        "El parámetro vuelta debe ser un número entero válido",
      );
    }

    vuelta = Number(query.vuelta);
    if (!Number.isSafeInteger(vuelta)) {
      throw new WepValidationError(
        "El parámetro vuelta debe ser un número entero válido",
      );
    }
  }

  const vehiculo =
    typeof query.vehiculo === "string" && query.vehiculo.trim()
      ? query.vehiculo.trim()
      : null;

  return { fechaDesde, fechaHasta, vehiculo, vuelta };
}

export function validateEntregasProgramadasBody(body) {
  const payload = body && typeof body === "object" ? body : {};
  const { fechaDesde, fechaHasta } = payload;

  if (
    !isValidDate(fechaDesde) ||
    !isValidDate(fechaHasta) ||
    fechaDesde > fechaHasta
  ) {
    throw new WepValidationError(DATE_ERROR_MESSAGE);
  }

  let vuelta = null;
  if (payload.vuelta !== undefined && payload.vuelta !== null) {
    if (
      (typeof payload.vuelta !== "number" &&
        typeof payload.vuelta !== "string") ||
      !/^-?\d+$/.test(String(payload.vuelta))
    ) {
      throw new WepValidationError(
        "El parámetro vuelta debe ser un número entero válido",
      );
    }

    vuelta = Number(payload.vuelta);
    if (!Number.isSafeInteger(vuelta)) {
      throw new WepValidationError(
        "El parámetro vuelta debe ser un número entero válido",
      );
    }
  }

  const vehiculo =
    typeof payload.vehiculo === "string" && payload.vehiculo.trim()
      ? payload.vehiculo.trim()
      : null;

  return { fechaDesde, fechaHasta, vehiculo, vuelta };
}

export function validateProgrammedNotificationsBody(body) {
  const payload =
    body && typeof body === "object" && !Array.isArray(body) ? body : {};

  let fecha = null;
  if (payload.fecha !== undefined && payload.fecha !== null && payload.fecha !== "") {
    if (!isValidDate(payload.fecha)) {
      throw new WepValidationError(
        "El campo fecha debe tener formato YYYY-MM-DD",
      );
    }
    fecha = payload.fecha;
  }

  if (payload.dryRun !== undefined && typeof payload.dryRun !== "boolean") {
    throw new WepValidationError("El campo dryRun debe ser booleano");
  }

  return {
    fecha,
    // El default seguro del endpoint manual es validar sin enviar.
    dryRun: payload.dryRun ?? true,
  };
}

export function validateProgrammedNotificationTestBody(body) {
  const payload =
    body && typeof body === "object" && !Array.isArray(body) ? body : {};

  if (
    !Number.isSafeInteger(payload.entregaRepresentativaId) ||
    payload.entregaRepresentativaId <= 0
  ) {
    throw new WepValidationError(
      "El campo entregaRepresentativaId es obligatorio y debe ser un entero positivo",
    );
  }
  if (typeof payload.telefono !== "string" || !payload.telefono.trim()) {
    throw new WepValidationError(
      "El campo telefono es obligatorio y debe ser un string",
    );
  }

  const telefono = normalizeWepWhatsappPhone(payload.telefono);
  if (!telefono) {
    throw new WepValidationError("El campo telefono no es un número válido para WhatsApp");
  }

  return {
    entregaRepresentativaId: payload.entregaRepresentativaId,
    telefono,
  };
}

export function validatePwaViajesQuery(query) {
  const fecha = query?.fecha;

  if (fecha === undefined || fecha === null || fecha === "") {
    throw new WepValidationError("El parámetro fecha es obligatorio");
  }

  if (!isValidDate(fecha)) {
    throw new WepValidationError(
      "El parámetro fecha debe tener formato YYYY-MM-DD",
    );
  }

  const vehiculo =
    typeof query?.vehiculo === "string" && query.vehiculo.trim()
      ? query.vehiculo.trim()
      : null;

  return { fecha, vehiculo };
}

export function validatePwaEntregaId(value) {
  return validatePositiveIntegerId(value, "id de entrega");
}

export function validatePwaNoEntregadoBody(body) {
  const payload =
    body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const motivo =
    typeof payload.motivo === "string" ? payload.motivo.trim() : "";

  if (!WEP_NO_ENTREGA_MOTIVOS.includes(motivo)) {
    throw new WepValidationError("El motivo de no entrega no es válido");
  }

  let observacion = null;
  if (payload.observacion !== undefined) {
    if (typeof payload.observacion !== "string") {
      throw new WepValidationError("La observación debe ser un texto");
    }

    observacion = payload.observacion.trim() || null;
    if (
      observacion &&
      observacion.length > WEP_NO_ENTREGA_OBSERVACION_MAX_LENGTH
    ) {
      throw new WepValidationError(
        `La observación no puede superar los ${WEP_NO_ENTREGA_OBSERVACION_MAX_LENGTH} caracteres`,
      );
    }
  }

  if (motivo === "OTRO" && !observacion) {
    throw new WepValidationError(
      "Debe indicar una observación para el motivo OTRO",
    );
  }

  return { motivo, observacion };
}

export function validatePwaViajeId(value) {
  return validatePositiveIntegerId(value, "id de viaje");
}

export function validatePwaStopGroupId(value) {
  if (typeof value !== "string" || !/^stop_[a-f0-9]{12}$/.test(value)) {
    throw new WepValidationError("El grupoId de parada no es válido");
  }

  return value;
}

export function validatePwaOrdenBody(body) {
  if (!Array.isArray(body?.entregas) || body.entregas.length === 0) {
    throw new WepValidationError(
      "El campo entregas es obligatorio y debe contener al menos un elemento",
    );
  }

  const ids = new Set();
  const ordenes = new Set();
  const entregas = body.entregas.map((entrega) => {
    if (
      !entrega ||
      typeof entrega !== "object" ||
      Array.isArray(entrega) ||
      !Number.isSafeInteger(entrega.id) ||
      entrega.id <= 0
    ) {
      throw new WepValidationError(
        "Cada entrega debe tener un id entero positivo",
      );
    }

    if (!Number.isSafeInteger(entrega.orden) || entrega.orden <= 0) {
      throw new WepValidationError(
        "Cada entrega debe tener un orden entero positivo",
      );
    }

    if (ids.has(entrega.id)) {
      throw new WepValidationError("No se pueden repetir ids de entregas");
    }

    if (ordenes.has(entrega.orden)) {
      throw new WepValidationError("No se pueden repetir valores de orden");
    }

    ids.add(entrega.id);
    ordenes.add(entrega.orden);
    return { id: entrega.id, orden: entrega.orden };
  });

  return { entregas };
}
