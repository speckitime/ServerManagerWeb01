const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const config = require('../config/app');
const db = require('../config/database');
const logger = require('../services/logger');

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiration,
  });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiration,
  });
  return { accessToken, refreshToken };
};

exports.login = async (req, res) => {
  try {
    const { username, password, totp_code } = req.body;

    const user = await db('users')
      .where(function () {
        this.where('username', username).orWhere('email', username);
      })
      .where('is_active', true)
      .first();

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.totp_enabled) {
      if (!totp_code) {
        return res.status(200).json({ requires_2fa: true });
      }
      const verified = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: 'base32',
        token: totp_code,
      });
      if (!verified) {
        return res.status(401).json({ error: 'Invalid 2FA code' });
      }
    }

    await db('users').where({ id: user.id }).update({ last_login: new Date() });

    await db('activity_logs').insert({
      user_id: user.id,
      action: 'login',
      details: 'User logged in',
      ip_address: req.ip,
    });

    const tokens = generateTokens(user.id);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        theme: user.theme,
        language: user.language,
      },
      ...tokens,
    });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, config.jwt.secret);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = await db('users').where({ id: decoded.userId, is_active: true }).first();
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const tokens = generateTokens(user.id);
    res.json(tokens);
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await db('users')
      .where({ id: req.user.id })
      .select('id', 'username', 'email', 'full_name', 'role', 'theme', 'language', 'totp_enabled', 'last_login', 'created_at')
      .first();
    res.json(user);
  } catch (err) {
    logger.error('Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { full_name, email, theme, language } = req.body;
    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (email !== undefined) updates.email = email;
    if (theme !== undefined) updates.theme = theme;
    if (language !== undefined) updates.language = language;

    await db('users').where({ id: req.user.id }).update(updates);

    const user = await db('users')
      .where({ id: req.user.id })
      .select('id', 'username', 'email', 'full_name', 'role', 'theme', 'language', 'totp_enabled')
      .first();

    res.json(user);
  } catch (err) {
    logger.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    const user = await db('users').where({ id: req.user.id }).first();
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(new_password, 12);
    await db('users').where({ id: req.user.id }).update({ password_hash: hash });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    logger.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.setup2FA = async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `ServerManager:${req.user.username}`,
    });

    await db('users')
      .where({ id: req.user.id })
      .update({ totp_secret: secret.base32 });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      qr_code: qrCodeUrl,
    });
  } catch (err) {
    logger.error('Setup 2FA error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.verify2FA = async (req, res) => {
  try {
    const { totp_code } = req.body;

    const user = await db('users').where({ id: req.user.id }).first();

    const verified = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: totp_code,
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid 2FA code' });
    }

    await db('users').where({ id: req.user.id }).update({ totp_enabled: true });

    res.json({ message: '2FA enabled successfully' });
  } catch (err) {
    logger.error('Verify 2FA error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.disable2FA = async (req, res) => {
  try {
    const { password } = req.body;

    const user = await db('users').where({ id: req.user.id }).first();
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    await db('users')
      .where({ id: req.user.id })
      .update({ totp_enabled: false, totp_secret: null });

    res.json({ message: '2FA disabled successfully' });
  } catch (err) {
    logger.error('Disable 2FA error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
