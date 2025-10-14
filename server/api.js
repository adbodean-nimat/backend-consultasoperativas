const Db = require('./dboperacion');
const Pg = require('./dboperacion_pg');
const DbCAD = require('./dboperacion_cad');
const jConfig = require('./jconfig');
const fsConfig = require('./fsconfig');
const jsonToExcel = require('./jsontoexcel');
const jsonToTXT = require('./jsontotxt');
const syncProducts = require('./sync-products');
const { enviarListaPreciosPorPerfil } = require('./whatsapp');
const { logEnviadoOk, logErrorEnvio } = require('./whatsapp_logger.js');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const passport = require('passport');
const LdapStrategy = require('passport-ldapauth');
const compression = require('compression');
const CronJob = require('cron').CronJob
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const jwt = require("jsonwebtoken");
const morgan = require('morgan');
const rfs = require('rotating-file-stream');
const app = express();
const accessLogStream = rfs.createStream('api.log', {
  interval: '1d',
  path: path.join(__dirname, 'logs')
})
const router = express.Router();
const httpsOptions = {
  key: fs.readFileSync(process.env.SSL_KEY),
  cert: fs.readFileSync(process.env.SSL_CERT)
}
const verifyUserToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send("Solicitud no autorizada");
  }
  const token = req.headers["authorization"].split(" ")[1];
  if (!token) {
    return res.status(401).send("Acceso denegado. No se proporcionó token.");
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(400).send("Token inválido.");
  }
};
app.use(morgan('combined', { stream: accessLogStream }))
passport.use(new LdapStrategy({
  server: {
    url: process.env.LDAP_URL,
    bindDN: process.env.LDAP_bindDN,
    bindCredentials: process.env.LDAP_bindCredentials,
    searchBase: process.env.LDAP_searchBase,
    searchFilter: process.env.LDAP_searchFilter,
    includeRaw: true
  }
}))
app.use(cors());
app.use(compression());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(passport.initialize());
app.use('/api', verifyUserToken, router);
app.post('/login', function (req, res, next){
  passport.authenticate('ldapauth', {session: false}, function(err, user, info) {
    var error = err || info
    console.error(error);
    if (req.statusCode){
      return res.status(req.statusCode).json(info.message) 
    }
    /* if (error) 
      return res.status(500).json({error}) */
    if (!user) {
      return res.status(400).send(info.message)
    }
    // res.status(200).send(user)
    //create token
    const avatar = user._raw.thumbnailPhoto ? Buffer.from(user._raw.thumbnailPhoto).toString('base64') : '';
    delete user._raw
    const token = jwt.sign({ user }, process.env.JWT_SECRET);
    return res.status(200).json({"token": token, user, avatar});
  })(req, res, next)
})

/* app.post('/login', function (req, res, next){
  passport.authenticate('ldapauth', {session: false}, function(err, user, info) {
    var error = err || info
    if (error) 
      return res.status(500).json({error})

    //if (err) return res.status(500).send(err)
    //if (error) return res.status(400).json({error})
    if (!user) {
      return res.status(400).send("User Not Found")
    }
    // res.status(200).send(user)
    //create token
    
    const avatar = user._raw.thumbnailPhoto ? Buffer.from(user._raw.thumbnailPhoto).toString('base64') : '';
    const token = jwt.sign({ user }, process.env.JWT_SECRET);
    return res.status(200).json({"token": token, user, "avatar": avatar})
  })(req, res, next)
}) */

router.use((request, response, next) => {
    console.log('middleware -', request.method + ' - ' + request.url);
    next();
  });

router.route('/clientescad').get((request, response)=>{
  DbCAD.getListaClientesCAD().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/vblesentrnp/:id').get((request, response) => {
    Db.getVblesEntrNP(request.params.id).then((data) => {
      response.json(data[0]);
    })
  })

router.route('/combo/:id').get((request, response)=>{
  Db.getComboArt(request.params.id).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/m2/:id').get((request, response)=>{
  Db.getM2Art(request.params.id).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/m2saldo/:id').get((request, response)=>{
  Db.getM2Saldo(request.params.id).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/listapreciosventaalpublico').get((request, response)=>{
  Db.getListaPreciosVentaAlPublico().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/listaprecioscostoreposicion').get((request, response)=> {
  Db.getListaPreciosCostoReposicion().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/control').get((request, response) => {
  Db.getControl().then((data) => {
    response.json(data[0]);
  })
})

router.route('/control/:id').get((request, response) => {
  Db.getOrder(request.params.id).then((data) => {
    response.json(data[0]);
  })
})

router.route('/listadeclientes').get((request, response) => {
  Db.getListaClientes().then((data) => {
    response.json(data[0]);
  })
})

router.route('/listadeclientes2').get((request, response) => {
  const fdesde = request.query.fechadesde
  const fhasta = request.query.fechahasta
  const getData = {fechadesde: fdesde, fechahasta: fhasta}
  Db.getListaClientes2(getData).then((data) => {
    response.json(data[0]);
  })
})

