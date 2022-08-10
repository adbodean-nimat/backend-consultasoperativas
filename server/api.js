var  Db = require('./dboperacion');
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
/* router.route('/control').post((request, response) => {
    let  order = { ...request.body }
    Db.addControl(order).then(data  => {
      response.status(201).json(data);
    })
  }) */
router.route('/listadeclientes').get((request, response) => {
  Db.getListaClientes().then((data) => {
    response.json(data[0]);
  })
})

var  port = 8090;
app.listen(port);
console.log('API is runnning at ' + port);