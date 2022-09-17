const  config = {
    user:  'sa', // sql user
    password:  'Primicialg301', //sql user password
    server:  'TAPEBICUA', // if it does not work try- localhost
    database:  'dbNimat',
    options: {
      trustServerCertificate: true,
      trustedconnection:  true,
      enableArithAbort:  true,
      instancename:  'MSSQLSERVER'  // SQL Server instance name
    },
    port:  1433
  }
  
  module.exports = config;