router.route('/listacontenedores').get((request, response)=>{
  Db.getListaContenedores().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/np-pendientes-entrega-contenedores').get((request, response) => {
  Db.getNPpendienteEntregaContenedores().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/listapyr').get((request, response) => {
  Db.getLPPYRStock().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/listabreveuso').get((request, response) => {
  Db.getListaPrecioBreveUsoInterno().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/listaconstsecosql').get((request, response) => {
  Db.getListaConstSecoSQL().then((data)=> {
    response.json(data[0]);
  })
})

router.route('/stoctiar').get((request, response) => {
  Db.getSQL_STOC_TIAR().then((data)=> {
    response.json(data[0]);
  })
})

router.route('/clasificacion8').get((request, response) => {
  Db.getSQL_STOC_CA08().then((data)=> {
    response.json(data[0]);
  })
})

router.route('/stocdpos').get((request, response) => { 
  Db.getSQL_STOC_DPOS().then((data)=> {
    response.json(data[0]);
  }) 
})

router.route('/venttcve').get((request, response) => {
  Db.getSQL_VENT_TCVE().then((data)=> {
    response.json(data[0]);
  })
})

router.route('/stoctcst').get((request, response) => {
  Db.getSQL_STOC_TCST().then((data)=> {
    response.json(data[0]);
  })
})

router.route('/cpagrubc').get((request, response) => {
  Db.getSQL_CPAG_RUBC().then((data)=> {
    response.json(data[0]);
  })
})

router.route('/ventdca1').get((request, response) => {
  Db.getSQL_VENT_DCA1().then((data)=> {
    response.json(data[0]);
  })
})

router.route('/ventdvc1').get((request, response) => {
  Db.getSQL_VENT_DVC1().then((data)=> {
    response.json(data[0]);
  })
})

router.route('/clasificadorclientes').get((request, response)=>{
  Db.getClasificadorClientes().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/vnsindtofinanc').get((request, response)=>{
  Db.getVN_sin_dto_financ().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/rubrovta').get((request, response)=>{
  Db.getRubroVta().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/stockpartidaconvencimiento').get((request, response)=>{
  Db.getStockPartidaconvencimiento().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/stock').get((request, response)=>{
  Db.getStock().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/nppendientesentrega').get((request, response)=>{
  Db.getNPPendienteEntrega().then((data)=>{
    response.json(data);
  })
})

router.route('/stockfisicoydispon').get((request, response)=>{
  Db.getStockFisicoyDisp().then((data)=>{
    response.json(data[0])
  })
})

router.route('/listadeprecioweb').get((request, response)=>{
  Db.getListadePrecioWeb().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/planillaimportar').get((request, response)=>{
  Db.getPlanillaImportar().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/stocarts').get((request, response)=>{
  Db.getStocArts().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/stockartsall').get((request, response)=>{
  Db.getStocArtsAll().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/stockartsclasif5').get((request, response)=>{
  Db.getStocArtsClasif5().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/stockartsclasif6').get((request, response)=>{
  Db.getStocArtsClasif6().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/lpvnrubrosvtasacopio').get((request, response)=>{
  const getData = {PerfilComercial: request.query.perfilcomercial, fechaDesde: request.query.fechadesde}
  Db.getRubrosVtaAcopio(getData).then((data)=>{
  response.json(data[0])
 })
})

router.route('/combo').get((request, response)=>{
  Db.getCombo().then((data)=>{
    response.json(data[0])
  })
})

router.route('/comboweb').get((request, response)=>{
  Db.getComboWeb().then((data)=>{
    response.json(data[0])
  })
})

