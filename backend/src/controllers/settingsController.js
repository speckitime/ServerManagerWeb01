const db = require('../config/database');
const logger = require('../services/logger');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn } = require('child_process');
const fail2ban = require('../middleware/fail2ban');
const mailer = require('../services/mailer');

// ============================================================================
// Helper Functions (DRY - Don't Repeat Yourself)
// ============================================================================

/**
 * Generic helper to get settings by keys with optional formatters
 * @param {string[]} keys - Array of setting keys to fetch
 * @param {Object} formatters - Object mapping keys to formatter functions
 * @returns {Object} Formatted settings object
 */
async function getSettingsByKeys(keys, formatters = {}) {
  const settings = await db('settings').whereIn('key', keys);
  const result = {};
  settings.forEach(s => {
    if (formatters[s.key]) {
      result[s.key] = formatters[s.key](s.value);
    } else {
      result[s.key] = s.value;
    }
  });
  return result;
}

/**
 * Generic helper to update settings from an object
 * @param {Object} updates - Key-value pairs to update
 * @param {string[]} skipIfEmpty - Keys to skip if value is empty
 */
async function updateSettingsFromObject(updates, skipIfEmpty = []) {
  for (const [key, value] of Object.entries(updates)) {
    if (skipIfEmpty.includes(key) && !value) continue;
    await db('settings')
      .insert({ key, value: String(value), updated_at: db.fn.now() })
      .onConflict('key')
      .merge({ value: String(value), updated_at: db.fn.now() });
  }
}

// Common formatters
const formatters = {
  toBoolean: (v) => v === 'true',
  toInt: (defaultVal = 0) => (v) => parseInt(v) || defaultVal,
};

// ============================================================================
// Settings API Handlers
// ============================================================================

