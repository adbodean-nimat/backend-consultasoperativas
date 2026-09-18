import assert from "node:assert/strict";
import test from "node:test";
import {
  WepClientNoticeRepository,
  WepPwaEntregaNoticeConflictError,
  WepPwaEntregaPhoneConflictError,
  WepPwaEntregaStateConflictError,
} from "./wep-client-notice.repository.js";

function deliveryRow(overrides = {}) {
  return {
    entrega_id: "101",
    estado_id: 3,
    estado_codigo: "EN_REPARTO",
    estado_nombre: "En reparto",
    cliente_nombre: "Cliente ejemplo",
    telefono: "+54 9 345 000-0000",
    telefono_alternativo: "3451111111",
    domicilio: "San Lorenzo 1234",
    orden_preparacion_division: "01",
    orden_preparacion_tipo: "OP",
    orden_preparacion_numero: "12345",
    viaje_id: "10",
    numero_vuelta: 1,
    vehiculo_id: "3",
    vehiculo_nombre: "M BENZ",
    patente: "AB172IK",
    ...overrides,
  };
}

function createReserveDatabase({
  entrega = deliveryRow(),
  existing = false,
  inserted = true,
} = {}) {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes("FROM public.entregas e")) {
        return { rows: entrega ? [entrega] : [] };
      }
      if (sql.includes("FROM public.notificaciones")) {
        return { rows: existing ? [{ id: 40 }] : [] };
      }
      if (sql.startsWith("INSERT INTO public.notificaciones")) {
        return { rows: inserted ? [{ id: "40" }] : [] };
      }
      return { rows: [] };
    },
    release() {
      queries.push({ sql: "RELEASE" });
    },
  };

  return { queries, pool: { connect: async () => client } };
}

test("reserva el aviso pendiente con lock, teléfono normalizado y protección única", async () => {
  const database = createReserveDatabase();
  const repository = new WepClientNoticeRepository({
    postgresPool: database.pool,
  });

  const result = await repository.reserveNotice(101, 3, "wep_en_camino");

  assert.equal(result.notificationId, 40);
  assert.equal(result.telefonoDestino, "5493450000000");
  assert.equal(result.entrega.clienteNombre, "Cliente ejemplo");
  assert.deepEqual(
    database.queries.map(({ sql }) => sql),
    [
      "BEGIN",
      database.queries[1].sql,
      database.queries[2].sql,
      database.queries[3].sql,
      "COMMIT",
      "RELEASE",
    ],
  );
  assert.match(database.queries[1].sql, /FOR UPDATE OF e/);
  assert.match(database.queries[1].sql, /LEFT JOIN public\.viajes/);
  assert.match(database.queries[1].sql, /LEFT JOIN public\.vehiculos/);
  assert.match(database.queries[3].sql, /estado, created_at/);
  assert.match(database.queries[3].sql, /'PENDIENTE'/);
  assert.match(
    database.queries[3].sql,
    /ON CONFLICT \(entrega_id, tipo\) DO NOTHING/,
  );
  assert.deepEqual(database.queries[3].params, [
    101,
    "EN_CAMINO",
    "5493450000000",
    "wep_en_camino",
  ]);
});

test("usa el teléfono alternativo cuando el principal no contiene dígitos", async () => {
  const database = createReserveDatabase({
    entrega: deliveryRow({ telefono: "sin número" }),
  });
  const repository = new WepClientNoticeRepository({
    postgresPool: database.pool,
  });

  const result = await repository.reserveNotice(101, 3);

  assert.equal(result.telefonoDestino, "3451111111");
});

test("rechaza estados no permitidos sin crear una notificación", async () => {
  for (const estadoCodigo of [
    "PROGRAMADA",
    "ASIGNADA",
    "ENTREGADA",
    "NO_ENTREGADA",
    "CANCELADA",
  ]) {
    const database = createReserveDatabase({
      entrega: deliveryRow({ estado_codigo: estadoCodigo }),
    });
    const repository = new WepClientNoticeRepository({
      postgresPool: database.pool,
    });

    await assert.rejects(
      () => repository.reserveNotice(101, 3),
      (error) =>
        error instanceof WepPwaEntregaStateConflictError &&
        error.message ===
          "La entrega no admite este aviso en su estado actual",
    );
    assert.equal(
      database.queries.some(({ sql }) =>
        sql.startsWith("INSERT INTO public.notificaciones"),
      ),
      false,
    );
    assert.equal(
      database.queries.some(({ sql }) => sql === "ROLLBACK"),
      true,
    );
  }
});

