const { Client: SSHClient } = require('ssh2');
const db = require('../config/database');
const { decryptCredentials } = require('../services/encryption');
const logger = require('../services/logger');

// Get all available addons (admin)
exports.getAllAddons = async (req, res) => {
  try {
    // Check if table exists
    const tableExists = await db.schema.hasTable('addons');
    if (!tableExists) {
      return res.json([]);
    }

    const addons = await db('addons').orderBy('category').orderBy('name');
    res.json(addons.map(a => ({
      ...a,
      default_config: parseJsonField(a.default_config)
    })));
  } catch (err) {
    logger.error('Get all addons error:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};

// Helper to safely parse JSON fields that might be objects, strings, or corrupted
function parseJsonField(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return {};
  }
}

// Get single addon details
exports.getAddon = async (req, res) => {
  try {
    const addon = await db('addons').where({ id: req.params.addonId }).first();
    if (!addon) {
      return res.status(404).json({ error: 'Addon not found' });
    }
    addon.default_config = parseJsonField(addon.default_config);
    res.json(addon);
  } catch (err) {
    logger.error('Get addon error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Toggle addon globally (admin only)
exports.toggleAddon = async (req, res) => {
  try {
    const { addonId } = req.params;
    const { is_enabled } = req.body;

    const addon = await db('addons').where({ id: addonId }).first();
    if (!addon) {
      return res.status(404).json({ error: 'Addon not found' });
    }

    await db('addons')
      .where({ id: addonId })
      .update({ is_enabled, updated_at: db.fn.now() });

    res.json({ success: true, is_enabled });
  } catch (err) {
    logger.error('Toggle addon error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get addons for a specific server
exports.getServerAddons = async (req, res) => {
  try {
    const serverId = req.params.serverId;

    // Check if tables exist
    const addonsTableExists = await db.schema.hasTable('addons');
    if (!addonsTableExists) {
      return res.json([]);
    }

    // Get all globally enabled addons with server-specific status
    const addons = await db('addons')
      .where('addons.is_enabled', true)
      .select(
        'addons.*',
        'server_addons.is_enabled as server_enabled',
        'server_addons.config as server_config',
        'server_addons.status',
        'server_addons.status_message',
        'server_addons.last_checked'
      )
      .leftJoin('server_addons', function() {
        this.on('addons.id', '=', 'server_addons.addon_id')
          .andOn('server_addons.server_id', '=', db.raw('?', [serverId]));
      })
      .orderBy('addons.category')
      .orderBy('addons.name');

    res.json(addons.map(a => ({
      ...a,
      default_config: parseJsonField(a.default_config),
      server_config: parseJsonField(a.server_config),
      is_installed: a.server_enabled !== null,
      server_enabled: a.server_enabled ?? false
    })));
  } catch (err) {
    logger.error('Get server addons error:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
};

// Enable/configure addon on a server
exports.enableServerAddon = async (req, res) => {
  try {
    const { serverId, addonId } = req.params;
    const { config } = req.body;

    const addon = await db('addons').where({ id: addonId, is_enabled: true }).first();
    if (!addon) {
      return res.status(404).json({ error: 'Addon not found or not enabled globally' });
    }

    const existing = await db('server_addons')
      .where({ server_id: serverId, addon_id: addonId })
      .first();

    if (existing) {
      await db('server_addons')
        .where({ server_id: serverId, addon_id: addonId })
        .update({
          is_enabled: true,
          config: config ? JSON.stringify(config) : existing.config,
          updated_at: db.fn.now()
        });
    } else {
      await db('server_addons').insert({
        server_id: serverId,
        addon_id: addonId,
        is_enabled: true,
        config: config ? JSON.stringify(config) : addon.default_config,
        status: 'inactive'
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Enable server addon error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Disable addon on a server
exports.disableServerAddon = async (req, res) => {
  try {
    const { serverId, addonId } = req.params;

    await db('server_addons')
      .where({ server_id: serverId, addon_id: addonId })
      .update({ is_enabled: false, updated_at: db.fn.now() });

    res.json({ success: true });
  } catch (err) {
    logger.error('Disable server addon error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update addon configuration for a server
exports.updateServerAddonConfig = async (req, res) => {
  try {
    const { serverId, addonId } = req.params;
    const { config } = req.body;

    await db('server_addons')
      .where({ server_id: serverId, addon_id: addonId })
      .update({
        config: JSON.stringify(config),
        updated_at: db.fn.now()
      });

    res.json({ success: true });
  } catch (err) {
    logger.error('Update server addon config error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Check addon status on server via SSH
exports.checkAddonStatus = async (req, res) => {
  try {
    const { serverId, addonId } = req.params;

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const addon = await db('addons').where({ id: addonId }).first();
    if (!addon) {
      return res.status(404).json({ error: 'Addon not found' });
    }

    const serverAddon = await db('server_addons')
      .where({ server_id: serverId, addon_id: addonId })
      .first();
    if (!serverAddon) {
      return res.status(404).json({ error: 'Addon not enabled on this server' });
    }

    let credentials = null;
    if (server.ssh_credentials_encrypted) {
      try {
        credentials = decryptCredentials(server.ssh_credentials_encrypted);
      } catch (e) {
        logger.error('Failed to decrypt SSH credentials:', e);
      }
    }

    if (!credentials || !credentials.username) {
      return res.status(400).json({ error: 'No SSH credentials configured' });
    }

    // Build check command based on addon type
    const config = serverAddon.config ? JSON.parse(serverAddon.config) : {};
    let checkCmd = '';
    let status = 'inactive';
    let statusMessage = '';

    switch (addon.slug) {
      case 'cloudflare-tunnel':
        checkCmd = `systemctl is-active cloudflared 2>/dev/null || echo "inactive"; cloudflared tunnel list 2>/dev/null | head -5 || echo "not-configured"`;
        break;
      case 'wireguard':
        const wgInterface = config.interface || 'wg0';
        checkCmd = `wg show ${wgInterface} 2>/dev/null && echo "WG_ACTIVE" || echo "WG_INACTIVE"; ip link show ${wgInterface} 2>/dev/null || echo "interface-not-found"`;
        break;
      case 'docker':
        checkCmd = `docker info --format '{{.ContainersRunning}} running, {{.ContainersPaused}} paused, {{.ContainersStopped}} stopped' 2>/dev/null || echo "docker-not-available"`;
        break;
      case 'fail2ban':
        checkCmd = `systemctl is-active fail2ban 2>/dev/null; fail2ban-client status 2>/dev/null | head -3 || echo "not-available"`;
        break;
      default:
        checkCmd = 'echo "no-check-available"';
    }

    const output = await executeSSHCommand(server, credentials, checkCmd);

    // Parse output based on addon
    if (addon.slug === 'cloudflare-tunnel') {
      if (output.includes('active')) {
        status = 'active';
        statusMessage = 'Cloudflared service is running';
      } else if (output.includes('not-configured')) {
        status = 'inactive';
        statusMessage = 'Cloudflared not configured';
      } else {
        status = 'inactive';
        statusMessage = 'Cloudflared service not running';
      }
    } else if (addon.slug === 'wireguard') {
      if (output.includes('WG_ACTIVE')) {
        status = 'active';
        const lines = output.split('\n').filter(l => l.includes('peer:') || l.includes('transfer:'));
        statusMessage = lines.length > 0 ? `${lines.length} peer(s) configured` : 'WireGuard active';
      } else {
        status = 'inactive';
        statusMessage = output.includes('interface-not-found') ? 'Interface not found' : 'WireGuard not active';
      }
    } else if (addon.slug === 'docker') {
      if (output.includes('running')) {
        status = 'active';
        statusMessage = output.trim();
      } else {
        status = 'inactive';
        statusMessage = 'Docker not available or not running';
      }
    } else if (addon.slug === 'fail2ban') {
      if (output.includes('active')) {
        status = 'active';
        const jailMatch = output.match(/Number of jail:\s*(\d+)/);
        statusMessage = jailMatch ? `${jailMatch[1]} jail(s) active` : 'Fail2Ban running';
      } else {
        status = 'inactive';
        statusMessage = 'Fail2Ban not running';
      }
    }

    // Update status in database
    await db('server_addons')
      .where({ server_id: serverId, addon_id: addonId })
      .update({
        status,
        status_message: statusMessage,
        last_checked: db.fn.now(),
        updated_at: db.fn.now()
      });

    res.json({ status, status_message: statusMessage, raw_output: output });
  } catch (err) {
    logger.error('Check addon status error:', err);
    res.status(500).json({ error: 'Failed to check status: ' + err.message });
  }
};

// Execute addon-specific action
exports.executeAddonAction = async (req, res) => {
  try {
    const { serverId, addonId } = req.params;
    const { action, container, jail, ip, ...actionConfig } = req.body;

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const addon = await db('addons').where({ id: addonId }).first();
    if (!addon) {
      return res.status(404).json({ error: 'Addon not found' });
    }

    let credentials = null;
    if (server.ssh_credentials_encrypted) {
      try {
        credentials = decryptCredentials(server.ssh_credentials_encrypted);
      } catch (e) {
        logger.error('Failed to decrypt SSH credentials:', e);
      }
    }

    if (!credentials || !credentials.username) {
      return res.status(400).json({ error: 'No SSH credentials configured' });
    }

    const serverAddon = await db('server_addons')
      .where({ server_id: serverId, addon_id: addonId })
      .first();
    const storedConfig = serverAddon?.config ? parseJsonField(serverAddon.config) : {};
    const config = { ...storedConfig, ...actionConfig };

    // Handle addon-specific actions with structured responses
    switch (addon.slug) {
      case 'cloudflare-tunnel':
        return handleCloudflareTunnelAction(server, credentials, config, action, res);
      case 'wireguard':
        return handleWireGuardAction(server, credentials, config, action, res);
      case 'docker':
        return handleDockerAction(server, credentials, config, action, container, res);
      case 'fail2ban':
        return handleFail2BanAction(server, credentials, config, action, jail, ip, res);
      default:
        return res.status(400).json({ error: 'Addon has no actions configured' });
    }
  } catch (err) {
    logger.error('Execute addon action error:', err);
    res.status(500).json({ error: 'Failed to execute action: ' + err.message });
  }
};

// Cloudflare Tunnel action handler
async function handleCloudflareTunnelAction(server, credentials, config, action, res) {
  try {
    switch (action) {
      case 'status': {
        // Get service status and tunnel info
        const cmd = `
          echo "=== INSTALLED ===" && command -v cloudflared >/dev/null 2>&1 && echo "yes" || echo "no";
          echo "=== SERVICE_STATUS ===" && systemctl is-active cloudflared 2>/dev/null || echo "inactive";
          echo "=== TUNNEL_LIST ===" && cloudflared tunnel list --output json 2>/dev/null || echo "[]";
          echo "=== CONFIG ===" && cat /etc/cloudflared/config.yml 2>/dev/null || echo "not-found"
        `;
        const output = await executeSSHCommand(server, credentials, cmd);

        const installed = output.includes('=== INSTALLED ===') && output.split('=== INSTALLED ===')[1]?.includes('yes');
        const serviceRunning = output.includes('active') && !output.includes('inactive');
        let tunnels = [];
        let ingress = [];

        // Parse tunnel list
        const tunnelListMatch = output.match(/=== TUNNEL_LIST ===\s*([\s\S]*?)(=== CONFIG ===|$)/);
        if (tunnelListMatch && tunnelListMatch[1]) {
          try {
            const jsonStr = tunnelListMatch[1].trim();
            if (jsonStr.startsWith('[')) {
              tunnels = JSON.parse(jsonStr);
            }
          } catch (e) {
            // Not valid JSON, might be table format
          }
        }

        // Parse config for ingress rules
        const configMatch = output.match(/=== CONFIG ===\s*([\s\S]*?)$/);
        if (configMatch && configMatch[1]) {
          const configText = configMatch[1];
          const ingressMatches = configText.matchAll(/- hostname:\s*(\S+)\s*\n\s*service:\s*(\S+)/g);
          for (const m of ingressMatches) {
            ingress.push({ hostname: m[1], service: m[2] });
          }
        }

        return res.json({
          installed,
          running: serviceRunning,
          status: serviceRunning ? 'running' : 'stopped',
          tunnel: tunnels.length > 0 ? tunnels[0] : null,
          tunnels,
          ingress,
          connections: tunnels.length > 0 ? (tunnels[0].connections?.length || 1) : 0
        });
      }

      case 'install': {
        // Install cloudflared - try apt, then rpm, then binary
        const installCmd = `
          if command -v apt-get >/dev/null 2>&1; then
            curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
            echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
            sudo apt-get update && sudo apt-get install -y cloudflared
          elif command -v yum >/dev/null 2>&1; then
            sudo yum install -y cloudflared || (curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared && sudo mv /tmp/cloudflared /usr/local/bin/cloudflared && sudo chmod +x /usr/local/bin/cloudflared)
          else
            curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared && sudo mv /tmp/cloudflared /usr/local/bin/cloudflared && sudo chmod +x /usr/local/bin/cloudflared
          fi
          cloudflared --version
        `;
        const output = await executeSSHCommand(server, credentials, installCmd);
        return res.json({ success: true, output });
      }

      case 'create-tunnel': {
        const tunnelName = config.tunnelName;
        if (!tunnelName) {
          return res.status(400).json({ error: 'Tunnel name required' });
        }
        const cmd = `cloudflared tunnel create ${tunnelName} 2>&1`;
        const output = await executeSSHCommand(server, credentials, cmd);
        // Extract tunnel ID from output
        const idMatch = output.match(/Created tunnel ([^\s]+) with id ([a-f0-9-]+)/i);
        return res.json({
          success: !output.includes('error'),
          tunnelId: idMatch ? idMatch[2] : null,
          output
        });
      }

      case 'setup-config': {
        const tunnelId = config.tunnelId;
        const ingress = config.ingress || [];
        if (!tunnelId) {
          return res.status(400).json({ error: 'Tunnel ID required' });
        }
        // Build config.yml content
        let configContent = `tunnel: ${tunnelId}\ncredentials-file: /root/.cloudflared/${tunnelId}.json\n\ningress:\n`;
        for (const route of ingress) {
          if (route.hostname && route.service) {
            configContent += `  - hostname: ${route.hostname}\n    service: ${route.service}\n`;
          }
        }
        configContent += `  - service: http_status:404\n`;

        const cmd = `
          sudo mkdir -p /etc/cloudflared
          echo '${configContent.replace(/'/g, "'\\''")}' | sudo tee /etc/cloudflared/config.yml
          sudo cloudflared service install 2>/dev/null || true
          sudo systemctl enable cloudflared 2>/dev/null || true
        `;
        await executeSSHCommand(server, credentials, cmd);
        return res.json({ success: true });
      }

      case 'add-route': {
        const tunnelId = config.tunnelId;
        const hostname = config.hostname;
        if (!tunnelId || !hostname) {
          return res.status(400).json({ error: 'Tunnel ID and hostname required' });
        }
        const cmd = `cloudflared tunnel route dns ${tunnelId} ${hostname} 2>&1`;
        const output = await executeSSHCommand(server, credentials, cmd);
        return res.json({ success: !output.includes('error'), output });
      }

      case 'delete-tunnel': {
        const tunnelId = config.tunnelId;
        if (!tunnelId) {
          return res.status(400).json({ error: 'Tunnel ID required' });
        }
        const cmd = `cloudflared tunnel delete ${tunnelId} 2>&1`;
        const output = await executeSSHCommand(server, credentials, cmd);
        return res.json({ success: !output.includes('error'), output });
      }

      case 'get-logs': {
        const cmd = `sudo journalctl -u cloudflared -n 100 --no-pager 2>/dev/null || echo "No logs available"`;
        const output = await executeSSHCommand(server, credentials, cmd);
        return res.json({ logs: output });
      }

      case 'start':
        await executeSSHCommand(server, credentials, 'sudo systemctl start cloudflared');
        return res.json({ success: true });

      case 'stop':
        await executeSSHCommand(server, credentials, 'sudo systemctl stop cloudflared');
        return res.json({ success: true });

      case 'restart':
        await executeSSHCommand(server, credentials, 'sudo systemctl restart cloudflared');
        return res.json({ success: true });

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// WireGuard action handler
async function handleWireGuardAction(server, credentials, config, action, res) {
  const wgInterface = config.interface || 'wg0';

  try {
    switch (action) {
      case 'status': {
        const cmd = `
          echo "=== INSTALLED ===" && command -v wg >/dev/null 2>&1 && echo "yes" || echo "no";
          echo "=== INTERFACE ===" && ip link show ${wgInterface} 2>/dev/null && echo "UP" || echo "DOWN";
          echo "=== WG_SHOW ===" && sudo wg show ${wgInterface} 2>/dev/null || echo "not-running";
          echo "=== TRANSFER ===" && sudo wg show ${wgInterface} transfer 2>/dev/null || echo "";
          echo "=== SERVER_CONFIG ===" && sudo cat /etc/wireguard/${wgInterface}.conf 2>/dev/null | grep -E "^(Address|ListenPort)" || echo ""
        `;
        const output = await executeSSHCommand(server, credentials, cmd);

        const installed = output.includes('=== INSTALLED ===') && output.split('=== INSTALLED ===')[1]?.includes('yes');
        const isUp = output.includes('state UP') || (output.includes('interface:') && !output.includes('not-running'));
        const peers = [];

        // Parse server config
        let serverAddress = '';
        let listenPort = 51820;
        const addrMatch = output.match(/Address\s*=\s*(\S+)/);
        if (addrMatch) serverAddress = addrMatch[1];
        const portMatch = output.match(/ListenPort\s*=\s*(\d+)/);
        if (portMatch) listenPort = parseInt(portMatch[1]);

        // Parse WireGuard show output
        const wgShowMatch = output.match(/=== WG_SHOW ===\s*([\s\S]*?)(=== TRANSFER ===|$)/);
        if (wgShowMatch && wgShowMatch[1] && !wgShowMatch[1].includes('not-running')) {
          const wgOutput = wgShowMatch[1];
          const peerBlocks = wgOutput.split(/\n(?=peer:)/);

          for (const block of peerBlocks) {
            if (block.includes('peer:')) {
              const peer = {};
              const pubKeyMatch = block.match(/peer:\s*(\S+)/);
              if (pubKeyMatch) peer.public_key = pubKeyMatch[1];

              const endpointMatch = block.match(/endpoint:\s*(\S+)/);
              if (endpointMatch) peer.endpoint = endpointMatch[1];

              const allowedMatch = block.match(/allowed ips:\s*(.+)/);
              if (allowedMatch) peer.allowed_ips = allowedMatch[1].trim();

              const handshakeMatch = block.match(/latest handshake:\s*(.+)/);
              if (handshakeMatch) {
                const hsText = handshakeMatch[1];
                const now = Math.floor(Date.now() / 1000);
                if (hsText.includes('second')) {
                  const secs = parseInt(hsText) || 0;
                  peer.latest_handshake = now - secs;
                } else if (hsText.includes('minute')) {
                  const mins = parseInt(hsText) || 0;
                  peer.latest_handshake = now - (mins * 60);
                } else if (hsText.includes('hour')) {
                  const hrs = parseInt(hsText) || 0;
                  peer.latest_handshake = now - (hrs * 3600);
                }
              }

              const transferMatch = block.match(/transfer:\s*(\S+)\s+received,\s*(\S+)\s+sent/);
              if (transferMatch) {
                peer.rx = parseTransferBytes(transferMatch[1]);
                peer.tx = parseTransferBytes(transferMatch[2]);
              }

              if (peer.public_key) peers.push(peer);
            }
          }
        }

        // Parse transfer stats if separate
        const transferMatch = output.match(/=== TRANSFER ===\s*([\s\S]*?)(=== SERVER_CONFIG ===|$)/);
        if (transferMatch && transferMatch[1]) {
          const lines = transferMatch[1].trim().split('\n');
          for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 3) {
              const pubKey = parts[0];
              const peer = peers.find(p => p.public_key === pubKey);
              if (peer) {
                peer.rx = parseInt(parts[1]) || 0;
                peer.tx = parseInt(parts[2]) || 0;
              }
            }
          }
        }

        return res.json({
          installed,
          running: isUp,
          interface: { name: wgInterface, up: isUp, address: serverAddress, port: listenPort },
          peers
        });
      }

      case 'install': {
        const installCmd = `
          if command -v apt-get >/dev/null 2>&1; then
            sudo apt-get update && sudo apt-get install -y wireguard wireguard-tools qrencode
          elif command -v yum >/dev/null 2>&1; then
            sudo yum install -y epel-release && sudo yum install -y wireguard-tools qrencode
          elif command -v dnf >/dev/null 2>&1; then
            sudo dnf install -y wireguard-tools qrencode
          fi
          wg --version
        `;
        const output = await executeSSHCommand(server, credentials, installCmd);
        return res.json({ success: true, output });
      }

      case 'setup-server': {
        const address = config.address || '10.0.0.1/24';
        const port = config.listenPort || 51820;
        const cmd = `
          # Generate server keys if not exist
          sudo mkdir -p /etc/wireguard
          if [ ! -f /etc/wireguard/server_private.key ]; then
            wg genkey | sudo tee /etc/wireguard/server_private.key | wg pubkey | sudo tee /etc/wireguard/server_public.key
            sudo chmod 600 /etc/wireguard/server_private.key
          fi
          PRIVATE_KEY=$(sudo cat /etc/wireguard/server_private.key)
          PUBLIC_KEY=$(sudo cat /etc/wireguard/server_public.key)

          # Create server config
          sudo tee /etc/wireguard/${wgInterface}.conf << EOF
[Interface]
Address = ${address}
ListenPort = ${port}
PrivateKey = \$PRIVATE_KEY
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
EOF

          # Enable IP forwarding
          sudo sysctl -w net.ipv4.ip_forward=1
          echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf 2>/dev/null || true

          sudo systemctl enable wg-quick@${wgInterface} 2>/dev/null || true
          echo "PUBLIC_KEY:\$PUBLIC_KEY"
        `;
        const output = await executeSSHCommand(server, credentials, cmd);
        const pubKeyMatch = output.match(/PUBLIC_KEY:(\S+)/);
        return res.json({
          success: true,
          publicKey: pubKeyMatch ? pubKeyMatch[1] : null,
          output
        });
      }

      case 'generate-client-config': {
        const clientName = config.clientName || 'client';
        const clientIp = config.clientIp || '10.0.0.2/32';
        const dns = config.dns || '1.1.1.1';
        const serverEndpoint = config.serverEndpoint || server.ip_address;
        const serverPort = config.serverPort || 51820;

        const cmd = `
          # Get server public key
          SERVER_PUBKEY=$(sudo cat /etc/wireguard/server_public.key 2>/dev/null)
          if [ -z "\$SERVER_PUBKEY" ]; then
            echo "ERROR:Server not configured"
            exit 1
          fi

          # Generate client keys
          CLIENT_PRIVKEY=$(wg genkey)
          CLIENT_PUBKEY=$(echo \$CLIENT_PRIVKEY | wg pubkey)

          # Add peer to server config
          sudo tee -a /etc/wireguard/${wgInterface}.conf << EOF

[Peer]
# ${clientName}
PublicKey = \$CLIENT_PUBKEY
AllowedIPs = ${clientIp.split('/')[0]}/32
EOF

          # Reload WireGuard if running
          sudo wg syncconf ${wgInterface} <(sudo wg-quick strip ${wgInterface}) 2>/dev/null || true

          # Generate client config
          echo "=== CLIENT_CONFIG ==="
          cat << EOF
[Interface]
PrivateKey = \$CLIENT_PRIVKEY
Address = ${clientIp}
DNS = ${dns}

[Peer]
PublicKey = \$SERVER_PUBKEY
AllowedIPs = 0.0.0.0/0
Endpoint = ${serverEndpoint}:${serverPort}
PersistentKeepalive = 25
EOF
          echo "=== END_CONFIG ==="
          echo "CLIENT_PUBKEY:\$CLIENT_PUBKEY"
        `;
        const output = await executeSSHCommand(server, credentials, cmd);

        if (output.includes('ERROR:')) {
          const errorMatch = output.match(/ERROR:(.+)/);
          return res.status(400).json({ error: errorMatch ? errorMatch[1] : 'Failed to generate config' });
        }

        const configMatch = output.match(/=== CLIENT_CONFIG ===\s*([\s\S]*?)=== END_CONFIG ===/);
        const pubKeyMatch = output.match(/CLIENT_PUBKEY:(\S+)/);

        let qrCode = null;
        if (config.generateQr && configMatch) {
          try {
            const qrCmd = `echo '${configMatch[1].trim().replace(/'/g, "'\\''")}' | qrencode -t ANSIUTF8 2>/dev/null || echo "QR_NOT_AVAILABLE"`;
            const qrOutput = await executeSSHCommand(server, credentials, qrCmd);
            if (!qrOutput.includes('QR_NOT_AVAILABLE')) {
              qrCode = qrOutput;
            }
          } catch (e) {
            // QR generation failed, continue without it
          }
        }

        return res.json({
          success: true,
          config: configMatch ? configMatch[1].trim() : null,
          clientPublicKey: pubKeyMatch ? pubKeyMatch[1] : null,
          qrCode
        });
      }

      case 'remove-peer': {
        const publicKey = config.publicKey;
        if (!publicKey) {
          return res.status(400).json({ error: 'Public key required' });
        }
        // Remove peer from running interface
        await executeSSHCommand(server, credentials, `sudo wg set ${wgInterface} peer ${publicKey} remove`);
        // Remove from config file (more complex, need to parse and rewrite)
        const cmd = `
          sudo cp /etc/wireguard/${wgInterface}.conf /etc/wireguard/${wgInterface}.conf.bak
          sudo awk '/\\[Peer\\]/{p=1; block=""} p{block=block $0 "\\n"; if(/^$/ || /^\\[/){if(block !~ /${publicKey.substring(0, 20)}/){printf "%s", block} block=""; if(/^\\[/ && !/\\[Peer\\]/){p=0; print}}} !p' /etc/wireguard/${wgInterface}.conf.bak | sudo tee /etc/wireguard/${wgInterface}.conf.new
          sudo mv /etc/wireguard/${wgInterface}.conf.new /etc/wireguard/${wgInterface}.conf 2>/dev/null || true
        `;
        await executeSSHCommand(server, credentials, cmd);
        return res.json({ success: true });
      }

      case 'start':
        await executeSSHCommand(server, credentials, `sudo wg-quick up ${wgInterface}`);
        return res.json({ success: true });

      case 'stop':
        await executeSSHCommand(server, credentials, `sudo wg-quick down ${wgInterface}`);
        return res.json({ success: true });

      case 'restart':
        await executeSSHCommand(server, credentials, `sudo wg-quick down ${wgInterface} 2>/dev/null; sudo wg-quick up ${wgInterface}`);
        return res.json({ success: true });

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Docker action handler
async function handleDockerAction(server, credentials, config, action, container, res) {
  try {
    switch (action) {
      case 'status': {
        const cmd = `docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.Ports}}' 2>/dev/null || echo "DOCKER_ERROR"`;
        const output = await executeSSHCommand(server, credentials, cmd);

        if (output.includes('DOCKER_ERROR') || output.includes('Cannot connect')) {
          return res.json({ running: false, containers: [], error: 'Docker not available' });
        }

        const containers = [];
        const lines = output.trim().split('\n').filter(l => l);

        for (const line of lines) {
          const parts = line.split('|');
          if (parts.length >= 5) {
            containers.push({
              id: parts[0],
              name: parts[1],
              image: parts[2],
              status: parts[3],
              state: parts[4].toLowerCase(),
              ports: parts[5] || ''
            });
          }
        }

        return res.json({
          running: true,
          containers
        });
      }

      case 'container-start':
        if (!container) return res.status(400).json({ error: 'Container ID required' });
        await executeSSHCommand(server, credentials, `docker start ${container}`);
        return res.json({ success: true });

      case 'container-stop':
        if (!container) return res.status(400).json({ error: 'Container ID required' });
        await executeSSHCommand(server, credentials, `docker stop ${container}`);
        return res.json({ success: true });

      case 'container-restart':
        if (!container) return res.status(400).json({ error: 'Container ID required' });
        await executeSSHCommand(server, credentials, `docker restart ${container}`);
        return res.json({ success: true });

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Fail2Ban action handler
async function handleFail2BanAction(server, credentials, config, action, jail, ip, res) {
  try {
    switch (action) {
      case 'status': {
        const cmd = `
          echo "=== INSTALLED ===" && command -v fail2ban-client >/dev/null 2>&1 && echo "yes" || echo "no";
          echo "=== SERVICE ===" && systemctl is-active fail2ban 2>/dev/null || echo "inactive";
          echo "=== JAILS ===" && sudo fail2ban-client status 2>/dev/null || echo "not-available"
        `;
        const output = await executeSSHCommand(server, credentials, cmd);

        const installed = output.includes('=== INSTALLED ===') && output.split('=== INSTALLED ===')[1]?.includes('yes');
        const isRunning = output.includes('active') && !output.includes('inactive');
        const jails = [];

        // Parse jail list
        const jailListMatch = output.match(/Jail list:\s*(.+)/);
        if (jailListMatch) {
          const jailNames = jailListMatch[1].split(',').map(j => j.trim()).filter(j => j);

          // Get status for each jail
          if (jailNames.length > 0) {
            const jailCmds = jailNames.map(j => `echo "=== JAIL:${j} ===" && sudo fail2ban-client status ${j} 2>/dev/null`).join('; ');
            const jailOutput = await executeSSHCommand(server, credentials, jailCmds);

            for (const jailName of jailNames) {
              const jailMatch = jailOutput.match(new RegExp(`=== JAIL:${jailName} ===\\s*([\\s\\S]*?)(?==== JAIL:|$)`));
              if (jailMatch) {
                const jailData = jailMatch[1];
                const jailObj = { name: jailName, enabled: true };

                const failedMatch = jailData.match(/Currently failed:\s*(\d+)/);
                if (failedMatch) jailObj.currently_failed = parseInt(failedMatch[1]);

                const bannedMatch = jailData.match(/Currently banned:\s*(\d+)/);
                if (bannedMatch) jailObj.currently_banned = parseInt(bannedMatch[1]);

                const bannedIpsMatch = jailData.match(/Banned IP list:\s*(.+)/);
                if (bannedIpsMatch && bannedIpsMatch[1].trim()) {
                  jailObj.banned_ips = bannedIpsMatch[1].trim().split(/\s+/).filter(ip => ip);
                } else {
                  jailObj.banned_ips = [];
                }

                jails.push(jailObj);
              }
            }
          }
        }

        return res.json({
          installed,
          running: isRunning,
          jails
        });
      }

      case 'install': {
        const installCmd = `
          if command -v apt-get >/dev/null 2>&1; then
            sudo apt-get update && sudo apt-get install -y fail2ban
          elif command -v yum >/dev/null 2>&1; then
            sudo yum install -y epel-release && sudo yum install -y fail2ban
          elif command -v dnf >/dev/null 2>&1; then
            sudo dnf install -y fail2ban
          fi
          sudo systemctl enable fail2ban
          sudo systemctl start fail2ban
          fail2ban-client --version
        `;
        const output = await executeSSHCommand(server, credentials, installCmd);
        return res.json({ success: true, output });
      }

      case 'get-available-jails': {
        const cmd = `ls /etc/fail2ban/filter.d/*.conf 2>/dev/null | xargs -n1 basename 2>/dev/null | sed 's/\\.conf$//' | sort`;
        const output = await executeSSHCommand(server, credentials, cmd);
        const availableJails = output.trim().split('\n').filter(j => j);
        return res.json({ jails: availableJails });
      }

      case 'enable-jail': {
        const jailName = config.jailName || jail;
        const port = config.port || 'ssh';
        const maxretry = config.maxretry || 5;
        const bantime = config.bantime || '10m';
        const findtime = config.findtime || '10m';

        if (!jailName) {
          return res.status(400).json({ error: 'Jail name required' });
        }

        const jailConfig = `[${jailName}]
enabled = true
port = ${port}
maxretry = ${maxretry}
bantime = ${bantime}
findtime = ${findtime}
`;
        const cmd = `
          echo '${jailConfig}' | sudo tee /etc/fail2ban/jail.d/${jailName}.local
          sudo fail2ban-client reload
        `;
        await executeSSHCommand(server, credentials, cmd);
        return res.json({ success: true });
      }

      case 'disable-jail': {
        const jailName = config.jailName || jail;
        if (!jailName) {
          return res.status(400).json({ error: 'Jail name required' });
        }
        const cmd = `
          sudo rm -f /etc/fail2ban/jail.d/${jailName}.local
          sudo fail2ban-client reload
        `;
        await executeSSHCommand(server, credentials, cmd);
        return res.json({ success: true });
      }

      case 'ban':
        if (!jail || !ip) return res.status(400).json({ error: 'Jail and IP required' });
        await executeSSHCommand(server, credentials, `sudo fail2ban-client set ${jail} banip ${ip}`);
        return res.json({ success: true });

      case 'unban':
        if (!jail || !ip) return res.status(400).json({ error: 'Jail and IP required' });
        await executeSSHCommand(server, credentials, `sudo fail2ban-client set ${jail} unbanip ${ip}`);
        return res.json({ success: true });

      case 'get-whitelist': {
        const cmd = `sudo cat /etc/fail2ban/jail.local 2>/dev/null | grep -E "^ignoreip" || sudo cat /etc/fail2ban/jail.conf 2>/dev/null | grep -E "^ignoreip" || echo "ignoreip = 127.0.0.1/8"`;
        const output = await executeSSHCommand(server, credentials, cmd);
        const match = output.match(/ignoreip\s*=\s*(.+)/);
        const ips = match ? match[1].trim().split(/\s+/).filter(ip => ip) : ['127.0.0.1/8'];
        return res.json({ whitelist: ips });
      }

      case 'whitelist': {
        const whitelistIp = config.ip || ip;
        if (!whitelistIp) return res.status(400).json({ error: 'IP required' });

        // Get current whitelist and add new IP
        const getCurrentCmd = `sudo cat /etc/fail2ban/jail.local 2>/dev/null | grep -E "^ignoreip" || echo "ignoreip = 127.0.0.1/8"`;
        const current = await executeSSHCommand(server, credentials, getCurrentCmd);
        const match = current.match(/ignoreip\s*=\s*(.+)/);
        const currentIps = match ? match[1].trim() : '127.0.0.1/8';

        if (!currentIps.includes(whitelistIp)) {
          const newIgnoreIp = `${currentIps} ${whitelistIp}`;
          const cmd = `
            sudo mkdir -p /etc/fail2ban
            if [ -f /etc/fail2ban/jail.local ]; then
              sudo sed -i 's/^ignoreip.*/ignoreip = ${newIgnoreIp}/' /etc/fail2ban/jail.local
            else
              echo -e "[DEFAULT]\\nignoreip = ${newIgnoreIp}" | sudo tee /etc/fail2ban/jail.local
            fi
            sudo fail2ban-client reload
          `;
          await executeSSHCommand(server, credentials, cmd);
        }
        return res.json({ success: true });
      }

      case 'remove-whitelist': {
        const removeIp = config.ip || ip;
        if (!removeIp) return res.status(400).json({ error: 'IP required' });

        const getCurrentCmd = `sudo cat /etc/fail2ban/jail.local 2>/dev/null | grep -E "^ignoreip" || echo "ignoreip = 127.0.0.1/8"`;
        const current = await executeSSHCommand(server, credentials, getCurrentCmd);
        const match = current.match(/ignoreip\s*=\s*(.+)/);
        const currentIps = match ? match[1].trim().split(/\s+/).filter(i => i && i !== removeIp).join(' ') : '127.0.0.1/8';

        const cmd = `
          if [ -f /etc/fail2ban/jail.local ]; then
            sudo sed -i 's/^ignoreip.*/ignoreip = ${currentIps}/' /etc/fail2ban/jail.local
          fi
          sudo fail2ban-client reload
        `;
        await executeSSHCommand(server, credentials, cmd);
        return res.json({ success: true });
      }

      case 'get-config': {
        const cmd = `
          echo "=== BANTIME ===" && sudo fail2ban-client get DEFAULT bantime 2>/dev/null || echo "600";
          echo "=== FINDTIME ===" && sudo fail2ban-client get DEFAULT findtime 2>/dev/null || echo "600";
          echo "=== MAXRETRY ===" && sudo fail2ban-client get DEFAULT maxretry 2>/dev/null || echo "5"
        `;
        const output = await executeSSHCommand(server, credentials, cmd);

        const bantimeMatch = output.match(/=== BANTIME ===\s*(\d+)/);
        const findtimeMatch = output.match(/=== FINDTIME ===\s*(\d+)/);
        const maxretryMatch = output.match(/=== MAXRETRY ===\s*(\d+)/);

        return res.json({
          bantime: bantimeMatch ? parseInt(bantimeMatch[1]) : 600,
          findtime: findtimeMatch ? parseInt(findtimeMatch[1]) : 600,
          maxretry: maxretryMatch ? parseInt(maxretryMatch[1]) : 5
        });
      }

      case 'update-config': {
        const bantime = config.bantime || 600;
        const findtime = config.findtime || 600;
        const maxretry = config.maxretry || 5;

        const configContent = `[DEFAULT]
bantime = ${bantime}
findtime = ${findtime}
maxretry = ${maxretry}
`;
        const cmd = `
          echo '${configContent}' | sudo tee /etc/fail2ban/jail.d/defaults.local
          sudo fail2ban-client reload
        `;
        await executeSSHCommand(server, credentials, cmd);
        return res.json({ success: true });
      }

      case 'get-logs': {
        const cmd = `sudo tail -n 100 /var/log/fail2ban.log 2>/dev/null || echo "No logs available"`;
        const output = await executeSSHCommand(server, credentials, cmd);
        return res.json({ logs: output });
      }

      case 'start':
        await executeSSHCommand(server, credentials, 'sudo systemctl start fail2ban');
        return res.json({ success: true });

      case 'stop':
        await executeSSHCommand(server, credentials, 'sudo systemctl stop fail2ban');
        return res.json({ success: true });

      case 'restart':
        await executeSSHCommand(server, credentials, 'sudo systemctl restart fail2ban');
        return res.json({ success: true });

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Helper to parse transfer bytes like "1.5 GiB" to bytes
function parseTransferBytes(str) {
  if (!str) return 0;
  const match = str.match(/([\d.]+)\s*([KMGT]i?B)?/i);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();

  const multipliers = {
    'B': 1,
    'KB': 1024,
    'KIB': 1024,
    'MB': 1024 * 1024,
    'MIB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'GIB': 1024 * 1024 * 1024,
    'TB': 1024 * 1024 * 1024 * 1024,
    'TIB': 1024 * 1024 * 1024 * 1024
  };

  return Math.floor(num * (multipliers[unit] || 1));
}

function executeSSHCommand(server, credentials, command) {
  return new Promise((resolve, reject) => {
    const sshConn = new SSHClient();
    const sshConfig = {
      host: server.ip_address,
      port: server.ssh_port || 22,
      username: credentials.username,
      readyTimeout: 10000,
      algorithms: {
        kex: [
          'curve25519-sha256', 'curve25519-sha256@libssh.org',
          'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1',
        ],
      },
    };

    if (server.ssh_private_key_encrypted) {
      try {
        const keyData = decryptCredentials(server.ssh_private_key_encrypted);
        if (keyData && keyData.key) {
          sshConfig.privateKey = keyData.key;
          if (credentials.passphrase) {
            sshConfig.passphrase = credentials.passphrase;
          }
        }
      } catch (e) {
        logger.error('Failed to decrypt SSH key:', e);
      }
    }

    if (credentials.password) {
      sshConfig.password = credentials.password;
    }

    let output = '';
    let errorOutput = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      sshConn.end();
      reject(new Error('SSH command timed out'));
    }, 30000);

    sshConn.on('ready', () => {
      sshConn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          sshConn.end();
          return reject(err);
        }

        stream.on('data', (data) => {
          output += data.toString('utf8');
        });

        stream.stderr.on('data', (data) => {
          errorOutput += data.toString('utf8');
        });

        stream.on('close', () => {
          clearTimeout(timeout);
          sshConn.end();
          if (!timedOut) {
            resolve(output || errorOutput || '');
          }
        });
      });
    });

    sshConn.on('error', (err) => {
      clearTimeout(timeout);
      if (!timedOut) {
        reject(err);
      }
    });

    sshConn.connect(sshConfig);
  });
}
