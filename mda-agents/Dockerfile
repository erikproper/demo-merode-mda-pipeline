# Multi-stage build for the TypeScript agents.
# Supports linux/amd64 and linux/arm64 (Raspberry Pi 4/5).
#
# Each service in docker-compose.yml sets its own CMD, e.g.:
#   node dist/demo-to-pim-agent.js

# Stage 1: compile TypeScript
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx tsc

# Agents load schemas and test data via fs.readFileSync at runtime.
# After tsc, __dirname resolves to /app/dist — copy assets there too.
RUN cp schemas/*.json dist/schemas/ && \
    mkdir -p dist/tests && \
    cp tests/*.json dist/tests/

# Stage 2: lean runtime image (no devDependencies, no TypeScript toolchain)
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

USER node
