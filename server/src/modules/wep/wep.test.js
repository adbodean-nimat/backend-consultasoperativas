import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { WepRepository } from "./wep.repository.js";
import {
  WepPwaEntregaMismatchError,
  WepPwaOrdenIncompletoError,
  WepPwaViajeNotFoundError,
  WepPwaViajePendingDeliveriesError,
  WepPwaViajeStateConflictError,
  WepPwaViajeWithoutDeliveriesError,
} from "./wep-pwa.repository.js";
import { createWepRouter } from "./wep.routes.js";
import {
  validateEntregasProgramadasBody,
  validateEntregasProgramadasQuery,
  validatePwaEntregaId,
  validatePwaOrdenBody,
  validatePwaViajeId,
  validatePwaViajesQuery,
  WepValidationError,
} from "./wep.validator.js";

const DATE_ERROR_MESSAGE =
  "Los parámetros fechaDesde y fechaHasta son obligatorios y deben tener formato YYYY-MM-DD";

function testAuth(request, _response, next) {
  request.wepVehicle = {
    id: 3,
    codigoErp: "001",
    nombre: "M BENZ",
    patente: "AB172IK",
  };
  next();
}

async function requestRouter(repository, query = "") {
  const app = express();
  app.use("/api/wep", createWepRouter({ repository, technicalAuth: testAuth }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/entregas-programadas${query}`,
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postSync(syncService, body) {
  const app = express();
  app.use(express.json());
  app.use("/api/wep", createWepRouter({ syncService, technicalAuth: testAuth }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/sync/entregas-programadas`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function requestPwa(pwaRepository, query = "") {
  const app = express();
  app.use("/api/wep", createWepRouter({ pwaRepository, wepAuth: testAuth }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/pwa/viajes${query}`,
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function requestPwaEntrega(pwaRepository, id) {
  const app = express();
  app.use("/api/wep", createWepRouter({ pwaRepository, wepAuth: testAuth }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/pwa/entregas/${id}`,
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function putPwaOrden(pwaRepository, viajeId, body) {
  const app = express();
  app.use(express.json());
  app.use("/api/wep", createWepRouter({ pwaRepository, wepAuth: testAuth }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/pwa/viajes/${viajeId}/orden`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postPwaIniciar(pwaRepository, viajeId) {
  const app = express();
  app.use("/api/wep", createWepRouter({ pwaRepository, wepAuth: testAuth }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/pwa/viajes/${viajeId}/iniciar`,
      { method: "POST" },
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postPwaFinalizar(pwaRepository, viajeId) {
  const app = express();
  app.use("/api/wep", createWepRouter({ pwaRepository, wepAuth: testAuth }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/pwa/viajes/${viajeId}/finalizar`,
      { method: "POST" },
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("valida y normaliza los filtros de entregas programadas", () => {
  assert.deepEqual(
    validateEntregasProgramadasQuery({
      fechaDesde: "2026-09-11",
      fechaHasta: "2026-09-12",
      vehiculo: " 001 ",
      vuelta: "1",
    }),
    {
      fechaDesde: "2026-09-11",
      fechaHasta: "2026-09-12",
      vehiculo: "001",
      vuelta: 1,
    },
  );
});

test("rechaza fechas faltantes, inexistentes o en orden inverso", () => {
  for (const query of [
    {},
    { fechaDesde: "2026-02-30", fechaHasta: "2026-03-01" },
    { fechaDesde: "2026-09-12", fechaHasta: "2026-09-11" },
  ]) {
    assert.throws(
      () => validateEntregasProgramadasQuery(query),
      (error) =>
        error instanceof WepValidationError &&
        error.message === DATE_ERROR_MESSAGE,
    );
  }
});

test("rechaza una vuelta que no sea un entero válido", () => {
  assert.throws(
    () =>
      validateEntregasProgramadasQuery({
        fechaDesde: "2026-09-11",
        fechaHasta: "2026-09-11",
        vuelta: "1.5",
      }),
    (error) =>
      error instanceof WepValidationError &&
      error.message === "El parámetro vuelta debe ser un número entero válido",
  );
});

test("valida y normaliza el body de sincronización", () => {
  assert.deepEqual(
    validateEntregasProgramadasBody({
      fechaDesde: "2026-09-11",
      fechaHasta: "2026-09-12",
      vehiculo: " 001 ",
      vuelta: 1,
    }),
    {
      fechaDesde: "2026-09-11",
      fechaHasta: "2026-09-12",
      vehiculo: "001",
      vuelta: 1,
    },
  );

  assert.deepEqual(
    validateEntregasProgramadasBody({
      fechaDesde: "2026-09-11",
      fechaHasta: "2026-09-11",
      vehiculo: null,
      vuelta: null,
    }),
    {
      fechaDesde: "2026-09-11",
      fechaHasta: "2026-09-11",
      vehiculo: null,
      vuelta: null,
    },
  );
});

test("el repositorio parametriza y ejecuta el Stored Procedure", async () => {
  const inputs = [];
  let executed;
  let closed = false;
  const request = {
    input(name, type, value) {
      inputs.push({ name, type, value });
      return this;
    },
    async execute(name) {
      executed = name;
      return { recordset: [{ Estado: "Remitidos" }] };
    },
  };
  const connection = {
    request: () => request,
    async close() {
      closed = true;
    },
  };
  const repository = new WepRepository({
    poolFactory: () => ({ connect: async () => connection }),
  });

  const rows = await repository.getEntregasProgramadas({
    fechaDesde: "2026-09-11",
    fechaHasta: "2026-09-11",
    vehiculo: null,
    vuelta: 0,
  });

  assert.equal(executed, "dbo.sp_entregas_programadas");
  assert.deepEqual(
    inputs.map(({ name, value }) => ({ name, value })),
    [
      { name: "FechaDesde", value: "2026-09-11" },
      { name: "FechaHasta", value: "2026-09-11" },
      { name: "Vehiculo", value: null },
      { name: "Vuelta", value: 0 },
    ],
  );
  assert.deepEqual(rows, [{ Estado: "Remitidos" }]);
  assert.equal(closed, true);
});

test("el endpoint responde 400 cuando faltan las fechas", async () => {
  const result = await requestRouter({
    getEntregasProgramadas: async () => {
      throw new Error("No debe consultar SQL Server");
    },
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, {
    ok: false,
    message: DATE_ERROR_MESSAGE,
  });
});

test("el endpoint conserva los aliases devueltos por SQL Server", async () => {
  const row = { Estado: "Remitidos", CodigoVehiculo: "001", Vuelta: 1 };
  const result = await requestRouter(
    { getEntregasProgramadas: async () => [row] },
    "?fechaDesde=2026-09-11&fechaHasta=2026-09-11&vehiculo=001&vuelta=1",
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, total: 1, rows: [row] });
});

test("el endpoint no expone detalles de un error SQL Server", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await requestRouter(
      {
        getEntregasProgramadas: async () => {
          throw new Error("password=secreto; server=interno");
        },
      },
      "?fechaDesde=2026-09-11&fechaHasta=2026-09-11",
    );

    assert.equal(result.status, 500);
    assert.deepEqual(result.body, {
      ok: false,
      message: "Ocurrió un error al obtener las entregas programadas",
    });
  } finally {
    console.error = originalConsoleError;
  }
});

test("el endpoint POST valida el body y ejecuta el servicio de sincronización", async () => {
  let received;
  const expected = {
    ok: true,
    message: "Sincronización completada",
    sourceRows: 0,
    vehiculos: { procesados: 0 },
    viajes: { procesados: 0 },
    entregas: { procesadas: 0, insertadas: 0, actualizadas: 0 },
    filasOmitidas: 0,
    resumenOmisiones: {},
  };
  const result = await postSync(
    {
      async synchronize(filters) {
        received = filters;
        return expected;
      },
    },
    {
      fechaDesde: "2026-09-11",
      fechaHasta: "2026-09-11",
      vehiculo: "001",
      vuelta: 1,
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, expected);
  assert.deepEqual(received, {
    fechaDesde: "2026-09-11",
    fechaHasta: "2026-09-11",
    vehiculo: "001",
    vuelta: 1,
  });
});

test("el endpoint POST rechaza fechas faltantes sin ejecutar la sincronización", async () => {
  let called = false;
  const result = await postSync(
    {
      async synchronize() {
        called = true;
      },
    },
    {},
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.message, DATE_ERROR_MESSAGE);
  assert.equal(called, false);
});

test("valida y normaliza los filtros de viajes para la PWA", () => {
  assert.deepEqual(
    validatePwaViajesQuery({
      fecha: "2026-09-11",
      vehiculo: " AB172IK ",
    }),
    { fecha: "2026-09-11", vehiculo: "AB172IK" },
  );
});

test("el endpoint PWA rechaza una fecha faltante", async () => {
  let called = false;
  const result = await requestPwa({
    async getPwaViajes() {
      called = true;
    },
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, {
    ok: false,
    message: "El parámetro fecha es obligatorio",
  });
  assert.equal(called, false);
});

test("el endpoint PWA rechaza una fecha con formato inválido", async () => {
  const result = await requestPwa(
    {
      async getPwaViajes() {
        throw new Error("No debe consultar PostgreSQL");
      },
    },
    "?fecha=11-09-2026",
  );

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, {
    ok: false,
    message: "El parámetro fecha debe tener formato YYYY-MM-DD",
  });
});

test("el endpoint PWA devuelve viajes agrupados y sus totales", async () => {
  let received;
  const viajes = [
    {
      id: 10,
      numeroVuelta: 1,
      estado: "PROGRAMADO",
      iniciadoAt: null,
      finalizadoAt: null,
      vehiculo: {
        id: 3,
        codigoErp: "001",
        nombre: "M BENZ",
        patente: "AB172IK",
      },
      paradas: [
        { entregas: [{ id: 101 }, { id: 102 }] },
      ],
    },
    {
      id: 11,
      numeroVuelta: 2,
      estado: "PROGRAMADO",
      iniciadoAt: null,
      finalizadoAt: null,
      vehiculo: {
        id: 3,
        codigoErp: "001",
        nombre: "M BENZ",
        patente: "AB172IK",
      },
      paradas: [],
    },
  ];
  const result = await requestPwa(
    {
      async getPwaViajes(fecha, vehiculo) {
        received = { fecha, vehiculo };
        return viajes;
      },
    },
    "?fecha=2026-09-11&vehiculo=AB172IK",
  );

  assert.equal(result.status, 200);
  assert.deepEqual(received, {
    fecha: "2026-09-11",
    vehiculo: 3,
  });
  assert.deepEqual(result.body, {
    ok: true,
    fecha: "2026-09-11",
    totalViajes: 2,
    totalParadas: 1,
    totalEntregas: 2,
    viajes,
  });
});

test("el endpoint PWA no expone detalles de un error PostgreSQL", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await requestPwa(
      {
        async getPwaViajes() {
          throw new Error("password=secreto; host=interno; SELECT privado");
        },
      },
      "?fecha=2026-09-11",
    );

    assert.equal(result.status, 500);
    assert.deepEqual(result.body, {
      ok: false,
      message: "Ocurrió un error al obtener los viajes programados",
    });
  } finally {
    console.error = originalConsoleError;
  }
});

test("valida y normaliza el id de una entrega de la PWA", () => {
  assert.equal(validatePwaEntregaId("101"), 101);

  for (const id of [undefined, "", "abc", "0", "-1", "1.5", "1e2"]) {
    assert.throws(
      () => validatePwaEntregaId(id),
      (error) =>
        error instanceof WepValidationError &&
        error.message ===
          "El id de entrega debe ser un número entero válido",
    );
  }
});

test("el endpoint de detalle PWA devuelve una entrega", async () => {
  let receivedId;
  const entrega = {
    id: 101,
    contacto: {
      telefono: "3450000000",
      telefonoAlternativo: "3451111111",
      email: "cliente@example.com",
    },
  };
  const result = await requestPwaEntrega(
    {
      async getPwaEntregaDetalle(id) {
        receivedId = id;
        return entrega;
      },
    },
    "101",
  );

  assert.equal(result.status, 200);
  assert.equal(receivedId, 101);
  assert.deepEqual(result.body, { ok: true, entrega });
});

test("el endpoint de detalle PWA responde 404 si la entrega no existe", async () => {
  const result = await requestPwaEntrega(
    { getPwaEntregaDetalle: async () => null },
    "999999999",
  );

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, {
    ok: false,
    message: "Entrega no encontrada",
  });
});

test("el endpoint de detalle PWA rechaza un id inválido", async () => {
  let called = false;
  const result = await requestPwaEntrega(
    {
      async getPwaEntregaDetalle() {
        called = true;
      },
    },
    "abc",
  );

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, {
    ok: false,
    message: "El id de entrega debe ser un número entero válido",
  });
  assert.equal(called, false);
});

test("el endpoint de detalle PWA no expone errores PostgreSQL", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await requestPwaEntrega(
      {
        async getPwaEntregaDetalle() {
          throw new Error("password=secreto; host=interno; SELECT privado");
        },
      },
      "101",
    );

    assert.equal(result.status, 500);
    assert.deepEqual(result.body, {
      ok: false,
      message: "Ocurrió un error al obtener el detalle de la entrega",
    });
  } finally {
    console.error = originalConsoleError;
  }
});

test("valida el viaje y el body del reordenamiento PWA", () => {
  assert.equal(validatePwaViajeId("10"), 10);
  assert.deepEqual(
    validatePwaOrdenBody({
      entregas: [
        { id: 103, orden: 1 },
        { id: 101, orden: 2 },
      ],
    }),
    {
      entregas: [
        { id: 103, orden: 1 },
        { id: 101, orden: 2 },
      ],
    },
  );

  for (const id of [undefined, "", "abc", "0", "-1", "1.5", "1e2"]) {
    assert.throws(
      () => validatePwaViajeId(id),
      (error) =>
        error instanceof WepValidationError &&
        error.message === "El id de viaje debe ser un número entero válido",
    );
  }
});

test("rechaza bodies inválidos, ids repetidos y órdenes repetidos", () => {
  for (const body of [undefined, {}, { entregas: null }, { entregas: [] }]) {
    assert.throws(
      () => validatePwaOrdenBody(body),
      (error) => error instanceof WepValidationError,
    );
  }

  for (const entrega of [
    {},
    { id: 0, orden: 1 },
    { id: -1, orden: 1 },
    { id: 1.5, orden: 1 },
    { id: "1", orden: 1 },
  ]) {
    assert.throws(
      () => validatePwaOrdenBody({ entregas: [entrega] }),
      /Cada entrega debe tener un id entero positivo/,
    );
  }

  for (const entrega of [
    { id: 1 },
    { id: 1, orden: 0 },
    { id: 1, orden: -1 },
    { id: 1, orden: 1.5 },
    { id: 1, orden: "1" },
  ]) {
    assert.throws(
      () => validatePwaOrdenBody({ entregas: [entrega] }),
      /Cada entrega debe tener un orden entero positivo/,
    );
  }

  assert.throws(
    () =>
      validatePwaOrdenBody({
        entregas: [
          { id: 101, orden: 1 },
          { id: 101, orden: 2 },
        ],
      }),
    /No se pueden repetir ids de entregas/,
  );
  assert.throws(
    () =>
      validatePwaOrdenBody({
        entregas: [
          { id: 101, orden: 1 },
          { id: 102, orden: 1 },
        ],
      }),
    /No se pueden repetir valores de orden/,
  );
});

test("el PUT PWA actualiza el orden completo y responde ordenado", async () => {
  let received;
  const result = await putPwaOrden(
    {
      async updatePwaViajeOrden(viajeId, entregas) {
        received = { viajeId, entregas };
        return [
          { id: 103, ordenSecuencia: 1 },
          { id: 101, ordenSecuencia: 2 },
          { id: 102, ordenSecuencia: 3 },
        ];
      },
    },
    "10",
    {
      entregas: [
        { id: 103, orden: 1 },
        { id: 101, orden: 2 },
        { id: 102, orden: 3 },
      ],
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(received, {
    viajeId: 10,
    entregas: [
      { id: 103, orden: 1 },
      { id: 101, orden: 2 },
      { id: 102, orden: 3 },
    ],
  });
  assert.deepEqual(result.body, {
    ok: true,
    message: "Orden de entregas actualizado",
    viajeId: 10,
    totalEntregas: 3,
    entregas: [
      { id: 103, ordenSecuencia: 1 },
      { id: 101, ordenSecuencia: 2 },
      { id: 102, ordenSecuencia: 3 },
    ],
  });
});

test("el PUT PWA rechaza id inválido, body vacío y orden duplicado", async () => {
  let called = false;
  const repository = {
    async updatePwaViajeOrden() {
      called = true;
    },
  };

  const invalidId = await putPwaOrden(repository, "abc", {
    entregas: [{ id: 101, orden: 1 }],
  });
  assert.equal(invalidId.status, 400);
  assert.deepEqual(invalidId.body, {
    ok: false,
    message: "El id de viaje debe ser un número entero válido",
  });

  const emptyBody = await putPwaOrden(repository, "10", {});
  assert.equal(emptyBody.status, 400);

  const duplicateOrder = await putPwaOrden(repository, "10", {
    entregas: [
      { id: 101, orden: 1 },
      { id: 102, orden: 1 },
    ],
  });
  assert.equal(duplicateOrder.status, 400);
  assert.equal(called, false);
});

test("el PUT PWA diferencia viaje inexistente, entrega ajena y orden incompleto", async () => {
  const cases = [
    {
      error: new WepPwaViajeNotFoundError(),
      status: 404,
      message: "Viaje no encontrado",
    },
    {
      error: new WepPwaEntregaMismatchError(
        "Una o más entregas no pertenecen al viaje indicado",
      ),
      status: 400,
      message: "Una o más entregas no pertenecen al viaje indicado",
    },
    {
      error: new WepPwaOrdenIncompletoError(
        "Debe enviarse el orden completo de las entregas del viaje",
      ),
      status: 400,
      message: "Debe enviarse el orden completo de las entregas del viaje",
    },
  ];

  for (const testCase of cases) {
    const result = await putPwaOrden(
      {
        async updatePwaViajeOrden() {
          throw testCase.error;
        },
      },
      "10",
      { entregas: [{ id: 101, orden: 1 }] },
    );

    assert.equal(result.status, testCase.status);
    assert.deepEqual(result.body, {
      ok: false,
      message: testCase.message,
    });
  }
});

test("el POST PWA inicia el viaje sin requerir body", async () => {
  let receivedId;
  const result = await postPwaIniciar(
    {
      async startPwaViaje(viajeId) {
        receivedId = viajeId;
        return {
          viaje: {
            id: 10,
            estado: "EN_REPARTO",
            iniciadoAt: "2026-09-11T15:30:00.000Z",
          },
          entregasActualizadas: 5,
        };
      },
    },
    "10",
  );

  assert.equal(receivedId, 10);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    ok: true,
    message: "Viaje iniciado correctamente",
    viaje: {
      id: 10,
      estado: "EN_REPARTO",
      iniciadoAt: "2026-09-11T15:30:00.000Z",
    },
    entregasActualizadas: 5,
  });
});

test("el POST PWA rechaza un viajeId inválido sin consultar PostgreSQL", async () => {
  let called = false;
  const result = await postPwaIniciar(
    {
      async startPwaViaje() {
        called = true;
      },
    },
    "abc",
  );

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, {
    ok: false,
    message: "El id de viaje debe ser un número entero válido",
  });
  assert.equal(called, false);
});

test("el POST PWA diferencia viaje inexistente y conflictos de inicio", async () => {
  const cases = [
    {
      error: new WepPwaViajeNotFoundError(),
      status: 404,
      message: "Viaje no encontrado",
    },
    {
      error: new WepPwaViajeStateConflictError(
        "El viaje ya se encuentra en reparto",
      ),
      status: 409,
      message: "El viaje ya se encuentra en reparto",
    },
    {
      error: new WepPwaViajeStateConflictError(
        "El viaje ya se encuentra finalizado",
      ),
      status: 409,
      message: "El viaje ya se encuentra finalizado",
    },
    {
      error: new WepPwaViajeWithoutDeliveriesError(
        "El viaje no tiene entregas asignadas",
      ),
      status: 409,
      message: "El viaje no tiene entregas asignadas",
    },
  ];

  for (const testCase of cases) {
    const result = await postPwaIniciar(
      {
        async startPwaViaje() {
          throw testCase.error;
        },
      },
      "10",
    );

    assert.equal(result.status, testCase.status);
    assert.deepEqual(result.body, {
      ok: false,
      message: testCase.message,
    });
  }
});

test("el POST PWA no expone detalles de errores PostgreSQL", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await postPwaIniciar(
      {
        async startPwaViaje() {
          throw new Error("password=secreto; host=interno; SELECT privado");
        },
      },
      "10",
    );

    assert.equal(result.status, 500);
    assert.deepEqual(result.body, {
      ok: false,
      message: "Ocurrió un error al iniciar el viaje",
    });
  } finally {
    console.error = originalConsoleError;
  }
});

test("el POST PWA finaliza el viaje y devuelve su resumen", async () => {
  let receivedId;
  const result = await postPwaFinalizar(
    {
      async finishPwaViaje(viajeId) {
        receivedId = viajeId;
        return {
          viaje: {
            id: 10,
            estado: "FINALIZADO",
            iniciadoAt: "2026-09-12T12:00:00.000Z",
            finalizadoAt: "2026-09-12T16:30:00.000Z",
          },
          resumen: {
            totalEntregas: 8,
            entregadas: 6,
            noEntregadas: 2,
            canceladas: 0,
          },
        };
      },
    },
    "10",
  );

  assert.equal(receivedId, 10);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    ok: true,
    message: "Viaje finalizado correctamente",
    viaje: {
      id: 10,
      estado: "FINALIZADO",
      iniciadoAt: "2026-09-12T12:00:00.000Z",
      finalizadoAt: "2026-09-12T16:30:00.000Z",
    },
    resumen: {
      totalEntregas: 8,
      entregadas: 6,
      noEntregadas: 2,
      canceladas: 0,
    },
  });
});

test("el POST finalizar valida viajeId antes de consultar PostgreSQL", async () => {
  let called = false;
  const result = await postPwaFinalizar(
    {
      async finishPwaViaje() {
        called = true;
      },
    },
    "0",
  );

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, {
    ok: false,
    message: "El id de viaje debe ser un número entero válido",
  });
  assert.equal(called, false);
});

test("el POST finalizar informa entregas pendientes sin datos sensibles", async () => {
  const result = await postPwaFinalizar(
    {
      async finishPwaViaje() {
        throw new WepPwaViajePendingDeliveriesError([
          { id: 101, estado: "EN_REPARTO" },
          { id: 102, estado: "CLIENTE_AVISADO" },
        ]);
      },
    },
    "10",
  );

  assert.equal(result.status, 409);
  assert.deepEqual(result.body, {
    ok: false,
    message: "El viaje todavía tiene entregas pendientes",
    pendientes: 2,
    entregasPendientes: [
      { id: 101, estado: "EN_REPARTO" },
      { id: 102, estado: "CLIENTE_AVISADO" },
    ],
  });
  assert.equal(JSON.stringify(result.body).includes("cliente"), false);
});

test("el POST finalizar mapea inexistencia y conflictos", async () => {
  const cases = [
    {
      error: new WepPwaViajeNotFoundError(),
      status: 404,
      message: "Viaje no encontrado",
    },
    {
      error: new WepPwaViajeStateConflictError(
        "El viaje todavía no fue iniciado",
      ),
      status: 409,
      message: "El viaje todavía no fue iniciado",
    },
    {
      error: new WepPwaViajeStateConflictError(
        "El viaje ya se encuentra finalizado",
      ),
      status: 409,
      message: "El viaje ya se encuentra finalizado",
    },
    {
      error: new WepPwaViajeWithoutDeliveriesError(
        "El viaje no tiene entregas asignadas",
      ),
      status: 409,
      message: "El viaje no tiene entregas asignadas",
    },
  ];

  for (const testCase of cases) {
    const result = await postPwaFinalizar(
      {
        async finishPwaViaje() {
          throw testCase.error;
        },
      },
      "10",
    );

    assert.equal(result.status, testCase.status);
    assert.deepEqual(result.body, {
      ok: false,
      message: testCase.message,
    });
  }
});

test("el POST finalizar no expone detalles de errores PostgreSQL", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await postPwaFinalizar(
      {
        async finishPwaViaje() {
          throw new Error("password=secreto; host=interno; SELECT privado");
        },
      },
      "10",
    );

    assert.equal(result.status, 500);
    assert.deepEqual(result.body, {
      ok: false,
      message: "Ocurrió un error al finalizar el viaje",
    });
  } finally {
    console.error = originalConsoleError;
  }
});