router.route('/ultimavuelta').get((request, response)=>{
  Db.getUltimaVta().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/acopiocemento/:id').get((request, response)=>{
  Db.AcopioCemento(request.params.id).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/stocknpoc/calescementosplasticor').get((request, response)=>{
  Db.StockNPOC_CalesCementosPlasticor().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/listaclientesplataforma').get((request, response)=>{
  Db.ListaClientesPlataforma().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/listaclientesplataformaacopios').get((request, response)=>{
  Db.ListaClientesPlataformaAcopios().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/listaclientesplataformactacte').get((request, response)=>{
  Db.ListaClientesPlataformaCtaCte().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/tiposdeclientes').get((request, response)=>{
  Db.TiposDeClientes().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/perfilcrediticio').get((request, response)=>{
  Db.PerfilCrediticio().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/npconproblemaei/:id').get((request, response)=>{
  Db.NP_Problema_EI(request.params.id).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/ncinformesacindarptf').get((request, response)=>{
  Db.NCInformesAcindarPTF().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/informesacindarptf').get((request, response)=>{
  Db.InformesAcindarPTF().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/informesacindarptfentrefechas').get((request,response)=>{
  const getDate = request.body
  Db.InformesAcindarPTFDate(getDate).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/ncinformesacindarptfentrefechas').get((request, response)=>{
  const getDate = request.body
  Db.NCInformesAcindarPTFDate(getDate).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/consultaporqr').get((request, response)=>{
  const getData = {fechaemision: request.query.fechaemision, qr: request.query.qr}
  Db.getCheckQR(getData).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/consultaordenescompraultfecharemi').get((request, response)=>{
  const getData = {fechadesde: request.query.fechadesde, difdias: request.query.difdias}
  Db.ConsultaOrdenesCompraFechaUltRem(getData).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/consultasaldosctacte').get((request, response)=>{
  const getDataNombre = request.query.nombre
  const getDataCliente = request.query.codcliente
  const getDataFactura = request.query.numerofactura
  const getDataQR = request.query.qr
  const getData = getDataCliente ? {cliente: getDataCliente } 
  : getDataFactura ? { factura: getDataFactura } 
  : getDataQR ? { qr: getDataQR } 
  : getDataNombre ? { nombre: getDataNombre } 
  : null
  Db.ConsultaSaldosCtaCte(getData).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/consultasaldosctacteremito').get((request, response)=>{
  const getDataRemito = request.query.remito
  const getDataNombre = request.query.nombre
  const getDataCliente = request.query.codcliente
  const getDataFactura = request.query.numerofactura
  const getDataQR = request.query.qr
  const getData = getDataCliente ? {cliente: getDataCliente } 
  : getDataFactura ? { factura: getDataFactura } 
  : getDataQR ? { qr: getDataQR } 
  : getDataNombre ? { nombre: getDataNombre } 
  : getDataRemito ? { remito: getDataRemito }
  : null
  Db.ConsultaSaldosCtaCteRemito(getData).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/consultaclientes/:nombre').get((request, response)=>{
  const getData = {nombre: request.params.nombre}
  Db.ConsultasClientes(getData).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/gdc/itemsreclamadosalproveedor').get((request, response)=>{
  Db.gdc_itemsReclamadosAlProveedor().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/gdc/itemsvinculadasaoc').get((request, response)=>{
  Db.gdc_itemsVinculadasAOC().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/gdc/infodeartquesecomprancorrientemente').get((request, response)=>{
  const getData = { 
    "Cant_días_atrás_para_evaluar_SM4": request.query.cantdiasatrasparaevaluarsm4, 
    "Dias_hacia_atrás_fecha_de_NP": request.query.diashaciaatrasfechadeNP, 
    "Comprador": !request.query.comprador ? null : request.query.comprador,
    "Rubros": !request.query.rubros ? null : request.query.rubros}
  Db.gdc_consolidacion(getData).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/gdc/itemreclamadosalproveedor').get((request, response)=>{
  Db.gdc_itemreclamadosalproveedor().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/gdc/verartsderivados/:codigo').get((request, response)=>{
  const getData =  {codigo: request.params.codigo}
  Db.gdc_getArtsDerivados(getData).then((data)=>{
    response.json(data[0]);
  })
})

router.route('/gdc/itemsvinculadosaoc/').get((request, response)=>{
  Db.gdc_itemsVinculadosAOC().then((data)=>{
    response.json(data[0]);
  })
})

router.route('/gdd/clientesdistribuciones/:codcliente').get((request, response)=>{
  Db.getClientesDistribuciones(request.params.codcliente).then((data)=>{ 
    response.json(data[0]);
  })
})

router.route('/tiemposentregas').get((request, response)=>{
  const fecha = {fechadesde: request.query.fechadesde, fechahasta: request.query.fechahasta}
  Db.tiemposEntregas(fecha).then((data)=>{ 
    response.json(data[0]);
  }).catch((err)=>{
    console.error(err)
    response.status(500).json({error: err})
  })
})

router.route('/listabreveusointerno').get((request, response) => {
  jConfig.getListadePrecioBUI2().then((data)=>{
    response.json(data);
  })
})

router.route('/listaconstsecoconfig').get((request, response) => {
  jConfig.getConsSecoConfig().then((data)=>{
    response.json(data);
  })
})

router.route('/listaconstseco').get((request, response) => {
  jConfig.getListaConstSeco().then((data)=>{
    response.json(data);
  })
})

router.route('/familiaarticulos').get((request, response)=> {
  jConfig.getFamiliaArts().then((data)=>{
    response.json(data);
  })
})

router.route('/familiaarticulosdistribucion').get((request, response)=> {
  jConfig.getFamiliaArts2().then((data)=>{
    response.json(data);
  })
})

router.route('/lpvnrubrosvtas').get((request, response)=> {
  jConfig.getVN_1().then((data)=>{
    response.json(data);
  })
})

router.route('/lpvnrubrosvtasdistribucion').get((request, response)=> {
  jConfig.getVN_2().then((data)=>{
    response.json(data);
  })
})

