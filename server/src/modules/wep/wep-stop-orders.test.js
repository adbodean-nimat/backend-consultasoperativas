import assert from "node:assert/strict";
import test from "node:test";
import { resolveStopOrders } from "./wep-stop-orders.util.js";
import { buildProgrammedTemplateData, WepProgrammedNotificationsService } from "./wep-programmed-notifications.service.js";
import { WepProgrammedNotificationTestService } from "./wep-programmed-notification-test.service.js";
import { WepEnRepartoNotificationsService } from "./wep-en-reparto-notifications.service.js";
import { WepStopActionsService } from "./wep-stop-actions.service.js";
import { WepTrackingService } from "./wep-tracking.service.js";
import { buildProgrammedTemplatePayload, buildEnRepartoTemplatePayload, buildEnCaminoEtaTemplatePayload } from "../../services/whatsapp.service.js";

const logger = { log() {}, error() {}, warn() {} };
const publicId = "abcdefghijklmnopqrstuvwx12345678";
const stop = {
  grupoId: "stop_test", viajeId: 10, cliente: { codigo: "C1", nombre: "Cliente prueba" },
  entregaRepresentativaId: 101, telefonoDestino: "5493450000000",
  fechaEntrega: "2026-09-30", horaDesde: "07:30:00", horaHasta: "10:30:00",
  entregas: [883611, 883524, 883611].map((numero, index) => ({ id: 101 + index, notaPedido: { numero } })),
  notifications: [],
  eligibleDeliveryRows: [{ entrega_id: 101 }],
};
const base = { telefono: stop.telefonoDestino, templateLanguage: "es_AR", publicId };

for (const [name, values, principal, otros] of [
  ["NP única duplicada", [883524, 883524], "883524", []],
  ["NP múltiples desordenadas", [883611, 883524, 883611], "883524", ["883611"]],
  ["sin NP", [null, undefined, "", "   "], null, []],
  ["tipos mixtos y datos inválidos", [883524, "883524", " 883611 ", NaN, {}, "null"], "883524", ["883611"]],
  ["orden numérico y precisión", ["9007199254740993", "10", "2"], "2", ["10", "9007199254740993"]],
  ["ceros conservados", ["0012"], "0012", []],
]) {
  test(name, () => {
    const rows = values.map((nota_pedido_numero) => ({ nota_pedido_numero }));
    const expected = { pedidoPrincipal: principal, otrosPedidos: otros, pedidos: principal === null ? [] : [principal, ...otros] };
    assert.deepEqual(resolveStopOrders(rows), expected);
    assert.deepEqual(resolveStopOrders([...rows].reverse()), expected);
  });
}

test("dryRun incluye todas las NP y horas HH:mm sin contrato anterior", async () => {
  assert.deepEqual(buildProgrammedTemplateData(stop), {
    cliente: "Cliente prueba", pedido: { principal: "883524", otros: ["883611"] },
    fechaEntrega: "2026-09-30", horaDesde: "07:30", horaHasta: "10:30", trackingUrl: null,
  });
  const service = new WepProgrammedNotificationsService({ repository: { async findStopsForDate() { return [stop]; } }, logger });
  const result = await service.processProgrammedDeliveryNotifications({ dryRun: true });
  assert.deepEqual(result.resultados[0].datos, buildProgrammedTemplateData(stop));
});

for (const [name, build, data, texts] of [
  ["PROGRAMADA", buildProgrammedTemplatePayload, { templateName: "wep_programada_test", datos: buildProgrammedTemplateData(stop) }, ["883524", "07:30", "10:30"]],
  ["EN_REPARTO", buildEnRepartoTemplatePayload, { templateName: "wep_en_reparto_test", pedidoPrincipal: "883524" }, ["883524"]],
  ["LLEGADA_ESTIMADA", buildEnCaminoEtaTemplatePayload, { templateName: "wep_llegada_estimada_test", pedidoPrincipal: "883524", etaMinutes: 25 }, ["883524", "25"]],
  ["EN_CAMINO_ZONA", buildEnCaminoEtaTemplatePayload, { templateName: "wep_en_camino_zona", pedidoPrincipal: "883524", etaMinutes: 25 }, ["883524", "25"]],
]) {
  test(`payload ${name}: pedido y publicId independientes; rechaza NP ausente`, () => {
    const payload = build({ ...base, ...data });
    assert.deepEqual(payload.template.components, [
      { type: "body", parameters: texts.map((text) => ({ type: "text", text })) },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: publicId }] },
    ]);
    assert.throws(() => build({ ...base, ...data, pedidoPrincipal: null, datos: { pedido: { principal: null } } }), { code: "PEDIDO_NO_DISPONIBLE" });
  });
}

