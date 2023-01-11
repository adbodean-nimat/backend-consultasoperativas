var Db = require('./dboperacion');
var Pg = require('./dboperacion_pg');
var jConfig = require('./jconfig');
var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');
const { request, response, Router } = require('express');
var app = express();
var router = express.Router();
const https = require('https');
const fs = require('fs');
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
/* app.use('/', express.static('public')); */
/* app.use('/test', express.static('test')); */
const httpsOptions = {
  key: fs.readFileSync(process.env.SSL_KEY),
  cert: fs.readFileSync(process.env.SSL_CERT)
}
app.use('/api', router);

router.use((request, response, next) => {
    console.log('middleware');
    next();
  });

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

router.route('/lpvnrubrosvtas').get((request, response)=> {
  jConfig.getVN_1().then((data)=>{
    response.json(data);
  })
})


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

// Tabla Const. Seco Armado Config 2
router.route('/constsecoarmadoconfig2').get(Pg.getConstSecoArmadoConfig2)

// Tabla Const. Seco Nombres Config
router.route('/constseconombresconfig').get(Pg.getConstSecoNombresConfig)

// Tabla Sets de Ventas
router.route('/setsdeventas').get(Pg.getSetsVentas)

// Tabla Familia de articulos
router.route('/familiadearticulo').get(Pg.getFamiliaArt)

// Tabla Vincular articulos a familia
router.route('/vinculararticulosafamilia').get(Pg.getVincularArtFamilia)

const port = 8090;

const httpsServer = https.createServer(httpsOptions, app)

httpsServer.listen(port);

console.log('API is runnning at ' + port);