import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import gestionRouter from "./gestion.routes.js";
import { gestionPool } from "./gestion.repository.js";

let server;
let baseUrl;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { sAMAccountName: "abodean" };
    req.auth = { username: "abodean", userId: 1, iat: 1, exp: 9999999999 };
    next();
  });
  app.use("/gestion", gestionRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await gestionPool.end();
});

test("GET /gestion/registro usa fecha por query y no cae en /:fecha", async () => {
  const response = await fetch(
    `${baseUrl}/gestion/registro?fecha=2026-06-26`,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.fecha, "2026-06-26");
  assert.equal(body.data.semana, "26/06 a 02/07");
  assert.equal(body.data.existeEnPostgres, true);
});

test("GET /gestion/me devuelve identidad y permisos efectivos", async () => {
  const response = await fetch(`${baseUrl}/gestion/me`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.user.username, "abodean");
  assert.equal(body.data.permissions.includes("gestion.ingresar"), true);
});

test("administrador puede consultar configuración y catálogo de roles", async () => {
  const [configurationResponse, rolesResponse] = await Promise.all([
    fetch(`${baseUrl}/gestion/configuracion-general`),
    fetch(`${baseUrl}/gestion/admin/roles`),
  ]);
  const configuration = await configurationResponse.json();
  const roles = await rolesResponse.json();
  assert.equal(configurationResponse.status, 200);
  assert.equal(configuration.data.some((item) => item.clave === "cmv"), true);
  assert.equal(rolesResponse.status, 200);
  assert.equal(roles.data.some((item) => item.code === "ADMIN_GESTION"), true);
});

test("POST /gestion/admin/usuarios existe y valida el contrato JSON", async () => {
  const response = await fetch(`${baseUrl}/gestion/admin/usuarios`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("POST /gestion/registro responde JSON y no HTML 404", async () => {
  const response = await fetch(`${baseUrl}/gestion/registro`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(Array.isArray(body.errors), true);
});

test("POST /gestion/registro acepta el contrato y detecta fecha duplicada", async () => {
  const response = await fetch(`${baseUrl}/gestion/registro`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fecha: "2026-06-26",
      automaticos: {
        caja: 0,
        valores: 0,
        fondosFci: 0,
        proveedores: 0,
        proveedoresAVencer: 0,
        cobranzas: 0,
        ventasNetas: null,
        stockCostoReposicion: 0,
        acopioMesActual: 0,
        cuentaCorrienteClientes: 0,
        diasCaja: null,
      },
      manuales: {
        ajusteCaja: null,
        bancos: 0,
        bancosDescubierto: 0,
        opvOtros: 0,
        otrosActual: null,
        otrosPagosProyectados: 0,
        anticipos: 0,
        acopiosEspeciales: 0,
        ajusteProveedoresAVencer: null,
        observacion: null,
      },
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.ok, false);
  assert.match(body.message, /Ya existe/);
});

test("PUT /gestion/registro/:fecha responde JSON y no HTML 404", async () => {
  const response = await fetch(
    `${baseUrl}/gestion/registro/2026-06-26`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(Array.isArray(body.errors), true);
});

test("PUT /gestion/registro/:fecha llega al service sin crear registros", async () => {
  const response = await fetch(
    `${baseUrl}/gestion/registro/2099-01-01`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manuales: { bancos: 1 } }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.ok, false);
  assert.match(body.message, /No existe/);
});
