// Opt-in. Requiere un clon SOLO DEL ESQUEMA WEP y una base vacía dedicada.
// No carga api.js, cron ni .env intencionalmente. No es una prueba del ERP real.
import assert from 'node:assert/strict';
import pg from 'pg';

if (!process.argv.includes('--run-on-disposable-testing-db')) {
  console.log('Sin ejecutar. Ver src/modules/wep/SYNC-TRACKING-TESTING.md.');
  process.exit(0);
}
const url = new URL(process.env.WEP_TRACKING_TEST_DATABASE_URL || 'invalid:');
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'Falta URL PostgreSQL explícita');
assert.equal(url.pathname, '/wep_tracking_integration_test', 'Base dedicada obligatoria');
// Impedir que imports transitivos usen las conexiones del .env local.
Object.assign(process.env, {
  WEP_SETTINGS_ENABLED: 'false', WEP_IMPORTS_BLOCKED: 'false',
  WEP_WHATSAPP_TEST_MODE: 'false', WEP_SYNC_ENABLED: 'false', WEP_PROGRAMMED_ENABLED: 'false',
  WEP_TRACKING_LOOKUP_RATE_LIMIT_MAX: '5', WEP_TRACKING_LOOKUP_RATE_LIMIT_WINDOW_MINUTES: '10',
  WEP_PG_HOST: url.hostname, WEP_PG_PORT: url.port || '5432',
  WEP_PG_DATABASE: 'wep_tracking_integration_test',
  WEP_PG_USER: decodeURIComponent(url.username), WEP_PG_PASSWORD: decodeURIComponent(url.password),
});
const pool = new pg.Pool({ connectionString: url.href, connectionTimeoutMillis: 5000,
  application_name: 'wep-sync-tracking-integration', options: '-c statement_timeout=10000' });
