#!/bin/bash
#============================================================
# ServerManager - Update Script
# Run this on the server to pull the latest changes
#============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_DIR="/opt/servermanager"
BRANCH="claude/server-management-system-APf5N"

echo -e "${GREEN}"
echo "============================================"
echo "    ServerManager Update Script"
echo "============================================"
echo -e "${NC}"

# Check root
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (sudo)${NC}"
    exit 1
fi

# Check if APP_DIR exists and is a git repo
if [ ! -d "$APP_DIR/.git" ]; then
    echo -e "${RED}Error: $APP_DIR is not a git repository.${NC}"
    echo "Please reinstall ServerManager first."
    exit 1
fi

cd "$APP_DIR"

# Show current version
if [ -f "version.json" ]; then
    CURRENT=$(python3 -c "import json; print(json.load(open('version.json'))['version'])" 2>/dev/null || echo "unknown")
    echo -e "  Current version: ${YELLOW}${CURRENT}${NC}"
fi

echo ""
echo -e "${BLUE}[1/5] Pulling latest changes...${NC}"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

# Show new version
if [ -f "version.json" ]; then
    NEW_VERSION=$(python3 -c "import json; print(json.load(open('version.json'))['version'])" 2>/dev/null || echo "unknown")
    echo -e "  New version: ${GREEN}${NEW_VERSION}${NC}"
fi

echo ""
echo -e "${BLUE}[2/5] Installing backend dependencies...${NC}"
cd "$APP_DIR/backend"
npm install --production 2>&1 | tail -3

echo ""
echo -e "${BLUE}[3/5] Running database migrations...${NC}"
# Clean up any failed migrations first
if command -v psql &> /dev/null && [ -f "$APP_DIR/backend/.env" ]; then
    DB_URL=$(grep DATABASE_URL "$APP_DIR/backend/.env" | cut -d '=' -f2-)
    if [ -n "$DB_URL" ]; then
        psql "$DB_URL" -c "DROP TABLE IF EXISTS server_log_paths CASCADE;" 2>/dev/null || true
        psql "$DB_URL" -c "DELETE FROM knex_migrations WHERE name = '011_create_server_logs.js';" 2>/dev/null || true
    fi
fi
npx knex migrate:latest --knexfile src/config/knexfile.js 2>&1 || echo -e "${YELLOW}  Migrations may have already been applied${NC}"

echo ""
echo -e "${BLUE}[4/5] Building frontend...${NC}"
cd "$APP_DIR/frontend"
npm install 2>&1 | tail -3
npx vite build 2>&1 | tail -5

echo ""
echo -e "${BLUE}[5/5] Restarting service...${NC}"
systemctl restart servermanager
sleep 2

if systemctl is-active --quiet servermanager; then
    echo -e "${GREEN}  Service is running${NC}"
else
    echo -e "${RED}  Service failed to start! Check: journalctl -u servermanager -n 30${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Update complete!${NC}"
if [ -n "$NEW_VERSION" ]; then
    echo -e "${GREEN}  Version: ${NEW_VERSION}${NC}"
fi
echo -e "${GREEN}============================================${NC}"
