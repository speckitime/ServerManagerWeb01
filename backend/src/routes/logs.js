const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');
const { authenticate, authorizeServerAccess } = require('../middleware/auth');
const { authenticateAgent } = require('../middleware/agentAuth');

// User routes - get configured logs for a server
router.get(
  '/servers/:serverId/logs',
  authenticate,
  authorizeServerAccess,
  logController.getLogFiles
);

// Get available log templates
router.get(
  '/servers/:serverId/logs/templates',
  authenticate,
  authorizeServerAccess,
  logController.getLogTemplates
);

// Auto-detect available logs on server
router.get(
  '/servers/:serverId/logs/detect',
  authenticate,
  authorizeServerAccess,
  logController.detectLogs
);

// Add a single log path
router.post(
  '/servers/:serverId/logs',
  authenticate,
  authorizeServerAccess,
  logController.addLogPath
);

// Add multiple logs at once
router.post(
  '/servers/:serverId/logs/bulk',
  authenticate,
  authorizeServerAccess,
  logController.addMultipleLogs
);

// Request log content via SSH
router.post(
  '/servers/:serverId/logs/request',
  authenticate,
  authorizeServerAccess,
  logController.requestLogContent
);

// Remove a log path
router.delete(
  '/servers/:serverId/logs/:logId',
  authenticate,
  authorizeServerAccess,
  logController.removeLogPath
);

// Agent routes (legacy)
router.post('/agent/logs/content', authenticateAgent, logController.receiveLogContent);

module.exports = router;
