const db = require('../config/database');

const authenticateAgent = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-agent-api-key'];
    if (!apiKey) {
      return res.status(401).json({ error: 'Agent API key required' });
    }

    const server = await db('servers')
      .where({ agent_api_key: apiKey })
      .first();

    if (!server) {
      return res.status(401).json({ error: 'Invalid agent API key' });
    }

    // Auto-mark agent as installed on first successful connection
    if (!server.agent_installed) {
      await db('servers')
        .where({ id: server.id })
        .update({ agent_installed: true });
      server.agent_installed = true;
    }

    req.server = server;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticateAgent };
