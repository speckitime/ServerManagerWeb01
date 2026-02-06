const { Client: SSHClient } = require('ssh2');
const db = require('../config/database');
const { decryptCredentials } = require('../services/encryption');
const logger = require('../services/logger');

// Log templates that can be added by users
const LOG_TEMPLATES = {
  linux: {
    system: [
      { name: 'System Log (syslog)', path: '/var/log/syslog', description: 'Ubuntu/Debian system messages' },
      { name: 'System Log (messages)', path: '/var/log/messages', description: 'RHEL/CentOS system messages' },
      { name: 'Journal (recent)', path: 'journalctl -n 200 --no-pager', description: 'Systemd journal', isCommand: true },
      { name: 'Authentication Log', path: '/var/log/auth.log', description: 'Login attempts and authentication' },
      { name: 'Kernel Log', path: '/var/log/kern.log', description: 'Kernel messages' },
      { name: 'Boot Log', path: '/var/log/boot.log', description: 'System boot messages' },
      { name: 'Dmesg', path: 'dmesg | tail -n 200', description: 'Kernel ring buffer', isCommand: true },
    ],
    package: [
      { name: 'DPKG Log', path: '/var/log/dpkg.log', description: 'Debian package manager' },
      { name: 'APT History', path: '/var/log/apt/history.log', description: 'APT package history' },
      { name: 'YUM Log', path: '/var/log/yum.log', description: 'YUM package manager' },
      { name: 'DNF Log', path: '/var/log/dnf.log', description: 'DNF package manager' },
    ],
    webserver: [
      { name: 'Nginx Access', path: '/var/log/nginx/access.log', description: 'Nginx access log' },
      { name: 'Nginx Error', path: '/var/log/nginx/error.log', description: 'Nginx error log' },
      { name: 'Apache Access', path: '/var/log/apache2/access.log', description: 'Apache access log' },
      { name: 'Apache Error', path: '/var/log/apache2/error.log', description: 'Apache error log' },
      { name: 'Apache Access (RHEL)', path: '/var/log/httpd/access_log', description: 'Apache access (RHEL/CentOS)' },
      { name: 'Apache Error (RHEL)', path: '/var/log/httpd/error_log', description: 'Apache error (RHEL/CentOS)' },
    ],
    database: [
      { name: 'MySQL Error', path: '/var/log/mysql/error.log', description: 'MySQL error log' },
      { name: 'PostgreSQL', path: '/var/log/postgresql/postgresql-*-main.log', description: 'PostgreSQL main log' },
      { name: 'MongoDB', path: '/var/log/mongodb/mongod.log', description: 'MongoDB log' },
      { name: 'Redis', path: '/var/log/redis/redis-server.log', description: 'Redis server log' },
    ],
    container: [
      { name: 'Docker', path: '/var/log/docker.log', description: 'Docker daemon log' },
      { name: 'Containerd', path: '/var/log/containerd.log', description: 'Containerd log' },
    ],
    mail: [
      { name: 'Mail Log', path: '/var/log/mail.log', description: 'Mail server log' },
      { name: 'Postfix', path: '/var/log/mail.log', description: 'Postfix mail log' },
    ],
    security: [
      { name: 'Fail2ban', path: '/var/log/fail2ban.log', description: 'Fail2ban intrusion prevention' },
      { name: 'UFW Log', path: '/var/log/ufw.log', description: 'UFW firewall log' },
    ],
  },
  windows: {
    system: [
      { name: 'Application Events', path: 'Application', description: 'Application event log', isEventLog: true },
      { name: 'System Events', path: 'System', description: 'System event log', isEventLog: true },
      { name: 'Security Events', path: 'Security', description: 'Security event log', isEventLog: true },
    ],
  },
};

