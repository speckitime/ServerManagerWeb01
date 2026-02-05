const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const scriptsController = require('../controllers/scriptsController');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validator');

router.use(authenticate);

// List all scripts
router.get('/', scriptsController.list);

// Get single script with executions
router.get('/:id', scriptsController.get);

// Create script (admin only)
router.post(
  '/',
  authorize('admin'),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('content').notEmpty().withMessage('Script content is required'),
  ],
  validate,
  scriptsController.create
);

// Update script (admin only)
router.put(
  '/:id',
  authorize('admin'),
  scriptsController.update
);

// Delete script (admin only)
router.delete(
  '/:id',
  authorize('admin'),
  scriptsController.remove
);

// Execute script on a server (admin only)
router.post(
  '/:id/execute',
  authorize('admin'),
  [
    body('serverId').notEmpty().withMessage('Server ID is required'),
  ],
  validate,
  scriptsController.execute
);

// Get execution details
router.get(
  '/executions/:executionId',
  scriptsController.getExecution
);

module.exports = router;