// Get all settings
exports.getSettings = async (req, res) => {
  try {
    const settings = await db('settings').select('*');
    const result = {};
    settings.forEach(s => { result[s.key] = s.value; });
    res.json(result);
  } catch (err) {
    logger.error('Get settings error:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
};

// Update settings
exports.updateSettings = async (req, res) => {
  try {
    await updateSettingsFromObject(req.body);
    res.json({ success: true });
  } catch (err) {
    logger.error('Update settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

// Get security settings
exports.getSecuritySettings = async (req, res) => {
  try {
    const keys = ['two_factor_enabled', 'fail2ban_enabled', 'fail2ban_max_attempts', 'fail2ban_ban_time', 'ip_whitelist'];
    const result = await getSettingsByKeys(keys, {
      two_factor_enabled: formatters.toBoolean,
      fail2ban_enabled: formatters.toBoolean,
      fail2ban_max_attempts: formatters.toInt(5),
      fail2ban_ban_time: formatters.toInt(600),
    });
    res.json(result);
  } catch (err) {
    logger.error('Get security settings error:', err);
    res.status(500).json({ error: 'Failed to load security settings' });
  }
};

// Update security settings
exports.updateSecuritySettings = async (req, res) => {
  try {
    await updateSettingsFromObject(req.body);
    // Clear fail2ban cache so new settings take effect immediately
    fail2ban.clearSettingsCache();
    res.json({ success: true });
  } catch (err) {
    logger.error('Update security settings error:', err);
    res.status(500).json({ error: 'Failed to update security settings' });
  }
};

// Get list of banned IPs
exports.getBannedIps = async (req, res) => {
  try {
    const bans = await fail2ban.getBannedIps();
    res.json(bans.map(ban => ({
      id: ban.id,
      ip_address: ban.ip_address,
      reason: ban.reason,
      banned_at: ban.banned_at,
      expires_at: ban.expires_at,
    })));
  } catch (err) {
    logger.error('Get banned IPs error:', err);
    res.status(500).json({ error: 'Failed to load banned IPs' });
  }
};

// Unban an IP
exports.unbanIp = async (req, res) => {
  try {
    const { ip } = req.params;
    await fail2ban.unbanIp(ip);
    res.json({ success: true, message: `IP ${ip} has been unbanned` });
  } catch (err) {
    logger.error('Unban IP error:', err);
    res.status(500).json({ error: 'Failed to unban IP' });
  }
};

// Manually ban an IP
exports.banIp = async (req, res) => {
  try {
    const { ip_address, reason, duration } = req.body;

    if (!ip_address) {
      return res.status(400).json({ error: 'IP address is required' });
    }

    // Validate IP format (basic check)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip_address)) {
      return res.status(400).json({ error: 'Invalid IP address format' });
    }

    let expiresAt = null;
    if (duration) {
      expiresAt = new Date(Date.now() + parseInt(duration) * 1000);
    }

    await fail2ban.banIp(ip_address, reason, req.user?.id, expiresAt);
    res.json({ success: true, message: `IP ${ip_address} has been banned` });
  } catch (err) {
    logger.error('Ban IP error:', err);
    res.status(500).json({ error: 'Failed to ban IP' });
  }
};

// Get failed login attempts (for monitoring)
exports.getFailedLogins = async (req, res) => {
  try {
    const attempts = await db('failed_logins')
      .orderBy('attempted_at', 'desc')
      .limit(100);

    res.json(attempts.map(a => ({
      id: a.id,
      ip_address: a.ip_address,
      username: a.username,
      attempted_at: a.attempted_at,
    })));
  } catch (err) {
    logger.error('Get failed logins error:', err);
    res.status(500).json({ error: 'Failed to load failed login attempts' });
  }
};

// Get mail settings
exports.getMailSettings = async (req, res) => {
  try {
    const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_secure', 'mail_from', 'mail_from_name'];
    const result = await getSettingsByKeys(keys, {
      smtp_port: formatters.toInt(587),
      smtp_secure: formatters.toBoolean,
    });
    res.json(result);
  } catch (err) {
    logger.error('Get mail settings error:', err);
    res.status(500).json({ error: 'Failed to load mail settings' });
  }
};

// Update mail settings
exports.updateMailSettings = async (req, res) => {
  try {
    await updateSettingsFromObject(req.body, ['smtp_password']); // Skip password if empty
    // Clear mailer cache so new settings take effect
    mailer.clearSettingsCache();
    res.json({ success: true });
  } catch (err) {
    logger.error('Update mail settings error:', err);
    res.status(500).json({ error: 'Failed to update mail settings' });
  }
};

// Test mail settings
exports.testMail = async (req, res) => {
  try {
    const { email } = req.body;

    // Verify connection first
    const verification = await mailer.verifyConnection();
    if (!verification.success) {
      return res.status(400).json({ error: `SMTP connection failed: ${verification.message}` });
    }

    // Get user email or use provided email
    let testEmail = email;
    if (!testEmail && req.user) {
      const user = await db('users').where({ id: req.user.id }).first();
      testEmail = user?.email;
    }

    if (!testEmail) {
      return res.status(400).json({ error: 'No email address provided' });
    }

    // Send test email
    await mailer.sendTestMail(testEmail);
    res.json({ success: true, message: `Test email sent to ${testEmail}` });
  } catch (err) {
    logger.error('Test mail error:', err);
    res.status(500).json({ error: `Failed to send test email: ${err.message}` });
  }
};

// Get backup settings
exports.getBackupSettings = async (req, res) => {
  try {
    const keys = ['auto_backup', 'backup_schedule', 'retention_days', 'backup_path'];
    const result = await getSettingsByKeys(keys, {
      auto_backup: formatters.toBoolean,
      retention_days: formatters.toInt(30),
    });
    res.json(result);
  } catch (err) {
    logger.error('Get backup settings error:', err);
    res.status(500).json({ error: 'Failed to load backup settings' });
  }
};

// Update backup settings
exports.updateBackupSettings = async (req, res) => {
  try {
    await updateSettingsFromObject(req.body);
    res.json({ success: true });
  } catch (err) {
    logger.error('Update backup settings error:', err);
    res.status(500).json({ error: 'Failed to update backup settings' });
  }
};

// Get all backups
exports.getBackups = async (req, res) => {
  try {
    const backups = await db('backups')
      .orderBy('created_at', 'desc')
      .limit(50);

    res.json(backups.map(b => ({
      id: b.id,
      name: b.filename,
      size: formatBytes(b.size),
      status: b.status,
      progress: b.progress,
      created_at: b.created_at,
      completed_at: b.completed_at,
    })));
  } catch (err) {
    logger.error('Get backups error:', err);
    res.status(500).json({ error: 'Failed to load backups' });
  }
};

// Create backup - uses spawn to avoid command injection
exports.createBackup = async (req, res) => {
  try {
    const io = req.app.get('io');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}.sql.gz`;
    const backupDir = path.join(__dirname, '../../backups');

    // Ensure backup directory exists
    try {
      await fs.access(backupDir);
    } catch {
      await fs.mkdir(backupDir, { recursive: true });
    }

    const filepath = path.join(backupDir, filename);

    // Create backup record
    const [backup] = await db('backups')
      .insert({
        filename,
        filepath,
        status: 'in_progress',
        progress: 0,
        created_by: req.user?.id,
      })
      .returning('*');

    // Emit initial progress
    if (io) {
      io.emit('backup_progress', { id: backup.id, progress: 0, status: 'in_progress' });
    }

    // Start backup asynchronously using spawn (safer than exec - no shell injection)
    const databaseUrl = process.env.DATABASE_URL;

    // Simulate progress updates (real pg_dump doesn't provide progress)
    const progressInterval = setInterval(async () => {
      const current = await db('backups').where({ id: backup.id }).first();
      if (current && current.status === 'in_progress' && current.progress < 90) {
        const newProgress = Math.min(current.progress + 10, 90);
        await db('backups').where({ id: backup.id }).update({ progress: newProgress });
        if (io) {
          io.emit('backup_progress', { id: backup.id, progress: newProgress, status: 'in_progress' });
        }
      }
    }, 500);

    // Run pg_dump with spawn (safer - no shell involved)
    const runBackup = () => {
      return new Promise((resolve, reject) => {
        const pgDump = spawn('pg_dump', [databaseUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
        const gzip = spawn('gzip', [], { stdio: ['pipe', 'pipe', 'pipe'] });
        const writeStream = fsSync.createWriteStream(filepath);

        pgDump.stdout.pipe(gzip.stdin);
        gzip.stdout.pipe(writeStream);

        let errorOutput = '';
        pgDump.stderr.on('data', (data) => { errorOutput += data.toString(); });
        gzip.stderr.on('data', (data) => { errorOutput += data.toString(); });

        writeStream.on('finish', () => resolve());
        writeStream.on('error', (err) => reject(err));
        pgDump.on('error', (err) => reject(err));
        gzip.on('error', (err) => reject(err));
        pgDump.on('close', (code) => {
          if (code !== 0) reject(new Error(`pg_dump exited with code ${code}: ${errorOutput}`));
        });
      });
    };

    try {
      await runBackup();
      clearInterval(progressInterval);

      // Get file size using async stat
      const stats = await fs.stat(filepath);

      await db('backups').where({ id: backup.id }).update({
        status: 'completed',
        progress: 100,
        size: stats.size,
        completed_at: db.fn.now(),
      });

      if (io) {
        io.emit('backup_progress', { id: backup.id, progress: 100, status: 'completed' });
      }
    } catch (pgErr) {
      clearInterval(progressInterval);
      logger.error('pg_dump error:', pgErr);

      await db('backups').where({ id: backup.id }).update({
        status: 'failed',
        error_message: pgErr.message,
      });

      if (io) {
        io.emit('backup_progress', { id: backup.id, progress: 0, status: 'failed', error: pgErr.message });
      }
    }

    res.json({ success: true, backup_id: backup.id });
  } catch (err) {
    logger.error('Create backup error:', err);
    res.status(500).json({ error: 'Failed to create backup' });
  }
};

// Delete backup
exports.deleteBackup = async (req, res) => {
  try {
    const backup = await db('backups').where({ id: req.params.id }).first();
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    // Delete file if exists (using async unlink)
    try {
      await fs.access(backup.filepath);
      await fs.unlink(backup.filepath);
    } catch {
      // File doesn't exist, that's ok
    }

    await db('backups').where({ id: req.params.id }).del();
    res.json({ success: true });
  } catch (err) {
    logger.error('Delete backup error:', err);
    res.status(500).json({ error: 'Failed to delete backup' });
  }
};

// Download backup
exports.downloadBackup = async (req, res) => {
  try {
    const backup = await db('backups').where({ id: req.params.id }).first();
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    // Check file exists using async access
    try {
      await fs.access(backup.filepath);
    } catch {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    res.download(backup.filepath, backup.filename);
  } catch (err) {
    logger.error('Download backup error:', err);
    res.status(500).json({ error: 'Failed to download backup' });
  }
};

// Get system logs (using async file operations)
exports.getLogs = async (req, res) => {
  try {
    const { level, limit = 100 } = req.query;
    const logDir = path.join(__dirname, '../../logs');
    const logFile = path.join(logDir, 'app.log');

    let logs = [];

    try {
      await fs.access(logFile);
      const content = await fs.readFile(logFile, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());

      logs = lines.slice(-parseInt(limit)).reverse().map((line, idx) => {
        try {
          const parsed = JSON.parse(line);
          return {
            id: idx + 1,
            level: parsed.level || 'info',
            message: parsed.message || line,
            timestamp: parsed.timestamp || new Date().toISOString(),
          };
        } catch {
          // Plain text log line
          let logLevel = 'info';
          if (line.includes('ERROR') || line.includes('error')) logLevel = 'error';
          else if (line.includes('WARN') || line.includes('warn')) logLevel = 'warn';
          else if (line.includes('DEBUG') || line.includes('debug')) logLevel = 'debug';

          return {
            id: idx + 1,
            level: logLevel,
            message: line,
            timestamp: new Date().toISOString(),
          };
        }
      });

      // Filter by level if specified
      if (level && level !== 'all') {
        logs = logs.filter(l => l.level === level);
      }
    } catch {
      // Log file doesn't exist yet
      logs = [];
    }

    res.json(logs);
  } catch (err) {
    logger.error('Get logs error:', err);
    res.status(500).json({ error: 'Failed to load logs' });
  }
};

// Helper function to format bytes
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
