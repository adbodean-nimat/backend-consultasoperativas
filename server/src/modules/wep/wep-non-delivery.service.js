import gestyaService from "./gestya.service.js";
import wepNonDeliveryRepository, {
  validateNoDeliveryState,
  WepPwaNoDeliveryNotFoundError,
} from "./wep-non-delivery.repository.js";

export class WepNonDeliveryService {
  constructor({
    repository = wepNonDeliveryRepository,
    vehiclePositionService = gestyaService,
    logger = console,
  } = {}) {
    this.repository = repository;
    this.vehiclePositionService = vehiclePositionService;
    this.logger = logger;
  }

  async markAsNotDelivered(entregaId, { motivo, observacion }, vehiculoId) {
    const delivery = await this.repository.getDeliveryContext(
      entregaId,
      vehiculoId,
    );
    if (!delivery) {
      throw new WepPwaNoDeliveryNotFoundError("Entrega no encontrada");
    }
    validateNoDeliveryState({ estado_codigo: delivery.estadoCodigo });

    let position = null;
    try {
      this.logger.log?.(
        `[WEP PWA] Consultando GESTYA patente=${delivery.patente ?? "sin patente"}`,
      );
      position = await this.vehiclePositionService.getCurrentPositionByPlate(
        delivery.patente,
      );
    } catch {
      this.logger.warn?.(
        `[WEP PWA] No se pudo obtener posición GESTYA para entrega id=${entregaId}`,
      );
      this.logger.log?.("[WEP PWA] Continuando sin coordenadas");
    }

    const updatedDelivery = await this.repository.markAsNotDelivered(
      entregaId,
      { motivo, observacion, position },
      vehiculoId,
    );

    return {
      ...updatedDelivery,
      posicion: {
        ...updatedDelivery.posicion,
        obtenidaDesdeGestya: position !== null,
      },
    };
  }
}

export default new WepNonDeliveryService();
