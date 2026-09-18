import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  WepPwaEntregaNotFoundError,
  WepPwaEntregaNoticeConflictError,
  WepPwaEntregaPhoneConflictError,
  WepPwaEntregaStateConflictError,
} from "./wep-client-notice.repository.js";
import { WepPwaWhatsappError } from "./wep-client-notice.service.js";
import { createWepRouter } from "./wep.routes.js";

function testAuth(request, _response, next) {
  request.wepVehicle = { id: 3 };
  next();
}

async function postAvisar(id, clientNoticeService) {
  const app = express();
  app.use(
    "/api/wep",
    createWepRouter({ clientNoticeService, wepAuth: testAuth }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/wep/pwa/entregas/${id}/avisar`,
      { method: "POST" },
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("POST avisar devuelve la respuesta exitosa sin exponer el teléfono", async () => {
  let receivedId;
  const enviadoAt = "2026-09-12T15:00:00.000Z";
  const result = await postAvisar(101, {
    async notifyClient(id) {
      receivedId = id;
      return {
        entrega: {
          id: 101,
          estado: { codigo: "CLIENTE_AVISADO", nombre: "Cliente avisado" },
        },
        notificacion: {
          tipo: "EN_CAMINO",
          canal: "WHATSAPP",
          estado: "ENVIADO",
          enviadoAt,
        },
      };
    },
  });

  assert.equal(receivedId, 101);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    ok: true,
    message: "Cliente avisado correctamente",
    entrega: {
      id: 101,
      estado: { codigo: "CLIENTE_AVISADO", nombre: "Cliente avisado" },
    },
    notificacion: {
      tipo: "EN_CAMINO",
      canal: "WHATSAPP",
      estado: "ENVIADO",
      enviadoAt,
    },
  });
  assert.equal("telefono" in result.body.notificacion, false);
});

test("POST avisar valida un id entero positivo", async () => {
  let called = false;
  const clientNoticeService = {
    async notifyClient() {
      called = true;
    },
  };

  for (const id of ["abc", "0", "-1", "1.5"]) {
    const result = await postAvisar(id, clientNoticeService);
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, {
      ok: false,
      message: "El id de entrega debe ser un número entero válido",
    });
  }
  assert.equal(called, false);
});

test("POST avisar mapea entrega inexistente a 404", async () => {
  const result = await postAvisar(999, {
    async notifyClient() {
      throw new WepPwaEntregaNotFoundError("Entrega no encontrada");
    },
  });

  assert.deepEqual(result, {
    status: 404,
    body: { ok: false, message: "Entrega no encontrada" },
  });
});

test("POST avisar mapea estados, teléfono y duplicado a 409", async () => {
  const conflicts = [
    new WepPwaEntregaStateConflictError("El cliente ya fue avisado"),
    new WepPwaEntregaStateConflictError(
      "La entrega no admite este aviso en su estado actual",
    ),
    new WepPwaEntregaPhoneConflictError(
      "La entrega no tiene un número de teléfono válido para WhatsApp",
    ),
    new WepPwaEntregaNoticeConflictError(
      "El aviso al cliente ya fue solicitado",
    ),
  ];

  for (const error of conflicts) {
    const result = await postAvisar(101, {
      async notifyClient() {
        throw error;
      },
    });
    assert.equal(result.status, 409);
    assert.deepEqual(result.body, { ok: false, message: error.message });
  }
});

test("POST avisar mapea un error del proveedor a 502", async () => {
  const result = await postAvisar(101, {
    async notifyClient() {
      throw new WepPwaWhatsappError(
        "No se pudo enviar el aviso por WhatsApp",
      );
    },
  });

  assert.deepEqual(result, {
    status: 502,
    body: {
      ok: false,
      message: "No se pudo enviar el aviso por WhatsApp",
    },
  });
});
