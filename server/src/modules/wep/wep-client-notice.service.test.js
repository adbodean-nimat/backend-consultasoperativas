import assert from "node:assert/strict";
import test from "node:test";
import {
  WepClientNoticeService,
  WepPwaWhatsappError,
} from "./wep-client-notice.service.js";
import { WepPwaEntregaNoticeConflictError } from "./wep-client-notice.repository.js";

function reservation() {
  return {
    notificationId: 40,
    telefonoDestino: "5493450000000",
    entrega: { id: 101, clienteNombre: "Cliente ejemplo" },
  };
}

test("envía el WhatsApp reservado y confirma el cambio operativo", async () => {
  const calls = [];
  const expected = {
    entrega: {
      id: 101,
      estado: { codigo: "CLIENTE_AVISADO", nombre: "Cliente avisado" },
    },
    notificacion: {
      tipo: "EN_CAMINO",
      canal: "WHATSAPP",
      estado: "ENVIADO",
      enviadoAt: new Date("2026-09-12T15:00:00.000Z"),
    },
  };
  const service = new WepClientNoticeService({
    templateName: "wep_en_camino",
    repository: {
      async reserveNotice(id, vehiculoId, templateName) {
        calls.push({ method: "reserveNotice", id, vehiculoId, templateName });
        return reservation();
      },
      async confirmNotice(payload) {
        calls.push({ method: "confirmNotice", payload });
        return expected;
      },
    },
    async whatsappSender(payload) {
      calls.push({ method: "whatsappSender", payload });
      return { messageId: "wamid.123", templateName: "wep_en_camino" };
    },
  });

  const result = await service.notifyClient(101, 3);

  assert.equal(result, expected);
  assert.deepEqual(calls, [
    {
      method: "reserveNotice",
      id: 101,
      vehiculoId: 3,
      templateName: "wep_en_camino",
    },
    {
      method: "whatsappSender",
      payload: {
        telefono: "5493450000000",
        nombreCliente: "Cliente ejemplo",
      },
    },
    {
      method: "confirmNotice",
      payload: {
        entregaId: 101,
        vehiculoId: 3,
        notificationId: 40,
        messageId: "wamid.123",
        templateName: "wep_en_camino",
      },
    },
  ]);
});

test("ante error de Meta marca ERROR y nunca confirma el estado", async () => {
  const calls = [];
  const providerError = new Error("respuesta completa sensible");
  providerError.status = 500;
  providerError.meta = {
    error: {
      code: 131000,
      message: "Bearer token-secreto no debe persistirse",
    },
  };
  const service = new WepClientNoticeService({
    repository: {
      async reserveNotice() {
        return reservation();
      },
      async failNotice(payload) {
        calls.push({ method: "failNotice", payload });
      },
      async confirmNotice() {
        calls.push({ method: "confirmNotice" });
      },
    },
    async whatsappSender() {
      throw providerError;
    },
  });

  await assert.rejects(
    () => service.notifyClient(101, 3),
    (error) =>
      error instanceof WepPwaWhatsappError &&
      error.message === "No se pudo enviar el aviso por WhatsApp",
  );
  assert.equal(calls.some(({ method }) => method === "confirmNotice"), false);
  assert.deepEqual(calls, [
    {
      method: "failNotice",
      payload: {
        notificationId: 40,
        errorCode: "META_131000",
        errorDetail: "Bearer [REDACTED] no debe persistirse",
      },
    },
  ]);
});

test("un conflicto de reserva impide invocar nuevamente a WhatsApp", async () => {
  let sends = 0;
  const service = new WepClientNoticeService({
    repository: {
      async reserveNotice() {
        throw new WepPwaEntregaNoticeConflictError(
          "El aviso al cliente ya fue solicitado",
        );
      },
    },
    async whatsappSender() {
      sends += 1;
    },
  });

  await assert.rejects(
    () => service.notifyClient(101, 3),
    WepPwaEntregaNoticeConflictError,
  );
  assert.equal(sends, 0);
});
