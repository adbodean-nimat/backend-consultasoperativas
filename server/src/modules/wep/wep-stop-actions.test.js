import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  WepPwaEntregaNoticeConflictError,
  WepPwaEntregaPhoneConflictError,
} from "./wep-client-notice.repository.js";
import { WepPwaWhatsappError } from "./wep-client-notice.service.js";
import {
  validateStopOperation,
  WepPwaStopForbiddenError,
  WepPwaStopNotFoundError,
  WepPwaStopStateConflictError,
  WepPwaStopViajeNotFoundError,
  WepStopActionsRepository,
} from "./wep-stop-actions.repository.js";
import {
  WepEtaUnavailableError,
  WepStopActionsService,
} from "./wep-stop-actions.service.js";
import { createStopGroupId } from "./wep-stop.util.js";
import { createWepRouter } from "./wep.routes.js";
import {
  validatePwaStopGroupId,
  WepValidationError,
} from "./wep.validator.js";

const VIAJE_ID = 10;
const VEHICULO_ID = 3;
const STOP_FIELDS = {
  viajeId: VIAJE_ID,
  clienteCodigo: "44829",
  domicilio: "LAPRIDA 2405",
  localidad: "CONCORDIA",
};
const GRUPO_ID = createStopGroupId(STOP_FIELDS);

function testAuth(request, _response, next) {
  request.wepVehicle = { id: VEHICULO_ID };
  next();
}

