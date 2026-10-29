import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "../lib/logger";

// Gives every request an ID and writes ONE structured log line when the request finishes
// (method, url, status, duration, request ID). Mount it first so every request is covered.
export const requestLogger = pinoHttp({
  logger,

  // Request ID (correlation ID): a fresh UUID per request, also sent back in the response header
  // so a user can quote it when reporting a problem.
  genReqId: (_req, res) => {
    const id = randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },

  // Health probes would flood the logs with identical lines
  autoLogging: { ignore: (req) => req.url === "/health" },

  // pino-http logs everything at "info" by default, so set the level from the outcome:
  // 5xx = error, 4xx = warn (the client's mistake), otherwise info
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),

  // The default also logs every request header (including Authorization), so keep only what we need
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