router.route('/lpvndistribucion').get((request, response)=>{
  jConfig.getLPDistribucion().then((data)=>{
    response.json(data);
  })
})

router.route('/planillaimportarstockprecio').get((request, response)=>{
  jConfig.getPlanillaImportarStock().then((data)=>{
    response.json(data);
  })
})

router.route('/informesacindar').get((request, response)=>{
  jConfig.getInformesAcindar().then((data)=>{
    response.json(data);
  })
})

router.route('/informesacindarentrefechas/').get((request, response)=>{
  const getDatesDesde = request.query.fechadesde
  const getDatesHasta = request.query.fechahasta
  const getDates = {fechadesde: getDatesDesde, fechahasta: getDatesHasta}
  jConfig.getInformesAcindarEntreFechas(getDates).then((data)=>{
    response.json(data);
  })
})

router.route('/informesacindarentrefechasexportar/').get((request, response)=>{
  const getDatesDesde = request.query.fechadesde
  const getDatesHasta = request.query.fechahasta
  const getDates = {fechadesde: getDatesDesde, fechahasta: getDatesHasta}
  jConfig.getInformesAcindarEntreFechasExportar(getDates).then((data)=>{
    response.json(data);
  })
})

router.route('/planillaimportarweb').get((request, response)=>{
  jsonToExcel.getWebNimat().then((data)=>{
    response.json(data);
  })
})

router.route('/planillaimportarwebcombo').get((request, response)=>{
  jsonToExcel.getWebNimatCombo().then((data)=>{
    response.json(data);
  })
})

router.route('/jsontosheet').get((request,response)=>{
  //jsonToExcel.getFileExcelToOpenAi();
  jsonToExcel.jsontosheet().then((data)=>{
    response.status(200).send('Generado correctamente');
  })
})

router.route('/jsontosheet2').get((request, response)=>{
  jsonToExcel.jsontosheet2().then((data)=>{
    response.status(200).send('Generado correctamente');
  })
})

router.route('/jsontosheet3/').get((request, response)=>{
  const getDatesDesde = request.query.fechadesde
  const getDatesHasta = request.query.fechahasta
  const getDates = {fechadesde: getDatesDesde, fechahasta: getDatesHasta}
  jsonToExcel.jsontosheet3(getDates).then((data)=>{
    response.status(200).send('Generado correctamente');
  })
})

router.route('/nuevosusuarioscad').get((request, response)=>{
  jsonToTXT.jsontotxt().then((data)=>{
    response.status(200).send('Generado correctamente');
  })
})

router.route('/jsontosheetdownload').get((request, response)=>{
  const routeDropbox = `${process.env.URL_DROPBOX}`
  const filePath = path.join(routeDropbox, '/Importar_AgileWorks_M2.xlsx');
  response.download(filePath);
});

/* router.route('/jsontotxtdownload').get((request, response)=>{
  const date = new Date();
  const month = date.getMonth();
  const monthNumbers = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  const folder = `${process.env.URL_DIR}/`+ new Date().getFullYear() +'.'+ monthNumbers[month]
  const filePath = path.join(folder, '/Archivo.txt');
  if (!fs.existsSync(filePath)) {
    return response.download(filePath);  
  }
}); */

async function getActualizadoWeb(){
  try{
    const data = await jsonToExcel.getActualizacionWeb();
    //console.log(data);
    const job_lunvie = new CronJob(
      await data.actualizacion_cron_lunesaviernes,
      function(){
        jsonToExcel.jsontosheet();
        jsonToExcel.actualizadoWeb();
        syncProducts.main();
        //jsonToExcel.getFileExcelToOpenAi();
        // console.log('Actualizado Web');                
      },
      null,
      true,
      'America/Argentina/Buenos_Aires'    
    );
    const job_sab = new CronJob(
      await data.actualizacion_cron_sabados,
      function(){
        jsonToExcel.jsontosheet();
        jsonToExcel.actualizadoWeb();
        syncProducts.main();
        //jsonToExcel.getFileExcelToOpenAi();
        // console.log('Actualizado Web');
      },
      null,
      true,
      "America/Argentina/Buenos_Aires"
    );
    
    if(await data.actualizacion_automatica == true){
      job_lunvie.start(); 
      job_sab.start();
      // console.log('Actualización automática: Iniciado');
    } 
    
    if(await data.actualizacion_automatica == false){
      job_lunvie.stop();
      job_sab.stop();
      // console.log('Actualización automática: Detenido');
    }

    router.route('/job-stop').get((request, response)=>{
      Pg.UpdateActualizacionWebChecked(false);
      job_lunvie.stop();
      job_sab.stop();
      response.status(200).json({message:'job stopped successfully'});
      // console.log('Actualización automática: Detenido');
    });
    
    router.route('/job-start').get((request, response)=>{
      Pg.UpdateActualizacionWebChecked(true);
      job_lunvie.start();
      job_sab.start();
      response.status(200).json({message:'job start successfully'});
      //console.log('Actualización automática: Iniciado');
    }); 

  }
  catch(error){
    console.error(error);
  }
  finally {
    console.log('Todas las tareas están hechas');
  }
}
getActualizadoWeb();

