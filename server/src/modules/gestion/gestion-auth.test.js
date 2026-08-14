import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import express from "express";
import jwt from "jsonwebtoken";
import { authenticateToken, requirePermission, verifyUserToken } from "./gestion-auth.middleware.js";
import { findUserAccess } from "./gestion-auth.repository.js";
import {
  authorizeAdLogin,
  createOrSyncUser,
  setConfiguration,
  setUserRoles,
  setUserStatus,
} from "./gestion-auth.service.js";
import { validateCreateUserBody } from "./gestion-auth.validator.js";
import { findAdUser } from "./gestion-directory.service.js";

const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "gestion-auth-test-secret";

async function withServer(middlewares, callback) {
  const app = express();
  app.use(express.json());
  app.all("/protected", ...middlewares, (req, res) => res.json({ ok: true, auth: req.auth }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}/protected`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test.after(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

test("authenticateToken rechaza token ausente, inválido y vencido", async () => {
  await withServer([authenticateToken], async (url) => {
    const missing = await fetch(url);
    assert.equal(missing.status, 401);
    assert.equal((await missing.json()).code, "AUTH_TOKEN_REQUIRED");

    const invalid = await fetch(url, { headers: { authorization: "Bearer invalido" } });
    assert.equal(invalid.status, 401);
    assert.equal((await invalid.json()).code, "AUTH_TOKEN_INVALID");

    const expiredToken = jwt.sign({ username: "lector" }, process.env.JWT_SECRET, {
      algorithm: "HS256", expiresIn: -1,
    });
    const expired = await fetch(url, { headers: { authorization: `Bearer ${expiredToken}` } });
    assert.equal(expired.status, 401);
  });
});

test("verifyUserToken conserva el contrato global y acepta el JWT histórico", async () => {
  await withServer([verifyUserToken], async (url) => {
    const missing = await fetch(url);
    assert.equal(missing.status, 401);
    assert.equal(await missing.text(), "Solicitud no autorizada");

    const invalid = await fetch(url, { headers: { authorization: "Bearer invalido" } });
    assert.equal(invalid.status, 400);
    assert.equal(await invalid.text(), "Token inválido.");

    const token = jwt.sign(
      { user: { sAMAccountName: "usuario-global" } },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const valid = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).auth.user.sAMAccountName, "usuario-global");
  });
});

test("login de Gestión queda público antes de verifyUserToken y /login sigue separado", () => {
  const source = readFileSync(new URL("../../../api.js", import.meta.url), "utf8");
  const gestionLogin = source.indexOf('app.post("/api/gestion/login"');
  const apiProtection = source.indexOf('app.use("/api", verifyUserToken, router)');
  const globalLogin = source.indexOf('app.post("/login"');
  assert.ok(gestionLogin >= 0);
  assert.ok(apiProtection > gestionLogin);
  assert.ok(globalLogin > apiProtection);
  assert.doesNotMatch(source.slice(globalLogin, source.indexOf("/* app.post('/login'", globalLogin)), /authorizeAdLogin/);
});

test("permisos efectivos distinguen lector, editor y administrador", async () => {
  const matrix = {
    lector: ["gestion.ingresar", "gestion.consultar"],
    editor: ["gestion.ingresar", "gestion.consultar", "gestion.editar"],
    admin: ["gestion.ingresar", "gestion.consultar", "gestion.editar", "gestion.configurar", "gestion.administrar_usuarios"],
  };
  const lookup = async (_pool, username) => ({
    id: 1, sam_account_name: username, activo: true, roles: [], permissions: matrix[username],
  });
  async function status(username, permission) {
    const token = jwt.sign({ username }, process.env.JWT_SECRET, { algorithm: "HS256" });
    let result;
    await withServer([authenticateToken, requirePermission(permission, { lookup })], async (url) => {
      result = (await fetch(url, { headers: { authorization: `Bearer ${token}` } })).status;
    });
    return result;
  }
  assert.equal(await status("lector", "gestion.consultar"), 200);
  assert.equal(await status("lector", "gestion.editar"), 403);
  assert.equal(await status("editor", "gestion.editar"), 200);
  assert.equal(await status("editor", "gestion.administrar_usuarios"), 403);
  assert.equal(await status("admin", "gestion.configurar"), 200);
  assert.equal(await status("admin", "gestion.administrar_usuarios"), 200);
});

test("usuario nuevo queda inactivo y usuario sin ingresar recibe 403", async () => {
  const events = [];
  const client = {
    query: async (sql) => { events.push(sql); return { rows: [], rowCount: 0 }; },
    release: () => events.push("RELEASE"),
  };
  const dependencies = {
    pool: { connect: async () => client },
    syncAdUser: async () => ({ user: { id: 9, activo: false }, created: true }),
    assignBootstrapAdmin: async () => {},
    findUserAccess: async () => ({ activo: false, permissions: [], roles: [] }),
  };
  await assert.rejects(
    authorizeAdLogin({ sAMAccountName: " Nuevo " }, { dependencies }),
    (error) => error.status === 403 && error.code === "GESTION_ACCESS_DENIED",
  );
  assert.deepEqual(events, ["BEGIN", "COMMIT", "RELEASE"]);
});

test("usuario activo sin gestion.ingresar también recibe 403", async () => {
  const client = { query: async () => ({ rows: [], rowCount: 0 }), release() {} };
  await assert.rejects(
    authorizeAdLogin({ sAMAccountName: "sinpermiso" }, {
      dependencies: {
        pool: { connect: async () => client },
        syncAdUser: async () => ({ user: { id: 10, activo: true }, created: false }),
        assignBootstrapAdmin: async () => {},
        findUserAccess: async () => ({ activo: true, permissions: ["gestion.consultar"], roles: [] }),
      },
    }),
    (error) => error.status === 403 && error.code === "GESTION_ACCESS_DENIED",
  );
});

test("bootstrap del administrador es idempotente y habilita el primer acceso", async () => {
  const previousBootstrap = process.env.GESTION_BOOTSTRAP_ADMIN;
  process.env.GESTION_BOOTSTRAP_ADMIN = "bootstrap";
  let bootstrapCalls = 0;
  const client = { query: async () => ({ rows: [], rowCount: 0 }), release() {} };
  try {
    const result = await authorizeAdLogin({ sAMAccountName: " Bootstrap " }, {
      dependencies: {
        pool: { connect: async () => client },
        syncAdUser: async () => ({ user: { id: 11, activo: false }, created: true }),
        assignBootstrapAdmin: async () => { bootstrapCalls += 1; },
        findUserAccess: async () => ({
          id: 11, sam_account_name: "bootstrap", activo: true,
          roles: ["ADMIN_GESTION"], permissions: ["gestion.ingresar"],
        }),
      },
    });
    assert.equal(result.username, "bootstrap");
    assert.equal(bootstrapCalls, 1);
  } finally {
    if (previousBootstrap === undefined) delete process.env.GESTION_BOOTSTRAP_ADMIN;
    else process.env.GESTION_BOOTSTRAP_ADMIN = previousBootstrap;
  }
});

test("consultas de acceso usan parámetros y normalizan sAMAccountName", async () => {
  let captured;
  const executor = { query: async (sql, values) => {
    captured = { sql, values };
    return { rows: [], rowCount: 0 };
  } };
  await findUserAccess(executor, "  ABoDean ");
  assert.match(captured.sql, /lower\(u\.sam_account_name\) = \$1/);
  assert.deepEqual(captured.values, ["abodean"]);
});

test("valida y normaliza el alta administrativa", () => {
  assert.deepEqual(
    validateCreateUserBody({ username: "  JPerez ", activo: true, roles: ["LECTOR_GESTION"] }),
    { username: "jperez", active: true, roles: ["LECTOR_GESTION"] },
  );
  assert.throws(
    () => validateCreateUserBody({ username: "jperez", activo: "true", roles: [] }),
    (error) => error.status === 400,
  );
});

test("búsqueda administrativa de AD usa el filtro existente sin contraseña del usuario", async () => {
  const events = [];
  class FakeLdap {
    constructor(options) { events.push(options); }
    on() {}
    _findUser(username, callback) {
      events.push(username);
      callback(null, { sAMAccountName: "JPerez", name: "Juan Perez", mail: "jperez@example.com" });
    }
    close(callback) { events.push("CLOSE"); callback(); }
  }
  const profile = await findAdUser(" JPerez ", { LdapClient: FakeLdap });
  assert.equal(events[1], "jperez");
  assert.equal(events[0].includeRaw, false);
  assert.equal(profile.sAMAccountName, "jperez");
  assert.equal(profile.name, "Juan Perez");
  assert.equal(events.at(-1), "CLOSE");
});

test("alta administrativa sincroniza AD, estado y roles dentro de una transacción", async () => {
  const events = [];
  const client = {
    query: async (sql) => { events.push(sql); return { rows: [], rowCount: 0 }; },
    release: () => events.push("RELEASE"),
  };
  const user = await createOrSyncUser(
    { username: "jperez", active: true, roles: ["LECTOR_GESTION"] },
    { userId: 1, username: "admin", ip: "127.0.0.1" },
    {
      pool: { connect: async () => client },
      findAdUser: async () => ({ sAMAccountName: "jperez", name: "Juan Perez" }),
      findUserByUsernameForUpdate: async () => null,
      getRoleCodesForUser: async () => [],
      countOtherActiveAdmins: async () => 1,
      findUserAccess: async () => ({
          id: 20, sam_account_name: "jperez", nombre: "Juan Perez",
          nombre_visible: null, email: null, activo: true,
          roles: ["LECTOR_GESTION"], permissions: ["gestion.ingresar", "gestion.consultar"],
        }),
      syncManagedAdUser: async () => ({ user: { id: 20 }, created: true }),
      replaceUserRoles: async () => ["LECTOR_GESTION"],
      insertAudit: async (_client, event) => events.push(event.action),
    },
  );
  assert.equal(user.username, "jperez");
  assert.deepEqual(user.roles, ["LECTOR_GESTION"]);
  assert.deepEqual(events, ["BEGIN", "CREAR_USUARIO", "COMMIT", "RELEASE"]);
});

test("alta administrativa rechaza usuario inexistente en AD sin abrir transacción", async () => {
  let connected = false;
  await assert.rejects(
    createOrSyncUser(
      { username: "noexiste", active: true, roles: [] },
      { userId: 1, username: "admin" },
      {
        pool: { connect: async () => { connected = true; } },
        findAdUser: async () => null,
      },
    ),
    (error) => error.status === 404 && error.code === "GESTION_AD_USER_NOT_FOUND",
  );
  assert.equal(connected, false);
});

test("alta administrativa hace rollback si un rol no existe", async () => {
  const events = [];
  const client = {
    query: async (sql) => { events.push(sql); return { rows: [], rowCount: 0 }; },
    release: () => events.push("RELEASE"),
  };
  await assert.rejects(
    createOrSyncUser(
      { username: "jperez", active: true, roles: ["ROL_INEXISTENTE"] },
      { userId: 1, username: "admin" },
      {
        pool: { connect: async () => client },
        findAdUser: async () => ({ sAMAccountName: "jperez" }),
        findUserByUsernameForUpdate: async () => null,
        getRoleCodesForUser: async () => [],
        countOtherActiveAdmins: async () => 1,
        findUserAccess: async () => null,
        syncManagedAdUser: async () => ({ user: { id: 20 }, created: true }),
        replaceUserRoles: async () => null,
        insertAudit: async () => events.push("AUDIT"),
      },
    ),
    (error) => error.status === 400 && error.code === "GESTION_INVALID_ROLES",
  );
  assert.deepEqual(events, ["BEGIN", "ROLLBACK", "RELEASE"]);
});

test("alta administrativa no puede desactivar al último administrador", async () => {
  const events = [];
  const client = {
    query: async (sql) => { events.push(sql); return { rows: [], rowCount: 0 }; },
    release: () => events.push("RELEASE"),
  };
  await assert.rejects(
    createOrSyncUser(
      { username: "admin", active: false, roles: ["LECTOR_GESTION"] },
      { userId: 1, username: "admin" },
      {
        pool: { connect: async () => client },
        findAdUser: async () => ({ sAMAccountName: "admin" }),
        findUserByUsernameForUpdate: async () => ({ id: 1, activo: true }),
        getRoleCodesForUser: async () => ["ADMIN_GESTION"],
        countOtherActiveAdmins: async () => 0,
      },
    ),
    (error) => error.status === 409 && error.code === "GESTION_LAST_ADMIN_REQUIRED",
  );
  assert.deepEqual(events, ["BEGIN", "ROLLBACK", "RELEASE"]);
});

test("asignación de roles hace rollback completo si falla", async () => {
  const queries = [];
  const client = { query: async (sql) => { queries.push(sql); return { rows: [], rowCount: 0 }; }, release() {} };
  const dependencies = {
    pool: { connect: async () => client },
    findUserByIdForUpdate: async () => ({ id: 2, activo: true }),
    getRoleCodesForUser: async () => ["LECTOR_GESTION"],
    countOtherActiveAdmins: async () => 1,
    replaceUserRoles: async () => { throw new Error("fallo simulado"); },
    insertAudit: async () => { throw new Error("no debe auditar"); },
  };
  await assert.rejects(setUserRoles(2, ["EDITOR_GESTION"], { userId: 1, username: "admin" }, dependencies));
  assert.deepEqual(queries, ["BEGIN", "ROLLBACK"]);
});

test("no permite quitar el último administrador activo", async () => {
  const queries = [];
  const client = { query: async (sql) => { queries.push(sql); return { rows: [], rowCount: 0 }; }, release() {} };
  await assert.rejects(
    setUserRoles(1, ["LECTOR_GESTION"], { userId: 1, username: "admin" }, {
      pool: { connect: async () => client },
      findUserByIdForUpdate: async () => ({ id: 1, activo: true }),
      getRoleCodesForUser: async () => ["ADMIN_GESTION"],
      countOtherActiveAdmins: async () => 0,
      replaceUserRoles: async () => { throw new Error("no debe ejecutarse"); },
      insertAudit: async () => { throw new Error("no debe ejecutarse"); },
    }),
    (error) => error.status === 409 && error.code === "GESTION_LAST_ADMIN_REQUIRED",
  );
  assert.deepEqual(queries, ["BEGIN", "ROLLBACK"]);
});

test("cambios de roles y configuración generan auditoría antes del commit", async () => {
  const events = [];
  const client = { query: async (sql) => { events.push(sql); return { rows: [], rowCount: 0 }; }, release() {} };
  const actor = { userId: 1, username: "admin", ip: "127.0.0.1" };
  await setUserRoles(2, ["LECTOR_GESTION"], actor, {
    pool: { connect: async () => client },
    findUserByIdForUpdate: async () => ({ id: 2, activo: true }),
    getRoleCodesForUser: async () => [],
    countOtherActiveAdmins: async () => 1,
    replaceUserRoles: async () => ["LECTOR_GESTION"],
    insertAudit: async (_client, audit) => events.push(audit.action),
  });
  assert.deepEqual(events, ["BEGIN", "ASIGNAR_ROLES", "COMMIT"]);

  events.length = 0;
  await setConfiguration("cmv", { porcentaje: 75.15, diasLaborales: 5.5 }, actor, {
    pool: { connect: async () => client },
    findConfigurationForUpdate: async () => ({ clave: "cmv", valor: {} }),
    updateConfiguration: async () => ({ clave: "cmv", valor: { porcentaje: 75.15, diasLaborales: 5.5 } }),
    insertAudit: async (_client, audit) => events.push(audit.action),
  });
  assert.deepEqual(events, ["BEGIN", "ACTUALIZAR_CONFIGURACION", "COMMIT"]);

  events.length = 0;
  await setUserStatus(2, true, actor, {
    pool: { connect: async () => client },
    findUserByIdForUpdate: async () => ({ id: 2, activo: false }),
    getRoleCodesForUser: async () => ["LECTOR_GESTION"],
    countOtherActiveAdmins: async () => 1,
    insertAudit: async (_client, audit) => events.push(audit.action),
  });
  assert.deepEqual(events, ["BEGIN", expectSqlUpdate(events), "CAMBIAR_ESTADO_USUARIO", "COMMIT"]);
});

function expectSqlUpdate(events) {
  return events.find((value) => typeof value === "string" && /UPDATE gf_usuarios/.test(value));
}
