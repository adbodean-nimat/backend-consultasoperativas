import express from "express";
import * as controller from "./duplicate-transfer.controller.js";
import { DuplicateTransferError, sanitizeError } from "./duplicate-transfer.errors.js";
import { requireAdmin, requireReviewPermission } from "./duplicate-transfer.validator.js";

const router = express.Router();
router.get("/review", requireReviewPermission, controller.reviewController);
router.use(requireAdmin);
router.get("/config", controller.getConfigController);
router.put("/config", controller.putConfigController);
router.get("/status", controller.getStatusController);
router.post("/preview", controller.previewController);
router.post("/run", controller.runController);
router.get("/runs", controller.listRunsController);
router.get("/runs/:id", controller.getRunController);
router.get("/detections", controller.listDetectionsController);

router.use((error, req, res, _next) => {
  const safe = sanitizeError(error);
  if (!(error instanceof DuplicateTransferError)) console.error("[duplicate-transfer-monitor] Error no controlado", { method: req.method, path: req.originalUrl, code: error?.code, message: safe.message });
  return res.status(safe.status).json({ ok: false, code: safe.code, message: safe.message, errors: error instanceof DuplicateTransferError ? error.details : [] });
});

export default router;
