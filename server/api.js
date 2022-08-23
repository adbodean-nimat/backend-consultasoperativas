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

app.use(bodyParser.urlencoded({ extended:  true }));
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

// Tabla Depos_A_No_Considerar
router.route('/deposanoconsiderar').get(Pg.getDeposANoConsiderar)
router.route('/deposanoconsiderar/:id').get(Pg.getDeposANoConsiderarByCod)
router.route('/deposanoconsiderar').post(Pg.createDepos)
router.route('/deposanoconsiderar/:id').put(Pg.updateDepos)
router.route('/deposanoconsiderar/:id').delete(Pg.deleteDepos)

var port = 8090;
app.listen(port);
console.log('API is runnning at ' + port);