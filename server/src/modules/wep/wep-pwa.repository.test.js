import assert from "node:assert/strict";
import test from "node:test";
import {
  groupPwaViajes,
  mapPwaEntregaDetalle,
  WepPwaEntregaMismatchError,
  WepPwaOrdenIncompletoError,
  WepPwaRepository,
  WepPwaViajeNotFoundError,
  WepPwaViajePendingDeliveriesError,
  WepPwaViajeStateConflictError,
  WepPwaViajeWithoutDeliveriesError,
} from "./wep-pwa.repository.js";
import {
  createStopGroupId,
  normalizeStopText,
} from "./wep-stop.util.js";

function row(overrides = {}) {
  return {
    viaje_id: "10",
    numero_vuelta: 1,
    viaje_estado: "PROGRAMADO",
    iniciado_at: null,
    finalizado_at: null,
    vehiculo_id: "3",
    codigo_erp: "001",
    vehiculo_nombre: "M BENZ",
    patente: "AB172IK",
    entrega_id: "101",
    orden_secuencia: 1,
    estado_codigo: "PROGRAMADA",
    estado_nombre: "Programada",
    estado_erp: "Remitidos",
    orden_preparacion_division: "01",
    orden_preparacion_tipo: "OP",
    orden_preparacion_numero: "12345",
    nota_pedido_division: "01",
    nota_pedido_tipo: "NP",
    nota_pedido_numero: "98765",
    cliente_codigo: "1234",
    cliente_nombre: "Cliente ejemplo",
    telefono: "3450000000",
    telefono_alternativo: "3451111111",
    email: "cliente@example.com",
    domicilio: "San Lorenzo 1234",
    localidad: "Concordia",
    zona_codigo: "01",
    zona_nombre: "Centro",
    fecha_entrega: "2026-09-11",
    hora_desde: "09:00:00",
    hora_hasta: "11:00:00",
    peso_calculado: "1200.5",
    volumen_calculado: "2.4",
    bultos_calculados: "12",
    observacion_entrega: "Descargar por portón lateral",
    observaciones: "Frágil",
    ...overrides,
  };
}

test("normaliza texto de parada sin alterar números y admite valores vacíos", () => {
  assert.equal(normalizeStopText(" Laprida   2405 "), "LAPRIDA 2405");
  assert.equal(normalizeStopText("concordia"), "CONCORDIA");
  assert.equal(normalizeStopText(null), "");
  assert.equal(normalizeStopText(undefined), "");
});

test("agrupa entregas normalizadas en paradas, calcula resumen e incluye viajes vacíos", () => {
  const viajes = groupPwaViajes([
    row(),
    row(),
    row({
      entrega_id: "102",
      orden_secuencia: null,
      orden_preparacion_numero: "12346",
      domicilio: " San  Lorenzo 1234 ",
      localidad: "concordia",
      hora_desde: "08:30:00",
      hora_hasta: "12:00:00",
      peso_calculado: null,
      volumen_calculado: "1.6",
      bultos_calculados: "5",
    }),
    row({
      viaje_id: "11",
      numero_vuelta: 2,
      entrega_id: null,
      orden_secuencia: null,
      estado_codigo: null,
      estado_nombre: null,
    }),
  ]);

  assert.equal(viajes.length, 2);
  assert.equal("entregas" in viajes[0], false);
  assert.equal(viajes[0].paradas.length, 1);
  assert.deepEqual(viajes[1].paradas, []);
  const [parada] = viajes[0].paradas;
  assert.equal(parada.entregas[0].observacionEntrega, 'Descargar por portón lateral');
  assert.equal(parada.entregas[0].observaciones, 'Frágil');
  assert.match(parada.grupoId, /^stop_[a-f0-9]{12}$/);
  assert.equal(parada.ordenSecuencia, 1);
  assert.deepEqual(parada.cliente, {
    codigo: "1234",
    nombre: "Cliente ejemplo",
  });
  assert.equal(parada.domicilio, "San Lorenzo 1234");
  assert.equal(parada.localidad, "Concordia");
  assert.equal(parada.cantidadOrdenes, 2);
  assert.deepEqual(parada.totales, {
    bultos: 17,
    peso: 1200.5,
    volumen: 4,
  });
  assert.equal(parada.horaDesde, "08:30:00");
  assert.equal(parada.horaHasta, "12:00:00");
  assert.deepEqual(
    parada.entregas.map(({ id, ordenSecuencia }) => ({
      id,
      ordenSecuencia,
    })),
    [
      { id: 101, ordenSecuencia: 1 },
      { id: 102, ordenSecuencia: null },
    ],
  );
  assert.deepEqual(parada.entregas[0].estado, {
    codigo: "PROGRAMADA",
    nombre: "Programada",
  });
  assert.equal(parada.entregas[0].peso, 1200.5);
  assert.equal("telefono" in parada.entregas[0], false);
  assert.equal("telefonoAlternativo" in parada.entregas[0], false);
  assert.equal("email" in parada.entregas[0], false);
});

