const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/sshIdentityController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/generate', authorize('admin'), ctrl.generate);
router.post('/import', authorize('admin'), ctrl.import);
router.put('/:id', authorize('admin'), ctrl.update);
router.delete('/:id', authorize('admin'), ctrl.delete);
router.get('/:id/export/public', ctrl.exportPublicKey);
router.get('/:id/export/private', authorize('admin'), ctrl.exportPrivateKey);

module.exports = router;
