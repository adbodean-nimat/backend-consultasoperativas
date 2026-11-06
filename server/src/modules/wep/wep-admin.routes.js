import express from "express";
import authService, { WepAdminError } from "./wep-admin-auth.js";
import dashboardRepository, { validateDashboardQuery } from "./wep-admin-dashboard.repository.js";
import { createWepLoginRateLimit } from "./wep-login-rate-limit.middleware.js";
import settingsService from "./wep-settings.service.js";
import integrationDiagnostics from "./wep-integration-diagnostics.js";

export function createWepAdminRouter({ auth = authService, repository = dashboardRepository,
  loginRateLimit = createWepLoginRateLimit(), settings = settingsService, diagnostics = integrationDiagnostics } = {}) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const handle = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
  router.post("/login", loginRateLimit, handle(async (req, res) => {
    const result = await auth.login(req.body?.username, req.body?.password);
    res.json({ ok: true, ...result });
  }));
  router.use(async (req, _res, next) => {
    try { req.wepAdmin = await auth.authenticate(req.headers.authorization); next(); }
    catch (error) { next(error); }
  });
  const tic = (req, _res, next) => req.wepAdmin.role === "TIC" ? next() : next(new WepAdminError("Esta sección está disponible para TIC.", 403));
  router.get("/me", handle(async (req, res) => res.json({ ok: true, user: req.wepAdmin })));
  router.get("/dashboard", handle(async (req, res) => res.json({ ok: true, ...await repository.dashboard(validateDashboardQuery(req.query)) })));
  router.get("/technical", tic, handle(async (req, res) => res.json({ ok: true, ...await repository.technical(validateDashboardQuery(req.query).fecha) })));
  router.get("/users", tic, handle(async (_req, res) => res.json({ ok: true, users: await auth.listUsers() })));
  router.get("/settings", tic, handle(async (_req, res) => res.json({ ok: true, ...await settings.read() })));
  router.put("/settings", tic, handle(async (req, res) => res.json({ ok: true, ...await settings.save(req.body, req.wepAdmin) })));
  router.get("/settings/history", tic, handle(async (_req, res) => res.json({ ok: true, history: await settings.history() })));
  router.post("/integrations/:provider/test", tic, handle(async (req, res) => res.json({ ok: true, ...await diagnostics.test(req.params.provider, req.body, req.wepAdmin) })));
  router.get("/vehicles", tic, handle(async (_req, res) => res.json({ ok: true, vehicles: await settings.vehicles() })));
  router.patch("/vehicles/:id", tic, handle(async (req, res) => {
    if (!/^[1-9]\d{0,12}$/.test(req.params.id)) throw new WepAdminError("Camión inválido.");
    res.json(await settings.saveVehicle(Number(req.params.id), req.body, req.wepAdmin));
  }));
  router.post("/users", tic, handle(async (req, res) => res.status(201).json({ ok: true, user: await auth.saveUser(req.body) })));
  router.patch("/users/:id", tic, handle(async (req, res) => {
    if (!/^[1-9]\d{0,8}$/.test(req.params.id)) throw new WepAdminError("Usuario inválido.");
    res.json({ ok: true, user: await auth.saveUser(req.body, Number(req.params.id)) });
  }));
  router.use((error, _req, res, _next) => {
    const status = error instanceof WepAdminError ? error.status : 503;
    res.status(status).json({ ok: false, message: error instanceof WepAdminError ? error.message : "No pudimos consultar WEP. TIC debe revisar la conexión y las migraciones del servidor." });
  });
  return router;
}
export default createWepAdminRouter();
