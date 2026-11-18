import "dotenv/config";
import { ReportDropbox } from "./report.dropbox.js";
import { TARGET_PATH, fault } from "./report.config.js";

// Read-only bootstrap aid: metadata only, fixed destination, no upload/download.
try {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw fault("REPORT_TLS_REQUIRED");
  const metadata = await new ReportDropbox().metadata(TARGET_PATH);
  if (metadata[".tag"] !== "file") throw fault("REPORT_DROPBOX_NOT_A_FILE");
  console.info(JSON.stringify({ path: TARGET_PATH, rev: metadata.rev, contentHash: metadata.content_hash,
    size: metadata.size, serverModified: metadata.server_modified }));
} catch {
  console.error(JSON.stringify({ ok: false, code: "REPORT_DROPBOX_METADATA_FAILED" }));
  process.exitCode = 1;
}
