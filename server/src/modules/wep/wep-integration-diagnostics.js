import pool from "./wep-postgres.js";
import settingsService from "./wep-settings.service.js";
import gestyaService from "./gestya.service.js";
import geocodingService from "./geocoding.service.js";
import routingService from "./routing.service.js";
import { WepAdminError } from "./wep-admin-auth.js";

export class WepIntegrationDiagnostics {
  constructor({ settings = settingsService, gestya = gestyaService, google = geocodingService, heigit = routingService, postgresPool = pool, now = () => Date.now() } = {}) {
    Object.assign(this, { settings, gestya, google, heigit, pool: postgresPool, now }); this.attempts = new Map();
  }
  async test(provider, input, actor) {
    this.settings.requireEnabled();
    if (!["gestya", "google", "heigit"].includes(provider)) throw new WepAdminError("Integración desconocida.");
    let args;
    if (provider === "gestya") {
      if (!Number.isSafeInteger(input?.vehicleId) || input.vehicleId < 1) throw new WepAdminError("Seleccioná un camión para probar GESTYA.");
      args = input.vehicleId;
    } else if (provider === "google") {
      if (typeof input?.address !== "string" || !input.address.trim() || input.address.length > 300) throw new WepAdminError("Ingresá una dirección de hasta 300 caracteres.");
      args = { domicilio: input.address.trim() };
    } else {
      const point = value => value && typeof value.lat === "number" && typeof value.lon === "number" && Number.isFinite(value.lat) && Number.isFinite(value.lon) && Math.abs(value.lat) <= 90 && Math.abs(value.lon) <= 180;
      if (!point(input?.origin) || !point(input?.destination)) throw new WepAdminError("Ingresá coordenadas válidas para origen y destino.");
      if (input.origin.lat === input.destination.lat && input.origin.lon === input.destination.lon) throw new WepAdminError("El origen y el destino deben ser diferentes.");
      args = { origin: { lat: input.origin.lat, lon: input.origin.lon }, destination: { lat: input.destination.lat, lon: input.destination.lon } };
    }
    const key = `${actor.id}:${provider}`, now = this.now();
    if (this.attempts.has(key) && now - this.attempts.get(key) < 10000) throw new WepAdminError("Esperá 10 segundos antes de repetir esta prueba.", 429);
    this.attempts.set(key, now);
    if (this.attempts.size > 1000) this.attempts.delete(this.attempts.keys().next().value);
    await this.settings.integration(provider);
    if (!this.settings.integrationStatus()[provider].configured) throw new WepAdminError("Falta completar la configuración de esta integración en el servidor.", 409);
    try {
      let result;
      if (provider === "gestya") {
        const vehicle = (await this.pool.query("SELECT patente FROM public.vehiculos WHERE id = $1", [args])).rows[0];
        if (!vehicle?.patente) throw new WepAdminError("El camión no tiene una patente disponible.", 404);
        const position = await this.gestya.getCurrentPositionByPlate(vehicle.patente);
        result = { latitude: position.latitude, longitude: position.longitude, positionDate: position.positionDate || null };
      } else if (provider === "google") {
        const position = await this.google.geocodeDeliveryDestination(args);
        result = { latitude: position.latitude, longitude: position.longitude, approximateArea: position.approximateArea === true };
      } else {
        const route = await this.heigit.calculateRouteEta(args);
        result = { durationMinutes: route.durationMinutes, distanceMeters: route.distanceMeters };
      }
      return { provider, checkedAt: new Date(this.now()).toISOString(), result };
    } catch (error) {
      if (error instanceof WepAdminError) throw error;
      // No devolver cause, cabeceras, URL, claves o respuestas completas del proveedor.
      throw new WepAdminError(`No se pudo completar la prueba de ${provider === "google" ? "Google" : provider === "heigit" ? "HeiGIT" : "GESTYA"}. Revisá credenciales, disponibilidad y datos de prueba.`, 502);
    }
  }
}
export default new WepIntegrationDiagnostics();
