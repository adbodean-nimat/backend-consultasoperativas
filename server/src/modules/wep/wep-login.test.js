import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createWepLoginRateLimit } from "./wep-login-rate-limit.middleware.js";
import { WepLoginRepository } from "./wep-login.repository.js";
import {
  WepLoginInvalidCredentialsError,
  WepLoginService,
} from "./wep-login.service.js";
import { createWepRouter } from "./wep.routes.js";

const VEHICLE = {
  id: 3,
  codigoErp: "001",
  nombre: "M BENZ",
  patente: "AB172IK",
};

async function withServer(app, callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("lista sólo vehículos internos habilitados sin seleccionar datos sensibles", async () => {
  let receivedSql;
  const repository = new WepLoginRepository({
    postgresPool: {
      async query(sql) {
        receivedSql = sql;
        return {
          rows: [
            {
              vehiculo_id: "3",
              codigo_erp: "001",
              nombre: "M BENZ",
              patente: "AB172IK",
            },
          ],
        };
      },
    },
  });

  assert.deepEqual(await repository.listLoginVehicles(), [VEHICLE]);
  assert.match(receivedSql, /activo = TRUE/);
  assert.match(receivedSql, /es_externo = FALSE/);
  assert.match(receivedSql, /wep_login_activo = TRUE/);
  assert.match(receivedSql, /wep_pin_hash IS NOT NULL/);
  assert.match(receivedSql, /ORDER BY nombre ASC, patente ASC/);
  assert.doesNotMatch(
    receivedSql.split("FROM")[0],
    /wep_pin_hash|gestya_id|gestya_gps_id|token/i,
  );
});

test("configura el PIN usando bcrypt con coste 12 y nunca persiste el PIN plano", async () => {
  const calls = [];
  const service = new WepLoginService({
    logger: { log() {}, warn() {} },
    passwordHasher: {
      async hash(pin, rounds) {
        calls.push(["hash", pin, rounds]);
        return "hash-bcrypt";
      },
    },
    repository: {
      async findVehicleById(id) {
        calls.push(["find", id]);
        return VEHICLE;
      },
      async updateVehiclePin(id, hash) {
        calls.push(["update", id, hash]);
        return VEHICLE;
      },
    },
  });

  assert.deepEqual(await service.setVehiclePin(3, "123456"), VEHICLE);
  assert.deepEqual(calls, [
    ["find", 3],
    ["hash", "123456", 12],
    ["update", 3, "hash-bcrypt"],
  ]);
  assert.notEqual(calls[2][2], "123456");
});

test("login rota tokens dentro de la transacción y devuelve el plano tras COMMIT", async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes("FROM public.vehiculos") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              vehiculo_id: 3,
              codigo_erp: "001",
              nombre: "M BENZ",
              patente: "AB172IK",
              wep_pin_hash: "pin-hash",
            },
          ],
        };
      }
      return { rows: [] };
    },
    release() {
      queries.push({ sql: "RELEASE" });
    },
  };
  const repository = new WepLoginRepository({
    postgresPool: { connect: async () => client },
  });
  const logs = [];
  const service = new WepLoginService({
    repository,
    passwordHasher: {
      async compare(pin, hash) {
        assert.equal(pin, "123456");
        assert.equal(hash, "pin-hash");
        return true;
      },
    },
    logger: { log: (message) => logs.push(message), warn() {} },
  });

  const result = await service.login(3, "123456");
  assert.match(result.token, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.vehicle, VEHICLE);
  assert.deepEqual(
    queries.map(({ sql }) => sql === "BEGIN" || sql === "COMMIT" || sql === "RELEASE"
      ? sql
      : sql.trim().split("\n")[0]),
    [
      "BEGIN",
      "SELECT",
      "UPDATE public.vehiculo_tokens",
      "INSERT INTO public.vehiculo_tokens",
      "COMMIT",
      "RELEASE",
    ],
  );
  const insert = queries.find(({ sql }) =>
    sql.includes("INSERT INTO public.vehiculo_tokens"),
  );
  assert.equal(insert.params[0], 3);
  assert.match(insert.params[1], /^[a-f0-9]{64}$/);
  assert.notEqual(insert.params[1], result.token);
  assert.deepEqual(logs, [
    "[WEP AUTH] Nuevo token generado vehiculoId=3",
    "[WEP AUTH] Login correcto vehiculoId=3",
  ]);
});

