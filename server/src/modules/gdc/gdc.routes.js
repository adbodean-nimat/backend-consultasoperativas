import express from "express";
import { verifyUserToken } from "../../../auth.middleware.js";
import { GdcError } from "./gdc.errors.js";
import service from "./gdc.service.js";
import repository from "./gdc-config.repository.js";
import { createGdcController } from "./gdc.controller.js";

export function createGdcRouter({
  controller = createGdcController(service, repository),
  authenticate = verifyUserToken,
  logger = console,
} = {}) {
  const router = express.Router();
  router.use(authenticate);
  router.get("/revestidos-laf", controller.get);
  const admin = express.Router();
  admin.get("/:resource", controller.list);
  admin.post("/:resource", controller.create);
  admin.put("/general", (req, res, next) => {
    req.params.resource = "general";
    return controller.update(req, res, next);
  });
  admin.put("/:resource/:codigo", controller.update);
  admin.patch("/:resource/:codigo", controller.update);
  admin.delete("/:resource/:codigo", controller.delete);
  router.use("/revestidos-laf/configuracion", admin);
  router.use((error, _req, res, _next) => {
    logger.error("[gdc] Error de solicitud", { code: error.code });
    const duplicate = error.code === "23505",
      constraint = ["23514", "22001", "22003"].includes(error.code);
    const known = error instanceof GdcError;
    res
      .status(known ? error.status : duplicate ? 409 : constraint ? 400 : 500)
      .json({
        ok: false,
        code: known
          ? error.code
          : duplicate
            ? "GDC_DUPLICATE_CODE"
            : constraint
              ? "VALIDATION_ERROR"
              : "GDC_INTERNAL_ERROR",
        message: known
          ? error.message
          : duplicate
            ? "Ya existe ese código"
            : constraint
              ? "Los datos no cumplen las restricciones de configuración"
              : "No se pudo procesar la solicitud de Compras",
        errors: known ? error.errors : [],
      });
  });
  return router;
}
export default createGdcRouter();
