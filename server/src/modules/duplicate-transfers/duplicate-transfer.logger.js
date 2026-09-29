import { maskPhone } from "./duplicate-transfer.normalizer.js";

export function logMonitor(level, event, fields = {}) {
  const safe = { module: "duplicate-transfer-monitor", event, ...fields };
  if (safe.recipient) safe.recipient = maskPhone(safe.recipient);
  delete safe.accountCodes;
  delete safe.payload;
  const method = console[level] || console.log;
  method(JSON.stringify(safe));
}
