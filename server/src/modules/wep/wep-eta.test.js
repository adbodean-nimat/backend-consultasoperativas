import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeliveryAddress,
  GeocodingService,
  normalizeDeliveryLocality,
} from "./geocoding.service.js";
import { RoutingService } from "./routing.service.js";
import { formatFriendlyEta } from "./wep-eta.util.js";
import { buildEnCaminoEtaTemplatePayload } from "../../services/whatsapp.service.js";

test("redondea el ETA al múltiplo de cinco más cercano con mínimo amigable", () => {
  assert.equal(formatFriendlyEta(1), 10);
  assert.equal(formatFriendlyEta(7), 10);
  assert.equal(formatFriendlyEta(8), 10);
  assert.equal(formatFriendlyEta(13), 15);
  assert.equal(formatFriendlyEta(22), 20);
  assert.equal(formatFriendlyEta(23), 25);
  assert.equal(formatFriendlyEta(37), 35);
});

test("construye una dirección sin componentes vacíos", () => {
  assert.equal(
    buildDeliveryAddress({
      domicilio: "RANCHO GRANDE",
      localidad: "EL REDOMON",
      provincia: "ENTRE RIOS",
      pais: "ARGENTINA",
    }),
    "RANCHO GRANDE, EL REDOMON, ENTRE RIOS, ARGENTINA",
  );
  assert.equal(
    buildDeliveryAddress({
      domicilio: "PANAMA 139",
      zona: "VILLA ADELA",
      localidad: "VILLA ADELA",
      ciudad: "CONCORDIA",
      provincia: "ENTRE RIOS",
      pais: "ARGENTINA",
    }),
    "PANAMA 139, VILLA ADELA, CONCORDIA, ENTRE RIOS, ARGENTINA",
  );
  assert.equal(
    buildDeliveryAddress({
      domicilio: "RUTA 4 KM 12",
      zona: "COLYERUA",
      localidad: "ESTANCIA GRANDE",
      ciudad: "CONCORDIA",
      provincia: "ENTRE RIOS",
      pais: "ARGENTINA",
    }),
    "RUTA 4 KM 12, COLYERUA, ESTANCIA GRANDE, CONCORDIA, ENTRE RIOS, ARGENTINA",
  );
});

test("elimina el código interno ERP que precede a la localidad", () => {
  assert.equal(normalizeDeliveryLocality("1066, CONCORDIA"), "CONCORDIA");
  assert.equal(normalizeDeliveryLocality(" 1066 ,  CONCORDIA "), "CONCORDIA");
  assert.equal(normalizeDeliveryLocality("CONCORDIA"), "CONCORDIA");
});

test("normaliza la respuesta de geocodificación", async () => {
  const debugLogs = [];
  const service = new GeocodingService({
    env: {
      WEP_GEOCODING_PROVIDER: "google",
      WEP_GOOGLE_GEOCODING_API_KEY: "test-key",
      WEP_GEOCODING_DEBUG: "true",
    },
    logger: {
      info(message, details) { debugLogs.push({ message, details }); },
    },
    httpClient: {
      async get(url, config) {
        assert.equal(url, "https://maps.googleapis.com/maps/api/geocode/json");
        assert.equal(config.params.address, "RANCHO GRANDE, EL REDOMON, ARGENTINA");
        assert.equal(config.params.components, "country:AR");
        assert.equal(config.params.region, "ar");
        return {
          status: 200,
          data: {
            status: "OK",
            results: [{
              formatted_address: "RANCHO GRANDE, EL REDOMON, ARGENTINA",
              types: ["street_address"],
              geometry: {
                location: { lat: -31.2, lng: -58.1 },
                location_type: "ROOFTOP",
              },
              address_components: [{
                long_name: "EL REDOMON",
                types: ["locality", "political"],
              }],
            }],
          },
        };
      },
    },
  });
  assert.deepEqual(
    await service.geocodeDeliveryDestination({
      domicilio: "RANCHO GRANDE",
      localidad: "1066, EL REDOMON",
    }),
    { latitude: -31.2, longitude: -58.1, provider: "google" },
  );
  assert.deepEqual(
    debugLogs.map(({ message }) => message),
    [
      "[WEP ETA][GOOGLE] SOLICITUD",
      "[WEP ETA][GOOGLE] RESPUESTA",
      "[WEP ETA][GOOGLE] CANDIDATO",
      "[WEP ETA][GOOGLE] SELECCIONADO",
    ],
  );
  assert.equal(debugLogs[0].details.localidad, "EL REDOMON");
  assert.equal(JSON.stringify(debugLogs).includes("1066"), false);
  assert.equal(JSON.stringify(debugLogs).includes("test-key"), false);
});

