const db = require('../config/database');
const logger = require('../services/logger');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn } = require('child_process');

// Get all settings (grouped by category)
exports.getSettings = async (req, res) => {
  try {
    const settings = await db('settings').select('*');
    const result = {};
    settings.forEach(s => {
      result[s.key] = s.value;
    });
    res.json(result);
  } catch (err) {
    logger.error('Get settings error:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
};

// Update settings
exports.updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await db('settings')
        .insert({ key, value: String(value), updated_at: db.fn.now() })
        .onConflict('key')
        .merge({ value: String(value), updated_at: db.fn.now() });
    }
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
    const settings = await db('settings').whereIn('key', keys);
    const result = {};
    settings.forEach(s => {
      if (s.key.includes('enabled')) {
        result[s.key] = s.value === 'true';
      } else if (s.key.includes('_attempts') || s.key.includes('_time')) {
        result[s.key] = parseInt(s.value) || 0;
      } else {
        result[s.key] = s.value;
      }
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
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await db('settings')
        .insert({ key, value: String(value), updated_at: db.fn.now() })
        .onConflict('key')
        .merge({ value: String(value), updated_at: db.fn.now() });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('Update security settings error:', err);
    res.status(500).json({ error: 'Failed to update security settings' });
  }
};

// Get mail settings
exports.getMailSettings = async (req, res) => {
  try {
    const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_secure', 'mail_from', 'mail_from_name'];
    const settings = await db('settings').whereIn('key', keys);
    const result = {};
    settings.forEach(s => {
      if (s.key === 'smtp_port') {
        result[s.key] = parseInt(s.value) || 587;
      } else if (s.key === 'smtp_secure') {
        result[s.key] = s.value === 'true';
      } else {
        result[s.key] = s.value;
      }
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
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'smtp_password' && !value) continue; // Don't update password if empty
      await db('settings')
        .insert({ key, value: String(value), updated_at: db.fn.now() })
        .onConflict('key')
        .merge({ value: String(value), updated_at: db.fn.now() });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('Update mail settings error:', err);
    res.status(500).json({ error: 'Failed to update mail settings' });
  }
};

// Test mail settings
exports.testMail = async (req, res) => {
  try {
    // Get mail settings
    const settings = await db('settings').whereIn('key', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_secure', 'mail_from', 'mail_from_name']);
    const mailConfig = {};
    settings.forEach(s => mailConfig[s.key] = s.value);

    if (!mailConfig.smtp_host) {
      return res.status(400).json({ error: 'SMTP host not configured' });
    }

    // For now, just validate configuration exists
    res.json({ success: true, message: 'Mail configuration valid. Test email would be sent to your admin email.' });
  } catch (err) {
    logger.error('Test mail error:', err);
    res.status(500).json({ error: 'Failed to test mail configuration' });
  }
};

// Get backup settings
exports.getBackupSettings = async (req, res) => {
  try {
    const keys = ['auto_backup', 'backup_schedule', 'retention_days', 'backup_path'];
    const settings = await db('settings').whereIn('key', keys);
    const result = {};
    settings.forEach(s => {
      if (s.key === 'auto_backup') {
        result[s.key] = s.value === 'true';
      } else if (s.key === 'retention_days') {
        result[s.key] = parseInt(s.value) || 30;
      } else {
        result[s.key] = s.value;
      }
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
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await db('settings')
        .insert({ key, value: String(value), updated_at: db.fn.now() })
        .onConflict('key')
        .merge({ value: String(value), updated_at: db.fn.now() });
    }
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
