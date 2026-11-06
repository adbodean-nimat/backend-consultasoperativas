import assert from "node:assert/strict";
import test from "node:test";
import { WepSettingsService, defaultWepSettings, validateWepSettings } from "./wep-settings.service.js";
import { WepIntegrationDiagnostics } from "./wep-integration-diagnostics.js";
import { GestyaService } from "./gestya.service.js";
import { GeocodingService } from "./geocoding.service.js";
import { RoutingService } from "./routing.service.js";

test("valida controles de integración y adapta configuraciones anteriores sin escribir en base", async () => {
  const config = defaultWepSettings({});
  assert.equal(config.integrations.google.timeoutMs, 10000);
  for (const value of [0, 999, 60001, 1200.5, "10000"]) {
    const next = structuredClone(config); next.integrations.google.timeoutMs = value;
    assert.throws(() => validateWepSettings(next));
  }
  const legacy = structuredClone(config); delete legacy.integrations;
  const service = new WepSettingsService({ env: { WEP_SETTINGS_ENABLED: "true", GESTYA_TIMEOUT_MS: "5000" }, postgresPool: { async query(sql) { assert.ok(sql.startsWith("SELECT")); return { rows: [{ revision: 3, config: legacy }] }; } } });
  const read = await service.runtime(); assert.equal(read.revision, 3); assert.equal(read.config.integrations.gestya.timeoutMs, 5000);
  await assert.rejects(service.save({ config: legacy, revision: 3 }, {}), /Actualizá el tablero/);
});

test("el diagnóstico de configuración no devuelve URLs, usuarios ni claves", () => {
  const service = new WepSettingsService({ env: { GESTYA_URL: "secret-url", GESTYA_USER: "secret-user", GESTYA_PASSWORD: "secret-pass", WEP_GOOGLE_GEOCODING_API_KEY: "secret-google", WEP_ROUTING_API_KEY: "secret-route", WEP_ROUTING_PROVIDER: "openrouteservice" } });
  assert.deepEqual(service.integrationStatus(), { gestya: { configured: true }, google: { configured: true }, heigit: { configured: true } });
  assert.equal(JSON.stringify(service.integrationStatus()).includes("secret"), false);
});

test("las pausas impiden llamadas HTTP en los tres proveedores", async () => {
  const config = defaultWepSettings({});
  for (const option of Object.values(config.integrations)) option.enabled = false;
  const settings = new WepSettingsService({ env: {} }); settings.runtime = async () => ({ config });
  const httpClient = { get() { assert.fail("HTTP bloqueado"); }, post() { assert.fail("HTTP bloqueado"); } };
  const gestya = new GestyaService({ settings, httpClient, logger: { log() {}, warn() {} } });
  const google = new GeocodingService({ settings, httpClient });
  const heigit = new RoutingService({ settings, httpClient });
  await assert.rejects(gestya.getCurrentPositionByPlate("AB123CD"));
  await assert.rejects(google.geocodeDeliveryDestination({ domicilio: "Dirección de prueba" }), /pausada/);
  await assert.rejects(heigit.calculateRouteEta({ origin: { lat: -31, lon: -58 }, destination: { lat: -32, lon: -58 } }), /pausada/);
});

test("las pruebas usan datos acotados, limitan repetición y ocultan errores remotos", async () => {
  let now = 0;
  const settings = { requireEnabled() {}, async integration() {}, integrationStatus() { return { gestya: { configured: true }, google: { configured: true }, heigit: { configured: true } }; } };
  const diagnostics = new WepIntegrationDiagnostics({ settings, now: () => now,
    postgresPool: { async query(sql, args) { assert.deepEqual(args, [1]); return { rows: [{ patente: "AB123CD" }] }; } },
    gestya: { async getCurrentPositionByPlate(plate) { assert.equal(plate, "AB123CD"); return { latitude: -31.4, longitude: -58, positionDate: "2026-11-02 10:00", password: "secret" }; } },
    google: { async geocodeDeliveryDestination(args) { assert.deepEqual(args, { domicilio: "Prueba" }); return { latitude: -31.4, longitude: -58, raw: "secret" }; } },
    heigit: { async calculateRouteEta() { throw new Error("Authorization: API-SECRET; internal-url"); } } });
  const actor = { id: 1 };
  assert.deepEqual((await diagnostics.test("gestya", { vehicleId: 1 }, actor)).result, { latitude: -31.4, longitude: -58, positionDate: "2026-11-02 10:00" });
  await assert.rejects(diagnostics.test("gestya", { vehicleId: 1 }, actor), e => e.status === 429);
  now = 10001; await diagnostics.test("gestya", { vehicleId: 1 }, actor);
  assert.equal(JSON.stringify(await diagnostics.test("google", { address: " Prueba " }, actor)).includes("secret"), false);
  const coords = { origin: { lat: -31, lon: -58 }, destination: { lat: -32, lon: -58 } };
  await assert.rejects(diagnostics.test("heigit", coords, actor), e => e.status === 502 && !e.message.includes("API-SECRET") && e.cause === undefined);
  await assert.rejects(diagnostics.test("heigit", { ...coords, origin: { lat: "", lon: 0 } }, actor), /coordenadas/);
  await assert.rejects(diagnostics.test("other", {}, actor), /desconocida/);
});
