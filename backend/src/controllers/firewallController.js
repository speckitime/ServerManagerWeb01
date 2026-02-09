const { Client } = require('ssh2');
const db = require('../config/database');
const logger = require('../services/logger');
const CryptoJS = require('crypto-js');
const config = require('../config/app');

/**
 * Decrypt SSH password
 */
function decryptPassword(encrypted) {
  if (!encrypted) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, config.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
}

/**
 * Create SSH connection to server
 */
async function createConnection(server) {
  const conn = new Client();

  const sshConfig = {
    host: server.hostname,
    port: server.ssh_port || 22,
    username: server.ssh_username,
    readyTimeout: 10000,
  };

  if (server.ssh_private_key) {
    sshConfig.privateKey = server.ssh_private_key;
  } else if (server.ssh_password) {
    sshConfig.password = decryptPassword(server.ssh_password);
  }

  return new Promise((resolve, reject) => {
    conn.on('ready', () => resolve(conn));
    conn.on('error', reject);
    conn.connect(sshConfig);
  });
}

/**
 * Execute SSH command
 */
function execCommand(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);

      let stdout = '';
      let stderr = '';

      stream.on('data', (data) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      stream.on('close', (code) => {
        resolve({ stdout, stderr, code });
      });
    });
  });
}

/**
 * Get firewall status (UFW or iptables)
 */
exports.getStatus = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    conn = await createConnection(server);

    // Check if UFW is available
    const ufwCheck = await execCommand(conn, 'which ufw 2>/dev/null');
    const hasUfw = ufwCheck.stdout.trim().length > 0;

    let status = {
      type: 'none',
      enabled: false,
      rules: [],
    };

    if (hasUfw) {
      // Get UFW status
      const ufwStatus = await execCommand(conn, 'sudo ufw status verbose 2>/dev/null');

      if (ufwStatus.code === 0) {
        status.type = 'ufw';
        status.enabled = ufwStatus.stdout.includes('Status: active');

        // Parse UFW rules
        const lines = ufwStatus.stdout.split('\n');
        let inRules = false;
        const rules = [];

        for (const line of lines) {
          if (line.includes('--')) {
            inRules = true;
            continue;
          }
          if (inRules && line.trim()) {
            // Parse rule: "22/tcp ALLOW IN Anywhere"
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
              rules.push({
                port: parts[0],
                action: parts[1],
                direction: parts[2] || 'IN',
                from: parts.slice(3).join(' ') || 'Anywhere',
              });
            }
          }
        }
        status.rules = rules;

        // Get default policies
        const defaultMatch = ufwStatus.stdout.match(/Default: (\w+) \(incoming\), (\w+) \(outgoing\)/);
        if (defaultMatch) {
          status.defaultIncoming = defaultMatch[1].toLowerCase();
          status.defaultOutgoing = defaultMatch[2].toLowerCase();
        }
      }
    } else {
      // Fall back to iptables
      const iptablesCheck = await execCommand(conn, 'which iptables 2>/dev/null');
      if (iptablesCheck.stdout.trim().length > 0) {
        status.type = 'iptables';
        status.enabled = true;

        // Get iptables rules
        const iptablesOutput = await execCommand(conn, 'sudo iptables -L -n --line-numbers 2>/dev/null');

        if (iptablesOutput.code === 0) {
          const rules = [];
          let currentChain = '';

          for (const line of iptablesOutput.stdout.split('\n')) {
            if (line.startsWith('Chain ')) {
              currentChain = line.split(' ')[1];
            } else if (/^\d+/.test(line.trim())) {
              const parts = line.trim().split(/\s+/);
              if (parts.length >= 4) {
                rules.push({
                  num: parts[0],
                  chain: currentChain,
                  target: parts[1],
                  protocol: parts[2],
                  source: parts[4],
                  destination: parts[5],
                  options: parts.slice(6).join(' '),
                });
              }
            }
          }
          status.rules = rules;
        }
      }
    }

    conn.end();
    res.json(status);
  } catch (err) {
    if (conn) conn.end();
    logger.error('Get firewall status error:', err);
    res.status(500).json({ error: err.message || 'Failed to get firewall status' });
  }
};

/**
 * Enable/disable firewall
 */
exports.toggle = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;
    const { enable } = req.body;

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    conn = await createConnection(server);

    // Check if UFW is available
    const ufwCheck = await execCommand(conn, 'which ufw 2>/dev/null');
    const hasUfw = ufwCheck.stdout.trim().length > 0;

    if (hasUfw) {
      const command = enable ? 'sudo ufw --force enable' : 'sudo ufw disable';
      const result = await execCommand(conn, command);

      if (result.code !== 0) {
        conn.end();
        return res.status(500).json({ error: result.stderr || 'Failed to toggle firewall' });
      }

      conn.end();

      // Log activity
      await db('activity_logs').insert({
        user_id: req.user?.id,
        action: 'firewall_toggle',
        details: `${enable ? 'Enabled' : 'Disabled'} firewall on ${server.name}`,
        ip_address: req.ip,
      });

      res.json({ success: true, enabled: enable });
    } else {
      conn.end();
      res.status(400).json({ error: 'UFW not installed on server' });
    }
  } catch (err) {
    if (conn) conn.end();
    logger.error('Toggle firewall error:', err);
    res.status(500).json({ error: err.message || 'Failed to toggle firewall' });
  }
};

