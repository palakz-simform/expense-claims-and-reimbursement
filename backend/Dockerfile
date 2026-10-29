# syntax=docker/dockerfile:1

# ---- Build stage: all dependencies, generate the Prisma client, compile TypeScript ----
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Dependencies first, so this layer is cached until package.json or the lockfile changes
COPY package.json package-lock.json ./
RUN npm ci

# The Prisma client is generated from the schema (it is not committed), then tsc compiles src + the client into dist/
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
RUN npx prisma generate
COPY src ./src
RUN npm run build

# ---- Runtime stage: production dependencies and the compiled app only ----
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# The Prisma engine needs openssl and CA certificates (the slim image has neither)
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Only the packages the running app needs (no TypeScript, test tools or type packages)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The compiled app, taken from the build stage
COPY --from=build /app/dist ./dist

# Files the Prisma CLI needs to run `migrate deploy` when the container starts
COPY prisma ./prisma
COPY prisma.config.ts ./

# Start script (migrate, then run the API); must be executable
COPY --chmod=755 docker-entrypoint.sh ./

# Receipts (STORAGE_DRIVER=local) are written here. The folder belongs to the unprivileged user.
RUN mkdir -p /app/uploads && chown node:node /app/uploads
ENV UPLOAD_DIR=/app/uploads

# Never run as root inside the container
USER node

EXPOSE 4000
# Docker marks the container "healthy" only while /health answers (checked with Node's built-in fetch,
# so no curl is needed in the image). The grace period covers migrations running at start.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
