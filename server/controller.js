import { sdk } from './sdk.js';

// POST /api/whatsapp/lista-precios  { to, perfil, fecha? }
export async function postListaPrecios(req, res) {
  try {
    const out = await sdk.sendPriceList(req.body);
    res.status(200).json(out);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
}

// POST /api/whatsapp/lista-precios/if-changed  { perfil, recipients: [\"+549...\"], fecha? }
export async function postIfChanged(req, res) {
  try {
    const out = await sdk.sendIfChanged(req.body);
    res.status(200).json(out);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
}
