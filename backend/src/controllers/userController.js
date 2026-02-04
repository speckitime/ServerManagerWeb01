const bcrypt = require('bcryptjs');
const db = require('../config/database');
const logger = require('../services/logger');

exports.list = async (req, res) => {
  try {
    const users = await db('users')
      .select('id', 'username', 'email', 'full_name', 'role', 'is_active', 'totp_enabled', 'last_login', 'created_at')
      .orderBy('username');

    res.json(users);
  } catch (err) {
    logger.error('List users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const user = await db('users')
      .where({ id: req.params.id })
      .select('id', 'username', 'email', 'full_name', 'role', 'is_active', 'totp_enabled', 'last_login', 'created_at')
      .first();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const assignedServers = await db('user_servers')
      .where({ user_id: user.id })
      .join('servers', 'user_servers.server_id', 'servers.id')
      .select('servers.id', 'servers.hostname', 'servers.display_name', 'servers.ip_address');

    const recentActivity = await db('activity_logs')
      .where({ user_id: user.id })
      .orderBy('created_at', 'desc')
      .limit(20);

    res.json({ ...user, assigned_servers: assignedServers, recent_activity: recentActivity });
  } catch (err) {
    logger.error('Get user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const { username, email, password, full_name, role, is_active, server_ids } = req.body;

    const existing = await db('users')
      .where('username', username)
      .orWhere('email', email)
      .first();

    if (existing) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db('users')
      .insert({
        username,
        email,
        password_hash: passwordHash,
        full_name,
        role: role || 'user',
        is_active: is_active !== false,
      })
      .returning(['id', 'username', 'email', 'full_name', 'role', 'is_active', 'created_at']);

    if (server_ids && server_ids.length > 0) {
      const assignments = server_ids.map((serverId) => ({
        user_id: user.id,
        server_id: serverId,
      }));
      await db('user_servers').insert(assignments);
    }

    await db('activity_logs').insert({
      user_id: req.user.id,
      action: 'user_created',
      details: `User "${username}" created with role "${role || 'user'}"`,
      ip_address: req.ip,
    });

    res.status(201).json(user);
  } catch (err) {
    logger.error('Create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { username, email, full_name, role, is_active, password, server_ids } = req.body;

    const updates = {};
    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (full_name !== undefined) updates.full_name = full_name;
    if (role !== undefined) updates.role = role;
    if (is_active !== undefined) updates.is_active = is_active;

    if (password) {
      updates.password_hash = await bcrypt.hash(password, 12);
    }

    const [user] = await db('users')
      .where({ id: req.params.id })
      .update(updates)
      .returning(['id', 'username', 'email', 'full_name', 'role', 'is_active', 'created_at']);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (server_ids !== undefined) {
      await db('user_servers').where({ user_id: user.id }).del();
      if (server_ids.length > 0) {
        const assignments = server_ids.map((serverId) => ({
          user_id: user.id,
          server_id: serverId,
        }));
        await db('user_servers').insert(assignments);
      }
    }

    await db('activity_logs').insert({
      user_id: req.user.id,
      action: 'user_updated',
      details: `User "${user.username}" updated`,
      ip_address: req.ip,
    });

    res.json(user);
  } catch (err) {
    logger.error('Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await db('users').where({ id: req.params.id }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db('users').where({ id: req.params.id }).del();

    await db('activity_logs').insert({
      user_id: req.user.id,
      action: 'user_deleted',
      details: `User "${user.username}" deleted`,
      ip_address: req.ip,
    });

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    logger.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getActivityLog = async (req, res) => {
  try {
    let query = db('activity_logs')
      .leftJoin('users', 'activity_logs.user_id', 'users.id')
      .leftJoin('servers', 'activity_logs.server_id', 'servers.id')
      .select(
        'activity_logs.*',
        'users.username',
        'servers.hostname as server_hostname'
      );

    if (req.query.user_id) {
      query = query.where('activity_logs.user_id', req.query.user_id);
    }

    if (req.query.server_id) {
      query = query.where('activity_logs.server_id', req.query.server_id);
    }

    if (req.query.action) {
      query = query.where('activity_logs.action', req.query.action);
    }

    const logs = await query
      .orderBy('activity_logs.created_at', 'desc')
      .limit(parseInt(req.query.limit, 10) || 100);

    res.json(logs);
  } catch (err) {
    logger.error('Get activity log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
