import assert from "node:assert/strict";
import test from "node:test";
import { buildWepSyncSchedule, wepSyncWindow, WepSyncScheduler } from "./wep-sync-scheduler.js";

const logger = { info() {}, error() {} };
function fixture(env = { WEP_SYNC_ENABLED: "true" }, synchronize = async () => ({})) {
  const calls = [];
  const task = { start() { calls.push("start"); }, stop() { calls.push("stop"); }, destroy() { calls.push("destroy"); } };
  const scheduler = new WepSyncScheduler({ env, logger, service: { synchronize },
    now: () => new Date("2026-10-28T02:30:00Z"),
    scheduler: { createTask(expression, callback, options) { calls.push({ expression, callback, options }); return task; } },
  });
  return { scheduler, calls };
}

test("configuración desactivada por defecto y validación estricta", () => {
  assert.equal(buildWepSyncSchedule({}).enabled, false);
  for (const env of [{ WEP_SYNC_ENABLED: "yes" }, { WEP_SYNC_CRON: "bad" }, { WEP_SYNC_DAYS_BACK: "-1" }, { WEP_SYNC_DAYS_AHEAD: "1.5" }, { WEP_SYNC_DAYS_AHEAD: "91" }]) {
    assert.throws(() => buildWepSyncSchedule(env));
  }
});

test("ventana usa fecha argentina y cruza mes y año correctamente", () => {
  const config = buildWepSyncSchedule({ WEP_SYNC_DAYS_BACK: "1", WEP_SYNC_DAYS_AHEAD: "7" });
  assert.deepEqual(wepSyncWindow(new Date("2027-01-01T02:30:00Z"), config), {
    fechaDesde: "2026-12-30", fechaHasta: "2027-01-07", vehiculo: null, vuelta: null,
  });
});

test("no programa ni importa estando desactivado o en instancia secundaria", async () => {
  for (const env of [{}, { WEP_SYNC_ENABLED: "true", NODE_APP_INSTANCE: "1" }]) {
    const f = fixture(env, () => assert.fail("no debe sincronizar"));
    f.scheduler.start();
    await f.scheduler.execute();
    assert.deepEqual(f.calls, []);
  }
});

test("inicia una sola tarea, sin importar al arrancar, y permite detenerla", async () => {
  const windows = [];
  const f = fixture(undefined, async (window) => { windows.push(window); return {}; });
  f.scheduler.start();
  f.scheduler.start();
  assert.equal(f.calls.length, 2);
  assert.equal(windows.length, 0);
  assert.equal(f.calls[0].expression, "*/5 * * * *");
  assert.equal(f.calls[0].options.noOverlap, true);
  await f.calls[0].callback();
  assert.equal(windows[0].fechaDesde, "2026-10-27");
  assert.equal(windows[0].fechaHasta, "2026-11-03");
  f.scheduler.stop();
  await f.scheduler.execute();
  assert.equal(windows.length, 1);
  assert.deepEqual(f.calls.slice(-2), ["stop", "destroy"]);
});

test("omite solapamientos y se recupera tras un fallo sin promesas rechazadas", async () => {
  let finish;
  let count = 0;
  const f = fixture(undefined, async () => {
    count++;
    if (count === 1) await new Promise((resolve) => { finish = resolve; });
    throw new Error("fuente caída");
  });
  f.scheduler.start();
  const pending = f.scheduler.execute();
  await f.scheduler.execute();
  assert.equal(count, 1);
  finish();
  await pending;
  await f.scheduler.execute();
  assert.equal(count, 2);
  assert.equal(f.scheduler.running, false);
  f.scheduler.stop();
});
