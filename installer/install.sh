#!/bin/bash
#============================================================
# ServerManager - One-Click Installation Script
# Supported: Debian 11/12, Ubuntu 20.04/22.04/24.04
#============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
APP_NAME="servermanager"
APP_DIR="/opt/servermanager"
DB_NAME="servermanager"
DB_USER="servermanager"
DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 16)
AGENT_API_KEY=$(openssl rand -hex 16)
ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9!@#' | head -c 16)
NODE_VERSION="20"
DOMAIN=""
USE_SSL=false
WEBSERVER="nginx"

# Banner
echo -e "${GREEN}"
echo "============================================"
echo "    ServerManager Installation Script"
echo "    Version 1.0.0"
echo "============================================"
echo -e "${NC}"

#------------------------------------------------------------
# Pre-flight Checks
#------------------------------------------------------------

# Check root
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (sudo)${NC}"
    exit 1
fi

# Check OS
if [ ! -f /etc/os-release ]; then
    echo -e "${RED}Error: Cannot detect OS. Only Debian/Ubuntu supported.${NC}"
    exit 1
fi

. /etc/os-release

if [[ "$ID" != "debian" && "$ID" != "ubuntu" ]]; then
    echo -e "${RED}Error: Only Debian and Ubuntu are supported.${NC}"
    echo -e "Detected: $PRETTY_NAME"
    exit 1
fi

echo -e "${BLUE}Detected OS: $PRETTY_NAME${NC}"
echo ""

#------------------------------------------------------------
# Interactive Configuration
#------------------------------------------------------------

read -p "Enter domain name (or press Enter for IP-based access): " DOMAIN
if [ -n "$DOMAIN" ]; then
    read -p "Enable SSL with Let's Encrypt? (y/N): " SSL_CHOICE
    if [[ "$SSL_CHOICE" =~ ^[Yy]$ ]]; then
        USE_SSL=true
        read -p "Enter email for Let's Encrypt: " LE_EMAIL
    fi
fi

if [ -z "$DOMAIN" ]; then
    DOMAIN=$(hostname -I | awk '{print $1}')
    echo -e "${YELLOW}Using IP address: $DOMAIN${NC}"
fi

echo ""
echo -e "${YELLOW}Installation will proceed with:${NC}"
echo "  Domain/IP:     $DOMAIN"
echo "  SSL:           $USE_SSL"
echo "  Database:      PostgreSQL ($DB_NAME)"
echo "  Web Server:    Nginx"
echo ""
read -p "Continue? (Y/n): " CONFIRM
if [[ "$CONFIRM" =~ ^[Nn]$ ]]; then
    echo "Installation cancelled."
    exit 0
fi

echo ""
echo -e "${GREEN}Starting installation...${NC}"
echo ""

#------------------------------------------------------------
# System Update
#------------------------------------------------------------

echo -e "${YELLOW}[1/10] Updating system packages...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

#------------------------------------------------------------
# Install Dependencies
#------------------------------------------------------------

echo -e "${YELLOW}[2/10] Installing dependencies...${NC}"
apt-get install -y -qq \
    curl \
    wget \
    gnupg2 \
    ca-certificates \
    lsb-release \
    apt-transport-https \
    software-properties-common \
    build-essential \
    git \
    ufw \
    openssl

#------------------------------------------------------------
# Install Node.js
#------------------------------------------------------------

echo -e "${YELLOW}[3/10] Installing Node.js ${NODE_VERSION}.x...${NC}"
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y -qq nodejs
fi
echo "  Node.js $(node --version)"
echo "  npm $(npm --version)"

#------------------------------------------------------------
# Install PostgreSQL
#------------------------------------------------------------

echo -e "${YELLOW}[4/10] Installing and configuring PostgreSQL...${NC}"
apt-get install -y -qq postgresql postgresql-contrib

systemctl enable postgresql
systemctl start postgresql

# Create database and user
sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null || true
sudo -u postgres psql -c "DROP USER IF EXISTS ${DB_USER};" 2>/dev/null || true
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

echo "  Database '${DB_NAME}' created"

#------------------------------------------------------------
# Install Nginx
#------------------------------------------------------------

echo -e "${YELLOW}[5/10] Installing and configuring Nginx...${NC}"

# Pre-create config dirs so we can drop our config before nginx starts for the first time
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

# Write our vhost config BEFORE installing nginx so the default site never
# gets a chance to fail on systems without IPv6 support.
cat > /etc/nginx/sites-available/servermanager << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/servermanager /etc/nginx/sites-enabled/

# Install nginx (may fail to start due to default IPv6 vhost – we fix that below)
apt-get install -y -qq nginx || true

# Remove the default site which listens on [::]:80 and breaks on systems without IPv6
rm -f /etc/nginx/sites-enabled/default

# Patch the main nginx.conf: disable IPv6 listen directives if the kernel
# does not support the IPv6 address family.
if [ ! -d /proc/sys/net/ipv6 ]; then
    echo "  IPv6 not available – removing IPv6 listen directives from nginx config"
    # Remove any "listen [::]:..." lines in all nginx configs
    sed -i '/listen\s*\[::\]/d' /etc/nginx/nginx.conf
    find /etc/nginx/sites-enabled/ -type f -exec sed -i '/listen\s*\[::\]/d' {} +
    find /etc/nginx/conf.d/ -type f -name '*.conf' -exec sed -i '/listen\s*\[::\]/d' {} + 2>/dev/null || true
