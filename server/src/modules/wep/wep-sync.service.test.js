import assert from "node:assert/strict";
import test from "node:test";
import { WepSyncService } from "./wep-sync.service.js";

const sourceRow = {
  DivisionOrdenPreparacion: "01",
  TipoOrdenPreparacion: "OP",
  NumeroOrdenPreparacion: 123,
  DivisionNotaPedido: "01",
  TipoNotaPedido: "NP",
  NumeroNotaPedido: 456,
  CodigoCliente: "C001",
  NombreCliente: "Cliente",
  DomicilioEntrega: "Domicilio",
  Localidad: "Localidad",
  CodigoZonaDistribucion: "Z1",
  NombreZonaDistribucion: "Zona",
  TelefonoCliente: null,
  TelefonoDomicilio: "1111",
  EmailCliente: null,
  FechaEntrega: new Date("2026-09-11T00:00:00.000Z"),
  SalidaVehiculo: new Date("2026-09-11T08:00:00.000Z"),
  DesdeHoraEntrega: new Date("1970-01-01T09:30:00.000Z"),
  HastaHoraEntrega: new Date("1970-01-01T12:00:00.000Z"),
  ObservacionEntrega: null,
  Observaciones: "Frágil",
  PesoCalculado: 10.5,
  VolumenCalculado: 2.25,
  BultosCalculados: 3,
  Estado: "Preparado sin remitir",
  CodigoVehiculo: "001",
  NombreVehiculo: "Camión 1",
  PatenteVehiculo: "AA123BB",
  Vuelta: 1,
};

function createLogger() {
  return { info() {}, warn() {}, error() {} };
}

function createDatabase({ failDelivery = false, vehicleInserted = false } = {}) {
  const queries = [];
  let deliveryCalls = 0;
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes("public.vehiculos")) {
        return { rows: [{ id: 10, insertado: vehicleInserted }] };
      }
      if (sql.includes("public.viajes")) return { rows: [{ id: 20 }] };
      if (sql.includes("public.entrega_estados")) {
        return { rows: [{ id: 30 }] };
      }
      if (sql.includes("public.entregas")) {
        if (failDelivery) throw new Error("falló entregas");
        deliveryCalls += 1;
        return { rows: [{ insertada: deliveryCalls === 1 }] };
      }
      return { rows: [] };
    },
    release() {
      queries.push({ sql: "RELEASE" });
    },
  };

  return {
    queries,
    pool: { connect: async () => client },
  };
}

function createService(database, rows = [sourceRow]) {
  return new WepSyncService({
    sourceRepository: { getEntregasProgramadas: async () => rows },
    postgresPool: database.pool,
    logger: createLogger(),
  });
}

const filters = {
  fechaDesde: "2026-09-11",
  fechaHasta: "2026-09-11",
  vehiculo: null,
  vuelta: null,
};

test("sincroniza por codigo_erp y la segunda ejecución actualiza sin duplicar", async () => {
  const database = createDatabase();
  const service = createService(database, [
    { ...sourceRow, PatenteVehiculo: " AA 123 BB " },
  ]);

  const first = await service.synchronize(filters);
  const second = await service.synchronize(filters);

  assert.deepEqual(first.entregas, {
    procesadas: 1,
    insertadas: 1,
    actualizadas: 0,
  });
  assert.deepEqual(second.entregas, {
    procesadas: 1,
    insertadas: 0,
    actualizadas: 1,
  });

  const firstTransaction = database.queries.slice(0, 7).map(({ sql }) => sql);
  assert.equal(firstTransaction[0], "BEGIN");
  assert.match(firstTransaction[1], /public\.vehiculos/);
  assert.match(firstTransaction[2], /public\.viajes/);
  assert.match(firstTransaction[3], /public\.entrega_estados/);
  assert.match(firstTransaction[4], /public\.entregas/);
  assert.equal(firstTransaction[5], "COMMIT");
  assert.equal(firstTransaction[6], "RELEASE");

  const vehicleQuery = database.queries.find(({ sql }) =>
    sql.includes("public.vehiculos"),
  ).sql;
  assert.match(
    vehicleQuery,
    /ON CONFLICT \(codigo_erp\) WHERE codigo_erp IS NOT NULL/,
  );
  assert.doesNotMatch(vehicleQuery, /ON CONFLICT \(patente\)/);
  assert.doesNotMatch(
    vehicleQuery.split("ON CONFLICT")[1],
    /gestya_id|gestya_gps_id|es_externo|wep_pin_hash|wep_login_activo/,
  );
  const vehicleParams = database.queries.find(({ sql }) =>
    sql.includes("public.vehiculos"),
  ).params;
  assert.deepEqual(vehicleParams, ["001", "Camión 1", "AA123BB"]);

  const tripQuery = database.queries.find(({ sql }) =>
    sql.includes("public.viajes"),
  ).sql;
  assert.match(
    tripQuery,
    /ON CONFLICT \(vehiculo_id, fecha, numero_vuelta\) DO UPDATE/,
  );
  assert.doesNotMatch(tripQuery.split("DO UPDATE SET")[1], /estado\s*=/);

  const deliveryQuery = database.queries.find(({ sql }) =>
    sql.includes("public.entregas"),
  ).sql;
  const deliveryUpdates = deliveryQuery.split("DO UPDATE SET")[1];
  assert.match(
    deliveryQuery,
    /ON CONFLICT \(\s*orden_preparacion_division,\s*orden_preparacion_tipo,\s*orden_preparacion_numero\s*\)/,
  );
  assert.doesNotMatch(
    deliveryUpdates,
    /estado_id\s*=|orden_secuencia\s*=|created_at\s*=/,
  );
});

