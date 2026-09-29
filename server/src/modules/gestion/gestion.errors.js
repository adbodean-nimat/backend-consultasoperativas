export class GestionError extends Error {
  constructor(message, { status = 500, code = "GESTION_ERROR", errors = [], cause } = {}) {
    super(message, { cause });
    this.name = "GestionError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export class ValidationError extends GestionError {
  constructor(errors) {
    super("Los datos enviados no son válidos", {
      status: 400,
      code: "VALIDATION_ERROR",
      errors,
    });
  }
}

export class DatabaseContractError extends GestionError {
  constructor(message, cause) {
    super(message, {
      status: 503,
      code: "GESTION_DATABASE_CONTRACT_UNAVAILABLE",
      cause,
    });
  }
}
