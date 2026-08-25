import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import passport from "passport";
import LdapStrategy from "passport-ldapauth";
import compression from "compression";
import path from "path";
import http from "http";
import https from "https";
import fs from "fs";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import multer from "multer";
import net from "net";
import { getLdapServerConfig } from "./src/ldap.config.js";

const app = express();

import DbCAD from "./dboperacion_cad.js";
import jsonToExcel from "./jsontoexcel.js";
import Db from "./dboperacion.js";
import Pg from "./dboperacion_pg.js";
import jConfig from "./jconfig.js";
import fsConfig from "./fsconfig.js";
import jsonToTXT from "./jsontotxt.js";
import enviarListaPreciosPorPerfil from "./whatsapp.js";
import { logEnviadoOk, logErrorEnvio } from "./whatsapp_logger.js";
import { initJobs, startJobs, stopJobs } from "./jobs.js";
import { importarMasivoFinanzas } from "./controllers/importController.js";
import gestionRouter from "./src/modules/gestion/gestion.routes.js";
import gestionScheduler from "./src/modules/gestion/gestion-scheduler.js";
import { verifyUserToken } from "./auth.middleware.js";
import { authorizeAdLogin } from "./src/modules/gestion/gestion-auth.service.js";
import { GestionError } from "./src/modules/gestion/gestion.errors.js";
import duplicateTransferRouter from "./src/modules/duplicate-transfers/duplicate-transfer.routes.js";
import duplicateTransferScheduler from "./src/modules/duplicate-transfers/duplicate-transfer-scheduler.js";
// import { sincronizarCompleto } from "./sync-productos-cateogorias.js";
import { sincronizarCompletoV2 } from "./sync-productos-categorias.v2.js";
// import { syncOpenAI } from "./sync-openai.js";
import { syncOpenAIv2 } from "./sync-openai.v2.js";
import {
  startCron,
  stopCron,
  estadoCron,
  inicializarCronEnviosDesdeDB,
  recargarCronDesdeDB,
} from "./src/cron/cron.envios.js";

// Solo una instancia en cluster
if (process.env.NODE_APP_INSTANCE === "0") {
  initJobs();
  inicializarCronEnviosDesdeDB()
    .then((estado) => console.log("Cron avisos deuda:", estado))
    .catch((error) => console.error("Error inicializando cron:", error));
}
duplicateTransferScheduler
  .start()
  .catch((error) =>
    console.error(
      "Error inicializando monitor de transferencias duplicadas:",
      error?.message,
    ),
  );
gestionScheduler
  .start()
  .catch((error) =>
    console.error(
      "Error inicializando sincronización automática de Gestión:",
      error?.message,
    ),
  );
/* const accessLogStream = rfs.createStream('api.log', {
  interval: '',
  path: path.join(__dirname, 'logs')
}) */

const router = express.Router();
const httpsOptions = {
  key: fs.readFileSync(process.env.SSL_KEY),
  cert: fs.readFileSync(process.env.SSL_CERT),
};
const upload = multer({ dest: "uploads/" });
/* app.use(morgan('combined', { stream: accessLogStream })) */
app.use(helmet());
passport.use(
  new LdapStrategy({
    server: getLdapServerConfig(),
  }),
);
app.use(cors());
app.use(compression());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(passport.initialize());
/* app.use('/imagenes', express.static('public/img')); */

app.post("/api/gestion/login", function (req, res, next) {
  try {
    passport.authenticate(
      "ldapauth",
      { session: false },
      async function (err, user, info) {
        if (err) {
          console.error("[gestion-auth] Error de autenticación LDAP", {
            message: err.message,
          });
          return res.status(500).json({
            ok: false,
            code: "LDAP_AUTH_ERROR",
            message: "No se pudo autenticar el usuario.",
          });
        }
        if (!user) {
          return res.status(401).json({
            ok: false,
            code: "LDAP_AUTH_FAILED",
            message: info?.message ?? "Usuario o contraseña inválidos.",
          });
        }

        try {
          const avatar = user._raw?.thumbnailPhoto
            ? Buffer.from(user._raw.thumbnailPhoto).toString("base64")
            : "";
          const payload = {
            cn: user.cn,
            mail: user.mail,
            memberOf: user.memberOf,
            displayName: user.displayName,
            givenName: user.givenName,
            sn: user.sn,
            name: user.name,
            sAMAccountName: user.sAMAccountName,
          };
          const access = await authorizeAdLogin(payload, {
            ip: req.ip ?? null,
          });
          const jwtToken = jwt.sign(
            {
              user: payload,
              avatar,
              token: process.env.JWT_TOKEN,
              username: access.username,
              roles: access.roles,
              permissions: access.permissions,
            },
            process.env.JWT_SECRET,
            { algorithm: "HS256", expiresIn: "6d" },
          );
          const decoded = jwt.decode(jwtToken);
          return res.status(200).json({
            user: payload,
            avatar,
            token: jwtToken,
            iat: decoded.iat,
            exp: decoded.exp,
          });
        } catch (error) {
          const known = error instanceof GestionError;
          if (!known)
            console.error("[gestion-auth] Error al autorizar Gestión", {
              code: error?.code,
              message: error?.message,
            });
          return res.status(known ? error.status : 500).json({
            ok: false,
            code: known ? error.code : "GESTION_AUTH_ERROR",
            message: known
              ? error.message
              : "No se pudo autorizar el acceso a Gestión Financiera.",
          });
        }
      },
    )(req, res, next);
  } catch (error) {
    console.error("[gestion-auth] Error inesperado", {
      message: error?.message,
    });
    return res.status(500).json({
      ok: false,
      code: "GESTION_AUTH_ERROR",
      message: "No se pudo autorizar el acceso a Gestión Financiera.",
    });
  }
});

app.use("/api", verifyUserToken, router);
app.post("/login", function (req, res, next) {
  try {
    passport.authenticate(
      "ldapauth",
      { session: false },
      function (err, user, info) {
        if (req.statusCode) {
          return res.status(req.statusCode).json(info.message);
        }

        if (!user) {
          return res.status(400).send(info.message);
        }

        const avatar = user._raw.thumbnailPhoto
          ? Buffer.from(user._raw.thumbnailPhoto).toString("base64")
          : "";
        const token = process.env.JWT_TOKEN;
        delete user._raw; // Eliminar el campo raw para no incluirlo en el token
        const payload = {
          cn: user.cn,
          mail: user.mail,
          memberOf: user.memberOf,
          displayName: user.displayName,
          givenName: user.givenName,
          sn: user.sn,
          name: user.name,
          sAMAccountName: user.sAMAccountName,
        };
        const jwtToken = jwt.sign(
          { user: payload, avatar, token },
          process.env.JWT_SECRET,
          {
            expiresIn: "6d",
          },
        );
        return res.status(200).json({ token: jwtToken });
      },
    )(req, res, next);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error });
  }
});

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

// Configuración de la impresora industrial Zebra ZT231
const PRINTER_IP = "192.168.0.57"; // cambiá por la IP real de tu Zebra
const PRINTER_PORT = 9100;

function escapeZplText(text = "") {
  // Evita null/undefined y limpia saltos raros
  return String(text).replace(/\r?\n/g, " ");
}

function buildQrZpl({ content, labelTitle = "CODIGO QR" }) {
  const safeContent = escapeZplText(content);
  const safeTitle = escapeZplText(labelTitle);

  return `
^XA
^CI28
^PW600
^LL400

^FO40,30^A0N,35,35^FD${safeTitle}^FS

^FO40,90
^BQN,2,6
^FDQA,${safeContent}^FS

^FO220,140^A0N,28,28^FD${safeContent}^FS

^XZ
`;
}

function sendToZebra(zpl, ip = PRINTER_IP, port = PRINTER_PORT) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let finished = false;

    client.connect(port, ip, () => {
      client.write(zpl, "utf8", () => {
        client.end();
      });
    });

    client.on("close", () => {
      if (!finished) {
        finished = true;
        resolve({ ok: true });
      }
    });

    client.on("error", (err) => {
      if (!finished) {
        finished = true;
        reject(err);
      }
    });
  });
}

