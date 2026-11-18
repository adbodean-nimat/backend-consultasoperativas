import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import jwt from "jsonwebtoken";
import { createChatbotHistoryRouter } from "./chatbot-history.routes.js";
import { createChatbotHistoryService, validateHistoryQuery } from "./chatbot-history.service.js";

const privateKey = "history-test-private-key-84917";
const env = { NIMAT_CHATBOT_URL: "https://history.example.test/", NIMAT_CHATBOT_HISTORY_KEY: privateKey };
const now = "2026-11-17T12:00:00.000Z";
const product = { sku: "SKU-123", title: "Cemento", url: "https://nimat.com.ar/producto" };
const message = (id, seq) => ({ id, seq, role: seq % 2 ? "user" : "assistant", text: "<script>hola</script>", createdAt: null,
  intent: null, products: [{ ...product, price: null, available: false, outlet: true, snapshotAt: now }] });
function listing(params) {
  return { items: [{ id: "chat-1", createdAt: null, updatedAt: now, preview: "Cemento SKU-123", messageCount: 102, productCount: 1 }],
    total: 26, page: params.page, limit: params.limit, hasMore: params.page === 1 };
}
function detail(id, params) {
  const older = params.before !== undefined;
  return { id, createdAt: null, updatedAt: now, messageCount: 102,
    messages: older ? [message("m1", 1), message("m2", 2)] : [message("m101", 101), message("m102", 102)],
    products: [{ ...product, appearances: 5 }], hasMore: !older, nextBefore: older ? null : 101 };
}
let mode = "ok", server, base, oldSecret;
const calls = [];
const http = { async get(url, options) {
  calls.push({ url, options });
  if (mode === "connection") throw Object.assign(new Error(`private ${privateKey}`), { code: "ECONNREFUSED", config: options });
  if (mode === "timeout") return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error(privateKey), { code: "ERR_CANCELED" })), { once: true }));
  if (mode === "upstream-auth") throw Object.assign(new Error(privateKey), { response: { status: 401, data: { debug: privateKey } } });
  if (mode === "redirect") return { status: 302, headers: { location: "https://evil.test" }, data: privateKey };
  if (mode === "html") return { status: 200, headers: { "content-type": "text/html" }, data: "<html>login</html>" };
  if (mode === "malformed") return { status: 200, headers: { "content-type": "application/json" }, data: { debug: privateKey } };
  const id = url.split("/").at(-1);
  const data = id === "chats" ? listing(options.params) : detail(id, options.params);
  if (mode === "extra") { data.debug = privateKey; if (data.messages) data.messages[0].debug = privateKey; }
  if (mode === "wrong-id") data.id = "another-chat";
  if (mode === "bad-cursor") { data.hasMore = true; data.nextBefore = null; }
  if (mode === "no-progress") { data.hasMore = true; data.nextBefore = options.params.before; }
  return { status: 200, headers: { "content-type": "application/json; charset=utf-8", "set-cookie": "upstream-secret-cookie" }, data };
} };

const token = (groups = ["Ventas"], options = {}) => jwt.sign({ user: { sAMAccountName: "test-user", memberOf: groups.map(group => `CN=${group},OU=Usuarios,DC=local`) } }, "chatbot-jwt-test", { expiresIn: "1h", ...options });
const send = (path = "", { authorization = `Bearer ${token()}`, method = "GET", headers = {} } = {}) => fetch(`${base}${path}`, { method, headers: { ...(authorization ? { authorization } : {}), ...headers } });

