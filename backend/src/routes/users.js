const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validator');

router.use(authenticate);

router.get('/', authorize('admin'), userController.list);
router.get('/activity-log', authorize('admin'), userController.getActivityLog);
router.get('/:id', authorize('admin'), userController.get);

router.post(
  '/',
  authorize('admin'),
  [
    body('username')
      .isLength({ min: 3, max: 100 })
      .withMessage('Username must be 3-100 characters'),
    body('email').isEmail().withMessage('Valid email required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('role')
      .optional()
      .isIn(['admin', 'user', 'readonly'])
      .withMessage('Invalid role'),
  ],
  validate,
  userController.create
);

router.put('/:id', authorize('admin'), userController.update);
router.delete('/:id', authorize('admin'), userController.remove);

module.exports = router;
