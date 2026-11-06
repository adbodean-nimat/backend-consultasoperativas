import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createWepRouter } from "./wep.routes.js";
import {
  mapProgrammedNotificationStops,
  WepProgrammedNotificationsRepository,
} from "./wep-programmed-notifications.repository.js";
import {
  buildProgrammedTemplateData,
  getBusinessDate,
  WepProgrammedNotificationsService,
  WepProgrammedTemplateNotConfiguredError,
} from "./wep-programmed-notifications.service.js";

const silentLogger = { log() {}, error() {} };

function deliveryRow(overrides = {}) {
  return {
    viaje_id: 10,
    numero_vuelta: 1,
    viaje_estado: "PROGRAMADO",
    iniciado_at: null,
    finalizado_at: null,
    vehiculo_id: 7,
    codigo_erp: "V7",
    vehiculo_nombre: "Camión 7",
    patente: "AA111AA",
    entrega_id: 101,
    orden_secuencia: 1,
    estado_codigo: "PROGRAMADA",
    estado_nombre: "Programada",
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
    domicilio: "San Martín 123",
    localidad: "Concordia",
    fecha_entrega: "2026-09-18",
    hora_desde: "10:00:00",
    hora_hasta: "12:00:00",
    peso_calculado: 1,
    volumen_calculado: 1,
    bultos_calculados: 1,
    notificacion_id: null,
    notificacion_estado: null,
    ...overrides,
  };
}

function mappedStop(rows = [deliveryRow()]) {
  return mapProgrammedNotificationStops(rows)[0];
}

test("calcula HOY explícitamente en America/Argentina/Buenos_Aires", () => {
  assert.equal(
    getBusinessDate(new Date("2026-09-18T02:59:59.000Z")),
    "2026-09-17",
  );
  assert.equal(
    getBusinessDate(new Date("2026-09-18T03:00:00.000Z")),
    "2026-09-18",
  );
});

test("consulta exclusivamente fecha_entrega = fecha solicitada", async () => {
  let received;
  const repository = new WepProgrammedNotificationsRepository({
    postgresPool: {
      async query(sql, params) {
        received = { sql, params };
        return { rows: [] };
      },
    },
  });

  await repository.findStopsForDate("2026-09-18");

  assert.deepEqual(received.params, ["2026-09-18"]);
  assert.match(received.sql, /e\.fecha_entrega = \$1::date/);
  assert.doesNotMatch(received.sql, /created_at\s*=/i);
});

test("dos órdenes de la misma parada producen un único candidato", () => {
  const stops = mapProgrammedNotificationStops([
    deliveryRow(),
    deliveryRow({
      entrega_id: 102,
      orden_secuencia: 2,
      orden_preparacion_numero: 501,
      nota_pedido_numero: 901,
      hora_desde: "08:00:00",
      hora_hasta: "14:00:00",
    }),
  ]);

  assert.equal(stops.length, 1);
  assert.equal(stops[0].entregas.length, 2);
  assert.equal(stops[0].horaDesde, "08:00:00");
  assert.equal(stops[0].horaHasta, "14:00:00");
  assert.deepEqual(buildProgrammedTemplateData(stops[0]).pedido, {
    principal: "900",
    otros: ["901"],
  });
});