test("separa paradas por cliente, domicilio y viaje", () => {
  const viajes = groupPwaViajes([
    row({ entrega_id: "101", cliente_codigo: "100" }),
    row({
      entrega_id: "102",
      cliente_codigo: "100",
      domicilio: "Otro domicilio 99",
    }),
    row({ entrega_id: "103", cliente_codigo: "200" }),
    row({ viaje_id: "11", entrega_id: "104", cliente_codigo: "100" }),
  ]);

  assert.equal(viajes.length, 2);
  assert.equal(viajes[0].paradas.length, 3);
  assert.equal(viajes[1].paradas.length, 1);
});

test("genera el mismo grupoId para textos equivalentes y otro para otro viaje", () => {
  const base = {
    viajeId: 10,
    clienteCodigo: "44829",
    domicilio: "LAPRIDA 2405",
    localidad: "CONCORDIA",
  };
  const grupoId = createStopGroupId(base);

  assert.equal(
    grupoId,
    createStopGroupId({
      ...base,
      domicilio: " Laprida   2405 ",
      localidad: "concordia",
    }),
  );
  assert.notEqual(grupoId, createStopGroupId({ ...base, viajeId: 11 }));
});

test("ordena paradas e internamente sus entregas según el contrato", () => {
  const [viaje] = groupPwaViajes([
    row({
      entrega_id: "103",
      cliente_codigo: "300",
      cliente_nombre: "Zulu",
      domicilio: "Calle C",
      orden_secuencia: null,
      hora_desde: null,
      orden_preparacion_numero: "20",
    }),
    row({
      entrega_id: "102",
      cliente_codigo: "100",
      cliente_nombre: "Beta",
      domicilio: "Calle B",
      orden_secuencia: 2,
      hora_desde: "10:00:00",
      orden_preparacion_numero: "30",
    }),
    row({
      entrega_id: "101",
      cliente_codigo: "100",
      cliente_nombre: "Beta",
      domicilio: "Calle B",
      orden_secuencia: 2,
      hora_desde: "09:00:00",
      orden_preparacion_numero: "10",
    }),
    row({
      entrega_id: "104",
      cliente_codigo: "200",
      cliente_nombre: "Alfa",
      domicilio: "Calle A",
      orden_secuencia: null,
      hora_desde: "08:00:00",
    }),
  ]);

  assert.deepEqual(
    viaje.paradas.map((parada) => parada.cliente.codigo),
    ["100", "200", "300"],
  );
  assert.deepEqual(
    viaje.paradas[0].entregas.map((entrega) => entrega.id),
    [101, 102],
  );
});

test("deriva todos los estados resumen de parada", () => {
  const scenarios = [
    [["ENTREGADA", "ENTREGADA"], "ENTREGADA"],
    [["NO_ENTREGADA", "NO_ENTREGADA"], "NO_ENTREGADA"],
    [["CANCELADA", "CANCELADA"], "CANCELADA"],
    [["ENTREGADA", "NO_ENTREGADA"], "CERRADA_PARCIAL"],
    [["EN_REPARTO", "CLIENTE_AVISADO"], "CLIENTE_AVISADO"],
    [["ASIGNADA", "EN_REPARTO"], "EN_REPARTO"],
    [["PROGRAMADA", "ASIGNADA"], "ASIGNADA"],
    [["PROGRAMADA", "PROGRAMADA"], "PROGRAMADA"],
  ];

  for (const [states, expected] of scenarios) {
    const [viaje] = groupPwaViajes(
      states.map((state, index) =>
        row({
          entrega_id: String(101 + index),
          estado_codigo: state,
          estado_nombre: state,
        }),
      ),
    );
    assert.equal(viaje.paradas[0].estado.codigo, expected);
  }
});