router.route('/job-restart').get((request, response)=>{
  setTimeout(()=>{
    //console.log('Reiniciando...')
    process.exit(0);
    }, 1000);
  response.status(200).json({message: 'job restart successfully'});
  //console.log('Actualización automática: Reiniciado');
});

router.route('/rowaplancanje').get(fsConfig.getFileExcel);

//Tablas
router.route('/tablas').get(Pg.getTablas)
router.route('/tablas/:id').get(Pg.getTablasById)
router.route('/tablas').post(Pg.createTablas)
router.route('/tablas/:id').put(Pg.updateTablas)
router.route('/tablas/:id').delete(Pg.deleteTablas)

// Tabla Lista de Precio Breve Uso Interno
router.route('/listadepreciobreveusointerno').get(Pg.getListadePrecioBUI)
router.route('/listadepreciobreveusointerno/:id').get(Pg.getListadePrecioBUIById)
router.route('/listadepreciobreveusointerno').post(Pg.createListadePrecioBUI)
router.route('/listadepreciobreveusointerno/:id').put(Pg.updateListadePrecioBUI)
router.route('/listadepreciobreveusointerno/:id').delete(Pg.deleteListadePrecioBUI)

// Tabla Depos_A_No_Considerar
router.route('/deposanoconsiderar').get(Pg.getDeposANoConsiderar)
router.route('/deposanoconsiderar/:id').get(Pg.getDeposANoConsiderarByCod)
router.route('/deposanoconsiderar/').post(Pg.createDepos)
router.route('/deposanoconsiderar/:id').put(Pg.updateDepos)
router.route('/deposanoconsiderar/:id').delete(Pg.deleteDepos)

// Tabla Desposito A No Considerar para Stock Fisico
router.route('/depositoanoconsiderarparastockfisico').get(Pg.getDespositoNoAConsiderarParaStockFisico)
router.route('/depositoanoconsiderarparastockfisico/').post(Pg.createDespositoNoAConsiderarParaStockFisico)
router.route('/depositoanoconsiderarparastockfisico/:id').put(Pg.updateDespositoNoAConsiderarParaStockFisico)
router.route('/depositoanoconsiderarparastockfisico/:id').delete(Pg.deleteDespositoNoAConsiderarParaStockFisico)

// Tabla NP_a_Considerar
router.route('/npaconsiderar').get(Pg.getNPaConsiderar)
router.route('/npaconsiderar/:id').get(Pg.getNPaConsiderarByCod)
router.route('/npaconsiderar/').post(Pg.createNP)
router.route('/npaconsiderar/:id').put(Pg.updateNP)
router.route('/npaconsiderar/:id').delete(Pg.deleteNP)

// Tabla Dimensiones_Contenedores
router.route('/dimensionescontenedores').get(Pg.getDimensionesCont)
router.route('/dimensionescontenedores/:id').get(Pg.getDimensionesContById)
router.route('/dimensionescontenedores/').post(Pg.createDimensionesCont)
router.route('/dimensionescontenedores/:id').put(Pg.updateDimensionesCont)
router.route('/dimensionescontenedores/:id').delete(Pg.deleteDimensionesCont)

// Tabla Movimientos_de_Contenedores
router.route('/movimientosdecontenedores').get(Pg.getMovContenedores)
router.route('/movimientosdecontenedores/:id').get(Pg.getMovContenedoresById)
router.route('/movimientosdecontenedores/').post(Pg.createMovContenedores)
router.route('/movimientosdecontenedores/:id').put(Pg.updateMovContenedores)
router.route('/movimientosdecontenedores/:id').delete(Pg.deleteMovContenedores)

// Tabla Const. Seco Armado Config 1
router.route('/constsecoarmadoconfig1').get(Pg.getConstSecoArmadoConfig1)
router.route('/constsecoarmadoconfig1/:id').get(Pg.getConstSecoArmadoConfig1ById)
router.route('/constsecoarmadoconfig1/').post(Pg.createConstSecoArmadoConfig1)
router.route('/constsecoarmadoconfig1/:id').put(Pg.updateConstSecoArmadoConfig1)
router.route('/constsecoarmadoconfig1/:id').delete(Pg.deleteConstSecoArmadoConfig1)

// Tabla Const. Seco Armado Config 2
router.route('/constsecoarmadoconfig2').get(Pg.getConstSecoArmadoConfig2)
router.route('/constsecoarmadoconfig2/:id').get(Pg.getConstSecoArmadoConfig2ByCod)
router.route('/constsecoarmadoconfig2/').post(Pg.createConstSecoArmadoConfig2)
router.route('/constsecoarmadoconfig2/:id').put(Pg.updateConstSecoArmadoConfig2)
router.route('/constsecoarmadoconfig2/:id').delete(Pg.deleteConstSecoArmadoConfig2)

