const db = require('../config/database');
const logger = require('../services/logger');

exports.list = async (req, res) => {
  try {
    let query = db('server_packages')
      .where({ server_id: req.params.serverId });

    if (req.query.search) {
      query = query.where('name', 'ilike', `%${req.query.search}%`);
    }

    if (req.query.updatable === 'true') {
      query = query.whereNotNull('available_update');
    }

    const packages = await query.orderBy('name', 'asc');

    const updatableCount = await db('server_packages')
      .where({ server_id: req.params.serverId })
      .whereNotNull('available_update')
      .count('id as count')
      .first();

    res.json({
      packages,
      total: packages.length,
      updatable_count: parseInt(updatableCount.count, 10),
    });
  } catch (err) {
    logger.error('List packages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.syncFromAgent = async (req, res) => {
  try {
    const server = req.server;
    const { packages } = req.body;

    if (!Array.isArray(packages)) {
      return res.status(400).json({ error: 'Packages must be an array' });
    }

    // Clear existing packages and insert new ones
    await db.transaction(async (trx) => {
      await trx('server_packages').where({ server_id: server.id }).del();

      if (packages.length > 0) {
        const records = packages.map((pkg) => ({
          server_id: server.id,
          name: pkg.name,
          version: pkg.version,
          description: pkg.description || null,
          available_update: pkg.available_update || null,
          last_checked: new Date(),
        }));

        // Insert in batches of 500
        for (let i = 0; i < records.length; i += 500) {
          await trx('server_packages').insert(records.slice(i, i + 500));
        }
      }
    });

    res.json({ status: 'ok', synced: packages.length });
  } catch (err) {
    logger.error('Sync packages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getUpdateHistory = async (req, res) => {
  try {
    const history = await db('update_history')
      .where({ server_id: req.params.serverId })
      .leftJoin('users', 'update_history.initiated_by', 'users.id')
      .select('update_history.*', 'users.username as initiated_by_name')
      .orderBy('update_history.created_at', 'desc')
      .limit(100);

    res.json(history);
  } catch (err) {
    logger.error('Get update history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.requestUpdate = async (req, res) => {
  try {
    const { package_names } = req.body;
    const serverId = req.params.serverId;

    const records = (package_names || ['*']).map((name) => ({
      server_id: serverId,
      package_name: name,
      status: 'pending',
      initiated_by: req.user.id,
    }));

    const inserted = await db('update_history').insert(records).returning('*');

    // The agent will pick this up via heartbeat/websocket
    const io = req.app.get('io');
    if (io) {
      io.to(`server:${serverId}`).emit('update_requested', {
        server_id: serverId,
        packages: package_names || ['*'],
        update_ids: inserted.map((u) => u.id),
      });
    }

    await db('activity_logs').insert({
      user_id: req.user.id,
      server_id: serverId,
      action: 'update_requested',
      details: `Updates requested: ${(package_names || ['all']).join(', ')}`,
      ip_address: req.ip,
    });

    res.json({ message: 'Update request sent', updates: inserted });
  } catch (err) {
    logger.error('Request update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.reportUpdateResult = async (req, res) => {
  try {
    const { update_id, status, log_output } = req.body;

    await db('update_history')
      .where({ id: update_id })
      .update({
        status,
        log_output,
        completed_at: ['completed', 'failed'].includes(status) ? new Date() : null,
      });

    res.json({ status: 'ok' });
  } catch (err) {
    logger.error('Report update result error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
