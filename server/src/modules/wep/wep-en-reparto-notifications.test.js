import assert from "node:assert/strict";
import test from "node:test";
import { buildEnRepartoTemplatePayload } from "../../services/whatsapp.service.js";
import {
  mapTransitionedStops,
  WepEnRepartoNotificationsRepository,
} from "./wep-en-reparto-notifications.repository.js";
import { WepEnRepartoNotificationsService } from "./wep-en-reparto-notifications.service.js";

const silentLogger = { log() {}, error() {} };
const publicId = "abcdefghijklmnopqrstuvwx12345678";

function deliveryRow(overrides = {}) {
  return {
    viaje_id: 10,
    numero_vuelta: 1,
    viaje_estado: "EN_REPARTO",
    iniciado_at: new Date("2026-09-19T12:00:00.000Z"),
    finalizado_at: null,
    vehiculo_id: 7,
    codigo_erp: "V7",
    vehiculo_nombre: "Camión 7",
    patente: "AA111AA",
    entrega_id: 101,
    orden_secuencia: 1,
    estado_codigo: "EN_REPARTO",
    estado_nombre: "En reparto",
    orden_preparacion_division: "1",
    orden_preparacion_tipo: "OP",
    orden_preparacion_numero: 500,
    nota_pedido_division: "1",
    nota_pedido_tipo: "NP",
    nota_pedido_numero: 900,
    cliente_codigo: "C1",
    cliente_nombre: "Cliente Uno",
    telefono: "+54 9 345 000-0000",
    telefono_alternativo: null,
    domicilio: " San Martín 123 ",
    localidad: "Concordia",
    hora_desde: "10:00:00",
    hora_hasta: "12:00:00",
    peso_calculado: 1,
    volumen_calculado: 1,
    bultos_calculados: 1,
    ...overrides,
  };
}

function mappedStop(rows, ids) {
  return mapTransitionedStops(rows, ids)[0];
}

test("agrupa por la parada existente y genera un solo envío para varias órdenes", () => {
  const rows = [
    deliveryRow(),
    deliveryRow({
      entrega_id: 102,
      orden_secuencia: 2,
      telefono: null,
      domicilio: "san martín 123",
      localidad: " CONCORDIA ",
    }),
    deliveryRow({
      entrega_id: 103,
      cliente_codigo: "C2",
      domicilio: "Otro 50",
    }),
  ];

  const stops = mapTransitionedStops(rows, [101, 102]);

  assert.equal(stops.length, 1);
  assert.deepEqual(stops[0].entregaIds, [101, 102]);
  assert.equal(stops[0].entregaRepresentativaId, 101);
  assert.equal(stops[0].telefonoDestino, "5493450000000");
});

test("el payload usa sólo publicId en el botón y no agrega parámetros BODY", () => {
  const payload = buildEnRepartoTemplatePayload({
    telefono: "+54 9 345 000-0000",
    templateName: "wep_en_reparto_test",
    templateLanguage: "es_AR",
    publicId,
  });

  assert.equal(payload.to, "5493450000000");
  assert.equal(payload.template.name, "wep_en_reparto_test");
  assert.deepEqual(payload.template.components, [
    {
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: publicId }],
    },
  ]);
  assert.equal(JSON.stringify(payload).includes("https://wep.nimat.com.ar"), false);
  assert.equal(payload.template.components.some(({ type }) => type === "body"), false);
});

test("obtiene tracking y confirma ENVIADO con el messageId de Meta", async () => {
  const stop = mappedStop([deliveryRow()], [101]);
  const calls = [];
  const service = new WepEnRepartoNotificationsService({
    repository: {
      async findTransitionedStops(input) {
        calls.push(["find", input]);
        return [stop];
      },
      async reserveStop() {
        calls.push(["reserve"]);
        return { result: "RESERVADA", notificationId: 77 };
      },
      async confirmSent(input) {
        calls.push(["confirm", input]);
      },
    },
    trackingService: {
      async getOrCreateTrackingForStop(input) {
        calls.push(["tracking", input]);
        return {
          publicId,
          url: `https://wep.nimat.com.ar/s/${publicId}`,
        };
      },
    },
    async whatsappSender(input) {
      calls.push(["send", input]);
      return { messageId: "wamid.123", templateName: "wep_en_reparto_test" };
    },
    templateName: "wep_en_reparto_test",
    templateLanguage: "es_AR",
    logger: silentLogger,
  });

  const result = await service.notifyTransitionedStops({
    viajeId: 10,
    entregaIds: [101],
  });

  assert.deepEqual(result, {
    enviadas: 1,
    yaNotificadas: 0,
    sinTelefono: 0,
    errores: 0,
  });
  assert.deepEqual(calls[2][1], {
    viajeId: 10,
    clienteCodigo: "C1",
    domicilio: " San Martín 123 ",
    localidad: "Concordia",
  });
  assert.equal(calls[3][1].publicId, publicId);
  assert.equal("url" in calls[3][1], false);
  assert.deepEqual(calls[4][1], {
    notificationId: 77,
    messageId: "wamid.123",
    templateName: "wep_en_reparto_test",
  });
});

