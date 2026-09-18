import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  normalizeNumericQrSegment,
  parseWepQr,
} from "./wep-qr.util.js";
import {
  WepPwaQrStopConflictError,
  WepPwaQrTripConflictError,
  WepPwaRepository,
} from "./wep-pwa.repository.js";
import { createWepRouter } from "./wep.routes.js";
import { WepValidationError } from "./wep.validator.js";

function row(overrides = {}) {
  return {
    viaje_id: "10",
    numero_vuelta: 1,
    viaje_estado: "EN_REPARTO",
    iniciado_at: null,
    finalizado_at: null,
    vehiculo_id: "3",
    codigo_erp: "001",
    vehiculo_nombre: "Camión 1",
    patente: "AA000AA",
    entrega_id: "101",
    orden_secuencia: 1,
    estado_codigo: "EN_REPARTO",
    estado_nombre: "En reparto",
    orden_preparacion_division: "1",
    orden_preparacion_tipo: "OP",
    orden_preparacion_numero: "62472",
    nota_pedido_division: "1",
    nota_pedido_tipo: "NPC",
    nota_pedido_numero: "883524",
    cliente_codigo: "12345",
    cliente_nombre: "Cliente ejemplo",
    domicilio: "Laprida 241",
    localidad: "Concordia",
    hora_desde: "09:00:00",
    hora_hasta: "11:00:00",
    peso_calculado: "200.5",
    volumen_calculado: "0.7",
    bultos_calculados: "4",
    ...overrides,
  };
}

test("parsea el QR WEP preservando ceros y normalizando prefijo y tipo", () => {
  assert.deepEqual(parseWepQr({ qr: " wep|0001|npc|0000883524 " }), {
    division: "0001",
    tipo: "NPC",
    pedido: "0000883524",
  });
  assert.equal(normalizeNumericQrSegment("0000883524"), "883524");
  assert.equal(normalizeNumericQrSegment("0000"), "0");
  assert.equal(normalizeNumericQrSegment("A001"), "A001");
});

test("rechaza QR faltante, vacío, incompleto, con campos vacíos o prefijo ajeno", () => {
  const cases = [
    [{}, "El código QR es obligatorio"],
    [{ qr: 123 }, "El código QR es obligatorio"],
    [{ qr: "   " }, "El código QR es obligatorio"],
    [{ qr: "WEP|0001|NPC" }, "El código QR tiene un formato inválido"],
    [{ qr: "WEP|0001||123" }, "El código QR tiene un formato inválido"],
    [{ qr: "ABC|0001|NPC|123" }, "El código QR no corresponde a WEP"],
  ];

  for (const [body, message] of cases) {
    assert.throws(
      () => parseWepQr(body),
      (error) => error instanceof WepValidationError && error.message === message,
    );
  }
});

test("resuelve varias órdenes de la NP como una parada completa", async () => {
  const queries = [];
  const matches = [
    row(),
    row({
      entrega_id: "102",
      orden_preparacion_numero: "108961",
      bultos_calculados: "2",
      peso_calculado: "150",
      volumen_calculado: "0.5",
    }),
  ];
  const repository = new WepPwaRepository({
    postgresPool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: queries.length === 1 ? matches : matches };
      },
    },
  });

  const result = await repository.resolvePwaQr(
    { division: "0001", tipo: "NPC", pedido: "0000883524" },
    3,
  );

  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0].params, ["1", "NPC", "883524", 3]);
  assert.match(queries[0].sql, /e\.vehiculo_id = \$4/);
  assert.match(queries[0].sql, /v\.vehiculo_id = \$4/);
  assert.match(queries[0].sql, /e\.nota_pedido_numero::text = \$3/);
  assert.doesNotMatch(queries[0].sql, /\b(INSERT|UPDATE|DELETE)\b/i);
  assert.deepEqual(queries[1].params, [10, 3]);
  assert.equal(result.viaje.id, 10);
  assert.equal(result.parada.cantidadOrdenes, 2);
  assert.deepEqual(
    result.parada.entregas.map((entrega) => entrega.id),
    [101, 102],
  );
  assert.deepEqual(result.parada.totales, {
    bultos: 6,
    peso: 350.5,
    volumen: 1.2,
  });
});