router.use((request, response, next) => {
  console.log(
    "middleware -",
    new Date() + " - " + request.method + " - " + request.url,
  );
  next();
});

router.use("/gestion", gestionRouter);
router.use("/admin/duplicate-transfers", duplicateTransferRouter);

router.route("/healthprinter").get((_, res) => {
  res.json({ ok: true, printer: PRINTER_IP, port: PRINTER_PORT });
});

router.route("/qrcode").post(async (req, res) => {
  try {
    const { text, title, copies = 1 } = req.body;

    if (!text || !String(text).trim()) {
      return res.status(400).json({
        ok: false,
        error: 'Falta "text" para generar el QR',
      });
    }

    const qty = Math.max(1, Math.min(Number(copies) || 1, 20));
    const zpl = buildQrZpl({
      content: text,
      labelTitle: title || "CODIGO QR",
    });

    for (let i = 0; i < qty; i++) {
      await sendToZebra(zpl);
    }

    return res.json({
      ok: true,
      message: `Impresión enviada correctamente (${qty} copia/s)`,
    });
  } catch (error) {
    console.error("Error imprimiendo:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "No se pudo imprimir",
    });
  }
});

router.route("/clientescad").get((request, response) => {
  DbCAD().then((data) => {
    response.json(data[0]);
  });
});

router.route("/vblesentrnp/:id").get((request, response) => {
  Db.getVblesEntrNP(request.params.id).then((data) => {
    response.json(data[0]);
  });
});

router.route("/combo/:id").get((request, response) => {
  Db.getComboArt(request.params.id).then((data) => {
    response.json(data[0]);
  });
});

router.route("/m2/:id").get((request, response) => {
  Db.getM2Art(request.params.id).then((data) => {
    response.json(data[0]);
  });
});

router.route("/m2saldo/:id").get((request, response) => {
  Db.getM2Saldo(request.params.id).then((data) => {
    response.json(data[0]);
  });
});

router.route("/listapreciosventaalpublico").get((request, response) => {
  Db.getListaPreciosVentaAlPublico().then((data) => {
    response.json(data[0]);
  });
});

router.route("/listaprecioscostoreposicion").get((request, response) => {
  Db.getListaPreciosCostoReposicion().then((data) => {
    response.json(data[0]);
  });
});

router.route("/control").get((request, response) => {
  Db.getControl().then((data) => {
    response.json(data[0]);
  });
});

router.route("/control/:id").get((request, response) => {
  Db.getOrder(request.params.id).then((data) => {
    response.json(data[0]);
  });
});

router.route("/listadeclientes").get((request, response) => {
  Db.getListaClientes().then((data) => {
    response.json(data[0]);
  });
});

router.route("/listadeclientes2").get((request, response) => {
  const fdesde = request.query.fechadesde;
  const fhasta = request.query.fechahasta;
  const getData = { fechadesde: fdesde, fechahasta: fhasta };
  Db.getListaClientes2(getData).then((data) => {
    response.json(data[0]);
  });
});

router.route("/listacontenedores").get((request, response) => {
  Db.getListaContenedores().then((data) => {
    response.json(data[0]);
  });
});

router.route("/np-pendientes-entrega-contenedores").get((request, response) => {
  Db.getNPpendienteEntregaContenedores().then((data) => {
    response.json(data[0]);
  });
});

router.route("/listapyr").get((request, response) => {
  Db.getLPPYRStock().then((data) => {
    response.json(data[0]);
  });
});

router.route("/listabreveuso").get((request, response) => {
  Db.getListaPrecioBreveUsoInterno().then((data) => {
    response.json(data[0]);
  });
});

router.route("/listaconstsecosql").get((request, response) => {
  Db.getListaConstSecoSQL().then((data) => {
    response.json(data[0]);
  });
});

router.route("/stoctiar").get((request, response) => {
  Db.getSQL_STOC_TIAR().then((data) => {
    response.json(data[0]);
  });
});

router.route("/clasificacion2").get((request, response) => {
  Db.getSQL_STOC_CA02().then((data) => {
    response.json(data[0]);
  });
});

router.route("/clasificacion6").get((request, response) => {
  Db.getSQL_STOC_CA06().then((data) => {
    response.json(data[0]);
  });
});

router.route("/clasificacion8").get((request, response) => {
  Db.getSQL_STOC_CA08().then((data) => {
    response.json(data[0]);
  });
});

router.route("/stocdpos").get((request, response) => {
  Db.getSQL_STOC_DPOS().then((data) => {
    response.json(data[0]);
  });
});

router.route("/venttcve").get((request, response) => {
  Db.getSQL_VENT_TCVE().then((data) => {
    response.json(data[0]);
  });
});

router.route("/stoctcst").get((request, response) => {
  Db.getSQL_STOC_TCST().then((data) => {
    response.json(data[0]);
  });
});

router.route("/cpagrubc").get((request, response) => {
  Db.getSQL_CPAG_RUBC().then((data) => {
    response.json(data[0]);
  });
});

router.route("/cpagprov").get((request, response) => {
  Db.getSQL_CPAG_PROV().then((data) => {
    response.json(data[0]);
  });
});

router.route("/ventdca1").get((request, response) => {
  Db.getSQL_VENT_DCA1().then((data) => {
    response.json(data[0]);
  });
});

router.route("/ventdvc1").get((request, response) => {
  Db.getSQL_VENT_DVC1().then((data) => {
    response.json(data[0]);
  });
});

router.route("/clasificadorclientes").get((request, response) => {
  Db.getClasificadorClientes().then((data) => {
    response.json(data[0]);
  });
});

router.route("/vnsindtofinanc").get((request, response) => {
  Db.getVN_sin_dto_financ().then((data) => {
    response.json(data[0]);
  });
});

router.route("/rubrovta").get((request, response) => {
  Db.getRubroVta().then((data) => {
    response.json(data[0]);
  });
});

router.route("/stockpartidaconvencimiento").get((request, response) => {
  Db.getStockPartidaconvencimiento().then((data) => {
    response.json(data[0]);
  });
});

router.route("/stock").get((request, response) => {
  Db.getStock().then((data) => {
    response.json(data[0]);
  });
});

router.route("/nppendientesentrega").get((request, response) => {
  Db.getNPPendienteEntrega().then((data) => {
    response.json(data);
  });
});

router.route("/stockfisicoydispon").get((request, response) => {
  Db.getStockFisicoyDisp().then((data) => {
    response.json(data[0]);
  });
});

router.route("/listadeprecioweb").get((request, response) => {
  Db.getListadePrecioWeb().then((data) => {
    response.json(data[0]);
  });
});

router.route("/planillaimportar").get((request, response) => {
  Db.getPlanillaImportar()
    .then((data) => {
      response.json(data[0]);
    })
    .catch((err) => {
      console.error(err);
      response.status(500).json({ error: err });
    });
});

router.route("/stocarts").get((request, response) => {
  Db.getStocArts().then((data) => {
    response.json(data[0]);
  });
});

router.route("/stockartsall").get((request, response) => {
  Db.getStocArtsAll().then((data) => {
    response.json(data[0]);
  });
});

router.route("/stockartsclasif5").get((request, response) => {
  Db.getStocArtsClasif5().then((data) => {
    response.json(data[0]);
  });
});

router.route("/stockartsclasif6").get((request, response) => {
  Db.getStocArtsClasif6().then((data) => {
    response.json(data[0]);
  });
});

router.route("/lpvnrubrosvtasacopio").get((request, response) => {
  const getData = {
    PerfilComercial: request.query.perfilcomercial,
    fechaDesde: request.query.fechadesde,
  };
  Db.getRubrosVtaAcopio(getData).then((data) => {
    response.json(data[0]);
  });
});

router.route("/combo").get((request, response) => {
  Db.getCombo().then((data) => {
    response.json(data[0]);
  });
});

router.route("/comboweb").get((request, response) => {
  Db.getComboWeb().then((data) => {
    response.json(data[0]);
  });
});

router.route("/ultimavuelta").get((request, response) => {
  Db.getUltimaVta().then((data) => {
    response.json(data[0]);
  });
});

router.route("/acopiocemento/:id").get((request, response) => {
  Db.AcopioCemento(request.params.id).then((data) => {
    response.json(data[0]);
  });
});

