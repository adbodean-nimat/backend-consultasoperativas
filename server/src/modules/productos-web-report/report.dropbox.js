import { Dropbox } from "dropbox";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { fault } from "./report.config.js";

export function contentHash(buffer) {
  const hashes = [];
  for (let i = 0; i < buffer.length; i += 4 * 1024 * 1024) hashes.push(createHash("sha256").update(buffer.subarray(i, i + 4 * 1024 * 1024)).digest());
  return createHash("sha256").update(Buffer.concat(hashes)).digest("hex");
}
export async function retry(operation, { sleep = delay, attempts = 4 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const status = error.status;
      const code = error.cause?.code || error.code || error.name;
      const temporary = status === 429 || status >= 500 || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT", "TimeoutError", "AbortError"].includes(code);
      if (!temporary || attempt + 1 >= attempts) throw error;
      const header = error.headers?.get?.("retry-after");
      const seconds = Number(header);
      await sleep(Math.min(30000, Math.max(500 * 2 ** attempt, Number.isFinite(seconds) ? seconds * 1000 : 0)));
    }
  }
}

// Reuses the existing Dropbox app, offline authorization and installed SDK.
// Does not import the product conversion scripts (which configure unrelated outputs).
export class ReportDropbox {
  constructor({ env = process.env, client } = {}) {
    if (!client && ["DROPBOX_APP_KEY", "DROPBOX_APP_SECRET", "DROPBOX_REFRESH_TOKEN"].some(k => !env[k])) throw fault("REPORT_DROPBOX_CONFIG");
    this.client = client || new Dropbox({
      clientId: env.DROPBOX_APP_KEY, clientSecret: env.DROPBOX_APP_SECRET,
      refreshToken: env.DROPBOX_REFRESH_TOKEN,
      fetch: (url, options) => fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(30000) }),
    });
  }
  async metadata(path) {
    return retry(async () => (await this.client.filesGetMetadata({ path })).result);
  }
  async upload(path, buffer, rev) {
    // Retry/reconcile in service: an interrupted upload may already have committed.
    return (await this.client.filesUpload({ path, contents: buffer,
      mode: { ".tag": "update", update: rev }, autorename: false,
      strict_conflict: true, mute: true,
    })).result;
  }
}
