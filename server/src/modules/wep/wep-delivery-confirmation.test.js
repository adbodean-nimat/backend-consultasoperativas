import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  WepDeliveryConfirmationRepository,
  WepPwaDeliveryNotFoundError,
  WepPwaDeliveryStateConflictError,
} from "./wep-delivery-confirmation.repository.js";
import { WepDeliveryConfirmationService } from "./wep-delivery-confirmation.service.js";
import { createWepRouter } from "./wep.routes.js";

function testAuth(request, _response, next) {
  request.wepVehicle = { id: 3 };
  next();
}

const DELIVERED_AT = new Date("2026-09-12T13:25:45.000Z");

function deliveryRow(overrides = {}) {
  return {
    entrega_id: "101",
    estado_id: "3",
    estado_codigo: "EN_REPARTO",
    estado_nombre: "En reparto",
    viaje_id: "10",
    vehiculo_id: "7",
    patente: "AB172IK",
    domicilio: "San Lorenzo 1234",
    cliente_nombre: "Cliente ejemplo",
    orden_preparacion_division: "01",
    orden_preparacion_tipo: "OP",
    orden_preparacion_numero: "12345",
    ...overrides,
  };
}

function createConfirmationDatabase({
  state = "EN_REPARTO",
  deliveryExists = true,
  failOnEvent = false,
} = {}) {
  const queries = [];
  const events = [];
  let currentState = state;
  let currentStateId = state === "CLIENTE_AVISADO" ? 4 : 3;

  const client = {
    async query(sql, params) {
      queries.push({ sql, params });

      if (sql.includes("FOR UPDATE OF e")) {
        return {
          rows: deliveryExists
            ? [
                deliveryRow({
                  estado_id: String(currentStateId),
                  estado_codigo: currentState,
                }),
              ]
            : [],
        };
      }
      if (
        sql.includes("FROM public.entrega_estados") &&
        sql.includes("WHERE id = $1")
      ) {
        return {
          rows: [
            {
              id: currentStateId,
              codigo: currentState,
              nombre: currentState,
            },
          ],
        };
      }
      if (sql.includes("WHERE codigo = 'ENTREGADA'")) {
        return {
          rows: [{ id: 5, codigo: "ENTREGADA", nombre: "Entregada" }],
        };
      }
      if (sql.startsWith("UPDATE public.entregas")) {
        currentState = "ENTREGADA";
        currentStateId = 5;
        return { rows: [{ id: 101, entregado_at: DELIVERED_AT }] };
      }
      if (sql.startsWith("INSERT INTO public.entrega_eventos")) {
        if (failOnEvent) throw new Error("falló evento");
        events.push(params);
        return { rows: [] };
      }

      return { rows: [] };
    },
    release() {
      queries.push({ sql: "RELEASE" });
    },
  };

  return {
    events,
    queries,
    pool: { connect: async () => client },
  };
}

test("consulta el contexto operativo con entrega, estado, viaje y vehículo", async () => {
  let received;
  const repository = new WepDeliveryConfirmationRepository({
    postgresPool: {
      async query(sql, params) {
        received = { sql, params };
        return { rows: [deliveryRow()] };
      },
    },
  });

  const delivery = await repository.getDeliveryContext(101, 3);

  assert.deepEqual(received.params, [101, 3]);
  assert.match(received.sql, /e\.vehiculo_id = \$2/);
  assert.match(received.sql, /FROM public\.entregas e/);
  assert.match(received.sql, /INNER JOIN public\.entrega_estados ee/);
  assert.match(received.sql, /LEFT JOIN public\.viajes v/);
  assert.match(received.sql, /LEFT JOIN public\.vehiculos vh/);
  assert.deepEqual(delivery, {
    id: 101,
    estadoId: 3,
    estadoCodigo: "EN_REPARTO",
    estadoNombre: "En reparto",
    viajeId: 10,
    vehiculoId: 7,
    patente: "AB172IK",
    domicilio: "San Lorenzo 1234",
    clienteNombre: "Cliente ejemplo",
    ordenPreparacion: { division: "01", tipo: "OP", numero: 12345 },
  });
});

