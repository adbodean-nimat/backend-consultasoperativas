// scripts/sync-products.v3.mjs
// Genera data/products.json (+ .min.json) desde Dropbox (Excel)
// ✅ Soporta columna Categories con **múltiples categorías + orden** en el formato
//    "id | nro de orden; id | nro. de orden; ..." (también admite comas, barras y saltos de línea)
//    - Toma **todos** los IDs
//    - Ordena por el número provisto (ascendente)
//    - Deduplica por ID
//    - Completa nombres desde un catálogo opcional (ID → nombre)
//    - Define categoría **principal** como la primera tras ordenar
//    - Indexa por **nombre** y por **ID** (by_categoria)
//
// Salida optimizada para IA: { meta, indices, products }
// - products[] incluye: categoria_ids[], categorias[] (nombres), categoria_id, categoria (principal), marca, precio, stock, url, image, tokens, slugs
// - indices.by_categoria indexa por **cada nombre** y **cada ID** → [SKU, ...]
//
// Requisitos:
//   npm i xlsx
//   (Node 18+ con fetch nativo)
//
// Variables de entorno:
//   DROPBOX_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
//   DROPBOX_PRODUCTS_PATH=/ecommerce/Importar_AgileWorks_M2.xlsx
//   DROPBOX_CATEGORIES_PATH=/ecommerce/Categorias Nimat.xlsx   (opcional)
//   OUT_DIR=data                                                (opcional)
require('dotenv').config()
const fs = require('fs/promises');
const path = require('path');
const XLSX = require('xlsx');
// En Node 18+ fetch es global. Si querés fallback, descomentá:
const fetch = globalThis.fetch ?? require('node-fetch');

async function getAccessToken() {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
  });
  const auth = Buffer.from(`${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`).toString("base64");
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OAuth token error ${res.status}: ${errText}`);
  }
  return res.json(); // { access_token, expires_in, ... } // { access_token, expires_in, ... }
}

const CONFIG = {
  productsPath: process.env.DROPBOX_PRODUCTS_PATH,
  categoriesPath: process.env.DROPBOX_CATEGORIES_PATH,
  outDir: process.env.OUT_DIR || 'data',
  buckets: [
    { id: '0-10000', min: 0, max: 10000 },
    { id: '10000-50000', min: 10000, max: 50000 },
    { id: '50000-100000', min: 50000, max: 100000 },
    { id: '100000+', min: 100000, max: null }
  ],
  // Columnas según tu mapeo
  COLS: {
    sku: ['SKU'],
    nombre: ['Name', 'Product', 'Nombre'],
    precio: ['Price', 'Precio'],
    stock: ['StockQuantity', 'Stock', 'Qty'],
    marca: ['Manufacturers', 'Brand', 'Marca'],
    categoria_id: ['Categories', 'CategoryId', 'CategoriaId', 'Categoria', 'Category']
  }
}

/* if (!CONFIG.token) {
  console.error('Falta DROPBOX_TOKEN')
  process.exit(1)
} */

// ---------------- Utilidades ----------------
function normCol(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
function tokensOf(...parts) {
  const s = parts.filter(Boolean).join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
  const arr = s.split(/[^a-z0-9]+/g).filter(Boolean)
  const seen = new Set()
  const out = []
  for (const t of arr) { if (!seen.has(t)) { seen.add(t); out.push(t) } }
  return out
}
function toFloat(x) {
  if (x == null) return null
  if (typeof x === 'number') return Number.isFinite(x) ? x : null
  const s = String(x).trim().replace(/\$/g, '').replace(/ARS|USD|€/g, '').replace(/\./g, '').replace(/,/g, '.')
  const v = parseFloat(s)
  return Number.isFinite(v) ? v : null
}
function quantile(arr, q) {
  if (!arr.length) return 0
  const i = Math.round((arr.length - 1) * q)
  return arr[i]
}

let _cachedAccess = null; // { token, expiresAt }
async function ensureAccessToken() {
  const now = Date.now();
  if (_cachedAccess && _cachedAccess.expiresAt > now + 30_000) {
    return _cachedAccess.token;
  }
  const t = await getAccessToken();
  _cachedAccess = {
    token: t.access_token,
// Si no viene expires_in, usa 1h por defecto
    expiresAt: now + ((t.expires_in ?? 3600) - 60) * 1000,
  };
  return _cachedAccess.token;
}

// ---------------- Dropbox ----------------
async function dropboxDownload(dbxPath) {
  const token = await ensureAccessToken();
  const url = 'https://content.dropboxapi.com/2/files/download'
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: dbxPath }) }
  })
  if (!res.ok) throw new Error(`Dropbox download ${dbxPath} → ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