test("devuelve el conflicto específico cuando el cliente ya fue avisado", async () => {
  const database = createReserveDatabase({
    entrega: deliveryRow({ estado_codigo: "CLIENTE_AVISADO" }),
  });
  const repository = new WepClientNoticeRepository({
    postgresPool: database.pool,
  });

  await assert.rejects(
    () => repository.reserveNotice(101, 3),
    (error) =>
      error instanceof WepPwaEntregaStateConflictError &&
      error.message === "El cliente ya fue avisado",
  );
});

test("rechaza una entrega sin teléfono válido", async () => {
  const database = createReserveDatabase({
    entrega: deliveryRow({
      telefono: null,
      telefono_alternativo: "sin número",
    }),
  });
  const repository = new WepClientNoticeRepository({
    postgresPool: database.pool,
  });

  await assert.rejects(
    () => repository.reserveNotice(101, 3),
    WepPwaEntregaPhoneConflictError,
  );
});

test("el índice único convierte una reserva simultánea en conflicto", async () => {
  const database = createReserveDatabase({ inserted: false });
  const repository = new WepClientNoticeRepository({
    postgresPool: database.pool,
  });

  await assert.rejects(
    () => repository.reserveNotice(101, 3),
    WepPwaEntregaNoticeConflictError,
  );
});

test("confirma notificación, estado y evento en una sola transacción", async () => {
  const sentAt = new Date("2026-09-12T15:00:00.000Z");
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes("FROM public.entregas e")) {
        return {
          rows: [{ id: 101, estado_id: 3, estado_codigo: "EN_REPARTO" }],
        };
      }
      if (
        sql.includes("FROM public.entrega_estados") &&
        sql.includes("CLIENTE_AVISADO")
      ) {
        return {
          rows: [
            { id: 4, codigo: "CLIENTE_AVISADO", nombre: "Cliente avisado" },
          ],
        };
      }
      if (sql.startsWith("UPDATE public.notificaciones")) {
        return { rows: [{ enviado_at: sentAt }] };
      }
      if (sql.startsWith("UPDATE public.entregas")) {
        return { rows: [{ id: 101 }] };
      }
      return { rows: [] };
    },
    release() {
      queries.push({ sql: "RELEASE" });
    },
  };
  const repository = new WepClientNoticeRepository({
    postgresPool: { connect: async () => client },
  });

  const result = await repository.confirmNotice({
    entregaId: 101,
    vehiculoId: 3,
    notificationId: 40,
    messageId: "wamid.123",
    templateName: "wep_en_camino",
  });

  assert.deepEqual(result, {
    entrega: {
      id: 101,
      estado: { codigo: "CLIENTE_AVISADO", nombre: "Cliente avisado" },
    },
    notificacion: {
      tipo: "EN_CAMINO",
      canal: "WHATSAPP",
      estado: "ENVIADO",
      enviadoAt: sentAt,
    },
  });
  const notificationUpdate = queries.find(({ sql }) =>
    sql.startsWith("UPDATE public.notificaciones"),
  );
  assert.match(notificationUpdate.sql, /estado = 'ENVIADO'/);
  assert.deepEqual(notificationUpdate.params, [
    "wep_en_camino",
    "wamid.123",
    40,
    101,
    "EN_CAMINO",
  ]);
  const deliveryUpdate = queries.find(({ sql }) =>
    sql.startsWith("UPDATE public.entregas"),
  );
  assert.deepEqual(deliveryUpdate.params, [4, 101, 3, 3]);
  const eventInsert = queries.find(({ sql }) =>
    sql.startsWith("INSERT INTO public.entrega_eventos"),
  );
  assert.match(eventInsert.sql, /'CLIENTE_AVISADO'/);
  assert.match(eventInsert.sql, /'VEHICULO', \$4/);
  assert.deepEqual(eventInsert.params, [101, 3, 4, "3"]);
  assert.match(
    eventInsert.sql,
    /'Cliente avisado por WhatsApp: entrega en camino'/,
  );
  assert.equal(queries.some(({ sql }) => sql === "COMMIT"), true);
});

test("registra un envío fallido sin actualizar la entrega", async () => {
  let received;
  const repository = new WepClientNoticeRepository({
    postgresPool: {
      async query(sql, params) {
        received = { sql, params };
        return { rows: [] };
      },
    },
  });

  await repository.failNotice({
    notificationId: 40,
    errorCode: "WHATSAPP_HTTP_500",
    errorDetail: "Meta no pudo procesar el mensaje",
  });

  assert.match(received.sql, /UPDATE public\.notificaciones/);
  assert.match(received.sql, /estado = 'ERROR'/);
  assert.doesNotMatch(received.sql, /UPDATE public\.entregas/);
  assert.deepEqual(received.params, [
    "WHATSAPP_HTTP_500",
    "Meta no pudo procesar el mensaje",
    40,
  ]);
});
