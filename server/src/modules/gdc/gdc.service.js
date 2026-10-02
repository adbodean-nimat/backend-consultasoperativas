import configRepository from "./gdc-config.repository.js";
import erpRepository from "./gdc-sqlserver.repository.js";
import { GdcError } from "./gdc.errors.js";
import { calculationParameters } from "./gdc.validator.js";
import { loadConsumption, familyConsumption } from "./gdc-consumption.service.js";
import { loadSalesOrders, familySalesOrder } from "./gdc-sales-order.service.js";
import { loadStock, familyStock } from "./gdc-stock.service.js";
import { loadPurchaseOrders, familyPurchaseOrders } from "./gdc-purchase-order.service.js";
import { loadData, familyData } from "./gdc-data.service.js";

export class GdcService {
  constructor({ config = configRepository, erp = erpRepository, clock = () => new Date(), logger = console } = {}) { this.config = config; this.erp = erp; this.clock = clock; this.logger = logger; }
  /** @returns {Promise<import('./gdc.dto.js').GdcResponse>} */
  async get(query = {}, externalSignal) {
    let config;
    try { config = await this.config.load(); }
    catch (cause) {
      this.logger.error("[gdc] Falló un bloque", { block: "postgresConfiguration", code: cause.code });
      throw new GdcError("No se pudo cargar la configuración de Compras", { status: 503, code: "GDC_CONFIG_UNAVAILABLE", cause });
    }
    const { parameters, periods } = calculationParameters(query, config.general, this.clock());
    if (!config.familias.length) return { parameters, periods, families: [], warnings: [] };
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    const readBlock = async (block, operation) => {
      try { return await operation(); }
      catch (cause) {
        this.logger.error("[gdc] Falló un bloque", { block, code: cause.code });
        controller.abort();
        throw new GdcError("No se pudo completar la consulta de Compras", { status: 503, code: cause.code === "GDC_ERP_TIMEOUT" ? cause.code : "GDC_ERP_UNAVAILABLE", cause });
      }
    };
    try {
      const signal = controller.signal;
      const [consumption, np, stock, oc, data] = await Promise.all([
        loadConsumption(this.erp, config, parameters, signal, readBlock),
        loadSalesOrders(this.erp, config, signal, readBlock), loadStock(this.erp, config, signal, readBlock),
        loadPurchaseOrders(this.erp, config, signal, readBlock), loadData(this.erp, config, signal, readBlock),
      ]);
      const families = config.familias.map((family) => {
        const key = family.clasificador_5;
        const c = familyConsumption(key, periods, consumption);
        const n = familySalesOrder(np.get(key));
        const s = familyStock(family, stock.get(key), c.rotationTon, parameters.rotationDays);
        const o = familyPurchaseOrders(family, oc.get(key));
        const d = familyData(family, data.get(key));
        return { classifier4: d.classifier4, classifier4Name: d.classifier4Name, classifier5: key, name: family.nombre,
          consumption: c.consumption, pendingSalesOrderTon: n.ton, stock: s.stock, purchaseOrders: o.purchaseOrders, data: d.data,
          warnings: [...c.warnings, ...n.warnings, ...s.warnings, ...o.warnings, ...d.warnings] };
      });
      return { parameters, periods, families, warnings: [] };
    } catch (cause) {
      if (cause instanceof GdcError) throw cause;
      this.logger.error("[gdc] Falló un bloque", { block: "consolidation", code: cause.code });
      throw new GdcError("No se pudo consolidar la información de Compras", { status: 503, code: "GDC_ERP_RESULT_INVALID", cause });
    } finally { externalSignal?.removeEventListener("abort", abort); }
  }
}
export default new GdcService();
