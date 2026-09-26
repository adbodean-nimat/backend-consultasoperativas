import wepRepository from "./wep.repository.js";
import wepPostgresPool from "./wep-postgres.js";
import { normalizePlate } from "./plate.util.js";

const ALLOWED_VEHICLE_ERP_CODES = new Set(["101", "102", "103"]);

const VEHICLE_UPSERT = `
  WITH updated_incomplete_erp_data AS (
    UPDATE public.vehiculos
       SET nombre = COALESCE($2::text, nombre),
           patente = COALESCE($3::text, patente),
           activo = TRUE,
           updated_at = NOW()
     WHERE codigo_erp = $1
       AND ($2::text IS NULL OR $3::text IS NULL)
    RETURNING id, FALSE AS insertado
  ),
  upserted AS (
    INSERT INTO public.vehiculos
      (codigo_erp, nombre, patente, activo, created_at, updated_at)
    SELECT $1, $2, $3, TRUE, NOW(), NOW()
    WHERE $2::text IS NOT NULL
      AND $3::text IS NOT NULL
    ON CONFLICT (codigo_erp) WHERE codigo_erp IS NOT NULL
    DO UPDATE SET
      nombre = EXCLUDED.nombre,
      patente = COALESCE(EXCLUDED.patente, public.vehiculos.patente),
      activo = TRUE,
      updated_at = NOW()
    RETURNING id, (xmax = 0) AS insertado
  )
  SELECT id, insertado FROM updated_incomplete_erp_data
  UNION ALL
  SELECT id, insertado FROM upserted
  LIMIT 1
`;