test("consulta PostgreSQL una sola vez con parámetros y orden determinista", async () => {
  let received;
  const repository = new WepPwaRepository({
    postgresPool: {
      async query(sql, params) {
        received = { sql, params };
        return { rows: [row()] };
      },
    },
  });

  const viajes = await repository.getPwaViajes("2026-09-11", 3);

  assert.equal(viajes.length, 1);
  assert.deepEqual(received.params, ["2026-09-11", 3]);
  assert.match(received.sql, /WHERE v\.fecha = \$1::date/);
  assert.match(received.sql, /v\.vehiculo_id = \$2/);
  assert.match(
    received.sql,
    /CASE WHEN e\.orden_secuencia IS NULL THEN 1 ELSE 0 END/,
  );
  assert.match(received.sql, /e\.hora_desde ASC NULLS LAST/);
  assert.doesNotMatch(received.sql, /e\.(telefono|telefono_alternativo|email)/);
  assert.doesNotMatch(
    received.sql,
    /e\.(observacion_entrega|observaciones|zona_codigo|zona_nombre)/,
  );
  assert.doesNotMatch(received.sql, /\b(INSERT|UPDATE|DELETE)\b/i);
});

test("mapea el detalle de una entrega al DTO de la PWA", () => {
  const entrega = mapPwaEntregaDetalle(row());

  assert.equal(entrega.id, 101);
  assert.deepEqual(entrega.contacto, {
    telefono: "3450000000",
    telefonoAlternativo: "3451111111",
    email: "cliente@example.com",
  });
  assert.deepEqual(entrega.vehiculo, {
    id: 3,
    codigoErp: "001",
    nombre: "M BENZ",
    patente: "AB172IK",
  });
  assert.deepEqual(entrega.viaje, {
    id: 10,
    numeroVuelta: 1,
    estado: "PROGRAMADO",
  });
  assert.equal(entrega.ordenPreparacion.numero, 12345);
  assert.equal(entrega.logistica.pesoCalculado, 1200.5);
});

test("consulta el detalle en PostgreSQL una sola vez y parametriza el id", async () => {
  let received;
  const repository = new WepPwaRepository({
    postgresPool: {
      async query(sql, params) {
        received = { sql, params };
        return { rows: [row()] };
      },
    },
  });

  const entrega = await repository.getPwaEntregaDetalle(101, 3);

  assert.equal(entrega.id, 101);
  assert.deepEqual(received.params, [101, 3]);
  assert.match(received.sql, /FROM public\.entregas e/);
  assert.match(received.sql, /LEFT JOIN public\.viajes v/);
  assert.match(received.sql, /LEFT JOIN public\.vehiculos vh/);
  assert.match(received.sql, /LEFT JOIN public\.entrega_estados ee/);
  assert.match(received.sql, /WHERE e\.id = \$1/);
  assert.match(received.sql, /e\.vehiculo_id = \$2/);
  assert.match(received.sql, /e\.telefono_alternativo/);
  assert.doesNotMatch(received.sql, /\b(INSERT|UPDATE|DELETE)\b/i);
});

test("devuelve null cuando no existe el detalle de la entrega", async () => {
  const repository = new WepPwaRepository({
    postgresPool: {
      async query() {
        return { rows: [] };
      },
    },
  });

  assert.equal(await repository.getPwaEntregaDetalle(999999999, 3), null);
});