test("cinco pedidos y siete OP generan un solo WhatsApp y no se reenvían al repetir la tarea", async () => {
  const orders = [890105, 890577, 890577, 890577, 890756, 890763, 890767];
  const rows = orders.map((pedido, index) => deliveryRow({
    entrega_id: 101 + index, orden_secuencia: index + 1,
    orden_preparacion_numero: 500 + index, nota_pedido_numero: pedido,
    // Espacios y mayúsculas no deben separar una misma dirección.
    domicilio: index % 2 ? "  SAN MARTÍN   123 " : "San Martín 123",
    localidad: index % 2 ? " CONCORDIA " : "Concordia",
  }));
  let notification = null;
  let inserts = 0;
  const sent = [];
  const joinedRows = () => rows.map(row => ({ ...row,
    notificacion_id: notification?.entregaId === row.entrega_id ? notification.id : null,
    notificacion_estado: notification?.entregaId === row.entrega_id ? notification.estado : null,
  }));
  const client = {
    async query(sql, params = []) {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
      if (sql.includes("SELECT id FROM public.viajes")) return { rows: [{ id: 10 }] };
      if (sql.includes("FROM public.entregas e")) return { rows: joinedRows() };
      if (sql.includes("INSERT INTO public.notificaciones")) {
        assert.equal(notification, null, "no debe reservar una notificación por cada pedido");
        assert.equal(params[1], "PROGRAMADA");
        notification = { id: 77, entregaId: params[0], estado: "PENDIENTE" }; inserts++;
        return { rows: [{ id: 77, entrega_id: params[0] }] };
      }
      if (sql.includes("UPDATE public.notificaciones") && sql.includes("estado = 'ENVIADO'")) {
        notification.estado = "ENVIADO";
        return { rows: [{ enviado_at: "2026-11-03T13:00:00Z" }] };
      }
      assert.fail(`Consulta inesperada en la prueba: ${sql}`);
    },
    release() {},
  };
  const repository = new WepProgrammedNotificationsRepository({ postgresPool: { query: (...args) => client.query(...args), async connect() { return client; } } });
  const service = new WepProgrammedNotificationsService({ repository,
    templateName: "programada", logger: silentLogger,
    trackingService: { async getOrCreateTrackingForStop() { return { publicId: "a".repeat(24), url: "https://example.test/s/test" }; } },
    async whatsappSender(payload) { sent.push(payload); return { messageId: "one-message", templateName: "programada" }; },
  });
  const first = await service.processProgrammedDeliveryNotifications({ fecha: "2026-09-18", dryRun: false });
  assert.equal(first.resumen.paradasEncontradas, 1);
  assert.equal(first.resumen.enviadas, 1); assert.equal(first.resumen.errores, 0);
  assert.equal(inserts, 1); assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].datos.pedido, { principal: "890105", otros: ["890577", "890756", "890763", "890767"] });
  assert.equal(sent[0].telefono, mappedStop(rows).telefonoDestino);

  const second = await service.processProgrammedDeliveryNotifications({ fecha: "2026-09-18", dryRun: false });
  assert.equal(second.resumen.yaNotificadas, 1); assert.equal(second.resumen.enviadas, 0);
  assert.equal(sent.length, 1); assert.equal(inserts, 1);

  // Una OP agregada después tampoco dispara otro aviso de la misma parada.
  rows.push(deliveryRow({ entrega_id: 108, orden_preparacion_numero: 507, nota_pedido_numero: 890999 }));
  const third = await service.processProgrammedDeliveryNotifications({ fecha: "2026-09-18", dryRun: false });
  assert.equal(third.resumen.yaNotificadas, 1); assert.equal(sent.length, 1);
});

test("el mismo teléfono no fusiona paradas de otros domicilios o viajes", () => {
  const stops = mapProgrammedNotificationStops([
    deliveryRow(),
    deliveryRow({ entrega_id: 102, orden_preparacion_numero: 501, domicilio: "Otro domicilio 456" }),
    deliveryRow({ entrega_id: 103, orden_preparacion_numero: 502, viaje_id: 11 }),
  ]);
  assert.equal(stops.length, 3);
});

test("dry-run no reserva, envía ni registra notificaciones", async () => {
  const calls = [];
  const stop = mappedStop();
  const service = new WepProgrammedNotificationsService({
    repository: {
      async findStopsForDate() {
        calls.push("find");
        return [stop];
      },
      async reserveStop() {
        calls.push("reserve");
      },
    },
    async whatsappSender() {
      calls.push("send");
    },
    logger: silentLogger,
  });

  const result = await service.processProgrammedDeliveryNotifications({
    fecha: "2026-09-18",
    dryRun: true,
  });

  assert.deepEqual(calls, ["find"]);
  assert.equal(result.resumen.listasParaEnviar, 1);
  assert.equal(result.resumen.enviadas, 0);
});

test("omite una parada sin teléfono y continúa con la siguiente", async () => {
  const noPhone = mappedStop([
    deliveryRow({ telefono: null, telefono_alternativo: "sin número" }),
  ]);
  const ready = mappedStop([deliveryRow({ viaje_id: 11 })]);
  const service = new WepProgrammedNotificationsService({
    repository: { async findStopsForDate() { return [noPhone, ready]; } },
    logger: silentLogger,
  });

  const result = await service.processProgrammedDeliveryNotifications({
    fecha: "2026-09-18",
    dryRun: true,
  });

  assert.equal(result.resumen.sinTelefono, 1);
  assert.equal(result.resumen.listasParaEnviar, 1);
});

