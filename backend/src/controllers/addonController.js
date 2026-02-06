const { Client: SSHClient } = require('ssh2');
const db = require('../config/database');
const { decryptCredentials } = require('../services/encryption');
const logger = require('../services/logger');

// Get all available addons (admin)
exports.getAllAddons = async (req, res) => {
  try {
    const addons = await db('addons').orderBy('category').orderBy('name');
    res.json(addons.map(a => ({
      ...a,
      default_config: a.default_config ? JSON.parse(a.default_config) : {}
    })));
  } catch (err) {
    logger.error('Get all addons error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get single addon details
exports.getAddon = async (req, res) => {
  try {
    const addon = await db('addons').where({ id: req.params.addonId }).first();
    if (!addon) {
      return res.status(404).json({ error: 'Addon not found' });
    }
    addon.default_config = addon.default_config ? JSON.parse(addon.default_config) : {};
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
      default_config: a.default_config ? JSON.parse(a.default_config) : {},
      server_config: a.server_config ? JSON.parse(a.server_config) : null,
      is_installed: a.server_enabled !== null,
      server_enabled: a.server_enabled ?? false
    })));
  } catch (err) {
    logger.error('Get server addons error:', err);
    res.status(500).json({ error: 'Internal server error' });
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
    const { action, params } = req.body;

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
    const config = serverAddon?.config ? JSON.parse(serverAddon.config) : {};

    let cmd = '';
    let result = {};

    // Define addon-specific actions
    switch (addon.slug) {
      case 'cloudflare-tunnel':
        switch (action) {
          case 'list-tunnels':
            cmd = 'cloudflared tunnel list 2>/dev/null';
            break;
          case 'tunnel-info':
            cmd = `cloudflared tunnel info ${params?.tunnel_name || ''} 2>/dev/null`;
            break;
          case 'restart':
            cmd = 'sudo systemctl restart cloudflared';
            break;
          case 'status':
            cmd = 'sudo systemctl status cloudflared --no-pager';
            break;
          default:
            return res.status(400).json({ error: 'Unknown action' });
        }
        break;

      case 'wireguard':
        const wgInterface = config.interface || 'wg0';
        switch (action) {
          case 'show':
            cmd = `sudo wg show ${wgInterface}`;
            break;
          case 'show-config':
            cmd = `sudo cat /etc/wireguard/${wgInterface}.conf 2>/dev/null || echo "Config not found"`;
            break;
          case 'up':
            cmd = `sudo wg-quick up ${wgInterface}`;
            break;
          case 'down':
            cmd = `sudo wg-quick down ${wgInterface}`;
            break;
          case 'list-peers':
            cmd = `sudo wg show ${wgInterface} peers`;
            break;
          case 'transfer-stats':
            cmd = `sudo wg show ${wgInterface} transfer`;
            break;
          default:
            return res.status(400).json({ error: 'Unknown action' });
        }
        break;

      case 'docker':
        switch (action) {
          case 'ps':
            cmd = 'docker ps --format "table {{.ID}}\\t{{.Names}}\\t{{.Status}}\\t{{.Ports}}"';
            break;
          case 'ps-all':
            cmd = 'docker ps -a --format "table {{.ID}}\\t{{.Names}}\\t{{.Status}}\\t{{.Ports}}"';
            break;
          case 'images':
            cmd = 'docker images --format "table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}"';
            break;
          case 'stats':
            cmd = 'docker stats --no-stream --format "table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}"';
            break;
          case 'start':
            if (!params?.container) return res.status(400).json({ error: 'Container name required' });
            cmd = `docker start ${params.container}`;
            break;
          case 'stop':
            if (!params?.container) return res.status(400).json({ error: 'Container name required' });
            cmd = `docker stop ${params.container}`;
            break;
          case 'restart':
            if (!params?.container) return res.status(400).json({ error: 'Container name required' });
            cmd = `docker restart ${params.container}`;
            break;
          case 'logs':
            if (!params?.container) return res.status(400).json({ error: 'Container name required' });
            const lines = params.lines || 100;
            cmd = `docker logs --tail ${lines} ${params.container} 2>&1`;
            break;
          default:
            return res.status(400).json({ error: 'Unknown action' });
        }
        break;

      case 'fail2ban':
        switch (action) {
          case 'status':
            cmd = 'sudo fail2ban-client status';
            break;
          case 'jail-status':
            if (!params?.jail) return res.status(400).json({ error: 'Jail name required' });
            cmd = `sudo fail2ban-client status ${params.jail}`;
            break;
          case 'banned-ips':
            if (!params?.jail) {
              cmd = 'sudo fail2ban-client status | grep "Jail list" | sed "s/.*://;s/,/\\n/g" | while read jail; do echo "=== $jail ==="; sudo fail2ban-client status $jail 2>/dev/null | grep "Banned IP"; done';
            } else {
              cmd = `sudo fail2ban-client status ${params.jail} | grep -A 100 "Banned IP"`;
            }
            break;
          case 'unban':
            if (!params?.jail || !params?.ip) return res.status(400).json({ error: 'Jail and IP required' });
            cmd = `sudo fail2ban-client set ${params.jail} unbanip ${params.ip}`;
            break;
          default:
            return res.status(400).json({ error: 'Unknown action' });
        }
        break;

      default:
        return res.status(400).json({ error: 'Addon has no actions configured' });
    }

    const output = await executeSSHCommand(server, credentials, cmd);
    result = { output: output.trim(), action, addon: addon.slug };

    res.json(result);
  } catch (err) {
    logger.error('Execute addon action error:', err);
    res.status(500).json({ error: 'Failed to execute action: ' + err.message });
  }
};

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