test("confirma EN_REPARTO con coordenadas y evento en una transacción", async () => {
  const database = createConfirmationDatabase();
  const repository = new WepDeliveryConfirmationRepository({
    postgresPool: database.pool,
  });
  const position = {
    latitude: -31.372494,
    longitude: -58.019871,
    positionDate: "2026-09-12 10:25:00.000",
    speed: 0,
  };

  const result = await repository.confirmDelivery(101, 3, position);

  assert.deepEqual(result, {
    id: 101,
    estado: { codigo: "ENTREGADA", nombre: "Entregada" },
    entregadoAt: DELIVERED_AT,
    posicion: { latitud: -31.372494, longitud: -58.019871 },
  });
  assert.equal(database.queries[0].sql, "BEGIN");
  assert.match(database.queries[1].sql, /FOR UPDATE OF e/);
  assert.equal(database.queries.at(-2).sql, "COMMIT");
  assert.equal(database.queries.at(-1).sql, "RELEASE");

  const update = database.queries.find(({ sql }) =>
    sql.startsWith("UPDATE public.entregas"),
  );
  assert.match(update.sql, /estado_id = \$1/);
  assert.match(update.sql, /entregado_at = NOW\(\)/);
  assert.match(update.sql, /entregado_latitud = \$2/);
  assert.match(update.sql, /entregado_longitud = \$3/);
  assert.match(update.sql, /updated_at = NOW\(\)/);
  assert.doesNotMatch(
    update.sql.split("WHERE")[0],
    /estado_erp|orden_secuencia|viaje_id|vehiculo_id|notificacion|tracking/,
  );
  assert.deepEqual(update.params, [5, -31.372494, -58.019871, 101, 3, 3]);

  const event = database.queries.find(({ sql }) =>
    sql.startsWith("INSERT INTO public.entrega_eventos"),
  );
  assert.match(event.sql, /'ENTREGA_CONFIRMADA'/);
  assert.match(event.sql, /'VEHICULO'/);
  assert.match(event.sql, /'Entrega confirmada por el chofer'/);
  assert.match(event.sql, /latitud, longitud/);
  assert.deepEqual(event.params, [101, 3, 5, -31.372494, -58.019871, "3"]);
});

test("confirma CLIENTE_AVISADO y admite coordenadas nulas", async () => {
  const database = createConfirmationDatabase({ state: "CLIENTE_AVISADO" });
  const repository = new WepDeliveryConfirmationRepository({
    postgresPool: database.pool,
  });

  const result = await repository.confirmDelivery(101, 3, null);

  assert.deepEqual(result.posicion, { latitud: null, longitud: null });
  assert.deepEqual(database.events, [[101, 4, 5, null, null, "3"]]);
  assert.equal(database.queries.at(-2).sql, "COMMIT");
});

test("rechaza inexistente, ENTREGADA, CANCELADA y NO_ENTREGADA", async () => {
  const cases = [
    {
      database: createConfirmationDatabase({ deliveryExists: false }),
      error: WepPwaDeliveryNotFoundError,
      message: "Entrega no encontrada",
    },
    {
      database: createConfirmationDatabase({ state: "ENTREGADA" }),
      error: WepPwaDeliveryStateConflictError,
      message: "La entrega ya fue marcada como entregada",
    },
    {
      database: createConfirmationDatabase({ state: "CANCELADA" }),
      error: WepPwaDeliveryStateConflictError,
      message: "La entrega no puede marcarse como entregada en su estado actual",
    },
    {
      database: createConfirmationDatabase({ state: "NO_ENTREGADA" }),
      error: WepPwaDeliveryStateConflictError,
      message: "La entrega no puede marcarse como entregada en su estado actual",
    },
  ];

  for (const testCase of cases) {
    const repository = new WepDeliveryConfirmationRepository({
      postgresPool: testCase.database.pool,
    });
    await assert.rejects(
      repository.confirmDelivery(101, 3),
      (error) =>
        error instanceof testCase.error && error.message === testCase.message,
    );
    assert.equal(
      testCase.database.queries.some(({ sql }) =>
        sql.startsWith("UPDATE public.entregas"),
      ),
      false,
    );
    assert.deepEqual(
      testCase.database.queries.slice(-2).map(({ sql }) => sql),
      ["ROLLBACK", "RELEASE"],
    );
  }
});