test("una notificación exitosa en cualquier entrega evita el doble envío", async () => {
  const stop = mappedStop([
    deliveryRow(),
    deliveryRow({
      entrega_id: 102,
      orden_secuencia: 2,
      notificacion_id: 77,
      notificacion_estado: "ENTREGADO",
    }),
  ]);
  let sends = 0;
  const service = new WepProgrammedNotificationsService({
    repository: { async findStopsForDate() { return [stop]; } },
    async whatsappSender() { sends += 1; },
    logger: silentLogger,
  });

  const result = await service.processProgrammedDeliveryNotifications({
    fecha: "2026-09-18",
    dryRun: true,
  });

  assert.equal(sends, 0);
  assert.equal(result.resumen.yaNotificadas, 1);
});

test("un error de WhatsApp se registra y no impide procesar otra parada", async () => {
  const first = mappedStop();
  const second = mappedStop([deliveryRow({ viaje_id: 11, entrega_id: 201 })]);
  const failed = [];
  const confirmed = [];
  let notificationId = 0;
  let sendAttempt = 0;
  const publicIds = [];
  const service = new WepProgrammedNotificationsService({
    repository: {
      async findStopsForDate() { return [first, second]; },
      async reserveStop({ viajeId }) {
        const stop = viajeId === 10 ? first : second;
        return {
          stop,
          notificationId: ++notificationId,
          telefonoDestino: stop.telefonoDestino,
          retried: false,
        };
      },
      async confirmSent(value) { confirmed.push(value); },
      async markFailed(value) { failed.push(value); },
    },
    async whatsappSender({ datos, publicId }) {
      publicIds.push(publicId);
      sendAttempt += 1;
      if (sendAttempt === 1 && datos.cliente === "Cliente Uno") {
        throw new Error("falló Meta");
      }
      return { messageId: "wamid.ok", templateName: "prueba" };
    },
    trackingService: {
      async getOrCreateTrackingForStop() {
        return {
          publicId: "abcdefghijklmnopqrstuvwx12345678",
          url: "https://wep.nimat.com.ar/s/abcdefghijklmnopqrstuvwx12345678",
          expiraAt: new Date("2026-09-20T23:59:59.999-03:00"),
        };
      },
    },
    templateName: "prueba",
    logger: silentLogger,
  });

  // Diferenciamos la segunda parada para que sólo falle la primera.
  second.cliente.nombre = "Cliente Dos";
  const result = await service.processProgrammedDeliveryNotifications({
    fecha: "2026-09-18",
    dryRun: false,
  });

  assert.equal(failed.length, 1);
  assert.equal(confirmed.length, 1);
  assert.equal(result.resumen.errores, 1);
  assert.equal(result.resumen.enviadas, 1);
  assert.deepEqual(publicIds, [
    "abcdefghijklmnopqrstuvwx12345678",
    "abcdefghijklmnopqrstuvwx12345678",
  ]);
  assert.match(result.resultados[1].datos.trackingUrl, /^https:\/\/wep\.nimat\.com\.ar\/s\//);
});

test("modo real sin plantilla falla antes de consultar o insertar", async () => {
  let consulted = false;
  const service = new WepProgrammedNotificationsService({
    repository: { async findStopsForDate() { consulted = true; return []; } },
    templateName: null,
    logger: silentLogger,
  });

  await assert.rejects(
    () => service.processProgrammedDeliveryNotifications({ dryRun: false }),
    WepProgrammedTemplateNotConfiguredError,
  );
  assert.equal(consulted, false);
});

test("endpoint admin valida entrada y delega fecha sólo al modo manual", async () => {
  let received;
  const service = {
    async processProgrammedDeliveryNotifications(input) {
      received = input;
      return { ok: true, fecha: input.fecha, dryRun: input.dryRun };
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/wep",
    createWepRouter({
      programmedNotificationsService: service,
      technicalAuth(_request, _response, next) { next(); },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/admin/notificaciones/programadas/procesar`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fecha: "2026-09-18", dryRun: true }),
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(received, { fecha: "2026-09-18", dryRun: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
