# =============================================================================
# mda-agents/Dockerfile
#
# Multi-stage build for TypeScript agents.
# Supports linux/amd64 and linux/arm64 (Raspberry Pi 4/5).
#
# Stages:
#   builder  – install all deps + compile TypeScript → dist/
#   runtime  – production deps only + compiled JS
#
# No CMD is set here; each service in docker-compose.yml specifies its own:
#   demo-to-pim-agent:   node dist/demo-to-pim-agent.js
#   pim-to-mendix-agent: node dist/pim-to-mendix-agent.js
#   demo-publisher:      node dist/demo-publisher.js
# =============================================================================

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Install ALL dependencies (devDependencies needed for tsc)
COPY package*.json ./
RUN npm ci

# Copy full source tree and compile TypeScript → dist/
COPY . .
RUN npx tsc

# Copy JSON assets alongside compiled JS.
# Agents load schemas and test data via fs.readFileSync(__dirname + "/schemas/...")
# After tsc, __dirname resolves to /app/dist — so assets must live there too.
RUN cp schemas/*.json dist/schemas/ && \
    mkdir -p dist/tests && \
    cp tests/rent-a-car-mock.json dist/tests/rent-a-car-mock.json

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:18-alpine

WORKDIR /app

# Production dependencies only — no ts-node, tsc, etc.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled application + runtime assets from builder
COPY --from=builder /app/dist ./dist

# Unprivileged user for better container security
USER node

# CMD is intentionally omitted — set per-service in docker-compose.yml
