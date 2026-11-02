import pool from "./wep-postgres.js";
import { getBusinessDate } from "./wep-programmed-notifications.service.js";
import { buildWepProgrammedSchedule } from "./wep-programmed-scheduler.js";
import { buildWepSyncSchedule } from "./wep-sync-scheduler.js";
import { WepAdminError } from "./wep-admin-auth.js";
import { WepSettingsService } from "./wep-settings.service.js";
import { createStopGroupId } from "./wep-stop.util.js";

export function validateDashboardQuery(query) {
  const fecha = query.fecha ?? getBusinessDate();
  const parsed = typeof fecha === "string" ? new Date(`${fecha}T12:00:00Z`) : new Date(NaN);
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== fecha) throw new WepAdminError("Fecha inválida.");
  const number = (value, fallback) => {
    if (value === undefined || value === "") return fallback;
    if (typeof value !== "string" || !/^\d{1,8}$/.test(value) || Number(value) < 1) throw new WepAdminError("Filtro numérico inválido.");
    return Number(value);
  };
  const estado = query.estado ?? "";
  if (!["", "PROGRAMADA", "ASIGNADA", "EN_REPARTO", "CLIENTE_AVISADO", "ENTREGADA", "NO_ENTREGADA", "CANCELADA"].includes(estado)) throw new WepAdminError("Estado inválido.");
  const q = query.q ?? "";
  if (typeof q !== "string" || q.length > 100) throw new WepAdminError("La búsqueda admite hasta 100 caracteres.");
  if (query.agrupar !== undefined && query.agrupar !== "parada") throw new WepAdminError("Agrupación inválida.");
  const dias = number(query.dias, 14);
  if (![7, 14, 30].includes(dias)) throw new WepAdminError("El período debe ser de 7, 14 o 30 días.");
  return { fecha, vehiculo: number(query.vehiculo, null), estado, q: q.trim(), page: number(query.page, 1), agrupar: query.agrupar, dias };
}

// Misma identidad de parada que utiliza la PWA: viaje, cliente y destino normalizado.
const STOP_KEY = `jsonb_build_array(v.id::text, COALESCE(e.cliente_codigo, ''),
  UPPER(REGEXP_REPLACE(BTRIM(COALESCE(e.domicilio, '')), '\\s+', ' ', 'g')),
  UPPER(REGEXP_REPLACE(BTRIM(COALESCE(e.localidad, '')), '\\s+', ' ', 'g')))`;

const FILTERED = `
  FROM public.entregas e
  JOIN public.entrega_estados ee ON ee.id = e.estado_id
  JOIN public.viajes v ON v.id = e.viaje_id
  JOIN public.vehiculos vh ON vh.id = v.vehiculo_id
  WHERE e.fecha_entrega = $1::date
    AND ($2::bigint IS NULL OR vh.id = $2)
    AND ($3::text = '' OR ee.codigo = $3)
    AND ($4::text = '' OR STRPOS(LOWER(CONCAT_WS(' ', e.cliente_codigo, e.cliente_nombre, e.localidad, e.nota_pedido_numero)), LOWER($4)) > 0)
`;

