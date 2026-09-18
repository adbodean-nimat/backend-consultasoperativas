import gestyaService from "./gestya.service.js";
import wepDeliveryConfirmationRepository, {
  validateDeliveryConfirmationState,
  WepPwaDeliveryNotFoundError,
} from "./wep-delivery-confirmation.repository.js";

export class WepDeliveryConfirmationService {
  constructor({
    repository = wepDeliveryConfirmationRepository,
    vehiclePositionService = gestyaService,
    logger = console,
  } = {}) {
    this.repository = repository;
    this.vehiclePositionService = vehiclePositionService;
    this.logger = logger;
  }

  async confirmDelivery(entregaId, vehiculoId) {
    const delivery = await this.repository.getDeliveryContext(
      entregaId,
      vehiculoId,
    );
    if (!delivery) {
      throw new WepPwaDeliveryNotFoundError("Entrega no encontrada");
    }

    validateDeliveryConfirmationState({
      estado_codigo: delivery.estadoCodigo,
    });

    let position = null;
    try {
      this.logger.log?.(
        `[WEP PWA] Consultando GESTYA patente=${delivery.patente ?? "sin patente"}`,
      );
      position = await this.vehiclePositionService.getCurrentPositionByPlate(
        delivery.patente,
      );
      this.logger.log?.("[WEP PWA] Posición obtenida");
    } catch {
      this.logger.error?.(
        `[WEP PWA] No se pudo obtener posición GESTYA para entrega id=${entregaId}`,
      );
      this.logger.log?.(
        "[WEP PWA] Continuando confirmación sin coordenadas",
      );
    }

    const confirmedDelivery = await this.repository.confirmDelivery(
      entregaId,
      vehiculoId,
      position,
    );

    return {
      ...confirmedDelivery,
      posicion: {
        ...confirmedDelivery.posicion,
        obtenidaDesdeGestya: position !== null,
      },
    };
  }
}

export default new WepDeliveryConfirmationService();
