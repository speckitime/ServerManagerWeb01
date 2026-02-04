const db = require('../config/database');
const logger = require('../services/logger');

exports.list = async (req, res) => {
  try {
    const groups = await db('server_groups')
      .select('server_groups.*')
      .count('servers.id as server_count')
      .leftJoin('servers', 'server_groups.id', 'servers.group_id')
      .groupBy('server_groups.id')
      .orderBy('server_groups.name');

    res.json(groups);
  } catch (err) {
    logger.error('List groups error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const group = await db('server_groups').where({ id: req.params.id }).first();
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const servers = await db('servers').where({ group_id: group.id });

    res.json({ ...group, servers });
  } catch (err) {
    logger.error('Get group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description, color } = req.body;

    const [group] = await db('server_groups')
      .insert({ name, description, color, created_by: req.user.id })
      .returning('*');

    res.status(201).json(group);
  } catch (err) {
    logger.error('Create group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (color !== undefined) updates.color = color;

    const [group] = await db('server_groups')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json(group);
  } catch (err) {
    logger.error('Update group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const deleted = await db('server_groups').where({ id: req.params.id }).del();
    if (!deleted) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    logger.error('Delete group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
