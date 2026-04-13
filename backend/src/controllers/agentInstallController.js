const db = require('../config/database');
const logger = require('../services/logger');
const config = require('../config/app');

/**
 * Get install script with embedded API key
 * Called via: curl -sSL https://server/api/agent/install/<api-key> | sudo bash
 */
exports.getInstallScript = async (req, res) => {
  try {
    const { apiKey } = req.params;

    // Verify the API key exists
    const server = await db('servers')
      .where({ agent_api_key: apiKey })
      .first();

    if (!server) {
      return res.status(404).type('text/plain').send('#!/bin/bash\necho "Error: Invalid API key"\nexit 1');
    }

    // Get the server URL from config or request
    const serverUrl = config.agentServerUrl ||
      `${req.protocol}://${req.get('host')}`;

    // Generate the install script with embedded values
    const script = generateInstallScript(serverUrl, apiKey, server.hostname);

    res.type('text/plain').send(script);
  } catch (err) {
    logger.error('Get install script error:', err);
    res.status(500).type('text/plain').send('#!/bin/bash\necho "Error: Server error"\nexit 1');
  }
};

/**
 * Get install command for display in UI
 */
exports.getInstallCommand = async (req, res) => {
  try {
    const { serverId } = req.params;

    const server = await db('servers')
      .where({ id: serverId })
      .select('agent_api_key', 'hostname')
      .first();

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Get the server URL from config or construct from request
    const serverUrl = config.agentServerUrl ||
      `${req.protocol}://${req.get('host')}`;

    const installCommand = `curl -sSL ${serverUrl}/api/agent/install/${server.agent_api_key} | sudo bash`;

    res.json({
      command: installCommand,
      api_key: server.agent_api_key,
      server_url: serverUrl,
    });
  } catch (err) {
    logger.error('Get install command error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Generate install script with embedded configuration
 */
function generateInstallScript(serverUrl, apiKey, serverName) {
  return `#!/bin/bash
#============================================================
# ServerManager Linux Agent - Quick Install
# Server: ${serverName}
#============================================================

set -e

AGENT_DIR="/opt/servermanager-agent"
CONFIG_DIR="/etc/servermanager"
SERVICE_NAME="servermanager-agent"
SERVER_URL="${serverUrl}"
API_KEY="${apiKey}"

# Colors
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

echo -e "\${GREEN}"
echo "========================================"
echo "  ServerManager Agent Quick Install"
echo "  Server: ${serverName}"
echo "========================================"
echo -e "\${NC}"

# Check root
if [ "$(id -u)" -ne 0 ]; then
    echo -e "\${RED}Error: This script must be run as root (use sudo)\\${NC}"
    exit 1
fi

echo -e "\${YELLOW}Installing dependencies...\${NC}"

# Detect package manager and install Python
if command -v apt-get &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq python3 python3-pip python3-venv curl
elif command -v yum &>/dev/null; then
    yum install -y python3 python3-pip curl
elif command -v dnf &>/dev/null; then
    dnf install -y python3 python3-pip curl
else
    echo -e "\${RED}Error: Unsupported package manager. Please install Python 3 manually.\${NC}"
    exit 1
fi

echo -e "\${YELLOW}Setting up agent directory...\${NC}"

# Create directories
mkdir -p "$AGENT_DIR"
mkdir -p "$CONFIG_DIR"

# Download agent files
echo -e "\${YELLOW}Downloading agent...\${NC}"
curl -sSL "$SERVER_URL/api/agent/download/agent.py" -o "$AGENT_DIR/agent.py"
curl -sSL "$SERVER_URL/api/agent/download/requirements.txt" -o "$AGENT_DIR/requirements.txt"
chmod +x "$AGENT_DIR/agent.py"

# Create virtual environment and install dependencies
echo -e "\${YELLOW}Installing Python dependencies...\${NC}"
python3 -m venv "$AGENT_DIR/venv"
"$AGENT_DIR/venv/bin/pip" install --quiet --upgrade pip
"$AGENT_DIR/venv/bin/pip" install --quiet -r "$AGENT_DIR/requirements.txt"

# Create configuration
echo -e "\${YELLOW}Creating configuration...\${NC}"
cat > "$CONFIG_DIR/agent.conf" << EOCONF
{
    "server_url": "$SERVER_URL",
    "api_key": "$API_KEY",
    "metrics_interval": 5,
    "heartbeat_interval": 30,
    "package_sync_interval": 3600,
    "verify_ssl": true
}
EOCONF
chmod 600 "$CONFIG_DIR/agent.conf"

# Create systemd service
echo -e "\${YELLOW}Creating systemd service...\${NC}"
cat > "/etc/systemd/system/\${SERVICE_NAME}.service" << EOSVC
[Unit]
Description=ServerManager Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=\${AGENT_DIR}/venv/bin/python3 \${AGENT_DIR}/agent.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=\${SERVICE_NAME}
NoNewPrivileges=no
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOSVC

# Enable and start service
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

# Wait for service to start
sleep 2

# Check status
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo ""
    echo -e "\${GREEN}========================================"
    echo "  Installation Complete!"
    echo "========================================"
    echo ""
    echo "  Agent is running and connected."
    echo ""
    echo "  Useful commands:"
    echo "    systemctl status $SERVICE_NAME"
    echo "    systemctl restart $SERVICE_NAME"
    echo "    journalctl -u $SERVICE_NAME -f"
    echo ""
    echo -e "========================================\${NC}"
else
    echo -e "\${RED}Warning: Agent service may not have started correctly.\${NC}"
    echo "Check: systemctl status $SERVICE_NAME"
fi
`;
}
