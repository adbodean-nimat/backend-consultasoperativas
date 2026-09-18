import wepPostgresPool from "./wep-postgres.js";
import {
  createStopGroupId,
  deriveStopState,
  normalizeStopText,
} from "./wep-stop.util.js";
import { normalizeNumericQrSegment } from "./wep-qr.util.js";

const PWA_VIAJES_QUERY = `
  SELECT
    v.id AS viaje_id,
    v.numero_vuelta,
    v.estado AS viaje_estado,
    v.iniciado_at,
    v.finalizado_at,
    vh.id AS vehiculo_id,
    vh.codigo_erp,
    vh.nombre AS vehiculo_nombre,
    vh.patente,
    e.id AS entrega_id,
    e.orden_secuencia,
    ee.codigo AS estado_codigo,
    ee.nombre AS estado_nombre,
    e.orden_preparacion_division,
    e.orden_preparacion_tipo,
    e.orden_preparacion_numero,
    e.nota_pedido_division,
    e.nota_pedido_tipo,
    e.nota_pedido_numero,
    e.cliente_codigo,
    e.cliente_nombre,
    e.domicilio,
    e.localidad,
    e.hora_desde,
    e.hora_hasta,
    e.peso_calculado,
    e.volumen_calculado,
    e.bultos_calculados
  FROM public.viajes v
  INNER JOIN public.vehiculos vh
    ON vh.id = v.vehiculo_id
  LEFT JOIN public.entregas e
    ON e.viaje_id = v.id
  LEFT JOIN public.entrega_estados ee
    ON ee.id = e.estado_id
  WHERE v.fecha = $1::date
    AND v.vehiculo_id = $2
  ORDER BY
    vh.nombre ASC,
    vh.patente ASC,
    v.numero_vuelta ASC,
    v.id ASC,
    CASE WHEN e.orden_secuencia IS NULL THEN 1 ELSE 0 END,
    e.orden_secuencia ASC,
    e.hora_desde ASC NULLS LAST,
    e.orden_preparacion_numero ASC,
    e.id ASC
`;

const PWA_ENTREGA_DETALLE_QUERY = `
  SELECT
    e.id AS entrega_id,
    ee.codigo AS estado_codigo,
    ee.nombre AS estado_nombre,
    e.estado_erp,
    e.orden_preparacion_division,
    e.orden_preparacion_tipo,
    e.orden_preparacion_numero,
    e.nota_pedido_division,
    e.nota_pedido_tipo,
    e.nota_pedido_numero,
    e.cliente_codigo,
    e.cliente_nombre,
    e.telefono,
    e.telefono_alternativo,
    e.email,
    e.domicilio,
    e.localidad,
    e.zona_codigo,
    e.zona_nombre,
    e.fecha_entrega::text AS fecha_entrega,
    e.hora_desde,
    e.hora_hasta,
    e.peso_calculado,
    e.volumen_calculado,
    e.bultos_calculados,
    e.observacion_entrega,
    e.observaciones,
    vh.id AS vehiculo_id,
    vh.codigo_erp,
    vh.nombre AS vehiculo_nombre,
    vh.patente,
    v.id AS viaje_id,
    v.numero_vuelta,
    v.estado AS viaje_estado,
    e.orden_secuencia
  FROM public.entregas e
  LEFT JOIN public.viajes v
    ON v.id = e.viaje_id
  LEFT JOIN public.vehiculos vh
    ON vh.id = e.vehiculo_id
  LEFT JOIN public.entrega_estados ee
    ON ee.id = e.estado_id
  WHERE e.id = $1
    AND e.vehiculo_id = $2
`;

