import pino from "pino";
import { env } from "../config/env";

// The one application logger (import this; do not use console.* in app code).
// Concept: structured logging. Every line is a JSON object (searchable by field), not free text.
const isDev = env.NODE_ENV === "development";

export const logger = pino({
  level: env.LOG_LEVEL,

  // Never write secrets to logs: these fields are replaced with "[REDACTED]"
  redact: { paths: ["password", "passwordHash", "token", "req.headers.authorization"], censor: "[REDACTED]" },

  timestamp: pino.stdTimeFunctions.isoTime,

  // Development: readable colours. Everywhere else: plain JSON on stdout (the Docker convention),
  // with level names ("info") instead of numbers (30) so log tools can filter by them.
  ...(isDev
    ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" } } }
    : { formatters: { level: (label: string) => ({ level: label }) } }),
});
