var  Db = require('./dboperacion');
var  Pg = require('./dboperacion_pg')
var  Control = require('./control-alta-clientes');
var  Listadeclientes = require('./lista-de-clientes');
var  express = require('express');
var  bodyParser = require('body-parser');
var  cors = require('cors');
const { request, response } = require('express');
var  app = express();
var  router = express.Router();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/', express.static('public'));
/* app.use('/test', express.static('test')); */
app.use(cors());
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

var port = 8090;
app.listen(port);
console.log('API is runnning at ' + port);