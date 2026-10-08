import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/AppError";

// Unknown routes get the same error shape as everything else
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, "NOT_FOUND", "Route not found"));
};

// The single place every error ends up (Express 5 forwards rejected async handlers here too).
// Clients only ever see { error: { code, message } }; stack traces and Prisma errors stay in the logs.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Errors we threw on purpose
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  // Request body failed Zod validation
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
      },
    });
    return;
  }

  // Malformed JSON body (thrown by express.json)
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
    return;
  }

  // Anything else is a bug: log it, but never leak details to the client
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
