const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const serverController = require('../controllers/serverController');
const { authenticate, authorize, authorizeServerAccess } = require('../middleware/auth');
const { validate } = require('../middleware/validator');

router.use(authenticate);

router.get('/', serverController.list);

router.get('/:id', authorizeServerAccess, serverController.get);

router.post(
  '/',
  authorize('admin'),
  [
    body('hostname').notEmpty().withMessage('Hostname is required'),
    body('ip_address').notEmpty().isIP().withMessage('Valid IP address required'),
    body('os_type').isIn(['linux', 'windows']).withMessage('OS type must be linux or windows'),
  ],
  validate,
  serverController.create
);

router.put(
  '/:id',
  authorize('admin'),
  authorizeServerAccess,
  serverController.update
);

router.delete(
  '/:id',
  authorize('admin'),
  serverController.remove
);

router.get(
  '/:id/agent-key',
  authorize('admin'),
  serverController.getAgentKey
);

router.post(
  '/:id/agent-key/regenerate',
  authorize('admin'),
  serverController.regenerateAgentKey
);

module.exports = router;
