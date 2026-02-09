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
      // Basic metrics
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
      // Extended metrics
      network_interfaces,
      network_rx_rate,
      network_tx_rate,
      disk_read_bytes,
      disk_write_bytes,
      disk_read_iops,
      disk_write_iops,
      disk_smart,
      temperatures,
      swap_total,
      swap_used,
      swap_usage_percent,
      cpu_cores,
      cpu_freq_current,
      cpu_freq_max,
    } = req.body;

    const metricsData = {
      server_id: server.id,
      cpu_usage,
      ram_total,
      ram_used,
      ram_usage_percent,
      disk_partitions: disk_partitions ? JSON.stringify(disk_partitions) : null,
      network_rx_bytes,
      network_tx_bytes,
      load_avg_1,
      load_avg_5,
      load_avg_15,
      process_count,
      top_processes: top_processes ? JSON.stringify(top_processes) : null,
      uptime_seconds,
      // Extended metrics
      network_interfaces: network_interfaces ? JSON.stringify(network_interfaces) : null,
      network_rx_rate,
      network_tx_rate,
      disk_read_bytes,
      disk_write_bytes,
      disk_read_iops,
      disk_write_iops,
      disk_smart: disk_smart ? JSON.stringify(disk_smart) : null,
      temperatures: temperatures ? JSON.stringify(temperatures) : null,
      swap_total,
      swap_used,
      swap_usage_percent,
      cpu_cores: cpu_cores ? JSON.stringify(cpu_cores) : null,
      cpu_freq_current,
      cpu_freq_max,
    };

    await db('server_metrics').insert(metricsData);

    // Update server status and last_seen
    await db('servers')
      .where({ id: server.id })
      .update({ status: 'online', last_seen: new Date() });

    // Check alert rules for this server
    await checkAlertRules(req.app.get('io'), server.id, {
      cpu_usage,
      ram_usage_percent,
      disk_partitions,
      swap_usage_percent,
      temperatures,
    });

    // Broadcast metrics to subscribed frontend clients in real-time
    const io = req.app.get('io');
    if (io) {
      io.to(`server:${server.id}`).emit('server_metrics', {
        server_id: server.id,
        ...req.body,
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

/**
 * Check alert rules against current metrics
 */
async function checkAlertRules(io, serverId, metrics) {
  try {
    // Get active alert rules for this server
    const rules = await db('alert_rules')
      .where(function () {
        this.where('server_id', serverId).orWhereNull('server_id');
      })
      .where('is_active', true);

    for (const rule of rules) {
      const value = getMetricValue(metrics, rule.metric);
      if (value === null) continue;

      const triggered = checkCondition(value, rule.condition, rule.threshold);

      if (triggered) {
        // Check if there's already an active alert for this rule
        const existingAlert = await db('alerts')
          .where({ rule_id: rule.id, server_id: serverId, status: 'active' })
          .first();

        if (!existingAlert) {
          // Create new alert
          const [alert] = await db('alerts')
            .insert({
              rule_id: rule.id,
              server_id: serverId,
              metric: rule.metric,
              value,
              threshold: rule.threshold,
              severity: rule.severity,
              message: `${rule.name}: ${rule.metric} is ${value.toFixed(1)} (threshold: ${rule.threshold})`,
            })
            .returning('*');

          // Broadcast alert
          if (io) {
            io.emit('server_alert', {
              server_id: serverId,
              alert,
            });
          }

          // TODO: Send email notification if rule.notify_email
          // TODO: Send webhook if rule.notify_webhook
        }
      } else {
        // Auto-resolve active alerts for this rule
        await db('alerts')
          .where({ rule_id: rule.id, server_id: serverId, status: 'active' })
          .update({ status: 'resolved', resolved_at: new Date() });
      }
    }
  } catch (err) {
    logger.error('Check alert rules error:', err);
  }
}

function getMetricValue(metrics, metricName) {
  switch (metricName) {
    case 'cpu_usage':
      return metrics.cpu_usage;
    case 'ram_usage_percent':
      return metrics.ram_usage_percent;
    case 'swap_usage_percent':
      return metrics.swap_usage_percent;
    case 'disk_usage':
      if (metrics.disk_partitions && metrics.disk_partitions.length > 0) {
        // Return highest disk usage
        return Math.max(...metrics.disk_partitions.map((p) => p.usage_percent || 0));
      }
      return null;
    case 'temperature':
      if (metrics.temperatures && Object.keys(metrics.temperatures).length > 0) {
        // Return highest temperature
        return Math.max(...Object.values(metrics.temperatures).flat());
      }
      return null;
    default:
      return null;
  }
}

function checkCondition(value, condition, threshold) {
  switch (condition) {
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
    case 'eq':
      return value === threshold;
    default:
      return false;
  }
}

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