test("hace rollback si falla el evento", async () => {
  const database = createConfirmationDatabase({ failOnEvent: true });
  const repository = new WepDeliveryConfirmationRepository({
    postgresPool: database.pool,
  });

  await assert.rejects(repository.confirmDelivery(101, 3), /falló evento/);
  assert.deepEqual(database.queries.slice(-2).map(({ sql }) => sql), [
    "ROLLBACK",
    "RELEASE",
  ]);
  assert.equal(
    database.queries.some(({ sql }) => sql === "COMMIT"),
    false,
  );
});

test("el segundo intento detecta ENTREGADA y no duplica el evento", async () => {
  const database = createConfirmationDatabase();
  const repository = new WepDeliveryConfirmationRepository({
    postgresPool: database.pool,
  });

  await repository.confirmDelivery(101, 3);
  await assert.rejects(
    repository.confirmDelivery(101, 3),
    (error) =>
      error instanceof WepPwaDeliveryStateConflictError &&
      error.message === "La entrega ya fue marcada como entregada",
  );
  assert.equal(database.events.length, 1);
});

function serviceDelivery(overrides = {}) {
  return {
    id: 101,
    estadoCodigo: "EN_REPARTO",
    patente: "AB172IK",
    ...overrides,
  };
}

test("el service consulta GESTYA antes de confirmar en PostgreSQL", async () => {
  const calls = [];
  const position = {
    latitude: -31.372494,
    longitude: -58.019871,
    positionDate: "2026-09-12 10:25:00.000",
    speed: 0,
  };
  const service = new WepDeliveryConfirmationService({
    logger: { log() {}, error() {} },
    vehiclePositionService: {
      async getCurrentPositionByPlate(plate) {
        calls.push({ method: "gestya", plate });
        return position;
      },
    },
    repository: {
      async getDeliveryContext(id) {
        calls.push({ method: "getDeliveryContext", id });
        return serviceDelivery();
      },
      async confirmDelivery(id, vehiculoId, receivedPosition) {
        calls.push({ method: "confirmDelivery", id, vehiculoId, receivedPosition });
        return {
          id,
          estado: { codigo: "ENTREGADA", nombre: "Entregada" },
          entregadoAt: DELIVERED_AT,
          posicion: {
            latitud: receivedPosition.latitude,
            longitud: receivedPosition.longitude,
          },
        };
      },
    },
  });

  const result = await service.confirmDelivery(101, 3);

  assert.deepEqual(
    calls.map(({ method }) => method),
    ["getDeliveryContext", "gestya", "confirmDelivery"],
  );
  assert.equal(calls[1].plate, "AB172IK");
  assert.equal(calls[2].receivedPosition, position);
  assert.deepEqual(result.posicion, {
    latitud: -31.372494,
    longitud: -58.019871,
    obtenidaDesdeGestya: true,
  });
});