const PWA_QR_MATCH_QUERY = `
  SELECT
    v.id AS viaje_id,
    v.numero_vuelta,
    v.estado AS viaje_estado,
    v.iniciado_at,
    v.finalizado_at,
    vh.id AS vehiculo_id,
    vh.codigo_erp,
    vh.nombre AS vehiculo_nombre,
    vh.patente,
    e.id AS entrega_id,
    e.orden_secuencia,
    ee.codigo AS estado_codigo,
    ee.nombre AS estado_nombre,
    e.orden_preparacion_division,
    e.orden_preparacion_tipo,
    e.orden_preparacion_numero,
    e.nota_pedido_division,
    e.nota_pedido_tipo,
    e.nota_pedido_numero,
    e.cliente_codigo,
    e.cliente_nombre,
    e.domicilio,
    e.localidad,
    e.hora_desde,
    e.hora_hasta,
    e.peso_calculado,
    e.volumen_calculado,
    e.bultos_calculados
  FROM public.entregas e
  INNER JOIN public.viajes v
    ON v.id = e.viaje_id
   AND v.vehiculo_id = $4
  INNER JOIN public.vehiculos vh
    ON vh.id = v.vehiculo_id
  LEFT JOIN public.entrega_estados ee
    ON ee.id = e.estado_id
  WHERE e.vehiculo_id = $4
    AND CASE
          WHEN BTRIM(e.nota_pedido_division) ~ '^[0-9]+$'
            THEN COALESCE(NULLIF(LTRIM(BTRIM(e.nota_pedido_division), '0'), ''), '0')
          ELSE BTRIM(e.nota_pedido_division)
        END = $1
    AND UPPER(BTRIM(e.nota_pedido_tipo)) = $2
    AND e.nota_pedido_numero::text = $3
  ORDER BY v.id, e.id
`;

const PWA_QR_TRIP_QUERY = `
  SELECT
    v.id AS viaje_id,
    v.numero_vuelta,
    v.estado AS viaje_estado,
    v.iniciado_at,
    v.finalizado_at,
    vh.id AS vehiculo_id,
    vh.codigo_erp,
    vh.nombre AS vehiculo_nombre,
    vh.patente,
    e.id AS entrega_id,
    e.orden_secuencia,
    ee.codigo AS estado_codigo,
    ee.nombre AS estado_nombre,
    e.orden_preparacion_division,
    e.orden_preparacion_tipo,
    e.orden_preparacion_numero,
    e.nota_pedido_division,
    e.nota_pedido_tipo,
    e.nota_pedido_numero,
    e.cliente_codigo,
    e.cliente_nombre,
    e.domicilio,
    e.localidad,
    e.hora_desde,
    e.hora_hasta,
    e.peso_calculado,
    e.volumen_calculado,
    e.bultos_calculados
  FROM public.viajes v
  INNER JOIN public.vehiculos vh
    ON vh.id = v.vehiculo_id
  LEFT JOIN public.entregas e
    ON e.viaje_id = v.id
   AND e.vehiculo_id = $2
  LEFT JOIN public.entrega_estados ee
    ON ee.id = e.estado_id
  WHERE v.id = $1
    AND v.vehiculo_id = $2
  ORDER BY
    CASE WHEN e.orden_secuencia IS NULL THEN 1 ELSE 0 END,
    e.orden_secuencia ASC,
    e.hora_desde ASC NULLS LAST,
    e.orden_preparacion_numero ASC,
    e.id ASC
`;

export class WepPwaViajeNotFoundError extends Error {}

export class WepPwaViajeStateConflictError extends Error {}

export class WepPwaViajeWithoutDeliveriesError extends Error {}

export class WepPwaViajePendingDeliveriesError extends Error {
  constructor(entregasPendientes) {
    super("El viaje todavía tiene entregas pendientes");
    this.entregasPendientes = entregasPendientes;
    this.pendientes = entregasPendientes.length;
  }
}

export class WepPwaEntregaMismatchError extends Error {}

export class WepPwaOrdenIncompletoError extends Error {}

export class WepPwaQrTripConflictError extends Error {
  constructor(cantidadViajes) {
    super("La Nota de Pedido está asociada a más de una vuelta");
    this.cantidadViajes = cantidadViajes;
  }
}

