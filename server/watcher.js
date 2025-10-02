require('dotenv').config();
const sql = require('mssql');
const crypto = require('crypto');

const sqlConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  options: { encrypt: true, trustServerCertificate: true },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }
};

const BACKEND_URL = process.env.NUXT_WEBHOOK_URL; // ej: https://nuxt.example.com/api/webhooks/cotizaciones
let lastSeenKey = null; // para detectar cambios

async function getLatest() {
  const pool = await sql.connect(sqlConfig);
  const q = `
    SELECT TOP (1)
        COTI_MONEDA1, COTI_MONEDA2,
        COTI_FECHA, COTI_COTIZACION
    FROM dbo.vw_cotizaciones_dl_ps
    WHERE COTI_FECHA <= GETDATE()
    ORDER BY COTI_FECHA DESC
  `;
  const { recordset } = await pool.request().query(q);
  await pool.close();
  return recordset[0] || null;
}

async function tick() {
  try {
    const row = await getLatest();
    if (!row) return;

    // clave de idempotencia sencilla (fecha + cotización)
    const key = `${row.COTI_FECHA.toISOString?.() || row.COTI_FECHA}|${row.COTI_COTIZACION}`;

    if (key !== lastSeenKey) {
        lastSeenKey = key;
        const payload = {
            source: 'SIST_COTI',
            detectedAt: new Date().toISOString(),
            items: [row].map(r => ({
            COTI_MONEDA1: r.COTI_MONEDA1,
            COTI_MONEDA2: r.COTI_MONEDA2,
            COTI_FECHA: new Date(r.COTI_FECHA).toISOString(),
            COTI_COTIZACION: Number(r.COTI_COTIZACION),
            })),
        };
        const raw = JSON.stringify(payload);
        console.log('Detected change, sending webhook:', raw);
        const secret = process.env.NUXT_WEBHOOK_SECRET;
        const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
        // Enviar al backend (Nuxt) tal como lo espera tu ruta /webhooks/cotizaciones
        await fetch(BACKEND_URL, {
            method: 'POST',
            timeout: 10000,
            headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Id': 'webhook-sist-coti',
            'X-Webhook-Signature': `sha256=${sig}`, // Assuming 'sig' would be defined similarly to server.js
            },
            body: raw,
        }).catch(err => {
            console.error('Error sending webhook:', err);
            process.exit(1);
        });
    }
  } catch (err) {
    console.error('Watcher error:', err);
  }
}

setInterval(tick, 2000); // cada 2s (ajustá según SLA/carga)
tick(); // primer disparo inmediato
