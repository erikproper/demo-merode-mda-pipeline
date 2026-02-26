#!/usr/bin/env bash
# =============================================================================
# deploy.sh  –  Raspberry Pi deployment script
#
# Run this once to set up the Pi, or any time you want to manually redeploy.
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Prerequisites on the Pi:
#   - Docker + Docker Compose installed
#   - Git installed
#   - mda-agents/.env exists with MENDIX_TOKEN and MENDIX_APP_ID
# =============================================================================

set -euo pipefail

REPO_DIR="$HOME/Projects/mda-master-thesis-workspace"
COMPOSE_FILE="$REPO_DIR/docker-compose.yml"
ENV_FILE="$REPO_DIR/mda-agents/.env"

echo "============================================================"
echo " MDA Thesis — Raspberry Pi Deploy"
echo "============================================================"

# ── 1. Pull latest code from main ────────────────────────────────────────────
echo ""
echo "[1/4] Pulling latest code from main …"
cd "$REPO_DIR"
git fetch origin main
git reset --hard origin/main
echo "      ✓ $(git log -1 --oneline)"

# ── 2. Check .env ─────────────────────────────────────────────────────────────
echo ""
echo "[2/4] Checking .env …"
if [ ! -f "$ENV_FILE" ]; then
  echo "      ✗ Missing: $ENV_FILE"
  echo ""
  echo "      Create it with:"
  echo "        cat > $ENV_FILE <<EOF"
  echo "        MENDIX_TOKEN=your_pat_here"
  echo "        MENDIX_APP_ID=your_app_uuid_here"
  echo "        MENDIX_MODULE_NAME=MyFirstModule"
  echo "        MENDIX_BRANCH=main"
  echo "        EOF"
  exit 1
fi
echo "      ✓ .env found"

# ── 3. Rebuild images and restart containers ──────────────────────────────────
echo ""
echo "[3/4] Rebuilding Docker images and restarting services …"
docker compose -f "$COMPOSE_FILE" build --pull
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
echo "      ✓ Services restarted"

# ── 4. Health check ───────────────────────────────────────────────────────────
echo ""
echo "[4/4] Waiting for API server …"
sleep 5

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/health" || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "      ✓ API server is healthy"
  echo ""
  echo "============================================================"
  echo " Pipeline is running!"
  echo ""
  echo " Public API endpoint (Cloudflare Tunnel):"
  echo "   https://mda.tlolab.com/api/model   (POST DemoModel JSON)"
  echo "   https://mda.tlolab.com/health      (GET health check)"
  echo ""
  echo " Example:"
  echo "   curl -X POST https://mda.tlolab.com/api/model \\"
  echo "        -H 'Content-Type: application/json' \\"
  echo "        -d @mda-agents/tests/rent-a-car-mock.json"
  echo "============================================================"
else
  echo "      ✗ API server not responding (HTTP $HTTP_STATUS)"
  echo ""
  docker compose -f "$COMPOSE_FILE" logs --tail=30
  exit 1
fi
