const express = require('express');
const router = express.Router();
const packageController = require('../controllers/packageController');
const { authenticate, authorize, authorizeServerAccess } = require('../middleware/auth');
const { authenticateAgent } = require('../middleware/agentAuth');

// User routes
router.get(
  '/servers/:serverId/packages',
  authenticate,
  authorizeServerAccess,
  packageController.list
);

router.get(
  '/servers/:serverId/packages/updates/history',
  authenticate,
  authorizeServerAccess,
  packageController.getUpdateHistory
);

router.post(
  '/servers/:serverId/packages/update',
  authenticate,
  authorize('admin', 'user'),
  authorizeServerAccess,
  packageController.requestUpdate
);

// Agent routes
router.post('/agent/packages/sync', authenticateAgent, packageController.syncFromAgent);
router.post('/agent/packages/update-result', authenticateAgent, packageController.reportUpdateResult);

module.exports = router;
