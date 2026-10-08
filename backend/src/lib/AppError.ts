// An error we throw on purpose, carrying the HTTP status and the stable API error code.
// The central error handler turns it into { error: { code, message } }.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
