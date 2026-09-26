import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createWepRouter } from "./wep.routes.js";
import {
  calculateTrackingExpiration,
  WepTrackingService,
} from "./wep-tracking.service.js";
import { WepTrackingRepository } from "./wep-tracking.repository.js";

const PUBLIC_ID_ONE = "abcdefghijklmnopqrstuvwx12345678";
const PUBLIC_ID_TWO = "ZYXWVUTSRQPONMLKJIHGFEDC87654321";
const silentLogger = { error() {} };

function delivery(overrides = {}) {
  return {
    id: 101,
    domicilio: " San Martín   123 ",
    localidad: "concordia",
    fecha_entrega: "2026-09-18",
    hora_desde: "07:30:00",
    hora_hasta: "10:30:00",
    estado_codigo: "EN_REPARTO",
    updated_at: "2026-09-18T12:00:00.000Z",
    ...overrides,
  };
}

test("crea un tracking por parada y reutiliza el mismo publicId", async () => {
  const tokens = new Map();
  let nextId = PUBLIC_ID_ONE;
  const repository = {
    async findStopDeliveries() { return [delivery()]; },
    async getOrCreateActiveStopTracking(input) {
      const key = JSON.stringify([
        input.viajeId,
        input.clienteCodigo,
        input.domicilioNormalizado,
        input.localidadNormalizada,
      ]);
      if (!tokens.has(key)) {
        tokens.set(key, { public_id: nextId, expira_at: input.expiraAt });
      }
      return tokens.get(key);
    },
  };
  const service = new WepTrackingService({
    repository,
    randomId: () => nextId,
    logger: silentLogger,
  });
  const input = {
    viajeId: 17,
    clienteCodigo: "C1",
    domicilio: "San Martín 123",
    localidad: "Concordia",
  };

  const first = await service.getOrCreateTrackingForStop(input);
  nextId = PUBLIC_ID_TWO;
  const repeated = await service.getOrCreateTrackingForStop(input);
  const other = await service.getOrCreateTrackingForStop({ ...input, viajeId: 18 });

  assert.equal(first.publicId, PUBLIC_ID_ONE);
  assert.equal(repeated.publicId, PUBLIC_ID_ONE);
  assert.equal(other.publicId, PUBLIC_ID_TWO);
  assert.equal(first.url, `https://wep.nimat.com.ar/s/${PUBLIC_ID_ONE}`);
});

test("expira al final del segundo día posterior a fecha_entrega", () => {
  assert.equal(
    calculateTrackingExpiration("2026-09-18", 2).toISOString(),
    "2026-09-21T02:59:59.999Z",
  );
});

test("el lock de tracking usa la firma compatible hashtext(text)", async () => {
  const queries = [];
  let released = false;
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes("SELECT public_id, expira_at")) {
        return {
          rows: [
            {
              public_id: PUBLIC_ID_ONE,
              expira_at: new Date("2026-09-21T02:59:59.999Z"),
            },
          ],
        };
      }
      return { rows: [] };
    },
    release() { released = true; },
  };
  const repository = new WepTrackingRepository({
    postgresPool: { async connect() { return client; } },
  });

  const result = await repository.getOrCreateActiveStopTracking({
    publicId: PUBLIC_ID_TWO,
    viajeId: 17,
    clienteCodigo: "C1",
    domicilioNormalizado: "SAN MARTÍN 123",
    localidadNormalizada: "CONCORDIA",
    entregaId: 101,
    expiraAt: new Date("2026-09-21T02:59:59.999Z"),
  });

  const lock = queries.find(({ sql }) => sql.includes("pg_advisory_xact_lock"));
  assert.match(lock.sql, /hashtext\(\$1::text\)/);
  assert.doesNotMatch(lock.sql, /hashtextextended/);
  assert.equal(result.public_id, PUBLIC_ID_ONE);
  assert.equal(released, true);
  assert.equal(queries.at(-1).sql, "COMMIT");
});

