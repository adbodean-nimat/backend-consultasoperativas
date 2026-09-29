import { GestionError } from "./gestion.errors.js";
import {
  assignBootstrapAdmin,
  authPool,
  countOtherActiveAdmins,
  findConfigurationForUpdate,
  findUserAccess,
  findUserByIdForUpdate,
  findUserByUsernameForUpdate,
  getRoleCodesForUser,
  insertAudit,
  listConfiguration,
  listRoles,
  listUsers,
  normalizeSam,
  replaceUserRoles,
  syncAdUser,
  syncManagedAdUser,
  updateConfiguration,
} from "./gestion-auth.repository.js";
import { findAdUser } from "./gestion-directory.service.js";

function notFound(message) {
  return new GestionError(message, { status: 404, code: "GESTION_AUTH_NOT_FOUND" });
}

function conflict(message, code = "GESTION_AUTH_CONFLICT") {
  return new GestionError(message, { status: 409, code });
}

function publicUser(user) {
  return {
    id: Number(user.id),
    username: user.sam_account_name,
    name: user.nombre,
    displayName: user.nombre_visible,
    mail: user.email,
    active: user.activo,
    lastLoginAt: user.ultimo_ingreso_en,
    roles: user.roles ?? [],
    permissions: user.permissions ?? [],
  };
}

