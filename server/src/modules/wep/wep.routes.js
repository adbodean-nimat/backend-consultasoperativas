import express from "express";
import { verifyUserToken } from "../../../auth.middleware.js";
import requireWepVehicle from "./wep-auth.middleware.js";
import wepLoginService, {
  WepLoginInvalidCredentialsError,
} from "./wep-login.service.js";
import wepLoginRateLimit from "./wep-login-rate-limit.middleware.js";
import wepPublicTrackingRateLimit from "./wep-public-tracking-rate-limit.middleware.js";
import wepTrackingService, {
  WepTrackingStopNotFoundError,
} from "./wep-tracking.service.js";
import wepTokenService, {
  WepTokenNotFoundError,
  WepVehicleNotFoundError,
} from "./wep-token.service.js";
import wepRepository from "./wep.repository.js";
import wepPwaRepository, {
  WepPwaEntregaMismatchError,
  WepPwaOrdenIncompletoError,
  WepPwaQrStopConflictError,
  WepPwaQrTripConflictError,
  WepPwaViajeNotFoundError,
  WepPwaViajePendingDeliveriesError,
  WepPwaViajeStateConflictError,
  WepPwaViajeWithoutDeliveriesError,
} from "./wep-pwa.repository.js";
import { parseWepQr } from "./wep-qr.util.js";
import wepSyncService from "./wep-sync.service.js";
import {
  WepPwaEntregaNotFoundError,
  WepPwaEntregaNoticeConflictError,
  WepPwaEntregaPhoneConflictError,
  WepPwaEntregaStateConflictError,
} from "./wep-client-notice.repository.js";
import wepClientNoticeService, {
  WepPwaWhatsappError,
} from "./wep-client-notice.service.js";
import {
  WepPwaDeliveryNotFoundError,
  WepPwaDeliveryStateConflictError,
} from "./wep-delivery-confirmation.repository.js";
import wepDeliveryConfirmationService from "./wep-delivery-confirmation.service.js";
import {
  WepPwaNoDeliveryNotFoundError,
  WepPwaNoDeliveryStateConflictError,
} from "./wep-non-delivery.repository.js";
import wepNonDeliveryService from "./wep-non-delivery.service.js";
import wepStopActionsService, {
  ETA_UNAVAILABLE_CODE,
  ETA_UNAVAILABLE_MESSAGE,
  WepEtaUnavailableError,
} from "./wep-stop-actions.service.js";
import wepEnRepartoNotificationsService from "./wep-en-reparto-notifications.service.js";
import wepProgrammedNotificationsService, {
  WepProgrammedTemplateNotConfiguredError,
} from "./wep-programmed-notifications.service.js";
import wepProgrammedNotificationTestService, {
  WepProgrammedTestScheduleError,
  WepProgrammedTestWhatsappError,
} from "./wep-programmed-notification-test.service.js";
import {
  WepProgrammedTestDeliveryNotFoundError,
  WepProgrammedTestStopConflictError,
} from "./wep-programmed-notifications.repository.js";
import {
  WepPwaStopForbiddenError,
  WepPwaStopNotFoundError,
  WepPwaStopStateConflictError,
  WepPwaStopViajeNotFoundError,
} from "./wep-stop-actions.repository.js";
import gestyaService, {
  GESTYA_ERROR_CODES,
  GestyaError,
} from "./gestya.service.js";
import { normalizePlate } from "./plate.util.js";
import {
  validateEntregasProgramadasBody,
  validateEntregasProgramadasQuery,
  validatePwaEntregaId,
  validatePwaNoEntregadoBody,
  validatePwaOrdenBody,
  validatePwaStopGroupId,
  validatePwaViajeId,
  validatePwaViajesQuery,
  validatePositiveIntegerId,
  validateProgrammedNotificationTestBody,
  validateProgrammedNotificationsBody,
  validateWepLoginBody,
  validateWepPinBody,
  WepValidationError,
} from "./wep.validator.js";