test("mantiene el mismo vehículo si cambia el formato o el valor de la patente", async () => {
  const database = createDatabase();
  let rows = [{ ...sourceRow, PatenteVehiculo: "AB 172 IL" }];
  const service = new WepSyncService({
    sourceRepository: { getEntregasProgramadas: async () => rows },
    postgresPool: database.pool,
    logger: createLogger(),
  });

  await service.synchronize(filters);
  rows = [{ ...sourceRow, PatenteVehiculo: "AC 123 ZZ" }];
  await service.synchronize(filters);

  const vehicleQueries = database.queries.filter(({ sql }) =>
    sql.includes("public.vehiculos"),
  );
  assert.deepEqual(
    vehicleQueries.map(({ params }) => params),
    [
      ["001", "Camión 1", "AB172IL"],
      ["001", "Camión 1", "AC123ZZ"],
    ],
  );
  const tripQueries = database.queries.filter(({ sql }) =>
    sql.includes("public.viajes"),
  );
  assert.deepEqual(
    tripQueries.map(({ params }) => params[0]),
    [10, 10],
  );
});

test("conserva codigo ERP como string y resuelve filas por codigo, no por patente", async () => {
  const database = createDatabase();
  const service = createService(database, [
    { ...sourceRow, CodigoVehiculo: " 001 ", PatenteVehiculo: "AB 172 IL" },
    { ...sourceRow, CodigoVehiculo: "001", PatenteVehiculo: "AB172IL" },
  ]);

  const result = await service.synchronize(filters);

  assert.equal(result.vehiculos.procesados, 1);
  const vehicleQueries = database.queries.filter(({ sql }) =>
    sql.includes("public.vehiculos"),
  );
  assert.equal(vehicleQueries.length, 1);
  assert.equal(vehicleQueries[0].params[0], "001");
  assert.equal(typeof vehicleQueries[0].params[0], "string");
});

test("si la patente viene vacía conserva y resuelve el vehículo existente por codigo_erp", async () => {
  const database = createDatabase();
  const service = createService(database, [
    { ...sourceRow, PatenteVehiculo: "   " },
  ]);

  const result = await service.synchronize(filters);

  assert.equal(result.entregas.procesadas, 1);
  assert.equal(result.resumenOmisiones.patenteVacia, 1);
  const vehicleQuery = database.queries.find(({ sql }) =>
    sql.includes("public.vehiculos"),
  );
  assert.deepEqual(vehicleQuery.params, ["001", "Camión 1", null]);
  assert.match(vehicleQuery.sql, /WHERE codigo_erp = \$1/);
  assert.match(
    vehicleQuery.sql,
    /\(\$2::text IS NULL OR \$3::text IS NULL\)/,
  );
});

test("hace rollback y libera el cliente si falla un UPSERT", async () => {
  const database = createDatabase({ failDelivery: true });
  const service = createService(database);

  await assert.rejects(() => service.synchronize(filters), /falló entregas/);
  assert.equal(
    database.queries.some(({ sql }) => sql === "COMMIT"),
    false,
  );
  assert.deepEqual(database.queries.slice(-2).map(({ sql }) => sql), [
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("omite filas con claves críticas inválidas sin inventar viaje", async () => {
  const database = createDatabase();
  const service = createService(database, [
    { ...sourceRow, PatenteVehiculo: "", Vuelta: null },
    { ...sourceRow, NumeroOrdenPreparacion: null, Vuelta: 0 },
  ]);

  const result = await service.synchronize(filters);

  assert.equal(result.sourceRows, 2);
  assert.equal(result.entregas.procesadas, 0);
  assert.equal(result.filasOmitidas, 2);
  assert.equal(result.resumenOmisiones.patenteVacia, 1);
  assert.equal(result.resumenOmisiones.nombreVehiculoVacio, 0);
  assert.equal(result.resumenOmisiones.ordenPreparacionIncompleta, 1);
  assert.equal(result.resumenOmisiones.vueltaInvalida, 2);
  assert.equal(
    database.queries.some(({ sql }) => sql.includes("public.entregas")),
    false,
  );
});

test("omite filas sin CodigoVehiculo", async () => {
  const database = createDatabase();
  const service = createService(database, [
    { ...sourceRow, CodigoVehiculo: "   " },
  ]);

  const result = await service.synchronize(filters);

  assert.equal(result.entregas.procesadas, 0);
  assert.equal(result.resumenOmisiones.codigoVehiculoVacio, 1);
  assert.equal(
    database.queries.some(({ sql }) => sql.includes("public.vehiculos")),
    false,
  );
});
