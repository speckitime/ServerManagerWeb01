const express = require('express');
const router = express.Router();
const firewallController = require('../controllers/firewallController');
const { authenticate, authorizeServerAccess } = require('../middleware/auth');

// All routes require authentication and server access
router.use(authenticate);

// Firewall routes
router.get('/:serverId/status', authorizeServerAccess, firewallController.getStatus);
router.post('/:serverId/toggle', authorizeServerAccess, firewallController.toggle);
router.get('/:serverId/rules/numbered', authorizeServerAccess, firewallController.getNumberedRules);
router.post('/:serverId/rules', authorizeServerAccess, firewallController.addRule);
router.delete('/:serverId/rules', authorizeServerAccess, firewallController.deleteRule);
router.post('/:serverId/default', authorizeServerAccess, firewallController.setDefault);

module.exports = router;
