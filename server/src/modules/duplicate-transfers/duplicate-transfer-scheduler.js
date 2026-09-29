import cron from "node-cron";
import monitorService from "./duplicate-transfer-monitor.service.js";
import { getConfig } from "./duplicate-transfer-config.service.js";
import { CONFIG_REFRESH_MS } from "./duplicate-transfer.constants.js";
import { logMonitor } from "./duplicate-transfer.logger.js";

export function isDuplicateTransferSchedulerProcess(env = process.env) {
  const instance = env.NODE_APP_INSTANCE;
  return instance === undefined || instance === null || instance === "" || String(instance) === "0";
}

export class DuplicateTransferScheduler {
  constructor({ monitor = monitorService, configLoader = getConfig, refreshMs = CONFIG_REFRESH_MS, enabledForProcess = isDuplicateTransferSchedulerProcess() } = {}) {
    this.monitor = monitor;
    this.configLoader = configLoader;
    this.refreshMs = refreshMs;
    this.enabledForProcess = enabledForProcess;
    this.task = null;
    this.timer = null;
    this.signature = null;
    this.localRunning = false;
  }

  async execute() {
    if (this.localRunning) {
      logMonitor("info", "local_overlap_skipped");
      return;
    }
    this.localRunning = true;
    try { await this.monitor.run({ trigger: "cron", notify: true }); }
    catch (error) { logMonitor("error", "scheduled_run_failed", { code: error?.code || "INTERNAL_ERROR" }); }
    finally { this.localRunning = false; }
  }

  async refresh() {
    if (!this.enabledForProcess) return this.status();
    try {
      const config = await this.configLoader();
      const signature = `${config.enabled}|${config.cron_expression}|${config.timezone}|${config.version}`;
      if (signature === this.signature) return this.status();
      if (this.task) { this.task.stop(); this.task.destroy(); this.task = null; }
      this.signature = signature;
      if (config.enabled) {
        this.task = cron.createTask(config.cron_expression, () => this.execute(), { timezone: config.timezone, noOverlap: true, name: "duplicate-transfer-monitor" });
        this.task.start();
      }
      logMonitor("info", "scheduler_reloaded", { enabled: config.enabled, cronExpression: config.cron_expression, timezone: config.timezone });
      return this.status();
    } catch (error) {
      if (this.task) { this.task.stop(); this.task.destroy(); this.task = null; }
      logMonitor("error", "scheduler_refresh_failed", { code: error?.code || "CONFIG_ERROR" });
      return this.status();
    }
  }

  async start() {
    if (!this.enabledForProcess) {
      logMonitor("info", "scheduler_passive_instance", { nodeAppInstance: process.env.NODE_APP_INSTANCE });
      return this.status();
    }
    await this.refresh();
    if (!this.timer) {
      this.timer = setInterval(() => this.refresh(), this.refreshMs);
      this.timer.unref?.();
    }
    return this.status();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.task) { this.task.stop(); this.task.destroy(); }
    this.timer = null; this.task = null; this.signature = null;
  }

  status() {
    return { running: Boolean(this.task), nextRun: this.task?.getNextRun?.() || null, localExecutionRunning: this.localRunning, enabledForProcess: this.enabledForProcess };
  }
}

export default new DuplicateTransferScheduler();