test("rechaza un centro de localidad cuando se pidió un domicilio", async () => {
  const service = new GeocodingService({
    env: {
      WEP_GEOCODING_PROVIDER: "google",
      WEP_GOOGLE_GEOCODING_API_KEY: "test-key",
    },
    httpClient: {
      async get() {
        return {
          status: 200,
          data: {
            status: "OK",
            results: [{
              formatted_address: "EL REDOMON, ARGENTINA",
              types: ["locality", "political"],
              geometry: {
                location: { lat: -31.1, lng: -58.3 },
                location_type: "APPROXIMATE",
              },
              address_components: [{
                long_name: "EL REDOMON",
                types: ["locality", "political"],
              }],
            }],
          },
        };
      },
    },
  });
  await assert.rejects(
    () => service.geocodeDeliveryDestination({
      domicilio: "RANCHO GRANDE",
      localidad: "EL REDOMON",
    }),
    /domicilio preciso/,
  );
});

test("acepta solo el barrio solicitado como zona aproximada", async () => {
  const result = {
    formatted_address: "Villa Adela, Concordia, Entre Ríos, Argentina",
    types: ["neighborhood", "political"],
    partial_match: true,
    geometry: {
      location: { lat: -31.4047734, lng: -58.068884 },
      location_type: "APPROXIMATE",
    },
    address_components: [
      { long_name: "Villa Adela", types: ["sublocality", "political"] },
      { long_name: "Concordia", types: ["locality", "political"] },
      { long_name: "Entre Ríos", types: ["administrative_area_level_1", "political"] },
    ],
  };
  const service = new GeocodingService({
    env: {
      WEP_GOOGLE_GEOCODING_API_KEY: "test-key",
      WEP_GEOCODING_DEFAULT_CITY: "CONCORDIA",
      WEP_GEOCODING_DEFAULT_PROVINCE: "ENTRE RIOS",
    },
    httpClient: {
      async get() { return { status: 200, data: { status: "OK", results: [result] } }; },
    },
  });
  assert.deepEqual(
    await service.geocodeDeliveryDestination({
      domicilio: "SAN CAYETANO 2817",
      zona: "VILLA ADELA",
      localidad: "VILLA ADELA",
    }),
    { latitude: -31.4047734, longitude: -58.068884, provider: "google", approximateArea: true },
  );
  result.address_components[0].long_name = "Otro barrio";
  await assert.rejects(
    () => service.geocodeDeliveryDestination({
      domicilio: "SAN CAYETANO 2817",
      localidad: "VILLA ADELA",
    }),
    /domicilio preciso/,
  );
});

test("acepta un domicilio preciso de Concordia aunque Google omita Villa Adela", async () => {
  let requestedAddress;
  const service = new GeocodingService({
    env: {
      WEP_GEOCODING_PROVIDER: "google",
      WEP_GOOGLE_GEOCODING_API_KEY: "test-key",
      WEP_GEOCODING_DEFAULT_CITY: "CONCORDIA",
      WEP_GEOCODING_DEFAULT_PROVINCE: "ENTRE RIOS",
      WEP_GEOCODING_DEFAULT_COUNTRY: "ARGENTINA",
    },
    httpClient: {
      async get(_url, config) {
        requestedAddress = config.params.address;
        return {
          status: 200,
          data: {
            status: "OK",
            results: [{
              formatted_address: "Panamá 139, Concordia, Entre Ríos, Argentina",
              types: ["street_address"],
              partial_match: false,
              geometry: {
                location: { lat: -31.3997336, lng: -58.0724612 },
                location_type: "RANGE_INTERPOLATED",
              },
              address_components: [
                { long_name: "Concordia", types: ["locality", "political"] },
                {
                  long_name: "Entre Ríos",
                  types: ["administrative_area_level_1", "political"],
                },
              ],
            }],
          },
        };
      },
    },
  });

  assert.deepEqual(
    await service.geocodeDeliveryDestination({
      domicilio: "PANAMA 139",
      zona: "VILLA ADELA",
      localidad: "1077, VILLA ADELA",
    }),
    { latitude: -31.3997336, longitude: -58.0724612, provider: "google" },
  );
  assert.equal(
    requestedAddress,
    "PANAMA 139, VILLA ADELA, CONCORDIA, ENTRE RIOS, ARGENTINA",
  );
});

