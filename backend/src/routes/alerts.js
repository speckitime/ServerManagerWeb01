const express = require('express');
const router = express.Router();
const alertsController = require('../controllers/alertsController');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Alert rules
router.get('/rules', alertsController.getRules);
router.post('/rules', authorize('admin'), alertsController.createRule);
router.put('/rules/:id', authorize('admin'), alertsController.updateRule);
router.delete('/rules/:id', authorize('admin'), alertsController.deleteRule);

// Alerts
router.get('/', alertsController.getAlerts);
router.get('/stats', alertsController.getStats);
router.post('/:id/acknowledge', alertsController.acknowledgeAlert);
router.post('/:id/resolve', alertsController.resolveAlert);

module.exports = router;
