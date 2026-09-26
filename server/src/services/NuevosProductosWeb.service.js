import Db from "../../dboperacion.js";
import Pg from "../../dboperacion_pg.js";

const DETECT_NEW_PRODUCTS_ENABLED =
  process.env.DETECT_NEW_PRODUCTS_ENABLED === "true";

export async function detectNewProducts() {
  if (!DETECT_NEW_PRODUCTS_ENABLED) {
    console.log("Detección de nuevos productos está deshabilitada.");
    return;
  }
  const newProducts = await Db.detectarNuevosProductos();
  if (newProducts && newProducts.length > 0) {
    console.log(`Detectado nuevo producto: ${newProducts.length}`);
    // Here you can add logic to handle the new products, e.g., update a catalog, send notifications, etc.
    for (const product of newProducts) {
      await Pg.createArticuloNuevoWeb(
        product.codigo_articulo,
        product.nombre_articulo,
      );
    }
  } else {
    console.log("No nuevos productos detectados.");
  }
}
