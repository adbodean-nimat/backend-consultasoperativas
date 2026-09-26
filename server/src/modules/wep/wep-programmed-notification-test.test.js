import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createWepRouter } from "./wep.routes.js";
import {
  mapProgrammedNotificationStops,
  PROGRAMMED_TEST_NOTICE_TYPE,
  WepProgrammedNotificationsRepository,
} from "./wep-programmed-notifications.repository.js";
import { WepProgrammedNotificationTestService } from "./wep-programmed-notification-test.service.js";
import { validateProgrammedNotificationTestBody } from "./wep.validator.js";

const silentLogger = { log() {}, error() {} };
const publicId = "abcdefghijklmnopqrstuvwx12345678";

function row(overrides = {}) {
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
    entrega_id: 91,
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
    telefono: "5493451111111",
    telefono_alternativo: null,
    domicilio: "San Martín 123",
    localidad: "Concordia",
    fecha_entrega: "2026-09-18",
    hora_desde: "07:30:00",
    hora_hasta: "10:30:00",
    peso_calculado: 1,
    volumen_calculado: 1,
    bultos_calculados: 1,
    notificacion_id: null,
    notificacion_estado: null,
    ...overrides,
  };
}

function stop(rows = [row()]) {
  return mapProgrammedNotificationStops(rows)[0];
}

test("valida el body y normaliza el teléfono con el helper existente", () => {
  assert.deepEqual(
    validateProgrammedNotificationTestBody({
      entregaRepresentativaId: 91,
      telefono: "+54 9 345 111-1111",
    }),
    { entregaRepresentativaId: 91, telefono: "5493451111111" },
  );
  assert.throws(() =>
    validateProgrammedNotificationTestBody({
      entregaRepresentativaId: "91",
      telefono: "5493451111111",
    }),
  );
  assert.throws(() =>
    validateProgrammedNotificationTestBody({
      entregaRepresentativaId: 91,
      telefono: "sin teléfono",
    }),
  );
});

test("resuelve la entrega mediante groupPwaViajes y exige una única parada", async () => {
  let calls = 0;
  const repository = new WepProgrammedNotificationsRepository({
    postgresPool: {
      async query(sql, params) {
        calls += 1;
        if (calls === 1) {
          assert.match(sql, /SELECT viaje_id FROM public\.entregas/);
          assert.deepEqual(params, [91]);
          return { rows: [{ viaje_id: 10 }] };
        }
        assert.match(sql, /WHERE e\.viaje_id = \$1/);
        return { rows: [row()] };
      },
    },
  });

  const resolved = await repository.findStopByRepresentativeDelivery(91);
  assert.equal(resolved.grupoId.startsWith("stop_"), true);
  assert.equal(resolved.viajeId, 10);
  assert.equal(resolved.entregaRepresentativaId, 91);
});

test("envía HH:mm, sólo publicId al botón y registra el resultado TEST", async () => {
  const calls = [];
  const service = new WepProgrammedNotificationTestService({
    repository: {
      async findStopByRepresentativeDelivery() { return stop(); },
      async reserveTestNotice(value) {
        calls.push({ method: "reserve", value });
        return 501;
      },
      async confirmTestSent(value) { calls.push({ method: "confirm", value }); },
    },
    trackingService: {
      async getOrCreateTrackingForStop(value) {
        calls.push({ method: "tracking", value });
        return {
          publicId,
          url: `https://wep.nimat.com.ar/s/${publicId}`,
        };
      },
    },
    async whatsappSender(value) {
      calls.push({ method: "send", value });
      return { messageId: "wamid.test", templateName: "wep_programada_test" };
    },
    templateName: "wep_programada_test",
    templateLanguage: "es",
    logger: silentLogger,
  });

  const result = await service.send({
    entregaRepresentativaId: 91,
    telefono: "5493451111111",
  });

  const send = calls.find(({ method }) => method === "send").value;
  assert.equal(send.datos.horaDesde, "07:30");
  assert.equal(send.datos.horaHasta, "10:30");
  assert.equal(send.publicId, publicId);
  assert.equal(send.templateLanguage, "es");
  assert.equal("url" in send, false);
  assert.deepEqual(result.whatsapp, { messageId: "wamid.test", status: "SENT" });
  assert.equal(result.tracking.url, `https://wep.nimat.com.ar/s/${publicId}`);
});

test("la persistencia usa PROGRAMADA_TEST y no PROGRAMADA", async () => {
  let received;
  const repository = new WepProgrammedNotificationsRepository({
    postgresPool: {
      async query(sql, params) {
        received = { sql, params };
        return { rows: [{ id: 501 }] };
      },
    },
  });

  await repository.reserveTestNotice({
    entregaId: 91,
    telefono: "5493451111111",
    templateName: "wep_programada_test",
  });

  assert.equal(received.params[1], PROGRAMMED_TEST_NOTICE_TYPE);
  assert.equal(received.params[1], "PROGRAMADA_TEST");
  assert.match(received.sql, /ON CONFLICT \(entrega_id, tipo\) DO UPDATE/);
});

test("el endpoint técnico usa auth admin y delega un único envío", async () => {
  let authCalls = 0;
  let received;
  const app = express();
  app.use(express.json());
  app.use(
    "/api/wep",
    createWepRouter({
      technicalAuth(_request, _response, next) {
        authCalls += 1;
        next();
      },
      programmedNotificationTestService: {
        async send(input) {
          received = input;
          return { ok: true, test: true };
        },
      },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/admin/notificaciones/programadas/test`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entregaRepresentativaId: 91,
          telefono: "+54 9 345 111-1111",
        }),
      },
    );
    assert.equal(response.status, 200);
    assert.equal(authCalls, 1);
    assert.deepEqual(received, {
      entregaRepresentativaId: 91,
      telefono: "5493451111111",
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
