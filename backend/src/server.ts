import app from "./app";
import { env } from "./config/env";
import { prisma } from "./db/prisma";
import { logger } from "./lib/logger";

// Time in-flight requests get to finish before we exit anyway
const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "API listening");
});

// Graceful shutdown: stop taking new requests, let running ones finish, close the DB, then exit.
// Docker sends SIGTERM on `docker compose stop`.
let shuttingDown = false;

function shutdown(reason: string, exitCode: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, "Shutting down");

  // Safety net if something hangs (unref: this timer alone must not keep the process alive)
  setTimeout(() => {
    logger.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  // The callback runs once all in-flight requests are done
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(exitCode);
  });
  server.closeIdleConnections(); // idle keep-alive connections would otherwise delay close()
}

process.on("SIGINT", () => shutdown("SIGINT", 0));
process.on("SIGTERM", () => shutdown("SIGTERM", 0));

// Failures outside any request: the process may be in a bad state, so log as fatal and exit
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  shutdown("unhandledRejection", 1);
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  shutdown("uncaughtException", 1);
});