export async function authorizeAdLogin(profile, { ip = null, dependencies = {} } = {}) {
  const deps = {
    pool: authPool,
    syncAdUser,
    assignBootstrapAdmin,
    findUserAccess,
    ...dependencies,
  };
  const username = normalizeSam(profile?.sAMAccountName);
  if (!username) {
    throw new GestionError("Active Directory no devolvió sAMAccountName", {
      status: 400,
      code: "GESTION_USERNAME_UNAVAILABLE",
    });
  }

  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    const synchronized = await deps.syncAdUser(client, profile);
    if (!synchronized.user) throw new Error("No se pudo sincronizar el usuario");

    const bootstrap = normalizeSam(process.env.GESTION_BOOTSTRAP_ADMIN);
    if (bootstrap && bootstrap === username) {
      await deps.assignBootstrapAdmin(client, synchronized.user.id, username, ip);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const access = await deps.findUserAccess(deps.pool, username);
  if (!access?.activo || !access.permissions.includes("gestion.ingresar")) {
    throw new GestionError(
      "Tu usuario no está habilitado para ingresar al tablero de Gestión Financiera.",
      { status: 403, code: "GESTION_ACCESS_DENIED" },
    );
  }
  return publicUser(access);
}

export async function getMe(username) {
  const access = await findUserAccess(authPool, username);
  if (!access) throw notFound("El usuario autenticado no está registrado");
  return publicUser(access);
}

export async function getUsers() {
  return (await listUsers(authPool)).map(publicUser);
}

export async function createOrSyncUser(input, actor, dependencies = {}) {
  const deps = {
    pool: authPool,
    findAdUser,
    findUserAccess,
    findUserByUsernameForUpdate,
    getRoleCodesForUser,
    countOtherActiveAdmins,
    syncManagedAdUser,
    replaceUserRoles,
    insertAudit,
    ...dependencies,
  };
  const profile = await deps.findAdUser(input.username);
  if (!profile) {
    throw new GestionError("El usuario no existe en Active Directory", {
      status: 404,
      code: "GESTION_AD_USER_NOT_FOUND",
    });
  }

  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    const previous = await deps.findUserByUsernameForUpdate(client, input.username);
    const previousRoles = previous
      ? await deps.getRoleCodesForUser(client, previous.id)
      : [];
    if (previous?.activo && previousRoles.includes("ADMIN_GESTION") &&
        (!input.active || !input.roles.includes("ADMIN_GESTION")) &&
        await deps.countOtherActiveAdmins(client, previous.id) === 0) {
      throw conflict(
        "No se puede modificar el último administrador activo",
        "GESTION_LAST_ADMIN_REQUIRED",
      );
    }
    const synchronized = await deps.syncManagedAdUser(client, profile, input.active);
    if (!synchronized.user) throw new Error("No se pudo sincronizar el usuario");
    const assigned = await deps.replaceUserRoles(
      client,
      synchronized.user.id,
      input.roles,
      actor.userId,
    );
    if (!assigned) {
      throw new GestionError("Uno o más roles no existen", {
        status: 400,
        code: "GESTION_INVALID_ROLES",
        errors: [{ field: "roles", message: "Contiene roles inexistentes" }],
      });
    }
    const current = await deps.findUserAccess(client, input.username);
    await deps.insertAudit(client, {
      actorUserId: actor.userId,
      actorSam: actor.username,
      action: synchronized.created ? "CREAR_USUARIO" : "SINCRONIZAR_USUARIO",
      entity: "gf_usuarios",
      entityId: String(synchronized.user.id),
      previousValue: previous ? {
        activo: previous.activo,
        roles: previousRoles,
      } : null,
      newValue: { activo: input.active, roles: assigned },
      ip: actor.ip,
    });
    await client.query("COMMIT");
    return publicUser({ ...current, roles: assigned });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getRoles() {
  return (await listRoles(authPool)).map((role) => ({
    id: Number(role.id),
    code: role.codigo,
    name: role.nombre,
    description: role.descripcion,
    system: role.es_sistema,
    permissions: role.permissions,
  }));
}

export async function getConfiguration() {
  return listConfiguration(authPool);
}

export async function setUserStatus(id, active, actor, dependencies = {}) {
  const deps = { pool: authPool, findUserByIdForUpdate, getRoleCodesForUser,
    countOtherActiveAdmins, insertAudit, ...dependencies };
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    const target = await deps.findUserByIdForUpdate(client, id);
    if (!target) throw notFound("El usuario no existe");
    const roles = await deps.getRoleCodesForUser(client, id);
    if (!active && target.activo && roles.includes("ADMIN_GESTION") &&
        await deps.countOtherActiveAdmins(client, id) === 0) {
      throw conflict(
        "No se puede desactivar el último administrador activo",
        "GESTION_LAST_ADMIN_REQUIRED",
      );
    }
    const updated = await client.query(
      `UPDATE gf_usuarios SET activo = $2 WHERE id = $1 RETURNING *`,
      [id, active],
    );
    await deps.insertAudit(client, {
      actorUserId: actor.userId,
      actorSam: actor.username,
      action: "CAMBIAR_ESTADO_USUARIO",
      entity: "gf_usuarios",
      entityId: String(id),
      previousValue: { activo: target.activo },
      newValue: { activo: active },
      ip: actor.ip,
    });
    await client.query("COMMIT");
    return publicUser({ ...updated.rows[0], roles, permissions: [] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setUserRoles(id, roleCodes, actor, dependencies = {}) {
  const deps = { pool: authPool, findUserByIdForUpdate, getRoleCodesForUser,
    countOtherActiveAdmins, replaceUserRoles, insertAudit, ...dependencies };
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    const target = await deps.findUserByIdForUpdate(client, id);
    if (!target) throw notFound("El usuario no existe");
    const previousRoles = await deps.getRoleCodesForUser(client, id);
    if (target.activo && previousRoles.includes("ADMIN_GESTION") &&
        !roleCodes.includes("ADMIN_GESTION") &&
        await deps.countOtherActiveAdmins(client, id) === 0) {
      throw conflict(
        "No se puede quitar el último rol administrativo activo",
        "GESTION_LAST_ADMIN_REQUIRED",
      );
    }
    const assigned = await deps.replaceUserRoles(client, id, roleCodes, actor.userId);
    if (!assigned) throw notFound("Uno o más roles no existen");
    await deps.insertAudit(client, {
      actorUserId: actor.userId,
      actorSam: actor.username,
      action: "ASIGNAR_ROLES",
      entity: "gf_usuario_roles",
      entityId: String(id),
      previousValue: { roles: previousRoles },
      newValue: { roles: assigned },
      ip: actor.ip,
    });
    await client.query("COMMIT");
    return { userId: id, roles: assigned };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setConfiguration(key, value, actor, dependencies = {}) {
  const deps = { pool: authPool, findConfigurationForUpdate,
    updateConfiguration, insertAudit, ...dependencies };
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    const current = await deps.findConfigurationForUpdate(client, key);
    if (!current) throw notFound("La configuración no existe");
    const updated = await deps.updateConfiguration(client, key, value, actor.userId);
    await deps.insertAudit(client, {
      actorUserId: actor.userId,
      actorSam: actor.username,
      action: "ACTUALIZAR_CONFIGURACION",
      entity: "gf_configuracion_general",
      entityId: key,
      previousValue: { valor: current.valor },
      newValue: { valor: updated.valor },
      ip: actor.ip,
    });
    await client.query("COMMIT");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