export class WepPwaQrStopConflictError extends Error {
  constructor(cantidadParadas) {
    super("La Nota de Pedido está asociada a más de una parada");
    this.cantidadParadas = cantidadParadas;
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

function compareNullableNumbers(left, right) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareNullableText(left, right) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return String(left).localeCompare(String(right), "es", {
    sensitivity: "base",
  });
}

function finishStop(stop) {
  stop.entregas.sort(
    (left, right) =>
      compareNullableNumbers(left.ordenSecuencia, right.ordenSecuencia) ||
      compareNullableNumbers(
        left.ordenPreparacion.numero,
        right.ordenPreparacion.numero,
      ) ||
      left.id - right.id,
  );

  const ordenes = stop.entregas
    .map((entrega) => entrega.ordenSecuencia)
    .filter((orden) => orden !== null);
  const horasDesde = stop._horasDesde.filter((hora) => hora !== null);
  const horasHasta = stop._horasHasta.filter((hora) => hora !== null);

  stop.ordenSecuencia = ordenes.length > 0 ? Math.min(...ordenes) : null;
  stop.estado = deriveStopState(stop.entregas);
  stop.cantidadOrdenes = stop.entregas.length;
  stop.horaDesde = horasDesde.length > 0 ? horasDesde.sort()[0] : null;
  stop.horaHasta = horasHasta.length > 0 ? horasHasta.sort().at(-1) : null;
  delete stop._horasDesde;
  delete stop._horasHasta;
  return stop;
}

function compareStops(left, right) {
  return (
    compareNullableNumbers(left.ordenSecuencia, right.ordenSecuencia) ||
    compareNullableText(left.horaDesde, right.horaDesde) ||
    compareNullableText(left.cliente.nombre, right.cliente.nombre) ||
    compareNullableText(left.domicilio, right.domicilio) ||
    left.grupoId.localeCompare(right.grupoId)
  );
}

export function groupPwaViajes(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const viajeKey = String(row.viaje_id);
    let group = grouped.get(viajeKey);

    if (!group) {
      group = {
        viaje: {
          id: numberOrNull(row.viaje_id),
          numeroVuelta: row.numero_vuelta,
          estado: row.viaje_estado,
          iniciadoAt: row.iniciado_at,
          finalizadoAt: row.finalizado_at,
          vehiculo: {
            id: numberOrNull(row.vehiculo_id),
            codigoErp: row.codigo_erp,
            nombre: row.vehiculo_nombre,
            patente: row.patente,
          },
          paradas: [],
        },
        entregaIds: new Set(),
        paradas: new Map(),
      };
      grouped.set(viajeKey, group);
    }

    if (row.entrega_id === null || row.entrega_id === undefined) continue;

    const entregaKey = String(row.entrega_id);
    if (group.entregaIds.has(entregaKey)) continue;
    group.entregaIds.add(entregaKey);

    const stopKey = JSON.stringify([
      String(row.cliente_codigo ?? ""),
      normalizeStopText(row.domicilio),
      normalizeStopText(row.localidad),
    ]);
    let parada = group.paradas.get(stopKey);

    if (!parada) {
      parada = {
        grupoId: createStopGroupId({
          viajeId: row.viaje_id,
          clienteCodigo: row.cliente_codigo,
          domicilio: row.domicilio,
          localidad: row.localidad,
        }),
        ordenSecuencia: null,
        cliente: {
          codigo: row.cliente_codigo,
          nombre: row.cliente_nombre,
        },
        domicilio: row.domicilio,
        localidad: row.localidad,
        estado: null,
        cantidadOrdenes: 0,
        totales: {
          bultos: 0,
          peso: 0,
          volumen: 0,
        },
        horaDesde: null,
        horaHasta: null,
        entregas: [],
        _horasDesde: [],
        _horasHasta: [],
      };
      group.paradas.set(stopKey, parada);
      group.viaje.paradas.push(parada);
    }

    const entrega = {
      id: numberOrNull(row.entrega_id),
      ordenSecuencia: numberOrNull(row.orden_secuencia),
      ordenPreparacion: {
        division: row.orden_preparacion_division,
        tipo: row.orden_preparacion_tipo,
        numero: numberOrNull(row.orden_preparacion_numero),
      },
      notaPedido: {
        division: row.nota_pedido_division,
        tipo: row.nota_pedido_tipo,
        numero: numberOrNull(row.nota_pedido_numero),
      },
      estado: {
        codigo: row.estado_codigo,
        nombre: row.estado_nombre,
      },
      bultos: numberOrNull(row.bultos_calculados),
      peso: numberOrNull(row.peso_calculado),
      volumen: numberOrNull(row.volumen_calculado),
    };

    parada.entregas.push(entrega);
    parada.totales.bultos += numberOrZero(row.bultos_calculados);
    parada.totales.peso += numberOrZero(row.peso_calculado);
    parada.totales.volumen += numberOrZero(row.volumen_calculado);
    parada._horasDesde.push(row.hora_desde ?? null);
    parada._horasHasta.push(row.hora_hasta ?? null);
  }

  return Array.from(grouped.values(), ({ viaje }) => {
    viaje.paradas = viaje.paradas.map(finishStop).sort(compareStops);
    return viaje;
  });
}

