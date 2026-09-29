import express from "express";
import defaultRepository, {
  CONFIG_RESOURCES,
} from "./rotacion-general-productos-config.repository.js";

export class RotacionProductosConfigRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "RotacionProductosConfigRequestError";
    this.status = status;
    this.code = code;
  }
}

function resourceDefinition(resource) {
  const definition = CONFIG_RESOURCES[resource];
  if (!definition) {
    throw new RotacionProductosConfigRequestError(
      404,
      "CONFIG_RESOURCE_NOT_FOUND",
      "Recurso de configuración inexistente",
    );
  }
  return definition;
}

function parseCode(value, definition, field = definition.codeField) {
  if (definition.codeType === "integer") {
    const text = String(value ?? "").trim();
    if (!/^\d+$/.test(text)) {
      throw new RotacionProductosConfigRequestError(
        400,
        "CONFIG_VALIDATION_ERROR",
        `${field} debe ser un entero no negativo`,
      );
    }
    const code = Number(text);
    if (!Number.isSafeInteger(code) || code > 2147483647) {
      throw new RotacionProductosConfigRequestError(
        400,
        "CONFIG_VALIDATION_ERROR",
        `${field} está fuera del rango permitido`,
      );
    }
    return code;
  }

  if (typeof value !== "string") {
    throw new RotacionProductosConfigRequestError(
      400,
      "CONFIG_VALIDATION_ERROR",
      `${field} debe ser texto`,
    );
  }
  const code = value.trim();
  if (!code || code.length > definition.codeMaxLength) {
    throw new RotacionProductosConfigRequestError(
      400,
      "CONFIG_VALIDATION_ERROR",
      `${field} es obligatorio y admite hasta ${definition.codeMaxLength} caracteres`,
    );
  }
  return code;
}

function parseDescription(value, definition) {
  if (typeof value !== "string") {
    throw new RotacionProductosConfigRequestError(
      400,
      "CONFIG_VALIDATION_ERROR",
      `${definition.descriptionField} debe ser texto`,
    );
  }
  const description = value.trim();
  if (!description || description.length > definition.descriptionMaxLength) {
    throw new RotacionProductosConfigRequestError(
      400,
      "CONFIG_VALIDATION_ERROR",
      `${definition.descriptionField} es obligatorio y admite hasta ${definition.descriptionMaxLength} caracteres`,
    );
  }
  return description;
}

function requireObject(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RotacionProductosConfigRequestError(
      400,
      "CONFIG_VALIDATION_ERROR",
      "El cuerpo debe ser un objeto JSON",
    );
  }
}

function rejectUnknownFields(body, allowedFields) {
  const unknown = Object.keys(body).filter((field) => !allowedFields.has(field));
  if (unknown.length) {
    throw new RotacionProductosConfigRequestError(
      400,
      "CONFIG_VALIDATION_ERROR",
      `Campos no permitidos: ${unknown.join(", ")}`,
    );
  }
}

function parseCreate(body, definition) {
  requireObject(body);
  rejectUnknownFields(
    body,
    new Set([definition.codeField, definition.descriptionField, "activo"]),
  );
  if (body.activo !== undefined && typeof body.activo !== "boolean") {
    throw new RotacionProductosConfigRequestError(
      400,
      "CONFIG_VALIDATION_ERROR",
      "activo debe ser booleano",
    );
  }
  return {
    code: parseCode(body[definition.codeField], definition),
    description: parseDescription(body[definition.descriptionField], definition),
    activo: body.activo ?? true,
  };
}

function parseUpdate(body, pathCode, definition) {
  requireObject(body);
  rejectUnknownFields(
    body,
    new Set([definition.codeField, definition.descriptionField, "activo"]),
  );
  const code = parseCode(pathCode, definition);
  if (
    body[definition.codeField] !== undefined &&
    parseCode(body[definition.codeField], definition) !== code
  ) {
    throw new RotacionProductosConfigRequestError(
      400,
      "CONFIG_CODE_IMMUTABLE",
      "El código no puede modificarse",
    );
  }

  const changes = {};
  if (body[definition.descriptionField] !== undefined) {
    changes.description = parseDescription(
      body[definition.descriptionField],
      definition,
    );
  }
  if (body.activo !== undefined) {
    if (typeof body.activo !== "boolean") {
      throw new RotacionProductosConfigRequestError(
        400,
        "CONFIG_VALIDATION_ERROR",
        "activo debe ser booleano",
      );
    }
    changes.activo = body.activo;
  }
  if (!Object.keys(changes).length) {
    throw new RotacionProductosConfigRequestError(
      400,
      "CONFIG_VALIDATION_ERROR",
      `Debe enviar ${definition.descriptionField} o activo`,
    );
  }
  return { code, changes };
}

function mapDatabaseError(error) {
  if (error?.code === "23505") {
    return new RotacionProductosConfigRequestError(
      409,
      "CONFIG_DUPLICATE_CODE",
      "Ya existe un registro con ese código",
    );
  }
  if (error?.code === "23503") {
    return new RotacionProductosConfigRequestError(
      409,
      "CONFIG_REFERENCE_CONFLICT",
      "El registro está siendo utilizado y no puede eliminarse",
    );
  }
  return error;
}

function sendError(res, error) {
  const mapped = mapDatabaseError(error);
  if (mapped instanceof RotacionProductosConfigRequestError) {
    return res.status(mapped.status).json({
      ok: false,
      code: mapped.code,
      message: mapped.message,
    });
  }
  console.error("Error en configuración de rotación de productos:", error);
  return res.status(500).json({
    ok: false,
    code: "CONFIG_INTERNAL_ERROR",
    message: "No se pudo procesar la configuración",
  });
}

export function createRotacionProductosConfigRouter(
  repository = defaultRepository,
) {
  const router = express.Router({ mergeParams: true });

  router.get("/:resource", async (req, res) => {
    try {
      const rows = await repository.list(resourceDefinition(req.params.resource));
      return res.status(200).json({ ok: true, total: rows.length, rows });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/:resource", async (req, res) => {
    try {
      const definition = resourceDefinition(req.params.resource);
      const row = await repository.create(
        definition,
        parseCreate(req.body, definition),
      );
      return res.status(201).json({ ok: true, row });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.put("/:resource/:codigo", async (req, res) => {
    try {
      const definition = resourceDefinition(req.params.resource);
      const { code, changes } = parseUpdate(
        req.body,
        req.params.codigo,
        definition,
      );
      const row = await repository.update(definition, code, changes);
      if (!row) {
        throw new RotacionProductosConfigRequestError(
          404,
          "CONFIG_ROW_NOT_FOUND",
          "Registro de configuración inexistente",
        );
      }
      return res.status(200).json({ ok: true, row });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.delete("/:resource/:codigo", async (req, res) => {
    try {
      const definition = resourceDefinition(req.params.resource);
      const code = parseCode(req.params.codigo, definition);
      const row = await repository.delete(definition, code);
      if (!row) {
        throw new RotacionProductosConfigRequestError(
          404,
          "CONFIG_ROW_NOT_FOUND",
          "Registro de configuración inexistente",
        );
      }
      return res.status(200).json({ ok: true, row });
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
}

export default createRotacionProductosConfigRouter();
