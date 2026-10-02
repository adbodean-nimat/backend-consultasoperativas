import { GdcError } from "./gdc.errors.js";
import { resourceDefinition, validateKey, validateChanges } from "./gdc.validator.js";

export function createGdcController(service, repository) {
  const actor = (req) => req.auth?.username ?? req.user?.sAMAccountName;
  return {
    get: async (req, res) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      req.once("aborted", abort);
      res.once("close", abort);
      try { res.json(await service.get(req.query, controller.signal)); }
      finally { req.removeListener("aborted", abort); res.removeListener("close", abort); }
    },
    list: async (req, res) => {
      const rows = await repository.list(resourceDefinition(req.params.resource));
      res.json({ ok: true, total: rows.length, rows });
    },
    create: async (req, res) => {
      const definition = resourceDefinition(req.params.resource);
      if (definition.key === "id") throw new GdcError("La configuración general se modifica con PUT", { status: 405, code: "GDC_METHOD_NOT_ALLOWED" });
      const key = validateKey(definition, req.body?.[definition.key]);
      const changes = validateChanges(definition, req.body, key, true);
      res.status(201).json({ ok: true, row: await repository.create(definition, key, changes, actor(req)) });
    },
    update: async (req, res) => {
      const definition = resourceDefinition(req.params.resource);
      const key = validateKey(definition, definition.key === "id" ? req.params.codigo ?? 1 : req.params.codigo);
      const changes = validateChanges(definition, req.body, key);
      res.json({ ok: true, row: await repository.update(definition, key, changes, actor(req)) });
    },
    deactivate: async (req, res) => {
      const definition = resourceDefinition(req.params.resource);
      if (definition.key === "id") throw new GdcError("La configuración general no se desactiva", { status: 405, code: "GDC_METHOD_NOT_ALLOWED" });
      const key = validateKey(definition, req.params.codigo);
      res.json({ ok: true, row: await repository.update(definition, key, { activo: false }, actor(req)) });
    },
  };
}
