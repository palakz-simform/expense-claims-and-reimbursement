# syntax=docker/dockerfile:1

# ---- Build stage: install dependencies, type-check and bundle with Vite ----
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Dependencies first, so this layer is cached until package.json or the lockfile changes
COPY package.json package-lock.json ./
RUN npm ci

# The API URL is baked into the JS bundle at build time (Vite replaces import.meta.env.VITE_API_URL),
# so it is a build argument, not a runtime variable. Fail the build early if it is missing.
ARG VITE_API_URL
RUN test -n "$VITE_API_URL" || (echo "VITE_API_URL build arg is required" && exit 1)
ENV VITE_API_URL=$VITE_API_URL

# Source, then type-check + build into dist/
COPY . .
RUN npm run build

# ---- Runtime stage: static files served by nginx, no Node at all ----
# The unprivileged image runs as a non-root user and listens on 8080
FROM nginxinc/nginx-unprivileged:1.30-alpine AS runtime

# Our server config replaces the default site
COPY nginx.conf /etc/nginx/conf.d/default.conf

# The built app, taken from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
# Docker marks the container "healthy" only while nginx serves the built app's index.html
# (busybox wget ships with alpine)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/index.html || exit 1
