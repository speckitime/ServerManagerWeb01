const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { authenticate, authorize, authorizeServerAccess } = require('../middleware/auth');
const { validate } = require('../middleware/validator');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/documents'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

router.use(authenticate);

router.get(
  '/servers/:serverId/documents',
  authorizeServerAccess,
  documentController.list
);

router.get(
  '/servers/:serverId/documents/:docId',
  authorizeServerAccess,
  documentController.get
);

router.post(
  '/servers/:serverId/documents',
  authorize('admin', 'user'),
  authorizeServerAccess,
  [body('title').notEmpty().withMessage('Title is required')],
  validate,
  documentController.create
);

router.put(
  '/servers/:serverId/documents/:docId',
  authorize('admin', 'user'),
  authorizeServerAccess,
  documentController.update
);

router.delete(
  '/servers/:serverId/documents/:docId',
  authorize('admin'),
  authorizeServerAccess,
  documentController.remove
);

router.post(
  '/servers/:serverId/documents/:docId/attachments',
  authorize('admin', 'user'),
  authorizeServerAccess,
  upload.single('file'),
  documentController.uploadAttachment
);

router.get(
  '/documents/attachments/:attachmentId/download',
  documentController.downloadAttachment
);

module.exports = router;