async function postStopAction(
  service,
  action,
  { body, viajeId = VIAJE_ID, grupoId = GRUPO_ID } = {},
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/wep",
    createWepRouter({ stopActionsService: service, wepAuth: testAuth }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/pwa/viajes/${viajeId}/paradas/${grupoId}/${action}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const STATE_IDS = {
  PROGRAMADA: 1,
  ASIGNADA: 2,
  EN_REPARTO: 3,
  CLIENTE_AVISADO: 4,
  ENTREGADA: 5,
  NO_ENTREGADA: 6,
  CANCELADA: 7,
};

function delivery(id, state = "EN_REPARTO", overrides = {}) {
  return {
    entrega_id: id,
    estado_id: STATE_IDS[state],
    estado_codigo: state,
    estado_nombre: state,
    viaje_id: VIAJE_ID,
    vehiculo_id: VEHICULO_ID,
    cliente_codigo: STOP_FIELDS.clienteCodigo,
    cliente_nombre: "Cliente ejemplo",
    domicilio: STOP_FIELDS.domicilio,
    localidad: STOP_FIELDS.localidad,
    telefono: "+54 9 345 000-0000",
    telefono_alternativo: null,
    destino_latitud: -31.2,
    destino_longitud: -58.1,
    ...overrides,
  };
}

function etaDependencies() {
  return {
    geocoder: {
      canUsePersistentCoordinateCache() { return true; },
      async geocodeDeliveryDestination() {
        return { latitude: -31.2, longitude: -58.1, provider: "test" };
      },
    },
    vehiclePositionService: {
      async getCurrentPositionByPlate() {
        return {
          latitude: -31,
          longitude: -58,
          positionDate: "2026-09-21T12:00:00.000Z",
        };
      },
    },
    routeCalculator: {
      async calculateRouteEta() {
        return {
          durationSeconds: 1380,
          durationMinutes: 23,
          distanceMeters: 12450,
        };
      },
    },
    trackingService: {
      async getOrCreateTrackingForStop() {
        return { publicId: "abcdefghijklmnopqrstuv" };
      },
    },
    logger: { log() {}, warn() {} },
  };
}

function context(states, viajeEstado = "EN_REPARTO") {
  return {
    viaje: {
      id: VIAJE_ID,
      estado: viajeEstado,
      vehiculoId: VEHICULO_ID,
      patente: "AB172IK",
    },
    grupoId: GRUPO_ID,
    entregas: states.map((state, index) => delivery(101 + index, state)),
  };
}

function createDatabase({
  states = ["EN_REPARTO"],
  viajeEstado = "EN_REPARTO",
  vehiculoId = VEHICULO_ID,
  existingNotice = false,
  failUpdate = false,
  failEvent = false,
} = {}) {
  const queries = [];
  let currentStates = [...states];
  let snapshot = null;
  let noticeExists = existingNotice;
  let noticeState = existingNotice ? "ENVIADO" : null;

  const rows = () =>
    currentStates.map((state, index) =>
      delivery(101 + index, state, { vehiculo_id: vehiculoId }),
    );

  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql === "BEGIN") {
        snapshot = [...currentStates];
        return { rows: [] };
      }
      if (sql === "ROLLBACK") {
        currentStates = snapshot;
        return { rows: [] };
      }
      if (sql === "COMMIT") return { rows: [] };
      if (sql.includes("LEFT JOIN public.entregas e")) {
        return {
          rows: rows().map((row) => ({
            ...row,
            viaje_id: VIAJE_ID,
            viaje_estado: viajeEstado,
            vehiculo_id: vehiculoId,
            patente: "AB172IK",
          })),
        };
      }
      if (sql.includes("FROM public.viajes v")) {
        return {
          rows: [
            {
              viaje_id: VIAJE_ID,
              viaje_estado: viajeEstado,
              vehiculo_id: vehiculoId,
              patente: "AB172IK",
            },
          ],
        };
      }
      if (sql.includes("FROM public.entregas e")) {
        return { rows: rows() };
      }
      if (sql.includes("FROM public.notificaciones")) {
        return { rows: noticeExists ? [{ id: 40 }] : [] };
      }
      if (sql.startsWith("INSERT INTO public.notificaciones")) {
        if (noticeExists) return { rows: [] };
        noticeExists = true;
        noticeState = "PENDIENTE";
        return { rows: [{ id: 40 }] };
      }
      if (sql.includes("FROM public.entrega_estados")) {
        const code = params[0] || "CLIENTE_AVISADO";
        return {
          rows: [{ id: STATE_IDS[code], codigo: code, nombre: code }],
        };
      }
      if (sql.startsWith("UPDATE public.notificaciones")) {
        if (noticeState !== "PENDIENTE") return { rows: [] };
        noticeState = sql.includes("estado = 'ERROR'") ? "ERROR" : "ENVIADO";
        return noticeState === "ENVIADO"
          ? { rows: [{ enviado_at: new Date("2026-09-15T15:00:00.000Z") }] }
          : { rows: [] };
      }
      if (sql.startsWith("UPDATE public.entregas")) {
        if (failUpdate) return { rows: [] };
        const ids = params.find(Array.isArray);
        const targetStateId = Number(params[0]);
        const targetCode = Object.entries(STATE_IDS).find(
          ([, id]) => id === targetStateId,
        )[0];
        currentStates = currentStates.map((state, index) =>
          ids.includes(101 + index) ? targetCode : state,
        );
        return { rows: ids.map((id) => ({ id })) };
      }
      if (sql.startsWith("INSERT INTO public.entrega_eventos")) {
        if (failEvent) throw new Error("fallo simulado de auditoría");
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() {
      queries.push({ sql: "RELEASE", params: [] });
    },
  };

  return {
    queries,
    get states() {
      return currentStates;
    },
    pool: {
      async connect() {
        return client;
      },
      async query(sql, params) {
        return client.query(sql, params);
      },
    },
  };
}

test("valida el formato exacto de grupoId", () => {
  assert.equal(validatePwaStopGroupId(GRUPO_ID), GRUPO_ID);
  for (const value of [undefined, "", "stop_123", "STOP_07c51038ed0e"]) {
    assert.throws(
      () => validatePwaStopGroupId(value),
      WepValidationError,
    );
  }
});

test("valida viaje en reparto y estados operables de toda la parada", () => {
  assert.equal(
    validateStopOperation(context(["EN_REPARTO"]), "entregar").length,
    1,
  );
  assert.equal(
    validateStopOperation(
      context(["EN_REPARTO", "CLIENTE_AVISADO", "CANCELADA"]),
      "entregar",
    ).length,
    2,
  );
  assert.throws(
    () => validateStopOperation(context(["PROGRAMADA"]), "entregar"),
    WepPwaStopStateConflictError,
  );
  assert.throws(
    () =>
      validateStopOperation(
        context(["EN_REPARTO"], "PROGRAMADO"),
        "entregar",
      ),
    /viaje debe estar en reparto/i,
  );
});

test("entrega atómicamente una parada con tres órdenes", async () => {
  const database = createDatabase({
    states: ["EN_REPARTO", "CLIENTE_AVISADO", "EN_REPARTO"],
  });
  const repository = new WepStopActionsRepository({
    postgresPool: database.pool,
  });

  const parada = await repository.changeStopState({
    viajeId: VIAJE_ID,
    grupoId: GRUPO_ID,
    vehiculoId: VEHICULO_ID,
    action: "entregar",
    position: { latitude: -31.4, longitude: -58.0 },
  });

  assert.equal(parada.cantidadOrdenes, 3);
  assert.equal(parada.entregasActualizadas, 3);
  assert.equal(parada.estado.codigo, "ENTREGADA");
  assert.deepEqual(database.states, ["ENTREGADA", "ENTREGADA", "ENTREGADA"]);
  const lockQueries = database.queries.filter(({ sql }) =>
    sql.includes("FOR UPDATE"),
  );
  assert.match(lockQueries[0].sql, /FROM public\.viajes/);
  assert.match(lockQueries[1].sql, /FROM public\.entregas/);
  assert.equal(
    database.queries.filter(({ sql }) =>
      sql.startsWith("INSERT INTO public.entrega_eventos"),
    ).length,
    3,
  );
  assert.equal(database.queries.some(({ sql }) => sql === "COMMIT"), true);
});

test("no entrega toda la parada con un único motivo y observación", async () => {
  const database = createDatabase({ states: ["EN_REPARTO", "EN_REPARTO"] });
  const repository = new WepStopActionsRepository({
    postgresPool: database.pool,
  });

  const parada = await repository.changeStopState({
    viajeId: VIAJE_ID,
    grupoId: GRUPO_ID,
    vehiculoId: VEHICULO_ID,
    action: "noEntregado",
    motivo: "CLIENTE_AUSENTE",
    observacion: "No responde",
  });

  assert.equal(parada.estado.codigo, "NO_ENTREGADA");
  assert.equal(parada.entregasActualizadas, 2);
  assert.deepEqual(database.states, ["NO_ENTREGADA", "NO_ENTREGADA"]);
  const update = database.queries.find(({ sql }) =>
    sql.startsWith("UPDATE public.entregas"),
  );
  assert.deepEqual(update.params.slice(1, 3), [
    "CLIENTE_AUSENTE",
    "No responde",
  ]);
});

test("omite canceladas y devuelve CERRADA_PARCIAL", async () => {
  const database = createDatabase({ states: ["EN_REPARTO", "CANCELADA"] });
  const repository = new WepStopActionsRepository({
    postgresPool: database.pool,
  });

  const parada = await repository.changeStopState({
    viajeId: VIAJE_ID,
    grupoId: GRUPO_ID,
    vehiculoId: VEHICULO_ID,
    action: "entregar",
  });

  assert.equal(parada.entregasActualizadas, 1);
  assert.equal(parada.estado.codigo, "CERRADA_PARCIAL");
  assert.deepEqual(database.states, ["ENTREGADA", "CANCELADA"]);
});

test("un estado incompatible impide cualquier actualización", async () => {
  const database = createDatabase({ states: ["EN_REPARTO", "ENTREGADA"] });
  const repository = new WepStopActionsRepository({
    postgresPool: database.pool,
  });

  await assert.rejects(
    () =>
      repository.changeStopState({
        viajeId: VIAJE_ID,
        grupoId: GRUPO_ID,
        vehiculoId: VEHICULO_ID,
        action: "entregar",
      }),
    WepPwaStopStateConflictError,
  );
  assert.equal(
    database.queries.some(({ sql }) =>
      sql.startsWith("UPDATE public.entregas"),
    ),
    false,
  );
  assert.equal(database.queries.some(({ sql }) => sql === "ROLLBACK"), true);
});

test("revierte todas las entregas si falla la auditoría", async () => {
  const database = createDatabase({
    states: ["EN_REPARTO", "EN_REPARTO"],
    failEvent: true,
  });
  const repository = new WepStopActionsRepository({
    postgresPool: database.pool,
  });

  await assert.rejects(() =>
    repository.changeStopState({
      viajeId: VIAJE_ID,
      grupoId: GRUPO_ID,
      vehiculoId: VEHICULO_ID,
      action: "entregar",
    }),
  );
  assert.deepEqual(database.states, ["EN_REPARTO", "EN_REPARTO"]);
  assert.equal(database.queries.some(({ sql }) => sql === "ROLLBACK"), true);
});

test("rechaza grupoId de otra parada y viaje de otro vehículo", async () => {
  const database = createDatabase();
  const repository = new WepStopActionsRepository({
    postgresPool: database.pool,
  });
  const otherGroupId = createStopGroupId({
    ...STOP_FIELDS,
    viajeId: 11,
  });

  await assert.rejects(
    () => repository.getStopContext(VIAJE_ID, otherGroupId, VEHICULO_ID),
    WepPwaStopNotFoundError,
  );

  const foreignDatabase = createDatabase({ vehiculoId: 99 });
  const foreignRepository = new WepStopActionsRepository({
    postgresPool: foreignDatabase.pool,
  });
  await assert.rejects(
    () => foreignRepository.getStopContext(VIAJE_ID, GRUPO_ID, VEHICULO_ID),
    WepPwaStopForbiddenError,
  );
});

test("consulta GESTYA una vez por parada y pasa la posición a la transacción", async () => {
  const calls = [];
  const service = new WepStopActionsService({
    repository: {
      async getStopContext(...args) {
        calls.push(["context", ...args]);
        return context(["EN_REPARTO", "EN_REPARTO"]);
      },
      async changeStopState(payload) {
        calls.push(["change", payload]);
        return {
          grupoId: GRUPO_ID,
          estado: { codigo: "ENTREGADA", nombre: "Entregada" },
          cantidadOrdenes: 2,
          entregasActualizadas: 2,
          entregas: [],
        };
      },
    },
    vehiclePositionService: {
      async getCurrentPositionByPlate(plate) {
        calls.push(["gestya", plate]);
        return { latitude: -31.4, longitude: -58.0 };
      },
    },
    logger: { log() {}, warn() {} },
  });

  const parada = await service.deliverStop(
    VIAJE_ID,
    GRUPO_ID,
    VEHICULO_ID,
  );

  assert.equal(calls.filter(([method]) => method === "gestya").length, 1);
  assert.deepEqual(calls.find(([method]) => method === "change")[1].position, {
    latitude: -31.4,
    longitude: -58.0,
  });
  assert.deepEqual(parada.posicion, {
    latitud: -31.4,
    longitud: -58.0,
    obtenidaDesdeGestya: true,
  });
});

test("envía un solo WhatsApp y asocia tres entregas al aviso", async () => {
  const database = createDatabase({
    states: ["EN_REPARTO", "EN_REPARTO", "EN_REPARTO"],
  });
  let sends = 0;
  const service = new WepStopActionsService({
    repository: new WepStopActionsRepository({ postgresPool: database.pool }),
    ...etaDependencies(),
    async whatsappSender() {
      sends += 1;
      return { messageId: "wamid.stop.1", templateName: "wep_en_camino" };
    },
    templateName: "wep_en_camino",
  });

  const result = await service.notifyStop(VIAJE_ID, GRUPO_ID, VEHICULO_ID);

  assert.equal(sends, 1);
  assert.equal(result.parada.estado.codigo, "CLIENTE_AVISADO");
  assert.equal(result.parada.entregasActualizadas, 3);
  assert.equal(
    database.queries.filter(({ sql }) =>
      sql.startsWith("INSERT INTO public.notificaciones"),
    ).length,
    1,
  );
  assert.equal(
    database.queries.filter(({ sql }) =>
      sql.startsWith("INSERT INTO public.entrega_eventos"),
    ).length,
    3,
  );
});

test("el reintento de un aviso exitoso devuelve YA_NOTIFICADA sin otro WhatsApp", async () => {
  let sends = 0;
  const service = new WepStopActionsService({
    repository: {
      async getStopContext() {
        return context(["CLIENTE_AVISADO"]);
      },
      async findSuccessfulStopNotice() {
        return {
          message_id: "wamid.stop.1",
          enviado_at: "2026-09-21T12:00:00.000Z",
          metadata: { etaMinutosEnviado: 25 },
        };
      },
    },
    async whatsappSender() {
      sends += 1;
    },
  });

  const result = await service.notifyStop(VIAJE_ID, GRUPO_ID, VEHICULO_ID);
  assert.equal(result.notificacion.resultado, "YA_NOTIFICADA");
  assert.equal(result.notificacion.etaMinutos, 25);
  assert.equal(sends, 0);
});

test("un fallo de WhatsApp registra ERROR y no cambia entregas", async () => {
  const calls = [];
  const service = new WepStopActionsService({
    repository: {
      async getStopContext() {
        return context(["EN_REPARTO"]);
      },
      async findSuccessfulStopNotice() {
        return null;
      },
      async reserveStopNotice() {
        return {
          notificationId: 40,
          anchorId: 101,
          telefonoDestino: "5493450000000",
          clienteNombre: "Cliente ejemplo",
        };
      },
      async failStopNotice(payload) {
        calls.push(payload);
      },
      async confirmStopNotice() {
        calls.push("confirm");
      },
    },
    ...etaDependencies(),
    async whatsappSender() {
      throw new Error("timeout");
    },
  });

  await assert.rejects(
    () => service.notifyStop(VIAJE_ID, GRUPO_ID, VEHICULO_ID),
    WepPwaWhatsappError,
  );
  assert.equal(calls.includes("confirm"), false);
  assert.equal(calls.length, 1);
});

test("un destino cacheado no vuelve a geocodificarse", async () => {
  let geocodingCalls = 0;
  const calls = [];
  const service = new WepStopActionsService({
    repository: {
      async getStopContext() { return context(["EN_REPARTO"]); },
      async findSuccessfulStopNotice() { return null; },
      async reserveStopNotice() {
        return { notificationId: 40, anchorId: 101, telefonoDestino: "5493450000000" };
      },
      async confirmStopNotice(payload) {
        calls.push(payload);
        return { parada: { estado: { codigo: "CLIENTE_AVISADO" } }, notificacion: {} };
      },
      async failStopNotice() {},
    },
    ...etaDependencies(),
    geocoder: {
      async geocodeDeliveryDestination() { geocodingCalls += 1; },
    },
    async whatsappSender(payload) {
      calls.push(payload);
      return { messageId: "wamid.stop.2", templateName: "wep_en_camino_test" };
    },
    templateName: "wep_en_camino_test",
  });
  await service.notifyStop(VIAJE_ID, GRUPO_ID, VEHICULO_ID);
  assert.equal(geocodingCalls, 0);
  assert.equal(calls[0].etaMinutes, 25);
  assert.equal(calls[0].publicId, "abcdefghijklmnopqrstuv");
  assert.deepEqual(calls[1].metadata, {
    etaMinutosCalculado: 23,
    etaMinutosEnviado: 25,
    distanciaMetros: 12450,
    fechaPosicionGestya: "2026-09-21T12:00:00.000Z",
    precisionDestino: "DOMICILIO",
  });
});

test("usa la plantilla de zona sin guardar coordenadas aproximadas", async () => {
  const calls = [];
  const stopContext = context(["EN_REPARTO"]);
  stopContext.entregas[0].destino_latitud = null;
  stopContext.entregas[0].destino_longitud = null;
  const service = new WepStopActionsService({
    repository: {
      async getStopContext() { return stopContext; },
      async findSuccessfulStopNotice() { return null; },
      async saveStopDestinationCoordinates() { calls.push("saved"); },
      async reserveStopNotice(_viajeId, _grupoId, _vehiculoId, templateName) {
        calls.push(["reserve", templateName]);
        return { notificationId: 40, anchorId: 101, telefonoDestino: "5493450000000" };
      },
      async confirmStopNotice(payload) {
        calls.push(["confirm", payload]);
        return { notificacion: { precisionDestino: payload.metadata.precisionDestino } };
      },
    },
    ...etaDependencies(),
    geocoder: {
      canUsePersistentCoordinateCache() { return true; },
      async geocodeDeliveryDestination() {
        return { latitude: -31.4047734, longitude: -58.068884, approximateArea: true };
      },
    },
    async whatsappSender(payload) {
      calls.push(["send", payload]);
      return { messageId: "wamid.zona.1", templateName: payload.templateName };
    },
    templateName: "wep_en_camino",
    approximateAreaTemplateName: "wep_en_camino_zona",
    logger: { log() {}, warn() {} },
  });

  const result = await service.notifyStop(VIAJE_ID, GRUPO_ID, VEHICULO_ID);
  assert.equal(calls.includes("saved"), false);
  assert.deepEqual(calls.find(([type]) => type === "reserve"), ["reserve", "wep_en_camino_zona"]);
  assert.equal(calls.find(([type]) => type === "send")[1].templateName, "wep_en_camino_zona");
  assert.equal(calls.find(([type]) => type === "confirm")[1].metadata.precisionDestino, "ZONA_APROXIMADA");
  assert.equal(result.notificacion.precisionDestino, "ZONA_APROXIMADA");
});

for (const failure of ["gestya", "geocoding", "routing"]) {
  test(`un fallo de ${failure} devuelve ETA no disponible sin reservar aviso`, async () => {
    let reservations = 0;
    const stopContext = context(["EN_REPARTO"]);
    if (failure === "geocoding") {
      stopContext.entregas[0].destino_latitud = null;
      stopContext.entregas[0].destino_longitud = null;
    }
    const dependencies = etaDependencies();
    const service = new WepStopActionsService({
      repository: {
        async getStopContext() { return stopContext; },
        async findSuccessfulStopNotice() { return null; },
        async saveStopDestinationCoordinates() {},
        async reserveStopNotice() { reservations += 1; },
      },
      ...dependencies,
      vehiclePositionService: failure === "gestya"
        ? { async getCurrentPositionByPlate() { throw new Error("sin GPS"); } }
        : dependencies.vehiclePositionService,
      geocoder: failure === "geocoding"
        ? { async geocodeDeliveryDestination() { throw new Error("sin geocode"); } }
        : { async geocodeDeliveryDestination() { return { latitude: -31.2, longitude: -58.1 }; } },
      routeCalculator: failure === "routing"
        ? { async calculateRouteEta() { throw new Error("sin ruta"); } }
        : dependencies.routeCalculator,
    });
    await assert.rejects(
      () => service.notifyStop(VIAJE_ID, GRUPO_ID, VEHICULO_ID),
      WepEtaUnavailableError,
    );
    assert.equal(reservations, 0);
  });
}

test("rechaza una parada sin teléfono antes de crear la notificación", async () => {
  const database = createDatabase();
  const originalQuery = database.pool.connect;
  database.pool.connect = async () => {
    const client = await originalQuery();
    const query = client.query.bind(client);
    client.query = async (sql, params) => {
      const result = await query(sql, params);
      if (sql.includes("FROM public.entregas e")) {
        result.rows = result.rows.map((row) => ({
          ...row,
          telefono: null,
          telefono_alternativo: null,
        }));
      }
      return result;
    };
    return client;
  };
  const repository = new WepStopActionsRepository({
    postgresPool: database.pool,
  });

  await assert.rejects(
    () =>
      repository.reserveStopNotice(
        VIAJE_ID,
        GRUPO_ID,
        VEHICULO_ID,
      ),
    WepPwaEntregaPhoneConflictError,
  );
});

test("los tres endpoints exponen el contrato de parada y el vehículo autenticado", async () => {
  const calls = [];
  const parada = {
    grupoId: GRUPO_ID,
    estado: { codigo: "ENTREGADA", nombre: "Entregada" },
    cantidadOrdenes: 1,
    entregasActualizadas: 1,
    entregas: [
      { id: 101, estado: { codigo: "ENTREGADA", nombre: "Entregada" } },
    ],
  };
  const service = {
    async deliverStop(...args) {
      calls.push(["entregar", ...args]);
      return parada;
    },
    async markStopNotDelivered(...args) {
      calls.push(["no-entregado", ...args]);
      return {
        ...parada,
        estado: { codigo: "NO_ENTREGADA", nombre: "No entregada" },
      };
    },
    async notifyStop(...args) {
      calls.push(["avisar", ...args]);
      return {
        parada: {
          ...parada,
          estado: {
            codigo: "CLIENTE_AVISADO",
            nombre: "Cliente avisado",
          },
        },
        notificacion: { estado: "ENVIADO" },
      };
    },
  };

  const delivered = await postStopAction(service, "entregar");
  const notDelivered = await postStopAction(service, "no-entregado", {
    body: { motivo: "CLIENTE_AUSENTE", observacion: "Sin respuesta" },
  });
  const notified = await postStopAction(service, "avisar");

  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.message, "Parada entregada correctamente");
  assert.equal(notDelivered.status, 200);
  assert.equal(notDelivered.body.parada.estado.codigo, "NO_ENTREGADA");
  assert.equal(notified.status, 200);
  assert.equal(notified.body.notificacion.estado, "ENVIADO");
  assert.deepEqual(calls, [
    ["entregar", VIAJE_ID, GRUPO_ID, VEHICULO_ID],
    [
      "no-entregado",
      VIAJE_ID,
      GRUPO_ID,
      { motivo: "CLIENTE_AUSENTE", observacion: "Sin respuesta" },
      VEHICULO_ID,
    ],
    ["avisar", VIAJE_ID, GRUPO_ID, VEHICULO_ID],
  ]);
});