test("no duplica Concordia cuando ya es la localidad de la entrega", async () => {
  let requestedAddress;
  const service = new GeocodingService({
    env: {
      WEP_GEOCODING_PROVIDER: "google",
      WEP_GOOGLE_GEOCODING_API_KEY: "test-key",
      WEP_GEOCODING_DEFAULT_CITY: "CONCORDIA",
      WEP_GEOCODING_DEFAULT_PROVINCE: "ENTRE RIOS",
      WEP_GEOCODING_DEFAULT_COUNTRY: "ARGENTINA",
    },
    httpClient: {
      async get(_url, config) {
        requestedAddress = config.params.address;
        return {
          status: 200,
          data: {
            status: "OK",
            results: [{
              formatted_address: "San Martín 100, Concordia, Entre Ríos, Argentina",
              types: ["street_address"],
              geometry: {
                location: { lat: -31.39, lng: -58.02 },
                location_type: "ROOFTOP",
              },
              address_components: [
                { long_name: "Concordia", types: ["locality", "political"] },
                {
                  long_name: "Entre Ríos",
                  types: ["administrative_area_level_1", "political"],
                },
              ],
            }],
          },
        };
      },
    },
  });

  await service.geocodeDeliveryDestination({
    domicilio: "SAN MARTIN 100",
    localidad: "CONCORDIA",
  });
  assert.equal(
    requestedAddress,
    "SAN MARTIN 100, CONCORDIA, ENTRE RIOS, ARGENTINA",
  );
});

test("no admite otro proveedor como geocoder", () => {
  const service = new GeocodingService({
    env: {
      WEP_GEOCODING_PROVIDER: "openrouteservice",
      WEP_GOOGLE_GEOCODING_API_KEY: "test-key",
    },
  });
  assert.throws(() => service.getConfiguration(), /sólo admite Google/);
});

test("el cache persistente de coordenadas Google requiere habilitación explícita", () => {
  assert.equal(new GeocodingService({ env: {} }).canUsePersistentCoordinateCache(), false);
  assert.equal(new GeocodingService({
    env: { WEP_GOOGLE_GEOCODING_ALLOW_PERSISTENT_CACHE: "true" },
  }).canUsePersistentCoordinateCache(), true);
});

test("normaliza duración y distancia de una ruta vial", async () => {
  const service = new RoutingService({
    env: {
      WEP_ROUTING_PROVIDER: "openrouteservice",
      WEP_ROUTING_API_KEY: "test-key",
    },
    httpClient: {
      async post(url, body) {
        assert.equal(
          url,
          "https://api.heigit.org/openrouteservice/v2/directions/driving-car",
        );
        assert.deepEqual(body.coordinates, [[-58, -31], [-58.1, -31.2]]);
        return {
          status: 200,
          data: { routes: [{ summary: { duration: 1380, distance: 12450 } }] },
        };
      },
    },
  });
  assert.deepEqual(
    await service.calculateRouteEta({
      origin: { lat: -31, lon: -58 },
      destination: { lat: -31.2, lon: -58.1 },
    }),
    { durationSeconds: 1380, durationMinutes: 23, distanceMeters: 12450 },
  );
});

test("separa el ETA del publicId en los componentes de Meta", () => {
  const publicId = "abcdefghijklmnopqrstuv";
  const payload = buildEnCaminoEtaTemplatePayload({
    telefono: "+54 9 345 000-0000",
    templateName: "wep_en_camino_test",
    templateLanguage: "es_AR",
    etaMinutes: 25,
    publicId,
  });
  assert.equal(payload.template.components[0].parameters[0].text, "25");
  assert.equal(payload.template.components[1].parameters[0].text, publicId);
  assert.equal(payload.template.components[1].parameters[0].text.includes("http"), false);
});