export function createWepRouter({
  repository = wepRepository,
  pwaRepository = wepPwaRepository,
  syncService = wepSyncService,
  clientNoticeService = wepClientNoticeService,
  vehiclePositionService = gestyaService,
  deliveryConfirmationService = wepDeliveryConfirmationService,
  nonDeliveryService = wepNonDeliveryService,
  stopActionsService = wepStopActionsService,
  enRepartoNotificationsService = wepEnRepartoNotificationsService,
  programmedNotificationsService = wepProgrammedNotificationsService,
  programmedNotificationTestService = wepProgrammedNotificationTestService,
  tokenService = wepTokenService,
  loginService = wepLoginService,
  loginRateLimit = wepLoginRateLimit,
  publicTrackingRateLimit = wepPublicTrackingRateLimit,
  trackingService = wepTrackingService,
  technicalAuth = verifyUserToken,
  wepAuth = requireWepVehicle,
} = {}) {
  const router = express.Router();

  router.get(
    "/public/tracking/:publicId",
    publicTrackingRateLimit,
    async (request, response) => {
      try {
        const tracking = await trackingService.getPublicTracking(
          request.params.publicId,
        );
        if (!tracking) {
          return response.status(404).json({
            ok: false,
            message: "Seguimiento no disponible",
          });
        }
        return response.status(200).json({ ok: true, tracking });
      } catch (_error) {
        console.error("[WEP TRACKING] Error consultando tracking público");
        return response.status(500).json({
          ok: false,
          message: "No se pudo consultar el seguimiento",
        });
      }
    },
  );

  router.post(
    "/admin/notificaciones/programadas/procesar",
    technicalAuth,
    async (request, response) => {
      try {
        const input = validateProgrammedNotificationsBody(request.body);
        const result = await programmedNotificationsService.processProgrammedDeliveryNotifications(
          {
            ...(input.fecha ? { fecha: input.fecha } : {}),
            dryRun: input.dryRun,
          },
        );
        return response.status(200).json(result);
      } catch (error) {
        if (error instanceof WepValidationError) {
          return response.status(400).json({ ok: false, message: error.message });
        }
        if (error instanceof WepProgrammedTemplateNotConfiguredError) {
          return response.status(409).json({ ok: false, message: error.message });
        }

        console.error(
          "[WEP PROGRAMADA] Error procesando notificaciones programadas",
        );
        return response.status(500).json({
          ok: false,
          message: "No se pudieron procesar las notificaciones PROGRAMADA",
        });
      }
    },
  );

  // Endpoint administrativo exclusivamente manual/de testing. Envía una sola
  // parada al teléfono indicado y registra PROGRAMADA_TEST, nunca PROGRAMADA.
  router.post(
    "/admin/notificaciones/programadas/test",
    technicalAuth,
    async (request, response) => {
      try {
        const input = validateProgrammedNotificationTestBody(request.body);
        const result = await programmedNotificationTestService.send(input);
        return response.status(200).json(result);
      } catch (error) {
        if (error instanceof WepValidationError) {
          return response.status(400).json({ ok: false, message: error.message });
        }
        if (
          error instanceof WepProgrammedTestDeliveryNotFoundError ||
          error instanceof WepTrackingStopNotFoundError
        ) {
          return response.status(404).json({
            ok: false,
            message: "No se encontró la entrega o su parada",
          });
        }
        if (error instanceof WepProgrammedTestStopConflictError) {
          return response.status(409).json({
            ok: false,
            message: "No se pudo resolver una única parada de forma segura",
          });
        }
        if (error instanceof WepProgrammedTemplateNotConfiguredError) {
          return response.status(409).json({ ok: false, message: error.message });
        }
        if (error instanceof WepProgrammedTestScheduleError) {
          return response.status(422).json({ ok: false, message: error.message });
        }
        if (error instanceof WepProgrammedTestWhatsappError) {
          return response.status(502).json({
            ok: false,
            message: "No se pudo enviar la notificación de prueba por WhatsApp",
          });
        }

        console.error("[WEP PROGRAMADA TEST] Error interno", error);
        return response.status(500).json({
          ok: false,
          message: "No se pudo procesar la notificación PROGRAMADA TEST",
        });
      }
    },
  );

  router.get(
    "/gestya/vehiculos/:patente/posicion",
    technicalAuth,
    async (request, response) => {
      try {
        const vehicle = await vehiclePositionService.getCurrentPositionByPlate(
          normalizePlate(request.params.patente),
        );

        return response.status(200).json({
          ok: true,
          vehicle,
          serverTime: new Date().toISOString(),
        });
      } catch (error) {
        if (
          error instanceof GestyaError &&
          error.code === GESTYA_ERROR_CODES.INVALID_PLATE
        ) {
          return response.status(400).json({
            ok: false,
            message: "La patente es obligatoria",
          });
        }

        if (
          error instanceof GestyaError &&
          error.code === GESTYA_ERROR_CODES.VEHICLE_NOT_FOUND
        ) {
          return response.status(404).json({
            ok: false,
            message: "Vehículo no encontrado en GESTYA",
          });
        }

        if (!(error instanceof GestyaError)) {
          console.error("[GESTYA] Error no controlado consultando posición");
        }

        const status =
          error instanceof GestyaError &&
          error.code === GESTYA_ERROR_CODES.TIMEOUT
            ? 504
            : 502;

        return response.status(status).json({
          ok: false,
          message: "No se pudo consultar la posición del vehículo en GESTYA",
        });
      }
    },
  );

  router.get(
    "/entregas-programadas",
    technicalAuth,
    async (request, response) => {
      try {
        const filters = validateEntregasProgramadasQuery(request.query);
        const rows = await repository.getEntregasProgramadas(filters);

        return response.status(200).json({
          ok: true,
          total: rows.length,
          rows,
        });
      } catch (error) {
        if (error instanceof WepValidationError) {
          return response.status(400).json({
            ok: false,
            message: error.message,
          });
        }

        console.error("Error en /api/wep/entregas-programadas:", error);
        return response.status(500).json({
          ok: false,
          message: "Ocurrió un error al obtener las entregas programadas",
        });
      }
    },
  );

  router.post(
    "/sync/entregas-programadas",
    technicalAuth,
    async (request, response) => {
      try {
        const filters = validateEntregasProgramadasBody(request.body);
        const result = await syncService.synchronize(filters);
        return response.status(200).json(result);
      } catch (error) {
        if (error instanceof WepValidationError) {
          return response.status(400).json({
            ok: false,
            message: error.message,
          });
        }

        return response.status(500).json({
          ok: false,
          message: "Ocurrió un error al sincronizar las entregas programadas",
        });
      }
    },
  );

  // Endpoint técnico interno. Reutiliza el JWT corporativo existente y no se
  // expone en la PWA. Requiere una política administrativa más específica antes
  // de publicarlo fuera de la red/control operativo actual.
  router.post(
    "/admin/vehiculos/:vehiculoId/token",
    technicalAuth,
    async (request, response) => {
      try {
        const vehiculoId = validatePositiveIntegerId(
          request.params.vehiculoId,
          "id de vehículo",
        );
        const result = await tokenService.createForVehicle(vehiculoId);

        return response.status(200).json({
          ok: true,
          vehiculo: {
            id: result.vehicle.id,
            patente: result.vehicle.patente,
            nombre: result.vehicle.nombre,
          },
          token: result.token,
        });
      } catch (error) {
        if (error instanceof WepValidationError) {
          return response.status(400).json({ ok: false, message: error.message });
        }
        if (error instanceof WepVehicleNotFoundError) {
          return response.status(404).json({
            ok: false,
            message: "Vehículo no encontrado",
          });
        }
        console.error("[WEP AUTH] Error creando token de vehículo:", error);
        return response.status(500).json({
          ok: false,
          message: "Ocurrió un error al crear el token WEP",
        });
      }
    },
  );

  router.post(
    "/admin/tokens/:tokenId/revocar",
    technicalAuth,
    async (request, response) => {
      try {
        const tokenId = validatePositiveIntegerId(
          request.params.tokenId,
          "id de token",
        );
        await tokenService.revoke(tokenId);
        return response.status(200).json({
          ok: true,
          message: "Token revocado",
        });
      } catch (error) {
        if (error instanceof WepValidationError) {
          return response.status(400).json({ ok: false, message: error.message });
        }
        if (error instanceof WepTokenNotFoundError) {
          return response.status(404).json({
            ok: false,
            message: "Token no encontrado",
          });
        }
        console.error("[WEP AUTH] Error revocando token:", error);
        return response.status(500).json({
          ok: false,
          message: "Ocurrió un error al revocar el token WEP",
        });
      }
    },
  );

  router.put(
    "/admin/vehiculos/:vehiculoId/pin",
    technicalAuth,
    async (request, response) => {
      try {
        const vehiculoId = validatePositiveIntegerId(
          request.params.vehiculoId,
          "id de vehículo",
        );
        const pin = validateWepPinBody(request.body);
        const vehicle = await loginService.setVehiclePin(vehiculoId, pin);

        return response.status(200).json({
          ok: true,
          message: "PIN actualizado correctamente",
          vehiculo: {
            id: vehicle.id,
            nombre: vehicle.nombre,
            patente: vehicle.patente,
          },
        });
      } catch (error) {
        if (error instanceof WepValidationError) {
          return response.status(400).json({ ok: false, message: error.message });
        }
        if (error instanceof WepVehicleNotFoundError) {
          return response.status(404).json({
            ok: false,
            message: "Vehículo no encontrado",
          });
        }
        console.error("[WEP AUTH] Error actualizando PIN de vehículo:", error);
        return response.status(500).json({
          ok: false,
          message: "Ocurrió un error al actualizar el PIN",
        });
      }
    },
  );

  router.get("/auth/vehiculos", async (_request, response) => {
    try {
      const vehicles = await loginService.listVehicles();
      return response.status(200).json({
        ok: true,
        vehiculos: vehicles,
      });
    } catch (error) {
      console.error("[WEP AUTH] Error listando vehículos de login:", error);
      return response.status(500).json({
        ok: false,
        message: "Ocurrió un error al obtener los vehículos",
      });
    }
  });

  router.post(
    "/auth/login",
    loginRateLimit,
    async (request, response) => {
      try {
        const { vehiculoId, pin } = validateWepLoginBody(request.body);
        const result = await loginService.login(vehiculoId, pin);
        return response.status(200).json({
          ok: true,
          token: result.token,
          vehiculo: result.vehicle,
        });
      } catch (error) {
        if (error instanceof WepValidationError) {
          console.warn("[WEP AUTH] Login inválido");
          return response.status(400).json({ ok: false, message: error.message });
        }
        if (error instanceof WepLoginInvalidCredentialsError) {
          return response.status(401).json({
            ok: false,
            message: "Camión o PIN incorrecto",
          });
        }
        console.error("[WEP AUTH] Error procesando login:", error);
        return response.status(500).json({
          ok: false,
          message: "Ocurrió un error al iniciar sesión",
        });
      }
    },
  );

  router.get("/auth/me", wepAuth, (request, response) =>
    response.status(200).json({
      ok: true,
      vehiculo: request.wepVehicle,
    }),
  );

  router.use("/pwa", wepAuth);

  router.get("/pwa/viajes", async (request, response) => {
    try {
      // `vehiculo` queda aceptado sólo por compatibilidad; la autoridad es el
      // vehículo resuelto desde el token WEP y el query param se ignora.
      const { fecha } = validatePwaViajesQuery(request.query);
      console.log(`[WEP PWA] Consultando viajes fecha=${fecha}`);

      const viajes = await pwaRepository.getPwaViajes(
        fecha,
        request.wepVehicle.id,
      );
      const totalEntregas = viajes.reduce(
        (total, viaje) =>
          total +
          viaje.paradas.reduce(
            (subtotal, parada) => subtotal + parada.entregas.length,
            0,
          ),
        0,
      );
      const totalParadas = viajes.reduce(
        (total, viaje) => total + viaje.paradas.length,
        0,
      );

      console.log(`[WEP PWA] Viajes encontrados: ${viajes.length}`);
      console.log(`[WEP PWA] Entregas encontradas: ${totalEntregas}`);
      console.log(`[WEP PWA] Paradas agrupadas: ${totalParadas}`);

      return response.status(200).json({
        ok: true,
        fecha,
        totalViajes: viajes.length,
        totalParadas,
        totalEntregas,
        viajes,
      });
    } catch (error) {
      if (error instanceof WepValidationError) {
        return response.status(400).json({
          ok: false,
          message: error.message,
        });
      }

      console.error("Error en /api/wep/pwa/viajes:", error);
      return response.status(500).json({
        ok: false,
        message: "Ocurrió un error al obtener los viajes programados",
      });
    }
  });

  router.post("/pwa/qr/resolve", async (request, response) => {
    try {
      const qr = parseWepQr(request.body);
      const vehiculoId = request.wepVehicle.id;
      console.log(`[WEP QR] Resolviendo QR vehiculoId=${vehiculoId}`);
      console.log(`[WEP QR] NP=${qr.division}/${qr.tipo}/${qr.pedido}`);

      const result = await pwaRepository.resolvePwaQr(qr, vehiculoId);
      if (!result) {
        return response.status(404).json({
          ok: false,
          message: "No se encontró una parada para este QR",
        });
      }

      const actionByState = {
        EN_REPARTO: "AVISAR_CLIENTE",
        CLIENTE_AVISADO: "YA_AVISADO",
        ENTREGADA: "YA_ENTREGADA",
        NO_ENTREGADA: "NO_ENTREGADA",
        PROGRAMADA: "VIAJE_NO_INICIADO",
        ASIGNADA: "VIAJE_NO_INICIADO",
      };
      console.log(
        `[WEP QR] Parada encontrada grupoId=${result.parada.grupoId}`,
      );

      return response.status(200).json({
        ok: true,
        qr,
        viaje: {
          id: result.viaje.id,
          numeroVuelta: result.viaje.numeroVuelta,
        },
        parada: result.parada,
        accionSugerida: actionByState[result.parada.estado.codigo] ?? null,
      });
    } catch (error) {
      if (error instanceof WepValidationError) {
        return response.status(400).json({ ok: false, message: error.message });
      }
      if (error instanceof WepPwaQrTripConflictError) {
        return response.status(409).json({
          ok: false,
          message: error.message,
          cantidadViajes: error.cantidadViajes,
        });
      }
      if (error instanceof WepPwaQrStopConflictError) {
        return response.status(409).json({
          ok: false,
          message: error.message,
          cantidadParadas: error.cantidadParadas,
        });
      }

      console.error("[WEP QR] Error resolviendo código QR:", error);
      return response.status(500).json({
        ok: false,
        message: "Ocurrió un error al procesar el código QR",
      });
    }
  });

  router.get("/pwa/entregas/:id", async (request, response) => {
    try {
      const id = validatePwaEntregaId(request.params.id);
      console.log(`[WEP PWA] Consultando detalle entrega id=${id}`);

      const entrega = await pwaRepository.getPwaEntregaDetalle(
        id,
        request.wepVehicle.id,
      );
      if (!entrega) {
        console.log(`[WEP PWA] Entrega no encontrada id=${id}`);
        return response.status(404).json({
          ok: false,
          message: "Entrega no encontrada",
        });
      }

      console.log(`[WEP PWA] Entrega encontrada id=${id}`);
      return response.status(200).json({
        ok: true,
        entrega,
      });
    } catch (error) {
      if (error instanceof WepValidationError) {
        return response.status(400).json({
          ok: false,
          message: error.message,
        });
      }

      console.error("Error en /api/wep/pwa/entregas/:id:", error);
      return response.status(500).json({
        ok: false,
        message: "Ocurrió un error al obtener el detalle de la entrega",
      });
    }
  });

  router.post("/pwa/entregas/:id/avisar", async (request, response) => {
    let id = null;

    try {
      id = validatePwaEntregaId(request.params.id);
      console.log(`[WEP PWA] Avisando cliente entrega id=${id}`);

      const result = await clientNoticeService.notifyClient(
        id,
        request.wepVehicle.id,
      );

      console.log(`[WEP PWA] WhatsApp enviado entrega id=${id}`);
      console.log(
        `[WEP PWA] Estado actualizado a CLIENTE_AVISADO entrega id=${id}`,
      );
      return response.status(200).json({
        ok: true,
        message: "Cliente avisado correctamente",
        entrega: result.entrega,
        notificacion: result.notificacion,
      });
    } catch (error) {
      console.error(
        `[WEP PWA] Error avisando entrega id=${id ?? "inválido"}: ${error.message}`,
      );

      if (error instanceof WepValidationError) {
        return response.status(400).json({
          ok: false,
          message: error.message,
        });
      }

      if (error instanceof WepPwaEntregaNotFoundError) {
        return response.status(404).json({
          ok: false,
          message: "Entrega no encontrada",
        });
      }

      if (
        error instanceof WepPwaEntregaStateConflictError ||
        error instanceof WepPwaEntregaPhoneConflictError ||
        error instanceof WepPwaEntregaNoticeConflictError
      ) {
        return response.status(409).json({
          ok: false,
          message: error.message,
        });
      }

      if (error instanceof WepPwaWhatsappError) {
        return response.status(502).json({
          ok: false,
          message: "No se pudo enviar el aviso por WhatsApp",
        });
      }

      return response.status(500).json({
        ok: false,
        message: "Ocurrió un error al avisar al cliente",
      });
    }
  });

  router.post("/pwa/entregas/:id/entregar", async (request, response) => {
    let id = null;

    try {
      id = validatePwaEntregaId(request.params.id);
      console.log(`[WEP PWA] Confirmando entrega id=${id}`);

      const entrega = await deliveryConfirmationService.confirmDelivery(
        id,
        request.wepVehicle.id,
      );

      console.log(`[WEP PWA] Entrega marcada ENTREGADA id=${id}`);
      return response.status(200).json({
        ok: true,
        message: "Entrega confirmada correctamente",
        entrega,
      });
    } catch (error) {
      if (error instanceof WepValidationError) {
        return response.status(400).json({
          ok: false,
          message: error.message,
        });
      }

      if (error instanceof WepPwaDeliveryNotFoundError) {
        return response.status(404).json({
          ok: false,
          message: "Entrega no encontrada",
        });
      }

      if (error instanceof WepPwaDeliveryStateConflictError) {
        return response.status(409).json({
          ok: false,
          message: error.message,
        });
      }

      console.error(
        `[WEP PWA] Error confirmando entrega id=${id ?? "inválido"}: ${error.message}`,
      );
      return response.status(500).json({
        ok: false,
        message: "Ocurrió un error al confirmar la entrega",
      });
    }
  });

  router.post(
    "/pwa/entregas/:id/no-entregado",
    async (request, response) => {
      let id = null;

      try {
        id = validatePwaEntregaId(request.params.id);
        const payload = validatePwaNoEntregadoBody(request.body);
        console.log(`[WEP PWA] Marcando no entregada id=${id}`);

        const entrega = await nonDeliveryService.markAsNotDelivered(
          id,
          payload,
          request.wepVehicle.id,
        );

        console.log(
          `[WEP PWA] Estado actualizado a NO_ENTREGADA id=${id}`,
        );
        return response.status(200).json({
          ok: true,
          message: "Entrega marcada como no entregada",
          entrega,
        });
      } catch (error) {
        if (error instanceof WepValidationError) {
          return response.status(400).json({
            ok: false,
            message: error.message,
          });
        }

        if (error instanceof WepPwaNoDeliveryNotFoundError) {
          return response.status(404).json({
            ok: false,
            message: "Entrega no encontrada",
          });
        }

        if (error instanceof WepPwaNoDeliveryStateConflictError) {
          return response.status(409).json({
            ok: false,
            message: error.message,
          });
        }

        console.error(
          `[WEP PWA] Error marcando no entregada id=${id ?? "inválido"}: ${error.message}`,
        );
        return response.status(500).json({
          ok: false,
          message: "Ocurrió un error al marcar la entrega como no entregada",
        });
      }
    },
  );

  function sendStopActionError(response, error, internalMessage) {
    if (error instanceof WepValidationError) {
      return response.status(400).json({ ok: false, message: error.message });
    }
    if (error instanceof WepPwaStopForbiddenError) {
      return response.status(403).json({ ok: false, message: error.message });
    }
    if (
      error instanceof WepPwaStopViajeNotFoundError ||
      error instanceof WepPwaStopNotFoundError
    ) {
      return response.status(404).json({ ok: false, message: error.message });
    }
    if (
      error instanceof WepPwaStopStateConflictError ||
      error instanceof WepPwaEntregaStateConflictError ||
      error instanceof WepPwaEntregaPhoneConflictError ||
      error instanceof WepPwaEntregaNoticeConflictError
    ) {
      return response.status(409).json({ ok: false, message: error.message });
    }
    if (error instanceof WepPwaWhatsappError) {
      return response.status(502).json({
        ok: false,
        message: "No se pudo enviar el aviso por WhatsApp",
      });
    }
    if (error instanceof WepEtaUnavailableError) {
      return response.status(503).json({
        ok: false,
        code: ETA_UNAVAILABLE_CODE,
        message: ETA_UNAVAILABLE_MESSAGE,
      });
    }

    console.error(internalMessage, error);
    return response.status(500).json({
      ok: false,
      message: "Ocurrió un error al operar la parada",
    });
  }

  router.post(
    "/pwa/viajes/:viajeId/paradas/:grupoId/avisar",
    async (request, response) => {
      try {
        const viajeId = validatePwaViajeId(request.params.viajeId);
        const grupoId = validatePwaStopGroupId(request.params.grupoId);
        const result = await stopActionsService.notifyStop(
          viajeId,
          grupoId,
          request.wepVehicle.id,
        );
        return response.status(200).json({
          ok: true,
          message: "Cliente avisado correctamente para la parada",
          estado: result.parada.estado.codigo,
          parada: result.parada,
          notificacion: result.notificacion,
        });
      } catch (error) {
        return sendStopActionError(
          response,
          error,
          "[WEP PWA] Error avisando parada:",
        );
      }
    },
  );

  router.post(
    "/pwa/viajes/:viajeId/paradas/:grupoId/entregar",
    async (request, response) => {
      try {
        const viajeId = validatePwaViajeId(request.params.viajeId);
        const grupoId = validatePwaStopGroupId(request.params.grupoId);
        const parada = await stopActionsService.deliverStop(
          viajeId,
          grupoId,
          request.wepVehicle.id,
        );
        return response.status(200).json({
          ok: true,
          message: "Parada entregada correctamente",
          parada,
        });
      } catch (error) {
        return sendStopActionError(
          response,
          error,
          "[WEP PWA] Error entregando parada:",
        );
      }
    },
  );

  router.post(
    "/pwa/viajes/:viajeId/paradas/:grupoId/no-entregado",
    async (request, response) => {
      try {
        const viajeId = validatePwaViajeId(request.params.viajeId);
        const grupoId = validatePwaStopGroupId(request.params.grupoId);
        const payload = validatePwaNoEntregadoBody(request.body);
        const parada = await stopActionsService.markStopNotDelivered(
          viajeId,
          grupoId,
          payload,
          request.wepVehicle.id,
        );
        return response.status(200).json({
          ok: true,
          message: "Parada marcada como no entregada",
          parada,
        });
      } catch (error) {
        return sendStopActionError(
          response,
          error,
          "[WEP PWA] Error marcando parada como no entregada:",
        );
      }
    },
  );

  router.put("/pwa/viajes/:viajeId/orden", async (request, response) => {
    const requestedViajeId = request.params.viajeId;

    try {
      const viajeId = validatePwaViajeId(requestedViajeId);
      const { entregas } = validatePwaOrdenBody(request.body);

      console.log(`[WEP PWA] Reordenando viaje id=${viajeId}`);
      console.log(`[WEP PWA] Entregas recibidas: ${entregas.length}`);

      const actualizadas = await pwaRepository.updatePwaViajeOrden(
        viajeId,
        entregas,
        request.wepVehicle.id,
      );

      console.log(
        `[WEP PWA] Orden actualizado correctamente viaje id=${viajeId}`,
      );
      return response.status(200).json({
        ok: true,
        message: "Orden de entregas actualizado",
        viajeId,
        totalEntregas: actualizadas.length,
        entregas: actualizadas,
      });
    } catch (error) {
      console.error(
        `[WEP PWA] Error reordenando viaje id=${requestedViajeId}: ${error.message}`,
      );

      if (error instanceof WepValidationError) {
        return response.status(400).json({
          ok: false,
          message: error.message,
        });
      }

      if (error instanceof WepPwaViajeNotFoundError) {
        return response.status(404).json({
          ok: false,
          message: "Viaje no encontrado",
        });
      }

      if (
        error instanceof WepPwaEntregaMismatchError ||
        error instanceof WepPwaOrdenIncompletoError
      ) {
        return response.status(400).json({
          ok: false,
          message: error.message,
        });
      }

      return response.status(500).json({
        ok: false,
        message: "Ocurrió un error al actualizar el orden de entregas",
      });
    }
  });

  router.post("/pwa/viajes/:viajeId/iniciar", async (request, response) => {
    try {
      const viajeId = validatePwaViajeId(request.params.viajeId);
      console.log(`[WEP PWA] Iniciando viaje id=${viajeId}`);

      const result = await pwaRepository.startPwaViaje(
        viajeId,
        request.wepVehicle.id,
      );

      console.log("[WEP PWA] Viaje actualizado a EN_REPARTO");
      console.log(
        `[WEP PWA] Entregas actualizadas: ${result.entregasActualizadas}`,
      );

      if (result.entregaIdsActualizadas?.length > 0) {
        try {
          await enRepartoNotificationsService.notifyTransitionedStops({
            viajeId,
            entregaIds: result.entregaIdsActualizadas,
          });
        } catch (notificationError) {
          console.error(
            `[WEP EN_REPARTO] El viaje id=${viajeId} fue iniciado, pero no se pudieron procesar sus notificaciones: ${notificationError.message}`,
          );
        }
      }

      return response.status(200).json({
        ok: true,
        message: "Viaje iniciado correctamente",
        viaje: result.viaje,
        entregasActualizadas: result.entregasActualizadas,
      });
    } catch (error) {
      if (error instanceof WepValidationError) {
        return response.status(400).json({
          ok: false,
          message: error.message,
        });
      }

      if (error instanceof WepPwaViajeNotFoundError) {
        return response.status(404).json({
          ok: false,
          message: "Viaje no encontrado",
        });
      }

      if (
        error instanceof WepPwaViajeStateConflictError ||
        error instanceof WepPwaViajeWithoutDeliveriesError
      ) {
        return response.status(409).json({
          ok: false,
          message: error.message,
        });
      }

      console.error(
        "Error en /api/wep/pwa/viajes/:viajeId/iniciar:",
        error,
      );
      return response.status(500).json({
        ok: false,
        message: "Ocurrió un error al iniciar el viaje",
      });
    }
  });

  router.post(
    "/pwa/viajes/:viajeId/finalizar",
    async (request, response) => {
      let viajeId = null;

      try {
        viajeId = validatePwaViajeId(request.params.viajeId);
        console.log(`[WEP PWA] Finalizando viaje id=${viajeId}`);

        const result = await pwaRepository.finishPwaViaje(
          viajeId,
          request.wepVehicle.id,
        );

        console.log(
          `[WEP PWA] Entregas total=${result.resumen.totalEntregas} cerradas=${result.resumen.totalEntregas}`,
        );
        console.log(`[WEP PWA] Viaje finalizado id=${viajeId}`);

        return response.status(200).json({
          ok: true,
          message: "Viaje finalizado correctamente",
          viaje: result.viaje,
          resumen: result.resumen,
        });
      } catch (error) {
        if (error instanceof WepValidationError) {
          return response.status(400).json({
            ok: false,
            message: error.message,
          });
        }

        if (error instanceof WepPwaViajeNotFoundError) {
          return response.status(404).json({
            ok: false,
            message: "Viaje no encontrado",
          });
        }

        if (error instanceof WepPwaViajePendingDeliveriesError) {
          console.log(
            `[WEP PWA] No se puede finalizar viaje id=${viajeId} pendientes=${error.pendientes}`,
          );
          return response.status(409).json({
            ok: false,
            message: error.message,
            pendientes: error.pendientes,
            entregasPendientes: error.entregasPendientes,
          });
        }

        if (
          error instanceof WepPwaViajeStateConflictError ||
          error instanceof WepPwaViajeWithoutDeliveriesError
        ) {
          return response.status(409).json({
            ok: false,
            message: error.message,
          });
        }

        console.error(
          `Error en /api/wep/pwa/viajes/:viajeId/finalizar:`,
          error,
        );
        return response.status(500).json({
          ok: false,
          message: "Ocurrió un error al finalizar el viaje",
        });
      }
    },
  );

  return router;
}

export default createWepRouter();