test("los endpoints mapean validación, autorización, inexistencia, conflicto y proveedor", async () => {
  const invalid = await postStopAction({}, "entregar", { grupoId: "invalido" });
  assert.equal(invalid.status, 400);

  const cases = [
    [new WepPwaStopForbiddenError("Viaje ajeno"), 403],
    [new WepPwaStopViajeNotFoundError("Viaje no encontrado"), 404],
    [new WepPwaStopNotFoundError("Parada no encontrada"), 404],
    [new WepPwaStopStateConflictError("Estado incompatible"), 409],
    [new WepPwaWhatsappError("No se pudo enviar"), 502],
  ];

  for (const [error, expectedStatus] of cases) {
    const result = await postStopAction(
      {
        async notifyStop() {
          throw error;
        },
      },
      "avisar",
    );
    assert.equal(result.status, expectedStatus);
    assert.equal(result.body.ok, false);
  }

  const invalidBody = await postStopAction({}, "no-entregado", {
    body: { motivo: "NO_EXISTE" },
  });
  assert.equal(invalidBody.status, 400);
});

test("el endpoint devuelve el contrato controlado cuando el ETA no está disponible", async () => {
  const result = await postStopAction(
    {
      async notifyStop() {
        throw new WepEtaUnavailableError(new Error("routing caído"));
      },
    },
    "avisar",
  );
  assert.deepEqual(result, {
    status: 503,
    body: {
      ok: false,
      code: "ETA_NO_DISPONIBLE",
      message: "No se pudo calcular el tiempo estimado de llegada.",
    },
  });
});