for (const numbers of [[883611, 883524, 883611], [null, "", undefined]]) {
  test(`tracking público con NP ${JSON.stringify(numbers)} sin datos internos`, async () => {
    const service = new WepTrackingService({
      repository: {
        async findPublicTracking() {
          return { token: { id: 1, domicilio_normalizado: "CALLE", localidad_normalizada: "CONCORDIA" },
            deliveries: numbers.map((nota_pedido_numero) => ({ domicilio: "calle", localidad: "Concordia", estado_codigo: "PROGRAMADA", nota_pedido_numero,
              nota_pedido_division: "INTERNO", nota_pedido_tipo: "INTERNO", orden_preparacion_numero: 999 })) };
        },
        async touchAccess() {},
      }, logger,
    });
    const result = await service.getPublicTracking(publicId);
    assert.deepEqual(result.pedido, numbers[0] == null ? { principal: null, otros: [] } : { principal: "883524", otros: ["883611"] });
    assert.doesNotMatch(JSON.stringify(result), /INTERNO|nota_pedido|orden_preparacion|DivisionNotaPedido|NumeroOrdenPreparacion/);
  });
}

test("sin NP: PROGRAMADA real/dryRun y TEST no reservan ni envían", async () => {
  const noOrder = { ...stop, entregas: [{ notaPedido: { numero: null } }] };
  const repository = { async findStopsForDate() { return [noOrder]; }, async findStopByRepresentativeDelivery() { return noOrder; }, async reserveStop() { assert.fail("No reservar"); } };
  const options = { repository, logger, templateName: "wep_programada_test", async whatsappSender() { assert.fail("No enviar"); }, trackingService: { async getOrCreateTrackingForStop() { assert.fail("No crear tracking para envío"); } } };
  for (const dryRun of [true, false]) {
    const result = await new WepProgrammedNotificationsService(options).processProgrammedDeliveryNotifications({ dryRun });
    assert.equal(result.resultados[0].resultado, "PEDIDO_NO_DISPONIBLE");
    assert.equal(result.resumen.listasParaEnviar, 0);
  }
  const result = await new WepProgrammedNotificationTestService(options).send({ entregaRepresentativaId: 101, telefono: stop.telefonoDestino });
  assert.equal(result.whatsapp.errorCodigo, "PEDIDO_NO_DISPONIBLE");
});

test("sin NP: EN_REPARTO registra ERROR con código y no envía", async () => {
  let failed;
  const service = new WepEnRepartoNotificationsService({ logger,
    repository: {
      async findTransitionedStops() { return [{ ...stop, entregas: [] }]; },
      async reserveStop() { return { result: "RESERVADA", notificationId: 1 }; },
      async markFailed(value) { failed = value; },
    },
    async whatsappSender() { assert.fail("No enviar"); },
    trackingService: { async getOrCreateTrackingForStop() { assert.fail("No crear tracking para envío"); } },
  });
  const result = await service.notifyTransitionedStops({ viajeId: 10, entregaIds: [101] });
  assert.equal(result.errores, 1);
  assert.equal(failed.errorCode, "PEDIDO_NO_DISPONIBLE");
});

test("sin NP: EN_CAMINO conserva estado y no calcula ETA ni envía", async () => {
  const context = { grupoId: "stop_test", viaje: { estado: "EN_REPARTO" }, entregas: [{ entrega_id: 101, estado_codigo: "EN_REPARTO" }] };
  const service = new WepStopActionsService({ logger,
    repository: { async getStopContext() { return context; }, async findSuccessfulStopNotice() { return null; }, async reserveStopNotice() { assert.fail("No reservar"); } },
    async whatsappSender() { assert.fail("No enviar"); },
    vehiclePositionService: { async getCurrentPositionByPlate() { assert.fail("No consultar ETA"); } },
  });
  const result = await service.notifyStop(10, "stop_test", 7);
  assert.equal(result.notificacion.errorCodigo, "PEDIDO_NO_DISPONIBLE");
  assert.equal(result.parada.estado.codigo, "EN_REPARTO");
  assert.equal(result.parada.entregasActualizadas, 0);
});
