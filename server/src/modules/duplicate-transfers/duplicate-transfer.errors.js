export class DuplicateTransferError extends Error {
  constructor(message, { status = 500, code = "DUPLICATE_TRANSFER_ERROR", details = [], cause, ambiguous = false, transient = false } = {}) {
    super(message, { cause });
    this.name = "DuplicateTransferError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.ambiguous = ambiguous;
    this.transient = transient;
  }
}

export class DuplicateTransferValidationError extends DuplicateTransferError {
  constructor(details) {
    super("Los datos enviados no son válidos", {
      status: 400,
      code: "VALIDATION_ERROR",
      details,
    });
  }
}

export function sanitizeError(error) {
  const known = error instanceof DuplicateTransferError;
  const raw = known ? error.message : "Ocurrió un error interno en el monitor";
  const message = String(raw)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/(access[_ -]?token|password|authorization)\s*[:=]\s*[^\s,;}]+/gi, "$1=[REDACTED]")
    .slice(0, 1000);
  return {
    code: known ? error.code : "INTERNAL_ERROR",
    message,
    status: known ? error.status : 500,
    transient: Boolean(error?.transient),
    ambiguous: Boolean(error?.ambiguous),
  };
}