/**
 * Add firewall rule
 */
exports.addRule = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;
    const { port, protocol, action, from, to, direction } = req.body;

    if (!port || !action) {
      return res.status(400).json({ error: 'Port and action are required' });
    }

    // Validate port
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      // Check if it's a port range
      if (!/^\d+:\d+$/.test(port)) {
        return res.status(400).json({ error: 'Invalid port number' });
      }
    }

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    conn = await createConnection(server);

    // Build UFW command
    let command = `sudo ufw ${action.toLowerCase()}`;

    if (direction === 'out') {
      command += ' out';
    }

    if (from && from !== 'any') {
      command += ` from ${from}`;
    }

    if (to && to !== 'any') {
      command += ` to ${to}`;
    }

    command += ` ${port}`;

    if (protocol && protocol !== 'any') {
      command += `/${protocol.toLowerCase()}`;
    }

    const result = await execCommand(conn, command);

    conn.end();

    if (result.code !== 0 && result.stderr) {
      return res.status(500).json({ error: result.stderr });
    }

    // Log activity
    await db('activity_logs').insert({
      user_id: req.user?.id,
      action: 'firewall_rule_add',
      details: `Added firewall rule: ${action} ${port}${protocol ? '/' + protocol : ''} on ${server.name}`,
      ip_address: req.ip,
    });

    res.json({ success: true, message: 'Rule added successfully' });
  } catch (err) {
    if (conn) conn.end();
    logger.error('Add firewall rule error:', err);
    res.status(500).json({ error: err.message || 'Failed to add rule' });
  }
};

/**
 * Delete firewall rule
 */
exports.deleteRule = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;
    const { ruleNumber } = req.body;

    if (!ruleNumber) {
      return res.status(400).json({ error: 'Rule number is required' });
    }

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    conn = await createConnection(server);

    // Delete rule by number (need to confirm with --force)
    const result = await execCommand(conn, `sudo ufw --force delete ${ruleNumber}`);

    conn.end();

    if (result.code !== 0 && result.stderr) {
      return res.status(500).json({ error: result.stderr });
    }

    // Log activity
    await db('activity_logs').insert({
      user_id: req.user?.id,
      action: 'firewall_rule_delete',
      details: `Deleted firewall rule #${ruleNumber} on ${server.name}`,
      ip_address: req.ip,
    });

    res.json({ success: true, message: 'Rule deleted successfully' });
  } catch (err) {
    if (conn) conn.end();
    logger.error('Delete firewall rule error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete rule' });
  }
};

/**
 * Set default policy
 */
exports.setDefault = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;
    const { direction, policy } = req.body;

    if (!direction || !policy) {
      return res.status(400).json({ error: 'Direction and policy are required' });
    }

    if (!['incoming', 'outgoing', 'routed'].includes(direction)) {
      return res.status(400).json({ error: 'Invalid direction' });
    }

    if (!['allow', 'deny', 'reject'].includes(policy)) {
      return res.status(400).json({ error: 'Invalid policy' });
    }

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    conn = await createConnection(server);

    const result = await execCommand(conn, `sudo ufw default ${policy} ${direction}`);

    conn.end();

    if (result.code !== 0 && result.stderr) {
      return res.status(500).json({ error: result.stderr });
    }

    // Log activity
    await db('activity_logs').insert({
      user_id: req.user?.id,
      action: 'firewall_default',
      details: `Set default ${direction} policy to ${policy} on ${server.name}`,
      ip_address: req.ip,
    });

    res.json({ success: true, message: 'Default policy updated' });
  } catch (err) {
    if (conn) conn.end();
    logger.error('Set default policy error:', err);
    res.status(500).json({ error: err.message || 'Failed to set default policy' });
  }
};

/**
 * Get numbered rules (for deletion)
 */
exports.getNumberedRules = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    conn = await createConnection(server);

    const result = await execCommand(conn, 'sudo ufw status numbered 2>/dev/null');

    conn.end();

    if (result.code !== 0) {
      return res.status(500).json({ error: 'Failed to get numbered rules' });
    }

    // Parse numbered rules
    const rules = [];
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      const match = line.match(/\[\s*(\d+)\]\s+(.+)/);
      if (match) {
        rules.push({
          number: parseInt(match[1]),
          rule: match[2].trim(),
        });
      }
    }

    res.json(rules);
  } catch (err) {
    if (conn) conn.end();
    logger.error('Get numbered rules error:', err);
    res.status(500).json({ error: err.message || 'Failed to get numbered rules' });
  }
};