// Tabla Const. Seco Nombres Config
router.route('/constseconombresconfig').get(Pg.getConstSecoNombresConfig)
router.route('/constseconombresconfig/:id').get(Pg.getConstSecoNombresConfigByCod)
router.route('/constseconombresconfig/').post(Pg.createConstSecoNombresConfig)
router.route('/constseconombresconfig/:id').put(Pg.updateConstSecoNombresConfig)
router.route('/constseconombresconfig/:id').delete(Pg.deleteConstSecoNombresConfig)

// Tabla Sets de Ventas
router.route('/setsdeventas').get(Pg.getSetsVentas)
router.route('/setsdeventas/:id').get(Pg.getSetsVentasByCod)
router.route('/setsdeventas').post(Pg.createSetsVentas)
router.route('/setsdeventas/:id').put(Pg.updateSetsVentas)
router.route('/setsdeventas/:id').delete(Pg.deleteSetsVentas)

// Tabla Familia de articulos
router.route('/familiadearticulo').get(Pg.getFamiliaArt)
router.route('/familiadearticulo/:id').get(Pg.getFamiliaArtById)
router.route('/familiadearticulo').post(Pg.createFamiliaArt)
router.route('/familiadearticulo/:id').put(Pg.updateFamiliaArt)
router.route('/familiadearticulo/:id').delete(Pg.deleteFamiliaArt)

// Tabla Vincular articulos a familia
router.route('/vinculararticulosafamilia').get(Pg.getVincularArtFamilia)
router.route('/vinculararticulosafamilia/:id').get(Pg.getVincularArtFamiliaByCod)
router.route('/vinculararticulosafamilia').post(Pg.createVincularArtFamilia)
router.route('/vinculararticulosafamilia/:id').put(Pg.updateVincularArtFamilia)
router.route('/vinculararticulosafamilia/:id').delete(Pg.deleteVincularArtFamilia)

// Tabla Productos para Distribucion
router.route('/productospdistribucion').get(Pg.getProductosDistribucion)
router.route('/productospdistribucion/:id').get(Pg.getProductosDistribucionByCod)
router.route('/productospdistribucion').post(Pg.createProductosDistribucion)
router.route('/productospdistribucion/:id').put(Pg.updateProductosDistribucion)
router.route('/productospdistribucion/:id').delete(Pg.deleteProductosDistribucion)

// Tabla Rubros Ventas
router.route('/rubrosventas').get(Pg.getRubrosVtas)
router.route('/rubrosventas/:id').get(Pg.getRubrosVtasByCod)
router.route('/rubrosventas').post(Pg.createRubrosVtas)
router.route('/rubrosventas/:id').put(Pg.updateRubrosVtas)
router.route('/rubrosventas/:id').delete(Pg.deleteRubrosVtas)

// Tabla Familias Distribuciones
router.route('/familiadistribuciones').get(Pg.getFamiliaDist)
router.route('/familiadistribuciones').post(Pg.createFamiliaDist)
router.route('/familiadistribuciones/:id').put(Pg.updateFamiliaDist)
router.route('/familiadistribuciones/:id').delete(Pg.deleteFamiliaDist)

// Tabla Familias Articulos Distribución
router.route('/familiaartdistribucion').get(Pg.getFamArtDist)
router.route('/familiaartdistribucion/:id').get(Pg.getFamArtDistByCod)
router.route('/familiaartdistribucion').post(Pg.createFamArtDist)
router.route('/familiaartdistribucion/:id').put(Pg.updateFamArtDist)
router.route('/familiaartdistribucion/:id').delete(Pg.deleteFamArtDist)

// Tabla Cartel Manual
router.route('/cartelmanual').get(Pg.getCartelManual)
router.route('/cartelmanual/:id').get(Pg.getCartelManualbyId)
router.route('/cartelmanual').post(Pg.createCartelManual)
router.route('/cartelmanual/:id').put(Pg.updateCartelManual)
router.route('/cartelmanual/:id').delete(Pg.deleteCartelManual)

// Tabla Categorias Web
router.route('/categoriasweb').get(Pg.getCategoriasWeb)
router.route('/categoriasweb').post(Pg.createCategoriasWeb)
router.route('/categoriasweb/:id').put(Pg.updateCategoriasWeb)
router.route('/categoriasweb/:id').delete(Pg.deleteCategoriasWeb)

// Tabla Articulos Web
router.route('/articulosweb').get(Pg.getArticulosWeb)
router.route('/articulosweb').post(Pg.createArticulosWeb)
router.route('/articulosweb/:id').put(Pg.updateArticulosWeb)
router.route('/articulosweb/:id').delete(Pg.deleteArticulosWeb)

