import { pool } from "./dboperacion_pg.js";

export { pool as authPool };

export function normalizeSam(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function syncAdUser(client, profile) {
  const username = normalizeSam(profile.sAMAccountName);
  const result = await client.query(
    `INSERT INTO gf_usuarios (
       sam_account_name, nombre, nombre_visible, email, activo, ultimo_ingreso_en
     )
     VALUES ($1, $2, $3, $4, FALSE, CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      username,
      profile.name ?? null,
      profile.displayName ?? null,
      profile.mail ?? null,
    ],
  );

  if (result.rowCount) return { user: result.rows[0], created: true };

  const updated = await client.query(
    `UPDATE gf_usuarios
     SET nombre = $2,
         nombre_visible = $3,
         email = $4,
         ultimo_ingreso_en = CURRENT_TIMESTAMP
     WHERE lower(sam_account_name) = $1
     RETURNING *`,
    [
      username,
      profile.name ?? null,
      profile.displayName ?? null,
      profile.mail ?? null,
    ],
  );
  return { user: updated.rows[0] ?? null, created: false };
}

export async function findUserAccess(executor, username) {
  const result = await executor.query(
    `SELECT
       u.id, u.sam_account_name, u.nombre, u.nombre_visible, u.email,
       u.activo, u.ultimo_ingreso_en, u.creado_en, u.actualizado_en,
       COALESCE(
         array_agg(DISTINCT r.codigo ORDER BY r.codigo)
           FILTER (WHERE r.codigo IS NOT NULL),
         ARRAY[]::varchar[]
       ) AS roles,
       COALESCE(
         array_agg(DISTINCT p.codigo ORDER BY p.codigo)
           FILTER (WHERE p.codigo IS NOT NULL),
         ARRAY[]::varchar[]
       ) AS permissions
     FROM gf_usuarios u
     LEFT JOIN gf_usuario_roles ur ON ur.usuario_id = u.id
     LEFT JOIN gf_roles r ON r.id = ur.rol_id
     LEFT JOIN gf_rol_permisos rp ON rp.rol_id = r.id
     LEFT JOIN gf_permisos p ON p.id = rp.permiso_id
     WHERE lower(u.sam_account_name) = $1
     GROUP BY u.id`,
    [normalizeSam(username)],
  );
  return result.rows[0] ?? null;
}

export async function assignBootstrapAdmin(client, userId, username, ip) {
  const role = await client.query(
    `SELECT id FROM gf_roles WHERE codigo = 'ADMIN_GESTION'`,
  );
  if (!role.rowCount) throw new Error("ADMIN_GESTION no existe");

  const activation = await client.query(
    `UPDATE gf_usuarios SET activo = TRUE WHERE id = $1 AND activo = FALSE RETURNING id`,
    [userId],
  );
  const assignment = await client.query(
    `INSERT INTO gf_usuario_roles (usuario_id, rol_id, asignado_por)
     VALUES ($1, $2, $1)
     ON CONFLICT DO NOTHING
     RETURNING usuario_id`,
    [userId, role.rows[0].id],
  );

  if (activation.rowCount || assignment.rowCount) {
    await insertAudit(client, {
      actorUserId: userId,
      actorSam: username,
      action: "BOOTSTRAP_ADMIN",
      entity: "gf_usuarios",
      entityId: String(userId),
      previousValue: null,
      newValue: { activo: true, rol: "ADMIN_GESTION" },
      ip,
    });
  }
}

export async function listUsers(executor) {
  const result = await executor.query(
    `SELECT
       u.id, u.sam_account_name, u.nombre, u.nombre_visible, u.email,
       u.activo, u.ultimo_ingreso_en, u.creado_en, u.actualizado_en,
       COALESCE(
         array_agg(DISTINCT r.codigo ORDER BY r.codigo)
           FILTER (WHERE r.codigo IS NOT NULL),
         ARRAY[]::varchar[]
       ) AS roles
     FROM gf_usuarios u
     LEFT JOIN gf_usuario_roles ur ON ur.usuario_id = u.id
     LEFT JOIN gf_roles r ON r.id = ur.rol_id
     GROUP BY u.id
     ORDER BY u.sam_account_name`,
  );
  return result.rows;
}

export async function listRoles(executor) {
  const result = await executor.query(
    `SELECT r.id, r.codigo, r.nombre, r.descripcion, r.es_sistema,
       COALESCE(
         array_agg(DISTINCT p.codigo ORDER BY p.codigo)
           FILTER (WHERE p.codigo IS NOT NULL),
         ARRAY[]::varchar[]
       ) AS permissions
     FROM gf_roles r
     LEFT JOIN gf_rol_permisos rp ON rp.rol_id = r.id
     LEFT JOIN gf_permisos p ON p.id = rp.permiso_id
     GROUP BY r.id
     ORDER BY r.codigo`,
  );
  return result.rows;
}

export async function findUserByIdForUpdate(client, id) {
  const result = await client.query(
    `SELECT * FROM gf_usuarios WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function getRoleCodesForUser(executor, userId) {
  const result = await executor.query(
    `SELECT r.codigo
     FROM gf_usuario_roles ur
     JOIN gf_roles r ON r.id = ur.rol_id
     WHERE ur.usuario_id = $1
     ORDER BY r.codigo`,
    [userId],
  );
  return result.rows.map((row) => row.codigo);
}

export async function countOtherActiveAdmins(executor, excludedUserId) {
  const result = await executor.query(
    `SELECT COUNT(DISTINCT u.id)::int AS total
     FROM gf_usuarios u
     JOIN gf_usuario_roles ur ON ur.usuario_id = u.id
     JOIN gf_roles r ON r.id = ur.rol_id
     WHERE u.activo = TRUE
       AND r.codigo = 'ADMIN_GESTION'
       AND u.id <> $1`,
    [excludedUserId],
  );
  return result.rows[0].total;
}

export async function replaceUserRoles(client, userId, roleCodes, actorUserId) {
  const roles = await client.query(
    `SELECT id, codigo FROM gf_roles WHERE codigo = ANY($1::varchar[]) ORDER BY codigo`,
    [roleCodes],
  );
  if (roles.rowCount !== roleCodes.length) return null;

  await client.query(`DELETE FROM gf_usuario_roles WHERE usuario_id = $1`, [
    userId,
  ]);
  for (const role of roles.rows) {
    await client.query(
      `INSERT INTO gf_usuario_roles (usuario_id, rol_id, asignado_por)
       VALUES ($1, $2, $3)`,
      [userId, role.id, actorUserId],
    );
  }
  return roles.rows.map((role) => role.codigo);
}

export async function listConfiguration(executor) {
  const result = await executor.query(
    `SELECT clave, valor, descripcion, actualizado_por, actualizado_en
     FROM gf_configuracion_general ORDER BY clave`,
  );
  return result.rows;
}

export async function findConfigurationForUpdate(client, key) {
  const result = await client.query(
    `SELECT clave, valor, descripcion, actualizado_por, actualizado_en
     FROM gf_configuracion_general WHERE clave = $1 FOR UPDATE`,
    [key],
  );
  return result.rows[0] ?? null;
}

export async function updateConfiguration(client, key, value, actorUserId) {
  const result = await client.query(
    `UPDATE gf_configuracion_general
     SET valor = $2::jsonb, actualizado_por = $3, actualizado_en = CURRENT_TIMESTAMP
     WHERE clave = $1
     RETURNING clave, valor, descripcion, actualizado_por, actualizado_en`,
    [key, JSON.stringify(value), actorUserId],
  );
  return result.rows[0] ?? null;
}

export async function insertAudit(client, event) {
  await client.query(
    `INSERT INTO gf_auditoria (
       actor_usuario_id, actor_sam, accion, entidad, entidad_id,
       valor_anterior, valor_nuevo, ip
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::inet)`,
    [
      event.actorUserId ?? null,
      normalizeSam(event.actorSam) || null,
      event.action,
      event.entity,
      event.entityId ?? null,
      event.previousValue === undefined
        ? null
        : JSON.stringify(event.previousValue),
      event.newValue === undefined ? null : JSON.stringify(event.newValue),
      event.ip ?? null,
    ],
  );
}
