#!/usr/bin/env bash
# Manual deployment script for the Raspberry Pi.
# Pulls the latest code, checks for .env, rebuilds Docker images, and verifies the API.
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Prerequisites on the Pi:
#   - Docker + Docker Compose installed
#   - Git installed
#   - mda-agents/.env exists with MENDIX_TOKEN and MENDIX_APP_ID

set -euo pipefail

REPO_DIR="$HOME/Projects/mda-master-thesis-workspace"
COMPOSE_FILE="$REPO_DIR/docker-compose.yml"
ENV_FILE="$REPO_DIR/mda-agents/.env"

echo "[1/4] Pulling latest code from main ..."
cd "$REPO_DIR"
git fetch origin main
git reset --hard origin/main
echo "      $(git log -1 --oneline)"

echo "[2/4] Checking .env ..."
if [ ! -f "$ENV_FILE" ]; then
  echo "      Missing: $ENV_FILE"
  echo ""
  echo "      Create it with:"
  echo "        MENDIX_TOKEN=your_pat_here"
  echo "        MENDIX_APP_ID=your_app_uuid_here"
  echo "        MENDIX_MODULE_NAME=MyFirstModule"
  echo "        MENDIX_BRANCH=main"
  exit 1
fi
echo "      .env found"

echo "[3/4] Rebuilding Docker images and restarting services ..."
docker compose -f "$COMPOSE_FILE" build --pull
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
echo "      Services restarted"

echo "[4/4] Waiting for API server ..."
sleep 5

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/health" || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "      API server is healthy"
  echo ""
  echo "Pipeline is running!"
  echo "  POST https://mda.tlolab.com/api/model"
  echo "  GET  https://mda.tlolab.com/health"
else
  echo "      API server not responding (HTTP $HTTP_STATUS)"
  docker compose -f "$COMPOSE_FILE" logs --tail=30
  exit 1
fi