// ---------------- Lectura de Excel ----------------
function readWorksheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const preferred = ['productos','items','catalogo','catálogo','sheet1','hoja1','data','sheet']
  const pick = wb.SheetNames.find(n => preferred.includes(n.trim().toLowerCase())) || wb.SheetNames[0]
  const ws = wb.Sheets[pick]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
  const cols = rows.length ? Object.keys(rows[0]) : []
  const colsNorm = cols.map(normCol)
  return { rows, cols, colsNorm, sheet: pick }
}

function findCol(cols, colsNorm, candidates) {
  const cand = candidates.map(normCol)
  // exact
  for (const c of cand) { const idx = colsNorm.indexOf(c); if (idx >= 0) return { key: cols[idx], idx } }
  // startsWith / includes
  for (const c of cand) {
    const idx = colsNorm.findIndex(x => x.startsWith(c) || x.includes(c))
    if (idx >= 0) return { key: cols[idx], idx }
  }
  return { key: null, idx: -1 }
}

// ---------------- Categorías (multi-ID | orden) ----------------
// Acepta: "12|1; 34|2; 56|3" o con comas, barras o saltos de línea. Espacios y texto extra en el orden son tolerados.
function parseCategories(raw) {
  if (raw == null) return []
  const str = String(raw).trim()
  if (!str) return []
  // separar items por ; , / o salto de línea
  const parts = str.split(/[;\n,\/]+/g).map(s => s.trim()).filter(Boolean)
  const items = []
  for (const part of parts) {
    // dividir por '|': id | nro (nro puede ser "1", "01", "nro: 1", etc.)
    const [left, right] = part.split('|').map(s => s?.trim())
    let id = (left || '').replace(/[^a-zA-Z0-9_-]+/g, '')
    if (!id) continue
    let order = 0
    if (right) {
      const m = String(right).match(/\d+/)
      if (m) order = parseInt(m[0], 10)
    }
    items.push({ id, order })
  }
  // ordenar por order asc, luego estabilidad de entrada
  items.sort((a,b) => a.order - b.order)
  // dedupe por id manteniendo primer orden
  const seen = new Set()
  const out = []
  for (const it of items) { if (!seen.has(it.id)) { seen.add(it.id); out.push(it.id) } }
  return out
}

function mapProducts(rows, cols) {
  const colsNorm = cols.map(normCol)
  const m = {
    sku: findCol(cols, colsNorm, CONFIG.COLS.sku).key,
    nombre: findCol(cols, colsNorm, CONFIG.COLS.nombre).key,
    precio: findCol(cols, colsNorm, CONFIG.COLS.precio).key,
    stock: findCol(cols, colsNorm, CONFIG.COLS.stock).key,
    marca: findCol(cols, colsNorm, CONFIG.COLS.marca).key,
    categoria_id: findCol(cols, colsNorm, CONFIG.COLS.categoria_id).key,
  }

  const prods = []
  for (const r of rows) {
    const sku = (r[m.sku] ?? '').toString().trim()
    const nombre = (r[m.nombre] ?? '').toString().trim()
    if (!sku && !nombre) continue
    const precio = toFloat(r[m.precio])
    if (precio == null) continue

    const catIds = parseCategories(r[m.categoria_id]) // ← múltiples IDs con orden
    const primaryCatId = catIds[0] ?? null

    const marca = r[m.marca] != null && r[m.marca] !== '' ? String(r[m.marca]).trim() : null
    const stock = m.stock ? (Number.isFinite(+r[m.stock]) ? Math.round(+r[m.stock]) : null) : null

    const p = {
      sku: sku || slugify(nombre).slice(0,20).toUpperCase(),
      nombre: nombre || sku,
      categoria_id: primaryCatId,        // principal (ID)
      categoria: null,                   // principal (nombre; se completa con catálogo)
      categoria_ids: catIds,             // todas las IDs
      categorias: [],                    // todos los nombres (si hay catálogo)
      marca,
      precio: Math.round(precio * 100) / 100,
      stock,
      url: '',
      image: '',
      tokens: tokensOf(nombre, ...(catIds || []), marca, sku),
      slugs: { producto: slugify(nombre), categoria: '', marca: slugify(marca || '') }
    }
    prods.push(p)
  }
  return { products: prods, mapping: m }
}

function attachCategoryNames(products, catMap) {
  if (!catMap) return products
  products.forEach(p => {
    if (Array.isArray(p.categoria_ids) && p.categoria_ids.length) {
      const names = p.categoria_ids.map(id => catMap[id]).filter(Boolean)
      p.categorias = names
      p.categoria = names[0] || null
      // slug de categoría principal (si existe)
      if (p.categoria) p.slugs.categoria = slugify(p.categoria)
    }
  })
  return products
}