function createStartDatabase({
  viajeEstado = "PROGRAMADO",
  viajeExiste = true,
  tieneEntregas = true,
  entregasActualizadas = [
    { id: 101, estado_anterior_id: 1 },
    { id: 102, estado_anterior_id: 2 },
  ],
  failOnEvent = false,
} = {}) {
  const iniciadoAt = new Date("2026-09-11T15:30:00.000Z");
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });

      if (sql.includes("FROM public.viajes") && sql.includes("FOR UPDATE")) {
        return {
          rows: viajeExiste
            ? [{ id: 10, estado: viajeEstado, iniciado_at: null }]
            : [],
        };
      }
      if (sql.includes("SELECT 1") && sql.includes("FROM public.entregas")) {
        return { rows: tieneEntregas ? [{ "?column?": 1 }] : [] };
      }
      if (
        sql.startsWith("SELECT id") &&
        sql.includes("FROM public.entrega_estados")
      ) {
        return { rows: [{ id: 3 }] };
      }
      if (sql.startsWith("UPDATE public.viajes")) {
        return {
          rows: [{ id: 10, estado: "EN_REPARTO", iniciado_at: iniciadoAt }],
        };
      }
      if (sql.startsWith("UPDATE public.entregas")) {
        return { rows: entregasActualizadas };
      }
      if (sql.startsWith("INSERT INTO public.entrega_eventos")) {
        if (failOnEvent) throw new Error("falló evento");
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() {
      queries.push({ sql: "RELEASE" });
    },
  };

  return {
    iniciadoAt,
    queries,
    pool: { connect: async () => client },
  };
}

test("inicia un viaje y sus entregas compatibles en una sola transacción", async () => {
  const database = createStartDatabase();
  const repository = new WepPwaRepository({ postgresPool: database.pool });

  const result = await repository.startPwaViaje(10, 3);

  assert.deepEqual(result, {
    viaje: {
      id: 10,
      estado: "EN_REPARTO",
      iniciadoAt: database.iniciadoAt,
    },
    entregasActualizadas: 2,
    entregaIdsActualizadas: [101, 102],
  });
  assert.equal(database.queries[0].sql, "BEGIN");
  assert.match(database.queries[1].sql, /FOR UPDATE/);
  assert.equal(database.queries.at(-2).sql, "COMMIT");
  assert.equal(database.queries.at(-1).sql, "RELEASE");

  const viajeUpdate = database.queries.find(({ sql }) =>
    sql.startsWith("UPDATE public.viajes"),
  );
  assert.match(viajeUpdate.sql, /estado = 'EN_REPARTO'/);
  assert.match(viajeUpdate.sql, /iniciado_at = NOW\(\)/);
  assert.match(viajeUpdate.sql, /updated_at = NOW\(\)/);
  assert.doesNotMatch(
    viajeUpdate.sql.split("WHERE")[0],
    /finalizado_at|vehiculo_id|fecha|numero_vuelta/,
  );

  const entregasUpdate = database.queries.find(({ sql }) =>
    sql.startsWith("UPDATE public.entregas"),
  );
  assert.match(entregasUpdate.sql, /estado_id = \$2/);
  assert.match(entregasUpdate.sql, /updated_at = NOW\(\)/);
  assert.match(
    entregasUpdate.sql,
    /estado_anterior\.codigo IN \('PROGRAMADA', 'ASIGNADA'\)/,
  );
  assert.doesNotMatch(
    entregasUpdate.sql.split("FROM")[0],
    /orden_secuencia|estado_erp|viaje_id|vehiculo_id/,
  );

  const eventos = database.queries.filter(({ sql }) =>
    sql.startsWith("INSERT INTO public.entrega_eventos"),
  );
  assert.deepEqual(
    eventos.map(({ params }) => params),
    [
      [101, 1, 3, "3"],
      [102, 2, 3, "3"],
    ],
  );
  for (const { sql } of eventos) {
    assert.match(sql, /'VIAJE_INICIADO'/);
    assert.match(sql, /'VEHICULO'/);
    assert.match(sql, /usuario_id, detalle, created_at/);
    assert.match(sql, /'Entrega puesta en reparto al iniciar el viaje'/);
  }
});

test("no crea eventos para entregas cuyo estado no cambió", async () => {
  const database = createStartDatabase({ entregasActualizadas: [] });
  const repository = new WepPwaRepository({ postgresPool: database.pool });

  const result = await repository.startPwaViaje(10, 3);

  assert.equal(result.entregasActualizadas, 0);
  assert.equal(
    database.queries.some(({ sql }) =>
      sql.startsWith("INSERT INTO public.entrega_eventos"),
    ),
    false,
  );
  assert.equal(database.queries.at(-2).sql, "COMMIT");
});

