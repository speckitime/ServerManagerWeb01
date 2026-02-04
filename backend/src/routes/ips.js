const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const ipController = require('../controllers/ipController');
const { authenticate, authorize, authorizeServerAccess } = require('../middleware/auth');
const { validate } = require('../middleware/validator');

router.use(authenticate);

router.get('/', ipController.list);
router.get('/export/csv', ipController.exportCsv);

router.post(
  '/servers/:serverId',
  authorize('admin'),
  authorizeServerAccess,
  [body('ip_address').notEmpty().isIP().withMessage('Valid IP address required')],
  validate,
  ipController.addIp
);

router.delete(
  '/servers/:serverId/:ipId',
  authorize('admin'),
  authorizeServerAccess,
  ipController.removeIp
);

module.exports = router;
