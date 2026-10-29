import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "./wep-postgres.js";

const DUMMY_HASH = "$2a$12$Lgx2O70qoktv9R0wkB.KPuIfiVsOJe/OUwCIFpYecZHA1YM/iAp5i";
export class WepAdminError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function publicAdminUser(row) {
  return { id: Number(row.id), username: row.username, displayName: row.display_name,
    role: row.role, active: row.active, lastLoginAt: row.last_login_at ?? null };
}
export function validateAdminUser(input, creating = true) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new WepAdminError("Datos de usuario inválidos.");
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (!displayName || displayName.length > 120) throw new WepAdminError("Ingresá un nombre de hasta 120 caracteres.");
  if (!["CONSULTA", "TIC"].includes(input.role)) throw new WepAdminError("Rol inválido.");
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  if (creating && !/^[a-z0-9._-]{3,64}$/.test(username)) throw new WepAdminError("El usuario debe tener entre 3 y 64 letras, números, puntos, guiones o guiones bajos.");
  if (input.password !== undefined && typeof input.password !== "string") throw new WepAdminError("Contraseña inválida.");
  const password = input.password;
  if ((creating || password !== undefined) && (!password || password.length < 12 || Buffer.byteLength(password, "utf8") > 72)) {
    throw new WepAdminError("La contraseña debe tener al menos 12 caracteres y hasta 72 bytes.");
  }
  if (!creating && typeof input.active !== "boolean") throw new WepAdminError("Indicá si el usuario está activo.");
  return { username, displayName, role: input.role, password, active: creating ? true : input.active };
}

export class WepAdminAuth {
  constructor({ postgresPool = pool, env = process.env, passwordHasher = bcrypt } = {}) {
    Object.assign(this, { pool: postgresPool, env, passwordHasher });
  }
  secret() {
    const value = this.env.WEP_ADMIN_JWT_SECRET;
    if (!value || value.length < 32 || value === this.env.JWT_SECRET) throw new WepAdminError("El acceso administrativo requiere configuración del servidor.", 503);
    return value;
  }
  async login(username, password) {
    this.secret();
    if (typeof username !== "string" || typeof password !== "string" || username.length > 64 || password.length > 200 || Buffer.byteLength(password) > 72) throw new WepAdminError("Usuario o contraseña incorrectos.", 401);
    const result = await this.pool.query("SELECT * FROM public.wep_admin_users WHERE username = $1", [username.trim().toLowerCase()]);
    const user = result.rows[0];
    const matches = await this.passwordHasher.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user?.active || !matches) throw new WepAdminError("Usuario o contraseña incorrectos.", 401);
    await this.pool.query("UPDATE public.wep_admin_users SET last_login_at = NOW() WHERE id = $1", [user.id]);
    const token = jwt.sign({ sv: user.session_version }, this.secret(), {
      algorithm: "HS256", subject: String(user.id), issuer: "wep-admin", audience: "wep-admin", expiresIn: "8h",
    });
    return { token, user: publicAdminUser(user) };
  }
  async authenticate(header) {
    const secret = this.secret();
    const match = typeof header === "string" && header.match(/^Bearer ([^\s]+)$/i);
    if (!match) throw new WepAdminError("Ingresá al tablero para continuar.", 401);
    let decoded;
    try {
      decoded = jwt.verify(match[1], secret, { algorithms: ["HS256"], issuer: "wep-admin", audience: "wep-admin" });
      if (!decoded || !/^\d+$/.test(decoded.sub || "")) throw new Error();
    } catch { throw new WepAdminError("La sesión venció o es inválida.", 401); }
    const result = await this.pool.query("SELECT * FROM public.wep_admin_users WHERE id = $1", [decoded.sub]);
    const user = result.rows[0];
    if (!user?.active || user.session_version !== decoded.sv) throw new WepAdminError("La sesión venció o fue revocada.", 401);
    return publicAdminUser(user);
  }
  async listUsers() {
    const result = await this.pool.query("SELECT id, username, display_name, role, active, last_login_at FROM public.wep_admin_users ORDER BY username");
    return result.rows.map(publicAdminUser);
  }
  async saveUser(input, id = null, { bootstrap = false } = {}) {
    const data = validateAdminUser(input, id === null);
    const hash = data.password ? await this.passwordHasher.hash(data.password, 12) : null;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(73021, 3)");
      const users = await client.query("SELECT id, role, active FROM public.wep_admin_users FOR UPDATE");
      if (bootstrap && (users.rows.length > 0 || data.role !== "TIC")) throw new WepAdminError("El primer usuario ya fue creado. Usá la administración de usuarios.", 409);
      if (id !== null) {
        const previous = users.rows.find(row => Number(row.id) === id);
        if (!previous) throw new WepAdminError("Usuario no encontrado.", 404);
        if (previous.role === "TIC" && previous.active && (!data.active || data.role !== "TIC") && !users.rows.some(row => Number(row.id) !== id && row.role === "TIC" && row.active)) {
          throw new WepAdminError("Debe quedar al menos un usuario TIC activo.", 409);
        }
      }
      const result = id === null ? await client.query(
        `INSERT INTO public.wep_admin_users (username, display_name, password_hash, role)
         VALUES ($1, $2, $3, $4) RETURNING *`, [data.username, data.displayName, hash, data.role],
      ) : await client.query(
        `UPDATE public.wep_admin_users SET display_name = $2, role = $3, active = $4,
         password_hash = COALESCE($5, password_hash), session_version = session_version + 1, updated_at = NOW()
         WHERE id = $1 RETURNING *`, [id, data.displayName, data.role, data.active, hash],
      );
      await client.query("COMMIT");
      return publicAdminUser(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error.code === "23505") throw new WepAdminError("Ese nombre de usuario ya existe.", 409);
      throw error;
    } finally { client.release(); }
  }
}
export default new WepAdminAuth();