// Tabla Actualización Web
router.route('/actualizacionwebnow/:id').put(Pg.UpdateActualizacionWebNow)
router.route('/actualizacionwebcron/:id').put(Pg.UpdateActualizacionWebCron)
router.route('/actualizacionwebchecked/:id').put(Pg.UpdateActualizacionWebChecked)
router.route('/actualizacionweb').get(Pg.getActualizacionWeb)
router.route('/actualizacionweb').post(Pg.CreateActualizacionWeb)
router.route('/actualizacionweb/:id').put(Pg.UpdateActualizacionWeb)
router.route('/actualizacionweb/:id').delete(Pg.deleteActualizacionWeb)

// Tabla Comprobantes a Omitir
router.route('/comprobantesaomitir').get(Pg.getComprobantesAOmitir)
router.route('/comprobantesaomitir').post(Pg.createComprobantesAOmitir)
router.route('/comprobantesaomitir/:id').put(Pg.updateComprobantesAOmitir)
router.route('/comprobantesaomitir/:id').delete(Pg.deleteComprobantesAOmitir)

// Tabla Remitos de Ventas
router.route('/remitosvtas').get(Pg.getRemitosVtas)
router.route('/remitosvtas').post(Pg.createRemitosVtas)
router.route('/remitosvtas/:id').put(Pg.updateRemitosVtas)
router.route('/remitosvtas/:id').delete(Pg.deleteRemitosVtas)

// Tabla Cales Cementos Plasticor
router.route('/calescementosplasticor').get(Pg.getCalesCementosPlasticor)
router.route('/calescementosplasticor').post(Pg.createCalesCementosPlasticor)
router.route('/calescementosplasticor/:id').put(Pg.updateCalesCementosPlasticor)
router.route('/calescementosplasticor/:id').delete(Pg.deleteCalesCementosPlasticor)

// Tabla Filtro Clientes Cta Cte
router.route('/filtroclientesplataforma').get(Pg.getClientesCtaCte)
router.route('/filtroclientesplataforma').post(Pg.createClientesCtaCte)
router.route('/filtroclientesplataforma/:id').put(Pg.updateClientesCtaCte)
router.route('/filtroclientesplataforma/:id').delete(Pg.deleteClientesCtaCte)

// Tabla Acindar Clasif. Clientes
router.route('/acindarclasifclientes').get(Pg.getAcindarClasifClientes)
router.route('/acindarclasifclientes').post(Pg.createClasifClientes)
router.route('/acindarclasifclientes/:id').put(Pg.updateClasifClientes)
router.route('/acindarclasifclientes/:id').delete(Pg.deleteClasifClientes)

// Tabla Acindar Comprobantes
router.route('/acindarcomprobantes').get(Pg.getAcindarComprobantes)
router.route('/acindarcomprobantes').post(Pg.createAcindarComprobantes)
router.route('/acindarcomprobantes/:id').put(Pg.updateAcindarComprobantes)
router.route('/acindarcomprobantes/:id').delete(Pg.deleteAcindarComprobantes)

// Tabla Acindar Equival. Cod. y factor cant.
router.route('/acindarequivalcodfactorcant').get(Pg.getAcindarEquivalCodFactorCant)
router.route('/acindarequivalcodfactorcant').post(Pg.createAcindarEquivalCodFactorCant)
router.route('/acindarequivalcodfactorcant/:id').put(Pg.updateAcindarEquivalCodFactorCant)
router.route('/acindarequivalcodfactorcant/:id').delete(Pg.deleteAcindarEquivalCodFactorCant)

// Tabla Filtro Acindar Plataforma
router.route('/filtroacindarplataforma').get(Pg.getFiltroAcindarPTF)
router.route('/filtroacindarplataforma').post(Pg.createFiltroAcindarPTF)
router.route('/filtroacindarplataforma/:id').put(Pg.updateFiltroAcindarPTF)
router.route('/filtroacindarplataforma/:id').delete(Pg.deleteFiltroAcindarPTF)

// Tabla Arts Clasif. 5 - Stock Manual (WEB)
router.route('/artsclasif5stockmanual').get(Pg.getArtsClasif5StockManual)
router.route('/artsclasif5stockmanual').post(Pg.createArtsClasif5StockManual)
router.route('/artsclasif5stockmanual/:id').put(Pg.updateArtsClasif5StockManual)
router.route('/artsclasif5stockmanual/:id').delete(Pg.deleteArtsClasif5StockManual)

// Tabla Arts Clasif. 5 - Al consultar (WEB)
router.route('/artsclasif5alconsultar').get(Pg.getArtsClasif5AlConsultar)
router.route('/artsclasif5alconsultar').post(Pg.createArtsClasif5AlConsultar)
router.route('/artsclasif5alconsultar/:id').put(Pg.updateArtsClasif5AlConsultar)
router.route('/artsclasif5alconsultar/:id').delete(Pg.deleteArtsClasif5AlConsultar)

