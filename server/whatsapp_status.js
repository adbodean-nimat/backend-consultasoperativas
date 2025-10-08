// index.js
// WhatsApp Business Platform (Cloud API) — Webhook de estados + respuesta que deriva a otro número
// Autor: Antonio (toto) @ NIMAT — listo para Railway

import express from "express";
import dotenv from "dotenv";

// En Node 18+ fetch viene global. Si usás Node 16, instalá `node-fetch` y hacé: import fetch from 'node-fetch'

dotenv.config();

const app = express();
app.use(express.json({ verify: rawBodySaver }));

// ====== CONFIG ======
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN; // token de verificación que definís en Meta
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // token de acceso (permanente o de sistema)
const WABA_PHONE_ID = process.env.WABA_PHONE_ID; // ID de teléfono de WABA (ej: 123456789012345)

// Para redirigir
const VENTAS_NUMBER_E164 = process.env.VENTAS_NUMBER_E164 || "+54911XXXXXXX"; // con +
const VENTAS_NUMBER_PLAIN = VENTAS_NUMBER_E164.replace(/\+/g, ""); // sin + para wa.me
const VENTAS_URL = process.env.VENTAS_URL || `https://wa.me/${VENTAS_NUMBER_PLAIN}`; // URL para botón

// Base de datos Postgres (Railway/Render/Neon/etc.)
// DATABASE_URL ejemplo: postgres://user:pass@host:5432/dbname
import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL !== 'false' ? { rejectUnauthorized: false } : false });

// ====== UTILES ======
function rawBodySaver(req, res, buf) {
  req.rawBody = buf;
}

function log(...args) {
  console.log(new Date().toISOString(), "—", ...args);
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_inbox (
      id BIGSERIAL PRIMARY KEY,
      wa_msg_id TEXT,
      wa_from TEXT,
      wa_timestamp BIGINT,
      msg_type TEXT,
      msg_text TEXT,
      payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS wa_statuses (
      id BIGSERIAL PRIMARY KEY,
      wa_msg_id TEXT,
      recipient_id TEXT,
      status TEXT,
      wa_timestamp BIGINT,
      conversation JSONB,
      pricing JSONB,
      errors JSONB,
      raw JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS wa_outbox (
      id BIGSERIAL PRIMARY KEY,
      wa_msg_id TEXT,
      wa_to TEXT,
      payload JSONB,
      sent_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

async function sendMessage(to, payload) {
  const url = `https://graph.facebook.com/v20.0/${WABA_PHONE_ID}/messages`;
  const body = { messaging_product: "whatsapp", to, ...payload };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    log("ERROR enviando mensaje", resp.status, json);
    throw new Error(`Falló envío: ${resp.status}`);
  }
  const waMsgId = json?.messages?.[0]?.id;
  try {
    await pool.query('INSERT INTO wa_outbox (wa_msg_id, wa_to, payload) VALUES ($1,$2,$3)', [waMsgId || null, to, body]);
  } catch (e) { log('ERROR guardando outbox', e.message); }
  log("Mensaje enviado OK", json);
  return json;
}

async function sendText(to, text) {
  return sendMessage(to, { type: "text", text: { body: text } });
}

// ENVIAR POR PLANTILLA: botón URL (preaprobada en Meta)
// La plantilla debe tener 1 botón de tipo URL en el índice 0, con variable {{1}} para completar la URL.
// Ejemplo de plantilla: nombre "derivar_ventas", idioma "es" (o "es_AR").
const TEMPLATE_NAME = process.env.TEMPLATE_NAME || 'derivar_ventas';
const TEMPLATE_LANG = process.env.TEMPLATE_LANG || 'es';

async function sendTemplateDerivacion(to) {
  const payload = {
    type: 'template',
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG },
      components: [
        // Opcional: parámetros para el cuerpo si la plantilla los tuviera
        // { type: 'body', parameters: [ { type: 'text', text: 'NIMAT Ventas' } ] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [ { type: 'text', text: VENTAS_URL } ] }
      ]
    }
  };
  return sendMessage(to, payload);
}

async function sendQuickReplyVentas(to) {
  // Botón quick-reply (no URL). Al presionarlo, llega payload "CONTACTAR_VENTAS" que manejamos abajo
  return sendMessage(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Querés hablar con Ventas?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "CONTACTAR_VENTAS", title: "Hablar con Ventas" } },
          { type: "reply", reply: { id: "ATENCION_HUMANA", title: "Atención humana" } }
        ]
      }
    }
  });
}

async function sendDerivacionFallback(to) {
  const texto = [
    "Te derivo con nuestro equipo de Ventas:",
    `➡️ ${VENTAS_URL}`,
    `También podés agendar este contacto: ${VENTAS_NUMBER_E164}`
  ].join("");

  try {
    // Tarjeta de contacto (vCard)
    await sendMessage(to, {
      type: "contacts",
      contacts: [
        { name: { formatted_name: "NIMAT Ventas" }, phones: [ { phone: VENTAS_NUMBER_E164, type: "CELL", wa_id: VENTAS_NUMBER_PLAIN } ] }
      ]
    });
  } catch (e) { log('No se pudo enviar vCard:', e.message); }

  return sendText(to, texto);
}