test("rechaza viaje inexistente, ya iniciado o finalizado sin actualizar", async () => {
  const cases = [
    {
      database: createStartDatabase({ viajeExiste: false }),
      error: WepPwaViajeNotFoundError,
      message: "Viaje no encontrado",
    },
    {
      database: createStartDatabase({ viajeEstado: "EN_REPARTO" }),
      error: WepPwaViajeStateConflictError,
      message: "El viaje ya se encuentra en reparto",
    },
    {
      database: createStartDatabase({ viajeEstado: "FINALIZADO" }),
      error: WepPwaViajeStateConflictError,
      message: "El viaje ya se encuentra finalizado",
    },
  ];

  for (const testCase of cases) {
    const repository = new WepPwaRepository({
      postgresPool: testCase.database.pool,
    });
    await assert.rejects(
      () => repository.startPwaViaje(10, 3),
      (error) =>
        error instanceof testCase.error && error.message === testCase.message,
    );
    assert.equal(
      testCase.database.queries.some(({ sql }) => sql.startsWith("UPDATE")),
      false,
    );
    assert.deepEqual(
      testCase.database.queries.slice(-2).map(({ sql }) => sql),
      ["ROLLBACK", "RELEASE"],
    );
  }
});

test("rechaza un viaje sin entregas antes de buscar estados o actualizar", async () => {
  const database = createStartDatabase({ tieneEntregas: false });
  const repository = new WepPwaRepository({ postgresPool: database.pool });

  await assert.rejects(
    () => repository.startPwaViaje(10, 3),
    (error) =>
      error instanceof WepPwaViajeWithoutDeliveriesError &&
      error.message === "El viaje no tiene entregas asignadas",
  );
  assert.equal(
    database.queries.some(({ sql }) =>
      sql.includes("FROM public.entrega_estados"),
    ),
    false,
  );
  assert.equal(
    database.queries.some(({ sql }) => sql.startsWith("UPDATE")),
    false,
  );
  assert.deepEqual(database.queries.slice(-2).map(({ sql }) => sql), [
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("hace rollback si falla la creación de un evento", async () => {
  const database = createStartDatabase({ failOnEvent: true });
  const repository = new WepPwaRepository({ postgresPool: database.pool });

  await assert.rejects(() => repository.startPwaViaje(10, 3), /falló evento/);
  assert.equal(
    database.queries.some(({ sql }) => sql === "COMMIT"),
    false,
  );
  assert.deepEqual(database.queries.slice(-2).map(({ sql }) => sql), [
    "ROLLBACK",
    "RELEASE",
  ]);
});

function createFinishDatabase({
  viajeEstado = "EN_REPARTO",
  viajeExiste = true,
  entregas = [
    { id: "101", estado: "ENTREGADA" },
    { id: "102", estado: "NO_ENTREGADA" },
    { id: "103", estado: "CANCELADA" },
  ],
  failOnUpdate = false,
} = {}) {
  const iniciadoAt = new Date("2026-09-12T12:00:00.000Z");
  const finalizadoAt = new Date("2026-09-12T16:30:00.000Z");
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });

      if (sql.includes("FROM public.viajes") && sql.includes("FOR UPDATE")) {
        return {
          rows: viajeExiste
            ? [
                {
                  id: 10,
                  estado: viajeEstado,
                  iniciado_at: iniciadoAt,
                  finalizado_at: null,
                },
              ]
            : [],
        };
      }
      if (sql.includes("FROM public.entregas e")) {
        return { rows: entregas };
      }
      if (sql.startsWith("UPDATE public.viajes")) {
        if (failOnUpdate) throw new Error("falló actualización");
        return {
          rows: [
            {
              id: 10,
              estado: "FINALIZADO",
              iniciado_at: iniciadoAt,
              finalizado_at: finalizadoAt,
            },
          ],
        };
      }
      return { rows: [] };
    },
    release() {
      queries.push({ sql: "RELEASE" });
    },
  };

  return {
    iniciadoAt,
    finalizadoAt,
    queries,
    pool: { connect: async () => client },
  };
}

