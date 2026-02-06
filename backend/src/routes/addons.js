const express = require('express');
const router = express.Router();
const addonController = require('../controllers/addonController');
const { authenticate, requireAdmin, authorizeServerAccess } = require('../middleware/auth');

// Admin routes - manage all addons
router.get('/addons', authenticate, requireAdmin, addonController.getAllAddons);
router.get('/addons/:addonId', authenticate, addonController.getAddon);
router.patch('/addons/:addonId/toggle', authenticate, requireAdmin, addonController.toggleAddon);

// Server-specific addon routes
router.get(
  '/servers/:serverId/addons',
  authenticate,
  authorizeServerAccess,
  addonController.getServerAddons
);

router.post(
  '/servers/:serverId/addons/:addonId/enable',
  authenticate,
  authorizeServerAccess,
  addonController.enableServerAddon
);

router.post(
  '/servers/:serverId/addons/:addonId/disable',
  authenticate,
  authorizeServerAccess,
  addonController.disableServerAddon
);

router.patch(
  '/servers/:serverId/addons/:addonId/config',
  authenticate,
  authorizeServerAccess,
  addonController.updateServerAddonConfig
);

router.get(
  '/servers/:serverId/addons/:addonId/status',
  authenticate,
  authorizeServerAccess,
  addonController.checkAddonStatus
);

router.post(
  '/servers/:serverId/addons/:addonId/action',
  authenticate,
  authorizeServerAccess,
  addonController.executeAddonAction
);

module.exports = router;
