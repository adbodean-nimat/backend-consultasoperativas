import express from "express";
import * as controller from "./gestion.controller.js";
import * as authController from "./gestion-auth.controller.js";
import { requirePermission } from "./gestion-auth.middleware.js";
import { GestionError } from "./gestion.errors.js";

const router = express.Router();

const canConsult = requirePermission("gestion.consultar");
const canEdit = requirePermission("gestion.editar");
const canConfigure = requirePermission("gestion.configurar");
const canAdminister = requirePermission("gestion.administrar_usuarios");

router.get("/me", authController.me);
router.get("/configuracion-general", canConsult, authController.configuration);
router.put("/configuracion-general/:clave", canConfigure, authController.updateConfiguration);
router.get("/admin/usuarios", canAdminister, authController.users);
router.post("/admin/usuarios", canAdminister, authController.createUser);
router.patch("/admin/usuarios/:id/estado", canAdminister, authController.updateUserStatus);
router.put("/admin/usuarios/:id/roles", canAdminister, authController.updateUserRoles);
router.get("/admin/roles", canAdminister, authController.roles);

router.get("/automaticos", canConsult, controller.getAutomaticos);
router.get("/registro", canConsult, controller.getByQueryFecha);
router.post("/registro", canEdit, controller.create);
router.put("/registro/:fecha", canEdit, controller.update);
router.get("/:fecha", canConsult, controller.getByFecha);
router.get("/", canConsult, controller.getList);
router.post("/", canEdit, controller.create);
router.put("/:fecha", canEdit, controller.update);

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
    code: knownError ? error.code : "GESTION_INTERNAL_ERROR",
    message: knownError ? error.message : "Ocurrió un error interno en Gestión de Finanzas",
    errors: knownError ? error.errors : [],
  });
});

export default router;
