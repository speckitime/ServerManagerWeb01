const db = require('../config/database');
const logger = require('../services/logger');

exports.list = async (req, res) => {
  try {
    let query = db('server_ips')
      .join('servers', 'server_ips.server_id', 'servers.id')
      .leftJoin('server_groups', 'servers.group_id', 'server_groups.id')
      .select(
        'server_ips.*',
        'servers.hostname',
        'servers.display_name',
        'servers.os_type',
        'servers.status',
        'server_groups.name as group_name',
        'server_groups.color as group_color'
      );

    if (req.user.role !== 'admin') {
      query = query
        .join('user_servers', 'servers.id', 'user_servers.server_id')
        .where('user_servers.user_id', req.user.id);
    }

    if (req.query.search) {
      const search = `%${req.query.search}%`;
      query = query.where(function () {
        this.where('server_ips.ip_address', 'ilike', search)
          .orWhere('servers.hostname', 'ilike', search)
          .orWhere('server_ips.label', 'ilike', search);
      });
    }

    if (req.query.type) {
      query = query.where('server_ips.type', req.query.type);
    }

    const ips = await query.orderBy('server_ips.ip_address');

    res.json(ips);
  } catch (err) {
    logger.error('List IPs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.addIp = async (req, res) => {
  try {
    const { ip_address, type, label } = req.body;

    const [ip] = await db('server_ips')
      .insert({
        server_id: req.params.serverId,
        ip_address,
        type: type || (ip_address.includes(':') ? 'ipv6' : 'ipv4'),
        is_primary: false,
        label,
      })
      .returning('*');

    res.status(201).json(ip);
  } catch (err) {
    logger.error('Add IP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.removeIp = async (req, res) => {
  try {
    const ip = await db('server_ips')
      .where({ id: req.params.ipId, server_id: req.params.serverId })
      .first();

    if (!ip) {
      return res.status(404).json({ error: 'IP not found' });
    }

    if (ip.is_primary) {
      return res.status(400).json({ error: 'Cannot remove primary IP' });
    }

    await db('server_ips')
      .where({ id: req.params.ipId })
      .del();

    res.json({ message: 'IP removed successfully' });
  } catch (err) {
    logger.error('Remove IP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.exportCsv = async (req, res) => {
  try {
    let query = db('server_ips')
      .join('servers', 'server_ips.server_id', 'servers.id')
      .select(
        'servers.hostname',
        'servers.display_name',
        'server_ips.ip_address',
        'server_ips.type',
        'server_ips.is_primary',
        'server_ips.label',
        'servers.os_type',
        'servers.status'
      );

    if (req.user.role !== 'admin') {
      query = query
        .join('user_servers', 'servers.id', 'user_servers.server_id')
        .where('user_servers.user_id', req.user.id);
    }

    const ips = await query.orderBy('servers.hostname');

    const csvHeader = 'Hostname,Display Name,IP Address,Type,Primary,Label,OS,Status\n';
    const csvRows = ips
      .map(
        (ip) =>
          `"${ip.hostname}","${ip.display_name || ''}","${ip.ip_address}","${ip.type}","${ip.is_primary}","${ip.label || ''}","${ip.os_type}","${ip.status}"`
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=ip-addresses.csv');
    res.send(csvHeader + csvRows);
  } catch (err) {
    logger.error('Export IPs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