test("finaliza un viaje con todas sus entregas terminales en una transacción", async () => {
  const database = createFinishDatabase();
  const repository = new WepPwaRepository({ postgresPool: database.pool });

  const result = await repository.finishPwaViaje(10, 3);

  assert.deepEqual(result, {
    viaje: {
      id: 10,
      estado: "FINALIZADO",
      iniciadoAt: database.iniciadoAt,
      finalizadoAt: database.finalizadoAt,
    },
    resumen: {
      totalEntregas: 3,
      entregadas: 1,
      noEntregadas: 1,
      canceladas: 1,
    },
  });
  assert.equal(database.queries[0].sql, "BEGIN");
  assert.match(database.queries[1].sql, /FOR UPDATE/);
  assert.equal(database.queries.at(-2).sql, "COMMIT");
  assert.equal(database.queries.at(-1).sql, "RELEASE");

  const entregasQuery = database.queries.find(({ sql }) =>
    sql.includes("FROM public.entregas e"),
  );
  assert.match(entregasQuery.sql, /LEFT JOIN public\.entrega_estados ee/);
  assert.match(entregasQuery.sql, /ee\.codigo AS estado/);

  const viajeUpdate = database.queries.find(({ sql }) =>
    sql.startsWith("UPDATE public.viajes"),
  );
  assert.match(viajeUpdate.sql, /estado = 'FINALIZADO'/);
  assert.match(viajeUpdate.sql, /finalizado_at = NOW\(\)/);
  assert.match(viajeUpdate.sql, /updated_at = NOW\(\)/);
  assert.match(viajeUpdate.sql, /AND estado = 'EN_REPARTO'/);
  assert.doesNotMatch(
    viajeUpdate.sql.split("WHERE")[0],
    /iniciado_at\s*=|vehiculo_id|fecha\s*=|numero_vuelta/,
  );
  assert.equal(
    database.queries.some(({ sql }) =>
      /^(UPDATE|INSERT INTO|DELETE FROM) public\.entregas/.test(sql),
    ),
    false,
  );
});

