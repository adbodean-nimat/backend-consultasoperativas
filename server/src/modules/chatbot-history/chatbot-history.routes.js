import express from "express";
import { authenticateToken } from "../../../auth.middleware.js";
import { ChatbotHistoryError, createChatbotHistoryService } from "./chatbot-history.service.js";

const roles = new Set(["Gerencia", "Ventas", "Sistemas"]);

function requireHistorySector(req, res, next) {
  const memberOf = req.user?.memberOf ?? [];
  const groups = Array.isArray(memberOf) ? memberOf : [memberOf];
  const allowed = groups.some(group => typeof group === "string" && roles.has(/^CN=([^,]+)(?:,|$)/i.exec(group)?.[1]?.trim()));
  if (!allowed) return res.status(403).json({ ok: false, code: "CHATBOT_FORBIDDEN", message: "Tu sector no tiene permiso para consultar conversaciones." });
  return next();
}

export function createChatbotHistoryRouter({ service = createChatbotHistoryService() } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set({ "Cache-Control": "no-store, private", "Surrogate-Control": "no-store", Pragma: "no-cache", Expires: "0" });
    // Cada lectura debe devolver datos, incluso ante validadores de una caché anterior.
    delete req.headers["if-none-match"];
    delete req.headers["if-modified-since"];
    next();
  });
  router.use(authenticateToken, requireHistorySector);
  router.use((req, res, next) => {
    if (req.method !== "GET") return res.set("Allow", "GET").status(405).json({ ok: false, message: "Solo se permite consultar conversaciones." });
    next();
  });
  router.get("/chats", async (req, res) => res.json(await service.list(req.query)));
  router.get("/chats/:id", async (req, res) => res.json(await service.detail(req.params.id, req.query)));
  router.use((_req, res) => res.status(404).json({ ok: false, message: "Ruta de conversaciones inexistente." }));
  router.use((error, _req, res, _next) => {
    if (error instanceof URIError) error = new ChatbotHistoryError(400, "CHATBOT_INVALID_PARAMS", "Los parámetros de la consulta son inválidos.");
    const known = error instanceof ChatbotHistoryError;
    res.status(known ? error.status : 500).json({ ok: false,
      code: known ? error.code : "CHATBOT_INTERNAL_ERROR",
      message: known ? error.message : "No se pudo procesar la consulta de conversaciones." });
  });
  return router;
}

export default createChatbotHistoryRouter();
