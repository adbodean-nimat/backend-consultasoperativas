import axios from "axios";

const DEFAULT_TIMEOUT_MS = 10_000;

export class WepGeocodingError extends Error {}

function timeoutFrom(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function enabled(value) {
  return ["1", "true", "yes", "si", "sí"].includes(
    String(value || "").trim().toLowerCase(),
  );
}

function validCoordinates(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function normalizePlace(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function samePlace(expected, actual) {
  const normalizedExpected = normalizePlace(expected);
  const normalizedActual = normalizePlace(actual);
  if (!normalizedExpected) return true;
  if (!normalizedActual) return false;
  return (
    normalizedActual.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedActual)
  );
}

function getGoogleAddressComponent(result, acceptedTypes) {
  const component = (result?.address_components || []).find(({ types = [] }) =>
    acceptedTypes.some((type) => types.includes(type)),
  );
  return component?.long_name || component?.short_name || "";
}

function isPreciseGoogleResult(result, hasStreetAddress) {
  if (!hasStreetAddress) return true;
  const impreciseTypes = new Set([
    "locality",
    "administrative_area_level_1",
    "administrative_area_level_2",
    "country",
    "postal_code",
    "neighborhood",
    "sublocality",
    "sublocality_level_1",
  ]);
  const types = Array.isArray(result?.types) ? result.types : [];
  return (
    !types.some((type) => impreciseTypes.has(type)) &&
    result?.geometry?.location_type !== "APPROXIMATE"
  );
}

function summarizeGoogleResult(
  result,
  expectedDeliveryLocality,
  expectedCity,
  expectedRegion,
  hasStreetAddress,
) {
  const locality = getGoogleAddressComponent(result, [
    "locality",
    "postal_town",
    "administrative_area_level_2",
  ]);
  const sublocality = getGoogleAddressComponent(result, [
    "sublocality_level_1",
    "sublocality",
    "neighborhood",
    "administrative_area_level_3",
  ]);
  const region = getGoogleAddressComponent(result, ["administrative_area_level_1"]);
  const latitude = Number(result?.geometry?.location?.lat);
  const longitude = Number(result?.geometry?.location?.lng);
  const deliveryLocalityMatches = [sublocality, locality, result?.formatted_address]
    .some((value) => samePlace(expectedDeliveryLocality, value));
  const cityMatches = expectedCity
    ? samePlace(expectedCity, locality)
    : deliveryLocalityMatches;
  const regionMatches = samePlace(expectedRegion, region);
  const precise = isPreciseGoogleResult(result, hasStreetAddress);
  const coordinatesAreValid = validCoordinates(latitude, longitude);
  const partialMatch = Boolean(result?.partial_match);
  const deliveryLocalityAccepted = deliveryLocalityMatches ||
    (Boolean(expectedCity) && cityMatches && !partialMatch);
  return {
    direccionCompleta: result?.formatted_address || null,
    tipos: Array.isArray(result?.types) ? result.types : [],
    precision: result?.geometry?.location_type || null,
    coincidenciaParcial: partialMatch,
    localidad: locality || null,
    sublocalidad: sublocality || null,
    provincia: region || null,
    latitud: coordinatesAreValid ? latitude : null,
    longitud: coordinatesAreValid ? longitude : null,
    localidadCoincide: deliveryLocalityMatches,
    localidadOmitidaPorGoogleAceptada:
      !deliveryLocalityMatches && deliveryLocalityAccepted,
    ciudadCoincide: cityMatches,
    provinciaCoincide: regionMatches,
    precisionAceptable: precise,
    coordenadasValidas: coordinatesAreValid,
    aceptado:
      deliveryLocalityAccepted && cityMatches && regionMatches && precise && coordinatesAreValid,
  };
}

export function buildDeliveryAddress({
  domicilio,
  zona,
  localidad,
  ciudad,
  provincia,
  pais,
}) {
  const seen = new Set();
  return [domicilio, zona, localidad, ciudad, provincia, pais]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const normalized = normalizePlace(value);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join(", ");
}

export function normalizeDeliveryLocality(value) {
  return String(value || "")
    .replace(/^\s*\d+\s*,\s*/, "")
    .trim();
}

export class GeocodingService {
  constructor({ httpClient = axios, env = process.env, logger = console } = {}) {
    this.httpClient = httpClient;
    this.env = env;
    this.logger = logger;
  }

  debug(event, details = {}) {
    if (!enabled(this.env.WEP_GEOCODING_DEBUG)) return;
    this.logger.info?.(`[WEP ETA][GOOGLE] ${event}`, details);
  }

  canUsePersistentCoordinateCache() {
    return enabled(this.env.WEP_GOOGLE_GEOCODING_ALLOW_PERSISTENT_CACHE);
  }

  getConfiguration() {
    const provider = String(this.env.WEP_GEOCODING_PROVIDER || "google")
      .trim()
      .toLowerCase();
    const apiKey = String(this.env.WEP_GOOGLE_GEOCODING_API_KEY || "").trim();
    if (provider !== "google") {
      throw new WepGeocodingError("WEP sólo admite Google como geocoder");
    }
    if (!apiKey) {
      throw new WepGeocodingError("Falta WEP_GOOGLE_GEOCODING_API_KEY");
    }
    return {
      provider,
      apiKey,
      baseUrl: String(
        this.env.WEP_GEOCODING_BASE_URL ||
          "https://maps.googleapis.com/maps/api/geocode/json",
      ).replace(/\/+$/, ""),
      timeout: timeoutFrom(this.env.WEP_GEOCODING_TIMEOUT_MS),
    };
  }

  async geocodeDeliveryDestination({ domicilio, zona, localidad, provincia, pais }) {
    const region = provincia || this.env.WEP_GEOCODING_DEFAULT_PROVINCE || null;
    const country = pais || this.env.WEP_GEOCODING_DEFAULT_COUNTRY || "ARGENTINA";
    const city = String(this.env.WEP_GEOCODING_DEFAULT_CITY || "").trim() || null;
    const geocodingLocality = normalizeDeliveryLocality(localidad);
    const cityForAddress = city && !samePlace(geocodingLocality, city)
      ? city
      : null;
    const address = buildDeliveryAddress({
      domicilio,
      zona,
      localidad: geocodingLocality,
      ciudad: cityForAddress,
      provincia: region,
      pais: country,
    });
    if (!address) {
      throw new WepGeocodingError("El destino no tiene una dirección geocodificable");
    }

    const { apiKey, baseUrl, timeout } = this.getConfiguration();
    const countryCode = String(
      this.env.WEP_GEOCODING_COUNTRY_CODE || "AR",
    ).trim().toUpperCase();
    this.debug("SOLICITUD", {
      domicilio: domicilio || null,
      zona: zona || null,
      localidad: geocodingLocality || null,
      ciudad: city,
      provincia: region,
      pais: country,
      direccionConsultada: address,
      endpoint: baseUrl,
      countryCode,
      cachePersistente: this.canUsePersistentCoordinateCache(),
      timeoutMs: timeout,
    });

    try {
      const response = await this.httpClient.get(baseUrl, {
        params: {
          key: apiKey,
          address,
          components: `country:${countryCode}`,
          language: "es",
          region: countryCode.toLowerCase(),
        },
        timeout,
        validateStatus: () => true,
      });
      const googleStatus = response.data?.status || null;
      const results = Array.isArray(response.data?.results)
        ? response.data.results
        : [];
      this.debug("RESPUESTA", {
        httpStatus: response.status,
        googleStatus,
        cantidadResultados: results.length,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new WepGeocodingError(
          `Google Geocoding respondió HTTP ${response.status}`,
        );
      }
      if (googleStatus !== "OK") {
        const suffix = googleStatus ? ` (${googleStatus})` : "";
        throw new WepGeocodingError(
          `Google Geocoding no pudo resolver el destino${suffix}`,
        );
      }

      const hasStreetAddress = Boolean(String(domicilio || "").trim());
      const candidates = results.map((result, index) => ({
        index,
        result,
        summary: summarizeGoogleResult(
          result,
          geocodingLocality,
          city,
          region,
          hasStreetAddress,
        ),
      }));
      candidates.forEach(({ index, summary }) => {
        this.debug("CANDIDATO", { index, ...summary });
      });
      const selected = candidates.find(({ summary }) => summary.aceptado);
      const approximateArea = !selected && hasStreetAddress && candidates.find(({ summary }) =>
        Boolean(geocodingLocality && summary.sublocalidad) &&
        ["APPROXIMATE", "GEOMETRIC_CENTER"].includes(summary.precision) &&
        summary.tipos.some((type) => ["neighborhood", "sublocality", "sublocality_level_1"].includes(type)) &&
        samePlace(geocodingLocality, summary.sublocalidad) &&
        summary.ciudadCoincide &&
        summary.provinciaCoincide &&
        summary.coordenadasValidas,
      );
      if (!selected && !approximateArea) {
        this.debug("RECHAZADO", {
          motivo: "ningún resultado coincide con localidad, provincia y precisión",
        });
        throw new WepGeocodingError(
          "Google no encontró un domicilio preciso en la localidad y provincia solicitadas",
        );
      }
      const chosen = selected || approximateArea;
      this.debug(approximateArea ? "SELECCIONADO_ZONA" : "SELECCIONADO", {
        index: chosen.index,
        ...chosen.summary,
      });
      return {
        latitude: chosen.summary.latitud,
        longitude: chosen.summary.longitud,
        provider: "google",
        ...(approximateArea ? { approximateArea: true } : {}),
      };
    } catch (error) {
      this.debug("ERROR", {
        mensaje: error?.message || "Error desconocido",
        httpStatus: error?.response?.status || null,
        codigo: error?.code || null,
      });
      if (error instanceof WepGeocodingError) throw error;
      throw new WepGeocodingError("No se pudo geocodificar el destino", {
        cause: error,
      });
    }
  }
}

export default new GeocodingService();
