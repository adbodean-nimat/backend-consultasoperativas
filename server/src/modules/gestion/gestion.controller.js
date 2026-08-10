import * as service from "./gestion.service.js";
import {
  validateCreateBody,
  validateDateParam,
  validateListQuery,
  validateUpdateBody,
} from "./gestion.validator.js";

export async function getAutomaticos(req, res, next) {
  try {
    const fecha = validateDateParam(req.query.fecha);
    return res
      .status(200)
      .json({ ok: true, data: await service.getAutomaticos(fecha) });
  } catch (error) {
    return next(error);
  }
}

export async function getByFecha(req, res, next) {
  try {
    const fecha = validateDateParam(req.params.fecha);
    return sendByFecha(fecha, res);
  } catch (error) {
    return next(error);
  }
}

export async function getByQueryFecha(req, res, next) {
  try {
    const fecha = validateDateParam(req.query.fecha);
    return sendByFecha(fecha, res);
  } catch (error) {
    return next(error);
  }
}

async function sendByFecha(fecha, res) {
    console.log("[gestion] Consultando indicadores de gestión para la fecha", {
      fecha,
    });
    const data = await service.getByFecha(fecha);
    if (!data) {
      return res.status(404).json({
        ok: false,
        message: "No existe un registro para la fecha indicada",
        errors: [],
      });
    }
    return res.status(200).json({ ok: true, data });
}

export async function getList(req, res, next) {
  try {
    const filters = validateListQuery(req.query);
    const result = await service.getList(filters);
    return res.status(200).json({
      ok: true,
      data: result.data,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        total: result.total,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function create(req, res, next) {
  try {
    const data = validateCreateBody(req.body);
    return res
      .status(201)
      .json({ ok: true, data: await service.create(data, req) });
  } catch (error) {
    return next(error);
  }
}

export async function update(req, res, next) {
  try {
    const fecha = validateDateParam(req.params.fecha);
    const data = validateUpdateBody(req.body, fecha);
    return res
      .status(200)
      .json({ ok: true, data: await service.update(fecha, data, req) });
  } catch (error) {
    return next(error);
  }
}
