const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validator');

router.post(
  '/login',
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  authController.login
);

router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('Refresh token is required')],
  validate,
  authController.refreshToken
);

router.get('/me', authenticate, authController.me);

router.put(
  '/profile',
  authenticate,
  [body('email').optional().isEmail().withMessage('Valid email required')],
  validate,
  authController.updateProfile
);

router.put(
  '/change-password',
  authenticate,
  [
    body('current_password').notEmpty().withMessage('Current password is required'),
    body('new_password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
  ],
  validate,
  authController.changePassword
);

router.post('/2fa/setup', authenticate, authController.setup2FA);

router.post(
  '/2fa/verify',
  authenticate,
  [body('totp_code').notEmpty().withMessage('2FA code is required')],
  validate,
  authController.verify2FA
);

router.post(
  '/2fa/disable',
  authenticate,
  [body('password').notEmpty().withMessage('Password is required')],
  validate,
  authController.disable2FA
);

module.exports = router;