router.route("/stocknpoc/calescementosplasticor").get((request, response) => {
  Db.StockNPOC_CalesCementosPlasticor().then((data) => {
    response.json(data[0]);
  });
});

router.route("/listaclientesplataforma").get((request, response) => {
  Db.ListaClientesPlataforma().then((data) => {
    response.json(data[0]);
  });
});

router.route("/listaclientesplataformaacopios").get((request, response) => {
  Db.ListaClientesPlataformaAcopios().then((data) => {
    response.json(data[0]);
  });
});

router.route("/listaclientesplataformactacte").get((request, response) => {
  Db.ListaClientesPlataformaCtaCte().then((data) => {
    response.json(data[0]);
  });
});

router.route("/tiposdeclientes").get((request, response) => {
  Db.TiposDeClientes().then((data) => {
    response.json(data[0]);
  });
});

router.route("/perfilcrediticio").get((request, response) => {
  Db.PerfilCrediticio().then((data) => {
    response.json(data[0]);
  });
});

router.route("/npconproblemaei/:id").get((request, response) => {
  Db.NP_Problema_EI(request.params.id).then((data) => {
    response.json(data[0]);
  });
});

router.route("/ncinformesacindarptf").get((request, response) => {
  Db.NCInformesAcindarPTF().then((data) => {
    response.json(data[0]);
  });
});

router.route("/informesacindarptf").get((request, response) => {
  Db.InformesAcindarPTF().then((data) => {
    response.json(data[0]);
  });
});

router.route("/informesacindarptfentrefechas").get((request, response) => {
  const getDate = request.body;
  Db.InformesAcindarPTFDate(getDate).then((data) => {
    response.json(data[0]);
  });
});

router.route("/ncinformesacindarptfentrefechas").get((request, response) => {
  const getDate = request.body;
  Db.NCInformesAcindarPTFDate(getDate).then((data) => {
    response.json(data[0]);
  });
});

router.route("/consultaporqr").get((request, response) => {
  const getData = {
    fechaemision: request.query.fechaemision,
    qr: request.query.qr,
  };
  Db.getCheckQR(getData).then((data) => {
    response.json(data[0]);
  });
});

router.route("/consultaordenescompraultfecharemi").get((request, response) => {
  const getData = {
    fechadesde: request.query.fechadesde,
    difdias: request.query.difdias,
  };
  Db.ConsultaOrdenesCompraFechaUltRem(getData).then((data) => {
    response.json(data[0]);
  });
});

router.route("/consultasaldosctacte").get((request, response) => {
  const getDataNombre = request.query.nombre;
  const getDataCliente = request.query.codcliente;
  const getDataFactura = request.query.numerofactura;
  const getDataQR = request.query.qr;
  const getData = getDataCliente
    ? { cliente: getDataCliente }
    : getDataFactura
      ? { factura: getDataFactura }
      : getDataQR
        ? { qr: getDataQR }
        : getDataNombre
          ? { nombre: getDataNombre }
          : null;
  Db.ConsultaSaldosCtaCte(getData).then((data) => {
    response.json(data[0]);
  });
});

router.route("/consultasaldosctacteremito").get((request, response) => {
  const getDataRemito = request.query.remito;
  const getDataNombre = request.query.nombre;
  const getDataCliente = request.query.codcliente;
  const getDataFactura = request.query.numerofactura;
  const getDataQR = request.query.qr;
  const getData = getDataCliente
    ? { cliente: getDataCliente }
    : getDataFactura
      ? { factura: getDataFactura }
      : getDataQR
        ? { qr: getDataQR }
        : getDataNombre
          ? { nombre: getDataNombre }
          : getDataRemito
            ? { remito: getDataRemito }
            : null;
  Db.ConsultaSaldosCtaCteRemito(getData).then((data) => {
    response.json(data[0]);
  });
});

router.route("/consultaclientes/:nombre").get((request, response) => {
  const getData = { nombre: request.params.nombre };
  Db.ConsultasClientes(getData).then((data) => {
    response.json(data[0]);
  });
});

router.route("/gdc/itemsreclamadosalproveedor").get((request, response) => {
  Db.gdc_itemsReclamadosAlProveedor().then((data) => {
    response.json(data[0]);
  });
});

router.route("/gdc/itemsvinculadasaoc").get((request, response) => {
  Db.gdc_itemsVinculadasAOC().then((data) => {
    response.json(data[0]);
  });
});

router
  .route("/gdc/infodeartquesecomprancorrientemente")
  .get((request, response) => {
    const getData = {
      Cant_días_atrás_para_evaluar_SM4:
        request.query.cantdiasatrasparaevaluarsm4,
      Dias_hacia_atrás_fecha_de_NP: request.query.diashaciaatrasfechadeNP,
      Comprador: !request.query.comprador ? null : request.query.comprador,
      Rubros: !request.query.rubros ? null : request.query.rubros,
    };
    Db.gdc_consolidacion(getData).then((data) => {
      response.json(data[0]);
    });
  });

// === Normalizador de filas desde SQL (tus nombres exactos) ===
function normalizeRow(row) {
  return {
    comprador: String(row.Comprador ?? ""), // LEFT(RUBC_NOMBRE,3) AS Comprador
    rubro_compra: String(row.ARCO_RUBRO_COMPRA ?? ""), // Código RC
    articulo_id: row.ARTS_ARTICULO ?? row.ARTS_ARTICULO_EMP, // ID para contar ítems
  };
}

// === Builder del payload para la grilla (con subtotales) ===
function buildGridPayload(rows, { page = 1, pageSize = 50 } = {}) {
  const norm = rows.map(normalizeRow).filter((r) => r.comprador);

  // Agregados por Comprador
  const byBuyer = new Map();
  for (const r of norm) {
    if (!byBuyer.has(r.comprador)) {
      byBuyer.set(r.comprador, { items: 0, rcSet: new Set() });
    }
    const acc = byBuyer.get(r.comprador);
    acc.items += 1; // cantidad_items
    if (r.rubro_compra) acc.rcSet.add(r.rubro_compra); // RC distintos
  }

  const data = [...byBuyer.entries()].map(([comprador, acc]) => {
    const cantidad_items = acc.items;
    const cantidad_rc = acc.rcSet.size;
    const ratio = cantidad_rc
      ? Number((cantidad_items / cantidad_rc).toFixed(2))
      : null;
    return { comprador, cantidad_items, cantidad_rc, ratio };
  });

  // === Subtotales ===
  const sumItems = data.reduce((a, r) => a + r.cantidad_items, 0);
  const sumRcPerBuyer = data.reduce((a, r) => a + r.cantidad_rc, 0); // suma de RC distintos por comprador
  const ratioTotal = sumRcPerBuyer
    ? Number((sumItems / sumRcPerBuyer).toFixed(2))
    : null;

  // RC únicos globales (opcional para mostrar aparte)
  const rcUnicosGlobal = new Set(
    norm.map((r) => r.rubro_compra).filter(Boolean),
  ).size;

  // Fila TOTAL
  data.push({
    comprador: "TOTAL",
    cantidad_items: sumItems,
    cantidad_rc: sumRcPerBuyer,
    ratio: ratioTotal,
    _extras: { rc_distintos_global: rcUnicosGlobal },
  });

  // Índices
  const byRow = data.map((r) => r.comprador);
  const byId = {};
  byRow.forEach((id, i) => (byId[id] = i));

  const meta = {
    title: "Resumen por Comprador",
    primaryKey: ["comprador"],
    columns: [
      { field: "comprador", label: "Comprador", type: "string", key: true },
      {
        field: "cantidad_items",
        label: "Cantidad de ítems",
        type: "number",
        agg: "sum",
      },
      {
        field: "cantidad_rc",
        label: "Cantidad de RC",
        type: "number",
        agg: "sum",
      },
      {
        field: "ratio",
        label: "Ratio",
        type: "number",
        format: "0.00",
        formula: "cantidad_items / cantidad_rc",
      },
    ],
    indexes: [
      { name: "idx_comprador", fields: ["comprador"], unique: false },
      { name: "idx_ratio_desc", fields: ["ratio"], order: "desc" },
    ],
    summary: {
      totals_row_label: "TOTAL",
      rc_distintos_global: rcUnicosGlobal,
      note: "cantidad_rc (subtotal) = suma de RC distintos por comprador; rc_distintos_global = RC únicos en todo el set.",
    },
    pagination: { page, pageSize, total: data.length },
    generatedAt: new Date().toISOString(),
  };

  return { meta, index: { byId, byRow }, data };
}

