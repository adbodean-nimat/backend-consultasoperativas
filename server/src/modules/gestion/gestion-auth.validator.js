import cron from "node-cron";
import { ValidationError } from "./gestion.errors.js";

const ROLE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const CONFIG_VALIDATORS = Object.freeze({
  cmv(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length === 2 &&
      keys.includes("porcentaje") && keys.includes("diasLaborales") &&
      typeof value.porcentaje === "number" && Number.isFinite(value.porcentaje) &&
      value.porcentaje >= 0 && value.porcentaje <= 100 &&
      typeof value.diasLaborales === "number" && Number.isFinite(value.diasLaborales) &&
      value.diasLaborales > 0 && value.diasLaborales <= 7;
  },
  gestion_sincronizacion_automatica(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    if (keys.length !== 3 ||
        !keys.includes("activo") || !keys.includes("cron") || !keys.includes("timezone") ||
        typeof value.activo !== "boolean" ||
        typeof value.cron !== "string" || !cron.validate(value.cron) ||
        typeof value.timezone !== "string" || !value.timezone.trim()) {
      return false;
    }
    try {
      new Intl.DateTimeFormat("es-AR", { timeZone: value.timezone }).format();
      return true;
    } catch {
      return false;
    }
  },
});

export function parsePositiveId(value) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
    throw new ValidationError([{ field: "id", message: "Debe ser un entero positivo" }]);
  }
  return Number(value);
}

export function validateStatusBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || typeof body.activo !== "boolean") {
    throw new ValidationError([{ field: "activo", message: "Debe ser boolean y el único campo" }]);
  }
  return body.activo;
}

export function validateRolesBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Array.isArray(body.roles)) {
    throw new ValidationError([{ field: "roles", message: "Debe ser un arreglo" }]);
  }
  const roles = [...new Set(body.roles)];
  if (roles.some((role) => typeof role !== "string" || !ROLE_PATTERN.test(role))) {
    throw new ValidationError([{ field: "roles", message: "Contiene códigos de rol inválidos" }]);
  }
  return roles;
}

export function validateCreateUserBody(body) {
  const validObject = body && typeof body === "object" && !Array.isArray(body);
  const keys = validObject ? Object.keys(body) : [];
  if (!validObject || keys.length !== 3 ||
      !keys.includes("username") || !keys.includes("activo") || !keys.includes("roles")) {
    throw new ValidationError([{ field: "body", message: "Debe contener username, activo y roles" }]);
  }
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  if (!USERNAME_PATTERN.test(username)) {
    throw new ValidationError([{ field: "username", message: "sAMAccountName inválido" }]);
  }
  if (typeof body.activo !== "boolean") {
    throw new ValidationError([{ field: "activo", message: "Debe ser boolean" }]);
  }
  const roles = validateRolesBody({ roles: body.roles });
  return { username, active: body.activo, roles };
}

export function validateConfiguration(key, body) {
  const validator = CONFIG_VALIDATORS[key];
  if (!validator) {
    throw new ValidationError([{ field: "clave", message: "Clave de configuración no permitida" }]);
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, "valor") || !validator(body.valor)) {
    throw new ValidationError([{ field: "valor", message: "Estructura inválida para la configuración" }]);
  }
  return body.valor;
}
