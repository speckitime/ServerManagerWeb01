const db = require('../config/database');

const authenticateAgent = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-agent-api-key'];
    if (!apiKey) {
      return res.status(401).json({ error: 'Agent API key required' });
    }

    const server = await db('servers')
      .where({ agent_api_key: apiKey, agent_installed: true })
      .first();

    if (!server) {
      return res.status(401).json({ error: 'Invalid agent API key' });
    }

    req.server = server;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticateAgent };
