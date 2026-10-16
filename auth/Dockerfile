# syntax=docker/dockerfile:1.7
# Multi-stage build. Every dependency is pure JS (bcryptjs, not native bcrypt),
# so the same Dockerfile builds for linux/amd64 and linux/arm64 with no compiler.

ARG NODE_VERSION=22

# ---- deps: production node_modules only --------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
# Copy only the manifests first: this layer is cached until dependencies change,
# so editing source code does not trigger a reinstall.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---- test: dev deps + tests (CI runs `docker build --target test`) -----------
FROM node:${NODE_VERSION}-alpine AS test
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY src ./src
COPY test ./test
RUN npm test

# ---- runtime: minimal, non-root ------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
# The official image ships an unprivileged "node" user (uid 1000)
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "src/server.js"]
