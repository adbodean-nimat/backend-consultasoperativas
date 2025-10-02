require('dotenv').config();
var config = require('./dbconfig.js');
const sql = require('mssql');

async function getListaClientesCAD(){
  const cPool = new sql.ConnectionPool(config.cad);
  cPool.on('error', err => console.log('---> SQL Error: ', err));
  try{
    await cPool.connect();
    let lista_clientes_cad = await cPool.request().query("SELECT [UserName],[UserEMail],[UserFirstName],[UserLastName],[UserCreDate],[UserUpdDate] FROM [CAD].[gam].[User]");
    return lista_clientes_cad.recordsets;
  }
  catch(error){
    console.error(error);
  }
  finally {
    cPool.close();
  }
}

module.exports = {
    getListaClientesCAD: getListaClientesCAD
}