export class WepAdminDashboardRepository {
  constructor({ postgresPool = pool, env = process.env } = {}) { this.pool = postgresPool; this.env = env; }
  async dashboard(filters) {
    const params = [filters.fecha, filters.vehiculo, filters.estado, filters.q];
    const grouped = filters.agrupar === "parada";
    const selection = `SELECT e.id, e.nota_pedido_numero::text AS pedido,
        e.nota_pedido_division AS pedido_division, e.nota_pedido_tipo AS pedido_tipo,
        e.orden_preparacion_division AS op_division, e.orden_preparacion_tipo AS op_tipo,
        e.orden_preparacion_numero::text AS op_numero,
        e.viaje_id, e.domicilio, e.orden_secuencia,
        e.cliente_codigo, e.cliente_nombre, e.localidad, ee.codigo AS estado,
        vh.nombre AS vehiculo, vh.patente, v.numero_vuelta AS vuelta, v.estado AS viaje_estado,
        e.hora_desde::text, e.hora_hasta::text,
        notice.tipo AS aviso_tipo, notice.estado AS aviso_estado, notice.enviado_at AS aviso_fecha,
        ${STOP_KEY} AS group_key
        ${FILTERED.replace("  WHERE", `  LEFT JOIN LATERAL (
          SELECT n.tipo, n.estado, COALESCE(n.enviado_at, n.created_at) AS enviado_at FROM public.notificaciones n
          WHERE n.entrega_id = e.id AND n.tipo <> 'PROGRAMADA_TEST'
          ORDER BY n.created_at DESC, n.id DESC LIMIT 1
        ) notice ON TRUE
  WHERE`)}`;
    const detailSql = grouped ? `WITH filtered AS (${selection}), grouped AS (
      SELECT group_key, MIN(vehiculo) AS vehiculo, MIN(vuelta) AS vuelta,
        MIN(orden_secuencia) AS sequence,
        jsonb_agg(to_jsonb(filtered) - 'group_key' - 'orden_secuencia'
          ORDER BY orden_secuencia NULLS LAST, id) AS orders
      FROM filtered GROUP BY group_key
    ) SELECT group_key, orders FROM grouped
      ORDER BY vehiculo, vuelta, sequence NULLS LAST, group_key
      LIMIT 50 OFFSET $5` : `${selection}
      ORDER BY vh.nombre, v.numero_vuelta, e.orden_secuencia NULLS LAST, e.id
      LIMIT 50 OFFSET $5`;
    const [summary, deliveries, vehicles] = await Promise.all([
      this.pool.query(`SELECT COUNT(*)::int AS total,
        COUNT(DISTINCT ${STOP_KEY})::int AS paradas,
        COUNT(*) FILTER (WHERE ee.codigo = 'ENTREGADA')::int AS entregadas,
        COUNT(*) FILTER (WHERE ee.codigo = 'NO_ENTREGADA')::int AS no_entregadas,
        COUNT(*) FILTER (WHERE ee.codigo IN ('EN_REPARTO', 'CLIENTE_AVISADO'))::int AS en_reparto,
        COUNT(DISTINCT v.id)::int AS viajes,
        COUNT(*) FILTER (WHERE NULLIF(BTRIM(e.telefono), '') IS NULL AND NULLIF(BTRIM(e.telefono_alternativo), '') IS NULL)::int AS sin_telefono,
        (SELECT COUNT(*)::int FROM public.notificaciones n WHERE n.entrega_id IN (SELECT e.id ${FILTERED}) AND n.tipo <> 'PROGRAMADA_TEST' AND n.estado = 'ERROR') AS errores_avisos,
        (SELECT COUNT(*)::int FROM public.notificaciones n WHERE n.entrega_id IN (SELECT e.id ${FILTERED}) AND n.tipo <> 'PROGRAMADA_TEST' AND n.estado IN ('ENVIADO', 'ENTREGADO', 'LEIDO')) AS avisos_enviados
        ${FILTERED}`, params),
      this.pool.query(detailSql, [...params, (filters.page - 1) * 50]),
      this.pool.query(`SELECT DISTINCT vh.id, vh.nombre, vh.patente
        FROM public.vehiculos vh JOIN public.viajes v ON v.vehiculo_id = vh.id
        JOIN public.entregas e ON e.viaje_id = v.id WHERE e.fecha_entrega = $1::date
        ORDER BY vh.nombre, vh.patente`, [filters.fecha]),
    ]);
    const groups = grouped ? deliveries.rows.map(row => {
      const [viajeId, clienteCodigo, domicilio, localidad] = row.group_key;
      return { id: createStopGroupId({ viajeId, clienteCodigo, domicilio, localidad }), orders: row.orders };
    }) : undefined;
    const trend = grouped ? await this.dailyTrend(filters.fecha, filters.vehiculo, filters.dias ?? 14) : undefined;
    return { fecha: filters.fecha, fetchedAt: new Date().toISOString(), summary: summary.rows[0],
      deliveries: groups ? groups.flatMap(group => group.orders) : deliveries.rows,
      ...(grouped ? { grouping: "parada", groups, totalGroups: summary.rows[0]?.paradas ?? 0, trend } : {}),
      vehicles: vehicles.rows, page: filters.page, pageSize: 50 };
  }
  async dailyTrend(fecha, vehiculo, dias) {
    const result = await this.pool.query(`WITH days AS (
      SELECT generate_series($1::date - ($3::int - 1), $1::date, '1 day'::interval)::date AS fecha
    ), stops AS (
      SELECT e.fecha_entrega AS fecha, ${STOP_KEY} AS group_key,
        COUNT(*)::int AS pedidos,
        COUNT(*) FILTER (WHERE ee.codigo = 'ENTREGADA')::int AS pedidos_entregados
      FROM public.entregas e
      JOIN public.entrega_estados ee ON ee.id = e.estado_id
      JOIN public.viajes v ON v.id = e.viaje_id
      WHERE e.fecha_entrega BETWEEN $1::date - ($3::int - 1) AND $1::date
        AND ($2::bigint IS NULL OR v.vehiculo_id = $2)
      GROUP BY e.fecha_entrega, ${STOP_KEY}
    ) SELECT days.fecha::text AS fecha,
      COUNT(stops.group_key)::int AS paradas,
      COUNT(stops.group_key) FILTER (WHERE stops.pedidos = stops.pedidos_entregados)::int AS completadas,
      COALESCE(SUM(stops.pedidos), 0)::int AS pedidos,
      COALESCE(SUM(stops.pedidos_entregados), 0)::int AS pedidos_entregados
    FROM days LEFT JOIN stops ON stops.fecha = days.fecha
    GROUP BY days.fecha ORDER BY days.fecha`, [fecha, vehiculo, dias]);
    return result.rows;
  }
  async technical(fecha) {
    const source = await this.pool.query("SELECT MAX(sincronizado_desde_erp_at) AS ultima_importacion FROM public.entregas");
    const errors = await this.pool.query(`SELECT n.id, n.tipo, LEFT(n.error_codigo, 100) AS error_codigo,
      e.nota_pedido_numero::text AS pedido, e.cliente_nombre, n.created_at
      FROM public.notificaciones n JOIN public.entregas e ON e.id = n.entrega_id
      WHERE e.fecha_entrega = $1::date AND n.estado = 'ERROR'
      ORDER BY n.created_at DESC, n.id DESC LIMIT 30`, [fecha]);
    let historyAvailable = true;
    let runs = [];
    try {
      const result = await this.pool.query(`SELECT id, job, instance, status, started_at, finished_at, summary
        FROM public.wep_monitor_runs WHERE (started_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = $1::date
        ORDER BY started_at DESC, id DESC LIMIT 30`, [fecha]);
      runs = result.rows;
    } catch (error) { if (error.code !== "42P01") throw error; historyAvailable = false; }
    let env = this.env;
    let effectiveMeta = null;
    if (env.WEP_SETTINGS_ENABLED === "true") {
      const runtime = await new WepSettingsService({ postgresPool: this.pool, env }).runtime();
      const { sync: s, programmed: p, meta } = runtime.config;
      effectiveMeta = { ...meta, tokenConfigured: Boolean(runtime.encrypted_token || env.WEP_WHATSAPP_TOKEN) };
      env = { ...env, WEP_SYNC_ENABLED: String(s.enabled && !s.blocked), WEP_SYNC_CRON: s.cron,
        WEP_PROGRAMMED_ENABLED: String(p.enabled && !s.blocked), WEP_PROGRAMMED_CRON: p.cron,
        WEP_PROGRAMMED_DRY_RUN: String(p.dryRun), WEP_PROGRAMMED_START: p.start, WEP_PROGRAMMED_END: p.end };
    }
    let programmed = null, sync = null, configValid = true;
    try { programmed = buildWepProgrammedSchedule(env); sync = buildWepSyncSchedule(env); }
    catch { configValid = false; }
    // Sólo indicadores de presencia: nunca tokens, claves, hostnames o respuestas remotas.
    return {
      database: "DISPONIBLE", lastImportedRecordAt: source.rows[0]?.ultima_importacion ?? null,
      monitorEnabled: env.WEP_MONITOR_ENABLED === "true", historyAvailable, configValid,
      programmed: programmed && { enabled: programmed.enabled, dryRun: programmed.dryRun, cron: programmed.expression,
        start: env.WEP_PROGRAMMED_START || "06:00", end: env.WEP_PROGRAMMED_END || "21:00" },
      sync: sync && { enabled: sync.enabled, cron: sync.expression },
      whatsappConfigured: effectiveMeta ? Boolean(effectiveMeta.tokenConfigured && effectiveMeta.phoneNumberId && effectiveMeta.apiVersion && effectiveMeta.templates.programmed.name)
        : ["WEP_WHATSAPP_TOKEN", "WEP_WABA_PHONE_NUMBER_ID", "WEP_WABA_VERSION", "WEP_WHATSAPP_TEMPLATE_PROGRAMADA"].every(key => Boolean(env[key]?.trim())),
      whatsappVerification: "NO_VERIFICADO", executor: "NODE_APP_INSTANCE=0", runs, notificationErrors: errors.rows,
    };
  }
}
export default new WepAdminDashboardRepository();
