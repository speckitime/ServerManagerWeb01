const db = require('../config/database');
const logger = require('../services/logger');

exports.list = async (req, res) => {
  try {
    const tasks = await db('scheduled_tasks')
      .where({ server_id: req.params.serverId })
      .leftJoin('users', 'scheduled_tasks.created_by', 'users.id')
      .select('scheduled_tasks.*', 'users.username as created_by_name')
      .orderBy('scheduled_tasks.name');

    res.json(tasks);
  } catch (err) {
    logger.error('List tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const task = await db('scheduled_tasks')
      .where({ id: req.params.taskId, server_id: req.params.serverId })
      .first();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const logs = await db('task_logs')
      .where({ task_id: task.id })
      .orderBy('started_at', 'desc')
      .limit(50);

    res.json({ ...task, logs });
  } catch (err) {
    logger.error('Get task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description, type, cron_expression, script_content, is_active } = req.body;

    const [task] = await db('scheduled_tasks')
      .insert({
        server_id: req.params.serverId,
        name,
        description,
        type,
        cron_expression,
        script_content: type === 'script' ? script_content : null,
        is_active: is_active !== false,
        created_by: req.user.id,
      })
      .returning('*');

    await db('activity_logs').insert({
      user_id: req.user.id,
      server_id: req.params.serverId,
      action: 'task_created',
      details: `Task "${name}" created`,
      ip_address: req.ip,
    });

    res.status(201).json(task);
  } catch (err) {
    logger.error('Create task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const { name, description, type, cron_expression, script_content, is_active } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (type !== undefined) updates.type = type;
    if (cron_expression !== undefined) updates.cron_expression = cron_expression;
    if (script_content !== undefined) updates.script_content = script_content;
    if (is_active !== undefined) updates.is_active = is_active;

    const [task] = await db('scheduled_tasks')
      .where({ id: req.params.taskId, server_id: req.params.serverId })
      .update(updates)
      .returning('*');

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (err) {
    logger.error('Update task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const deleted = await db('scheduled_tasks')
      .where({ id: req.params.taskId, server_id: req.params.serverId })
      .del();

    if (!deleted) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    logger.error('Delete task error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.reportTaskResult = async (req, res) => {
  try {
    const { task_id, status, output } = req.body;
    const server = req.server;

    await db('task_logs').insert({
      task_id,
      server_id: server.id,
      status,
      output,
      started_at: new Date(),
      completed_at: ['completed', 'failed'].includes(status) ? new Date() : null,
    });

    await db('scheduled_tasks')
      .where({ id: task_id })
      .update({ last_run: new Date() });

    res.json({ status: 'ok' });
  } catch (err) {
    logger.error('Report task result error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
