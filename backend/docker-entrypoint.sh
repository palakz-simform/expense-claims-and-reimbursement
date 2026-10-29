#!/bin/sh
# Container start script: apply pending DB migrations, then start the API.
# Runs on every start; `migrate deploy` only applies migrations not yet applied,
# so a restart with nothing new is a no-op. It never seeds data.

# Stop at the first failing command, so a failed migration never starts the API
# against a half-migrated database.
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Starting API..."
# `exec` replaces this shell with node, so node is PID 1 and receives
# SIGTERM from `docker stop` directly (server.ts then shuts down gracefully).
exec node dist/server.js