test("rechaza entregas no terminales y devuelve solo id y estado", async () => {
  const database = createFinishDatabase({
    entregas: [
      { id: "101", estado: "ENTREGADA" },
      { id: "102", estado: "EN_REPARTO" },
      { id: "103", estado: "CLIENTE_AVISADO" },
      { id: "104", estado: null },
    ],
  });
  const repository = new WepPwaRepository({ postgresPool: database.pool });

  await assert.rejects(
    () => repository.finishPwaViaje(10, 3),
    (error) => {
      assert.ok(error instanceof WepPwaViajePendingDeliveriesError);
      assert.equal(error.message, "El viaje todavía tiene entregas pendientes");
      assert.equal(error.pendientes, 3);
      assert.deepEqual(error.entregasPendientes, [
        { id: 102, estado: "EN_REPARTO" },
        { id: 103, estado: "CLIENTE_AVISADO" },
        { id: 104, estado: null },
      ]);
      return true;
    },
  );
  assert.equal(
    database.queries.some(({ sql }) => sql.startsWith("UPDATE")),
    false,
  );
  assert.deepEqual(database.queries.slice(-2).map(({ sql }) => sql), [
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("rechaza viaje inexistente, programado, finalizado o sin entregas", async () => {
  const cases = [
    {
      database: createFinishDatabase({ viajeExiste: false }),
      error: WepPwaViajeNotFoundError,
      message: "Viaje no encontrado",
    },
    {
      database: createFinishDatabase({ viajeEstado: "PROGRAMADO" }),
      error: WepPwaViajeStateConflictError,
      message: "El viaje todavía no fue iniciado",
    },
    {
      database: createFinishDatabase({ viajeEstado: "FINALIZADO" }),
      error: WepPwaViajeStateConflictError,
      message: "El viaje ya se encuentra finalizado",
    },
    {
      database: createFinishDatabase({ entregas: [] }),
      error: WepPwaViajeWithoutDeliveriesError,
      message: "El viaje no tiene entregas asignadas",
    },
  ];

  for (const testCase of cases) {
    const repository = new WepPwaRepository({
      postgresPool: testCase.database.pool,
    });
    await assert.rejects(
      () => repository.finishPwaViaje(10, 3),
      (error) =>
        error instanceof testCase.error && error.message === testCase.message,
    );
    assert.equal(
      testCase.database.queries.some(({ sql }) => sql.startsWith("UPDATE")),
      false,
    );
    assert.deepEqual(
      testCase.database.queries.slice(-2).map(({ sql }) => sql),
      ["ROLLBACK", "RELEASE"],
    );
  }
});

test("hace rollback si falla la actualización al finalizar", async () => {
  const database = createFinishDatabase({ failOnUpdate: true });
  const repository = new WepPwaRepository({ postgresPool: database.pool });

  await assert.rejects(
    () => repository.finishPwaViaje(10, 3),
    /falló actualización/,
  );
  assert.equal(
    database.queries.some(({ sql }) => sql === "COMMIT"),
    false,
  );
  assert.deepEqual(database.queries.slice(-2).map(({ sql }) => sql), [
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("dos finalizaciones concurrentes actualizan finalizado_at una sola vez", async () => {
  const iniciadoAt = new Date("2026-09-12T12:00:00.000Z");
  const finalizadoAt = new Date("2026-09-12T16:30:00.000Z");
  let estado = "EN_REPARTO";
  let lockOwner = null;
  let nextClientId = 0;
  let updateCount = 0;
  const waiters = [];

  function releaseLock(clientId) {
    if (lockOwner !== clientId) return;
    lockOwner = null;
    waiters.shift()?.();
  }

  const pool = {
    async connect() {
      const clientId = ++nextClientId;
      return {
        async query(sql) {
          if (sql.includes("FROM public.viajes") && sql.includes("FOR UPDATE")) {
            if (lockOwner !== null) {
              await new Promise((resolve) => waiters.push(resolve));
            }
            lockOwner = clientId;
            return {
              rows: [
                {
                  id: 10,
                  estado,
                  iniciado_at: iniciadoAt,
                  finalizado_at: estado === "FINALIZADO" ? finalizadoAt : null,
                },
              ],
            };
          }
          if (sql.includes("FROM public.entregas e")) {
            return { rows: [{ id: 101, estado: "ENTREGADA" }] };
          }
          if (sql.startsWith("UPDATE public.viajes")) {
            estado = "FINALIZADO";
            updateCount += 1;
            return {
              rows: [
                {
                  id: 10,
                  estado,
                  iniciado_at: iniciadoAt,
                  finalizado_at: finalizadoAt,
                },
              ],
            };
          }
          if (sql === "COMMIT" || sql === "ROLLBACK") {
            releaseLock(clientId);
          }
          return { rows: [] };
        },
        release() {
          releaseLock(clientId);
        },
      };
    },
  };
  const repository = new WepPwaRepository({ postgresPool: pool });

  const results = await Promise.allSettled([
    repository.finishPwaViaje(10, 3),
    repository.finishPwaViaje(10, 3),
  ]);

  assert.equal(
    results.filter(({ status }) => status === "fulfilled").length,
    1,
  );
  const rejected = results.find(({ status }) => status === "rejected");
  assert.ok(rejected.reason instanceof WepPwaViajeStateConflictError);
  assert.equal(rejected.reason.message, "El viaje ya se encuentra finalizado");
  assert.equal(updateCount, 1);
});

function createReorderDatabase({
  viajeExiste = true,
  idsDelViaje = [101, 102, 103],
  failOnEntregaId = null,
} = {}) {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });

      if (sql.startsWith("SELECT id FROM public.viajes")) {
        return { rows: viajeExiste ? [{ id: 10 }] : [] };
      }
      if (sql.startsWith("SELECT id FROM public.entregas")) {
        return { rows: idsDelViaje.map((id) => ({ id })) };
      }
      if (sql.startsWith("UPDATE public.entregas")) {
        if (params[1] === failOnEntregaId) {
          throw new Error("falló actualización");
        }
        return {
          rows: [{ id: params[1], orden_secuencia: params[0] }],
        };
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

const nuevoOrden = [
  { id: 103, orden: 1 },
  { id: 101, orden: 2 },
  { id: 102, orden: 3 },
];

test("reordena todas las entregas en una transacción y devuelve orden ascendente", async () => {
  const database = createReorderDatabase();
  const repository = new WepPwaRepository({ postgresPool: database.pool });

  const result = await repository.updatePwaViajeOrden(10, nuevoOrden, 3);

  assert.deepEqual(result, [
    { id: 103, ordenSecuencia: 1 },
    { id: 101, ordenSecuencia: 2 },
    { id: 102, ordenSecuencia: 3 },
  ]);
  assert.deepEqual(
    database.queries.map(({ sql }) => sql),
    [
      "BEGIN",
      "SELECT id FROM public.viajes WHERE id = $1 AND vehiculo_id = $2",
      "SELECT id FROM public.entregas WHERE viaje_id = $1 ORDER BY id",
      database.queries[3].sql,
      database.queries[4].sql,
      database.queries[5].sql,
      "COMMIT",
      "RELEASE",
    ],
  );

  const updates = database.queries.filter(({ sql }) =>
    sql.startsWith("UPDATE public.entregas"),
  );
  assert.deepEqual(
    updates.map(({ params }) => params),
    [
      [1, 103, 10],
      [2, 101, 10],
      [3, 102, 10],
    ],
  );
  for (const { sql } of updates) {
    assert.match(sql, /SET orden_secuencia = \$1,/);
    assert.match(sql, /updated_at = NOW\(\)/);
    assert.match(sql, /WHERE id = \$2\s+AND viaje_id = \$3/);
    const setClause = sql.split("WHERE")[0];
    assert.doesNotMatch(
      setClause,
      /estado_id\s*=|estado_erp\s*=|viaje_id\s*=|vehiculo_id\s*=/,
    );
  }
});

test("hace rollback si falla una actualización y no deja orden parcial", async () => {
  const database = createReorderDatabase({ failOnEntregaId: 101 });
  const repository = new WepPwaRepository({ postgresPool: database.pool });

  await assert.rejects(
    () => repository.updatePwaViajeOrden(10, nuevoOrden, 3),
    /falló actualización/,
  );
  assert.equal(
    database.queries.some(({ sql }) => sql === "COMMIT"),
    false,
  );
  assert.deepEqual(database.queries.slice(-2).map(({ sql }) => sql), [
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("rechaza un viaje inexistente antes de consultar o actualizar entregas", async () => {
  const database = createReorderDatabase({ viajeExiste: false });
  const repository = new WepPwaRepository({ postgresPool: database.pool });

  await assert.rejects(
    () => repository.updatePwaViajeOrden(999999, nuevoOrden, 3),
    WepPwaViajeNotFoundError,
  );
  assert.equal(
    database.queries.some(({ sql }) => sql.includes("UPDATE public.entregas")),
    false,
  );
  assert.deepEqual(database.queries.slice(-2).map(({ sql }) => sql), [
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("rechaza entregas ajenas y hace rollback sin actualizar", async () => {
  const database = createReorderDatabase();
  const repository = new WepPwaRepository({ postgresPool: database.pool });

  await assert.rejects(
    () =>
      repository.updatePwaViajeOrden(10, [
        { id: 103, orden: 1 },
        { id: 101, orden: 2 },
        { id: 999, orden: 3 },
      ], 3),
    WepPwaEntregaMismatchError,
  );
  assert.equal(
    database.queries.some(({ sql }) => sql.includes("UPDATE public.entregas")),
    false,
  );
  assert.equal(database.queries.at(-2).sql, "ROLLBACK");
});

test("exige el conjunto completo y hace rollback sin actualizar", async () => {
  const database = createReorderDatabase();
  const repository = new WepPwaRepository({ postgresPool: database.pool });

  await assert.rejects(
    () =>
      repository.updatePwaViajeOrden(10, [
        { id: 103, orden: 1 },
        { id: 101, orden: 2 },
      ], 3),
    WepPwaOrdenIncompletoError,
  );
  assert.equal(
    database.queries.some(({ sql }) => sql.includes("UPDATE public.entregas")),
    false,
  );
  assert.equal(database.queries.at(-2).sql, "ROLLBACK");
});
