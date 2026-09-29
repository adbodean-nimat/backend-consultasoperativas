import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mssql from 'mssql';

// —— Config ——
const {
  SQL_SERVER,
  SQL_DATABASE,
  SQL_USER,
  SQL_PASSWORD,
  SQL_ENCRYPT = 'true',
  SQL_TRUST_SERVER_CERT = 'true',
  SQL_PORT = '1433',
  NUXT_WEBHOOK_URL,
  POLL_INTERVAL_MS = '10000',
  LOOKBACK_DAYS = '7',
  BATCH_MAX = '5000',
  PORT = '3030',
} = process.env;

if (!NUXT_WEBHOOK_URL) {
  console.error('[config] Falta NUXT_WEBHOOK_URL');
  process.exit(1);
}

const app = express();
app.use(express.json());

// —— Estado local ——
const dataDir = path.resolve('data');
const stateFile = path.join(dataDir, 'state.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

/**
 * state = {
 *   "MON1|MON2|YYYY-MM-DDTHH:mm:ss.sssZ": "<sha256>",
 *   ...
 * }
 */
function loadState() {
  try {
    if (!fs.existsSync(stateFile)) return {};
    const raw = fs.readFileSync(stateFile, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[state] No se pudo leer state.json, iniciando vacío:', e.message);
    return {};
  }
}
function saveState(state) {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state), 'utf8');
  } catch (e) {
    console.error('[state] Error al guardar state.json:', e);
  }
}

let STATE = loadState();

// —— MSSQL pool ——
const sqlConfig = {
  server: SQL_SERVER,
  database: SQL_DATABASE,
  user: SQL_USER,
  password: SQL_PASSWORD,
  options: {
    encrypt: SQL_ENCRYPT === 'true',
    trustServerCertificate: SQL_TRUST_SERVER_CERT === 'true',
  },
  port: Number(SQL_PORT),
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

const pool = new mssql.ConnectionPool(sqlConfig);
const poolConnect = pool.connect().then(() => console.log('[mssql] Conectado'))
  .catch(err => { console.error('[mssql] Error de conexión:', err); process.exit(1); });

// —— Utilidades ——
const keyOf = (r) => {
  const fechaIso = new Date(r.COTI_FECHA).toISOString();
  return `${r.COTI_MONEDA1}|${r.COTI_MONEDA2}|${fechaIso}`;
};
const hashOf = (r) => {
  const fechaIso = new Date(r.COTI_FECHA).toISOString();
  const value = `${r.COTI_MONEDA1}|${r.COTI_MONEDA2}|${fechaIso}|${Number(r.COTI_COTIZACION).toFixed(5)}`;
  return crypto.createHash('sha256').update(value).digest('hex');
};

async function fetchRows({ lookbackDays, batchMax }) {
  await poolConnect;
  const request = pool.request();
  request.input('days', mssql.Int, Number(lookbackDays));
  request.input('batch', mssql.Int, Number(batchMax));

  // Nota: Quitar WHERE para escanear toda la tabla (más pesado, pero 100% de cobertura)
  const q = `
    SELECT TOP (@batch)
      COTI_MONEDA1,
      COTI_MONEDA2,
      COTI_FECHA,
      COTI_COTIZACION
    FROM dbo.SIST_COTI WITH (NOLOCK)
    WHERE COTI_MONEDA1 = 'DL'
      AND COTI_MONEDA2 = 'PS'
      AND COTI_FECHA >= DATEADD(DAY, -@days, GETDATE())
    ORDER BY COTI_FECHA DESC, COTI_MONEDA1, COTI_MONEDA2
  `;
  const { recordset } = await request.query(q);
  return recordset;
}

async function sendWebhook(changes) {
  try {
    const payload = {
      source: 'SIST_COTI',
      detectedAt: new Date().toISOString(),
      items: changes.map(r => ({
        COTI_MONEDA1: r.COTI_MONEDA1,
        COTI_MONEDA2: r.COTI_MONEDA2,
        COTI_FECHA: new Date(r.COTI_FECHA).toISOString(),
        COTI_COTIZACION: Number(r.COTI_COTIZACION),
      })),
    };
    const raw = JSON.stringify(payload);

    // HMAC-SHA256
    const secret = process.env.NUXT_WEBHOOK_SECRET || '';
    const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    const res = await axios.post(NUXT_WEBHOOK_URL, raw, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Id': 'webhook-sist-coti',
        'X-Webhook-Signature': `sha256=${sig}`,
      },
      // importante: evitar re-serialización
      transformRequest: [(data) => data],
    });
    console.log(`[webhook] ${changes.length} cambios enviados -> status ${res.status}`);
  } catch (err) {
    console.error('[webhook] Error enviando cambios:', err.message);
  }
}

async function pollOnce() {
  try {
    const rows = await fetchRows({ lookbackDays: LOOKBACK_DAYS, batchMax: BATCH_MAX });
    if (!rows?.length) return;

    const nextState = { ...STATE };
    const changes = [];

    for (const r of rows) {
      const k = keyOf(r);
      const h = hashOf(r);
      if (STATE[k] !== h) {
        // nuevo o cambiado
        nextState[k] = h;
        changes.push(r);
      }
    }

    if (changes.length > 0) {
      await sendWebhook(changes);
      STATE = nextState;
      saveState(STATE);
    } else {
      console.log('[poll] Sin cambios');
    }
  } catch (e) {
    console.error('[poll] Error:', e);
  }
}

// —— Scheduler ——
let timer = null;
function startPolling() {
  const interval = Number(POLL_INTERVAL_MS);
  if (timer) clearInterval(timer);
  timer = setInterval(pollOnce, interval);
  console.log(`[poll] Iniciado cada ${interval} ms`);
}

// —— HTTP ——
app.get('/health', (_req, res) => {
  res.json({ ok: true, lastKeys: Object.keys(STATE).length });
});

app.post('/force-scan', async (_req, res) => {
  await pollOnce();
  res.json({ ok: true });
});

app.listen(Number(PORT), () => {
  console.log(`[http] Escuchando en :${PORT}`);
  startPolling();
});

// Limpieza
process.on('SIGINT', () => { console.log('Bye'); process.exit(0); });