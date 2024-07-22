require('dotenv').config();
//const https = require('https');
// const axios = require('axios');
// const httpsAgent = new https.Agent({ rejectUnauthorized: false }); 
// const token = process.env.JWT_TOKEN
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
    console.log(error);
  }
  finally {
    cPool.close();
  }
}

module.exports = {
    getListaClientesCAD: getListaClientesCAD
}