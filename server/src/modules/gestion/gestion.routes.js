import express from "express";
import * as controller from "./gestion.controller.js";
import { GestionError } from "./gestion.errors.js";

const router = express.Router();

router.get("/automaticos", controller.getAutomaticos);
router.get("/registro", controller.getByQueryFecha);
router.post("/registro", controller.create);
router.put("/registro/:fecha", controller.update);
router.get("/:fecha", controller.getByFecha);
router.get("/", controller.getList);
router.post("/", controller.create);
router.put("/:fecha", controller.update);

router.use((error, req, res, _next) => {
  const knownError = error instanceof GestionError;
  const status = knownError ? error.status : 500;
  if (!knownError) {
    console.error("[gestion] Error no controlado", {
      method: req.method,
      path: req.originalUrl,
      code: error?.code,
      message: error?.message,
    });
  }
  return res.status(status).json({
    ok: false,
    message: knownError ? error.message : "Ocurrió un error interno en Gestión de Finanzas",
    errors: knownError ? error.errors : [],
  });
});

export default router;