fi

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "  Nginx configured"

#------------------------------------------------------------
# SSL (Let's Encrypt)
#------------------------------------------------------------

if [ "$USE_SSL" = true ]; then
    echo -e "${YELLOW}[5.1] Setting up SSL with Let's Encrypt...${NC}"
    apt-get install -y -qq certbot python3-certbot-nginx
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$LE_EMAIL" --redirect
    echo "  SSL certificate installed"
fi

#------------------------------------------------------------
# Deploy Application
#------------------------------------------------------------

echo -e "${YELLOW}[6/10] Deploying application...${NC}"

mkdir -p "$APP_DIR"

# Copy application files (assuming this is run from the repo)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

cp -r "$REPO_DIR/backend" "$APP_DIR/"
cp -r "$REPO_DIR/frontend" "$APP_DIR/"

# Create uploads directory
mkdir -p "$APP_DIR/backend/uploads/documents"
mkdir -p "$APP_DIR/backend/logs"

echo "  Application files deployed"

#------------------------------------------------------------
# Configure Backend
#------------------------------------------------------------

echo -e "${YELLOW}[7/10] Configuring backend...${NC}"

PROTOCOL="http"
if [ "$USE_SSL" = true ]; then
    PROTOCOL="https"
fi

cat > "$APP_DIR/backend/.env" << ENVEOF
NODE_ENV=production
PORT=3000
APP_URL=${PROTOCOL}://${DOMAIN}
FRONTEND_URL=${PROTOCOL}://${DOMAIN}

DB_HOST=localhost
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRATION=24h
JWT_REFRESH_EXPIRATION=7d

ENCRYPTION_KEY=${ENCRYPTION_KEY}
AGENT_API_KEY=${AGENT_API_KEY}
ENVEOF

chmod 600 "$APP_DIR/backend/.env"

# Install backend dependencies
cd "$APP_DIR/backend"
npm install --production --silent

echo "  Backend configured"

#------------------------------------------------------------
# Build Frontend
#------------------------------------------------------------

echo -e "${YELLOW}[8/10] Building frontend...${NC}"

cd "$APP_DIR/frontend"
npm install --silent
npm run build

echo "  Frontend built"

#------------------------------------------------------------
# Run Database Migrations & Create Admin
#------------------------------------------------------------

echo -e "${YELLOW}[9/10] Running database migrations...${NC}"

cd "$APP_DIR/backend"
npx knex migrate:latest --knexfile src/config/knexfile.js

# Create admin user
node src/scripts/createAdmin.js admin admin@servermanager.local "$ADMIN_PASSWORD"

echo "  Database migrated and admin user created"

#------------------------------------------------------------
# Create Systemd Service
#------------------------------------------------------------

echo -e "${YELLOW}[10/10] Creating systemd service...${NC}"

cat > /etc/systemd/system/servermanager.service << SERVICEEOF
[Unit]
Description=ServerManager Web Application
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=servermanager
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable servermanager
systemctl start servermanager

echo "  Service created and started"

#------------------------------------------------------------
# Configure Firewall
#------------------------------------------------------------

echo -e "${YELLOW}Configuring firewall...${NC}"

ufw --force enable
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp

echo "  Firewall configured"

#------------------------------------------------------------
# Cleanup & Summary
#------------------------------------------------------------

echo ""
echo -e "${GREEN}============================================"
echo "  Installation Complete!"
echo "============================================"
echo ""
echo "  URL:          ${PROTOCOL}://${DOMAIN}"
echo ""
echo "  Admin Login:"
echo "    Username:   admin"
echo "    Password:   ${ADMIN_PASSWORD}"
echo ""
echo "  Database:"
echo "    Host:       localhost"
echo "    Name:       ${DB_NAME}"
echo "    User:       ${DB_USER}"
echo "    Password:   ${DB_PASSWORD}"
echo ""
echo "  Configuration:"
echo "    App Dir:    ${APP_DIR}"
echo "    Backend:    ${APP_DIR}/backend/.env"
echo "    Nginx:      /etc/nginx/sites-available/servermanager"
echo ""
echo "  Service Commands:"
echo "    systemctl status servermanager"
echo "    systemctl restart servermanager"
echo "    journalctl -u servermanager -f"
echo ""
echo -e "  IMPORTANT: Save these credentials securely!"
echo -e "============================================${NC}"
echo ""

# Save credentials to a file
CREDS_FILE="/root/.servermanager-credentials"
cat > "$CREDS_FILE" << CREDSEOF
ServerManager Installation Credentials
========================================
URL:          ${PROTOCOL}://${DOMAIN}
Admin User:   admin
Admin Pass:   ${ADMIN_PASSWORD}
DB Name:      ${DB_NAME}
DB User:      ${DB_USER}
DB Password:  ${DB_PASSWORD}
JWT Secret:   ${JWT_SECRET}
========================================
CREDSEOF
chmod 600 "$CREDS_FILE"
echo -e "${YELLOW}Credentials saved to: ${CREDS_FILE}${NC}"
