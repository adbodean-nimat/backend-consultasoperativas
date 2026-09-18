import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  GESTYA_ERROR_CODES,
  GestyaError,
  GestyaService,
} from "./gestya.service.js";
import { createWepRouter } from "./wep.routes.js";

const testAuth = (_request, _response, next) => next();

const ENV = {
  GESTYA_URL: "https://gestya.test/WS_Colven.jss",
  GESTYA_USER: "usuario-test",
  GESTYA_PASSWORD: "password-test",
  GESTYA_TIMEOUT_MS: "7500",
};

const RAW_VEHICLE = {
  nombre: "M%20BENZ%20(AB%20172%20IK)",
  alias: "M%20BENZ%20(AB%20172%20IK)",
  patente: "AB172IK",
  gps: "no-debe-exponerse",
  id: "56906",
  gps_id: "41911",
  detenido_desde: "2026-09-01%2009:00:42.000",
  latitud: "-31.372494",
  longitud: "-58.019871",
  fecha: "2026-09-01%2009:14:22.000",
  sentido: "2",
  velocidad: "0",
  evento: "0",
  odometro: "111334088",
};

const SILENT_LOGGER = { log() {}, error() {} };

function serviceWithResponse(response, capture = {}) {
  return new GestyaService({
    env: ENV,
    logger: SILENT_LOGGER,
    httpClient: {
      async post(url, data, config) {
        Object.assign(capture, { url, data, config });
        return response;
      },
    },
  });
}