function buildIndices(products, buckets) {
  const by_sku = {}
  const by_categoria = {}   // indexa por NOMBRE y también por ID
  const by_marca = {}
  const price_index = Object.fromEntries(buckets.map(b => [b.id, []]))
  const by_slug = {}
  const bucketId = price => buckets.find(b => price >= b.min && (b.max == null || price < b.max))?.id || buckets[buckets.length-1].id

  products.forEach((p, idx) => {
    by_sku[p.sku] = idx

    // indexar por **todas** las categorías (nombres e IDs)
    const catKeys = []
    if (Array.isArray(p.categorias)) catKeys.push(...p.categorias.filter(Boolean))
    if (Array.isArray(p.categoria_ids)) catKeys.push(...p.categoria_ids.filter(Boolean))
    const uniqCatKeys = [...new Set(catKeys)]
    uniqCatKeys.forEach(k => { (by_categoria[k] ||= []).push(p.sku) })

    if (p.marca) (by_marca[p.marca] ||= []).push(p.sku)

    price_index[bucketId(p.precio)].push(p.sku)
    by_slug[slugify(`${p.nombre} ${p.marca || ''}`)] = p.sku
  })

  return { by_sku, by_categoria, by_marca, by_precio_ars: { buckets, index: price_index }, by_slug }
}

// ---------------- Main ----------------
async function main() {
  await fs.mkdir(CONFIG.outDir, { recursive: true })

  // Productos
  const bufProd = await dropboxDownload(CONFIG.productsPath)
  const { rows: prodRows, cols: prodCols } = readWorksheet(bufProd)
  if (!prodRows.length) throw new Error('La planilla de productos está vacía')
  const { products: baseProducts, mapping } = mapProducts(prodRows, prodCols)

  // Categorías (opcional)
  let catMap = null
  let catMeta = { source: null, sheet: null }
  if (CONFIG.categoriesPath) {
    try {
      const bufCat = await dropboxDownload(CONFIG.categoriesPath)
      const { rows: catRows, cols: catCols, sheet } = readWorksheet(bufCat)
      // Heurística: buscar columnas id / nombre
      const colsNorm = catCols.map(normCol)
      const idIdx = colsNorm.findIndex(c => ['id','category_id','categoria_id','codigo','code'].includes(c))
      const nameIdx = colsNorm.findIndex(c => ['nombre','name','categoria','category','title','label'].includes(c))
      if (idIdx >= 0 && nameIdx >= 0) {
        catMap = {}
        for (const r of catRows) {
          const id = String(r[catCols[idIdx]] ?? '').trim()
          const nm = String(r[catCols[nameIdx]] ?? '').trim()
          if (id && nm) catMap[id] = nm
        }
        catMeta = { source: CONFIG.categoriesPath, sheet }
      }
    } catch (e) {
      console.warn('No se pudo leer catálogo de categorías:', String(e.message || e))
    }
  }

  const products = attachCategoryNames(baseProducts, catMap)
  // Deduplicar por SKU (último gana)
  const seen = {}
  products.forEach(p => { seen[p.sku] = p })
  const uniq = Object.values(seen)

  const precios = uniq.map(p => p.precio).sort((a,b)=>a-b)
  const q = x => precios.length ? precios[Math.round((precios.length-1)*x)] : 0

  const meta = {
    version: 3,
    generated_at: new Date().toISOString(),
    source: { provider: 'dropbox', path: CONFIG.productsPath, rev: '', update_interval_minutes: 120 },
    currency: 'ARS',
    locale: 'es-AR',
    total_products: uniq.length,
    price_summary: { min: precios[0]||0, max: precios[precios.length-1]||0, median: q(0.5), p25: q(0.25), p75: q(0.75) },
    categories_source: catMeta.source,
    categories_sheet: catMeta.sheet,
    columns_mapping: mapping,
    categories_multi: true
  }

  const indices = buildIndices(uniq, CONFIG.buckets)
  const out = { meta, indices, products: uniq }

  const pretty = JSON.stringify(out, null, 2)
  const min = JSON.stringify(out)
  await fs.writeFile(path.join(CONFIG.outDir, 'products.json'), pretty, 'utf8')
  await fs.writeFile(path.join(CONFIG.outDir, 'products.min.json'), min, 'utf8')

  console.log('✓ products.json escrito', { total: uniq.length, mapping, categories: !!catMap })
}

//main().catch(err => { console.error(err); process.exit(1) })

module.exports = { main }