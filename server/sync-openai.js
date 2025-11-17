import 'dotenv/config';
import fs from 'node:fs';
import fsPromises from'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Ajustá estos valores a tu entorno
const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID;
const LOCAL_FILE_PATH = process.env.OUTPUT_JSON;
const TARGET_FILE_NAME = "productos.json";

async function findExistingFileByFilename(vectorStoreId, targetFileName) {
  // 1) Listar archivos del vector store
  const list = await client.vectorStores.files.list(vectorStoreId);
  const items = list.data ?? list;

  for (const item of items) {
    const fileId = item.id || item.file_id || item; // depende de la versión de la API
    if (!fileId) continue;

    // 2) Preguntar a Files API por los metadatos
    const fileInfo = await client.files.retrieve(fileId);

    // En el SDK nuevo suele ser fileInfo.filename
    if (fileInfo.filename === targetFileName) {
      return {
        vectorStoreFileId: item.id, // id del vínculo en el vector store
        fileId: fileInfo.id,        // id del file en Files API
        filename: fileInfo.filename,
      };
    }
  }

  return null;
}

export async function syncOpenAI() {
  if (!VECTOR_STORE_ID) {
    console.error("Falta la variable VECTOR_STORE_ID");
    process.exit(1);
  }

  // 0) Verificar archivo local
  try {
    await fsPromises.access(LOCAL_FILE_PATH);
  } catch {
    console.error(`No se encuentra el archivo local: ${LOCAL_FILE_PATH}`);
    process.exit(1);
  }

  console.log(`📂 Vector store: ${VECTOR_STORE_ID}`);
  console.log(`📄 Archivo local: ${LOCAL_FILE_PATH}`);

  // 1) Buscar si ya existe un producto.json en el vector store (por filename real)
  console.log("🔍 Buscando productos.json existente en el vector store...");
  const existing = await findExistingFileByFilename(
    VECTOR_STORE_ID,
    TARGET_FILE_NAME
  );

  if (existing) {
    console.log(
      `Encontrado: ${existing.filename} (vectorStoreFileId: ${existing.vectorStoreFileId}, fileId: ${existing.fileId})`
    );
  } else {
    console.log("No hay productos.json previo en el vector store.");
  }

  // 2) Subir nuevo archivo a Files API
  console.log("⬆️ Subiendo nuevo productos.json a Files API...");
  const uploadedFile = await client.files.create({
    file: fs.createReadStream(LOCAL_FILE_PATH),
    purpose: "assistants",
    //filename: path.basename(LOCAL_FILE_PATH),
  });

  console.log(`Nuevo file subido. fileId: ${uploadedFile.id}`);

  // 3) Asociar el nuevo file al vector store
  console.log("📌 Asociando nuevo file al vector store...");
  await client.vectorStores.files.create(VECTOR_STORE_ID, {
    file_id: uploadedFile.id,
  });
  console.log("✅ Asociado correctamente.");

  // 4) (Opcional) Eliminar el vínculo viejo del vector store
  if (existing?.vectorStoreFileId) {
      console.log("🧹 Eliminando archivo viejo del vector store...");
      await client.vectorStores.files.delete(
        existing.vectorStoreFileId,
        {
          vector_store_id: VECTOR_STORE_ID
        }        
      );
      console.log("Viejo vínculo eliminado del vector store.");
      
      console.log("🧹 Eliminando archivo viejo -productos.json-");
      await client.files.delete(existing.fileId);
      console.log("Archivo viejo -productos.json- eliminado")
  }

  console.log("🎉 Listo: vector store actualizado con el nuevo productos.json");
  console.log("🎉 Listo: archivo viejo eliminado (productos.json)");
}
