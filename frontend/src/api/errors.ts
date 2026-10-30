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

// Field errors of a 400 VALIDATION_ERROR as { amount: 'Amount must be…' } (body fields only)
export function fieldErrorsOf(error: unknown): Record<string, string> {
  const fieldErrors: Record<string, string> = {}
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) {
    return fieldErrors
  }
  for (const detail of error.details) {
    const isBodyField = detail?.in === 'body' && typeof detail.path === 'string'
    if (isBodyField && !fieldErrors[detail.path]) {
      fieldErrors[detail.path] = String(detail.message)
    }
  }
  return fieldErrors
}