test("tracking público agrega el estado actual sin datos sensibles", async () => {
  let touched = false;
  const gestyaCalls = [];
  const service = new WepTrackingService({
    repository: {
      async findPublicTracking() {
        return {
          token: {
            id: 9,
            domicilio_normalizado: "SAN MARTÍN 123",
            localidad_normalizada: "CONCORDIA",
            iniciado_at: "2026-09-18T10:00:00.000Z",
            finalizado_at: null,
            viaje_updated_at: "2026-09-18T11:00:00.000Z",
            patente: "AB172IK",
          },
          deliveries: [delivery()],
        };
      },
      async touchAccess() { touched = true; },
    },
    vehiclePositionService: {
      async getCurrentPositionByPlate(plate) {
        gestyaCalls.push(plate);
        return {
          latitude: -31.3929,
          longitude: -58.0209,
          positionDate: "2026-09-18T12:01:00.000Z",
          plate,
          speed: 42,
          event: 7,
        };
      },
    },
    logger: silentLogger,
  });

  const tracking = await service.getPublicTracking(PUBLIC_ID_ONE);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(tracking.estado, { codigo: "EN_REPARTO", nombre: "En reparto" });
  assert.deepEqual(tracking.horario, { desde: "07:30", hasta: "10:30" });
  assert.deepEqual(tracking.destino, { localidad: "CONCORDIA" });
  assert.equal(tracking.viaje.enCurso, true);
  assert.deepEqual(tracking.vehiculo, {
    posicionDisponible: true,
    latitud: -31.3929,
    longitud: -58.0209,
    fechaPosicion: "2026-09-18T12:01:00.000Z",
  });
  assert.deepEqual(gestyaCalls, ["AB172IK"]);
  assert.equal(touched, true);
  const serialized = JSON.stringify(tracking);
  for (const forbidden of [
    "telefono",
    "email",
    "clienteCodigo",
    "patente",
    "domicilio",
    "codigo_erp",
    "gestya_id",
    "gestya_gps_id",
    "speed",
    "event",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  }
});

for (const [expectedState, deliveries] of [
  ["PROGRAMADA", [delivery({ estado_codigo: "PROGRAMADA" })]],
  ["ASIGNADA", [delivery({ estado_codigo: "ASIGNADA" })]],
  ["ENTREGADA", [delivery({ estado_codigo: "ENTREGADA" })]],
  ["NO_ENTREGADA", [delivery({ estado_codigo: "NO_ENTREGADA" })]],
  ["CANCELADA", [delivery({ estado_codigo: "CANCELADA" })]],
  [
    "CERRADA_PARCIAL",
    [
      delivery({ id: 101, estado_codigo: "ENTREGADA" }),
      delivery({ id: 102, estado_codigo: "NO_ENTREGADA" }),
    ],
  ],
]) {
  test(`tracking ${expectedState} no consulta GESTYA`, async () => {
    let gestyaCalls = 0;
    const service = new WepTrackingService({
      repository: {
        async findPublicTracking() {
          return {
            token: {
              id: 9,
              domicilio_normalizado: "SAN MARTÍN 123",
              localidad_normalizada: "CONCORDIA",
              patente: "AB172IK",
            },
            deliveries,
          };
        },
        async touchAccess() {},
      },
      vehiclePositionService: {
        async getCurrentPositionByPlate() { gestyaCalls += 1; },
      },
      logger: silentLogger,
    });

    const tracking = await service.getPublicTracking(PUBLIC_ID_ONE);

    assert.equal(tracking.estado.codigo, expectedState);
    assert.deepEqual(tracking.vehiculo, { posicionDisponible: false });
    assert.equal(gestyaCalls, 0);
  });
}

test("un fallo de GESTYA no impide devolver el tracking público", async () => {
  const service = new WepTrackingService({
    repository: {
      async findPublicTracking() {
        return {
          token: {
            id: 9,
            domicilio_normalizado: "SAN MARTÍN 123",
            localidad_normalizada: "CONCORDIA",
            patente: "AB172IK",
          },
          deliveries: [delivery({ estado_codigo: "CLIENTE_AVISADO" })],
        };
      },
      async touchAccess() {},
    },
    vehiclePositionService: {
      async getCurrentPositionByPlate() { throw new Error("GESTYA caído"); },
    },
    logger: silentLogger,
  });

  const tracking = await service.getPublicTracking(PUBLIC_ID_ONE);

  assert.equal(tracking.estado.codigo, "CLIENTE_AVISADO");
  assert.deepEqual(tracking.vehiculo, { posicionDisponible: false });
});

async function withTrackingServer(trackingService, callback) {
  const app = express();
  app.use(
    "/api/wep",
    createWepRouter({
      trackingService,
      publicTrackingRateLimit(_request, _response, next) { next(); },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET público válido devuelve sólo el contrato seguro", async () => {
  await withTrackingServer(
    { async getPublicTracking() { return { estado: { codigo: "ENTREGADA", nombre: "Entregada" } }; } },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/wep/public/tracking/${PUBLIC_ID_ONE}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        tracking: { estado: { codigo: "ENTREGADA", nombre: "Entregada" } },
      });
    },
  );
});

for (const scenario of ["inexistente", "vencido", "inactivo"]) {
  test(`GET público devuelve el mismo 404 para tracking ${scenario}`, async () => {
    await withTrackingServer(
      { async getPublicTracking() { return null; } },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/wep/public/tracking/${PUBLIC_ID_ONE}`);
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), {
          ok: false,
          message: "Seguimiento no disponible",
        });
      },
    );
  });
}
