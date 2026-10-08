import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/AppError";

// Unknown routes use the same error shape as everything else
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, "NOT_FOUND", "Route not found"));
};

// Every error ends up here. Clients only see { error: { code, message, requestId } }.
// Concept: expected errors (AppError, 4xx) vs unexpected errors (bugs, 500).
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Builds every response body so they all have the same shape; requestId links it to the log line
  const send = (status: number, code: string, message: string) =>
    res.status(status).json({ error: { code, message, requestId: req.id } });

  // Expected: thrown on purpose
  if (err instanceof AppError) {
    send(err.status, err.code, err.message);
    return;
  }

  // Expected: body failed Zod validation
  if (err instanceof ZodError) {
    send(400, "VALIDATION_ERROR", err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
    return;
  }

  // Expected: malformed JSON (thrown by express.json)
  if (err?.type === "entity.parse.failed") {
    send(400, "INVALID_JSON", "Request body is not valid JSON");
    return;
  }

  // Unexpected: the request's log line records the stack; the client gets a generic message
  res.err = err instanceof Error ? err : new Error(String(err));
  send(500, "INTERNAL_ERROR", "Something went wrong");
};
