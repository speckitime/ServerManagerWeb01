const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config/app');
const logger = require('./services/logger');
const setupSocket = require('./websocket/socketHandler');

// Routes
const authRoutes = require('./routes/auth');
const serverRoutes = require('./routes/servers');
const groupRoutes = require('./routes/groups');
const metricsRoutes = require('./routes/metrics');
const packageRoutes = require('./routes/packages');
const taskRoutes = require('./routes/tasks');
const documentRoutes = require('./routes/documents');
const userRoutes = require('./routes/users');
const logRoutes = require('./routes/logs');
const ipRoutes = require('./routes/ips');
const scriptRoutes = require('./routes/scripts');
const addonRoutes = require('./routes/addons');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new SocketIOServer(server, {
  cors: {
    origin: config.frontendUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);
setupSocket(io);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests, please try again later' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again later' },
});

// API routes
app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api', metricsRoutes);
app.use('/api', packageRoutes);
app.use('/api', taskRoutes);
app.use('/api', documentRoutes);
app.use('/api/users', userRoutes);
app.use('/api', logRoutes);
app.use('/api/ips', ipRoutes);
app.use('/api/scripts', scriptRoutes);
app.use('/api', addonRoutes);

// Uploads static
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Version info
app.get('/api/version', (req, res) => {
  try {
    const versionFile = path.join(__dirname, '../../version.json');
    // Use fs.readFileSync to avoid require() caching
    const fs = require('fs');
    const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    res.json(versionData);
  } catch (err) {
    res.json({ version: 'unknown' });
  }
});

// Changelog
app.get('/api/changelog', (req, res) => {
  try {
    const changelogFile = path.join(__dirname, '../../changelog.json');
    const fs = require('fs');
    const changelog = JSON.parse(fs.readFileSync(changelogFile, 'utf8'));
    res.json(changelog);
  } catch (err) {
    res.json([]);
  }
});

// Settings routes
const settingsController = require('./controllers/settingsController');
const { authenticate, authorize } = require('./middleware/auth');

app.get('/api/settings', authenticate, authorize('admin'), settingsController.getSettings);
app.put('/api/settings', authenticate, authorize('admin'), settingsController.updateSettings);
app.get('/api/settings/security', authenticate, authorize('admin'), settingsController.getSecuritySettings);
app.put('/api/settings/security', authenticate, authorize('admin'), settingsController.updateSecuritySettings);
app.get('/api/settings/mail', authenticate, authorize('admin'), settingsController.getMailSettings);
app.put('/api/settings/mail', authenticate, authorize('admin'), settingsController.updateMailSettings);
app.post('/api/settings/mail/test', authenticate, authorize('admin'), settingsController.testMail);
app.get('/api/settings/backup', authenticate, authorize('admin'), settingsController.getBackupSettings);
app.put('/api/settings/backup', authenticate, authorize('admin'), settingsController.updateBackupSettings);

// Admin endpoints
app.get('/api/admin/logs', authenticate, authorize('admin'), settingsController.getLogs);
app.get('/api/admin/backups', authenticate, authorize('admin'), settingsController.getBackups);
app.post('/api/admin/backups', authenticate, authorize('admin'), settingsController.createBackup);
app.delete('/api/admin/backups/:id', authenticate, authorize('admin'), settingsController.deleteBackup);
app.get('/api/admin/backups/:id/download', authenticate, authorize('admin'), settingsController.downloadBackup);

app.post('/api/admin/restart', authenticate, authorize('admin'), (req, res) => {
  res.json({ success: true, message: 'Restart initiated' });
  // Note: Actual restart would require process manager like PM2
});

// Fail2Ban management endpoints
app.get('/api/admin/bans', authenticate, authorize('admin'), settingsController.getBannedIps);
app.post('/api/admin/bans', authenticate, authorize('admin'), settingsController.banIp);
app.delete('/api/admin/bans/:ip', authenticate, authorize('admin'), settingsController.unbanIp);
app.get('/api/admin/failed-logins', authenticate, authorize('admin'), settingsController.getFailedLogins);

// Update check
app.get('/api/updates/check', (req, res) => {
  try {
    const versionFile = path.join(__dirname, '../../version.json');
    const fs = require('fs');
    const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    res.json({
      updateAvailable: false,
      currentVersion: versionData.version,
      latestVersion: versionData.version,
    });
  } catch (err) {
    res.json({ updateAvailable: false, currentVersion: 'unknown' });
  }
});

// Serve frontend in production
if (config.nodeEnv === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

// Error handler
app.use((err, req, res, _next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Create upload directories
const fs = require('fs');
const uploadDirs = ['uploads', 'uploads/documents', 'logs'];
uploadDirs.forEach((dir) => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Server status checker - mark offline servers
setInterval(async () => {
  try {
    const db = require('./config/database');
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    await db('servers')
      .where('status', 'online')
      .where('last_seen', '<', fiveMinutesAgo)
      .update({ status: 'offline' });
  } catch (err) {
    logger.error('Status checker error:', err);
  }
}, 60000);

// Fail2Ban cleanup - remove expired bans and old records
const fail2ban = require('./middleware/fail2ban');
setInterval(async () => {
  try {
    await fail2ban.cleanup();
  } catch (err) {
    logger.error('Fail2Ban cleanup error:', err);
  }
}, 300000); // Run every 5 minutes

// Start backup scheduler
const backupScheduler = require('./services/backupScheduler');
backupScheduler.start(io);

server.listen(config.port, () => {
  logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
  console.log(`Server Manager API running on http://localhost:${config.port}`);
});

module.exports = { app, server, io };
