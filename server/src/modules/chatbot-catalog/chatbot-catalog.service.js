import fsPromises from "node:fs/promises";
import path from "node:path";

const CATALOG_PATH =
  process.env.FILE_PRODUCTOS_V2 || process.env.OUTPUT_JSON_V2;
const NIMAT_BASE_URL = "https://www.nimat.com.ar";

let cachedIndex = null;
let cachedMtimeMs = -1;
let cachedSourceModifiedAt = null;
let pendingLoad = null;

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function isTrue(value) {
  return value === true || String(value).trim().toUpperCase() === "TRUE";
}

function productUrl(value) {
  if (!value) return null;
  try {
    return new URL(String(value), `${NIMAT_BASE_URL}/`).toString();
  } catch {
    return null;
  }
}

function normalizeStock(value) {
  if (typeof value === "boolean") {
    return { quantity: value ? 1 : 0, available: value, quantityKnown: false };
  }

  const quantity = Number(value);
  if (!Number.isFinite(quantity)) {
    return { quantity: 0, available: false, quantityKnown: false };
  }

  return {
    quantity: Math.max(0, quantity),
    available: quantity > 0,
    quantityKnown: true,
  };
}

function normalizeProduct(item) {
  const metadata = item?.metadata || {};
  const sku = normalizeSku(metadata.sku ?? item?.SKU);
  if (!sku) return null;

  const stock = normalizeStock(metadata.stock ?? item?.StockQuantity);
  const rawPrice = Number(metadata.precio ?? item?.Price);
  const hasMetadataActive = typeof metadata.activo === "boolean";
  const active = hasMetadataActive
    ? metadata.activo
    : isTrue(item?.Published) &&
      item?.VisibleIndividually !== false &&
      String(item?.VisibleIndividually).toUpperCase() !== "FALSE" &&
      !isTrue(item?.Deleted);
  const buyDisabled = item?.DisableBuyButton == null
    ? !stock.available
    : isTrue(item.DisableBuyButton);

  return {
    sku,
    name: String(metadata.nombre ?? item?.Name ?? "").trim(),
    price: Number.isFinite(rawPrice) ? rawPrice : null,
    stock: stock.quantity,
    stockQuantityKnown: stock.quantityKnown,
    active,
    available: active && !buyDisabled && stock.available,
    buyDisabled,
    url: productUrl(metadata.url ?? item?.SeName),
  };
}

function buildProductIndex(products) {
  const index = new Map();
  for (const item of products) {
    const product = normalizeProduct(item);
    if (product && !index.has(product.sku)) index.set(product.sku, product);
  }
  return index;
}

async function loadCatalogIndex() {
  if (!CATALOG_PATH) {
    throw new Error("Falta configurar FILE_PRODUCTOS_V2 u OUTPUT_JSON_V2.");
  }
  if (pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    const filePath = path.resolve(CATALOG_PATH);
    let stat;
    try {
      stat = await fsPromises.stat(filePath);
    } catch (error) {
      if (cachedIndex) {
        console.warn(
          "[chatbot-catalog] productos.json no está disponible momentáneamente; se conserva el último índice válido:",
          error.message,
        );
        return cachedIndex;
      }
      throw error;
    }
    if (cachedIndex && cachedMtimeMs === stat.mtimeMs) return cachedIndex;

    try {
      const parsed = JSON.parse(await fsPromises.readFile(filePath, "utf8"));
      if (!Array.isArray(parsed)) {
        throw new Error("productos.json no contiene un array.");
      }

      const index = buildProductIndex(parsed);
      cachedIndex = index;
      cachedMtimeMs = stat.mtimeMs;
      cachedSourceModifiedAt = stat.mtime.toISOString();
      console.log(
        `[chatbot-catalog] Índice cargado desde productos.json: ${index.size} SKU.`,
      );
      return index;
    } catch (error) {
      if (cachedIndex) {
        console.warn(
          "[chatbot-catalog] No se pudo recargar productos.json; se conserva el último índice válido:",
          error.message,
        );
        return cachedIndex;
      }
      throw error;
    }
  })().finally(() => {
    pendingLoad = null;
  });

  return pendingLoad;
}

export async function findLiveCatalogProducts(requestedSkus) {
  const uniqueSkus = [...new Set(requestedSkus.map(normalizeSku).filter(Boolean))];
  const catalogIndex = await loadCatalogIndex();

  return {
    checkedAt: new Date().toISOString(),
    sourceModifiedAt: cachedSourceModifiedAt,
    products: uniqueSkus.flatMap((sku) =>
      catalogIndex.has(sku) ? [catalogIndex.get(sku)] : [],
    ),
    missing: uniqueSkus.filter((sku) => !catalogIndex.has(sku)),
  };
}
