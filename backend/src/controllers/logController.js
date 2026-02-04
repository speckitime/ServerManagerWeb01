const db = require('../config/database');
const logger = require('../services/logger');

// Log files are fetched from the agent via WebSocket/API
// This controller manages the log viewing interface

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

exports.requestLogContent = async (req, res) => {
  try {
    const { log_path, lines, search } = req.body;
    const serverId = req.params.serverId;

    // Send request to agent via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`server:${serverId}`).emit('request_log', {
        server_id: serverId,
        log_path,
        lines: lines || 100,
        search: search || null,
      });
    }

    res.json({ message: 'Log request sent to agent' });
  } catch (err) {
    logger.error('Request log content error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.receiveLogContent = async (req, res) => {
  try {
    const server = req.server;
    const { log_path, content, total_lines } = req.body;

    // Forward to connected clients via WebSocket
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