let server;
try {
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,
    'wep_tracking_integration_test');
  for (const table of ['vehiculos', 'viajes', 'entregas', 'tracking_tokens']) {
    // Nombres internos constantes, nunca entrada del usuario.
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n,
      0, `La tabla ${table} debe estar vacía. No se modifica una base con datos existentes.`);
  }
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.entrega_estados WHERE codigo = 'PROGRAMADA'")).rows[0].n, 1);
  const { WepSyncService } = await import('../src/modules/wep/wep-sync.service.js');
  const { WepSyncTrackingService } = await import('../src/modules/wep/wep-sync-tracking.service.js');
  const { WepTrackingRepository } = await import('../src/modules/wep/wep-tracking.repository.js');
  const { WepTrackingService } = await import('../src/modules/wep/wep-tracking.service.js');
  const { WepTrackingLookupRepository, WepTrackingLookupService } = await import('../src/modules/wep/wep-tracking-lookup.service.js');
  const { createWepRouter } = await import('../src/modules/wep/wep.routes.js');
  const { default: express } = await import('express');
  const { randomBytes } = await import('node:crypto');
  const logger = { info() {}, warn() {}, error() {} };
  const fecha = (await pool.query("SELECT (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS fecha")).rows[0].fecha;
  const expiration = new Date(`${fecha}T23:59:59.999-03:00`);
  expiration.setUTCDate(expiration.getUTCDate() + 2);
  const base = {
    DivisionOrdenPreparacion: '01', TipoOrdenPreparacion: 'OP',
    DivisionNotaPedido: '01', TipoNotaPedido: 'NPC', CodigoCliente: 'QA_TRACKING',
    NombreCliente: 'Cliente sintético QA', DomicilioEntrega: ' QA  123 ', Localidad: 'Concordia',
    TelefonoDomicilio: '+54 9 345 433-3569', TelefonoCliente: null,
    FechaEntrega: fecha, SalidaVehiculo: fecha, Vuelta: 1,
    CodigoVehiculo: '101', NombreVehiculo: 'QA sintético', PatenteVehiculo: 'QA123QA',
  };
  let rows = [
    { ...base, NumeroOrdenPreparacion: 990001, NumeroNotaPedido: 990001 },
    { ...base, NumeroOrdenPreparacion: 990002, NumeroNotaPedido: 990002, DomicilioEntrega: 'QA 123' },
    // Misma parada, sin teléfono propio: no puede heredar el de otra NP.
    { ...base, NumeroOrdenPreparacion: 990003, NumeroNotaPedido: 990003, TelefonoDomicilio: 'inválido' },
    { ...base, NumeroOrdenPreparacion: 990004, NumeroNotaPedido: 990004, Localidad: 'Otra localidad',
      TelefonoDomicilio: 'inválido', TelefonoCliente: '3454331234' },
  ];
  const sync = new WepSyncService({ postgresPool: pool, logger,
    settings: { async runtime() { return { config: { sync: { blocked: false, vehicleCodes: ['101'] } } }; } },
    sourceRepository: { async getEntregasProgramadas() { return rows; } },
    syncTrackingService: new WepSyncTrackingService({ expirationDays: 2 }),
  });
  const trackingService = new WepTrackingService({ repository: new WepTrackingRepository({ postgresPool: pool }),
    vehiclePositionService: { async getCurrentPositionByPlate() { assert.fail('No debe llamar GESTYA'); } }, logger });
  const lookupService = new WepTrackingLookupService({ repository: new WepTrackingLookupRepository({ postgresPool: pool }) });
  const app = express();
  const technicalToken = randomBytes(24).toString('hex');
  app.use(express.json());
  app.use('/api/wep', createWepRouter({ syncService: sync, lookupService, trackingService, lookupLogger: logger,
    // Sólo el servidor efímero loopback de esta prueba; no modifica la autenticación de la API.
    technicalAuth(req, res, next) { return req.headers.authorization === `Bearer ${technicalToken}` ? next() : res.sendStatus(401); },
  }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const origin = `http://127.0.0.1:${server.address().port}/api/wep`;
  async function request(path, body, technical = false) {
    const response = await fetch(`${origin}${path}`, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(technical ? { Authorization: `Bearer ${technicalToken}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    return { status: response.status, body: await response.json() };
  }
  const snapshot = async () => (await pool.query('SELECT public_id, expira_at FROM public.tracking_tokens ORDER BY id')).rows;
  const synchronize = () => request('/sync/entregas-programadas', { fechaDesde: fecha, fechaHasta: fecha }, true);
  const first = await synchronize();
  assert.equal(first.status, 200);
  assert.equal(first.body.tracking.disponibles, 2);
  const tokens = await snapshot();
  assert.equal(tokens.length, 2);
  for (const token of tokens) assert.equal(token.expira_at.toISOString(), expiration.toISOString());
  for (let i = 0; i < 2; i++) {
    const again = await synchronize();
    assert.equal(again.status, 200);
    assert.equal(again.body.entregas.insertadas, 0);
    assert.equal(again.body.entregas.actualizadas, 4);
    assert.deepEqual(await snapshot(), tokens, 'No debe rotar tokens ni prolongar vigencia');
  }
  const lookup = (pedido, telefonoUltimos4) => request('/public/tracking/lookup', { pedido, telefonoUltimos4 });
  // Cinco intentos exactos: no se desactiva ni evade el limitador real.
  const a = await lookup('990001', '3569');
  const b = await lookup('990002', '3569');
  const c = await lookup('990003', '3569');
  const d = await lookup('990004', '1234');
  const wrong = await lookup('990001', '9999');
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(a.body.publicId, b.body.publicId);
  assert.equal(c.status, 404); assert.equal(wrong.status, 404);
  assert.equal(d.status, 200); assert.notEqual(d.body.publicId, a.body.publicId);
  const direct = await request(`/public/tracking/${a.body.publicId}`);
  assert.equal(direct.status, 200);
  assert.equal(direct.body.tracking.estado.codigo, 'PROGRAMADA');
  assert.equal(direct.body.tracking.viaje.enCurso, false);
  assert.equal(direct.body.tracking.vehiculo.posicionDisponible, false);
  const trip = (await pool.query('SELECT estado, iniciado_at FROM public.viajes')).rows;
  assert.equal(trip.length, 1); assert.equal(trip[0].estado, 'PROGRAMADO'); assert.equal(trip[0].iniciado_at, null);
  // Concurrencia PostgreSQL real sobre la misma parada: mismo token, sin duplicado.
  const stop = (await pool.query('SELECT * FROM public.tracking_tokens ORDER BY id LIMIT 1')).rows[0];
  const args = { viajeId: stop.viaje_id, clienteCodigo: stop.cliente_codigo,
    domicilioNormalizado: stop.domicilio_normalizado, localidadNormalizada: stop.localidad_normalizada,
    entregaId: stop.entrega_id, expiraAt: expiration };
  const repository = new WepTrackingRepository({ postgresPool: pool });
  const concurrent = await Promise.all(Array.from({ length: 2 }, () => repository.getOrCreateActiveStopTracking({
    ...args, publicId: randomBytes(24).toString('base64url'),
  })));
  assert.ok(concurrent.every(item => item.public_id === stop.public_id));
  assert.deepEqual(await snapshot(), tokens);
  // Rollback real: fallo después de insertar una entrega y su token nuevos.
  rows = [{ ...base, NumeroOrdenPreparacion: 990005, NumeroNotaPedido: 990005, DomicilioEntrega: 'QA rollback 456' }];
  const original = sync.syncTrackingService;
  sync.syncTrackingService = { async ensureForTrips(client, ids) {
    await original.ensureForTrips(client, ids); throw new Error('Fallo intencional QA');
  } };
  assert.equal((await synchronize()).status, 500);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.entregas')).rows[0].n, 4);
  assert.deepEqual(await snapshot(), tokens);
  // Vencimiento e inactividad reales; el servicio de lookup no depende de la cuota HTTP.
  await pool.query('UPDATE public.tracking_tokens SET expira_at = NOW() - interval \'1 second\' WHERE public_id = $1', [a.body.publicId]);
  assert.equal(await lookupService.lookup({ pedido: '990001', telefonoUltimos4: '3569' }), null);
  assert.equal((await request(`/public/tracking/${a.body.publicId}`)).status, 404);
  await pool.query('UPDATE public.tracking_tokens SET activo = FALSE WHERE public_id = $1', [d.body.publicId]);
  assert.equal(await lookupService.lookup({ pedido: '990004', telefonoUltimos4: '1234' }), null);
  console.log('OK: PostgreSQL + sync HTTP con fuente ERP sintética + lookup público + tracking PROGRAMADA.');
  console.log('Datos sintéticos conservados. Falta ejecutar el tramo ERP real + navegador del procedimiento.');
} catch (error) {
  // Evitar imprimir credenciales de conexión, tokens o detalles de filas.
  console.error(`Falló la integración (${error.code || error.name}). Revisar esquema y procedimiento de testing.`);
  process.exitCode = 1;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
}