// Tabla Gestión de Compras
router.route('/gdc/modosdestockminimo').get(Pg.gdc_modosdestockminimo)
router.route('/gdc/modosdestockminimo').post(Pg.gdc_modosdestockminimocreate)
router.route('/gdc/modosdestockminimodelete/:id').delete(Pg.gdc_modosdestockminimodelete)
router.route('/gdc/modosdestockminimoupdate/:id').put(Pg.gdc_modosdestockminimoupdate)

router.route('/gdc/clasif8artquesecompran').get(Pg.gdc_clasif8artquesecompran)
router.route('/gdc/clasif8artquesecomprandelete/:id').delete(Pg.gdc_clasif8artquesecompranDelete)
router.route('/gdc/clasif8artquesecompranupdate').post(Pg.gdc_clasif8artquesecompranUpdate)

router.route('/gdc/deposanoconsiderarparastock').get(Pg.gdc_deposanoconsiderarparastock)
router.route('/gdc/deposanoconsiderarparastockdelete/:id').delete(Pg.gdc_deposanoconsiderarparastockDelete)
router.route('/gdc/deposanoconsiderarparastockupdate').post(Pg.gdc_deposanoconsiderarparastockUpdate)

router.route('/gdc/npstockcomprometido').get(Pg.gdc_npstockcompromvtasespecialespendentregaaclientes)
router.route('/gdc/npstockcomprometidodelete/:id').delete(Pg.gdc_npstockcompromvtasespecialespendentregaaclientesDelete)
router.route('/gdc/npstockcomprometidoupdate').post(Pg.gdc_npstockcompromvtasespecialespendentregaaclientesUpdate)

router.route('/gdc/chapastiposqueladefinen').get(Pg.gdc_chapastiposqueladefinen)
router.route('/gdc/chapastiposqueladefinendelete/:id').delete(Pg.gdc_chapastiposqueladefinenDelete)
router.route('/gdc/chapastiposqueladefinenupdate').post(Pg.gdc_chapastiposqueladefinenUpdate)

router.route('/gdc/remitosdeventas').get(Pg.gdc_remitosdeventas)
router.route('/gdc/remitosdeventasdelete/:id').delete(Pg.gdc_remitosdeventasDelete)
router.route('/gdc/remitosdeventasupdate').post(Pg.gdc_remitosdeventasUpdate)

router.route('/gdd/clientesdistribuciones').get(Pg.gdd_clientes_distribuciones)
router.route('/gdd/clientesdistribuciones').post(Pg.gdd_clientes_distribucionesCreate)
router.route('/gdd/clientesdistribucionesdelete/:id').delete(Pg.gdd_clientes_distribucionesDelete)
router.route('/gdd/clientesdistribucionesupdate/:id').put(Pg.gdd_clientes_distribucionesUpdate)

router.route('/gdd/parametrosdistribuciones').get(Pg.gdd_parametros_distribuciones)
router.route('/gdd/parametrosdistribuciones').post(Pg.gdd_parametros_distribucionesCreate)
router.route('/gdd/parametrosdistribucionesdelete/:id').delete(Pg.gdd_parametros_distribucionesDelete)
router.route('/gdd/parametrosdistribucionesupdate/:id').put(Pg.gdd_parametros_distribucionesUpdate)

router.route('/enviarxWhatsapp').post((request, response)=>{
  const { to, perfil } = request.body || {};
  try {
    const out = enviarListaPreciosPorPerfil({ to, perfil });
    const waId = out?.wa?.messages?.[0]?.id || '';
    const filename = perfil === 'REA' ? process.env.PDF_FILENAME_REA : process.env.PDF_FILENAME_REB;
    logEnviadoOk({
      to: to,
      perfil: perfil,
      messageId: waId,
      mediaId: out.mediaId,
      templateName: process.env.TEMPLATE_NAME,
      filename
    });
    response.status(200).json(out);
    } catch (err) {
    //const msg = err?.message || 'Error inesperado';
    //const isBadReq = /E\.164|perfil inválido|Drive devolvió HTML/i.test(msg);
    logErrorEnvio({
      to,
      perfil,
      err,
      templateName: process.env.TEMPLATE_NAME,
      filename: perfil === 'REA' ? process.env.PDF_FILENAME_REA : process.env.PDF_FILENAME_REB
    });
    response.status(400).json({ ok: false, error: err?.message || 'Error' });
    }
})

const httpPort = 8099;
const httpsPort = 8090;

const httpsServer = https.createServer(httpsOptions, app)
const httpServer = http.createServer(app)

httpServer.listen(httpPort);
httpsServer.listen(httpsPort);

console.log('API is runnning at ' + httpsPort);
console.log('API is runnning at ' + httpPort);
