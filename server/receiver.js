import 'dotenv/config';          // <-- importantísimo, al principio
import express from 'express';
import crypto from 'node:crypto';

const SECRET = process.env.WEBHOOK_SECRET;
if (!SECRET) {
  console.error('ERROR: WEBHOOK_SECRET no está configurado.');
  process.exit(1);
}

const app = express();

// MUY importante: cuerpo crudo para firmar/verificar
app.post('/webhooks/cotizaciones', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.get('X-Webhook-Signature') || '';

  // req.body es un Buffer gracias a express.raw
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(req.body).digest('hex');

  if (signature !== expected) return res.status(400).send('Firma inválida');

  const event = JSON.parse(req.body.toString('utf8'));
  console.log('Evento OK:', event);
  res.sendStatus(200);
});

app.listen(3030, () => console.log('Receptor en http://localhost:3030/webhooks/cotizaciones'));
