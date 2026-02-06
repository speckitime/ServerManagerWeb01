const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');
const { authenticate, authorizeServerAccess } = require('../middleware/auth');
const { authenticateAgent } = require('../middleware/agentAuth');

// IMPORTANT: More specific routes must come BEFORE less specific ones

// Get available log templates (specific path - must be before /logs)
router.get(
  '/servers/:serverId/logs/templates',
  authenticate,
  authorizeServerAccess,
  logController.getLogTemplates
);

// Auto-detect available logs on server (specific path - must be before /logs)
router.get(
  '/servers/:serverId/logs/detect',
  authenticate,
  authorizeServerAccess,
  logController.detectLogs
);

// Add multiple logs at once (specific path - must be before /logs)
router.post(
  '/servers/:serverId/logs/bulk',
  authenticate,
  authorizeServerAccess,
  logController.addMultipleLogs
);

// Request log content via SSH (specific path - must be before /logs)
router.post(
  '/servers/:serverId/logs/request',
  authenticate,
  authorizeServerAccess,
  logController.requestLogContent
);

// Remove a log path (has :logId param)
router.delete(
  '/servers/:serverId/logs/:logId',
  authenticate,
  authorizeServerAccess,
  logController.removeLogPath
);

// Get configured logs for a server (base route - must be LAST)
router.get(
  '/servers/:serverId/logs',
  authenticate,
  authorizeServerAccess,
  logController.getLogFiles
);

// Add a single log path (base route - must be LAST)
router.post(
  '/servers/:serverId/logs',
  authenticate,
  authorizeServerAccess,
  logController.addLogPath
);

// Agent routes (legacy)
router.post('/agent/logs/content', authenticateAgent, logController.receiveLogContent);

module.exports = router;
