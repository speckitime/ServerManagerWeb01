const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const groupController = require('../controllers/groupController');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validator');

router.use(authenticate);

router.get('/', groupController.list);
router.get('/:id', groupController.get);

router.post(
  '/',
  authorize('admin'),
  [body('name').notEmpty().withMessage('Group name is required')],
  validate,
  groupController.create
);

router.put('/:id', authorize('admin'), groupController.update);
router.delete('/:id', authorize('admin'), groupController.remove);

module.exports = router;
