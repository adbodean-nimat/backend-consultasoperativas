import assert from "node:assert/strict";
import test from "node:test";
import { WepSyncService } from "./wep-sync.service.js";
import { WepSyncTrackingService } from "./wep-sync-tracking.service.js";
import { WepTrackingRepository } from "./wep-tracking.repository.js";
import { WepTrackingLookupRepository, WepTrackingLookupService } from "./wep-tracking-lookup.service.js";

const now = new Date("2026-10-29T15:00:00Z");
const firstId = "abcdefghijklmnopqrstuvwx12345678";
const secondId = "ZYXWVUTSRQPONMLKJIHGFEDC87654321";
const row = {
  DivisionOrdenPreparacion: "01", TipoOrdenPreparacion: "OP", NumeroOrdenPreparacion: 123,
  DivisionNotaPedido: "01", TipoNotaPedido: "NPC", NumeroNotaPedido: 883524,
  CodigoCliente: "C001", NombreCliente: "Cliente de prueba",
  DomicilioEntrega: " San Martín  123 ", Localidad: "Concordia",
  TelefonoDomicilio: "+54 9 345 433-3569", FechaEntrega: "2026-10-29",
  SalidaVehiculo: "2026-10-29", Vuelta: 1,
  CodigoVehiculo: "101", NombreVehiculo: "Camión de prueba", PatenteVehiculo: "AA123BB",
};
const filters = { fechaDesde: "2026-10-29", fechaHasta: "2026-10-29" };

function database({ failToken = false, failCommit = false, acquired = true } = {}) {
  const queries = [];
  let deliveries = [];
  let tokens = [];
  let snapshot;
  let connections = 0;
  let releases = 0;
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql === "BEGIN") snapshot = structuredClone({ deliveries, tokens });
      else if (sql === "ROLLBACK") { deliveries = snapshot.deliveries; tokens = snapshot.tokens; }
      else if (sql === "COMMIT" && failCommit) throw new Error("commit fallido");
      else if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired }] };
      else if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      else if (sql.includes("public.vehiculos")) return { rows: [{ id: 10 }] };
      else if (sql.includes("INSERT INTO public.viajes")) return { rows: [{ id: 20 + params[2] }] };
      else if (sql.includes("public.entrega_estados")) return { rows: [{ id: 30 }] };
      else if (sql.includes("INSERT INTO public.entregas")) {
        const index = deliveries.findIndex(item => item.order === String(params[2]));
        const delivery = {
          order: String(params[2]), id: index < 0 ? deliveries.length + 1 : deliveries[index].id,
          viaje_id: params[24], cliente_codigo: params[6], domicilio: params[8], localidad: params[9],
          fecha_entrega: params[15], telefono: params[12], telefono_alternativo: params[13], pedido: params[5],
        };
        if (index < 0) deliveries.push(delivery); else deliveries[index] = delivery;
        return { rows: [{ insertada: index < 0 }] };
      } else if (sql.includes("WHERE viaje_id = ANY")) {
        return { rows: deliveries.filter(item => params[0].includes(item.viaje_id)) };
      } else if (sql.includes("UPDATE public.tracking_tokens")) {
        tokens.filter(item => matches(item, params) && item.expira_at <= now).forEach(item => { item.activo = false; });
      } else if (sql.includes("SELECT public_id, expira_at")) {
        return { rows: tokens.filter(item => matches(item, params) && item.activo && item.expira_at > now) };
      } else if (sql.includes("INSERT INTO public.tracking_tokens")) {
        if (failToken) throw new Error("token fallido");
        const token = {
          public_id: params[0], viaje_id: params[1], cliente_codigo: params[2],
          domicilio_normalizado: params[3], localidad_normalizada: params[4],
          entrega_id: params[5], expira_at: params[6], activo: true,
        };
        tokens.push(token);
        return { rows: [token] };
      } else if (sql.includes("e.nota_pedido_numero::text = $1")) {
        return { rows: deliveries.filter(item => item.pedido === params[0]).flatMap(delivery =>
          tokens.filter(token => token.viaje_id === delivery.viaje_id
            && token.cliente_codigo === delivery.cliente_codigo && token.activo && token.expira_at > now)
            .map(token => ({ ...delivery, ...token }))) };
      } else if (!["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) {
        assert.fail(`Consulta inesperada: ${sql}`);
      }
      return { rows: [] };
    },
    release() { releases++; },
  };
  function matches(token, params) {
    return token.viaje_id === params[0] && token.cliente_codigo === params[1]
      && token.domicilio_normalizado === params[2] && token.localidad_normalizada === params[3];
  }
  return {
    client, queries, get tokens() { return tokens; }, get deliveries() { return deliveries; },
    get connections() { return connections; }, get releases() { return releases; },
    pool: { async connect() { connections++; return client; }, query: (...args) => client.query(...args) },
  };
}

function service(db, rows = [row]) {
  const logs = [];
  const sync = new WepSyncService({
    sourceRepository: { async getEntregasProgramadas() { return rows; } },
    postgresPool: db.pool,
    syncTrackingService: new WepSyncTrackingService({ now: () => now }),
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  });
  return { sync, logs };
}

