import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  createRequireWepVehicle,
  hashWepToken,
} from "./wep-auth.middleware.js";
import { WepTokenService } from "./wep-token.service.js";
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

function createAuthApp(authentication, { touchRejects = false } = {}) {
  const received = { hashes: [], touches: [] };
  const middleware = createRequireWepVehicle({
    repository: {
      async findTokenWithVehicle(tokenHash) {
        received.hashes.push(tokenHash);
        return authentication;
      },
      async touchLastUsed(tokenId) {
        received.touches.push(tokenId);
        if (touchRejects) throw new Error("auditoría no disponible");
      },
    },
    logger: { log() {}, warn() {} },
    now: () => new Date("2026-09-14T12:00:00.000Z"),
  });
  const app = express();
  app.get("/protected", middleware, (request, response) => {
    response.json({ ok: true, vehiculo: request.wepVehicle });
  });
  return { app, received };
}

test("requireWepVehicle exige Bearer y distingue token inválido, inactivo y vencido", async () => {
  const cases = [
    {
      header: undefined,
      authentication: null,
      message: "Token WEP requerido",
    },
    {
      header: "Token abc",
      authentication: null,
      message: "Token WEP inválido",
    },
    {
      header: "Bearer desconocido",
      authentication: null,
      message: "Token WEP inválido",
    },
    {
      header: "Bearer revocado",
      authentication: {
        tokenId: 8,
        activo: false,
        expiraAt: null,
        vehicle: VEHICLE,
      },
      message: "Token WEP inactivo",
    },
    {
      header: "Bearer vencido",
      authentication: {
        tokenId: 9,
        activo: true,
        expiraAt: new Date("2026-09-14T11:59:59.000Z"),
        vehicle: VEHICLE,
      },
      message: "Token WEP vencido",
    },
  ];

  for (const testCase of cases) {
    const { app } = createAuthApp(testCase.authentication);
    await withServer(app, async (url) => {
      const response = await fetch(`${url}/protected`, {
        headers: testCase.header
          ? { Authorization: testCase.header }
          : undefined,
      });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        ok: false,
        message: testCase.message,
      });
    });
  }
});

test("requireWepVehicle deriva el vehículo del hash y no bloquea por ultimo_uso_at", async () => {
  const token = "token-plano-solo-para-la-prueba";
  const { app, received } = createAuthApp(
    { tokenId: 7, activo: true, expiraAt: null, vehicle: VEHICLE },
    { touchRejects: true },
  );

  await withServer(app, async (url) => {
    const response = await fetch(`${url}/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, vehiculo: VEHICLE });
  });

  assert.deepEqual(received.hashes, [hashWepToken(token)]);
  assert.deepEqual(received.touches, [7]);
  assert.equal(received.hashes[0].length, 64);
  assert.notEqual(received.hashes[0], token);
});

test("WepTokenService genera 32 bytes aleatorios y persiste solamente SHA-256", async () => {
  const stored = [];
  const service = new WepTokenService({
    repository: {
      async findVehicleById(id) {
        assert.equal(id, 3);
        return VEHICLE;
      },
      async createVehicleToken(vehiculoId, tokenHash) {
        stored.push({ vehiculoId, tokenHash });
      },
    },
  });

  const result = await service.createForVehicle(3);
  assert.match(result.token, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.vehicle, VEHICLE);
  assert.deepEqual(stored, [
    { vehiculoId: 3, tokenHash: hashWepToken(result.token) },
  ]);
  assert.notEqual(stored[0].tokenHash, result.token);
});

test("/auth/me devuelve el vehículo autenticado y las rutas PWA exigen WEP", async () => {
  const auth = (request, _response, next) => {
    request.wepVehicle = VEHICLE;
    next();
  };
  const app = express();
  app.use(
    "/api/wep",
    createWepRouter({
      wepAuth: auth,
      technicalAuth: (_request, _response, next) => next(),
    }),
  );

  await withServer(app, async (url) => {
    const response = await fetch(`${url}/api/wep/auth/me`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, vehiculo: VEHICLE });
  });

  const protectedApp = express();
  protectedApp.use(
    "/api/wep",
    createWepRouter({
      technicalAuth: (_request, _response, next) => next(),
      wepAuth: createRequireWepVehicle({
        repository: {
          async findTokenWithVehicle() {
            return null;
          },
        },
        logger: { warn() {} },
      }),
    }),
  );
  await withServer(protectedApp, async (url) => {
    const response = await fetch(
      `${url}/api/wep/pwa/viajes?fecha=2026-09-14`,
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Token WEP requerido",
    });
  });
});

test("los endpoints admin reutilizan auth técnica, crean y revocan tokens", async () => {
  const calls = [];
  const technicalAuth = (request, response, next) => {
    if (request.headers.authorization !== "Bearer jwt-corporativo") {
      return response.status(401).json({ ok: false });
    }
    return next();
  };
  const app = express();
  app.use(
    "/api/wep",
    createWepRouter({
      technicalAuth,
      tokenService: {
        async createForVehicle(id) {
          calls.push(["create", id]);
          return { vehicle: VEHICLE, token: "token-plano" };
        },
        async revoke(id) {
          calls.push(["revoke", id]);
        },
      },
    }),
  );

  await withServer(app, async (url) => {
    const unauthorized = await fetch(
      `${url}/api/wep/admin/vehiculos/3/token`,
      { method: "POST" },
    );
    assert.equal(unauthorized.status, 401);

    const headers = { Authorization: "Bearer jwt-corporativo" };
    const created = await fetch(`${url}/api/wep/admin/vehiculos/3/token`, {
      method: "POST",
      headers,
    });
    assert.equal(created.status, 200);
    assert.deepEqual(await created.json(), {
      ok: true,
      vehiculo: { id: 3, patente: "AB172IK", nombre: "M BENZ" },
      token: "token-plano",
    });

    const revoked = await fetch(`${url}/api/wep/admin/tokens/12/revocar`, {
      method: "POST",
      headers,
    });
    assert.equal(revoked.status, 200);
    assert.deepEqual(await revoked.json(), {
      ok: true,
      message: "Token revocado",
    });
  });

  assert.deepEqual(calls, [
    ["create", 3],
    ["revoke", 12],
  ]);
});
