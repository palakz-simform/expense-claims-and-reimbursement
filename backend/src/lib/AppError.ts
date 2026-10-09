// One problem found while validating a request, so a form can mark the field
export interface ValidationDetail {
  in: "body" | "query" | "params";
  path: string;
  message: string;
}

// An error we throw on purpose, carrying the HTTP status and the stable API error code.
// The central error handler turns it into { error: { code, message, details?, requestId } }.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ValidationDetail[],
  ) {
    super(message);
    this.name = "AppError";
  }
}