test("una falla GESTYA no bloquea la confirmación", async () => {
  const logs = [];
  let receivedPosition = "sin asignar";
  const service = new WepDeliveryConfirmationService({
    logger: {
      log(message) {
        logs.push(message);
      },
      error(message) {
        logs.push(message);
      },
    },
    vehiclePositionService: {
      async getCurrentPositionByPlate() {
        throw new Error("GESTYA caído");
      },
    },
    repository: {
      async getDeliveryContext() {
        return serviceDelivery();
      },
      async confirmDelivery(id, vehiculoId, position) {
        receivedPosition = position;
        return {
          id,
          estado: { codigo: "ENTREGADA", nombre: "Entregada" },
          entregadoAt: DELIVERED_AT,
          posicion: { latitud: null, longitud: null },
        };
      },
    },
  });

  const result = await service.confirmDelivery(101, 3);

  assert.equal(receivedPosition, null);
  assert.deepEqual(result.posicion, {
    latitud: null,
    longitud: null,
    obtenidaDesdeGestya: false,
  });
  assert.equal(
    logs.includes(
      "[WEP PWA] No se pudo obtener posición GESTYA para entrega id=101",
    ),
    true,
  );
  assert.equal(
    logs.includes("[WEP PWA] Continuando confirmación sin coordenadas"),
    true,
  );
});

test("el service no consulta GESTYA para estados inválidos", async () => {
  let gestyaCalls = 0;
  let confirmationCalls = 0;
  const service = new WepDeliveryConfirmationService({
    logger: { log() {}, error() {} },
    vehiclePositionService: {
      async getCurrentPositionByPlate() {
        gestyaCalls += 1;
      },
    },
    repository: {
      async getDeliveryContext() {
        return serviceDelivery({ estadoCodigo: "CANCELADA" });
      },
      async confirmDelivery() {
        confirmationCalls += 1;
      },
    },
  });

  await assert.rejects(
    service.confirmDelivery(101, 3),
    WepPwaDeliveryStateConflictError,
  );
  assert.equal(gestyaCalls, 0);
  assert.equal(confirmationCalls, 0);
});

async function postEntregar(id, deliveryConfirmationService) {
  const app = express();
  app.use(
    "/api/wep",
    createWepRouter({ deliveryConfirmationService, wepAuth: testAuth }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/pwa/entregas/${id}/entregar`,
      { method: "POST" },
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("POST entregar devuelve la confirmación esperada", async () => {
  const entrega = {
    id: 101,
    estado: { codigo: "ENTREGADA", nombre: "Entregada" },
    entregadoAt: "2026-09-12T13:25:45.000Z",
    posicion: {
      latitud: -31.372494,
      longitud: -58.019871,
      obtenidaDesdeGestya: true,
    },
  };
  const result = await postEntregar(101, {
    async confirmDelivery(id) {
      assert.equal(id, 101);
      return entrega;
    },
  });

  assert.deepEqual(result, {
    status: 200,
    body: {
      ok: true,
      message: "Entrega confirmada correctamente",
      entrega,
    },
  });
});

test("POST entregar valida id y mapea inexistencia y conflictos", async () => {
  let called = false;
  for (const id of ["abc", "0", "-1", "1.5"]) {
    const invalid = await postEntregar(id, {
      async confirmDelivery() {
        called = true;
      },
    });
    assert.deepEqual(invalid, {
      status: 400,
      body: {
        ok: false,
        message: "El id de entrega debe ser un número entero válido",
      },
    });
  }
  assert.equal(called, false);

  const missing = await postEntregar(999, {
    async confirmDelivery() {
      throw new WepPwaDeliveryNotFoundError("Entrega no encontrada");
    },
  });
  assert.deepEqual(missing, {
    status: 404,
    body: { ok: false, message: "Entrega no encontrada" },
  });

  for (const message of [
    "La entrega ya fue marcada como entregada",
    "La entrega no puede marcarse como entregada en su estado actual",
  ]) {
    const conflict = await postEntregar(101, {
      async confirmDelivery() {
        throw new WepPwaDeliveryStateConflictError(message);
      },
    });
    assert.deepEqual(conflict, {
      status: 409,
      body: { ok: false, message },
    });
  }
});
