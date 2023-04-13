var Db = require('./dboperacion');
var Pg = require('./dboperacion_pg');
var jConfig = require('./jconfig');
var fsConfig = require('./fsconfig');
var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');
var app = express();
var router = express.Router();
var passport = require('passport');
var LdapStrategy = require('passport-ldapauth');
const https = require('https');
const fs = require('fs');
const httpsOptions = {
  key: fs.readFileSync(process.env.SSL_KEY),
  cert: fs.readFileSync(process.env.SSL_CERT)
}
const jwt = require("jsonwebtoken");
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
passport.use(new LdapStrategy({
  server: {
    url: process.env.LDAP_URL,
    bindDN: process.env.LDAP_bindDN,
    bindCredentials: process.env.LDAP_bindCredentials,
    searchBase: process.env.LDAP_searchBase,
    searchFilter: process.env.LDAP_searchFilter
  }
}))
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(passport.initialize())
app.use('/api', verifyUserToken, router);

app.post('/login', function (req, res, next){
  passport.authenticate('ldapauth', {session: false}, function(err, user, info) {
    var error = err || info
    // console.log(user);
    if (error) 
      return res.status(500).json({error})
    if (!user) {
      return res.status(400).send("User Not Found")
    }
    // res.status(200).send(user)
    //create token
    const token = jwt.sign({ user }, process.env.JWT_SECRET);
    return res.status(200).json({"token": token, user});
  })(req, res, next)
})

router.use((request, response, next) => {
    console.log('middleware');
    next();
  });

router.route('/vblesentrnp/:id').get((request, response) => {
    Db.getVblesEntrNP(request.params.id).then((data) => {
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

router.route('/rowaplancanje').get(fsConfig.getFileExcel)


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

const port = 8090;

const httpsServer = https.createServer(httpsOptions, app)

httpsServer.listen(port);

console.log('API is runnning at ' + port);