import crypto from "node:crypto";
import express from "express";
import { findLiveCatalogProducts } from "./chatbot-catalog.service.js";

const router = express.Router();
const MAX_SKUS = 20;

function secretsMatch(received, expected) {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

router.post("/products", async (request, response) => {
  const expectedToken = process.env.CHATBOT_CATALOG_SERVICE_TOKEN;
  const receivedToken = request.get("x-chatbot-token");
  if (!expectedToken) {
    return response
      .status(503)
      .json({ error: "Servicio de catálogo no configurado." });
  }
  if (!secretsMatch(receivedToken, expectedToken)) {
    return response.status(401).json({ error: "No autorizado." });
  }

  const skus = Array.isArray(request.body?.skus) ? request.body.skus : [];
  console.log(
    `[chatbot-catalog] Requesting catalog for ${skus.length} SKUs:`,
    skus,
  );
  const normalized = [
    ...new Set(skus.map((sku) => String(sku).trim()).filter(Boolean)),
  ];
  if (normalized.length === 0 || normalized.length > MAX_SKUS) {
    return response.status(400).json({
      error: `El campo skus debe contener entre 1 y ${MAX_SKUS} valores únicos.`,
    });
  }

  try {
    response.set("Cache-Control", "no-store");
    return response.json(await findLiveCatalogProducts(normalized));
  } catch (error) {
    console.error("[chatbot-catalog] Error consultando catálogo", error);
    return response
      .status(502)
      .json({ error: "No se pudo consultar el catálogo." });
  }
});

export default router;
