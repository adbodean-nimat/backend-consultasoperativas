import 'dotenv/config';
import crypto from 'node:crypto';
import sql from 'mssql';

const config = {
  server: process.env.SQL_SERVER_TRIGGERS,
  database: process.env.SQL_DATABASE_TRIGGERS,
  user: process.env.SQL_USER_TRIGGERS,
  password: process.env.SQL_PASSWORD_TRIGGERS,
  options: { trustServerCertificate: true }
};

const ENDPOINT = process.env.WEBHOOK_ENDPOINT;
const SECRET = process.env.WEBHOOK_SECRET;
const WORKER_ID = process.pid.toString();

function sign(body) {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

async function claimBatch(pool) {
  const q = `
    DECLARE @now DATETIME2 = SYSUTCDATETIME();

    ;WITH cte AS (
      SELECT TOP (50) id
      FROM dbo.webhook_outbox WITH (READPAST, UPDLOCK, ROWLOCK)
      WHERE dispatched_at IS NULL
        AND (locked_at IS NULL OR locked_at < DATEADD(MINUTE, -2, SYSUTCDATETIME()))
      ORDER BY created_at ASC
    )
    UPDATE dbo.webhook_outbox
    SET locked_by = @worker, locked_at = @now
    OUTPUT inserted.id, inserted.aggregate, inserted.op, inserted.payload
    WHERE id IN (SELECT id FROM cte);
  `;
  const res = await pool.request()
    .input('worker', sql.VarChar(64), WORKER_ID)
    .query(q);
  return res.recordset;
}

async function markSuccess(pool, id) {
  await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`
      UPDATE dbo.webhook_outbox
      SET dispatched_at = SYSUTCDATETIME(),
          attempts = attempts + 1,
          last_error = NULL,
          locked_by = NULL,
          locked_at = NULL
      WHERE id = @id
    `);
}

async function markFailure(pool, id, err) {
  await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('e', sql.NVarChar(2000), String(err).slice(0, 2000))
    .query(`
      UPDATE dbo.webhook_outbox
      SET attempts = attempts + 1,
          last_error = @e,
          locked_by = NULL,
          locked_at = NULL
      WHERE id = @id
    `);
}

async function dispatchOne(evt) {
  // payload viene del trigger:
  // INSERT/DELETE => JSON con { COTI_MONEDA1, COTI_MONEDA2, COTI_FECHA, COTI_COTIZACION }
  // UPDATE => JSON con { new: {...}, old: {...} }
  const data = JSON.parse(evt.payload);

  const body = JSON.stringify({
    id: evt.id,
    type: 'cotizacion.cambio',
    table: evt.aggregate,
    op: evt.op,            // INSERT | UPDATE | DELETE
    at: new Date().toISOString(),
    data                   // tal cual lo emite el trigger
  });

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Id': evt.id,
      'X-Webhook-Signature': sign(body)
    },
    body
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function loop() {
  const pool = await sql.connect(config);
  //console.log('Worker conectado. Enviando webhooks…');

  setInterval(async () => {
    try {
      const batch = await claimBatch(pool);
      for (const evt of batch) {
        try {
          await dispatchOne(evt);
          await markSuccess(pool, evt.id);
        } catch (e) {
          await markFailure(pool, evt.id, e);
        }
      }
    } catch (e) {
      console.error('Error en ciclo:', e);
    }
  }, 1500);
}

const pool = await sql.connect(config);
const batch = await claimBatch(pool);
//console.log('Tomé', batch.length, 'eventos.');

for (const evt of batch) {
  try {
    //console.log('Enviando', evt.id, evt.op, evt.aggregate);
    await dispatchOne(evt);
    await markSuccess(pool, evt.id);
    //console.log('OK', evt.id);
  } catch (e) {
    await markFailure(pool, evt.id, e);
    console.error('FALLÓ', evt.id, e);
  }
}

loop().catch((e) => (console.error(e), process.exit(1)));
