const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../services/logger');
const { encryptCredentials, decryptCredentials } = require('../services/encryption');

exports.list = async (req, res) => {
  try {
    let query = db('servers')
      .leftJoin('server_groups', 'servers.group_id', 'server_groups.id')
      .select(
        'servers.*',
        'server_groups.name as group_name',
        'server_groups.color as group_color'
      );

    if (req.user.role !== 'admin') {
      query = query
        .join('user_servers', 'servers.id', 'user_servers.server_id')
        .where('user_servers.user_id', req.user.id);
    }

    if (req.query.group_id) {
      query = query.where('servers.group_id', req.query.group_id);
    }

    if (req.query.status) {
      query = query.where('servers.status', req.query.status);
    }

    if (req.query.os_type) {
      query = query.where('servers.os_type', req.query.os_type);
    }

    if (req.query.search) {
      const search = `%${req.query.search}%`;
      query = query.where(function () {
        this.where('servers.hostname', 'ilike', search)
          .orWhere('servers.display_name', 'ilike', search)
          .orWhere('servers.ip_address', 'ilike', search)
          .orWhere('servers.description', 'ilike', search);
      });
    }

    const servers = await query.orderBy('servers.hostname', 'asc');

    // Get latest metrics for each server
    const serverIds = servers.map((s) => s.id);
    const latestMetrics = await db('server_metrics')
      .whereIn('server_id', serverIds)
      .distinctOn('server_id')
      .orderBy('server_id')
      .orderBy('recorded_at', 'desc');

    const metricsMap = {};
    latestMetrics.forEach((m) => {
      metricsMap[m.server_id] = m;
    });

    const result = servers.map((s) => ({
      ...s,
      ssh_credentials_encrypted: undefined,
      rdp_credentials_encrypted: undefined,
      ssh_private_key_encrypted: undefined,
      latest_metrics: metricsMap[s.id] || null,
    }));

    res.json(result);
  } catch (err) {
    logger.error('List servers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const server = await db('servers')
      .leftJoin('server_groups', 'servers.group_id', 'server_groups.id')
      .select(
        'servers.*',
        'server_groups.name as group_name',
        'server_groups.color as group_color'
      )
      .where('servers.id', req.params.id)
      .first();

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const ips = await db('server_ips').where({ server_id: server.id });

    const latestMetrics = await db('server_metrics')
      .where({ server_id: server.id })
      .orderBy('recorded_at', 'desc')
      .first();

    res.json({
      ...server,
      ssh_credentials_encrypted: undefined,
      rdp_credentials_encrypted: undefined,
      ssh_private_key_encrypted: undefined,
      has_ssh_credentials: !!server.ssh_credentials_encrypted,
      has_rdp_credentials: !!server.rdp_credentials_encrypted,
      has_ssh_key: !!server.ssh_private_key_encrypted,
      additional_ips: ips,
      latest_metrics: latestMetrics || null,
    });
  } catch (err) {
    logger.error('Get server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      hostname,
      display_name,
      ip_address,
      os_type,
      os_version,
      description,
      ssh_port,
      rdp_port,
      group_id,
      ssh_credentials,
      rdp_credentials,
      ssh_private_key,
      additional_ips,
    } = req.body;

    const agentApiKey = uuidv4();

    const [server] = await db('servers')
      .insert({
        hostname,
        display_name: display_name || hostname,
        ip_address,
        os_type,
        os_version,
        description,
        ssh_port: ssh_port || 22,
        rdp_port: rdp_port || 3389,
        group_id: group_id || null,
        ssh_credentials_encrypted: ssh_credentials
          ? encryptCredentials(ssh_credentials)
          : null,
        rdp_credentials_encrypted: rdp_credentials
          ? encryptCredentials(rdp_credentials)
          : null,
        ssh_private_key_encrypted: ssh_private_key
          ? encryptCredentials({ key: ssh_private_key })
          : null,
        agent_api_key: agentApiKey,
        created_by: req.user.id,
      })
      .returning('*');

    // Add primary IP
    await db('server_ips').insert({
      server_id: server.id,
      ip_address,
      type: ip_address.includes(':') ? 'ipv6' : 'ipv4',
      is_primary: true,
      label: 'Primary',
    });

    // Add additional IPs
    if (additional_ips && additional_ips.length > 0) {
      const ipRecords = additional_ips.map((ip) => ({
        server_id: server.id,
        ip_address: ip.ip_address,
        type: ip.type || (ip.ip_address.includes(':') ? 'ipv6' : 'ipv4'),
        is_primary: false,
        label: ip.label || '',
      }));
      await db('server_ips').insert(ipRecords);
    }

    await db('activity_logs').insert({
      user_id: req.user.id,
      server_id: server.id,
      action: 'server_created',
      details: `Server "${hostname}" created`,
      ip_address: req.ip,
    });

    res.status(201).json({
      ...server,
      ssh_credentials_encrypted: undefined,
      rdp_credentials_encrypted: undefined,
      ssh_private_key_encrypted: undefined,
      agent_api_key: agentApiKey,
    });
  } catch (err) {
    logger.error('Create server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.update = async (req, res) => {
  try {
    const {
      hostname,
      display_name,
      ip_address,
      os_type,
      os_version,
      description,
      ssh_port,
      rdp_port,
      group_id,
      ssh_credentials,
      rdp_credentials,
      ssh_private_key,
    } = req.body;

    const updates = {};
    if (hostname !== undefined) updates.hostname = hostname;
    if (display_name !== undefined) updates.display_name = display_name;
    if (ip_address !== undefined) updates.ip_address = ip_address;
    if (os_type !== undefined) updates.os_type = os_type;
    if (os_version !== undefined) updates.os_version = os_version;
    if (description !== undefined) updates.description = description;
    if (ssh_port !== undefined) updates.ssh_port = ssh_port;
    if (rdp_port !== undefined) updates.rdp_port = rdp_port;
    if (group_id !== undefined) updates.group_id = group_id || null;
    if (ssh_credentials !== undefined) {
      updates.ssh_credentials_encrypted = ssh_credentials
        ? encryptCredentials(ssh_credentials)
        : null;
    }
    if (rdp_credentials !== undefined) {
      updates.rdp_credentials_encrypted = rdp_credentials
        ? encryptCredentials(rdp_credentials)
        : null;
    }
    if (ssh_private_key !== undefined) {
      updates.ssh_private_key_encrypted = ssh_private_key
        ? encryptCredentials({ key: ssh_private_key })
        : null;
    }

    const [server] = await db('servers')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    await db('activity_logs').insert({
      user_id: req.user.id,
      server_id: server.id,
      action: 'server_updated',
      details: `Server "${server.hostname}" updated`,
      ip_address: req.ip,
    });

    res.json({
      ...server,
      ssh_credentials_encrypted: undefined,
      rdp_credentials_encrypted: undefined,
      ssh_private_key_encrypted: undefined,
    });
  } catch (err) {
    logger.error('Update server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.remove = async (req, res) => {
  try {
    const server = await db('servers').where({ id: req.params.id }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    await db('servers').where({ id: req.params.id }).del();

    await db('activity_logs').insert({
      user_id: req.user.id,
      action: 'server_deleted',
      details: `Server "${server.hostname}" deleted`,
      ip_address: req.ip,
    });

    res.json({ message: 'Server deleted successfully' });
  } catch (err) {
    logger.error('Delete server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAgentKey = async (req, res) => {
  try {
    const server = await db('servers')
      .where({ id: req.params.id })
      .select('agent_api_key')
      .first();

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    res.json({ agent_api_key: server.agent_api_key });
  } catch (err) {
    logger.error('Get agent key error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.regenerateAgentKey = async (req, res) => {
  try {
    const newKey = uuidv4();
    const [server] = await db('servers')
      .where({ id: req.params.id })
      .update({ agent_api_key: newKey })
      .returning('*');

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    res.json({ agent_api_key: newKey });
  } catch (err) {
    logger.error('Regenerate agent key error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
