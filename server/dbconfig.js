require('dotenv').config();

const config = {
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
  
  module.exports = config;