test("devuelve null sin coincidencias y no revela entregas de otro vehículo", async () => {
  let calls = 0;
  const repository = new WepPwaRepository({
    postgresPool: {
      async query(_sql, params) {
        calls += 1;
        assert.equal(params[3], 3);
        return { rows: [] };
      },
    },
  });

  assert.equal(
    await repository.resolvePwaQr(
      { division: "0001", tipo: "NPC", pedido: "0000883524" },
      3,
    ),
    null,
  );
  assert.equal(calls, 1);
});

test("rechaza la misma NP en más de una vuelta o parada", async () => {
  const tripConflictRepository = new WepPwaRepository({
    postgresPool: {
      async query() {
        return { rows: [row(), row({ viaje_id: "11", entrega_id: "102" })] };
      },
    },
  });
  await assert.rejects(
    () =>
      tripConflictRepository.resolvePwaQr(
        { division: "1", tipo: "NPC", pedido: "883524" },
        3,
      ),
    (error) =>
      error instanceof WepPwaQrTripConflictError &&
      error.cantidadViajes === 2,
  );

  const stopConflictRepository = new WepPwaRepository({
    postgresPool: {
      async query() {
        return {
          rows: [
            row(),
            row({ entrega_id: "102", domicilio: "Otra dirección 10" }),
          ],
        };
      },
    },
  });
  await assert.rejects(
    () =>
      stopConflictRepository.resolvePwaQr(
        { division: "1", tipo: "NPC", pedido: "883524" },
        3,
      ),
    (error) =>
      error instanceof WepPwaQrStopConflictError &&
      error.cantidadParadas === 2,
  );
});

async function postQr(pwaRepository, body) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/wep",
    createWepRouter({
      pwaRepository,
      wepAuth(request, _response, next) {
        request.wepVehicle = { id: 3 };
        next();
      },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/pwa/qr/resolve`,
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

test("el endpoint responde 200, normaliza QR y usa sólo el vehículo autenticado", async () => {
  let received;
  const response = await postQr(
    {
      async resolvePwaQr(qr, vehiculoId) {
        received = { qr, vehiculoId };
        return {
          viaje: { id: 10, numeroVuelta: 1 },
          parada: {
            grupoId: "stop_ab12cd34ef56",
            estado: { codigo: "EN_REPARTO", nombre: "En reparto" },
            entregas: [{ id: 101 }, { id: 102 }],
          },
        };
      },
    },
    { qr: " WEP|0001|npc|0000883524 ", vehiculoId: 999 },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    qr: { division: "0001", tipo: "NPC", pedido: "0000883524" },
    vehiculoId: 3,
  });
  assert.equal(response.body.accionSugerida, "AVISAR_CLIENTE");
  assert.deepEqual(response.body.qr, received.qr);
});

test("el endpoint traduce validaciones, ausencia, conflictos y errores internos", async () => {
  const invalidPrefix = await postQr({}, { qr: "ABC|0001|NPC|0000883524" });
  assert.equal(invalidPrefix.status, 400);
  assert.equal(invalidPrefix.body.message, "El código QR no corresponde a WEP");

  const incomplete = await postQr({}, { qr: "WEP|0001|NPC" });
  assert.equal(incomplete.status, 400);

  const missing = await postQr({ resolvePwaQr: async () => null }, {
    qr: "WEP|0001|NPC|0000883524",
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.message, "No se encontró una parada para este QR");

  const stopConflict = await postQr(
    {
      async resolvePwaQr() {
        throw new WepPwaQrStopConflictError(2);
      },
    },
    { qr: "WEP|0001|NPC|0000883524" },
  );
  assert.equal(stopConflict.status, 409);
  assert.equal(stopConflict.body.cantidadParadas, 2);

  const tripConflict = await postQr(
    {
      async resolvePwaQr() {
        throw new WepPwaQrTripConflictError(2);
      },
    },
    { qr: "WEP|0001|NPC|0000883524" },
  );
  assert.equal(tripConflict.status, 409);
  assert.equal(
    tripConflict.body.message,
    "La Nota de Pedido está asociada a más de una vuelta",
  );

  const internal = await postQr(
    { resolvePwaQr: async () => Promise.reject(new Error("database error")) },
    { qr: "WEP|0001|NPC|0000883524" },
  );
  assert.equal(internal.status, 500);
  assert.deepEqual(internal.body, {
    ok: false,
    message: "Ocurrió un error al procesar el código QR",
  });
});