export function mapPwaEntregaDetalle(row) {
  if (!row) return null;

  return {
    id: numberOrNull(row.entrega_id),
    estado: {
      codigo: row.estado_codigo,
      nombre: row.estado_nombre,
    },
    estadoErp: row.estado_erp,
    ordenPreparacion: {
      division: row.orden_preparacion_division,
      tipo: row.orden_preparacion_tipo,
      numero: numberOrNull(row.orden_preparacion_numero),
    },
    notaPedido: {
      division: row.nota_pedido_division,
      tipo: row.nota_pedido_tipo,
      numero: numberOrNull(row.nota_pedido_numero),
    },
    cliente: {
      codigo: row.cliente_codigo,
      nombre: row.cliente_nombre,
    },
    contacto: {
      telefono: row.telefono,
      telefonoAlternativo: row.telefono_alternativo,
      email: row.email,
    },
    entrega: {
      domicilio: row.domicilio,
      localidad: row.localidad,
      zonaCodigo: row.zona_codigo,
      zonaNombre: row.zona_nombre,
      fecha: row.fecha_entrega,
      horaDesde: row.hora_desde,
      horaHasta: row.hora_hasta,
    },
    logistica: {
      pesoCalculado: numberOrNull(row.peso_calculado),
      volumenCalculado: numberOrNull(row.volumen_calculado),
      bultosCalculados: numberOrNull(row.bultos_calculados),
    },
    observacionEntrega: row.observacion_entrega,
    observaciones: row.observaciones,
    vehiculo: {
      id: numberOrNull(row.vehiculo_id),
      codigoErp: row.codigo_erp,
      nombre: row.vehiculo_nombre,
      patente: row.patente,
    },
    viaje: {
      id: numberOrNull(row.viaje_id),
      numeroVuelta: row.numero_vuelta,
      estado: row.viaje_estado,
    },
    ordenSecuencia: row.orden_secuencia,
  };
}

export class WepPwaRepository {
  constructor({ postgresPool } = {}) {
    this.postgresPool = postgresPool || wepPostgresPool;
  }

  async getPwaViajes(fecha, vehiculoId) {
    const result = await this.postgresPool.query(PWA_VIAJES_QUERY, [
      fecha,
      vehiculoId,
    ]);
    return groupPwaViajes(result.rows);
  }

  async getPwaEntregaDetalle(id, vehiculoId) {
    const result = await this.postgresPool.query(PWA_ENTREGA_DETALLE_QUERY, [
      id,
      vehiculoId,
    ]);
    return mapPwaEntregaDetalle(result.rows[0]);
  }

  async resolvePwaQr(qr, vehiculoId) {
    const divisionBusqueda = normalizeNumericQrSegment(qr.division);
    const pedidoBusqueda = normalizeNumericQrSegment(qr.pedido);
    const matchResult = await this.postgresPool.query(PWA_QR_MATCH_QUERY, [
      divisionBusqueda,
      qr.tipo,
      pedidoBusqueda,
      vehiculoId,
    ]);

    if (matchResult.rows.length === 0) return null;

    const matchedViajes = groupPwaViajes(matchResult.rows);
    if (matchedViajes.length > 1) {
      throw new WepPwaQrTripConflictError(matchedViajes.length);
    }

    const [matchedViaje] = matchedViajes;
    if (matchedViaje.paradas.length > 1) {
      throw new WepPwaQrStopConflictError(matchedViaje.paradas.length);
    }

    const grupoId = matchedViaje.paradas[0].grupoId;
    const tripResult = await this.postgresPool.query(PWA_QR_TRIP_QUERY, [
      matchedViaje.id,
      vehiculoId,
    ]);
    const [viaje] = groupPwaViajes(tripResult.rows);
    const parada = viaje?.paradas.find((item) => item.grupoId === grupoId);

    if (!viaje || !parada) return null;
    return { viaje, parada };
  }

