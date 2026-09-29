import sql from "mssql";
import { plataforma } from "../../../dbconfig.js";

export class WepRepository {
  constructor({ poolFactory } = {}) {
    this.poolFactory =
      poolFactory || (() => new sql.ConnectionPool(plataforma));
  }

  async getEntregasProgramadas({
    fechaDesde,
    fechaHasta,
    vehiculo,
    vuelta,
  }) {
    let connection;
    try {
      connection = await this.poolFactory().connect();
      const result = await connection
        .request()
        .input("FechaDesde", sql.Date, fechaDesde)
        .input("FechaHasta", sql.Date, fechaHasta)
        .input("Vehiculo", sql.VarChar(20), vehiculo)
        .input("Vuelta", sql.Int, vuelta)
        .execute("dbo.sp_entregas_programadas");

      return result.recordset || [];
    } finally {
      if (connection) await connection.close().catch(() => {});
    }
  }
}

export default new WepRepository();
