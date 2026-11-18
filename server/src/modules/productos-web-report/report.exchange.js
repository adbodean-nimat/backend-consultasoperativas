import { fault } from "./report.config.js";

export function createExchangeSource() {
  // Linux diagnostic confirmed EWS/NTLM and read-only access on port 8443.
  // The production adapter is still pending the real report/schema/date contract.
  throw fault("REPORT_EXCHANGE_ADAPTER_PENDING");
}
