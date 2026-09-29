import sql from "mssql";
import { plataforma } from "../../../dbconfig.js";
import { DuplicateTransferError } from "./duplicate-transfer.errors.js";
import { toSqlServerLocalDate } from "./duplicate-transfer.normalizer.js";

export class SqlServerDuplicateTransferRepository {
  constructor({ poolFactory } = {}) {
    this.poolFactory =
      poolFactory || (() => new sql.ConnectionPool(plataforma));
  }

  async detect({
    from,
    to,
    timezone,
    origin,
    accountCodes,
    minimumCoincidences,
    timeoutSeconds,
  }) {
    let connection;
    try {
      connection = await this.poolFactory().connect();
      const request = connection.request();
      request.timeout = timeoutSeconds * 1000;
      request.input(
        "FechaDesde",
        sql.DateTime2(0),
        toSqlServerLocalDate(from, timezone),
      );
      request.input(
        "FechaHasta",
        sql.DateTime2(0),
        toSqlServerLocalDate(to, timezone),
      );
      request.input("Origen", sql.VarChar(20), origin);
      request.input(
        "CuentasJson",
        sql.NVarChar(sql.MAX),
        JSON.stringify(accountCodes),
      );
      request.input("MinCoincidencias", sql.Int, minimumCoincidences);
      const result = await request.execute(
        "dbo.spDetectarTransferenciasDuplicadas",
      );
      return result.recordset || [];
    } catch (error) {
      const timeout =
        error?.code === "ETIMEOUT" || /timeout/i.test(error?.message || "");
      throw new DuplicateTransferError(
        timeout
          ? "La consulta al ERP excedió el tiempo permitido"
          : "No se pudo consultar el ERP",
        {
          code: timeout ? "SQL_SERVER_TIMEOUT" : "SQL_SERVER_ERROR",
          status: 503,
          transient:
            timeout ||
            ["ESOCKET", "ECONNCLOSED", "ELOGIN"].includes(error?.code),
          cause: error,
        },
      );
    } finally {
      if (connection) await connection.close().catch(() => {});
    }
  }
}

export default new SqlServerDuplicateTransferRepository();
