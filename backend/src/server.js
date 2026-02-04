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

// Uploads static
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve frontend in production
if (config.nodeEnv === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

server.listen(config.port, () => {
  logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
  console.log(`Server Manager API running on http://localhost:${config.port}`);
});

module.exports = { app, server, io };