  async startPwaViaje(viajeId, vehiculoId) {
    let client;
    let transactionStarted = false;

    try {
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const viajeResult = await client.query(
        `SELECT id, estado, iniciado_at
         FROM public.viajes
         WHERE id = $1
           AND vehiculo_id = $2
         FOR UPDATE`,
        [viajeId, vehiculoId],
      );
      const viaje = viajeResult.rows[0];

      if (!viaje) {
        throw new WepPwaViajeNotFoundError("Viaje no encontrado");
      }

      if (viaje.estado === "EN_REPARTO") {
        throw new WepPwaViajeStateConflictError(
          "El viaje ya se encuentra en reparto",
        );
      }

      if (viaje.estado === "FINALIZADO") {
        throw new WepPwaViajeStateConflictError(
          "El viaje ya se encuentra finalizado",
        );
      }

      if (viaje.estado !== "PROGRAMADO") {
        throw new WepPwaViajeStateConflictError(
          "El viaje no se puede iniciar en su estado actual",
        );
      }

      const entregasResult = await client.query(
        `SELECT 1
         FROM public.entregas
         WHERE viaje_id = $1
         LIMIT 1`,
        [viajeId],
      );
      if (entregasResult.rows.length === 0) {
        throw new WepPwaViajeWithoutDeliveriesError(
          "El viaje no tiene entregas asignadas",
        );
      }

      const estadoResult = await client.query(
        `SELECT id
         FROM public.entrega_estados
         WHERE codigo = $1
         LIMIT 1`,
        ["EN_REPARTO"],
      );
      const estadoEnRepartoId = estadoResult.rows[0]?.id;
      if (estadoEnRepartoId === null || estadoEnRepartoId === undefined) {
        throw new Error("No existe el estado EN_REPARTO en entrega_estados");
      }

      const viajeActualizadoResult = await client.query(
        `UPDATE public.viajes
         SET estado = 'EN_REPARTO',
             iniciado_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
           AND estado = 'PROGRAMADO'
         RETURNING id, estado, iniciado_at`,
        [viajeId],
      );
      const viajeActualizado = viajeActualizadoResult.rows[0];
      if (!viajeActualizado) {
        throw new Error("No se pudo actualizar el viaje programado");
      }

      const entregasActualizadasResult = await client.query(
        `UPDATE public.entregas e
         SET estado_id = $2,
             updated_at = NOW()
         FROM public.entrega_estados estado_anterior
         WHERE e.viaje_id = $1
           AND e.estado_id = estado_anterior.id
           AND estado_anterior.codigo IN ('PROGRAMADA', 'ASIGNADA')
         RETURNING e.id, estado_anterior.id AS estado_anterior_id`,
        [viajeId, estadoEnRepartoId],
      );

      for (const entrega of entregasActualizadasResult.rows) {
        await client.query(
          `INSERT INTO public.entrega_eventos
             (entrega_id, estado_anterior_id, estado_nuevo_id, tipo_evento,
              usuario_tipo, usuario_id, detalle, created_at)
           VALUES ($1, $2, $3, 'VIAJE_INICIADO', 'VEHICULO', $4,
                   'Entrega puesta en reparto al iniciar el viaje', NOW())`,
          [
            entrega.id,
            entrega.estado_anterior_id,
            estadoEnRepartoId,
            String(vehiculoId),
          ],
        );
      }

      await client.query("COMMIT");
      transactionStarted = false;

      return {
        viaje: {
          id: Number(viajeActualizado.id),
          estado: viajeActualizado.estado,
          iniciadoAt: viajeActualizado.iniciado_at,
        },
        entregasActualizadas: entregasActualizadasResult.rows.length,
      };
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => {});
      }
      throw error;
    } finally {
      client?.release();
    }
  }

  async finishPwaViaje(viajeId, vehiculoId) {
    let client;
    let transactionStarted = false;

    try {
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const viajeResult = await client.query(
        `SELECT id, estado, iniciado_at, finalizado_at
         FROM public.viajes
         WHERE id = $1
           AND vehiculo_id = $2
         FOR UPDATE`,
        [viajeId, vehiculoId],
      );
      const viaje = viajeResult.rows[0];

      if (!viaje) {
        throw new WepPwaViajeNotFoundError("Viaje no encontrado");
      }

      if (viaje.estado === "PROGRAMADO") {
        throw new WepPwaViajeStateConflictError(
          "El viaje todavía no fue iniciado",
        );
      }

      if (viaje.estado === "FINALIZADO") {
        throw new WepPwaViajeStateConflictError(
          "El viaje ya se encuentra finalizado",
        );
      }

      if (viaje.estado !== "EN_REPARTO") {
        throw new WepPwaViajeStateConflictError(
          "El viaje no se puede finalizar en su estado actual",
        );
      }

      const entregasResult = await client.query(
        `SELECT e.id, ee.codigo AS estado
         FROM public.entregas e
         LEFT JOIN public.entrega_estados ee
           ON ee.id = e.estado_id
         WHERE e.viaje_id = $1
         ORDER BY e.id`,
        [viajeId],
      );
      const entregas = entregasResult.rows;

      if (entregas.length === 0) {
        throw new WepPwaViajeWithoutDeliveriesError(
          "El viaje no tiene entregas asignadas",
        );
      }

      const estadosTerminales = new Set([
        "ENTREGADA",
        "NO_ENTREGADA",
        "CANCELADA",
      ]);
      const entregasPendientes = entregas
        .filter(({ estado }) => !estadosTerminales.has(estado))
        .map(({ id, estado }) => ({ id: Number(id), estado }));

      if (entregasPendientes.length > 0) {
        throw new WepPwaViajePendingDeliveriesError(entregasPendientes);
      }

      const viajeActualizadoResult = await client.query(
        `UPDATE public.viajes
         SET estado = 'FINALIZADO',
             finalizado_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
           AND estado = 'EN_REPARTO'
         RETURNING id, estado, iniciado_at, finalizado_at`,
        [viajeId],
      );
      const viajeActualizado = viajeActualizadoResult.rows[0];
      if (!viajeActualizado) {
        throw new Error("No se pudo finalizar el viaje en reparto");
      }

      const resumen = entregas.reduce(
        (acumulado, entrega) => {
          acumulado.totalEntregas += 1;
          if (entrega.estado === "ENTREGADA") acumulado.entregadas += 1;
          if (entrega.estado === "NO_ENTREGADA") acumulado.noEntregadas += 1;
          if (entrega.estado === "CANCELADA") acumulado.canceladas += 1;
          return acumulado;
        },
        {
          totalEntregas: 0,
          entregadas: 0,
          noEntregadas: 0,
          canceladas: 0,
        },
      );

      await client.query("COMMIT");
      transactionStarted = false;

      return {
        viaje: {
          id: Number(viajeActualizado.id),
          estado: viajeActualizado.estado,
          iniciadoAt: viajeActualizado.iniciado_at,
          finalizadoAt: viajeActualizado.finalizado_at,
        },
        resumen,
      };
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => {});
      }
      throw error;
    } finally {
      client?.release();
    }
  }

  async updatePwaViajeOrden(viajeId, entregas, vehiculoId) {
    let client;
    let transactionStarted = false;

    try {
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const viajeResult = await client.query(
        "SELECT id FROM public.viajes WHERE id = $1 AND vehiculo_id = $2",
        [viajeId, vehiculoId],
      );
      if (viajeResult.rows.length === 0) {
        throw new WepPwaViajeNotFoundError("Viaje no encontrado");
      }

      const entregasResult = await client.query(
        "SELECT id FROM public.entregas WHERE viaje_id = $1 ORDER BY id",
        [viajeId],
      );
      const idsDelViaje = new Set(
        entregasResult.rows.map(({ id }) => Number(id)),
      );

      if (entregas.some(({ id }) => !idsDelViaje.has(id))) {
        throw new WepPwaEntregaMismatchError(
          "Una o más entregas no pertenecen al viaje indicado",
        );
      }

      if (
        entregas.length !== idsDelViaje.size ||
        Array.from(idsDelViaje).some(
          (id) => !entregas.some((entrega) => entrega.id === id),
        )
      ) {
        throw new WepPwaOrdenIncompletoError(
          "Debe enviarse el orden completo de las entregas del viaje",
        );
      }

      const actualizadas = [];
      for (const entrega of entregas) {
        const updateResult = await client.query(
          `UPDATE public.entregas
           SET orden_secuencia = $1,
               updated_at = NOW()
           WHERE id = $2
             AND viaje_id = $3
           RETURNING id, orden_secuencia`,
          [entrega.orden, entrega.id, viajeId],
        );

        if (updateResult.rows.length !== 1) {
          throw new WepPwaEntregaMismatchError(
            "Una o más entregas no pertenecen al viaje indicado",
          );
        }

        actualizadas.push({
          id: Number(updateResult.rows[0].id),
          ordenSecuencia: Number(updateResult.rows[0].orden_secuencia),
        });
      }

      await client.query("COMMIT");
      transactionStarted = false;

      return actualizadas.sort(
        (left, right) => left.ordenSecuencia - right.ordenSecuencia,
      );
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => {});
      }
      throw error;
    } finally {
      client?.release();
    }
  }
}

export default new WepPwaRepository();
