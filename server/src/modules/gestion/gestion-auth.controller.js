import * as service from "./gestion-auth.service.js";
import {
  parsePositiveId,
  validateCreateUserBody,
  validateConfiguration,
  validateRolesBody,
  validateStatusBody,
} from "./gestion-auth.validator.js";

function actor(req) {
  return {
    userId: req.auth.userId,
    username: req.auth.username,
    ip: req.ip ?? null,
  };
}

export async function me(req, res, next) {
  try {
    const user = await service.getMe(req.auth.username);
    return res.json({
      ok: true,
      data: { user, roles: user.roles, permissions: user.permissions, iat: req.auth.iat, exp: req.auth.exp },
    });
  } catch (error) { return next(error); }
}

export async function configuration(req, res, next) {
  try { return res.json({ ok: true, data: await service.getConfiguration() }); }
  catch (error) { return next(error); }
}

export async function updateConfiguration(req, res, next) {
  try {
    const value = validateConfiguration(req.params.clave, req.body);
    return res.json({ ok: true, data: await service.setConfiguration(req.params.clave, value, actor(req)) });
  } catch (error) { return next(error); }
}

export async function users(req, res, next) {
  try { return res.json({ ok: true, data: await service.getUsers() }); }
  catch (error) { return next(error); }
}

export async function createUser(req, res, next) {
  try {
    const input = validateCreateUserBody(req.body);
    const user = await service.createOrSyncUser(input, actor(req));
    return res.status(201).json({ ok: true, data: user });
  } catch (error) { return next(error); }
}

export async function roles(req, res, next) {
  try { return res.json({ ok: true, data: await service.getRoles() }); }
  catch (error) { return next(error); }
}

export async function updateUserStatus(req, res, next) {
  try {
    const id = parsePositiveId(req.params.id);
    const active = validateStatusBody(req.body);
    return res.json({ ok: true, data: await service.setUserStatus(id, active, actor(req)) });
  } catch (error) { return next(error); }
}

export async function updateUserRoles(req, res, next) {
  try {
    const id = parsePositiveId(req.params.id);
    const roleCodes = validateRolesBody(req.body);
    return res.json({ ok: true, data: await service.setUserRoles(id, roleCodes, actor(req)) });
  } catch (error) { return next(error); }
}