test("sincronizar un viaje PROGRAMADO habilita el lookup sin WhatsApp y sin filtrar el token", async () => {
  const db = database();
  const { sync, logs } = service(db);
  const result = await sync.synchronize(filters);
  assert.equal(result.tracking.disponibles, 1);
  assert.equal(db.tokens.length, 1);
  assert.match(db.tokens[0].public_id, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(db.tokens[0].expira_at.toISOString(), "2026-11-01T02:59:59.999Z");
  const lookup = new WepTrackingLookupService({ repository: new WepTrackingLookupRepository({ postgresPool: db.pool }) });
  assert.deepEqual(await lookup.lookup({ pedido: "883524", telefonoUltimos4: "3569" }), { publicId: db.tokens[0].public_id });
  assert.equal(await lookup.lookup({ pedido: "883524", telefonoUltimos4: "9999" }), null);
  const output = JSON.stringify({ result, logs });
  for (const secret of [db.tokens[0].public_id, "3569", "3454333569"]) assert.ok(!output.includes(secret));
  assert.equal(db.connections, 1);
  assert.equal(db.releases, 1);
  assert.equal(db.queries.filter(item => item.sql === "BEGIN").length, 1);
  assert.equal(db.queries.filter(item => item.sql === "COMMIT").length, 1);
});

test("agrupa órdenes por parada y reutiliza tokens y enlaces entre sincronizaciones", async () => {
  const db = database();
  const rows = [row, { ...row, NumeroOrdenPreparacion: 124, NumeroNotaPedido: 883525, DomicilioEntrega: "SAN MARTÍN 123" }];
  const { sync } = service(db, rows);
  await sync.synchronize(filters);
  const id = db.tokens[0].public_id;
  const again = await sync.synchronize(filters);
  assert.equal(again.tracking.disponibles, 1);
  assert.equal(db.tokens.length, 1);
  assert.equal(db.tokens[0].public_id, id);
  assert.equal(db.queries.filter(item => item.sql.includes("INSERT INTO public.tracking_tokens")).length, 1);
});

test("separa por viaje, cliente y domicilio; una entrega sin teléfono puede recibir token", async () => {
  const db = database();
  const { sync } = service(db, [row,
    { ...row, NumeroOrdenPreparacion: 124, Vuelta: 2 },
    { ...row, NumeroOrdenPreparacion: 125, CodigoCliente: "C002" },
    { ...row, NumeroOrdenPreparacion: 126, DomicilioEntrega: "Otro domicilio", TelefonoDomicilio: null },
  ]);
  assert.equal((await sync.synchronize(filters)).tracking.disponibles, 4);
  assert.equal(db.tokens.length, 4);
});

test("omite claves incompletas e históricos sin recrear tokens vencidos", async () => {
  const db = database();
  const { sync } = service(db, [
    { ...row, CodigoCliente: null },
    { ...row, NumeroOrdenPreparacion: 124, DomicilioEntrega: " " },
    { ...row, NumeroOrdenPreparacion: 125, FechaEntrega: "2026-10-01" },
  ]);
  const { tracking } = await sync.synchronize(filters);
  assert.deepEqual(tracking, { disponibles: 0, omitidasSinDatos: 2, omitidasFueraVigencia: 1 });
  assert.equal(db.tokens.length, 0);
});

test("usa la fecha más temprana de todas las órdenes de la parada", async () => {
  const db = database();
  const { sync } = service(db, [row, { ...row, NumeroOrdenPreparacion: 124, FechaEntrega: "2026-10-28" }]);
  await sync.synchronize(filters);
  assert.equal(db.tokens[0].expira_at.toISOString(), "2026-10-31T02:59:59.999Z");
  assert.equal(db.tokens[0].entrega_id, 1);
});

for (const options of [{ failToken: true }, { failCommit: true }]) {
  test(`un fallo revierte tokens y entregas juntos (${JSON.stringify(options)})`, async () => {
    const db = database(options);
    const { sync } = service(db);
    await assert.rejects(sync.synchronize(filters), /fallido/);
    assert.equal(db.tokens.length, 0);
    assert.equal(db.deliveries.length, 0);
    assert.equal(db.queries.at(-1).sql, "ROLLBACK");
    assert.equal(db.releases, 1);
  });
}

test("lock de sync ocupado no genera tokens ni importa entregas", async () => {
  const db = database({ acquired: false });
  assert.equal((await service(db).sync.synchronize(filters)).skipped, "SYNC_IN_PROGRESS");
  assert.equal(db.tokens.length, 0);
  assert.equal(db.deliveries.length, 0);
});

test("una lista de viajes vacía no hace consultas adicionales", async () => {
  const client = { query() { assert.fail("no debe consultar"); } };
  assert.equal((await new WepSyncTrackingService().ensureForTrips(client, [])).disponibles, 0);
});

test("el repositorio con cliente externo deja rollback y release a su propietario", async () => {
  const queries = [];
  const client = {
    async query(sql) { queries.push(sql); if (sql.includes("INSERT")) throw new Error("fallido"); return { rows: [] }; },
    release() { assert.fail("no debe liberar cliente externo"); },
  };
  const repository = new WepTrackingRepository({ transactionClient: client,
    postgresPool: { connect() { assert.fail("no debe abrir conexión"); } },
  });
  await assert.rejects(repository.getOrCreateActiveStopTracking({
    publicId: firstId, viajeId: 21, clienteCodigo: "C001", domicilioNormalizado: "SAN MARTÍN 123",
    localidadNormalizada: "CONCORDIA", entregaId: 1, expiraAt: new Date("2026-11-01T02:59:59.999Z"),
  }), /fallido/);
  assert.ok(!queries.some(sql => ["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)));
});

test("un token vencido de una parada reprogramada se reemplaza sin reactivar el anterior", async () => {
  const db = database();
  db.tokens.push({ public_id: firstId, viaje_id: 21, cliente_codigo: "C001",
    domicilio_normalizado: "SAN MARTÍN 123", localidad_normalizada: "CONCORDIA",
    expira_at: new Date("2026-10-28T00:00:00Z"), activo: true });
  const sync = service(db).sync;
  sync.syncTrackingService.randomId = () => secondId;
  await sync.synchronize(filters);
  assert.equal(db.tokens.length, 2);
  assert.equal(db.tokens[0].activo, false);
  assert.equal(db.tokens[1].public_id, secondId);
});
