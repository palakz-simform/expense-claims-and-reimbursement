import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { AppError, type ValidationDetail } from "../lib/AppError";

type Source = "params" | "query" | "body";

// Validates params, query and body with Zod, then replaces them with the cleaned, typed values.
// Usage: router.post("/", validate({ body: schema }), controller.create)
// All problems are reported together as one 400 VALIDATION_ERROR with a `details` list.
export const validate =
  (schemas: Partial<Record<Source, ZodType>>): RequestHandler =>
  (req, _res, next) => {
    const details: ValidationDetail[] = [];

    for (const source of ["params", "query", "body"] as const) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source]);
      if (!result.success) {
        details.push(...result.error.issues.map((i) => ({ in: source, path: i.path.join("."), message: i.message })));
        continue;
      }

      // Express 5's req.query is read-only, so redefine the property instead of assigning it
      Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true, enumerable: true });
    }

    if (details.length > 0) {
      throw new AppError(400, "VALIDATION_ERROR", "Request validation failed", details);
    }
    next();
  };
