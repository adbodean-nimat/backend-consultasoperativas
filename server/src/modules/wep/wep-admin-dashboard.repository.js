import pool from "./wep-postgres.js";
import { getBusinessDate } from "./wep-programmed-notifications.service.js";
import { buildWepProgrammedSchedule } from "./wep-programmed-scheduler.js";
import { buildWepSyncSchedule } from "./wep-sync-scheduler.js";
import { WepAdminError } from "./wep-admin-auth.js";

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
  return { fecha, vehiculo: number(query.vehiculo, null), estado, q: q.trim(), page: number(query.page, 1) };
}

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
    const [summary, deliveries, vehicles] = await Promise.all([
      this.pool.query(`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ee.codigo = 'ENTREGADA')::int AS entregadas,
        COUNT(*) FILTER (WHERE ee.codigo = 'NO_ENTREGADA')::int AS no_entregadas,
        COUNT(*) FILTER (WHERE ee.codigo IN ('EN_REPARTO', 'CLIENTE_AVISADO'))::int AS en_reparto,
        COUNT(DISTINCT v.id)::int AS viajes,
        COUNT(*) FILTER (WHERE NULLIF(BTRIM(e.telefono), '') IS NULL AND NULLIF(BTRIM(e.telefono_alternativo), '') IS NULL)::int AS sin_telefono,
        (SELECT COUNT(*)::int FROM public.notificaciones n WHERE n.entrega_id IN (SELECT e.id ${FILTERED}) AND n.tipo <> 'PROGRAMADA_TEST' AND n.estado = 'ERROR') AS errores_avisos,
        (SELECT COUNT(*)::int FROM public.notificaciones n WHERE n.entrega_id IN (SELECT e.id ${FILTERED}) AND n.tipo <> 'PROGRAMADA_TEST' AND n.estado IN ('ENVIADO', 'ENTREGADO', 'LEIDO')) AS avisos_enviados
        ${FILTERED}`, params),
      this.pool.query(`SELECT e.id, e.nota_pedido_numero::text AS pedido,
        e.cliente_codigo, e.cliente_nombre, e.localidad, ee.codigo AS estado,
        vh.nombre AS vehiculo, vh.patente, v.numero_vuelta AS vuelta, v.estado AS viaje_estado,
        e.hora_desde::text, e.hora_hasta::text,
        notice.tipo AS aviso_tipo, notice.estado AS aviso_estado, notice.enviado_at AS aviso_fecha
        ${FILTERED.replace("  WHERE", `  LEFT JOIN LATERAL (
          SELECT n.tipo, n.estado, n.enviado_at FROM public.notificaciones n
          WHERE n.entrega_id = e.id AND n.tipo <> 'PROGRAMADA_TEST'
          ORDER BY n.created_at DESC, n.id DESC LIMIT 1
        ) notice ON TRUE
  WHERE`)}
        ORDER BY vh.nombre, v.numero_vuelta, e.orden_secuencia NULLS LAST, e.id
        LIMIT 50 OFFSET $5`, [...params, (filters.page - 1) * 50]),
      this.pool.query(`SELECT DISTINCT vh.id, vh.nombre, vh.patente
        FROM public.vehiculos vh JOIN public.viajes v ON v.vehiculo_id = vh.id
        JOIN public.entregas e ON e.viaje_id = v.id WHERE e.fecha_entrega = $1::date
        ORDER BY vh.nombre, vh.patente`, [filters.fecha]),
    ]);
    return { fecha: filters.fecha, fetchedAt: new Date().toISOString(), summary: summary.rows[0],
      deliveries: deliveries.rows, vehicles: vehicles.rows, page: filters.page, pageSize: 50 };
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
    const env = this.env;
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
      whatsappConfigured: ["WHATSAPP_TOKEN", "WABA_PHONE_NUMBER_ID", "WABA_VERSION", "WEP_WHATSAPP_TEMPLATE_PROGRAMADA"].every(key => Boolean(env[key]?.trim())),
      whatsappVerification: "NO_VERIFICADO", executor: "NODE_APP_INSTANCE=0", runs, notificationErrors: errors.rows,
    };
  }
}
export default new WepAdminDashboardRepository();