// Get log templates for frontend
exports.getLogTemplates = async (req, res) => {
  try {
    const server = await db('servers')
      .where({ id: req.params.serverId })
      .first();

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const templates = LOG_TEMPLATES[server.os_type] || {};
    res.json({ templates, os_type: server.os_type });
  } catch (err) {
    logger.error('Get log templates error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get configured logs for a server (from database)
exports.getLogFiles = async (req, res) => {
  try {
    const serverId = req.params.serverId;
    const server = await db('servers').where({ id: serverId }).first();

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Get custom logs from database
    const customLogs = await db('server_log_paths')
      .where({ server_id: serverId, is_active: true })
      .orderBy('category')
      .orderBy('name');

    res.json({
      logs: customLogs,
      os_type: server.os_type,
    });
  } catch (err) {
    logger.error('Get log files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Auto-detect available logs on a server via SSH
exports.detectLogs = async (req, res) => {
  try {
    const serverId = req.params.serverId;
    const server = await db('servers').where({ id: serverId }).first();

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ error: 'Auto-detection only available for Linux servers' });
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

    // Detect logs via SSH
    const detectCmd = `
      echo "=== DETECTED LOGS ==="
      # System logs
      for f in /var/log/syslog /var/log/messages /var/log/auth.log /var/log/kern.log /var/log/boot.log; do
        [ -r "$f" ] && echo "SYSTEM|$f|$(basename $f)"
      done
      # Check if journalctl available
      command -v journalctl >/dev/null 2>&1 && echo "SYSTEM|journalctl -n 200 --no-pager|Journal (systemd)|CMD"
      # Package logs
      for f in /var/log/dpkg.log /var/log/apt/history.log /var/log/yum.log /var/log/dnf.log; do
        [ -r "$f" ] && echo "PACKAGE|$f|$(basename $f)"
      done
      # Web server logs
      for f in /var/log/nginx/access.log /var/log/nginx/error.log; do
        [ -r "$f" ] && echo "WEBSERVER|$f|nginx $(basename $f)"
      done
      for f in /var/log/apache2/access.log /var/log/apache2/error.log; do
        [ -r "$f" ] && echo "WEBSERVER|$f|apache $(basename $f)"
      done
      for f in /var/log/httpd/access_log /var/log/httpd/error_log; do
        [ -r "$f" ] && echo "WEBSERVER|$f|httpd $(basename $f)"
      done
      # Database logs
      for f in /var/log/mysql/error.log /var/log/mongodb/mongod.log /var/log/redis/redis-server.log; do
        [ -r "$f" ] && echo "DATABASE|$f|$(basename $f)"
      done
      ls /var/log/postgresql/*.log 2>/dev/null | head -1 | while read f; do
        [ -r "$f" ] && echo "DATABASE|$f|postgresql"
      done
      # Security logs
      for f in /var/log/fail2ban.log /var/log/ufw.log; do
        [ -r "$f" ] && echo "SECURITY|$f|$(basename $f)"
      done
      # Docker
      [ -r /var/log/docker.log ] && echo "CONTAINER|/var/log/docker.log|docker"
      # Mail
      [ -r /var/log/mail.log ] && echo "MAIL|/var/log/mail.log|mail"
      echo "=== END ==="
    `;

    const output = await executeSSHCommand(server, credentials, detectCmd);
    const detected = [];

    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('|') && !line.startsWith('===')) {
        const parts = line.split('|');
        if (parts.length >= 3) {
          const category = parts[0].toLowerCase();
          const path = parts[1];
          const name = parts[2];
          const isCommand = parts[3] === 'CMD';
          detected.push({ category, path, name, isCommand });
        }
      }
    }

    res.json({ detected });
  } catch (err) {
    logger.error('Detect logs error:', err);
    res.status(500).json({ error: 'Failed to detect logs: ' + err.message });
  }
};

// Add a log path to a server
exports.addLogPath = async (req, res) => {
  try {
    const serverId = req.params.serverId;
    const { name, path, category } = req.body;

    if (!name || !path) {
      return res.status(400).json({ error: 'Name and path are required' });
    }

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Check if already exists
    const existing = await db('server_log_paths')
      .where({ server_id: serverId, path })
      .first();

    if (existing) {
      return res.status(400).json({ error: 'This log path already exists for this server' });
    }

    const [id] = await db('server_log_paths').insert({
      server_id: serverId,
      name,
      path,
      category: category || 'custom',
    });

    const logPath = await db('server_log_paths').where({ id }).first();
    res.status(201).json(logPath);
  } catch (err) {
    logger.error('Add log path error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Add multiple logs at once (from detection or templates)
exports.addMultipleLogs = async (req, res) => {
  try {
    const serverId = req.params.serverId;
    const { logs } = req.body;

    if (!logs || !Array.isArray(logs) || logs.length === 0) {
      return res.status(400).json({ error: 'Logs array is required' });
    }

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Filter out existing paths
    const existingPaths = await db('server_log_paths')
      .where({ server_id: serverId })
      .pluck('path');

    const newLogs = logs.filter(log => !existingPaths.includes(log.path));

    if (newLogs.length === 0) {
      return res.json({ added: 0, message: 'All logs already exist' });
    }

    await db('server_log_paths').insert(
      newLogs.map(log => ({
        server_id: serverId,
        name: log.name,
        path: log.path,
        category: log.category || 'custom',
      }))
    );

    res.json({ added: newLogs.length });
  } catch (err) {
    logger.error('Add multiple logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Remove a log path
exports.removeLogPath = async (req, res) => {
  try {
    const { serverId, logId } = req.params;

    const deleted = await db('server_log_paths')
      .where({ id: logId, server_id: serverId })
      .del();

    if (!deleted) {
      return res.status(404).json({ error: 'Log path not found' });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Remove log path error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Fetch log content directly via SSH
exports.requestLogContent = async (req, res) => {
  try {
    const { log_path, lines, search, isCommand } = req.body;
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

    const numLines = Math.min(Math.max(parseInt(lines) || 200, 1), 5000);
    let cmd;

    // Check if it's a command (like journalctl) or a file path
    if (isCommand || log_path.startsWith('journalctl') || log_path.startsWith('dmesg')) {
      // It's a command - sanitize and execute
      const safeCmd = log_path.replace(/[;&|`${}]/g, '');
      if (search) {
        const safeSearch = search.replace(/'/g, "'\\''");
        cmd = `${safeCmd} 2>&1 | grep -i '${safeSearch}' || echo '(no matches)'`;
      } else {
        cmd = `${safeCmd} 2>&1`;
      }
    } else {
      // It's a file path
      const safePath = log_path.replace(/[;&|`$(){}]/g, '');
      if (search) {
        const safeSearch = search.replace(/'/g, "'\\''");
        cmd = `sudo tail -n ${numLines} '${safePath}' 2>&1 | grep -i '${safeSearch}' || echo '(no matches)'`;
      } else {
        cmd = `sudo tail -n ${numLines} '${safePath}' 2>&1`;
      }
    }

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
