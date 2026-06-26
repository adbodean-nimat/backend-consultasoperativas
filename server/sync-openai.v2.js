import dotenv from "dotenv";
dotenv.config();
import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Ajustá estos valores a tu entorno
const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID_V2;
const LOCAL_FILE_PATH_PRODUCTOS = process.env.FILE_PRODUCTOS_V2;
const LOCAL_FILE_PATH_FAQ = process.env.FILE_FAQ_V2;
const LOCAL_FILE_PATH_INFO = process.env.FILE_INFO_V2;
const TARGET_FILE_NAME_PRODUCTOS = "productos.json";
const TARGET_FILE_NAME_FAQ = "faq.md";
const TARGET_FILE_NAME_INFO = "nimat_conocimiento_general.md";
const SYNC_STATE_PATH =
  process.env.SYNC_OPENAI_V2_STATE_PATH ||
  path.join("storage", "sync-openai.v2.state.json");

const LOCAL_SOURCES = [
  {
    key: "productos",
    label: TARGET_FILE_NAME_PRODUCTOS,
    localPath: LOCAL_FILE_PATH_PRODUCTOS,
    targetFileName: TARGET_FILE_NAME_PRODUCTOS,
  },
  {
    key: "faq",
    label: TARGET_FILE_NAME_FAQ,
    localPath: LOCAL_FILE_PATH_FAQ,
    targetFileName: TARGET_FILE_NAME_FAQ,
  },
  {
    key: "info",
    label: TARGET_FILE_NAME_INFO,
    localPath: LOCAL_FILE_PATH_INFO,
    targetFileName: TARGET_FILE_NAME_INFO,
  },
];

async function findExistingFileByFilename(vectorStoreId, targetFileName) {
  // 1) Listar archivos del vector store
  for await (const item of client.vectorStores.files.list(vectorStoreId)) {
    const fileId = item.id || item.file_id || item; // depende de la versión de la API
    if (!fileId) continue;

    // 2) Preguntar a Files API por los metadatos
    let fileInfo;
    try {
      fileInfo = await client.files.retrieve(fileId);
    } catch (error) {
      if (isOpenAINotFoundError(error)) {
        console.warn(
          `⚠️ Vector Store tiene un vínculo stale: ${fileId}. El File ya no existe en OpenAI Files API.`,
        );
        await deleteStaleVectorStoreFile(vectorStoreId, fileId);
        continue;
      }

      throw error;
    }

    // En el SDK nuevo suele ser fileInfo.filename
    if (fileInfo.filename === targetFileName) {
      return {
        vectorStoreFileId: item.id, // id del vínculo en el vector store
        fileId: fileInfo.id, // id del file en Files API
        filename: fileInfo.filename,
      };
    }
  }

  return null;
}

function isOpenAINotFoundError(error) {
  return error?.status === 404 || error?.error?.type === "not_found_error";
}

async function deleteStaleVectorStoreFile(vectorStoreId, fileId) {
  try {
    await client.vectorStores.files.delete(fileId, {
      vector_store_id: vectorStoreId,
    });
    console.warn(`   • Vínculo stale eliminado del Vector Store: ${fileId}`);
  } catch (error) {
    if (isOpenAINotFoundError(error)) {
      console.warn(`   • El vínculo stale ya no existía: ${fileId}`);
      return;
    }

    console.warn(
      `   • No se pudo eliminar el vínculo stale ${fileId}: ${error.message}`,
    );
  }
}

async function deleteVectorStoreFileIfExists(vectorStoreId, fileId, label) {
  try {
    await client.vectorStores.files.delete(fileId, {
      vector_store_id: vectorStoreId,
    });
    console.log(`   • Vínculo viejo eliminado: ${fileId}`);
  } catch (error) {
    if (isOpenAINotFoundError(error)) {
      console.warn(`   • Vínculo viejo ya no existía para ${label}: ${fileId}`);
      return;
    }

    throw error;
  }
}

async function deleteOpenAIFileIfExists(fileId, label) {
  try {
    await client.files.delete(fileId);
    console.log(`   • Archivo viejo eliminado: ${fileId}`);
  } catch (error) {
    if (isOpenAINotFoundError(error)) {
      console.warn(`   • Archivo viejo ya no existía para ${label}: ${fileId}`);
      return;
    }

    throw error;
  }
}

function readSyncState() {
  try {
    if (!fs.existsSync(SYNC_STATE_PATH)) {
      return { files: {} };
    }

    return JSON.parse(fs.readFileSync(SYNC_STATE_PATH, "utf8"));
  } catch (error) {
    console.warn(
      `⚠️ No se pudo leer el estado de sincronización (${SYNC_STATE_PATH}): ${error.message}`,
    );
    return { files: {} };
  }
}

