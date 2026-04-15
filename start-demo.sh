#!/bin/bash
# ── SyncAgent Local Demo Starter ────────────────────────────────────────────
# Starts MongoDB via Docker, then the backend and frontend for a local demo.
# Requirements: Docker, Node.js 18+

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "  ███████╗██╗   ██╗███╗   ██╗ ██████╗      █████╗  ██████╗ ███████╗███╗   ██╗████████╗"
echo "  ██╔════╝╚██╗ ██╔╝████╗  ██║██╔════╝     ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝"
echo "  ███████╗ ╚████╔╝ ██╔██╗ ██║██║          ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   "
echo "  ╚════██║  ╚██╔╝  ██║╚██╗██║██║          ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   "
echo "  ███████║   ██║   ██║ ╚████║╚██████╗     ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   "
echo "  ╚══════╝   ╚═╝   ╚═╝  ╚═══╝ ╚═════╝     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   "
echo -e "${NC}"
echo -e "${YELLOW}  Salesforce ↔ JIRA Sync Agent — Demo Mode${NC}"
echo ""

# ── 1. Start MongoDB ──────────────────────────────────────────────────────
echo -e "${GREEN}▶ Starting MongoDB...${NC}"

# Try brew first (fastest if installed)
if command -v mongod &>/dev/null; then
  if ! pgrep mongod &>/dev/null; then
    brew services start mongodb-community 2>/dev/null || mongod --fork --logpath /tmp/mongod.log --dbpath /tmp/mongo_data || true
    echo "  MongoDB started via Homebrew."
  else
    echo "  MongoDB already running."
  fi
# Otherwise try Docker
elif command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' | grep -q '^sync_mongo$'; then
    echo "  MongoDB container already running."
  else
    docker run -d \
      --name sync_mongo \
      -p 27017:27017 \
      --restart unless-stopped \
      -e MONGO_INITDB_DATABASE=salesforce_jira_sync \
      mongo:7 > /dev/null
    echo "  MongoDB container started. Waiting for it to be ready..."
    sleep 4
  fi
else
  echo -e "${YELLOW}  WARNING: Could not find MongoDB or Docker."
  echo -e "  Install one of: mongod (brew install mongodb-community) or Docker Desktop${NC}"
  echo -e "  The backend will keep retrying until MongoDB is available."
fi

# ── 2. Start Backend ──────────────────────────────────────────────────────
echo -e "${GREEN}▶ Starting Backend (port 5000)...${NC}"
cd backend
npm start &
BACKEND_PID=$!
cd ..
echo "  Backend PID: $BACKEND_PID"
sleep 3

# ── 3. Start Frontend ─────────────────────────────────────────────────────
echo -e "${GREEN}▶ Starting Frontend (port 3000)...${NC}"
cd frontend
BROWSER=none npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo -e "${GREEN}✓ SyncAgent is starting up!${NC}"
echo ""
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5000/api"
echo "  Health:   http://localhost:5000/health"
echo ""
echo "  Demo mode is active — the app shows realistic sample data."
echo "  Press Ctrl+C to stop all services."
echo ""

# Cleanup on exit
cleanup() {
  echo ""
  echo -e "${YELLOW}Stopping services...${NC}"
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

wait
