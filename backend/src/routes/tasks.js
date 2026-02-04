const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticate, authorize, authorizeServerAccess } = require('../middleware/auth');
const { authenticateAgent } = require('../middleware/agentAuth');
const { validate } = require('../middleware/validator');

// User routes
router.get(
  '/servers/:serverId/tasks',
  authenticate,
  authorizeServerAccess,
  taskController.list
);

router.get(
  '/servers/:serverId/tasks/:taskId',
  authenticate,
  authorizeServerAccess,
  taskController.get
);

router.post(
  '/servers/:serverId/tasks',
  authenticate,
  authorize('admin', 'user'),
  authorizeServerAccess,
  [
    body('name').notEmpty().withMessage('Task name is required'),
    body('type').isIn(['update', 'reboot', 'script']).withMessage('Invalid task type'),
    body('cron_expression').notEmpty().withMessage('Cron expression is required'),
  ],
  validate,
  taskController.create
);

router.put(
  '/servers/:serverId/tasks/:taskId',
  authenticate,
  authorize('admin', 'user'),
  authorizeServerAccess,
  taskController.update
);

router.delete(
  '/servers/:serverId/tasks/:taskId',
  authenticate,
  authorize('admin'),
  authorizeServerAccess,
  taskController.remove
);

// Agent routes
router.post('/agent/tasks/result', authenticateAgent, taskController.reportTaskResult);

module.exports = router;
