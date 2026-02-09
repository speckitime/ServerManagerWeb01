const db = require('../config/database');
const logger = require('./logger');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn } = require('child_process');

let schedulerInterval = null;
let lastBackupTime = null;

/**
 * Get backup settings from database
 */
async function getBackupSettings() {
  const rows = await db('settings').whereIn('key', [
    'auto_backup',
    'backup_schedule',
    'retention_days',
    'backup_path',
  ]);

  const settings = {};
  rows.forEach((row) => {
    settings[row.key] = row.value;
  });

  return {
    autoBackup: settings.auto_backup === 'true',
    schedule: settings.backup_schedule || 'daily',
    retentionDays: parseInt(settings.retention_days) || 30,
    backupPath: settings.backup_path || path.join(__dirname, '../../backups'),
  };
}

/**
 * Calculate next backup time based on schedule
 */
function getScheduleInterval(schedule) {
  switch (schedule) {
    case 'hourly':
      return 60 * 60 * 1000; // 1 hour
    case 'daily':
      return 24 * 60 * 60 * 1000; // 24 hours
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000; // 7 days
    default:
      return 24 * 60 * 60 * 1000; // Default to daily
  }
}

/**
 * Check if backup is due based on schedule
 */
function isBackupDue(schedule) {
  if (!lastBackupTime) {
    return true;
  }

  const interval = getScheduleInterval(schedule);
  const timeSinceLastBackup = Date.now() - lastBackupTime;

  return timeSinceLastBackup >= interval;
}

// Default safe backup directory (within project structure)
const DEFAULT_BACKUP_DIR = path.join(__dirname, '../../backups');
// Allowed base directories for backups (prevents path traversal attacks)
const ALLOWED_BACKUP_BASES = [
  path.resolve(__dirname, '../../'),  // Project root
  '/var/backups',                      // System backup dir
  '/home',                             // User home directories
];

/**
 * Validate that backup path is within allowed directories
 * Prevents arbitrary directory creation/access
 */
function isValidBackupPath(backupPath) {
  const resolved = path.resolve(backupPath);
  return ALLOWED_BACKUP_BASES.some(base => resolved.startsWith(path.resolve(base)));
}

/**
 * Create a backup
 */
async function createBackup(io = null) {
  const settings = await getBackupSettings();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `auto_backup_${timestamp}.sql.gz`;

  // Validate and resolve backup directory
  let backupDir = settings.backupPath || DEFAULT_BACKUP_DIR;

  // Security: Validate backup path is within allowed directories
  if (!isValidBackupPath(backupDir)) {
    logger.warn(`Invalid backup path rejected: ${backupDir}. Using default.`);
    backupDir = DEFAULT_BACKUP_DIR;
  }

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
      created_by: null, // System-generated
    })
    .returning('*');

  logger.info(`Starting auto-backup: ${filename}`);

  // Emit initial progress
  if (io) {
    io.emit('backup_progress', { id: backup.id, progress: 0, status: 'in_progress' });
  }

  // Simulate progress updates
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

  const databaseUrl = process.env.DATABASE_URL;

  // Run pg_dump with spawn
  const runBackup = () => {
    return new Promise((resolve, reject) => {
      const pgDump = spawn('pg_dump', [databaseUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
      const gzip = spawn('gzip', [], { stdio: ['pipe', 'pipe', 'pipe'] });
      const writeStream = fsSync.createWriteStream(filepath);

      pgDump.stdout.pipe(gzip.stdin);
      gzip.stdout.pipe(writeStream);

      let errorOutput = '';
      pgDump.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      gzip.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

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

    // Get file size
    const stats = await fs.stat(filepath);

    await db('backups').where({ id: backup.id }).update({
      status: 'completed',
      progress: 100,
      size: stats.size,
      completed_at: db.fn.now(),
    });

    lastBackupTime = Date.now();

    if (io) {
      io.emit('backup_progress', { id: backup.id, progress: 100, status: 'completed' });
    }

    logger.info(`Auto-backup completed: ${filename} (${formatBytes(stats.size)})`);

    // Clean up old backups
    await cleanupOldBackups(settings.retentionDays);

    return { success: true, backup };
  } catch (err) {
    clearInterval(progressInterval);
    logger.error('Auto-backup error:', err);

    await db('backups').where({ id: backup.id }).update({
      status: 'failed',
      error_message: err.message,
    });

    if (io) {
      io.emit('backup_progress', { id: backup.id, progress: 0, status: 'failed', error: err.message });
    }

    return { success: false, error: err.message };
  }
}

/**
 * Clean up old backups based on retention policy
 */
async function cleanupOldBackups(retentionDays) {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // Find old backups
  const oldBackups = await db('backups')
    .where('created_at', '<', cutoffDate)
    .where('status', 'completed');

  for (const backup of oldBackups) {
    try {
      // Delete file
      try {
        await fs.access(backup.filepath);
        await fs.unlink(backup.filepath);
      } catch {
        // File doesn't exist
      }

      // Delete record
      await db('backups').where({ id: backup.id }).del();

      logger.info(`Cleaned up old backup: ${backup.filename}`);
    } catch (err) {
      logger.error(`Failed to clean up backup ${backup.id}:`, err);
    }
  }

  if (oldBackups.length > 0) {
    logger.info(`Cleaned up ${oldBackups.length} old backups (retention: ${retentionDays} days)`);
  }
}

/**
 * Check and run scheduled backup
 */
async function checkScheduledBackup(io = null) {
  try {
    const settings = await getBackupSettings();

    if (!settings.autoBackup) {
      return;
    }

    if (isBackupDue(settings.schedule)) {
      logger.info(`Scheduled backup due (${settings.schedule})`);
      await createBackup(io);
    }
  } catch (err) {
    logger.error('Scheduled backup check error:', err);
  }
}

/**
 * Start the backup scheduler
 */
function start(io = null) {
  if (schedulerInterval) {
    logger.warn('Backup scheduler already running');
    return;
  }

  // Check for last backup time from database
  db('backups')
    .where('status', 'completed')
    .orderBy('completed_at', 'desc')
    .first()
    .then((lastBackup) => {
      if (lastBackup && lastBackup.completed_at) {
        lastBackupTime = new Date(lastBackup.completed_at).getTime();
        logger.info(`Last backup was at ${lastBackup.completed_at}`);
      }
    })
    .catch((err) => {
      logger.error('Failed to get last backup time:', err);
    });

  // Check every 5 minutes
  schedulerInterval = setInterval(() => checkScheduledBackup(io), 5 * 60 * 1000);

  // Also check immediately on start (after a short delay)
  setTimeout(() => checkScheduledBackup(io), 10000);

  logger.info('Backup scheduler started');
}

/**
 * Stop the backup scheduler
 */
function stop() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Backup scheduler stopped');
  }
}

/**
 * Format bytes helper
 */
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  start,
  stop,
  createBackup,
  cleanupOldBackups,
  getBackupSettings,
};
