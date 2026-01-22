import xlsx from 'xlsx';
import dayjs from 'dayjs';
import fs from 'fs';
import pg from 'pg';
import configpg from '../dbconfig_pg.js';

const { Pool } = pg;
const pool = new Pool(configpg);

// --- CLASIFICACIÓN INTERNA PARA GRUPO FINANCIERO (SOLO SE USA EN MODO DIA) ---
const obtenerGrupoDia = (categoria) => {
    const c = categoria.toUpperCase().trim();
    if (c.includes('DESCUBIERTO') || c.includes('PROVEEDOR') || c.includes('IMPUESTO') || c.includes('SUELDO')) return 'Pasivos';
    if (c.includes('BANCO') || c.includes('CAJA') || c.includes('FONDO') || c.includes('VALORES') || c.includes('RECAUDACION')) return 'Disponibilidades';
    return null; 
};

export const importarMasivoFinanzas = async (req, res) => {
    if (!req.file) return res.status(400).send('Falta archivo.');

    const client = await pool.connect();
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const todasLasFilas = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        // ARRAYS DE DESTINO
        const insertsDia = [];
        const insertsSemana = [];
        const insertsIndicadores = [];
        const insertsOtros = [];

        // ESTADO INICIAL
        let seccionActual = null; // 'DIA', 'SEMANA', 'INDICADORES', 'OTROS'
        let mapaFechas = {};
        let cabeceraDetectada = false;

        // --- RECORRIDO LÍNEA POR LÍNEA ---
        for (let i = 0; i < todasLasFilas.length; i++) {
            const fila = todasLasFilas[i];
            const cat = String(fila[0] || '').trim();
            const catUpper = cat.toUpperCase();

            // 1. DETECCIÓN DE CABECERA DE FECHAS (Siempre buscamos la fila DIA para sacar fechas)
            if (!cabeceraDetectada && (catUpper === 'DIA' || catUpper.includes('FECHA'))) {
                fila.forEach((celda, index) => {
                    let f = null;
                    if (typeof celda === 'number' && celda > 20000) {
                        const dateObj = new Date(Math.round((celda - 25569) * 86400 * 1000));
                        dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
                        f = dayjs(dateObj).format('YYYY-MM-DD');
                    } else if (dayjs(celda).isValid() && String(celda).length > 5) {
                        f = dayjs(celda).format('YYYY-MM-DD');
                    }
                    if (f) mapaFechas[index] = f;
                });
                if (Object.keys(mapaFechas).length > 0) cabeceraDetectada = true;
                
                // Si encontramos DIA, activamos la sección y saltamos esta fila (es header)
                seccionActual = 'DIA';
                continue; 
            }

            // 2. INTERRUPTORES DE SECCIÓN (Palabras Clave)
            if (catUpper.includes('SEMANA')) {
                seccionActual = 'SEMANA';
                // No hacemos 'continue' porque la fila "Semana:" a veces trae datos (ej: "Semana 1: ...")
                // Si es solo un título vacío, el proceso de abajo lo ignorará por no tener valores.
            } 
            else if (catUpper.includes('INDICADORES')) {
                seccionActual = 'INDICADORES';
                // Asumimos que es un título, pero si trae datos, los procesamos.
            } 
            else if (catUpper.includes('OTROS DATOS')) {
                seccionActual = 'OTROS';
                continue; // Título, saltamos
            }
            else if (catUpper === 'DIA') {
                seccionActual = 'DIA'; // Reinicio por si aparece de nuevo
                continue;
            }

            // 3. PROCESAMIENTO SEGÚN LA SECCIÓN ACTUAL
            if (!seccionActual || !cabeceraDetectada) continue; // Si no sabemos dónde estamos, ignoramos
            if (!cat || catUpper.includes('TOTAL')) continue; // Ignorar totales y vacíos

            Object.keys(mapaFechas).forEach(index => {
                let valorRaw = fila[index];
                let valorParaInsertar = null;
                let grupoParaInsertar = null;

                // --- LÓGICA POR SECCIÓN ---
                if (seccionActual === 'DIA') {
                    // Esperamos DINERO (Números)
                    if (typeof valorRaw === 'string') valorRaw = valorRaw.replace('$', '').replace(/\./g, '').replace(',', '.').trim();
                    const v = parseFloat(valorRaw) || 0;
                    if (v !== 0) {
                        valorParaInsertar = v;
                        grupoParaInsertar = obtenerGrupoDia(cat); // Solo DIA lleva grupo
                        insertsDia.push({ fecha: mapaFechas[index], categoria: cat, valor: valorParaInsertar, grupo: grupoParaInsertar });
                    }
                } 
                else if (seccionActual === 'SEMANA') {
                    // Esperamos TEXTO
                    const t = valorRaw ? String(valorRaw).trim() : '';
                    if (t) {
                        insertsSemana.push({ fecha: mapaFechas[index], categoria: cat, valor: t });
                    }
                } 
                else if (seccionActual === 'INDICADORES') {
                    // Esperamos NÚMEROS KPI (Sin $)
                    if (typeof valorRaw === 'string') valorRaw = valorRaw.replace('$', '').replace(/\./g, '').replace(',', '.').trim();
                    const v = parseFloat(valorRaw) || 0;
                    if (v !== 0) {
                        insertsIndicadores.push({ fecha: mapaFechas[index], categoria: cat, valor: v });
                    }
                } 
                else if (seccionActual === 'OTROS') {
                    // Esperamos TEXTO
                    const t = valorRaw ? String(valorRaw).trim() : '';
                    if (t) {
                        insertsOtros.push({ fecha: mapaFechas[index], categoria: cat, valor: t });
                    }
                }
            });
        }

        // --- INSERCIÓN EN BASE DE DATOS ---
        await client.query('BEGIN');

        const insertarEnTabla = async (tabla, datos) => {
            const usaGrupo = (tabla === 'registros_finanzas_dia');
            for (const d of datos) {
                const query = usaGrupo
                    ? `INSERT INTO ${tabla} (fecha, categoria, valor, grupo) VALUES ($1, $2, $3, $4) ON CONFLICT (fecha, categoria) DO UPDATE SET valor = EXCLUDED.valor, grupo = EXCLUDED.grupo`
                    : `INSERT INTO ${tabla} (fecha, categoria, valor) VALUES ($1, $2, $3) ON CONFLICT (fecha, categoria) DO UPDATE SET valor = EXCLUDED.valor`;
                const params = usaGrupo ? [d.fecha, d.categoria, d.valor, d.grupo] : [d.fecha, d.categoria, d.valor];
                await client.query(query, params);
            }
        };

        await insertarEnTabla('registros_finanzas_dia', insertsDia);
        await insertarEnTabla('registros_finanzas_semana', insertsSemana);
        await insertarEnTabla('registros_finanzas_indicadores', insertsIndicadores);
        await insertarEnTabla('registros_finanzas_otros', insertsOtros);

        await client.query('COMMIT');
        
        res.status(200).json({ 
            mensaje: 'Importación por Secciones exitosa', 
            detalle: {
                dia: insertsDia.length,
                semana: insertsSemana.length,
                indicadores: insertsIndicadores.length,
                otros: insertsOtros.length
            }
        });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).send('Error: ' + e.message);
    } finally {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        client.release();
    }
};