const express = require('express');
const router = express.Router();
const fileManagerController = require('../controllers/fileManagerController');
const { authenticate, authorizeServerAccess } = require('../middleware/auth');

// All routes require authentication and server access
router.use(authenticate);

// File manager routes
router.get('/:serverId/list', authorizeServerAccess, fileManagerController.listDirectory);
router.get('/:serverId/read', authorizeServerAccess, fileManagerController.readFile);
router.post('/:serverId/write', authorizeServerAccess, fileManagerController.writeFile);
router.post('/:serverId/create', authorizeServerAccess, fileManagerController.create);
router.post('/:serverId/delete', authorizeServerAccess, fileManagerController.delete);
router.post('/:serverId/rename', authorizeServerAccess, fileManagerController.rename);
router.get('/:serverId/download', authorizeServerAccess, fileManagerController.download);

module.exports = router;
