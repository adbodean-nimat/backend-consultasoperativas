import { fault } from "./report.config.js";

export function createExchangeSource() {
  // EWS/HTTPS endpoint confirmed. The runtime authentication flow and mailbox
  // authorization still need verification before selecting a transport adapter.
  throw fault("REPORT_EXCHANGE_ACCESS_NOT_CONFIRMED");
}
