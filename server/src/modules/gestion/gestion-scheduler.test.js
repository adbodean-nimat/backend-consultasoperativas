import assert from "node:assert/strict";
import test from "node:test";
import { validateConfiguration } from "./gestion-auth.validator.js";
import { synchronizeAutomaticosScheduled } from "./gestion.service.js";
import {
  dateInTimezone,
  GestionScheduler,
  isGestionSchedulerProcess,
} from "./gestion-scheduler.js";

test("configuración predeterminada acepta viernes 10:30 y rechaza cron/timezone inválidos", () => {
  const value = {
    activo: true,
    cron: "30 10 * * 5",
    timezone: "America/Argentina/Buenos_Aires",
  };
  assert.deepEqual(
    validateConfiguration("gestion_sincronizacion_automatica", { valor: value }),
    value,
  );
  assert.throws(() => validateConfiguration("gestion_sincronizacion_automatica", {
    valor: { ...value, cron: "cron inválido" },
  }));
  assert.throws(() => validateConfiguration("gestion_sincronizacion_automatica", {
    valor: { ...value, timezone: "Zona/Inexistente" },
  }));
});

test("sólo la instancia primaria de PM2 programa Gestión", () => {
  assert.equal(isGestionSchedulerProcess({ NODE_APP_INSTANCE: "0" }), true);
  assert.equal(isGestionSchedulerProcess({ NODE_APP_INSTANCE: "1" }), false);
  assert.equal(isGestionSchedulerProcess({}), true);
});

test("fecha de ejecución se obtiene en la zona configurada", () => {
  assert.equal(
    dateInTimezone(new Date("2026-08-29T01:30:00.000Z"), "America/Argentina/Buenos_Aires"),
    "2026-08-28",
  );
});

test("scheduler carga cron, toma advisory lock y sincroniza una sola vez", async () => {
  const events = [];
  const task = {
    start: () => events.push("START"),
    stop: () => events.push("STOP"),
    destroy: () => events.push("DESTROY"),
    getNextRun: () => new Date("2026-08-28T13:30:00.000Z"),
  };
  const client = {
    query: async (sql, values) => {
      events.push({ sql, values });
      return /pg_try_advisory_lock/.test(sql)
        ? { rows: [{ adquirido: true }] }
        : { rows: [{ pg_advisory_unlock: true }] };
    },
    release: () => events.push("RELEASE"),
  };
  const scheduler = new GestionScheduler({
    configLoader: async () => ({
      activo: true,
      cron: "30 10 * * 5",
      timezone: "America/Argentina/Buenos_Aires",
      updatedAt: "1",
    }),
    cronLibrary: {
      createTask(expression, callback, options) {
        events.push({ expression, callback, options });
        return task;
      },
    },
    pool: { connect: async () => client },
    sync: async (fecha, options) => {
      events.push({ fecha, options });
      return { fecha };
    },
    now: () => new Date("2026-08-28T13:30:00.000Z"),
  });
  await scheduler.refresh();
  const result = await scheduler.execute();
  assert.equal(events[0].expression, "30 10 * * 5");
  assert.equal(events[0].options.timezone, "America/Argentina/Buenos_Aires");
  assert.equal(result.fecha, "2026-08-28");
  assert.equal(events.some((item) => item?.fecha === "2026-08-28"), true);
  assert.equal(events.filter((item) => item === "RELEASE").length, 1);
  scheduler.stop();
});

test("sincronización automática conserva estado/manuales y guarda sólo Plataforma", async () => {
  const events = [];
  const savedValues = [];
  const client = {
    query: async (sql) => {
      events.push(sql);
      return { rows: [], rowCount: 0 };
    },
    release: () => events.push("RELEASE"),
  };
  let headerArguments;
  const result = await synchronizeAutomaticosScheduled("2026-08-28", {
    dependencies: {
      getAutomaticos: async () => ({
        fecha: "2026-08-28",
        semana: "28/08 a 03/09",
        caja: 100,
        otrosOpv: 25,
        sincronizadoEn: "2026-08-28T13:30:00.000Z",
      }),
      pool: { connect: async () => client },
      findHeaderByFecha: async () => ({
        id: 9,
        fecha_corte: "2026-08-28",
        periodo_etiqueta: "Semana existente",
        estado: "GUARDADO",
        observacion: "Conservar manuales",
        usuario_carga: "usuario-original",
      }),
      resolveFunctionContract: async (_client, name) => ({ name }),
      executeFunction: async (_client, contract, args) => {
        if (contract.name === "fn_upsert_registro") {
          headerArguments = args;
          return { rows: [{ registro_id: 9 }] };
        }
        savedValues.push(args);
        return { rows: [{}] };
      },
      extractRegistroId: () => 9,
      findByFecha: async () => ({
        registro_id: 9,
        fecha_corte: "2026-08-28",
        periodo_etiqueta: "Semana existente",
        estado: "GUARDADO",
        caja: 100,
        opv_otros: 25,
        observacion: "Conservar manuales",
      }),
    },
  });
  assert.equal(headerArguments.estado, "GUARDADO");
  assert.equal(headerArguments.observacion, "Conservar manuales");
  assert.equal(headerArguments.usuario_carga, "usuario-original");
  assert.deepEqual(savedValues.map((item) => item.codigo_indicador), ["caja", "opv_otros"]);
  assert.equal(savedValues.every((item) => item.fuente_registro === "PLATAFORMA"), true);
  assert.equal(result.estado, "GUARDADO");
  assert.deepEqual(events, ["BEGIN", "COMMIT", "RELEASE"]);
});

test("sincronización automática revierte completa si falla un indicador", async () => {
  const events = [];
  const client = {
    query: async (sql) => { events.push(sql); return { rows: [], rowCount: 0 }; },
    release: () => events.push("RELEASE"),
  };
  await assert.rejects(synchronizeAutomaticosScheduled("2026-08-28", {
    dependencies: {
      getAutomaticos: async () => ({ caja: 100, sincronizadoEn: "2026-08-28T13:30:00.000Z" }),
      pool: { connect: async () => client },
      findHeaderByFecha: async () => null,
      resolveFunctionContract: async (_client, name) => ({ name }),
      executeFunction: async (_client, contract) => {
        if (contract.name === "fn_upsert_registro") return { rows: [{ registro_id: 10 }] };
        throw new Error("fallo simulado");
      },
      extractRegistroId: () => 10,
      findByFecha: async () => null,
    },
  }));
  assert.deepEqual(events, ["BEGIN", "ROLLBACK", "RELEASE"]);
});