test("SIN_TELEFONO se registra y no intenta tracking ni Meta", async () => {
  const stop = mappedStop(
    [deliveryRow({ telefono: null, telefono_alternativo: "sin número" })],
    [101],
  );
  let trackingCalls = 0;
  let sendCalls = 0;
  const service = new WepEnRepartoNotificationsService({
    repository: {
      async findTransitionedStops() { return [stop]; },
      async reserveStop({ stop: received }) {
        assert.equal(received.telefonoDestino, null);
        return { result: "SIN_TELEFONO", notificationId: 8 };
      },
    },
    trackingService: {
      async getOrCreateTrackingForStop() { trackingCalls += 1; },
    },
    async whatsappSender() { sendCalls += 1; },
    logger: silentLogger,
  });

  const result = await service.notifyTransitionedStops({
    viajeId: 10,
    entregaIds: [101],
  });

  assert.equal(result.sinTelefono, 1);
  assert.equal(trackingCalls, 0);
  assert.equal(sendCalls, 0);
});

test("una notificación exitosa de cualquier entrega de la parada deduplica", async () => {
  const stop = mappedStop(
    [deliveryRow(), deliveryRow({ entrega_id: 102, orden_secuencia: 2 })],
    [101, 102],
  );
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes("FROM public.notificaciones")) {
        return { rows: [{ id: 90, entrega_id: 102, estado: "ENTREGADO" }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const repository = new WepEnRepartoNotificationsRepository({
    postgresPool: { connect: async () => client },
  });

  const result = await repository.reserveStop({
    stop,
    templateName: "wep_en_reparto_test",
  });

  assert.deepEqual(result, { result: "YA_NOTIFICADA" });
  const lookup = queries.find(({ sql }) =>
    sql.includes("FROM public.notificaciones"),
  );
  assert.deepEqual(lookup.params, ["EN_REPARTO", [101, 102]]);
  assert.equal(queries.some(({ sql }) => sql.startsWith("INSERT")), false);
});

test("sin teléfono inserta una notificación EN_REPARTO/SIN_TELEFONO", async () => {
  const stop = mappedStop(
    [deliveryRow({ telefono: null, telefono_alternativo: null })],
    [101],
  );
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes("FROM public.notificaciones")) return { rows: [] };
      if (sql.startsWith("INSERT INTO public.notificaciones")) {
        return { rows: [{ id: 88 }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const repository = new WepEnRepartoNotificationsRepository({
    postgresPool: { connect: async () => client },
  });

  const result = await repository.reserveStop({
    stop,
    templateName: "wep_en_reparto_test",
  });

  assert.deepEqual(result, { result: "SIN_TELEFONO", notificationId: 88 });
  const insert = queries.find(({ sql }) =>
    sql.startsWith("INSERT INTO public.notificaciones"),
  );
  assert.deepEqual(insert.params, [
    101,
    "EN_REPARTO",
    "",
    "wep_en_reparto_test",
    "SIN_TELEFONO",
  ]);
});

test("un error de Meta queda registrado y el procesamiento continúa", async () => {
  const first = mappedStop([deliveryRow()], [101]);
  const second = mappedStop(
    [deliveryRow({ viaje_id: 11, entrega_id: 201 })],
    [201],
  );
  const failed = [];
  const confirmed = [];
  let nextId = 0;
  const service = new WepEnRepartoNotificationsService({
    repository: {
      async findTransitionedStops() { return [first, second]; },
      async reserveStop() {
        return { result: "RESERVADA", notificationId: ++nextId };
      },
      async markFailed(input) { failed.push(input); },
      async confirmSent(input) { confirmed.push(input); },
    },
    trackingService: {
      async getOrCreateTrackingForStop() { return { publicId }; },
    },
    async whatsappSender() {
      if (nextId === 1) throw new Error("Meta no disponible");
      return { messageId: "wamid.ok" };
    },
    logger: silentLogger,
  });

  const result = await service.notifyTransitionedStops({
    viajeId: 10,
    entregaIds: [101, 201],
  });

  assert.equal(result.errores, 1);
  assert.equal(result.enviadas, 1);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].notificationId, 1);
  assert.equal(confirmed.length, 1);
});
