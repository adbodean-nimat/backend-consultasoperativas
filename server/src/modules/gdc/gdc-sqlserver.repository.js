import sql from "mssql";
import { plataforma } from "../../../dbconfig.js";
import { GdcError } from "./gdc.errors.js";
import { positiveInteger } from "./gdc.validator.js";
import { consumptionQuery, salesOrderQuery, purchaseOrderQuery, stockQuery, dataQuery } from "./gdc-sqlserver.queries.js";

export function buildErpConfig(connectionConfig = plataforma) {
  for (const name of ["server", "database", "user", "password"]) {
    if (!connectionConfig[name]) throw new GdcError("Falta configurar la conexión al ERP", { status: 503, code: "GDC_ERP_CONFIG_MISSING" });
  }
  const min = Number(connectionConfig.pool?.min ?? 0);
  const max = positiveInteger(connectionConfig.pool?.max ?? 6, "pool.max", 20);
  if (!Number.isSafeInteger(min) || min < 0 || min > max) throw new Error("Configuración inválida: pool.min");
  return {
    ...connectionConfig,
    port: positiveInteger(connectionConfig.port ?? 1433, "port", 65535),
    requestTimeout: positiveInteger(connectionConfig.requestTimeout ?? 300000, "requestTimeout", 300000),
    connectionTimeout: connectionConfig.connectionTimeout ?? 15000,
    pool: { idleTimeoutMillis: 30000, ...connectionConfig.pool, min, max },
    options: { ...connectionConfig.options, useUTC: true, appName: "restapi-nodejs-gdc-readonly" },
  };
}

export class GdcSqlServerRepository {
  #poolPromise;
  #poolFactory;
  #connectionConfig;
  #readUncommitted;
  #requestFactory;
  #logger;
  constructor({ connectionConfig = plataforma, readUncommitted = false, poolFactory = (config) => new sql.ConnectionPool(config), requestFactory = (pool, timeout) => new sql.Request(pool, { requestTimeout: timeout }), logger = console } = {}) {
    if (typeof readUncommitted !== "boolean") throw new Error("readUncommitted debe ser booleano");
    this.#connectionConfig = connectionConfig;
    this.#readUncommitted = readUncommitted;
    this.#poolFactory = poolFactory;
    this.#requestFactory = requestFactory;
    this.#logger = logger;
  }
  async #select(queryFactory, config, parameters, signal) {
    let request;
    const abort = () => { try { request?.cancel(); } catch { /* Connection may already be closed. */ } };
    try {
      const settings = buildErpConfig(this.#connectionConfig);
      const query = queryFactory(config, parameters, this.#readUncommitted);
      if (signal?.aborted) throw new Error("ABORTED");
      if (!this.#poolPromise) {
        const connection = this.#poolFactory(settings);
        connection.on?.("error", (error) => {
          this.#logger.error("[gdc] Error de pool ERP", { block: "erpPool", code: error.code });
        });
        this.#poolPromise = connection.connect().catch((error) => {
          this.#poolPromise = undefined;
          throw error;
        });
      }
      const pool = await this.#poolPromise;
      if (signal?.aborted) throw new Error("ABORTED");
      request = this.#requestFactory(pool, settings.requestTimeout);
      for (const input of query.inputs) request.input(input.name, input.type, input.value);
      signal?.addEventListener("abort", abort, { once: true });
      // Driver timeout cancels the TDS request before returning the connection.
      return (await request.query(query.text)).recordset ?? [];
    } catch (cause) {
      if (cause?.code === "ETIMEOUT") abort();
      throw new GdcError("No se pudo consultar el ERP de Compras", { status: 503, code: cause?.code === "ETIMEOUT" ? "GDC_ERP_TIMEOUT" : "GDC_ERP_UNAVAILABLE", cause });
    } finally { signal?.removeEventListener("abort", abort); }
  }
  production(config, parameters, signal) { return this.#select((c, p, ru) => consumptionQuery(c, p, true, ru), config, parameters, signal); }
  salesRemittances(config, parameters, signal) { return this.#select((c, p, ru) => consumptionQuery(c, p, false, ru), config, parameters, signal); }
  salesOrders(config, signal) { return this.#select((c, _p, ru) => salesOrderQuery(c, ru), config, undefined, signal); }
  stock(config, signal) { return this.#select((c, _p, ru) => stockQuery(c, ru), config, undefined, signal); }
  purchaseOrders(config, signal) { return this.#select((c, _p, ru) => purchaseOrderQuery(c, ru), config, undefined, signal); }
  data(config, signal) { return this.#select((c, _p, ru) => dataQuery(c, ru), config, undefined, signal); }
  async close() { const pending = this.#poolPromise; this.#poolPromise = undefined; if (pending) await (await pending).close(); }
}
export default new GdcSqlServerRepository();
