const db = require('../config/database');
const logger = require('../services/logger');

// Get all alert rules
exports.getRules = async (req, res) => {
  try {
    const rules = await db('alert_rules')
      .leftJoin('servers', 'alert_rules.server_id', 'servers.id')
      .leftJoin('server_groups', 'alert_rules.group_id', 'server_groups.id')
      .select(
        'alert_rules.*',
        'servers.name as server_name',
        'server_groups.name as group_name'
      )
      .orderBy('alert_rules.created_at', 'desc');

    res.json(rules);
  } catch (err) {
    logger.error('Get alert rules error:', err);
    res.status(500).json({ error: 'Failed to load alert rules' });
  }
};

// Create alert rule
exports.createRule = async (req, res) => {
  try {
    const {
      server_id,
      group_id,
      name,
      metric,
      condition,
      threshold,
      duration_seconds,
      severity,
      notify_email,
      notify_webhook,
      webhook_url,
    } = req.body;

    const [rule] = await db('alert_rules')
      .insert({
        server_id: server_id || null,
        group_id: group_id || null,
        name,
        metric,
        condition,
        threshold,
        duration_seconds: duration_seconds || 60,
        severity: severity || 'warning',
        is_active: true,
        notify_email: notify_email !== false,
        notify_webhook: notify_webhook || false,
        webhook_url,
        created_by: req.user?.id,
      })
      .returning('*');

    res.json(rule);
  } catch (err) {
    logger.error('Create alert rule error:', err);
    res.status(500).json({ error: 'Failed to create alert rule' });
  }
};

// Update alert rule
exports.updateRule = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.created_by;
    delete updates.created_at;

    const [rule] = await db('alert_rules')
      .where({ id })
      .update({ ...updates, updated_at: new Date() })
      .returning('*');

    if (!rule) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    res.json(rule);
  } catch (err) {
    logger.error('Update alert rule error:', err);
    res.status(500).json({ error: 'Failed to update alert rule' });
  }
};

// Delete alert rule
exports.deleteRule = async (req, res) => {
  try {
    const { id } = req.params;
    await db('alert_rules').where({ id }).del();
    res.json({ success: true });
  } catch (err) {
    logger.error('Delete alert rule error:', err);
    res.status(500).json({ error: 'Failed to delete alert rule' });
  }
};

// Get active alerts
exports.getAlerts = async (req, res) => {
  try {
    const { status, server_id, severity } = req.query;

    let query = db('alerts')
      .leftJoin('servers', 'alerts.server_id', 'servers.id')
      .leftJoin('alert_rules', 'alerts.rule_id', 'alert_rules.id')
      .select(
        'alerts.*',
        'servers.name as server_name',
        'servers.hostname',
        'alert_rules.name as rule_name'
      )
      .orderBy('alerts.triggered_at', 'desc');

    if (status) {
      query = query.where('alerts.status', status);
    }
    if (server_id) {
      query = query.where('alerts.server_id', server_id);
    }
    if (severity) {
      query = query.where('alerts.severity', severity);
    }

    const alerts = await query.limit(100);
    res.json(alerts);
  } catch (err) {
    logger.error('Get alerts error:', err);
    res.status(500).json({ error: 'Failed to load alerts' });
  }
};

// Acknowledge alert
exports.acknowledgeAlert = async (req, res) => {
  try {
    const { id } = req.params;

    const [alert] = await db('alerts')
      .where({ id })
      .update({
        status: 'acknowledged',
        acknowledged_by: req.user?.id,
        acknowledged_at: new Date(),
      })
      .returning('*');

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(alert);
  } catch (err) {
    logger.error('Acknowledge alert error:', err);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
};

// Resolve alert
exports.resolveAlert = async (req, res) => {
  try {
    const { id } = req.params;

    const [alert] = await db('alerts')
      .where({ id })
      .update({
        status: 'resolved',
        resolved_at: new Date(),
      })
      .returning('*');

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(alert);
  } catch (err) {
    logger.error('Resolve alert error:', err);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
};

// Get alert statistics
exports.getStats = async (req, res) => {
  try {
    const stats = await db('alerts')
      .select('severity')
      .where('status', 'active')
      .count('* as count')
      .groupBy('severity');

    const activeCount = await db('alerts').where('status', 'active').count('* as count').first();
    const acknowledgedCount = await db('alerts').where('status', 'acknowledged').count('* as count').first();

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const triggeredLast24h = await db('alerts')
      .where('triggered_at', '>', last24h)
      .count('* as count')
      .first();

    res.json({
      active: parseInt(activeCount.count),
      acknowledged: parseInt(acknowledgedCount.count),
      triggered_last_24h: parseInt(triggeredLast24h.count),
      by_severity: stats.reduce((acc, s) => {
        acc[s.severity] = parseInt(s.count);
        return acc;
      }, {}),
    });
  } catch (err) {
    logger.error('Get alert stats error:', err);
    res.status(500).json({ error: 'Failed to load alert statistics' });
  }
};
