import assert from "node:assert/strict";
import test from "node:test";
import { buildWepProgrammedSchedule, WepProgrammedScheduler } from "./wep-programmed-scheduler.js";

function fixture({ env = {}, synchronize = async () => ({ ok: true }), process = async () => ({ resumen: {} }), now = "2026-10-29T09:00:00Z" } = {}) {
  const events = [];
  let instant = new Date(now);
  const task = { start() {}, stop() {}, destroy() {} };
  const scheduler = new WepProgrammedScheduler({
    env: { WEP_PROGRAMMED_ENABLED: "true", ...env },
    now: () => instant, logger: { info() {}, error() { events.push("error"); } },
    scheduler: { createTask(expression, callback, options) { events.push({ expression, callback, options }); return task; } },
    syncService: { async synchronize(input) { events.push({ sync: input }); return synchronize(input); } },
    notificationsService: { async processProgrammedDeliveryNotifications(input) { events.push({ process: input }); return process(input); } },
  });
  return { scheduler, events, setTime(value) { instant = new Date(value); } };
}

test("desactivado por defecto, simulación por defecto y configuración estricta", () => {
  const config = buildWepProgrammedSchedule({});
  assert.equal(config.enabled, false);
  assert.equal(config.dryRun, true);
  for (const env of [{ WEP_PROGRAMMED_ENABLED: "yes" }, { WEP_PROGRAMMED_DRY_RUN: "0" }, { WEP_PROGRAMMED_CRON: "bad" }, { WEP_PROGRAMMED_START: "24:00" }, { WEP_PROGRAMMED_START: "21:00" }]) {
    assert.throws(() => buildWepProgrammedSchedule(env));
  }
});

test("no ejecuta desactivado ni en instancias secundarias", async () => {
  for (const env of [{ WEP_PROGRAMMED_ENABLED: "false" }, { NODE_APP_INSTANCE: "1" }]) {
    const f = fixture({ env });
    f.scheduler.start();
    await f.scheduler.execute();
    assert.deepEqual(f.events, []);
  }
});

test("sincroniza antes de procesar HOY en Argentina; no envía al arrancar", async () => {
  const f = fixture({ env: { WEP_PROGRAMMED_DRY_RUN: "false" } });
  f.scheduler.start();
  f.scheduler.start();
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].options.noOverlap, true);
  assert.equal(f.events[0].options.timezone, "America/Argentina/Buenos_Aires");
  await f.events[0].callback();
  assert.deepEqual(f.events[1], { sync: { fechaDesde: "2026-10-29", fechaHasta: "2026-10-29", vehiculo: null, vuelta: null } });
  assert.deepEqual(f.events[2], { process: { fecha: "2026-10-29", dryRun: false } });
  f.scheduler.stop();
  await f.scheduler.execute();
  assert.equal(f.events.length, 3);
});

test("respeta ventana local 06:00 incluida y 21:00 excluida", async () => {
  const f = fixture();
  f.scheduler.start();
  for (const time of ["2026-10-29T08:59:00Z", "2026-10-30T00:00:00Z", "2026-10-30T02:59:00Z"]) {
    f.setTime(time);
    await f.scheduler.execute();
  }
  assert.equal(f.events.length, 1);
  f.setTime("2026-10-30T09:00:00Z");
  await f.scheduler.execute();
  assert.deepEqual(f.events[2], { process: { fecha: "2026-10-30", dryRun: true } });
});

test("no procesa datos anteriores si la sincronización falla o está ocupada", async () => {
  for (const synchronize of [async () => ({ ok: true, skipped: "SYNC_IN_PROGRESS" }), async () => ({ ok: false }), async () => { throw new Error("sin conexión"); }]) {
    const f = fixture({ synchronize, process: () => assert.fail("no procesar") });
    f.scheduler.start();
    await f.scheduler.execute();
    assert.equal(f.scheduler.running, false);
  }
});

test("omite solapamientos y vuelve a ejecutar después de un fallo", async () => {
  let finish;
  let calls = 0;
  const f = fixture({ synchronize: async () => {
    calls++;
    if (calls === 1) await new Promise(resolve => { finish = resolve; });
    throw new Error("fallo");
  } });
  f.scheduler.start();
  const pending = f.scheduler.execute();
  await f.scheduler.execute();
  assert.equal(calls, 1);
  finish();
  await pending;
  await f.scheduler.execute();
  assert.equal(calls, 2);
  assert.equal(f.scheduler.running, false);
});
