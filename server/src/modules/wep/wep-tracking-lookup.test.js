import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createWepRouter } from "./wep.routes.js";
import { createWepTrackingLookupRateLimit } from "./wep-tracking-lookup-rate-limit.middleware.js";
import {
  LOOKUP_NOT_FOUND_MESSAGE, validateTrackingLookupBody,
  WepTrackingLookupRepository, WepTrackingLookupService,
} from "./wep-tracking-lookup.service.js";

const publicId = "abcdefghijklmnopqrstuvwx12345678";
const logger = { info() {} };
const row = {
  public_id: publicId, telefono: "+54 9 345 433-3569", telefono_alternativo: "3454331234",
  domicilio: " San Martín  123 ", localidad: "concordia",
  domicilio_normalizado: "SAN MARTÍN 123", localidad_normalizada: "CONCORDIA",
};

test("valida NP string/number sin coercionar valores arbitrarios ni teléfono", () => {
  assert.deepEqual(validateTrackingLookupBody({ pedido: 883524, telefonoUltimos4: "3569" }), {
    pedido: "883524", telefonoUltimos4: "3569",
  });
  for (const body of [null, {}, { pedido: "ABC", telefonoUltimos4: "35" },
    { pedido: [], telefonoUltimos4: "3569" }, { pedido: 1.2, telefonoUltimos4: "3569" },
    { pedido: Number.MAX_SAFE_INTEGER + 1, telefonoUltimos4: "3569" },
    { pedido: "1".repeat(21), telefonoUltimos4: "3569" },
    { pedido: "883524", telefonoUltimos4: 3569 }, { pedido: "883524", telefonoUltimos4: "35ab" }]) {
    assert.throws(() => validateTrackingLookupBody(body));
  }
});

test("consulta sólo NP persistida y tokens activos vigentes con parámetros", async () => {
  let query;
  const repository = new WepTrackingLookupRepository({ postgresPool: {
    async query(sql, params) { query = { sql, params }; return { rows: [row] }; },
  } });
  assert.deepEqual(await repository.findActiveCandidates("883611"), [row]);
  assert.deepEqual(query.params, ["883611"]);
  assert.match(query.sql, /e\.nota_pedido_numero::text = \$1/);
  assert.match(query.sql, /t\.activo = TRUE AND t\.expira_at > NOW\(\)/);
  assert.match(query.sql, /t\.viaje_id = e\.viaje_id AND t\.cliente_codigo = e\.cliente_codigo/);
  assert.doesNotMatch(query.sql, /INSERT|UPDATE|orden_preparacion|qr/i);
});

test("NP principal y secundaria resuelven el mismo tracking sin crear tokens", async () => {
  const service = new WepTrackingLookupService({ repository: {
    async findActiveCandidates(pedido) { return ["883524", "883611"].includes(pedido) ? [row] : []; },
  } });
  for (const pedido of ["883524", "883611"]) {
    assert.deepEqual(await service.lookup({ pedido, telefonoUltimos4: "3569" }), { publicId });
    assert.equal(await service.lookup({ pedido, telefonoUltimos4: "1234" }), null);
  }
  assert.equal(await service.lookup({ pedido: "999999", telefonoUltimos4: "3569" }), null);
});

test("normaliza formatos de teléfono y aplica la prioridad de WhatsApp", async () => {
  let candidate = row;
  const service = new WepTrackingLookupService({ repository: {
    async findActiveCandidates() { return [candidate]; },
  } });
  for (const telefono of ["3454333569", "+54 9 345 433-3569", "3454333569|", "(0345) 4333569"]) {
    candidate = { ...row, telefono };
    assert.deepEqual(await service.lookup({ pedido: "883524", telefonoUltimos4: "3569" }), { publicId });
  }
  candidate = { ...row, telefono: "sin teléfono", telefono_alternativo: "3454333569" };
  assert.deepEqual(await service.lookup({ pedido: "883524", telefonoUltimos4: "3569" }), { publicId });
  candidate = { ...row, domicilio_normalizado: "OTRO DOMICILIO" };
  assert.equal(await service.lookup({ pedido: "883524", telefonoUltimos4: "3569" }), null);
  candidate = { ...row, localidad_normalizada: "OTRA LOCALIDAD" };
  assert.equal(await service.lookup({ pedido: "883524", telefonoUltimos4: "3569" }), null);
});

async function withServer(lookupService, callback, options = {}) {
  const logs = [];
  const lookupLogger = { info(...args) { logs.push(args); } };
  const app = express();
  app.use(express.json());
  app.use("/api/wep", createWepRouter({
    lookupService, lookupLogger,
    lookupRateLimit: createWepTrackingLookupRateLimit({ logger: lookupLogger, ...options }),
    technicalAuth() { throw new Error("No debe requerir sesión técnica"); },
    wepAuth() { throw new Error("No debe requerir sesión de chofer"); },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const post = (body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/wep/public/tracking/lookup`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  try { await callback(post, logs); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("POST público: éxito, 400, 404 uniforme, 500 y auditoría sin datos sensibles", async () => {
  await withServer({ async lookup({ pedido, telefonoUltimos4 }) {
    if (pedido === "500") throw new Error("secreto interno");
    return pedido === "883524" && telefonoUltimos4 === "3569" ? { publicId } : null;
  } }, async (post, logs) => {
    let response = await post({ pedido: 883524, telefonoUltimos4: "3569" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: true, publicId });
    response = await post({ pedido: "ABC", telefonoUltimos4: "35" });
    assert.equal(response.status, 400);
    for (const body of [{ pedido: "883524", telefonoUltimos4: "9999" }, { pedido: "999999", telefonoUltimos4: "3569" }]) {
      response = await post(body);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { ok: false, message: LOOKUP_NOT_FOUND_MESSAGE });
    }
    response = await post({ pedido: "500", telefonoUltimos4: "3569" });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { ok: false, message: "No pudimos consultar tu entrega en este momento." });
    assert.doesNotMatch(JSON.stringify(logs), new RegExp(`3569|${publicId}|secreto|telefono`));
  });
});

for (const scenario of ["vencido", "inactivo", "sin tracking", "antiguo"]) {
  test(`POST devuelve 404 genérico para ${scenario}`, async () => {
    await withServer({ async lookup() { return null; } }, async (post) => {
      const response = await post({ pedido: "883524", telefonoUltimos4: "3569" });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { ok: false, message: LOOKUP_NOT_FOUND_MESSAGE });
    });
  });
}

test("sexto intento bloqueado por IP; no evade con X-Forwarded-For; ventana se reinicia", async () => {
  let time = 0;
  let calls = 0;
  await withServer({ async lookup() { calls++; return null; } }, async (post, logs) => {
    const body = { pedido: "883524", telefonoUltimos4: "3569" };
    for (let i = 0; i < 5; i++) assert.equal((await post(body)).status, 404);
    const blocked = await post(body, { "X-Forwarded-For": "203.0.113.2" });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "600");
    assert.equal(calls, 5);
    assert.equal(logs.at(-1)[1].resultado, "RATE_LIMITED");
    time = 600_001;
    assert.equal((await post(body)).status, 404);
  }, { now: () => time });
});
