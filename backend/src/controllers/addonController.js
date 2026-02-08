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
    const { action, container, jail, ip } = req.body;

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
    const config = serverAddon?.config ? parseJsonField(serverAddon.config) : {};

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
          echo "=== SERVICE_STATUS ===" && systemctl is-active cloudflared 2>/dev/null || echo "inactive";
          echo "=== TUNNEL_LIST ===" && cloudflared tunnel list --output json 2>/dev/null || echo "[]";
          echo "=== CONFIG ===" && cat /etc/cloudflared/config.yml 2>/dev/null || echo "not-found"
        `;
        const output = await executeSSHCommand(server, credentials, cmd);

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
          running: serviceRunning,
          status: serviceRunning ? 'running' : 'stopped',
          tunnel: tunnels.length > 0 ? tunnels[0] : null,
          tunnels,
          ingress,
          connections: tunnels.length > 0 ? (tunnels[0].connections?.length || 1) : 0
        });
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
          echo "=== INTERFACE ===" && ip link show ${wgInterface} 2>/dev/null && echo "UP" || echo "DOWN";
          echo "=== WG_SHOW ===" && sudo wg show ${wgInterface} 2>/dev/null || echo "not-running";
          echo "=== TRANSFER ===" && sudo wg show ${wgInterface} transfer 2>/dev/null || echo ""
        `;
        const output = await executeSSHCommand(server, credentials, cmd);

        const isUp = output.includes('state UP') || (output.includes('interface:') && !output.includes('not-running'));
        const peers = [];

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
                // Convert relative time to timestamp
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
        const transferMatch = output.match(/=== TRANSFER ===\s*([\s\S]*?)$/);
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
          running: isUp,
          interface: { name: wgInterface, up: isUp },
          peers
        });
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
          echo "=== SERVICE ===" && systemctl is-active fail2ban 2>/dev/null || echo "inactive";
          echo "=== JAILS ===" && sudo fail2ban-client status 2>/dev/null || echo "not-available"
        `;
        const output = await executeSSHCommand(server, credentials, cmd);

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
                const jail = { name: jailName, enabled: true };

                const failedMatch = jailData.match(/Currently failed:\s*(\d+)/);
                if (failedMatch) jail.currently_failed = parseInt(failedMatch[1]);

                const bannedMatch = jailData.match(/Currently banned:\s*(\d+)/);
                if (bannedMatch) jail.currently_banned = parseInt(bannedMatch[1]);

                const bannedIpsMatch = jailData.match(/Banned IP list:\s*(.+)/);
                if (bannedIpsMatch && bannedIpsMatch[1].trim()) {
                  jail.banned_ips = bannedIpsMatch[1].trim().split(/\s+/).filter(ip => ip);
                } else {
                  jail.banned_ips = [];
                }

                jails.push(jail);
              }
            }
          }
        }

        return res.json({
          running: isRunning,
          jails
        });
      }

      case 'unban':
        if (!jail || !ip) return res.status(400).json({ error: 'Jail and IP required' });
        await executeSSHCommand(server, credentials, `sudo fail2ban-client set ${jail} unbanip ${ip}`);
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
