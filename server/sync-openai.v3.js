import dotenv from "dotenv";
dotenv.config();
import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VECTOR_STORE_ID =
  process.env.VECTOR_STORE_ID_V3 || process.env.VECTOR_STORE_ID_V2;
const LEGACY_PRODUCTS_PATH =
  process.env.FILE_PRODUCTOS_V3 || process.env.FILE_PRODUCTOS_V2;
const PRODUCTS_MANIFEST_PATH =
  process.env.OUTPUT_VECTOR_MANIFEST_V3 ||
  process.env.OUTPUT_VECTOR_MANIFEST_V2 ||
  path.join(
    path.dirname(LEGACY_PRODUCTS_PATH || "."),
    "vector-products.manifest.json",
  );
const PRODUCTS_DIRECTORY =
  process.env.OUTPUT_VECTOR_PRODUCTS_DIR_V3 ||
  process.env.OUTPUT_VECTOR_PRODUCTS_DIR_V2 ||
  path.join(path.dirname(LEGACY_PRODUCTS_PATH || "."), "vector-products");
const SYNC_STATE_PATH =
  process.env.SYNC_OPENAI_V3_STATE_PATH ||
  path.join("storage", "sync-openai.v3.state.json");
const UPLOAD_CONCURRENCY = Math.max(
  1,
  Math.min(20, Number(process.env.OPENAI_PRODUCT_UPLOAD_CONCURRENCY || 8)),
);
const BATCH_SIZE = 1000;
const PRODUCT_CHUNKING = {
  type: "static",
  static: { max_chunk_size_tokens: 800, chunk_overlap_tokens: 0 },
};

const GENERAL_SOURCES = [
  {
    key: "faq",
    label: "faq.md",
    localPath: process.env.FILE_FAQ_V3 || process.env.FILE_FAQ_V2,
    targetFileName: "faq.md",
  },
  {
    key: "info",
    label: "nimat_conocimiento_general.md",
    localPath: process.env.FILE_INFO_V3 || process.env.FILE_INFO_V2,
    targetFileName: "nimat_conocimiento_general.md",
  },
];

function isOpenAINotFoundError(error) {
  return error?.status === 404 || error?.error?.type === "not_found_error";
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(`⚠️ No se pudo leer ${filePath}: ${error.message}`);
    }
    return fallback;
  }
}

function readSyncState() {
  return readJson(SYNC_STATE_PATH, { files: {}, products: {} });
}

function writeSyncState(state) {
  const stateDir = path.dirname(SYNC_STATE_PATH);
  if (stateDir && stateDir !== ".") fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    SYNC_STATE_PATH,
    JSON.stringify(
      {
        version: 2,
        updated_at: new Date().toISOString(),
        vector_store_id: VECTOR_STORE_ID,
        legacy_products_removed: Boolean(state.legacy_products_removed),
        files: state.files || {},
        products: state.products || {},
      },
      null,
      2,
    ),
    "utf8",
  );
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function localFileMetadata(source) {
  const stat = await fsPromises.stat(source.localPath);
  return {
    path: source.localPath,
    filename: source.targetFileName,
    size: stat.size,
    mtime: stat.mtime.toISOString(),
    mtimeMs: Math.trunc(stat.mtimeMs),
    sha256: await hashFile(source.localPath),
  };
}

function localFileChanged(previous, current) {
  if (!previous) return true;
  return previous.sha256 !== current.sha256;
}

async function findExistingFileByFilename(targetFileName) {
  for await (const item of client.vectorStores.files.list(VECTOR_STORE_ID)) {
    const fileId = item.id || item.file_id;
    if (!fileId) continue;
    try {
      const fileInfo = await client.files.retrieve(fileId);
      if (fileInfo.filename === targetFileName) return fileInfo;
    } catch (error) {
      if (!isOpenAINotFoundError(error)) throw error;
    }
  }
  return null;
}

async function deleteRemoteFile(fileId, label) {
  if (!fileId) return;
  try {
    await client.vectorStores.files.delete(fileId, {
      vector_store_id: VECTOR_STORE_ID,
    });
  } catch (error) {
    if (!isOpenAINotFoundError(error)) throw error;
  }
  try {
    await client.files.delete(fileId);
  } catch (error) {
    if (!isOpenAINotFoundError(error)) throw error;
  }
  console.log(`   • Remoto anterior eliminado: ${label} (${fileId})`);
}

function loadProductManifest() {
  const manifest = readJson(PRODUCTS_MANIFEST_PATH, null);
  if (!manifest || manifest.version !== 1 || !manifest.products) {
    throw new Error(
      `Manifiesto de productos inexistente o inválido: ${PRODUCTS_MANIFEST_PATH}. Ejecutá primero sincronizarCompletoV3().`,
    );
  }
  return manifest;
}

