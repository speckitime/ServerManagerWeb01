#!/bin/bash
#============================================================
# ServerManager Linux Agent - Installation Script
# Supported: Debian/Ubuntu, RHEL/CentOS/Fedora
#============================================================

set -e

AGENT_DIR="/opt/servermanager-agent"
CONFIG_DIR="/etc/servermanager"
LOG_DIR="/var/log"
SERVICE_NAME="servermanager-agent"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}"
echo "========================================"
echo "  ServerManager Agent Installer"
echo "========================================"
echo -e "${NC}"

# Check root
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root${NC}"
    exit 1
fi

# Get configuration
read -p "Management Server URL (e.g., https://manager.example.com): " SERVER_URL
read -p "Agent API Key: " API_KEY

if [ -z "$SERVER_URL" ] || [ -z "$API_KEY" ]; then
    echo -e "${RED}Error: Server URL and API Key are required${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Installing dependencies...${NC}"

# Detect package manager
if command -v apt-get &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq python3 python3-pip python3-venv
elif command -v yum &>/dev/null; then
    yum install -y python3 python3-pip
elif command -v dnf &>/dev/null; then
    dnf install -y python3 python3-pip
else
    echo -e "${RED}Unsupported package manager${NC}"
    exit 1
fi

echo -e "${YELLOW}Setting up agent directory...${NC}"

# Create directories
mkdir -p "$AGENT_DIR"
mkdir -p "$CONFIG_DIR"

# Copy agent files
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/agent.py" "$AGENT_DIR/agent.py"
cp "$SCRIPT_DIR/requirements.txt" "$AGENT_DIR/requirements.txt"
chmod +x "$AGENT_DIR/agent.py"

# Create virtual environment and install dependencies
echo -e "${YELLOW}Installing Python dependencies...${NC}"
python3 -m venv "$AGENT_DIR/venv"
"$AGENT_DIR/venv/bin/pip" install --quiet -r "$AGENT_DIR/requirements.txt"

# Create configuration
echo -e "${YELLOW}Creating configuration...${NC}"
cat > "$CONFIG_DIR/agent.conf" << EOF
{
    "server_url": "$SERVER_URL",
    "api_key": "$API_KEY",
    "metrics_interval": 5,
    "heartbeat_interval": 30,
    "package_sync_interval": 3600,
    "verify_ssl": true
}
EOF
chmod 600 "$CONFIG_DIR/agent.conf"

# Create systemd service
echo -e "${YELLOW}Creating systemd service...${NC}"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=ServerManager Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${AGENT_DIR}/venv/bin/python3 ${AGENT_DIR}/agent.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Security hardening
NoNewPrivileges=no
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

echo ""
echo -e "${GREEN}========================================"
echo "  Installation Complete!"
echo "========================================"
echo ""
echo "  Agent Directory: $AGENT_DIR"
echo "  Config File:     $CONFIG_DIR/agent.conf"
echo "  Service Name:    $SERVICE_NAME"
echo ""
echo "  Commands:"
echo "    systemctl status $SERVICE_NAME"
echo "    systemctl restart $SERVICE_NAME"
echo "    journalctl -u $SERVICE_NAME -f"
echo ""
echo -e "========================================${NC}"
