import xlsx from "xlsx";
import { inflateRawSync } from "node:zlib";
import { fault } from "./report.config.js";
import { PRODUCTOS_WEB_PROFILE } from "./report.profile.js";

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Check ZIP integrity before SheetJS: it also accepts CSV, XLS and truncated archives.
function inspectZip(buffer) {
  let end = buffer.length - 22;
  while (end >= Math.max(0, buffer.length - 65557) && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || buffer.readUInt32LE(end) !== 0x06054b50 || end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length) throw fault("REPORT_ZIP_INVALID");
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) throw fault("REPORT_ZIP_INVALID");
  const count = buffer.readUInt16LE(end + 10);
  let pos = buffer.readUInt32LE(end + 16), total = 0;
  const names = new Set();
  let workbookType = false;
  if (!count || count > 2000 || pos + buffer.readUInt32LE(end + 12) !== end) throw fault("REPORT_ZIP_INVALID");
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) throw fault("REPORT_ZIP_INVALID");
    const flags = buffer.readUInt16LE(pos + 8), method = buffer.readUInt16LE(pos + 10);
    const packed = buffer.readUInt32LE(pos + 20), size = buffer.readUInt32LE(pos + 24);
    const nameLength = buffer.readUInt16LE(pos + 28);
    const name = buffer.subarray(pos + 46, pos + 46 + nameLength).toString("utf8");
    total += size;
    if (flags & 1 || ![0, 8].includes(method) || total > 80 * 1024 * 1024 || names.has(name)) throw fault("REPORT_ZIP_UNSAFE");
    names.add(name);
    const local = buffer.readUInt32LE(pos + 42);
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw fault("REPORT_ZIP_INVALID");
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(start, start + packed);
    if (compressed.length !== packed || start + packed > buffer.readUInt32LE(end + 16)) throw fault("REPORT_ZIP_INVALID");
    const bytes = method === 8 ? inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) }) : compressed;
    if (bytes.length !== size || crc32(bytes) !== buffer.readUInt32LE(pos + 16)) throw fault("REPORT_ZIP_INVALID");
    if (name === "[Content_Types].xml") {
      const types = bytes.toString("utf8");
      const overrides = types.match(/<(?:\w+:)?Override\b[^>]*>/g) || [];
      const workbook = overrides.filter(tag => /\bPartName\s*=\s*["']\/xl\/workbook\.xml["']/.test(tag));
      const defaults = (types.match(/<(?:\w+:)?Default\b[^>]*>/g) || [])
        .filter(tag => /\bExtension\s*=\s*["']xml["']/.test(tag));
      // Open XML permits a Default for XML parts, overridden individually.
      const declaration = workbook.length === 1 ? workbook[0] : workbook.length === 0 && defaults.length === 1 ? defaults[0] : "";
      workbookType = /\bContentType\s*=\s*["']application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml["']/.test(declaration);
    }
    pos += 46 + nameLength + buffer.readUInt16LE(pos + 30) + buffer.readUInt16LE(pos + 32);
  }
  if (pos !== end || !workbookType || !names.has("xl/workbook.xml") || [...names].some(n => /vbaProject|externalLinks/i.test(n))) throw fault("REPORT_NOT_XLSX");
}

export function validateReport(buffer, config) {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > config.maxBytes || buffer.readUInt32LE(0) !== 0x04034b50) throw fault("REPORT_SIZE_OR_FORMAT");
    inspectZip(buffer);
    const book = xlsx.read(buffer, { type: "buffer", cellFormula: true, bookVBA: true });
    const sheet = book.Sheets[config.sheet];
    if (!sheet || book.vbaraw) throw fault("REPORT_SHEET_INVALID");
    const range = xlsx.utils.decode_range(sheet["!ref"] || "A1");
    if (range.e.r > 250000 || range.e.c > 200) throw fault("REPORT_RANGE_LIMIT");
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
    const headers = rows.shift()?.map(v => String(v).trim()) || [];
    if (new Set(headers).size !== headers.length || config.columns.some(c => !headers.includes(c))) throw fault("REPORT_COLUMNS_INVALID");
    const requiredValues = config.requiredValues || config.columns;
    if (requiredValues.some(c => !config.columns.includes(c))) throw fault("REPORT_REQUIRED_VALUES_CONFIG");
    const positions = requiredValues.map(c => headers.indexOf(c));
    if (rows.length < (config.minRows || 1) || rows.some(row => positions.some(i => String(row[i] ?? "").trim() === ""))) throw fault("REPORT_DATA_INVALID");
    if (config.profile === PRODUCTOS_WEB_PROFILE.name) {
      if (headers.length !== PRODUCTOS_WEB_PROFILE.columns.length || PRODUCTOS_WEB_PROFILE.columns.some((c, i) => headers[i] !== c)) throw fault("REPORT_COLUMNS_INVALID");
      const seenIds = new Set();
      for (const row of rows) {
        const [id, sku, name, description, image, url, specifications] = row;
        if (!Number.isSafeInteger(id) || id <= 0 || seenIds.has(id)) throw fault("REPORT_ID_INVALID");
        seenIds.add(id);
        if ([sku, name, description, image, url, specifications].some(v => typeof v !== "string")) throw fault("REPORT_VALUE_TYPE_INVALID");
        for (const value of [image, url]) {
          let parsed;
          try { parsed = new URL(value); } catch { throw fault("REPORT_URL_INVALID"); }
          if (parsed.protocol !== "https:" || !["www.nimat.com.ar", "nimat.com.ar"].includes(parsed.hostname) || parsed.username || parsed.password) throw fault("REPORT_URL_INVALID");
        }
      }
    }
    for (const [address, cell] of Object.entries(sheet)) {
      if (!address.startsWith("!") && (cell.f || cell.t === "e")) throw fault("REPORT_FORMULA_OR_ERROR");
    }
    return { rows: rows.length, columns: headers };
  } catch (error) {
    if (error.code?.startsWith("REPORT_")) throw error;
    throw fault("REPORT_XLSX_UNREADABLE");
  }
}