async function getPosition(vehiclePositionService, plate = "AB172IK") {
  const app = express();
  app.use(
    "/api/wep",
    createWepRouter({ vehiclePositionService, technicalAuth: testAuth }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/gestya/vehiculos/${plate}/posicion`,
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("consulta DATOSACTUALESV2 y devuelve la posición normalizada", async () => {
  const capture = {};
  const service = serviceWithResponse(
    { status: 200, data: [RAW_VEHICLE] },
    capture,
  );

  const vehicle = await service.getCurrentPositionByPlate(" ab 172 ik ");

  assert.equal(capture.url, ENV.GESTYA_URL);
  assert.deepEqual(capture.data, {
    action: "DATOSACTUALESV2",
    user: ENV.GESTYA_USER,
    pwd: ENV.GESTYA_PASSWORD,
    tipoID: "patente",
    vehiculos: ["AB172IK"],
    output: ["la", "lo", "fp", "se", "ve", "ev", "od"],
  });
  assert.equal(capture.config.timeout, 7500);
  assert.deepEqual(capture.config.headers, {
    "Content-Type": "application/json",
  });
  assert.deepEqual(vehicle, {
    name: "M BENZ (AB 172 IK)",
    alias: "M BENZ (AB 172 IK)",
    plate: "AB172IK",
    latitude: -31.372494,
    longitude: -58.019871,
    positionDate: "2026-09-01 09:14:22.000",
    stoppedSince: "2026-09-01 09:00:42.000",
    heading: 2,
    speed: 0,
    event: 0,
    odometer: 111334088,
  });
  assert.equal("gps" in vehicle, false);
  assert.equal("gps_id" in vehicle, false);
  assert.equal("id" in vehicle, false);
});

test("rechaza una patente vacía antes de consultar GESTYA", async () => {
  let called = false;
  const service = new GestyaService({
    env: ENV,
    logger: SILENT_LOGGER,
    httpClient: {
      async post() {
        called = true;
      },
    },
  });

  await assert.rejects(
    service.getCurrentPositionByPlate("   "),
    (error) =>
      error instanceof GestyaError &&
      error.code === GESTYA_ERROR_CODES.INVALID_PLATE,
  );
  assert.equal(called, false);
});

test("no consulta al proveedor cuando faltan las credenciales", async () => {
  let called = false;
  const service = new GestyaService({
    env: {},
    logger: SILENT_LOGGER,
    httpClient: {
      async post() {
        called = true;
      },
    },
  });

  await assert.rejects(
    service.getCurrentPositionByPlate("AB172IK"),
    (error) =>
      error instanceof GestyaError &&
      error.code === GESTYA_ERROR_CODES.CONFIG_ERROR,
  );
  assert.equal(called, false);
});

test("diferencia vehículo inexistente, HTTP inválido y timeout", async () => {
  const cases = [
    {
      service: serviceWithResponse({ status: 200, data: [] }),
      code: GESTYA_ERROR_CODES.VEHICLE_NOT_FOUND,
    },
    {
      service: serviceWithResponse({ status: 503, data: { error: "privado" } }),
      code: GESTYA_ERROR_CODES.HTTP_ERROR,
    },
    {
      service: new GestyaService({
        env: ENV,
        logger: SILENT_LOGGER,
        httpClient: {
          async post() {
            const error = new Error("timeout of 7500ms exceeded");
            error.code = "ECONNABORTED";
            throw error;
          },
        },
      }),
      code: GESTYA_ERROR_CODES.TIMEOUT,
    },
  ];

  for (const testCase of cases) {
    await assert.rejects(
      testCase.service.getCurrentPositionByPlate("AB172IK"),
      (error) =>
        error instanceof GestyaError && error.code === testCase.code,
    );
  }
});

test("rechaza estructuras y coordenadas inválidas sin devolver NaN", async () => {
  const invalidResponses = [
    { status: 200, data: {} },
    { status: 200, data: [null] },
    { status: 200, data: [{ ...RAW_VEHICLE, latitud: "   " }] },
    { status: 200, data: [{ ...RAW_VEHICLE, longitud: "no-numérica" }] },
  ];

  for (const response of invalidResponses) {
    await assert.rejects(
      serviceWithResponse(response).getCurrentPositionByPlate("AB172IK"),
      (error) =>
        error instanceof GestyaError &&
        error.code === GESTYA_ERROR_CODES.INVALID_RESPONSE,
    );
  }

  const vehicle = await serviceWithResponse({
    status: 200,
    data: [{ ...RAW_VEHICLE, sentido: "desconocido", odometro: "   " }],
  }).getCurrentPositionByPlate("AB172IK");
  assert.equal(vehicle.heading, null);
  assert.equal(vehicle.odometer, null);
});

test("el endpoint normaliza la patente y devuelve 200 sin credenciales", async () => {
  const vehiclePositionService = {
    async getCurrentPositionByPlate(plate) {
      assert.equal(plate, "AB172IK");
      return {
        plate,
        latitude: -31.372494,
        longitude: -58.019871,
      };
    },
  };

  const result = await getPosition(vehiclePositionService, "AB%20172%20IK");
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.vehicle.plate, "AB172IK");
  assert.match(result.body.serverTime, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(JSON.stringify(result.body).includes(ENV.GESTYA_USER), false);
  assert.equal(JSON.stringify(result.body).includes(ENV.GESTYA_PASSWORD), false);
});

test("el endpoint mapea validación, inexistencia, timeout y proveedor", async () => {
  const cases = [
    {
      error: new GestyaError("La patente es obligatoria", {
        code: GESTYA_ERROR_CODES.INVALID_PLATE,
      }),
      status: 400,
      message: "La patente es obligatoria",
      plate: "%20",
    },
    {
      error: new GestyaError("detalle interno", {
        code: GESTYA_ERROR_CODES.VEHICLE_NOT_FOUND,
      }),
      status: 404,
      message: "Vehículo no encontrado en GESTYA",
    },
    {
      error: new GestyaError("detalle interno", {
        code: GESTYA_ERROR_CODES.TIMEOUT,
      }),
      status: 504,
      message: "No se pudo consultar la posición del vehículo en GESTYA",
    },
    {
      error: new GestyaError("password=secreto", {
        code: GESTYA_ERROR_CODES.HTTP_ERROR,
      }),
      status: 502,
      message: "No se pudo consultar la posición del vehículo en GESTYA",
    },
  ];

  for (const testCase of cases) {
    const result = await getPosition(
      {
        async getCurrentPositionByPlate() {
          throw testCase.error;
        },
      },
      testCase.plate,
    );

    assert.deepEqual(result, {
      status: testCase.status,
      body: { ok: false, message: testCase.message },
    });
  }
});
