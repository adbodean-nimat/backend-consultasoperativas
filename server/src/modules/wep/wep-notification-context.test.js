import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import axios from "axios";
import settings, { defaultWepSettings, validateWepSettings, WepSettingsService } from "./wep-settings.service.js";
import { withNotificationRouting, testRecipient, notificationRouting, normalizeTestPhone } from "./wep-notification-context.js";
import { normalizeAvailablePhone } from "./wep-client-notice.repository.js";
import { createWepRouter } from "./wep.routes.js";
import { enviarTemplateEntregaEnCamino, enviarTemplateEntregaEnCaminoConEta, enviarTemplateEntregaEnReparto, enviarTemplateEntregaProgramada } from "../../services/whatsapp.service.js";

const testPhone = "5493455551234";
const testConfig = () => {
  const config = defaultWepSettings({}); config.meta.testRouting = { enabled: true, phone: testPhone };
  return config;
};

test("valida y normaliza el teléfono de prueba y exige guardarlo al activar", () => {
  assert.equal(normalizeTestPhone("+54 9 (345) 555-1234"), testPhone);
  for (const phone of ["", "abc", "123", "+0000000000", "5493455551234 / 5493455555678"]) {
    const config = testConfig(); config.meta.testRouting.phone = phone;
    assert.throws(() => validateWepSettings(config));
  }
  const config = testConfig(); config.meta.testRouting.phone = "+54 9 (345) 555-1234";
  assert.equal(validateWepSettings(config).meta.testRouting.phone, testPhone);
  assert.throws(() => notificationRouting({ testRouting: { enabled: true, phone: "" } }));
});

test("el contexto redirige teléfonos faltantes sin mutar el ERP ni filtrar datos a otras peticiones", async () => {
  const config = testConfig(), original = { telefono: null, telefono_alternativo: null };
  let release; const wait = new Promise(resolve => { release = resolve; });
  const pending = withNotificationRouting({ async runtime() { return { config }; } }, async () => {
    assert.equal(normalizeAvailablePhone(original), testPhone); await wait;
    assert.equal(testRecipient(), testPhone);
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(testRecipient(), null); assert.equal(normalizeAvailablePhone(original), null);
  release(); await pending;
  assert.deepEqual(original, { telefono: null, telefono_alternativo: null });
});

test("todos los emisores WEP usan exclusivamente el número de prueba, incluida la prueba manual", async () => {
  const originalRuntime = settings.runtime, originalEnabled = settings.enabled, originalToken = settings.token, originalEnv = settings.env, post = axios.post;
  const config = testConfig(); config.meta.phoneNumberId = "123"; config.meta.apiVersion = "v99.0";
  for (const template of Object.values(config.meta.templates)) template.name = "test_template";
  settings.runtime = async () => ({ config }); settings.enabled = () => true; settings.token = async () => "fake-token";
  settings.env = { WEP_WHATSAPP_TEMPLATE_NAME: "test_template", WEP_WHATSAPP_TEMPLATE_PROGRAMADA_TEST: "test_template" };
  const phones = [];
  axios.post = async (_url, body) => { phones.push(body.to); return { data: { messages: [{ id: "test-id" }] } }; };
  const options = { telefono: "5493459999999", publicId: "a".repeat(24), pedidoPrincipal: "123", etaMinutes: 10, datos: { pedido: { principal: "123" }, horaDesde: "08:00", horaHasta: "12:00" } };
  try {
    await withNotificationRouting(settings, async () => {
      await enviarTemplateEntregaEnCamino({ ...options, nombreCliente: "Prueba" });
      await enviarTemplateEntregaEnCaminoConEta(options);
      await enviarTemplateEntregaEnCaminoConEta({ ...options, approximateArea: true });
      await enviarTemplateEntregaEnReparto(options);
      await enviarTemplateEntregaProgramada(options);
      await enviarTemplateEntregaProgramada({ ...options, test: true });
    });
    assert.deepEqual(phones, Array(6).fill(testPhone));
    config.meta.paused = true;
    await assert.rejects(enviarTemplateEntregaEnReparto(options), e => e.code === "WEP_WHATSAPP_PAUSED"); assert.equal(phones.length, 6);
    config.meta.paused = false;
    await withNotificationRouting(settings, async () => {
      config.meta.testRouting.enabled = false;
      await assert.rejects(enviarTemplateEntregaEnReparto(options), e => e.code === "WEP_TEST_MODE_CHANGED");
    });
    assert.equal(phones.length, 6);
    await enviarTemplateEntregaEnReparto(options); assert.equal(phones.at(-1), options.telefono);
    assert.equal(options.telefono, "5493459999999");
  } finally { settings.runtime = originalRuntime; settings.enabled = originalEnabled; settings.token = originalToken; settings.env = originalEnv; axios.post = post; }
});

test("configuraciones anteriores reciben el modo desactivado sin cambiar su revisión", async () => {
  const config = defaultWepSettings({}); delete config.meta.testRouting;
  const service = new WepSettingsService({ env: { WEP_SETTINGS_ENABLED: "true" }, postgresPool: { async query() { return { rows: [{ config, revision: 5 }] }; } } });
  const result = await service.runtime(); assert.equal(result.revision, 5); assert.deepEqual(result.config.meta.testRouting, { enabled: false, phone: "" });
});

test("el detalle para la PWA muestra el teléfono de prueba sin escribir ni alterar los datos originales", async () => {
  const original = { id: 1, contacto: { telefono: null, telefonoAlternativo: null, email: null } };
  const app = express();
  app.use(createWepRouter({ notificationSettings: { async runtime() { return { config: testConfig() }; } },
    pwaRepository: { async getPwaEntregaDetalle() { return original; } },
    wepAuth(req, _res, next) { req.wepVehicle = { id: 1 }; next(); } }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/pwa/entregas/1`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).entrega.contacto, { telefono: testPhone, telefonoAlternativo: null, email: null, modoPrueba: true });
    assert.equal(original.contacto.telefono, null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
