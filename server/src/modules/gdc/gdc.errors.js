export class GdcError extends Error {
  constructor(message, { status = 500, code = "GDC_ERROR", errors = [], cause } = {}) {
    super(message, { cause });
    this.name = "GdcError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export class GdcValidationError extends GdcError {
  constructor(errors) {
    super("Los datos enviados no son válidos", {
      status: 400,
      code: "VALIDATION_ERROR",
      errors,
    });
    this.name = "GdcValidationError";
  }
}