test("credenciales inválidas hacen ROLLBACK sin rotar tokens", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes("FROM public.vehiculos")) return { rows: [] };
      return { rows: [] };
    },
    release() {
      queries.push("RELEASE");
    },
  };
  const warnings = [];
  const service = new WepLoginService({
    repository: new WepLoginRepository({
      postgresPool: { connect: async () => client },
    }),
    passwordHasher: { async compare() { return false; } },
    logger: { log() {}, warn: (message) => warnings.push(message) },
  });

  await assert.rejects(
    service.login(3, "999999"),
    WepLoginInvalidCredentialsError,
  );
  assert.equal(queries.some((sql) => sql === "COMMIT"), false);
  assert.equal(
    queries.some((sql) => sql.includes?.("UPDATE public.vehiculo_tokens")),
    false,
  );
  assert.deepEqual(queries.slice(-2), ["ROLLBACK", "RELEASE"]);
  assert.deepEqual(warnings, ["[WEP AUTH] Login inválido"]);
});

test("el rate limit bloquea únicamente después de 10 intentos por IP", async () => {
  const app = express();
  let executions = 0;
  app.post(
    "/login",
    createWepLoginRateLimit({ now: () => 1000 }),
    (_request, response) => {
      executions += 1;
      response.json({ ok: true });
    },
  );

  await withServer(app, async (url) => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await fetch(`${url}/login`, { method: "POST" });
      assert.equal(response.status, 200);
    }
    const blocked = await fetch(`${url}/login`, { method: "POST" });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "900");
  });
  assert.equal(executions, 10);
});

test("expone listado y login públicos y protege la configuración del PIN", async () => {
  const calls = [];
  const technicalAuth = (request, response, next) => {
    if (request.headers.authorization !== "Bearer jwt-corporativo") {
      return response.status(401).json({ ok: false });
    }
    return next();
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/wep",
    createWepRouter({
      technicalAuth,
      loginRateLimit: (_request, _response, next) => next(),
      loginService: {
        async listVehicles() {
          return [VEHICLE];
        },
        async login(id, pin) {
          calls.push(["login", id, pin]);
          return { token: "token-wep", vehicle: VEHICLE };
        },
        async setVehiclePin(id, pin) {
          calls.push(["pin", id, pin]);
          return VEHICLE;
        },
      },
    }),
  );

  await withServer(app, async (url) => {
    const listed = await fetch(`${url}/api/wep/auth/vehiculos`);
    assert.equal(listed.status, 200);
    assert.deepEqual(await listed.json(), { ok: true, vehiculos: [VEHICLE] });

    const loggedIn = await fetch(`${url}/api/wep/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vehiculoId: 3, pin: "123456" }),
    });
    assert.equal(loggedIn.status, 200);
    assert.deepEqual(await loggedIn.json(), {
      ok: true,
      token: "token-wep",
      vehiculo: VEHICLE,
    });

    const denied = await fetch(`${url}/api/wep/admin/vehiculos/3/pin`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "123456" }),
    });
    assert.equal(denied.status, 401);

    const configured = await fetch(`${url}/api/wep/admin/vehiculos/3/pin`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer jwt-corporativo",
        "content-type": "application/json",
      },
      body: JSON.stringify({ pin: "123456" }),
    });
    assert.equal(configured.status, 200);
    assert.deepEqual(await configured.json(), {
      ok: true,
      message: "PIN actualizado correctamente",
      vehiculo: { id: 3, nombre: "M BENZ", patente: "AB172IK" },
    });
  });

  assert.deepEqual(calls, [
    ["login", 3, "123456"],
    ["pin", 3, "123456"],
  ]);
});

test("valida PIN y login sin revelar credenciales incorrectas", async () => {
  const loginService = {
    async login() {
      throw new WepLoginInvalidCredentialsError();
    },
    async setVehiclePin() {
      return VEHICLE;
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/wep",
    createWepRouter({
      technicalAuth: (_request, _response, next) => next(),
      loginRateLimit: (_request, _response, next) => next(),
      loginService,
    }),
  );

  await withServer(app, async (url) => {
    for (const body of [
      { vehiculoId: 0, pin: "123456" },
      { vehiculoId: 3, pin: "12" },
      { vehiculoId: 3, pin: 123456 },
      { vehiculoId: 3, pin: "abcd" },
    ]) {
      const response = await fetch(`${url}/api/wep/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }

    const invalid = await fetch(`${url}/api/wep/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vehiculoId: 3, pin: "999999" }),
    });
    assert.equal(invalid.status, 401);
    assert.deepEqual(await invalid.json(), {
      ok: false,
      message: "Camión o PIN incorrecto",
    });

    const badPin = await fetch(`${url}/api/wep/admin/vehiculos/3/pin`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "123" }),
    });
    assert.equal(badPin.status, 400);
    assert.deepEqual(await badPin.json(), {
      ok: false,
      message: "El PIN debe tener entre 4 y 8 dígitos",
    });
  });
});