const DELIVERY_UPSERT = `
  INSERT INTO public.entregas (
    orden_preparacion_division,
    orden_preparacion_tipo,
    orden_preparacion_numero,
    nota_pedido_division,
    nota_pedido_tipo,
    nota_pedido_numero,
    cliente_codigo,
    cliente_nombre,
    domicilio,
    localidad,
    zona_codigo,
    zona_nombre,
    telefono,
    telefono_alternativo,
    email,
    fecha_entrega,
    hora_desde,
    hora_hasta,
    observacion_entrega,
    observaciones,
    peso_calculado,
    volumen_calculado,
    bultos_calculados,
    vehiculo_id,
    viaje_id,
    estado_erp,
    estado_id,
    orden_secuencia,
    sincronizado_desde_erp_at,
    created_at,
    updated_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
    $21, $22, $23, $24, $25, $26, $27, NULL, NOW(), NOW(), NOW()
  )
  ON CONFLICT (
    orden_preparacion_division,
    orden_preparacion_tipo,
    orden_preparacion_numero
  ) DO UPDATE SET
    nota_pedido_division = EXCLUDED.nota_pedido_division,
    nota_pedido_tipo = EXCLUDED.nota_pedido_tipo,
    nota_pedido_numero = EXCLUDED.nota_pedido_numero,
    cliente_codigo = EXCLUDED.cliente_codigo,
    cliente_nombre = EXCLUDED.cliente_nombre,
    domicilio = EXCLUDED.domicilio,
    localidad = EXCLUDED.localidad,
    zona_codigo = EXCLUDED.zona_codigo,
    zona_nombre = EXCLUDED.zona_nombre,
    telefono = EXCLUDED.telefono,
    telefono_alternativo = EXCLUDED.telefono_alternativo,
    email = EXCLUDED.email,
    fecha_entrega = EXCLUDED.fecha_entrega,
    hora_desde = EXCLUDED.hora_desde,
    hora_hasta = EXCLUDED.hora_hasta,
    observacion_entrega = EXCLUDED.observacion_entrega,
    observaciones = EXCLUDED.observaciones,
    peso_calculado = EXCLUDED.peso_calculado,
    volumen_calculado = EXCLUDED.volumen_calculado,
    bultos_calculados = EXCLUDED.bultos_calculados,
    vehiculo_id = EXCLUDED.vehiculo_id,
    viaje_id = EXCLUDED.viaje_id,
    estado_erp = EXCLUDED.estado_erp,
    sincronizado_desde_erp_at = NOW(),
    updated_at = NOW()
  RETURNING (xmax = 0) AS insertada
`;

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function dateOnly(value) {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return [
      value.getUTCFullYear(),
      String(value.getUTCMonth() + 1).padStart(2, "0"),
      String(value.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

function timeOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const milliseconds = value.getUTCMilliseconds();
    const fraction = milliseconds
      ? `.${String(milliseconds).padStart(3, "0")}`
      : "";
    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(
      value.getUTCMinutes(),
    ).padStart(2, "0")}:${String(value.getUTCSeconds()).padStart(
      2,
      "0",
    )}${fraction}`;
  }

  const text = String(value).trim();
  const match = text.match(/(?:^|T)(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/);
  return match?.[1] ?? null;
}

function positiveVuelta(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function entityKey(parts) {
  return JSON.stringify(parts);
}

function prepareRows(rows) {
  const quality = {
    codigoVehiculoVacio: 0,
    codigoVehiculoNoPermitido: 0,
    patenteVacia: 0,
    nombreVehiculoVacio: 0,
    ordenPreparacionIncompleta: 0,
    fechaInvalida: 0,
    vueltaInvalida: 0,
    clienteSinTelefono: 0,
    domicilioVacio: 0,
    vehiculoNoResoluble: 0,
    viajeNoResoluble: 0,
  };

  const prepared = rows.map((row) => {
    const codigoErp = textOrNull(row.CodigoVehiculo);
    const patente = normalizePlate(row.PatenteVehiculo);
    const vehicleName = textOrNull(row.NombreVehiculo);
    const tripDate = dateOnly(row.SalidaVehiculo ?? row.FechaEntrega);
    const deliveryDate = dateOnly(row.FechaEntrega);
    const vuelta = positiveVuelta(row.Vuelta);
    const orderDivision = textOrNull(row.DivisionOrdenPreparacion);
    const orderType = textOrNull(row.TipoOrdenPreparacion);
    const orderNumber = textOrNull(row.NumeroOrdenPreparacion);
    const exclusionReasons = [];
    const codigoErpPermitido = ALLOWED_VEHICLE_ERP_CODES.has(codigoErp);

    if (!codigoErp) {
      quality.codigoVehiculoVacio += 1;
      exclusionReasons.push("codigoVehiculoVacio");
    } else if (!codigoErpPermitido) {
      quality.codigoVehiculoNoPermitido += 1;
      exclusionReasons.push("codigoVehiculoNoPermitido");
    }
    if (!patente) {
      quality.patenteVacia += 1;
    }
    if (!vehicleName) {
      quality.nombreVehiculoVacio += 1;
    }
    if (!orderDivision || !orderType || !orderNumber) {
      quality.ordenPreparacionIncompleta += 1;
      exclusionReasons.push("ordenPreparacionIncompleta");
    }
    if (!tripDate || !deliveryDate) {
      quality.fechaInvalida += 1;
      exclusionReasons.push("fechaInvalida");
    }
    if (!vuelta) {
      quality.vueltaInvalida += 1;
      exclusionReasons.push("vueltaInvalida");
    }
    if (!textOrNull(row.TelefonoCliente)) quality.clienteSinTelefono += 1;
    if (!textOrNull(row.DomicilioEntrega)) quality.domicilioVacio += 1;

    return {
      row,
      codigoErp,
      codigoErpPermitido,
      patente,
      vehicleName,
      tripDate,
      deliveryDate,
      vuelta,
      orderDivision,
      orderType,
      orderNumber,
      exclusionReasons,
    };
  });

  return { prepared, quality };
}

function safeErrorMessage(error) {
  const message = String(error?.message || "Error desconocido")
    .replace(/password\s*=\s*[^;\s]+/gi, "password=[REDACTED]")
    .replace(
      /WEP_PG_PASSWORD\s*[:=]\s*[^;\s]+/gi,
      "WEP_PG_PASSWORD=[REDACTED]",
    );
  return error?.code ? `${error.code}: ${message}` : message;
}

function normalizeSqlTime(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(11, 19);
}

export class WepSyncService {
  constructor({ sourceRepository, postgresPool, logger } = {}) {
    this.sourceRepository = sourceRepository || wepRepository;
    this.postgresPool = postgresPool || wepPostgresPool;
    this.logger = logger || console;
  }

  async synchronize(filters) {
    this.logger.info?.(
      `[WEP SYNC] Inicio ${filters.fechaDesde} -> ${filters.fechaHasta}`,
    );

    let client;
    let transactionStarted = false;
    try {
      const rows = await this.sourceRepository.getEntregasProgramadas(filters);
      this.logger.info?.(`[WEP SYNC] Filas ERP recibidas: ${rows.length}`);

      const { prepared, quality } = prepareRows(rows);
      const ignoredVehicleCodes = [
        ...new Set(
          prepared
            .filter((item) => item.codigoErp && !item.codigoErpPermitido)
            .map((item) => item.codigoErp),
        ),
      ];
      if (ignoredVehicleCodes.length) {
        this.logger.warn?.(
          `[WEP SYNC] Códigos ERP ignorados: ${ignoredVehicleCodes.join(", ")}`,
        );
      }
      client = await this.postgresPool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const vehicles = new Map();
      for (const item of prepared) {
        if (!item.codigoErpPermitido) continue;
        const previous = vehicles.get(item.codigoErp);
        vehicles.set(item.codigoErp, {
          codigoErp: item.codigoErp,
          nombre: item.vehicleName ?? previous?.nombre ?? null,
          patente: item.patente ?? previous?.patente ?? null,
          patenteErp:
            item.patente !== null
              ? item.row.PatenteVehiculo
              : (previous?.patenteErp ?? item.row.PatenteVehiculo),
        });
      }

      const vehicleIds = new Map();
      for (const [codigoErp, vehicle] of vehicles) {
        this.logger.info?.(
          `[WEP SYNC] Vehículo ERP=${codigoErp} patenteERP=${JSON.stringify(vehicle.patenteErp ?? null)} patenteNormalizada=${JSON.stringify(vehicle.patente)}`,
        );
        const result = await client.query(VEHICLE_UPSERT, [
          codigoErp,
          vehicle.nombre,
          vehicle.patente,
        ]);
        const vehicleId = result.rows[0]?.id;
        if (vehicleId === null || vehicleId === undefined) {
          this.logger.warn?.(
            `[WEP SYNC] Vehículo no creado codigoErp=${codigoErp}: patente vacía y sin registro existente`,
          );
          continue;
        }
        vehicleIds.set(codigoErp, vehicleId);
        const action =
          result.rows[0]?.insertado === true ? "creado" : "actualizado";
        this.logger.info?.(
          `[WEP SYNC] Vehículo ${action} codigoErp=${codigoErp} id=${vehicleId}`,
        );
      }
      this.logger.info?.(`[WEP SYNC] Vehículos procesados: ${vehicles.size}`);

      const trips = new Map();
      for (const item of prepared) {
        if (!item.codigoErpPermitido || !item.tripDate || !item.vuelta) {
          continue;
        }
        const vehicleId = vehicleIds.get(item.codigoErp);
        if (vehicleId === null || vehicleId === undefined) {
          quality.vehiculoNoResoluble += 1;
          continue;
        }
        const key = entityKey([vehicleId, item.tripDate, item.vuelta]);
        trips.set(key, {
          vehicleId,
          fecha: item.tripDate,
          numeroVuelta: item.vuelta,
        });
      }

      const tripIds = new Map();
      for (const [key, trip] of trips) {
        const result = await client.query(
          `INSERT INTO public.viajes
             (vehiculo_id, fecha, numero_vuelta, estado, created_at, updated_at)
           VALUES ($1, $2, $3, 'PROGRAMADO', NOW(), NOW())
           ON CONFLICT (vehiculo_id, fecha, numero_vuelta) DO UPDATE SET
             updated_at = NOW()
           RETURNING id`,
          [trip.vehicleId, trip.fecha, trip.numeroVuelta],
        );
        const tripId = result.rows[0]?.id;
        if (tripId === null || tripId === undefined) {
          throw new Error("No se pudo resolver un viaje sincronizado");
        }
        tripIds.set(key, tripId);
      }
      this.logger.info?.(`[WEP SYNC] Viajes procesados: ${trips.size}`);

      const eligible = prepared.filter(
        (item) => item.exclusionReasons.length === 0,
      );
      let programmedStateId = null;
      if (eligible.length) {
        const state = await client.query(
          "SELECT id FROM public.entrega_estados WHERE codigo = $1 LIMIT 1",
          ["PROGRAMADA"],
        );
        programmedStateId = state.rows[0]?.id;
        if (programmedStateId === null || programmedStateId === undefined) {
          throw new Error("No existe el estado PROGRAMADA en entrega_estados");
        }
      }

      let inserted = 0;
      let updated = 0;
      let processed = 0;
      for (const item of eligible) {
        const vehicleId = vehicleIds.get(item.codigoErp);
        if (vehicleId === null || vehicleId === undefined) {
          quality.vehiculoNoResoluble += 1;
          continue;
        }
        const tripKey = entityKey([vehicleId, item.tripDate, item.vuelta]);
        const tripId = tripIds.get(tripKey);
        if (tripId === null || tripId === undefined) {
          quality.viajeNoResoluble += 1;
          continue;
        }

        const row = item.row;
        const horaDesde =
          normalizeSqlTime(row.DesdeHoraEntrega) ??
          normalizeSqlTime(row.DesdeHoraVuelta) ??
          null;
        const horaHasta =
          normalizeSqlTime(row.HastaHoraEntrega) ??
          normalizeSqlTime(row.HastaHoraVuelta) ??
          null;
        const result = await client.query(DELIVERY_UPSERT, [
          item.orderDivision,
          item.orderType,
          item.orderNumber,
          textOrNull(row.DivisionNotaPedido),
          textOrNull(row.TipoNotaPedido),
          textOrNull(row.NumeroNotaPedido),
          textOrNull(row.CodigoCliente),
          textOrNull(row.NombreCliente),
          textOrNull(row.DomicilioEntrega),
          textOrNull(row.Localidad),
          textOrNull(row.CodigoZonaDistribucion),
          textOrNull(row.NombreZonaDistribucion),
          textOrNull(row.TelefonoDomicilio),
          textOrNull(row.TelefonoCliente),
          textOrNull(row.EmailCliente),
          item.deliveryDate,
          timeOrNull(horaDesde),
          timeOrNull(horaHasta),
          textOrNull(row.ObservacionEntrega),
          textOrNull(row.Observaciones),
          row.PesoCalculado ?? null,
          row.VolumenCalculado ?? null,
          row.BultosCalculados ?? null,
          vehicleId,
          tripId,
          textOrNull(row.Estado),
          programmedStateId,
        ]);
        processed += 1;
        if (result.rows[0]?.insertada === true) inserted += 1;
        else updated += 1;
      }

      await client.query("COMMIT");
      transactionStarted = false;

      const omitted = rows.length - processed;
      if (
        omitted > 0 ||
        quality.clienteSinTelefono > 0 ||
        quality.domicilioVacio > 0
      ) {
        this.logger.warn?.("[WEP SYNC] Resumen de calidad de datos", {
          filasOmitidas: omitted,
          ...quality,
        });
      }
      this.logger.info?.(`[WEP SYNC] Entregas procesadas: ${processed}`);
      this.logger.info?.("[WEP SYNC] Sincronización completada");

      return {
        ok: true,
        message: "Sincronización completada",
        sourceRows: rows.length,
        vehiculos: { procesados: vehicles.size },
        viajes: { procesados: trips.size },
        entregas: {
          procesadas: processed,
          insertadas: inserted,
          actualizadas: updated,
        },
        filasOmitidas: omitted,
        resumenOmisiones: quality,
      };
    } catch (error) {
      if (transactionStarted && client) {
        await client.query("ROLLBACK").catch(() => {});
      }
      this.logger.error?.(`[WEP SYNC] Error: ${safeErrorMessage(error)}`);
      throw error;
    } finally {
      client?.release();
    }
  }
}

export default new WepSyncService();
