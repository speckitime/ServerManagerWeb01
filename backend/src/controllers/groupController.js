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

/**
 * Get group dashboard with aggregated metrics and alerts
 */
exports.getDashboard = async (req, res) => {
  try {
    const { id } = req.params;

    const group = await db('server_groups').where({ id }).first();
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Get all servers in the group
    const servers = await db('servers').where({ group_id: id });

    if (servers.length === 0) {
      return res.json({
        group,
        servers: [],
        summary: {
          total: 0,
          online: 0,
          offline: 0,
          avgCpu: 0,
          avgRam: 0,
          avgDisk: 0,
        },
        alerts: [],
        recentMetrics: [],
      });
    }

    const serverIds = servers.map((s) => s.id);

    // Get latest metrics for each server
    const latestMetrics = await db('server_metrics')
      .whereIn('server_id', serverIds)
      .distinctOn('server_id')
      .orderBy('server_id')
      .orderBy('recorded_at', 'desc');

    // Calculate aggregated metrics
    const onlineServers = servers.filter((s) => s.status === 'online').length;
    const offlineServers = servers.filter((s) => s.status === 'offline').length;

    let totalCpu = 0;
    let totalRam = 0;
    let totalDisk = 0;
    let metricsCount = 0;

    for (const metric of latestMetrics) {
      if (metric.cpu_usage !== null) {
        totalCpu += metric.cpu_usage;
        metricsCount++;
      }
      if (metric.ram_usage_percent !== null) {
        totalRam += metric.ram_usage_percent;
      }
      if (metric.disk_partitions) {
        const partitions = typeof metric.disk_partitions === 'string'
          ? JSON.parse(metric.disk_partitions)
          : metric.disk_partitions;
        if (partitions && partitions.length > 0) {
          const maxDisk = Math.max(...partitions.map((p) => p.usage_percent || 0));
          totalDisk += maxDisk;
        }
      }
    }

    const avgCpu = metricsCount > 0 ? totalCpu / metricsCount : 0;
    const avgRam = metricsCount > 0 ? totalRam / metricsCount : 0;
    const avgDisk = metricsCount > 0 ? totalDisk / metricsCount : 0;

    // Get active alerts for servers in this group
    const alerts = await db('alerts')
      .whereIn('server_id', serverIds)
      .where('status', 'active')
      .leftJoin('servers', 'alerts.server_id', 'servers.id')
      .select('alerts.*', 'servers.name as server_name')
      .orderBy('triggered_at', 'desc')
      .limit(10);

    // Build server list with their latest metrics
    const serversWithMetrics = servers.map((server) => {
      const metrics = latestMetrics.find((m) => m.server_id === server.id);
      return {
        ...server,
        metrics: metrics
          ? {
              cpu_usage: metrics.cpu_usage,
              ram_usage_percent: metrics.ram_usage_percent,
              disk_partitions: metrics.disk_partitions,
              uptime_seconds: metrics.uptime_seconds,
              recorded_at: metrics.recorded_at,
            }
          : null,
      };
    });

    res.json({
      group,
      servers: serversWithMetrics,
      summary: {
        total: servers.length,
        online: onlineServers,
        offline: offlineServers,
        avgCpu: Math.round(avgCpu * 10) / 10,
        avgRam: Math.round(avgRam * 10) / 10,
        avgDisk: Math.round(avgDisk * 10) / 10,
      },
      alerts,
    });
  } catch (err) {
    logger.error('Get group dashboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