async function sendDerivacion(to) {
  try {
    return await sendTemplateDerivacion(to);
  } catch (e) {
    log('Fallo plantilla, uso fallback', e.message);
    return sendDerivacionFallback(to);
  }
}

async function init() { await ensureTables(); }
init().catch(e => log('ERROR init DB', e.message));
async (to, payload) => {
  const url = `https://graph.facebook.com/v20.0/${WABA_PHONE_ID}/messages`;
  const body = { messaging_product: "whatsapp", to, ...payload };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    log("ERROR enviando mensaje", resp.status, json);
    throw new Error(`Falló envío: ${resp.status}`);
  }
  log("Mensaje enviado OK", json);
  return json;
}

async function sendText(to, text) {
  return sendMessage(to, { type: "text", text: { body: text } });
}

async function sendQuickReplyVentas(to) {
  // Botón quick-reply (no URL). Al presionarlo, llega payload "CONTACTAR_VENTAS" que manejamos abajo
  return sendMessage(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Querés hablar con Ventas?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "CONTACTAR_VENTAS", title: "Hablar con Ventas" } },
          { type: "reply", reply: { id: "ATENCION_HUMANA", title: "Atención humana" } }
        ]
      }
    }
  });
}

async function sendDerivacion(to) {
  const texto = [
    "Te derivo con nuestro equipo de Ventas:",
    `➡️ wa.me/${VENTAS_NUMBER_PLAIN}`,
    `También podés agendar este contacto: ${VENTAS_NUMBER_E164}`
  ].join("\n");

  // Extra: mandamos también la tarjeta de contacto (vCard) para que el cliente lo guarde
  await sendMessage(to, {
    type: "contacts",
    contacts: [
      {
        name: { formatted_name: "NIMAT Ventas" },
        phones: [ { phone: VENTAS_NUMBER_E164, type: "CELL", wa_id: VENTAS_NUMBER_PLAIN } ]
      }
    ]
  });

  return sendText(to, texto);
}

// ====== WEBHOOK (VERIFY) ======
app.get("/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    log("Webhook verificado correctamente");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ====== WEBHOOK (RECEIVE) ======
app.post("/whatsapp/webhook", async (req, res) => {
  try {
    const { object, entry } = req.body || {};
    if (object !== "whatsapp_business_account" || !Array.isArray(entry)) {
      return res.sendStatus(200); // Ack igual
    }

    for (const ent of entry) {
      for (const change of ent.changes || []) {
        const val = change.value || {};
        const metadata = val.metadata || {};

        // 1) ESTADOS DE MENSAJES
        if (Array.isArray(val.statuses)) {
          for (const st of val.statuses) {
            const info = {
              event: "status",
              status: st.status, // sent, delivered, read, failed, etc.
              message_id: st.id,
              recipient_id: st.recipient_id,
              timestamp: st.timestamp,
              conversation: st.conversation,
              pricing: st.pricing,
              errors: st.errors
            };
            log("STATUS:", JSON.stringify(info));
            try {
              await pool.query(
                'INSERT INTO wa_statuses (wa_msg_id, recipient_id, status, wa_timestamp, conversation, pricing, errors, raw) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
                [st.id || null, st.recipient_id || null, st.status || null, Number(st.timestamp) || null, st.conversation || null, st.pricing || null, st.errors || null, st]
              );
            } catch (e) { log('ERROR guardando status', e.message); }
          }
        }

        // 2) MENSAJES ENTRANTES
        if (Array.isArray(val.messages)) {
          for (const msg of val.messages) {
            const from = msg.from; // wa_id del cliente
            const type = msg.type;

            log("INCOMING:", { from, type, msgId: msg.id });
            try {
              await pool.query(
                'INSERT INTO wa_inbox (wa_msg_id, wa_from, wa_timestamp, msg_type, msg_text, payload) VALUES ($1,$2,$3,$4,$5,$6)',
                [msg.id || null, from || null, Number(msg.timestamp) || null, type || null, msg.text?.body || null, msg]
              );
            } catch (e) { log('ERROR guardando inbox', e.message); }

            // Si el usuario apretó un botón quick-reply
            if (type === "button" && msg.button?.payload) {
              const payload = msg.button.payload;
              if (payload === "CONTACTAR_VENTAS" || payload === "ATENCION_HUMANA") {
                await sendDerivacion(from);
                continue;
              }
            }

            // Palabras clave simples para derivar
            const text = msg.text?.body?.toLowerCase?.() || "";
            if (["ventas", "hablar con ventas", "humano", "asesor", "baja", "derivar"].some(k => text.includes(k))) {
              await sendDerivacion(from);
              continue;
            }

            // Mensaje por defecto: ofrecer botón para derivación
            await sendQuickReplyVentas(from);
          }
        }
        }  
    }
        // Responder rápido a Meta (ACK)
    return res.sendStatus(200);
  } catch (err) {
        log("ERROR webhook:", err?.message);
        return res.sendStatus(200); // nunca devolver 500 a Meta
    }
});

app.get("/health", (_req, res) => res.send("ok"));

app.listen(PORT, () => log(`Servidor escuchando en :${PORT}`));
