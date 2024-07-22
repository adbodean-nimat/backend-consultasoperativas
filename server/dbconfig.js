require('dotenv').config();

const plataforma = {
    user: process.env.SQL_USER, 
    password: process.env.SQL_PASSWORD,
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    port: parseInt(process.env.SQL_PORT, 10),
    requestTimeout: 300000,
    options: {
      trustServerCertificate: true,
      trustedconnection: false,
      enableArithAbort: true,
      instancename: 'MSSQLSERVER'
    }
  }

  const cad = {
    user: process.env.SQL_USER_CAD, 
    password: process.env.SQL_PASSWORD_CAD,
    server: process.env.SQL_SERVER_CAD,
    database: process.env.SQL_DATABASE_CAD,
    port: parseInt(process.env.SQL_PORT_CAD, 10),
    requestTimeout: 300000,
    options: {
      trustServerCertificate: true,
      trustedconnection: false,
      enableArithAbort: true,
      instancename: 'MSSQLSERVER'
    }
  }
  
  module.exports = {
    plataforma: plataforma,
    cad: cad
  };