router.route("/gdc/grillacompradores").get(async (req, res) => {
  try {
    const getData = {
      Cant_días_atrás_para_evaluar_SM4: req.query.cantdiasatrasparaevaluarsm4,
      Dias_hacia_atrás_fecha_de_NP: req.query.diashaciaatrasfechadeNP,
    };

    Db.gdc_grilla_consolidacion(getData)
      .then((data) => {
        const page = Number(req.query.page ?? 1);
        const pageSize = Number(req.query.pageSize ?? 5000);

        // 3) Payload
        const payload = buildGridPayload(data[0], { page, pageSize });
        res.json(payload);
      })
      .catch((err) => {
        console.error(err);
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error generando grilla" });
  }
});

router.route("/gdc/itemreclamadosalproveedor").get((request, response) => {
  Db.gdc_itemreclamadosalproveedor().then((data) => {
    response.json(data[0]);
  });
});

router.route("/gdc/verartsderivados/:codigo").get((request, response) => {
  const getData = { codigo: request.params.codigo };
  Db.gdc_getArtsDerivados(getData).then((data) => {
    response.json(data[0]);
  });
});

router.route("/gdc/itemsvinculadosaoc/").get((request, response) => {
  Db.gdc_itemsVinculadosAOC().then((data) => {
    response.json(data[0]);
  });
});

router
  .route("/gdc/controlcementoscales/:semanasAtras")
  .get((request, response) => {
    Db.gdc_ControlCalesCementos(request.params.semanasAtras).then((data) => {
      response.json(data);
    });
  });

router
  .route("/gdd/clientesdistribuciones/:codcliente")
  .get((request, response) => {
    Db.getClientesDistribuciones(request.params.codcliente).then((data) => {
      response.json(data[0]);
    });
  });

router.route("/tiemposentregas").get((request, response) => {
  const fecha = {
    fechadesde: request.query.fechadesde,
    fechahasta: request.query.fechahasta,
  };
  Db.tiemposEntregas(fecha)
    .then((data) => {
      response.json(data[0]);
    })
    .catch((err) => {
      console.error(err);
      response.status(500).json({ error: err });
    });
});

router.route("/gde/stockrotocpreciosartpyr").get(async (request, response) => {
  try {
    const params = {
      clasif2: request.query.clasif2,
      diasprevios: request.query.diasprevios,
      diasdura: request.query.diasdura,
    };
    const data = await Db.StockRotNPOC(params);
    response.status(200).json(data);
  } catch (err) {
    console.error(err);
    response.status(500).json({ error: err });
  }
});

router
  .route("/gde/stockrotocpreciosartpyrterminacion")
  .get(async (request, response) => {
    try {
      const params = {
        clasif2: request.query.clasif2,
        diasprevios: request.query.diasprevios,
        diasdura: request.query.diasdura,
      };
      const data = await Db.StockRotNPOCTerminacion(params);
      response.status(200).json(data);
    } catch (err) {
      console.error(err);
      response.status(500).json({ error: err });
    }
  });

router.route("/listabreveusointerno").get((request, response) => {
  jConfig.getListadePrecioBUI2().then((data) => {
    response.json(data);
  });
});

router.route("/listaconstsecoconfig").get((request, response) => {
  jConfig.getConsSecoConfig().then((data) => {
    response.json(data);
  });
});

router.route("/listaconstseco").get((request, response) => {
  jConfig.getListaConstSeco().then((data) => {
    response.json(data);
  });
});

router.route("/familiaarticulos").get((request, response) => {
  jConfig.getFamiliaArts().then((data) => {
    response.json(data);
  });
});

router.route("/familiaarticulosdistribucion").get((request, response) => {
  jConfig.getFamiliaArts2().then((data) => {
    response.json(data);
  });
});

router.route("/lpvnrubrosvtas").get((request, response) => {
  jConfig.getVN_1().then((data) => {
    response.json(data);
  });
});

router.route("/lpvnrubrosvtasdistribucion").get((request, response) => {
  jConfig.getVN_2().then((data) => {
    response.json(data);
  });
});

router.route("/lpvndistribucion").get((request, response) => {
  jConfig.getLPDistribucion().then((data) => {
    response.json(data);
  });
});

router.route("/planillaimportarstockprecio").get((request, response) => {
  jConfig.getPlanillaImportarStock().then((data) => {
    response.json(data);
  });
});

router.route("/informesacindar").get((request, response) => {
  jConfig.getInformesAcindar().then((data) => {
    response.json(data);
  });
});

router.route("/informesacindarentrefechas/").get((request, response) => {
  const getDatesDesde = request.query.fechadesde;
  const getDatesHasta = request.query.fechahasta;
  const getDates = { fechadesde: getDatesDesde, fechahasta: getDatesHasta };
  jConfig.getInformesAcindarEntreFechas(getDates).then((data) => {
    response.json(data);
  });
});

router
  .route("/informesacindarentrefechasexportar/")
  .get((request, response) => {
    const getDatesDesde = request.query.fechadesde;
    const getDatesHasta = request.query.fechahasta;
    const getDates = { fechadesde: getDatesDesde, fechahasta: getDatesHasta };
    jConfig.getInformesAcindarEntreFechasExportar(getDates).then((data) => {
      response.json(data);
    });
  });

router.route("/planillaimportarweb").get((request, response) => {
  jsonToExcel
    .getWebNimat()
    .then((data) => {
      response.json(data);
    })
    .catch((err) => {
      console.error(err);
      response.status(500).json({ error: err });
    });
});

router.route("/planillaimportarwebcombo").get((request, response) => {
  jsonToExcel
    .getWebNimatCombo()
    .then((data) => {
      response.json(data);
    })
    .catch((err) => {
      console.error(err);
      response.status(500).json({ error: err });
    });
});

router.route("/jsontosheet").get(async (req, res) => {
  try {
    console.log("▶ Iniciando actualización web");
    await jsonToExcel.jsontosheet();

    console.log("▶ Iniciando sincronización los productos, categorías y urls");
    // await sincronizarCompleto();
    await sincronizarCompletoV2();

    console.log("▶ Iniciando sincronización OpenAI");
    // await syncOpenAI();
    await syncOpenAIv2();

    return res.status(200).send("Generado correctamente");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Error en generación de planilla");
  }
});

router.route("/jsontosheet3/").get((request, response) => {
  const getDatesDesde = request.query.fechadesde;
  const getDatesHasta = request.query.fechahasta;
  const getDates = { fechadesde: getDatesDesde, fechahasta: getDatesHasta };
  jsonToExcel.jsontosheet3(getDates).then((data) => {
    response.status(200).send("Generado correctamente");
  });
});

router.route("/nuevosusuarioscad").get((request, response) => {
  jsonToTXT.jsontotxt().then((data) => {
    response.status(200).send("Generado correctamente");
  });
});

router.route("/jsontosheetdownload").get((request, response) => {
  const routeDropbox = `${process.env.URL_DROPBOX}`;
  const filePath = path.join(routeDropbox, "/Importar_AgileWorks_M2.xlsx");
  response.download(filePath);
});

router.route("/job-stop").get((request, response) => {
  Pg.UpdateActualizacionWebChecked(false);
  if (process.env.NODE_APP_INSTANCE === "0") {
    stopJobs();
  }
  response.status(200).json({ message: "job stopped successfully" });
  console.log("Actualización automática: Detenido");
});

router.route("/job-start").get((request, response) => {
  Pg.UpdateActualizacionWebChecked(true);
  if (process.env.NODE_APP_INSTANCE === "0") {
    startJobs();
  }
  response.status(200).json({ message: "job start successfully" });
  console.log("Actualización automática: Iniciado");
});

router.route("/job-restart").get((request, response) => {
  setTimeout(() => {
    console.log("Reiniciando...");
    if (process.env.NODE_APP_INSTANCE === "0") {
      initJobs();
    }
  }, 1000);
  response.status(200).json({ message: "job restart successfully" });
  console.log("Actualización automática: Reiniciado");
});

// File EXCEL to JSON
router.route("/rowaplancanje").get(fsConfig.getFileExcel);
router.route("/enviarxWhatsapp/log/enviado").get(fsConfig.getLogEnviado);
router.route("/enviarxWhatsapp/log/error").get(fsConfig.getLogError);

//Tablas
router.route("/tablas").get(Pg.getTablas);
router.route("/tablas/:id").get(Pg.getTablasById);
router.route("/tablas").post(Pg.createTablas);
router.route("/tablas/:id").put(Pg.updateTablas);
router.route("/tablas/:id").delete(Pg.deleteTablas);

// Tabla Lista de Precio Breve Uso Interno
router.route("/listadepreciobreveusointerno").get(Pg.getListadePrecioBUI);
router
  .route("/listadepreciobreveusointerno/:id")
  .get(Pg.getListadePrecioBUIById);
router.route("/listadepreciobreveusointerno").post(Pg.createListadePrecioBUI);
router
  .route("/listadepreciobreveusointerno/:id")
  .put(Pg.updateListadePrecioBUI);
router
  .route("/listadepreciobreveusointerno/:id")
  .delete(Pg.deleteListadePrecioBUI);

// Tabla Depos_A_No_Considerar
router.route("/deposanoconsiderar").get(Pg.getDeposANoConsiderar);
router.route("/deposanoconsiderar/:id").get(Pg.getDeposANoConsiderarByCod);
router.route("/deposanoconsiderar/").post(Pg.createDepos);
router.route("/deposanoconsiderar/:id").put(Pg.updateDepos);
router.route("/deposanoconsiderar/:id").delete(Pg.deleteDepos);

// Tabla Desposito A No Considerar para Stock Fisico
router
  .route("/depositoanoconsiderarparastockfisico")
  .get(Pg.getDespositoNoAConsiderarParaStockFisico);
router
  .route("/depositoanoconsiderarparastockfisico/")
  .post(Pg.createDespositoNoAConsiderarParaStockFisico);
router
  .route("/depositoanoconsiderarparastockfisico/:id")
  .put(Pg.updateDespositoNoAConsiderarParaStockFisico);
router
  .route("/depositoanoconsiderarparastockfisico/:id")
  .delete(Pg.deleteDespositoNoAConsiderarParaStockFisico);

// Tabla NP_a_Considerar
router.route("/npaconsiderar").get(Pg.getNPaConsiderar);
router.route("/npaconsiderar/:id").get(Pg.getNPaConsiderarByCod);
router.route("/npaconsiderar/").post(Pg.createNP);
router.route("/npaconsiderar/:id").put(Pg.updateNP);
router.route("/npaconsiderar/:id").delete(Pg.deleteNP);

// Tabla Dimensiones_Contenedores
router.route("/dimensionescontenedores").get(Pg.getDimensionesCont);
router.route("/dimensionescontenedores/:id").get(Pg.getDimensionesContById);
router.route("/dimensionescontenedores/").post(Pg.createDimensionesCont);
router.route("/dimensionescontenedores/:id").put(Pg.updateDimensionesCont);
router.route("/dimensionescontenedores/:id").delete(Pg.deleteDimensionesCont);

// Tabla Movimientos_de_Contenedores
router.route("/movimientosdecontenedores").get(Pg.getMovContenedores);
router.route("/movimientosdecontenedores/:id").get(Pg.getMovContenedoresById);
router.route("/movimientosdecontenedores/").post(Pg.createMovContenedores);
router.route("/movimientosdecontenedores/:id").put(Pg.updateMovContenedores);
router.route("/movimientosdecontenedores/:id").delete(Pg.deleteMovContenedores);

// Tabla Const. Seco Armado Config 1
router.route("/constsecoarmadoconfig1").get(Pg.getConstSecoArmadoConfig1);
router
  .route("/constsecoarmadoconfig1/:id")
  .get(Pg.getConstSecoArmadoConfig1ById);
router.route("/constsecoarmadoconfig1/").post(Pg.createConstSecoArmadoConfig1);
router
  .route("/constsecoarmadoconfig1/:id")
  .put(Pg.updateConstSecoArmadoConfig1);
router
  .route("/constsecoarmadoconfig1/:id")
  .delete(Pg.deleteConstSecoArmadoConfig1);

// Tabla Const. Seco Armado Config 2
router.route("/constsecoarmadoconfig2").get(Pg.getConstSecoArmadoConfig2);
router
  .route("/constsecoarmadoconfig2/:id")
  .get(Pg.getConstSecoArmadoConfig2ByCod);
router.route("/constsecoarmadoconfig2/").post(Pg.createConstSecoArmadoConfig2);
router
  .route("/constsecoarmadoconfig2/:id")
  .put(Pg.updateConstSecoArmadoConfig2);
router
  .route("/constsecoarmadoconfig2/:id")
  .delete(Pg.deleteConstSecoArmadoConfig2);

// Tabla Const. Seco Nombres Config
router.route("/constseconombresconfig").get(Pg.getConstSecoNombresConfig);
router
  .route("/constseconombresconfig/:id")
  .get(Pg.getConstSecoNombresConfigByCod);
router.route("/constseconombresconfig/").post(Pg.createConstSecoNombresConfig);
router
  .route("/constseconombresconfig/:id")
  .put(Pg.updateConstSecoNombresConfig);
router
  .route("/constseconombresconfig/:id")
  .delete(Pg.deleteConstSecoNombresConfig);

// Tabla Sets de Ventas
router.route("/setsdeventas").get(Pg.getSetsVentas);
router.route("/setsdeventas/:id").get(Pg.getSetsVentasByCod);
router.route("/setsdeventas").post(Pg.createSetsVentas);
router.route("/setsdeventas/:id").put(Pg.updateSetsVentas);
router.route("/setsdeventas/:id").delete(Pg.deleteSetsVentas);

// Tabla Familia de articulos
router.route("/familiadearticulo").get(Pg.getFamiliaArt);
router.route("/familiadearticulo/:id").get(Pg.getFamiliaArtById);
router.route("/familiadearticulo").post(Pg.createFamiliaArt);
router.route("/familiadearticulo/:id").put(Pg.updateFamiliaArt);
router.route("/familiadearticulo/:id").delete(Pg.deleteFamiliaArt);

// Tabla Vincular articulos a familia
router.route("/vinculararticulosafamilia").get(Pg.getVincularArtFamilia);
router
  .route("/vinculararticulosafamilia/:id")
  .get(Pg.getVincularArtFamiliaByCod);
router.route("/vinculararticulosafamilia").post(Pg.createVincularArtFamilia);
router.route("/vinculararticulosafamilia/:id").put(Pg.updateVincularArtFamilia);
router
  .route("/vinculararticulosafamilia/:id")
  .delete(Pg.deleteVincularArtFamilia);

// Tabla Productos para Distribucion
router.route("/productospdistribucion").get(Pg.getProductosDistribucion);
router
  .route("/productospdistribucion/:id")
  .get(Pg.getProductosDistribucionByCod);
router.route("/productospdistribucion").post(Pg.createProductosDistribucion);
router.route("/productospdistribucion/:id").put(Pg.updateProductosDistribucion);
router
  .route("/productospdistribucion/:id")
  .delete(Pg.deleteProductosDistribucion);

// Tabla Rubros Ventas
router.route("/rubrosventas").get(Pg.getRubrosVtas);
router.route("/rubrosventas/:id").get(Pg.getRubrosVtasByCod);
router.route("/rubrosventas").post(Pg.createRubrosVtas);
router.route("/rubrosventas/:id").put(Pg.updateRubrosVtas);
router.route("/rubrosventas/:id").delete(Pg.deleteRubrosVtas);

// Tabla Familias Distribuciones
router.route("/familiadistribuciones").get(Pg.getFamiliaDist);
router.route("/familiadistribuciones").post(Pg.createFamiliaDist);
router.route("/familiadistribuciones/:id").put(Pg.updateFamiliaDist);
router.route("/familiadistribuciones/:id").delete(Pg.deleteFamiliaDist);

// Tabla Familias Articulos Distribución
router.route("/familiaartdistribucion").get(Pg.getFamArtDist);
router.route("/familiaartdistribucion/:id").get(Pg.getFamArtDistByCod);
router.route("/familiaartdistribucion").post(Pg.createFamArtDist);
router.route("/familiaartdistribucion/:id").put(Pg.updateFamArtDist);
router.route("/familiaartdistribucion/:id").delete(Pg.deleteFamArtDist);

// Tabla Cartel Manual
router.route("/cartelmanual").get(Pg.getCartelManual);
router.route("/cartelmanual/:id").get(Pg.getCartelManualbyId);
router.route("/cartelmanual").post(Pg.createCartelManual);
router.route("/cartelmanual/:id").put(Pg.updateCartelManual);
router.route("/cartelmanual/:id").delete(Pg.deleteCartelManual);

// Tabla Categorias Web
router.route("/categoriasweb").get(Pg.getCategoriasWeb);
router.route("/categoriasweb").post(Pg.createCategoriasWeb);
router.route("/categoriasweb/:id").put(Pg.updateCategoriasWeb);
router.route("/categoriasweb/:id").delete(Pg.deleteCategoriasWeb);

// Tabla Articulos Web
router.route("/articulosweb").get(Pg.getArticulosWeb);
router.route("/articulosweb").post(Pg.createArticulosWeb);
router.route("/articulosweb/:id").put(Pg.updateArticulosWeb);
router.route("/articulosweb/:id").delete(Pg.deleteArticulosWeb);

// Tabla Actualización Web
router.route("/actualizacionwebnow/:id").put(Pg.UpdateActualizacionWebNow);
router.route("/actualizacionwebcron/:id").put(Pg.UpdateActualizacionWebCron);
router
  .route("/actualizacionwebchecked/:id")
  .put(Pg.UpdateActualizacionWebChecked);
router.route("/actualizacionweb").get(Pg.getActualizacionWeb);
router.route("/actualizacionweb").post(Pg.CreateActualizacionWeb);
router.route("/actualizacionweb/:id").put(Pg.UpdateActualizacionWeb);
router.route("/actualizacionweb/:id").delete(Pg.deleteActualizacionWeb);

// Tabla Comprobantes a Omitir
router.route("/comprobantesaomitir").get(Pg.getComprobantesAOmitir);
router.route("/comprobantesaomitir").post(Pg.createComprobantesAOmitir);
router.route("/comprobantesaomitir/:id").put(Pg.updateComprobantesAOmitir);
router.route("/comprobantesaomitir/:id").delete(Pg.deleteComprobantesAOmitir);

// Tabla Remitos de Ventas
router.route("/remitosvtas").get(Pg.getRemitosVtas);
router.route("/remitosvtas").post(Pg.createRemitosVtas);
router.route("/remitosvtas/:id").put(Pg.updateRemitosVtas);
router.route("/remitosvtas/:id").delete(Pg.deleteRemitosVtas);

// Tabla Cales Cementos Plasticor
router.route("/calescementosplasticor").get(Pg.getCalesCementosPlasticor);
router.route("/calescementosplasticor").post(Pg.createCalesCementosPlasticor);
router
  .route("/calescementosplasticor/:id")
  .put(Pg.updateCalesCementosPlasticor);
router
  .route("/calescementosplasticor/:id")
  .delete(Pg.deleteCalesCementosPlasticor);

// Tabla Filtro Clientes Cta Cte
router.route("/filtroclientesplataforma").get(Pg.getClientesCtaCte);
router.route("/filtroclientesplataforma").post(Pg.createClientesCtaCte);
router.route("/filtroclientesplataforma/:id").put(Pg.updateClientesCtaCte);
router.route("/filtroclientesplataforma/:id").delete(Pg.deleteClientesCtaCte);

// Tabla Acindar Clasif. Clientes
router.route("/acindarclasifclientes").get(Pg.getAcindarClasifClientes);
router.route("/acindarclasifclientes").post(Pg.createClasifClientes);
router.route("/acindarclasifclientes/:id").put(Pg.updateClasifClientes);
router.route("/acindarclasifclientes/:id").delete(Pg.deleteClasifClientes);

// Tabla Acindar Comprobantes
router.route("/acindarcomprobantes").get(Pg.getAcindarComprobantes);
router.route("/acindarcomprobantes").post(Pg.createAcindarComprobantes);
router.route("/acindarcomprobantes/:id").put(Pg.updateAcindarComprobantes);
router.route("/acindarcomprobantes/:id").delete(Pg.deleteAcindarComprobantes);

// Tabla Acindar Equival. Cod. y factor cant.
router
  .route("/acindarequivalcodfactorcant")
  .get(Pg.getAcindarEquivalCodFactorCant);
router
  .route("/acindarequivalcodfactorcant")
  .post(Pg.createAcindarEquivalCodFactorCant);
router
  .route("/acindarequivalcodfactorcant/:id")
  .put(Pg.updateAcindarEquivalCodFactorCant);
router
  .route("/acindarequivalcodfactorcant/:id")
  .delete(Pg.deleteAcindarEquivalCodFactorCant);

// Tabla Filtro Acindar Plataforma
router.route("/filtroacindarplataforma").get(Pg.getFiltroAcindarPTF);
router.route("/filtroacindarplataforma").post(Pg.createFiltroAcindarPTF);
router.route("/filtroacindarplataforma/:id").put(Pg.updateFiltroAcindarPTF);
router.route("/filtroacindarplataforma/:id").delete(Pg.deleteFiltroAcindarPTF);

// Tabla Arts Clasif. 5 - Stock Manual (WEB)
router.route("/artsclasif5stockmanual").get(Pg.getArtsClasif5StockManual);
router.route("/artsclasif5stockmanual").post(Pg.createArtsClasif5StockManual);
router
  .route("/artsclasif5stockmanual/:id")
  .put(Pg.updateArtsClasif5StockManual);
router
  .route("/artsclasif5stockmanual/:id")
  .delete(Pg.deleteArtsClasif5StockManual);

// Tabla Arts Clasif. 5 - Al consultar (WEB)
router.route("/artsclasif5alconsultar").get(Pg.getArtsClasif5AlConsultar);
router.route("/artsclasif5alconsultar").post(Pg.createArtsClasif5AlConsultar);
router
  .route("/artsclasif5alconsultar/:id")
  .put(Pg.updateArtsClasif5AlConsultar);
router
  .route("/artsclasif5alconsultar/:id")
  .delete(Pg.deleteArtsClasif5AlConsultar);

// Tabla Gestión de Compras
router.route("/gdc/modosdestockminimo").get(Pg.gdc_modosdestockminimo);
router.route("/gdc/modosdestockminimo").post(Pg.gdc_modosdestockminimocreate);
router
  .route("/gdc/modosdestockminimodelete/:id")
  .delete(Pg.gdc_modosdestockminimodelete);
router
  .route("/gdc/modosdestockminimoupdate/:id")
  .put(Pg.gdc_modosdestockminimoupdate);

router.route("/gdc/clasif8artquesecompran").get(Pg.gdc_clasif8artquesecompran);
router
  .route("/gdc/clasif8artquesecomprandelete/:id")
  .delete(Pg.gdc_clasif8artquesecompranDelete);
router
  .route("/gdc/clasif8artquesecompranupdate")
  .post(Pg.gdc_clasif8artquesecompranUpdate);

router
  .route("/gdc/deposanoconsiderarparastock")
  .get(Pg.gdc_deposanoconsiderarparastock);
router
  .route("/gdc/deposanoconsiderarparastockdelete/:id")
  .delete(Pg.gdc_deposanoconsiderarparastockDelete);
router
  .route("/gdc/deposanoconsiderarparastockupdate")
  .post(Pg.gdc_deposanoconsiderarparastockUpdate);

router
  .route("/gdc/npstockcomprometido")
  .get(Pg.gdc_npstockcompromvtasespecialespendentregaaclientes);
router
  .route("/gdc/npstockcomprometidodelete/:id")
  .delete(Pg.gdc_npstockcompromvtasespecialespendentregaaclientesDelete);
router
  .route("/gdc/npstockcomprometidoupdate")
  .post(Pg.gdc_npstockcompromvtasespecialespendentregaaclientesUpdate);

router
  .route("/gdc/chapastiposqueladefinen")
  .get(Pg.gdc_chapastiposqueladefinen);
router
  .route("/gdc/chapastiposqueladefinendelete/:id")
  .delete(Pg.gdc_chapastiposqueladefinenDelete);
router
  .route("/gdc/chapastiposqueladefinenupdate")
  .post(Pg.gdc_chapastiposqueladefinenUpdate);

router.route("/gdc/remitosdeventas").get(Pg.gdc_remitosdeventas);
router
  .route("/gdc/remitosdeventasdelete/:id")
  .delete(Pg.gdc_remitosdeventasDelete);
router.route("/gdc/remitosdeventasupdate").post(Pg.gdc_remitosdeventasUpdate);

router.route("/gdd/clientesdistribuciones").get(Pg.gdd_clientes_distribuciones);
router
  .route("/gdd/clientesdistribuciones")
  .post(Pg.gdd_clientes_distribucionesCreate);
router
  .route("/gdd/clientesdistribucionesdelete/:id")
  .delete(Pg.gdd_clientes_distribucionesDelete);
router
  .route("/gdd/clientesdistribucionesupdate/:id")
  .put(Pg.gdd_clientes_distribucionesUpdate);

router
  .route("/gdd/parametrosdistribuciones")
  .get(Pg.gdd_parametros_distribuciones);
router
  .route("/gdd/parametrosdistribuciones")
  .post(Pg.gdd_parametros_distribucionesCreate);
router
  .route("/gdd/parametrosdistribucionesdelete/:id")
  .delete(Pg.gdd_parametros_distribucionesDelete);
router
  .route("/gdd/parametrosdistribucionesupdate/:id")
  .put(Pg.gdd_parametros_distribucionesUpdate);

router.route("/gdc/articuloscontrol").get(Pg.gdc_articuloscontrol);
router.route("/gdc/articuloscontrol").post(Pg.gdc_articuloscontrolCreate);
router
  .route("/gdc/articuloscontroldelete/:id")
  .delete(Pg.gdc_articuloscontrolDelete);
router
  .route("/gdc/articuloscontrolupdate/:id")
  .put(Pg.gdc_articuloscontrolUpdate);

router.route("/gdc/tiposremitosvtas").get(Pg.gdc_tiposremitosvtas);
router.route("/gdc/tiposremitosvtasupdate").post(Pg.gdc_tiposremitosvtasUpdate);
router
  .route("/gdc/tiposremitosvtasdelete/:id")
  .delete(Pg.gdc_tiposremitosvtasDelete);
/* router.route('/gdc/tiposremitosvtasupdate/:id').put(Pg.gdc_tiposremitosvtasUpdate) */

router.route("/gdc/tiposcompstock").get(Pg.gdc_tiposcompstock);
router.route("/gdc/tiposcompstockupdate").post(Pg.gdc_tiposcompstockUpdate);
router
  .route("/gdc/tiposcompstockdelete/:id")
  .delete(Pg.gdc_tiposcompstockDelete);
/* router.route('/gdc/tiposcompstockupdate/:id').put(Pg.gdc_tiposcompstockUpdate) */

router.route("/gdc/npaconsiderar").get(Pg.gdc_npaconsiderar);
/* router.route('/gdc/npaconsiderar').post(Pg.gdc_npaconsiderarCreate) */
router.route("/gdc/npaconsiderardelete/:id").delete(Pg.gdc_npaconsiderarDelete);
router.route("/gdc/npaconsiderarupdate").post(Pg.gdc_npaconsiderarUpdate);

router
  .route("/gdc/deposanoconsiderarpstockfisico")
  .get(Pg.gdc_deposanoconsiderarpstockfisico);
router
  .route("/gdc/deposanoconsiderarpstockfisicoupdate")
  .post(Pg.gdc_deposanoconsiderarpstockfisicoUpdate);
router
  .route("/gdc/deposanoconsiderarpstockfisicodelete/:id")
  .delete(Pg.gdc_deposanoconsiderarpstockfisicoDelete);
/* router.route('/gdc/deposanoconsiderarpstockfisicoupdate/:id').put(Pg.gdc_deposanoconsiderarpstockfisicoUpdate) */

// Rutas CRUD de Finanzas
router.route("/registros-financieros").get(Pg.getRegistrosFinancieros);
router.route("/registros-financieros").post(Pg.createRegistroFinanciero);
router.route("/registros-financieros/:id").put(Pg.updateRegistroFinanciero);
router.route("/registros-financieros/:id").delete(Pg.deleteRegistroFinanciero);

// Ruta para subir el Excel/CSV de finanzas
router
  .route("/importar-finanzas")
  .post(upload.single("archivo"), importarMasivoFinanzas);

// Rutas CRUD de Gestión de Exhibición
router.route("/gde/comprobantestock").get(Pg.gde_comprobantestock);
router.route("/gde/comprobantestockupdate").post(Pg.gde_comprobantestockCreate);
router
  .route("/gde/comprobantestockdelete/:id")
  .delete(Pg.gde_comprobantestockDelete);
/* router.route('/gde/comprobantestockupdate/:id').put(Pg.gde_comprobantestockUpdate); */

router.route("/gde/deposanoconsiderar").get(Pg.gde_deposanoconsiderar);
router
  .route("/gde/deposanoconsiderarupdate")
  .post(Pg.gde_deposanoconsiderarCreate);
router
  .route("/gde/deposanoconsiderardelete/:id")
  .delete(Pg.gde_deposanoconsiderarDelete);
/* router.route('/gde/deposanoconsiderarupdate').put(Pg.gde_deposanoconsiderarUpdate); */

router.route("/gde/npaconsiderar").get(Pg.gde_npaconsiderar);
router.route("/gde/npaconsiderarupdate").post(Pg.gde_npaconsiderarCreate);
router.route("/gde/npaconsiderardelete/:id").delete(Pg.gde_npaconsiderarDelete);
/* router.route('/gde/npaconsiderarupdate/:id').put(Pg.gde_npaconsiderarUpdate); */

router
  .route("/gde/recepcionproveedoraconsiderar")
  .get(Pg.gde_recepcionproveedoraconsiderar);
router
  .route("/gde/recepcionproveedoraconsiderarupdate")
  .post(Pg.gde_recepcionproveedoraconsiderarCreate);
router
  .route("/gde/recepcionproveedoraconsiderardelete/:id")
  .delete(Pg.gde_recepcionproveedoraconsiderarDelete);
/* router.route('/gde/recepcionproveedoraconsiderarupdate/:id').put(Pg.gde_recepcionproveedoraconsiderarUpdate); */

// Enviar por WhatsApp (Distribución de lista de precios)
router.route("/enviarxWhatsapp").post(async (request, response) => {
  const { to, perfil } = request.body || {};

  try {
    const data = await enviarListaPreciosPorPerfil({ to, perfil });

    if (!data.ok) {
      const msg = data?.error || "Error";
      const isBadReq = /E\.164|perfil inválido/i.test(msg);
      return response.status(isBadReq ? 400 : 500).json(data);
    }

    const filename =
      data.perfil === "REA"
        ? process.env.PDF_FILENAME_REA
        : process.env.PDF_FILENAME_REB;

    if (data.ok) {
      logEnviadoOk({
        to: data?.to,
        perfil: data?.perfil,
        messageId: data?.wa?.messages?.[0]?.id,
        messageStatus: data?.wa?.messages?.[0]?.message_status,
        templateName: process.env.TEMPLATE_NAME,
        filename,
        mediaId: data?.mediaId,
      });

      return response.status(200).json({
        ok: true,
        to: data.to,
        perfil: data.perfil,
        mediaId: data.mediaId,
        messageId: data?.wa?.messages?.[0]?.id,
        messageStatus: data?.wa?.messages?.[0]?.message_status,
      });
    }

    return response.status(400).json({
      ok: false,
      error: data.error,
    });
  } catch (err) {
    const msg = err?.message || "Error inesperado";

    logErrorEnvio({
      to,
      perfil,
      err: {
        message: err?.message,
        code: err?.code,
        cause: err?.cause,
        errors: err?.errors,
        stack: err?.stack,
      },
      templateName: process.env.TEMPLATE_NAME,
      filename:
        perfil === "REA"
          ? process.env.PDF_FILENAME_REA
          : process.env.PDF_FILENAME_REB,
    });

    const isBadReq = /E\.164|perfil inválido/i.test(msg);
    return response
      .status(isBadReq ? 400 : 500)
      .json({ ok: false, error: msg });
  }
});

function parseDate(value) {
  if (!value || !String(value).trim()) return null;

  const trimmed = String(value).trim();
  const isValid = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);

  return isValid ? trimmed : null;
}

function parseIntOrNull(value) {
  if (!value || !String(value).trim()) return null;

  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function parseBit(value) {
  if (!value) return false;

  const normalized = String(value).toLowerCase().trim();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "si" ||
    normalized === "sí"
  );
}

function parseStringOrNull(value, maxLength) {
  if (!value || !String(value).trim()) return null;
  return String(value)
    .trim()
    .slice(0, maxLength || 255);
}

function formatDateToYMD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultFechaAuditoriaDesde() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 90);
  return formatDateToYMD(from);
}

