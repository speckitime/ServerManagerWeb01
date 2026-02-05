const { Client: SSHClient } = require('ssh2');
const db = require('../config/database');
const { decryptCredentials } = require('../services/encryption');
const logger = require('../services/logger');

const DEFAULT_LOG_FILES = {
  linux: [
    { path: '/var/log/syslog', name: 'System Log' },
    { path: '/var/log/auth.log', name: 'Authentication Log' },
    { path: '/var/log/kern.log', name: 'Kernel Log' },
    { path: '/var/log/dpkg.log', name: 'Package Manager Log' },
    { path: '/var/log/apt/history.log', name: 'APT History' },
    { path: '/var/log/nginx/access.log', name: 'Nginx Access Log' },
    { path: '/var/log/nginx/error.log', name: 'Nginx Error Log' },
    { path: '/var/log/apache2/access.log', name: 'Apache Access Log' },
    { path: '/var/log/apache2/error.log', name: 'Apache Error Log' },
    { path: '/var/log/mysql/error.log', name: 'MySQL Error Log' },
    { path: '/var/log/postgresql/postgresql-main.log', name: 'PostgreSQL Log' },
  ],
  windows: [
    { path: 'Application', name: 'Application Event Log' },
    { path: 'System', name: 'System Event Log' },
    { path: 'Security', name: 'Security Event Log' },
    { path: 'Setup', name: 'Setup Event Log' },
  ],
};

exports.getLogFiles = async (req, res) => {
  try {
    const server = await db('servers')
      .where({ id: req.params.serverId })
      .first();

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    res.json({
      default_logs: DEFAULT_LOG_FILES[server.os_type] || [],
      os_type: server.os_type,
    });
  } catch (err) {
    logger.error('Get log files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Fetch log content directly via SSH
exports.requestLogContent = async (req, res) => {
  try {
    const { log_path, lines, search } = req.body;
    const serverId = req.params.serverId;

    if (!log_path) {
      return res.status(400).json({ error: 'log_path is required' });
    }

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ error: 'Log viewing via SSH only available for Linux servers' });
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
      return res.status(400).json({ error: 'No SSH credentials configured for this server' });
    }

    // Build the SSH command to read the log
    const numLines = Math.min(Math.max(parseInt(lines) || 200, 1), 5000);
    // Sanitize log_path to prevent command injection
    const safePath = log_path.replace(/[;&|`$(){}]/g, '');
    let cmd;
    if (search) {
      const safeSearch = search.replace(/'/g, "'\\''");
      cmd = `tail -n ${numLines} '${safePath}' 2>&1 | grep -i '${safeSearch}' 2>&1 || echo '(no matches)'`;
    } else {
      cmd = `tail -n ${numLines} '${safePath}' 2>&1`;
    }

    // Execute via SSH
    const content = await executeSSHCommand(server, credentials, cmd);

    res.json({
      server_id: serverId,
      log_path,
      content,
      total_lines: content.split('\n').length,
    });
  } catch (err) {
    logger.error('Request log content error:', err);
    res.status(500).json({ error: 'Failed to fetch log content: ' + err.message });
  }
};

// Legacy agent route
exports.receiveLogContent = async (req, res) => {
  try {
    const server = req.server;
    const { log_path, content, total_lines } = req.body;

    const io = req.app.get('io');
    if (io) {
      io.to(`server:${server.id}`).emit('log_content', {
        server_id: server.id,
        log_path,
        content,
        total_lines,
      });
    }

    res.json({ status: 'ok' });
  } catch (err) {
    logger.error('Receive log content error:', err);
    res.status(500).json({ error: 'Internal server error' });
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
    }, 15000);

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
            resolve(output || errorOutput || '(empty)');
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
