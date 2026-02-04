const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');
const { authenticate, authorizeServerAccess } = require('../middleware/auth');
const { authenticateAgent } = require('../middleware/agentAuth');

// User routes
router.get(
  '/servers/:serverId/logs',
  authenticate,
  authorizeServerAccess,
  logController.getLogFiles
);

router.post(
  '/servers/:serverId/logs/request',
  authenticate,
  authorizeServerAccess,
  logController.requestLogContent
);

// Agent routes
router.post('/agent/logs/content', authenticateAgent, logController.receiveLogContent);

module.exports = router;