function getDefaultFechaAuditoriaHasta() {
  return formatDateToYMD(new Date());
}

router.route("/recepcion-proveedores").get(async (request, response) => {
  try {
    const diasParaVencPart =
      parseIntOrNull(request.query.diasParaVencPart) ?? 30;
    const fechaAuditoriaDesde =
      parseDate(request.query.fechaAuditoriaDesde) ||
      getDefaultFechaAuditoriaDesde();
    const fechaAuditoriaHasta =
      parseDate(request.query.fechaAuditoriaHasta) ||
      getDefaultFechaAuditoriaHasta();

    const fechaComprobanteDesde =
      parseDate(request.query.fechaComprobanteDesde) || fechaAuditoriaDesde;
    const fechaComprobanteHasta =
      parseDate(request.query.fechaComprobanteHasta) || fechaAuditoriaHasta;

    const comprador = parseStringOrNull(request.query.comprador, 10);
    const proveedorId = parseIntOrNull(request.query.proveedorId);
    const codigoArticulo = parseStringOrNull(request.query.codigoArticulo, 50);
    const tipoComprobante = parseStringOrNull(
      request.query.tipoComprobante,
      10,
    );
    const clasif2 = parseStringOrNull(request.query.clasif2, 10);
    const clasif6 = parseStringOrNull(request.query.clasif6, 10);
    const soloIRO = parseBit(request.query.soloIRO);

    if (diasParaVencPart < 0 || diasParaVencPart > 9999) {
      return response.status(400).json({
        ok: false,
        message: "diasParaVencPart debe estar entre 0 y 9999",
      });
    }

    if (fechaAuditoriaDesde > fechaAuditoriaHasta) {
      return response.status(400).json({
        ok: false,
        message:
          "fechaAuditoriaDesde no puede ser mayor que fechaAuditoriaHasta",
      });
    }

    if (
      fechaComprobanteDesde &&
      fechaComprobanteHasta &&
      fechaComprobanteDesde > fechaComprobanteHasta
    ) {
      return response.status(400).json({
        ok: false,
        message:
          "fechaComprobanteDesde no puede ser mayor que fechaComprobanteHasta",
      });
    }

    const data = {
      diasParaVencPart,
      fechaAuditoriaDesde,
      fechaAuditoriaHasta,
      fechaComprobanteDesde,
      fechaComprobanteHasta,
      comprador,
      proveedorId,
      codigoArticulo,
      tipoComprobante,
      clasif2,
      clasif6,
      soloIRO,
    };

    //console.log('▶ Consulta recepción de proveedores con filtros:', data);

    const result = await Db.getRecepcionProveedores(data);

    return response.json({
      ok: true,
      filters: {
        diasParaVencPart,
        fechaAuditoriaDesde,
        fechaAuditoriaHasta,
        fechaComprobanteDesde,
        fechaComprobanteHasta,
        comprador,
        proveedorId,
        codigoArticulo,
        tipoComprobante,
        clasif2,
        clasif6,
        soloIRO,
      },
      total: result.length,
      rows: result,
    });
  } catch (error) {
    console.error("Error en /api/recepcion-proveedores:", error);

    return response.status(500).json({
      ok: false,
      message: "Ocurrió un error al consultar recepción de proveedores",
    });
  }
});

