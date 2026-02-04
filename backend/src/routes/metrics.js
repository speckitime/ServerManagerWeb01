const express = require('express');
const router = express.Router();
const metricsController = require('../controllers/metricsController');
const { authenticate, authorizeServerAccess } = require('../middleware/auth');
const { authenticateAgent } = require('../middleware/agentAuth');

// User routes
router.get(
  '/servers/:serverId/metrics/current',
  authenticate,
  authorizeServerAccess,
  metricsController.getCurrent
);

router.get(
  '/servers/:serverId/metrics/history',
  authenticate,
  authorizeServerAccess,
  metricsController.getHistory
);

// Agent routes
router.post('/agent/metrics', authenticateAgent, metricsController.ingestFromAgent);
router.post('/agent/heartbeat', authenticateAgent, metricsController.heartbeat);

module.exports = router;