before(async () => {
  oldSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = "chatbot-jwt-test";
  const app = express();
  app.use("/api/chatbot", createChatbotHistoryRouter({ service: createChatbotHistoryService({ http, env, timeoutMs: 40 }) }));
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/chatbot`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
});

test("HTTP ambas rutas rechazan token ausente, inválido, vencido y firma/algoritmo incorrectos con 401", async () => {
  const start = calls.length;
  const credentials = [null, "Bearer", "Basic invalid", "Bearer invalid", `Bearer ${token(["Ventas"], { expiresIn: -1 })}`,
    `Bearer ${jwt.sign({ user: { memberOf: ["CN=Ventas"] } }, "wrong-secret")}`,
    `Bearer ${token(["Ventas"], { algorithm: "HS384" })}`];
  for (const path of ["/chats", "/chats/chat-1"]) for (const authorization of credentials) {
    const response = await send(path, { authorization });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
  }
  assert.equal(calls.length, start);
});

test("HTTP Gerencia, Ventas y Sistemas autorizados; otros sectores y grupos manipulados reciben 403", async () => {
  for (const sector of ["Gerencia", "Ventas", "Sistemas"]) for (const path of ["/chats", "/chats/chat-1"]) {
    assert.equal((await send(path, { authorization: `Bearer ${token([sector])}` })).status, 200);
  }
  const start = calls.length;
  for (const groups of [[], ["Compras"], ["Exhibicion"], ["VentasExternas"], ["Fake,CN=Ventas"]]) {
    for (const path of ["/chats", "/chats/chat-1"]) assert.equal((await send(path, { authorization: `Bearer ${token(groups)}` })).status, 403);
  }
  const forged = jwt.sign({ roles: ["Gerencia"], user: { sAMAccountName: "test", memberOf: [] } }, "chatbot-jwt-test");
  assert.equal((await send("/chats", { authorization: `Bearer ${forged}` })).status, 403);
  assert.equal(calls.length, start);
  const singleGroup = jwt.sign({ user: { sAMAccountName: "test", memberOf: "CN=Sistemas,OU=Usuarios" } }, "chatbot-jwt-test");
  assert.equal((await send("/chats", { authorization: `Bearer ${singleGroup}` })).status, 200);
});

test("HTTP listado, búsqueda SKU y paginación conservan contrato y destino fijo", async () => {
  let response = await send("/chats");
  assert.deepEqual(await response.json(), listing({ page: 1, limit: 25 }));
  assert.equal(calls.at(-1).url, "https://history.example.test/api/h/chats");
  assert.deepEqual(calls.at(-1).options.params, { page: 1, limit: 25, q: "" });
  response = await send("/chats?page=2&limit=100&q=SKU-123");
  const body = await response.json();
  assert.equal(body.page, 2); assert.equal(body.hasMore, false);
  assert.deepEqual(calls.at(-1).options.params, { page: 2, limit: 100, q: "SKU-123" });
});

test("HTTP detalle con productos, precio nulo y cursor de mensajes anteriores", async () => {
  const response = await send("/chats/chat-1?limit=100");
  const body = await response.json();
  assert.deepEqual(body, detail("chat-1", {}));
  assert.equal(body.messages[0].products[0].price, null);
  assert.equal(body.messages[0].text, "<script>hola</script>");
  assert.equal(body.createdAt, null);
  assert.equal(calls.at(-1).url, "https://history.example.test/api/h/chats/chat-1");
  const older = await send(`/chats/chat-1?limit=100&before=${body.nextBefore}`);
  assert.deepEqual((await older.json()).messages.map(m => m.id), ["m1", "m2"]);
  assert.deepEqual(calls.at(-1).options.params, { limit: 100, before: "101" });
  const cursor = "cursor&url=https://evil.test/path?secret=x";
  await send(`/chats/chat-1?before=${encodeURIComponent(cursor)}`);
  assert.equal(calls.at(-1).url, "https://history.example.test/api/h/chats/chat-1");
  assert.equal(calls.at(-1).options.params.before, cursor);
});

test("HTTP validación rechaza parámetros duplicados, destinos del cliente, límites y IDs inválidos", async () => {
  const start = calls.length;
  const paths = ["/chats?limit=101", "/chats?limit=0", "/chats?limit=1.5", "/chats?limit=-1", "/chats?page=9007199254740992", "/chats?page=0",
    "/chats?page=1&page=2", "/chats?q=a&q=b", "/chats?q[]=sku", "/chats?url=https://evil.test", "/chats?before=100",
    `/chats?q=${"x".repeat(501)}`, "/chats/chat-1?q=sku", "/chats/chat-1?before=", "/chats/chat-1?before=1&before=2",
    "/chats/chat-1?before=%0a", `/chats/chat-1?before=${"x".repeat(1001)}`, "/chats/chat%2F1", "/chats/chat%3Furl=evil", "/chats/%invalid", `/chats/${"a".repeat(201)}`];
  for (const path of paths) assert.equal((await send(path)).status, 400, path);
  assert.equal(calls.length, start);
  for (const query of [{ limit: ["1"] }, { limit: 1 }, { q: {} }, { page: true }]) assert.throws(() => validateHistoryQuery(query));
});

test("HTTP proxy reemplaza credenciales y no reenvía cookies, Origin ni cabeceras del navegador", async () => {
  const internalToken = token();
  const response = await send("/chats", { authorization: `Bearer ${internalToken}`, headers: { cookie: "session=browser-secret", origin: "https://browser.example.test", "x-api-key": "browser-key", "x-forwarded-host": "evil.test" } });
  assert.equal(response.status, 200);
  const options = calls.at(-1).options;
  assert.deepEqual(options.headers, { Accept: "application/json", Authorization: `Bearer ${privateKey}` });
  assert.equal(options.timeout, 40); assert.equal(options.maxRedirects, 0); assert.equal(options.proxy, false);
  assert.equal(options.maxContentLength, 5 * 1024 * 1024);
  assert.equal(options.validateStatus(302), false);
  assert.equal(options.signal instanceof AbortSignal, true);
  assert.equal(response.headers.get("set-cookie"), null);
  const body = await response.text();
  assert.equal(body.includes(privateKey), false); assert.equal(body.includes(internalToken), false);
});

test("HTTP respuestas y errores sin caché; no responde 304 ni cachea lecturas repetidas", async () => {
  const first = await send("/chats");
  const start = calls.length;
  const second = await send("/chats", { headers: { "if-none-match": first.headers.get("etag") ?? "*", "if-modified-since": new Date().toUTCString() } });
  assert.equal(second.status, 200); assert.equal(calls.length, start + 1);
  assert.equal(second.headers.get("cache-control"), "no-store, private");
  assert.equal(second.headers.get("surrogate-control"), "no-store");
  const invalid = await send("/chats?limit=999");
  assert.equal(invalid.headers.get("cache-control"), "no-store, private");
});

test("HTTP conexión, timeout, redirecciones y respuestas inválidas generan errores locales sin secretos", async () => {
  try {
    for (const [failure, status] of [["connection", 502], ["timeout", 504], ["upstream-auth", 502], ["redirect", 502], ["html", 502], ["malformed", 502]]) {
      mode = failure;
      const response = await send("/chats");
      assert.equal(response.status, status, failure);
      assert.equal(response.headers.get("cache-control"), "no-store, private");
      assert.equal(response.headers.get("location"), null);
      assert.equal((await response.text()).includes(privateKey), false);
    }
    for (const failure of ["wrong-id", "bad-cursor", "no-progress"]) {
      mode = failure;
      assert.equal((await send("/chats/chat-1?before=101")).status, 502, failure);
    }
  } finally { mode = "ok"; }
});

test("valida configuración privada y nunca consulta transporte con una URL inválida o clave ausente", async () => {
  const start = calls.length;
  for (const values of [{}, { NIMAT_CHATBOT_URL: env.NIMAT_CHATBOT_URL }, { ...env, NIMAT_CHATBOT_HISTORY_KEY: "key\n" },
    ...["http://history.example.test", "https://user:pass@history.example.test", "https://history.example.test/api", "https://history.example.test?url=evil", "https://history.example.test/#fragment"].map(url => ({ ...env, NIMAT_CHATBOT_URL: url }))]) {
    const service = createChatbotHistoryService({ env: values, http });
    await assert.rejects(service.list({}), error => error.status === 503 && !error.message.includes(privateKey));
  }
  assert.equal(calls.length, start);
});

test("HTTP proyecta solo contrato e impide métodos de escritura", async () => {
  try {
    mode = "extra";
    for (const path of ["/chats", "/chats/chat-1"]) assert.equal((await (await send(path)).text()).includes(privateKey), false);
  } finally { mode = "ok"; }
  const start = calls.length;
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
    const response = await send("/chats/chat-1", { method });
    assert.equal(response.status, 405); assert.equal(response.headers.get("allow"), "GET");
  }
  assert.equal((await send("/arbitrary")).status, 404);
  assert.equal(calls.length, start);
});

test("montaje antes del middleware global y ausencia de logs del proxy", () => {
  const source = readFileSync(new URL("../../../api.js", import.meta.url), "utf8");
  assert.ok(source.indexOf('app.use("/api/chatbot", chatbotHistoryRouter)') < source.indexOf('app.use("/api", verifyUserToken, router)'));
  for (const file of ["chatbot-history.routes.js", "chatbot-history.service.js"]) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /console\.(?:log|error|warn)|logger\./);
  }
});