router.route("/cron/avisosdeudavencida/config").put(async (req, res) => {
  try {
    const { cron_schedule, timezone } = req.body;
    const usuario = req.user?.nombre || "admin";

    const config = await Pg.actualizarConfigCron({
      cronSchedule: cron_schedule,
      timezone,
      usuario,
    });

    const cron = await recargarCronDesdeDB();

    res.status(200).json({
      ok: true,
      cron,
      config,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.route("/cron/avisosdeudavencida/status").get(async (req, res) => {
  const config = await Pg.obtenerConfigEnvio();

  res.status(200).json({
    cron: estadoCron(),
    activo: config.activo,
    cron_schedule: config.cron_schedule,
    timezone: config.timezone,
    actualizado_en: config.actualizado_en,
    actualizado_por: config.actualizado_por,
  });
});

router.route("/cron/avisosdeudavencida/start").post(async (req, res) => {
  const usuario = req.user?.nombre || "admin";

  const config = await Pg.actualizarEstadoEnvio(true, usuario);

  const cron = await startCron();

  res.status(200).json({ ok: true, cron, config });
});

router.route("/cron/avisosdeudavencida/stop").post(async (req, res) => {
  const usuario = req.user?.nombre || "admin";

  const config = await Pg.actualizarEstadoEnvio(false, usuario);

  const cron = await stopCron();

  res.status(200).json({ ok: true, cron, config });
});

router.route("/envios-deudavencida").get(async (req, res) => {
  const { fecha, tipo_envio } = req.query;

  const data = await Pg.obtenerRegistrarEnvioWhatsapp(fecha, tipo_envio);
  res.status(200).json(data);
});

router.route("/envios-deudavencida-pdf/:id").get(async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Pg.obtenerRegistrarEnvioWhatsappPDF(id);

    if (result[0].length === 0) {
      return res.status(404).json({
        ok: false,
        message: "No se encontró el registro de envío",
      });
    }

    const envio = result[0];

    if (!envio.pdf_path) {
      return res.status(404).json({
        ok: false,
        message: "Este envío no tiene PDF asociado",
      });
    }

    const pdfPath = path.resolve(envio.pdf_path);

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        ok: false,
        message: "El archivo PDF no existe en el servidor",
      });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${envio.pdf_filename || `aviso-deuda-${envio.cliente_id}.pdf`}"`,
    );

    return res.sendFile(pdfPath);
  } catch (error) {
    console.error("Error al abrir PDF:", error);

    return res.status(500).json({
      ok: false,
      message: "Error al abrir PDF",
      error: error.message,
    });
  }
});

router.route("/obtenerdetalledeudaxcliente").get(async (req, res) => {
  const cliente = req.query.cliente;
  const dias_vencido = req.query.dias_vencido;

  const data = await Db.obtenerDetalleDeudaPorCliente(cliente, dias_vencido);
  res.status(200).json(data);
});

router.route("/buscarclienteportelefono").get(async (req, res) => {
  const buscar = req.query.buscar;
  try {
    if (!buscar)
      return res.status(400).json({ ok: false, message: "Buscar vacio" });
    const data = await Db.getBuscarClientePorTelefono(buscar);
    res.status(200).json({
      ok: true,
      total: data.length,
      rows: data,
    });
  } catch (error) {
    console.error("Error en /api/buscarclienteportelefono:", error);

    return res.status(500).json({
      ok: false,
      message: "Ocurrió un error al buscar cliente por telefono",
      error: error.message,
    });
  }
});

const httpPort = 8099;
const httpsPort = 8090;

const httpsServer = https.createServer(httpsOptions, app);
const httpServer = http.createServer(app);

httpServer.listen(httpPort);
httpsServer.listen(httpsPort);

console.log("API is runnning at " + httpsPort);
console.log("API is runnning at " + httpPort);
