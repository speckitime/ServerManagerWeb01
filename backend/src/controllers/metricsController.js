const db = require('../config/database');
const logger = require('../services/logger');

exports.getCurrent = async (req, res) => {
  try {
    const metrics = await db('server_metrics')
      .where({ server_id: req.params.serverId })
      .orderBy('recorded_at', 'desc')
      .first();

    if (!metrics) {
      return res.json(null);
    }

    res.json(metrics);
  } catch (err) {
    logger.error('Get current metrics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const { period } = req.query;
    let fromDate;

    switch (period) {
      case '24h':
        fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    const metrics = await db('server_metrics')
      .where({ server_id: req.params.serverId })
      .where('recorded_at', '>=', fromDate)
      .orderBy('recorded_at', 'asc');

    // Downsample if too many data points
    const maxPoints = 200;
    if (metrics.length > maxPoints) {
      const step = Math.ceil(metrics.length / maxPoints);
      const sampled = metrics.filter((_, i) => i % step === 0);
      return res.json(sampled);
    }

    res.json(metrics);
  } catch (err) {
    logger.error('Get metrics history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.ingestFromAgent = async (req, res) => {
  try {
    const server = req.server;
    const {
      cpu_usage,
      ram_total,
      ram_used,
      ram_usage_percent,
      disk_partitions,
      network_rx_bytes,
      network_tx_bytes,
      load_avg_1,
      load_avg_5,
      load_avg_15,
      process_count,
      top_processes,
      uptime_seconds,
    } = req.body;

    await db('server_metrics').insert({
      server_id: server.id,
      cpu_usage,
      ram_total,
      ram_used,
      ram_usage_percent,
      disk_partitions: JSON.stringify(disk_partitions),
      network_rx_bytes,
      network_tx_bytes,
      load_avg_1,
      load_avg_5,
      load_avg_15,
      process_count,
      top_processes: JSON.stringify(top_processes),
      uptime_seconds,
    });

    // Update server status and last_seen
    await db('servers')
      .where({ id: server.id })
      .update({ status: 'online', last_seen: new Date() });

    // Broadcast metrics to subscribed frontend clients in real-time
    const io = req.app.get('io');
    if (io) {
      io.to(`server:${server.id}`).emit('server_metrics', {
        server_id: server.id,
        cpu_usage,
        ram_total,
        ram_used,
        ram_usage_percent,
        disk_partitions,
        network_rx_bytes,
        network_tx_bytes,
        load_avg_1,
        load_avg_5,
        load_avg_15,
        process_count,
        top_processes,
        uptime_seconds,
      });

      // Also broadcast status update
      io.to(`server:${server.id}`).emit('server_status', {
        server_id: server.id,
        status: 'online',
      });
    }

    // Clean up old metrics (keep 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db('server_metrics')
      .where({ server_id: server.id })
      .where('recorded_at', '<', thirtyDaysAgo)
      .del();

    res.json({ status: 'ok' });
  } catch (err) {
    logger.error('Ingest metrics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.heartbeat = async (req, res) => {
  try {
    const server = req.server;

    await db('servers')
      .where({ id: server.id })
      .update({ status: 'online', last_seen: new Date() });

    // Check for pending commands
    const pendingTasks = await db('scheduled_tasks')
      .where({ server_id: server.id, is_active: true })
      .whereRaw("next_run <= NOW()")
      .select('id', 'type', 'script_content', 'cron_expression');

    res.json({
      status: 'ok',
      pending_commands: pendingTasks,
    });
  } catch (err) {
    logger.error('Heartbeat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
