const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const agentInstallController = require('../controllers/agentInstallController');
const { authenticate, authorize } = require('../middleware/auth');

// Public route - install script (called by curl from target server)
router.get('/install/:apiKey', agentInstallController.getInstallScript);

// Public route - serve agent files
router.get('/download/:filename', (req, res) => {
  const allowedFiles = ['agent.py', 'requirements.txt'];
  const filename = req.params.filename;

  if (!allowedFiles.includes(filename)) {
    return res.status(404).send('File not found');
  }

  const filePath = path.join(__dirname, '../../..', 'agents/linux', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  res.sendFile(filePath);
});

// Protected route - get install command for UI
router.get(
  '/command/:serverId',
  authenticate,
  authorize('admin'),
  agentInstallController.getInstallCommand
);

module.exports = router;
