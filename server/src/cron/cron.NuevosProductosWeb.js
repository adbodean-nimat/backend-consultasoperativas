import dotenv from "dotenv";
dotenv.config();
import cron from "node-cron";
import { detectNewProducts } from "../services/NuevosProductosWeb.service.js";

const DETECT_NEW_PRODUCTS_CRON_SPEC =
  process.env.DETECT_NEW_PRODUCTS_CRON_SPEC || "0 */1 * * *";
const DETECT_NEW_PRODUCTS_ENABLED =
  process.env.DETECT_NEW_PRODUCTS_ENABLED === "true";

const task = DETECT_NEW_PRODUCTS_ENABLED
  ? cron.createTask(
      DETECT_NEW_PRODUCTS_CRON_SPEC,
      async () => {
        try {
          console.log(
            "[detected-new-products-cron] Ejecutando proceso de detección de nuevos productos web...",
          );
          await detectNewProducts();
        } catch (error) {
          console.error("❌ Error ejecutando cron de nuevos productos web:", error);
        }
      },
      {
        timezone: "America/Argentina/Buenos_Aires",
        noOverlap: true,
      },
    )
  : null;

if (DETECT_NEW_PRODUCTS_ENABLED) {
  console.log(
    `Cron de nuevos productos web configurado con la expresión: ${DETECT_NEW_PRODUCTS_CRON_SPEC}`,
  );
} else {
  console.log("Detección de nuevos productos web está deshabilitada.");
}

export default task;