function writeSyncState(localFiles) {
  const nextState = {
    updated_at: new Date().toISOString(),
    vector_store_id: VECTOR_STORE_ID,
    files: localFiles.reduce((acc, file) => {
      acc[file.key] = file.metadata;
      return acc;
    }, {}),
  };

  const stateDir = path.dirname(SYNC_STATE_PATH);
  if (stateDir && stateDir !== ".") {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  fs.writeFileSync(SYNC_STATE_PATH, JSON.stringify(nextState, null, 2), "utf8");
  return nextState;
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

async function getLocalFileMetadata(source) {
  const stat = await fsPromises.stat(source.localPath);
  const sha256 = await hashFile(source.localPath);

  return {
    path: source.localPath,
    filename: source.targetFileName,
    size: stat.size,
    mtime: stat.mtime.toISOString(),
    mtimeMs: Math.trunc(stat.mtimeMs),
    sha256,
  };
}

function hasLocalFileChanged(previous, current) {
  if (!previous) return true;

  if (previous.sha256 || current.sha256) {
    return previous.sha256 !== current.sha256;
  }

  if (previous.size !== current.size) {
    return true;
  }

  return previous.mtimeMs !== current.mtimeMs;
}

async function getExistingFilesByKey(vectorStoreId) {
  const existingFiles = {};

  for (const source of LOCAL_SOURCES) {
    existingFiles[source.key] = await findExistingFileByFilename(
      vectorStoreId,
      source.targetFileName,
    );
  }

  return existingFiles;
}

function formatExistingFiles(existingFiles) {
  return LOCAL_SOURCES.map((source) => {
    const existing = existingFiles[source.key];
    return existing
      ? `${source.label}: ${existing.fileId}`
      : `${source.label}: no encontrado`;
  }).join("\n        ");
}

export async function syncOpenAIv2() {
  if (!VECTOR_STORE_ID) {
    console.error("Falta la variable VECTOR_STORE_ID_V2");
    process.exit(1);
  }

  // 0) Verificar archivo local
  for (const source of LOCAL_SOURCES) {
    if (!source.localPath) {
      console.error(`Falta configurar la ruta local para ${source.label}`);
      process.exit(1);
    }

    try {
      await fsPromises.access(source.localPath);
    } catch {
      console.error(`No se encuentra el archivo local: ${source.localPath}`);
      process.exit(1);
    }
  }

  console.log(`📂 Vector store: ${VECTOR_STORE_ID}`);
  console.log(
    `📄 Archivos local: ${LOCAL_FILE_PATH_PRODUCTOS}, ${LOCAL_FILE_PATH_FAQ}, ${LOCAL_FILE_PATH_INFO}`,
  );

  console.log("🔎 Verificando cambios en archivos locales...");
  const localFiles = await Promise.all(
    LOCAL_SOURCES.map(async (source) => ({
      ...source,
      metadata: await getLocalFileMetadata(source),
    })),
  );
  const previousSyncState = readSyncState();
  const sameVectorStore = previousSyncState.vector_store_id === VECTOR_STORE_ID;

  // 1) Buscar si ya existen los archivos en el vector store (por filename real)
  console.log(
    "🔍 Buscando productos.json/faq.md/nimat_conocimiento_general.md existentes en el vector store...",
  );
  const existingFiles = await getExistingFilesByKey(VECTOR_STORE_ID);
  console.log(
    `Encontrado:
        ${formatExistingFiles(existingFiles)}
      `,
  );

  const filesToUpload = localFiles.filter((file) => {
    const previous = previousSyncState.files?.[file.key];
    const changed = hasLocalFileChanged(previous, file.metadata);
    const missingInVectorStore = !existingFiles[file.key]?.vectorStoreFileId;

    return !sameVectorStore || changed || missingInVectorStore;
  });

  if (filesToUpload.length === 0) {
    console.log(
      "✅ Sin cambios locales. No se suben archivos ni se actualiza el Vector Store.",
    );
    return { updated: false, changedFiles: [] };
  }

  console.log(
    `   • Archivos a actualizar: ${filesToUpload.map((file) => file.label).join(", ")}`,
  );

  const uploadedFiles = [];

  for (const file of filesToUpload) {
    const existing = existingFiles[file.key];
    const previous = previousSyncState.files?.[file.key];
    const reason = !sameVectorStore
      ? "vector store diferente o sin estado previo"
      : !existing?.vectorStoreFileId
        ? "no existe en el vector store"
        : hasLocalFileChanged(previous, file.metadata)
          ? "cambió el archivo local"
          : "actualización requerida";

    // 2) Subir nuevo archivo a Files API
    console.log(`⬆️ Subiendo ${file.label} (${reason})...`);
    const uploadedFile = await client.files.create({
      file: fs.createReadStream(file.localPath),
      purpose: "assistants",
    });

    console.log(`   • Nuevo fileId: ${uploadedFile.id}`);

    // 3) Asociar el nuevo file al vector store
    console.log(`📌 Asociando ${file.label} al vector store...`);
    await client.vectorStores.files.create(VECTOR_STORE_ID, {
      file_id: uploadedFile.id,
    });

    console.log(`✅ ${file.label} asociado correctamente.`);

    // 4) Eliminar el vínculo viejo del vector store y el archivo viejo en Files API
    if (existing?.vectorStoreFileId) {
      console.log(`🧹 Eliminando vínculo viejo de ${file.label}...`);
      await deleteVectorStoreFileIfExists(
        VECTOR_STORE_ID,
        existing.vectorStoreFileId,
        file.label,
      );
    }

    if (existing?.fileId) {
      console.log(`🧹 Eliminando archivo viejo de ${file.label}...`);
      await deleteOpenAIFileIfExists(existing.fileId, file.label);
    }

    uploadedFiles.push({
      key: file.key,
      filename: file.targetFileName,
      fileId: uploadedFile.id,
    });
  }

  writeSyncState(localFiles);
  console.log(`📝 Estado local actualizado: ${SYNC_STATE_PATH}`);
  console.log("🎉 Listo: vector store actualizado");

  return {
    updated: true,
    changedFiles: filesToUpload.map((file) => file.key),
    uploadedFiles,
  };
}

/* syncOpenAIv2().catch((err) => {
  console.error(
    "Error actualizando el vector store:",
    err.response?.data ?? err,
  );
  process.exit(1);
}); */