function productFilePath(entry) {
  const root = path.resolve(PRODUCTS_DIRECTORY);
  const filePath = path.resolve(root, entry.filename);
  if (path.dirname(filePath) !== root) {
    throw new Error(
      `Ruta de producto fuera del directorio permitido: ${entry.filename}`,
    );
  }
  return filePath;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function syncGeneralFiles(previousState, sameVectorStore) {
  const nextFiles = {};
  const changed = [];

  for (const source of GENERAL_SOURCES) {
    if (!source.localPath) throw new Error(`Falta configurar ${source.label}`);
    await fsPromises.access(source.localPath);
    const metadata = await localFileMetadata(source);
    const previous = sameVectorStore ? previousState.files?.[source.key] : null;
    let previousFileId = previous?.file_id;
    if (!previousFileId) {
      previousFileId = (await findExistingFileByFilename(source.targetFileName))
        ?.id;
    }

    if (
      !sameVectorStore ||
      localFileChanged(previous, metadata) ||
      !previousFileId
    ) {
      console.log(`⬆️ Subiendo ${source.label}...`);
      const uploaded = await client.files.create({
        file: fs.createReadStream(source.localPath),
        purpose: "assistants",
      });
      try {
        await client.vectorStores.files.createAndPoll(VECTOR_STORE_ID, {
          file_id: uploaded.id,
        });
      } catch (error) {
        await deleteRemoteFile(uploaded.id, `${source.label} fallido`);
        throw error;
      }
      if (previousFileId) await deleteRemoteFile(previousFileId, source.label);
      nextFiles[source.key] = { ...metadata, file_id: uploaded.id };
      changed.push(source.key);
    } else {
      nextFiles[source.key] = { ...metadata, file_id: previousFileId };
    }
  }
  return { files: nextFiles, changed };
}

async function syncProductFiles(manifest, previousState, sameVectorStore) {
  const previousProducts = sameVectorStore ? previousState.products || {} : {};
  const entries = Object.entries(manifest.products).map(([sku, entry]) => ({
    sku,
    ...entry,
  }));
  const changed = entries.filter((entry) => {
    const previous = previousProducts[entry.sku];
    return (
      !previous?.file_id ||
      previous.sha256 !== entry.sha256 ||
      JSON.stringify(previous.attributes || {}) !==
        JSON.stringify(entry.attributes || {})
    );
  });
  const removed = Object.keys(previousProducts).filter(
    (sku) => !manifest.products[sku],
  );

  console.log(
    `📦 Productos: ${entries.length} totales, ${changed.length} nuevos/cambiados, ${removed.length} eliminados.`,
  );

  const uploaded = [];
  try {
    await mapLimit(changed, UPLOAD_CONCURRENCY, async (entry) => {
      const filePath = productFilePath(entry);
      await fsPromises.access(filePath);
      const file = await client.files.create({
        file: fs.createReadStream(filePath),
        purpose: "assistants",
      });
      uploaded.push({ ...entry, file_id: file.id });
    });

    for (const batch of chunks(uploaded, BATCH_SIZE)) {
      const result = await client.vectorStores.fileBatches.createAndPoll(
        VECTOR_STORE_ID,
        {
          files: batch.map((entry) => ({
            file_id: entry.file_id,
            attributes: entry.attributes,
            chunking_strategy: PRODUCT_CHUNKING,
          })),
        },
      );
      if (result.status !== "completed" || result.file_counts?.failed) {
        throw new Error(
          `Falló un lote de productos: status=${result.status}, failed=${result.file_counts?.failed || 0}`,
        );
      }
    }
  } catch (error) {
    await Promise.allSettled(
      uploaded.map((entry) => deleteRemoteFile(entry.file_id, entry.sku)),
    );
    throw error;
  }

  const newUploads = new Map(uploaded.map((entry) => [entry.sku, entry]));
  const nextProducts = {};
  for (const entry of entries) {
    nextProducts[entry.sku] = {
      filename: entry.filename,
      sha256: entry.sha256,
      attributes: entry.attributes,
      file_id:
        newUploads.get(entry.sku)?.file_id ||
        previousProducts[entry.sku]?.file_id,
    };
  }

  const oldIds = [
    ...changed.map((entry) => previousProducts[entry.sku]?.file_id),
    ...removed.map((sku) => previousProducts[sku]?.file_id),
  ].filter(Boolean);
  await mapLimit(oldIds, 4, (fileId) => deleteRemoteFile(fileId, "producto"));

  return {
    products: nextProducts,
    changed: changed.map((entry) => entry.sku),
    removed,
  };
}

export async function syncOpenAIv3() {
  if (!VECTOR_STORE_ID) {
    throw new Error("Falta configurar VECTOR_STORE_ID_V3 o VECTOR_STORE_ID_V2");
  }
  const manifest = loadProductManifest();
  const previousState = readSyncState();
  const sameVectorStore = previousState.vector_store_id === VECTOR_STORE_ID;

  console.log(`📂 Vector store: ${VECTOR_STORE_ID}`);
  console.log(`📄 Manifiesto: ${PRODUCTS_MANIFEST_PATH}`);

  // Se resuelve antes de cargar miles de archivos; luego de migrar se conserva el flag.
  let legacyProducts = null;
  if (!sameVectorStore || !previousState.legacy_products_removed) {
    legacyProducts = await findExistingFileByFilename("productos.json");
  }

  const general = await syncGeneralFiles(previousState, sameVectorStore);
  const products = await syncProductFiles(
    manifest,
    previousState,
    sameVectorStore,
  );

  // El monolito se elimina únicamente después de que todos los documentos por SKU
  // quedaron procesados correctamente.
  if (legacyProducts?.id) {
    await deleteRemoteFile(legacyProducts.id, "productos.json legado");
  }

  writeSyncState({
    vector_store_id: VECTOR_STORE_ID,
    legacy_products_removed: true,
    files: general.files,
    products: products.products,
  });
  console.log(`📝 Estado local actualizado: ${SYNC_STATE_PATH}`);
  console.log("🎉 Vector store actualizado por producto");

  return {
    updated:
      general.changed.length > 0 ||
      products.changed.length > 0 ||
      products.removed.length > 0 ||
      Boolean(legacyProducts?.id),
    changedFiles: general.changed,
    changedProducts: products.changed,
    removedProducts: products.removed,
  };
}

