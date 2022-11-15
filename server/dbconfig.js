require('dotenv').config();

const config = {
    user:  process.env.SQL_USER, 
    password:  process.env.SQL_PASSWORD,
    server:  process.env.SQL_SERVER,
    database:  process.env.SQL_DATABASE,
    options: {
      trustServerCertificate: true,
      trustedconnection:  true,
      enableArithAbort:  true,
      instancename:  'MSSQLSERVER'  // SQL Server instance name
    },
    port:   parseInt(process.env.SQL_PORT, 10)
  }
  
  module.exports = config;