import { createHash } from "node:crypto";
import { validateReport } from "./report.validator.js";
import { contentHash, retry } from "./report.dropbox.js";
import { fault } from "./report.config.js";

const digest = value => createHash("sha256").update(value).digest("hex");
const timestamp = value => {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw fault("REPORT_DATE_INVALID");
  return new Date(value).toISOString();
};

export class ReportService {
  constructor({ repository, source, dropbox, config, logger = console }) {
    Object.assign(this, { repository, source, dropbox, config, logger });
    this.running = false;
  }
  async run() {
    if (this.running) return { skipped: "running" };
    this.running = true;
    try {
      return await this.repository.withLock(async store => {
        const c = this.config;
        const binding = digest(JSON.stringify([c.path, c.protocol, c.endpoint, c.version, c.auth, c.mailbox, c.folder, c.sender, c.subject, c.filename, c.sheet, c.columns, c.referenceSha256]));
        const state = await store.load() || { binding, cursor: null, watermark: timestamp(c.initialDate), rev: c.initialRev, processed: {}, hashes: {} };
        if (state.binding !== binding) throw fault("REPORT_STATE_BINDING_MISMATCH");
        const save = async () => { if (!c.dryRun) await store.save(state); };
        // Recover a crash between remote commit and local acknowledgement before reading mail.
        if (state.pending) {
          if (c.dryRun) throw fault("REPORT_PENDING_REQUIRES_RECOVERY");
          const remote = await this.dropbox.metadata(c.path);
          if (remote.content_hash === state.pending.hash) {
            this.commit(state, remote.rev);
            await save();
          } else if (remote.rev !== state.pending.rev) throw fault("REPORT_DROPBOX_CONFLICT");
        }
        const messages = [];
        let cursor = state.cursor, pages = 0;
        const cursors = new Set();
        // Adapter must use a stable snapshot/change cursor and enumerate ALL pages.
        do {
          const page = await retry(() => this.source.list({ cursor, mailbox: c.mailbox, folder: c.folder }));
          if (!Array.isArray(page.messages) || typeof page.hasMore !== "boolean" || typeof page.cursor !== "string" || cursors.has(page.cursor)) throw fault("REPORT_SOURCE_PAGE_INVALID");
          cursors.add(page.cursor);
          messages.push(...page.messages);
          cursor = page.cursor;
          if (++pages > 1000 || messages.length > 50000) throw fault("REPORT_SOURCE_LIMIT");
          if (!page.hasMore) break;
        } while (true);
        const candidates = [];
        for (const message of messages) {
          if (String(message.sender).toLowerCase() !== c.sender || message.subject !== c.subject) continue;
          const attachments = message.attachments?.filter(a => a.name === c.filename && !a.inline);
          if (!attachments?.length) continue;
          if (attachments.length !== 1 || !message.id || !attachments[0].id) throw fault("REPORT_ATTACHMENT_AMBIGUOUS");
          // reportAt is authoritative generation time, NEVER receivedDateTime by default.
          candidates.push({ message, attachment: attachments[0], date: timestamp(message.reportAt) });
        }
        candidates.sort((a, b) => a.date.localeCompare(b.date) || String(a.message.id).localeCompare(String(b.message.id)));
        const results = [];
        for (const { message, attachment, date } of candidates) {
          store.guard();
          const key = digest(JSON.stringify([message.id, attachment.id]));
          if (state.processed[key]) { results.push({ key, status: "duplicate" }); continue; }
          if (date <= state.watermark) {
            state.processed[key] = { status: "out_of_order", date };
            await save(); results.push({ key, status: "out_of_order" }); continue;
          }
          if (!Number.isSafeInteger(attachment.size) || attachment.size <= 0 || attachment.size > c.maxBytes) throw fault("REPORT_ATTACHMENT_SIZE");
          const buffer = await retry(() => this.source.download({ messageId: message.id, attachmentId: attachment.id, maxBytes: c.maxBytes }));
          if (!Buffer.isBuffer(buffer) || buffer.length !== attachment.size) throw fault("REPORT_ATTACHMENT_INCOMPLETE");
          let validation;
          try { validation = validateReport(buffer, c); }
          catch (error) {
            if (state.pending) throw error;
            state.processed[key] = { status: "invalid", date, code: error.code };
            await save(); results.push({ key, status: "invalid", code: error.code }); continue;
          }
          const hash = contentHash(buffer);
          if (c.dryRun) { results.push({ key, status: "validated", rows: validation.rows }); continue; }
          if (state.pending && (state.pending.key !== key || state.pending.hash !== hash)) throw fault("REPORT_PENDING_NOT_REPLAYED");
          const remote = await this.dropbox.metadata(c.path);
          if (remote.rev !== state.rev) throw fault("REPORT_DROPBOX_CONFLICT");
          state.pending = { key, hash, date, rev: state.rev };
          await save(); // durable upload intent precedes every remote mutation
          const uploaded = await retry(async () => {
            store.guard();
            const current = await this.dropbox.metadata(c.path);
            if (current.content_hash === hash) return current;
            if (current.rev !== state.pending.rev) throw fault("REPORT_DROPBOX_CONFLICT");
            return this.dropbox.upload(c.path, buffer, state.pending.rev);
          });
          if (uploaded.content_hash !== hash || !uploaded.rev) throw fault("REPORT_UPLOAD_INTEGRITY");
          this.commit(state, uploaded.rev);
          await save();
          results.push({ key, status: state.hashes[hash] === key ? "stored" : "duplicate_content", rows: validation.rows });
        }
        if (state.pending) throw fault("REPORT_PENDING_NOT_REPLAYED");
        state.cursor = cursor;
        await save();
        this.logger.info("[productos-web-report]", { dryRun: c.dryRun, results });
        return { dryRun: c.dryRun, results };
      });
    } catch (error) {
      // Do not log provider errors, response bodies, subjects, addresses or tokens.
      this.logger.error("[productos-web-report]", { code: "REPORT_RUN_FAILED" });
      throw fault("REPORT_RUN_FAILED");
    } finally { this.running = false; }
  }
  commit(state, rev) {
    const p = state.pending;
    state.processed[p.key] = { status: "stored", date: p.date, hash: p.hash };
    state.hashes[p.hash] ||= p.key;
    state.watermark = p.date;
    state.rev = rev;
    delete state.pending;
  }
}
