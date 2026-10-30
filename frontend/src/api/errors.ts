// One error type for every failed API call, built from the backend's { error: { code, message, ... } }.
// Pages only ever handle ApiError, never raw axios errors.
export class ApiError extends Error {
  // HTTP status (0 when the server was never reached)
  readonly status: number
  // Stable machine-readable code from the README error table, e.g. CLAIM_LOCKED
  readonly code: string
  // Matches the X-Request-Id header and the server log line
  readonly requestId: string | undefined
  // Field errors on 400 VALIDATION_ERROR: [{ in, path, message }]
  readonly details: unknown

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}
