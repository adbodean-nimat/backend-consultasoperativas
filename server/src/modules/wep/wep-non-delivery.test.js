import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import express from "express";
import { WEP_NO_ENTREGA_MOTIVOS } from "./wep-non-delivery.constants.js";
import {
  WepNonDeliveryRepository,
  WepPwaNoDeliveryNotFoundError,
  WepPwaNoDeliveryStateConflictError,
} from "./wep-non-delivery.repository.js";
import { WepNonDeliveryService } from "./wep-non-delivery.service.js";
import { createWepRouter } from "./wep.routes.js";

function testAuth(request, _response, next) {
  request.wepVehicle = { id: 3 };
  next();
}

const NOT_DELIVERED_AT = new Date("2026-09-12T14:20:00.000Z");
const STATE_IDS = {
  EN_REPARTO: 3,
  CLIENTE_AVISADO: 4,
  ENTREGADA: 5,
  NO_ENTREGADA: 6,
  CANCELADA: 7,
};

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

function createNonDeliveryDatabase({
  state = "EN_REPARTO",
  deliveryExists = true,
  failOnEvent = false,
} = {}) {
  const queries = [];
  const events = [];
  let currentState = state;
  let currentStateId = STATE_IDS[state];

  const client = {
    async query(sql, params) {
      queries.push({ sql, params });

      if (sql.includes("FOR UPDATE OF e")) {
        return {
          rows: deliveryExists
            ? [deliveryRow({ estado_id: String(currentStateId) })]
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
      if (sql.includes("WHERE codigo = 'NO_ENTREGADA'")) {
        return {
          rows: [
            { id: 6, codigo: "NO_ENTREGADA", nombre: "No entregada" },
          ],
        };
      }
      if (sql.startsWith("UPDATE public.entregas")) {
        currentState = "NO_ENTREGADA";
        currentStateId = 6;
        return {
          rows: [
            {
              id: 101,
              no_entregado_at: NOT_DELIVERED_AT,
              no_entregado_motivo: params[1],
              no_entregado_observacion: params[2],
              no_entregado_latitud: params[3],
              no_entregado_longitud: params[4],
            },
          ],
        };
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

test("centraliza la lista fija de motivos permitidos", () => {
  assert.deepEqual(WEP_NO_ENTREGA_MOTIVOS, [
    "CLIENTE_AUSENTE",
    "DOMICILIO_CERRADO",
    "DIRECCION_INCORRECTA",
    "CLIENTE_RECHAZA",
    "SIN_ACCESO",
    "PROBLEMA_DE_CARGA",
    "OTRO",
  ]);
  assert.equal(Object.isFrozen(WEP_NO_ENTREGA_MOTIVOS), true);
});

test("consulta contexto con entrega, estado, viaje y vehículo", async () => {
  let received;
  const repository = new WepNonDeliveryRepository({
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

test("marca EN_REPARTO como NO_ENTREGADA y crea el evento atómicamente", async () => {
  const database = createNonDeliveryDatabase();
  const repository = new WepNonDeliveryRepository({
    postgresPool: database.pool,
  });
  const position = {
    latitude: -31.372494,
    longitude: -58.019871,
    positionDate: "2026-09-12 11:20:00.000",
    speed: 0,
  };

  const result = await repository.markAsNotDelivered(101, {
    motivo: "CLIENTE_AUSENTE",
    observacion: "Se llamó y no respondió",
    position,
  }, 3);

  assert.deepEqual(result, {
    id: 101,
    estado: { codigo: "NO_ENTREGADA", nombre: "No entregada" },
    noEntregadoAt: NOT_DELIVERED_AT,
    motivo: "CLIENTE_AUSENTE",
    observacion: "Se llamó y no respondió",
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
  assert.match(update.sql, /no_entregado_at = NOW\(\)/);
  assert.match(update.sql, /no_entregado_motivo = \$2/);
  assert.match(update.sql, /no_entregado_observacion = \$3/);
  assert.match(update.sql, /no_entregado_latitud = \$4/);
  assert.match(update.sql, /no_entregado_longitud = \$5/);
  assert.match(update.sql, /updated_at = NOW\(\)/);
  assert.deepEqual(update.params, [
    6,
    "CLIENTE_AUSENTE",
    "Se llamó y no respondió",
    -31.372494,
    -58.019871,
    101,
    3,
    3,
  ]);

  const event = database.queries.find(({ sql }) =>
    sql.startsWith("INSERT INTO public.entrega_eventos"),
  );
  assert.match(event.sql, /'ENTREGA_NO_REALIZADA'/);
  assert.match(event.sql, /'VEHICULO'/);
  assert.match(event.sql, /latitud, longitud/);
  assert.deepEqual(event.params, [
    101,
    3,
    6,
    "Entrega no realizada. Motivo: CLIENTE_AUSENTE. Observación: Se llamó y no respondió",
    -31.372494,
    -58.019871,
    "3",
  ]);
});

test("admite CLIENTE_AVISADO y coordenadas nulas", async () => {
  const database = createNonDeliveryDatabase({ state: "CLIENTE_AVISADO" });
  const repository = new WepNonDeliveryRepository({
    postgresPool: database.pool,
  });

  const result = await repository.markAsNotDelivered(101, {
    motivo: "DOMICILIO_CERRADO",
  }, 3);

  assert.deepEqual(result.posicion, { latitud: null, longitud: null });
  assert.deepEqual(database.events, [
    [
      101,
      4,
      6,
      "Entrega no realizada. Motivo: DOMICILIO_CERRADO",
      null,
      null,
      "3",
    ],
  ]);
});

test("rechaza inexistente, NO_ENTREGADA, ENTREGADA y CANCELADA", async () => {
  const cases = [
    {
      database: createNonDeliveryDatabase({ deliveryExists: false }),
      error: WepPwaNoDeliveryNotFoundError,
      message: "Entrega no encontrada",
    },
    {
      database: createNonDeliveryDatabase({ state: "NO_ENTREGADA" }),
      error: WepPwaNoDeliveryStateConflictError,
      message: "La entrega ya fue marcada como no entregada",
    },
    {
      database: createNonDeliveryDatabase({ state: "ENTREGADA" }),
      error: WepPwaNoDeliveryStateConflictError,
      message:
        "La entrega no puede marcarse como no entregada en su estado actual",
    },
    {
      database: createNonDeliveryDatabase({ state: "CANCELADA" }),
      error: WepPwaNoDeliveryStateConflictError,
      message:
        "La entrega no puede marcarse como no entregada en su estado actual",
    },
  ];

  for (const testCase of cases) {
    const repository = new WepNonDeliveryRepository({
      postgresPool: testCase.database.pool,
    });
    await assert.rejects(
      repository.markAsNotDelivered(101, { motivo: "CLIENTE_AUSENTE" }, 3),
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

test("hace rollback si falla el registro del evento", async () => {
  const database = createNonDeliveryDatabase({ failOnEvent: true });
  const repository = new WepNonDeliveryRepository({
    postgresPool: database.pool,
  });

  await assert.rejects(
    repository.markAsNotDelivered(101, { motivo: "CLIENTE_AUSENTE" }, 3),
    /falló evento/,
  );
  assert.deepEqual(database.queries.slice(-2).map(({ sql }) => sql), [
    "ROLLBACK",
    "RELEASE",
  ]);
  assert.equal(
    database.queries.some(({ sql }) => sql === "COMMIT"),
    false,
  );
});

test("un segundo intento no duplica entrega_eventos", async () => {
  const database = createNonDeliveryDatabase();
  const repository = new WepNonDeliveryRepository({
    postgresPool: database.pool,
  });

  await repository.markAsNotDelivered(101, { motivo: "CLIENTE_AUSENTE" }, 3);
  await assert.rejects(
    repository.markAsNotDelivered(101, { motivo: "CLIENTE_AUSENTE" }, 3),
    (error) =>
      error instanceof WepPwaNoDeliveryStateConflictError &&
      error.message === "La entrega ya fue marcada como no entregada",
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

test("el service consulta GESTYA antes de abrir la operación transaccional", async () => {
  const calls = [];
  const position = {
    latitude: -31.372494,
    longitude: -58.019871,
    positionDate: "2026-09-12 11:20:00.000",
    speed: 0,
  };
  const service = new WepNonDeliveryService({
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
      async markAsNotDelivered(id, payload) {
        calls.push({ method: "markAsNotDelivered", id, payload });
        return {
          id,
          estado: { codigo: "NO_ENTREGADA", nombre: "No entregada" },
          noEntregadoAt: NOT_DELIVERED_AT,
          motivo: payload.motivo,
          observacion: payload.observacion,
          posicion: {
            latitud: payload.position.latitude,
            longitud: payload.position.longitude,
          },
        };
      },
    },
  });

  const result = await service.markAsNotDelivered(101, {
    motivo: "CLIENTE_AUSENTE",
    observacion: "Se llamó y no respondió",
  }, 3);

  assert.deepEqual(
    calls.map(({ method }) => method),
    ["getDeliveryContext", "gestya", "markAsNotDelivered"],
  );
  assert.equal(calls[1].plate, "AB172IK");
  assert.equal(calls[2].payload.position, position);
  assert.deepEqual(result.posicion, {
    latitud: -31.372494,
    longitud: -58.019871,
    obtenidaDesdeGestya: true,
  });
});

test("una falla de GESTYA continúa sin coordenadas", async () => {
  const logs = [];
  let receivedPosition = "sin asignar";
  const service = new WepNonDeliveryService({
    logger: {
      log(message) {
        logs.push(message);
      },
      warn(message) {
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
      async markAsNotDelivered(id, payload) {
        receivedPosition = payload.position;
        return {
          id,
          estado: { codigo: "NO_ENTREGADA", nombre: "No entregada" },
          noEntregadoAt: NOT_DELIVERED_AT,
          motivo: payload.motivo,
          observacion: payload.observacion,
          posicion: { latitud: null, longitud: null },
        };
      },
    },
  });

  const result = await service.markAsNotDelivered(101, {
    motivo: "SIN_ACCESO",
    observacion: null,
  }, 3);

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
  assert.equal(logs.includes("[WEP PWA] Continuando sin coordenadas"), true);
});

test("el service no consulta GESTYA para un estado inválido", async () => {
  let gestyaCalls = 0;
  let repositoryCalls = 0;
  const service = new WepNonDeliveryService({
    logger: { log() {}, error() {} },
    vehiclePositionService: {
      async getCurrentPositionByPlate() {
        gestyaCalls += 1;
      },
    },
    repository: {
      async getDeliveryContext() {
        return serviceDelivery({ estadoCodigo: "ENTREGADA" });
      },
      async markAsNotDelivered() {
        repositoryCalls += 1;
      },
    },
  });

  await assert.rejects(
    service.markAsNotDelivered(101, { motivo: "CLIENTE_AUSENTE" }, 3),
    WepPwaNoDeliveryStateConflictError,
  );
  assert.equal(gestyaCalls, 0);
  assert.equal(repositoryCalls, 0);
});

async function postNoEntregado(id, body, nonDeliveryService) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/wep",
    createWepRouter({ nonDeliveryService, wepAuth: testAuth }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const options = { method: "POST", headers: {} };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/pwa/entregas/${id}/no-entregado`,
      options,
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("POST no-entregado devuelve la respuesta esperada", async () => {
  const entrega = {
    id: 101,
    estado: { codigo: "NO_ENTREGADA", nombre: "No entregada" },
    noEntregadoAt: "2026-09-12T14:20:00.000Z",
    motivo: "CLIENTE_AUSENTE",
    observacion: "Se llamó y no respondió",
    posicion: {
      latitud: -31.372494,
      longitud: -58.019871,
      obtenidaDesdeGestya: true,
    },
  };
  const result = await postNoEntregado(
    101,
    {
      motivo: " CLIENTE_AUSENTE ",
      observacion: " Se llamó y no respondió ",
    },
    {
      async markAsNotDelivered(id, payload) {
        assert.equal(id, 101);
        assert.deepEqual(payload, {
          motivo: "CLIENTE_AUSENTE",
          observacion: "Se llamó y no respondió",
        });
        return entrega;
      },
    },
  );

  assert.deepEqual(result, {
    status: 200,
    body: {
      ok: true,
      message: "Entrega marcada como no entregada",
      entrega,
    },
  });
});

test("POST no-entregado valida id, motivo y observación", async () => {
  let called = false;
  const service = {
    async markAsNotDelivered() {
      called = true;
    },
  };

  for (const id of ["abc", "0", "-1", "1.5"]) {
    const result = await postNoEntregado(
      id,
      { motivo: "CLIENTE_AUSENTE" },
      service,
    );
    assert.deepEqual(result, {
      status: 400,
      body: {
        ok: false,
        message: "El id de entrega debe ser un número entero válido",
      },
    });
  }

  for (const body of [undefined, {}, { motivo: 1 }, { motivo: "LIBRE" }]) {
    const result = await postNoEntregado(101, body, service);
    assert.deepEqual(result, {
      status: 400,
      body: { ok: false, message: "El motivo de no entrega no es válido" },
    });
  }

  const otherWithoutObservation = await postNoEntregado(
    101,
    { motivo: "OTRO", observacion: "   " },
    service,
  );
  assert.deepEqual(otherWithoutObservation, {
    status: 400,
    body: {
      ok: false,
      message: "Debe indicar una observación para el motivo OTRO",
    },
  });

  const nonStringObservation = await postNoEntregado(
    101,
    { motivo: "SIN_ACCESO", observacion: 123 },
    service,
  );
  assert.deepEqual(nonStringObservation, {
    status: 400,
    body: { ok: false, message: "La observación debe ser un texto" },
  });

  const nullObservation = await postNoEntregado(
    101,
    { motivo: "SIN_ACCESO", observacion: null },
    service,
  );
  assert.deepEqual(nullObservation, {
    status: 400,
    body: { ok: false, message: "La observación debe ser un texto" },
  });

  const longObservation = await postNoEntregado(
    101,
    { motivo: "SIN_ACCESO", observacion: "a".repeat(501) },
    service,
  );
  assert.deepEqual(longObservation, {
    status: 400,
    body: {
      ok: false,
      message: "La observación no puede superar los 500 caracteres",
    },
  });
  assert.equal(called, false);
});

test("POST no-entregado mapea inexistencia y conflictos", async () => {
  const missing = await postNoEntregado(
    999,
    { motivo: "CLIENTE_AUSENTE" },
    {
      async markAsNotDelivered() {
        throw new WepPwaNoDeliveryNotFoundError("Entrega no encontrada");
      },
    },
  );
  assert.deepEqual(missing, {
    status: 404,
    body: { ok: false, message: "Entrega no encontrada" },
  });

  for (const message of [
    "La entrega ya fue marcada como no entregada",
    "La entrega no puede marcarse como no entregada en su estado actual",
  ]) {
    const conflict = await postNoEntregado(
      101,
      { motivo: "CLIENTE_AUSENTE" },
      {
        async markAsNotDelivered() {
          throw new WepPwaNoDeliveryStateConflictError(message);
        },
      },
    );
    assert.deepEqual(conflict, {
      status: 409,
      body: { ok: false, message },
    });
  }
});

test("el script SQL agrega únicamente los cinco campos requeridos", () => {
  const migration = readFileSync(
    new URL(
      "../../../database/20260912_add_wep_no_entregado_fields.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /ALTER TABLE public\.entregas/);
  assert.match(migration, /no_entregado_at TIMESTAMPTZ/);
  assert.match(migration, /no_entregado_motivo VARCHAR\(100\)/);
  assert.match(migration, /no_entregado_observacion TEXT/);
  assert.match(migration, /no_entregado_latitud NUMERIC\(10,7\)/);
  assert.match(migration, /no_entregado_longitud NUMERIC\(10,7\)/);
  assert.equal((migration.match(/ADD COLUMN/g) || []).length, 5);
});
