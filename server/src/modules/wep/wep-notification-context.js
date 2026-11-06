import { AsyncLocalStorage } from "node:async_hooks";

const deliveryContext = new AsyncLocalStorage();
export function normalizeTestPhone(value) {
  if (typeof value !== "string") return null;
  const phone = value.trim().replace(/[\s().-]/g, "").replace(/^\+/, "");
  return /^[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
export function notificationRouting(meta) {
  const routing = meta?.testRouting ?? { enabled: false, phone: "" };
  const phone = normalizeTestPhone(routing.phone);
  if (typeof routing.enabled !== "boolean" || (routing.enabled && !phone)) {
    const error = new Error("El modo de prueba requiere un teléfono internacional válido.");
    error.code = "WEP_TEST_PHONE_INVALID"; throw error;
  }
  return { enabled: routing.enabled, phone: phone || "" };
}
export async function withNotificationRouting(settings, callback) {
  const { config } = await settings.runtime();
  return deliveryContext.run(notificationRouting(config.meta), callback);
}
export function testRecipient() { const context = deliveryContext.getStore(); return context?.enabled ? context.phone : null; }
export function assertNotificationRouting(current) {
  const started = deliveryContext.getStore();
  if (started && (started.enabled !== current.enabled || (started.enabled && started.phone !== current.phone))) {
    const error = new Error("Cambió el modo de prueba durante el aviso. Volvé a intentarlo.");
    error.code = "WEP_TEST_MODE_CHANGED"; throw error;
  }
}
