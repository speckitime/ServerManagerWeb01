const { Client } = require('ssh2');
const db = require('../config/database');
const logger = require('../services/logger');
const { decryptCredentials } = require('../services/encryption');

/**
 * Create SSH connection to server (supports SSH identities)
 */
async function createConnection(server) {
  // Decrypt SSH credentials (username from here)
  let credentials = null;
  if (server.ssh_credentials_encrypted) {
    try {
      credentials = decryptCredentials(server.ssh_credentials_encrypted);
    } catch (e) {
      logger.error('Failed to decrypt SSH credentials:', e);
    }
  }

  if (!credentials || !credentials.username) {
    throw new Error('SSH credentials not configured. Please edit the server to add SSH username and password.');
  }

  const conn = new Client();

  const sshConfig = {
    host: server.ip_address || server.hostname,
    port: server.ssh_port || 22,
    username: credentials.username,
    readyTimeout: 10000,
  };

  // Prefer SSH Identity key if assigned
  let identityKeyLoaded = false;
  if (server.ssh_identity_id) {
    try {
      const identity = await db('ssh_identities').where({ id: server.ssh_identity_id }).first();
      if (identity) {
        const keyData = decryptCredentials(identity.private_key_encrypted);
        if (keyData && keyData.key) {
          sshConfig.privateKey = keyData.key;
          if (identity.has_passphrase && identity.passphrase_encrypted) {
            const ppData = decryptCredentials(identity.passphrase_encrypted);
            if (ppData && ppData.passphrase) sshConfig.passphrase = ppData.passphrase;
          }
          identityKeyLoaded = true;
        }
      }
    } catch (e) {
      logger.error('Failed to load SSH identity:', e);
    }
  }

  // Fall back to server's stored private key
  if (!identityKeyLoaded && server.ssh_private_key_encrypted) {
    try {
      const keyData = decryptCredentials(server.ssh_private_key_encrypted);
      if (keyData && keyData.key) {
        sshConfig.privateKey = keyData.key;
        if (credentials.passphrase) sshConfig.passphrase = credentials.passphrase;
      }
    } catch (e) {
      logger.error('Failed to decrypt SSH key:', e);
    }
  }

  // Password auth
  if (credentials.password) {
    sshConfig.password = credentials.password;
  }

  return new Promise((resolve, reject) => {
    conn.on('ready', () => resolve(conn));
    conn.on('error', (err) => {
      if (err.message.includes('All configured authentication methods failed')) {
        reject(new Error('SSH authentication failed. Please check username and password/key.'));
      } else {
        reject(err);
      }
    });
    conn.connect(sshConfig);
  });
}

/**
 * Execute SSH command
 */
function execCommand(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);

      let stdout = '';
      let stderr = '';

      stream.on('data', (data) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      stream.on('close', (code) => {
        if (code !== 0 && stderr) {
          reject(new Error(stderr));
        } else {
          resolve(stdout);
        }
      });
    });
  });
}

/**
 * List directory contents
 */
exports.listDirectory = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;
    const { path: dirPath = '/' } = req.query;

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Sanitize path to prevent directory traversal
    const safePath = dirPath.replace(/\.\./g, '').replace(/\/+/g, '/');

    conn = await createConnection(server);

    // Get directory listing with file details
    const command = `ls -la --time-style=long-iso "${safePath}" 2>/dev/null || echo "ERROR_DIR_NOT_FOUND"`;
    const output = await execCommand(conn, command);

    if (output.includes('ERROR_DIR_NOT_FOUND')) {
      conn.end();
      return res.status(404).json({ error: 'Directory not found' });
    }

    const lines = output.trim().split('\n').slice(1); // Skip "total" line
    const items = lines.map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length < 8) return null;

      const permissions = parts[0];
      const isDirectory = permissions.startsWith('d');
      const isLink = permissions.startsWith('l');
      const size = parseInt(parts[4]) || 0;
      const date = `${parts[5]} ${parts[6]}`;
      const name = parts.slice(7).join(' ').split(' -> ')[0]; // Handle symlinks

      if (name === '.' || name === '..') return null;

      return {
        name,
        path: `${safePath}/${name}`.replace(/\/+/g, '/'),
        type: isDirectory ? 'directory' : isLink ? 'link' : 'file',
        size,
        permissions,
        modified: date,
      };
    }).filter(Boolean);

    conn.end();
    res.json({
      path: safePath,
      items: items.sort((a, b) => {
        // Directories first, then by name
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      }),
    });
  } catch (err) {
    if (conn) conn.end();
    logger.error('List directory error:', err);
    res.status(500).json({ error: err.message || 'Failed to list directory' });
  }
};

/**
 * Read file contents
 */
exports.readFile = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;
    const { path: filePath } = req.query;

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Sanitize path
    const safePath = filePath.replace(/\.\./g, '');

    conn = await createConnection(server);

    // Check file size first (limit to 5MB)
    const sizeOutput = await execCommand(conn, `stat -c%s "${safePath}" 2>/dev/null || echo "0"`);
    const fileSize = parseInt(sizeOutput.trim()) || 0;

    if (fileSize > 5 * 1024 * 1024) {
      conn.end();
      return res.status(400).json({ error: 'File too large (max 5MB)' });
    }

    // Check if binary file
    const fileOutput = await execCommand(conn, `file -b "${safePath}" 2>/dev/null`);
    const isBinary = fileOutput.includes('binary') || fileOutput.includes('executable');

    if (isBinary) {
      conn.end();
      return res.status(400).json({ error: 'Cannot edit binary files' });
    }

    // Read file contents
    const content = await execCommand(conn, `cat "${safePath}"`);

    conn.end();
    res.json({
      path: safePath,
      content,
      size: fileSize,
    });
  } catch (err) {
    if (conn) conn.end();
    logger.error('Read file error:', err);
    res.status(500).json({ error: err.message || 'Failed to read file' });
  }
};

/**
 * Write file contents
 */
exports.writeFile = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;
    const { path: filePath, content } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Sanitize path
    const safePath = filePath.replace(/\.\./g, '');

    conn = await createConnection(server);

    // Create backup
    await execCommand(conn, `cp "${safePath}" "${safePath}.bak" 2>/dev/null || true`);

    // Write file using cat with heredoc (safer than echo for special chars)
    const escapedContent = content.replace(/'/g, "'\\''");
    await execCommand(conn, `cat > "${safePath}" << 'FILEMANAGER_EOF'\n${content}\nFILEMANAGER_EOF`);

    conn.end();

    // Log activity
    await db('activity_logs').insert({
      user_id: req.user?.id,
      action: 'file_edit',
      details: `Edited file ${safePath} on server ${server.name}`,
      ip_address: req.ip,
    });

    res.json({ success: true, message: 'File saved successfully' });
  } catch (err) {
    if (conn) conn.end();
    logger.error('Write file error:', err);
    res.status(500).json({ error: err.message || 'Failed to write file' });
  }
};

/**
 * Create new file or directory
 */
exports.create = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;
    const { path: itemPath, type } = req.body;

    if (!itemPath || !type) {
      return res.status(400).json({ error: 'Path and type are required' });
    }

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Sanitize path
    const safePath = itemPath.replace(/\.\./g, '');

    conn = await createConnection(server);

    if (type === 'directory') {
      await execCommand(conn, `mkdir -p "${safePath}"`);
    } else {
      await execCommand(conn, `touch "${safePath}"`);
    }

    conn.end();
    res.json({ success: true, message: `${type} created successfully` });
  } catch (err) {
    if (conn) conn.end();
    logger.error('Create item error:', err);
    res.status(500).json({ error: err.message || 'Failed to create item' });
  }
};

/**
 * Delete file or directory
 */
exports.delete = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;
    const { path: itemPath } = req.body;

    if (!itemPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    // Prevent deleting critical paths
    const dangerousPaths = ['/', '/etc', '/usr', '/var', '/home', '/root', '/bin', '/sbin'];
    if (dangerousPaths.includes(itemPath)) {
      return res.status(400).json({ error: 'Cannot delete critical system path' });
    }

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Sanitize path
    const safePath = itemPath.replace(/\.\./g, '');

    conn = await createConnection(server);
    await execCommand(conn, `rm -rf "${safePath}"`);

    conn.end();

    // Log activity
    await db('activity_logs').insert({
      user_id: req.user?.id,
      action: 'file_delete',
      details: `Deleted ${safePath} on server ${server.name}`,
      ip_address: req.ip,
    });

    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (err) {
    if (conn) conn.end();
    logger.error('Delete item error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete item' });
  }
};

/**
 * Rename/move file or directory
 */
exports.rename = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;
    const { oldPath, newPath } = req.body;

    if (!oldPath || !newPath) {
      return res.status(400).json({ error: 'Old path and new path are required' });
    }

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Sanitize paths
    const safeOldPath = oldPath.replace(/\.\./g, '');
    const safeNewPath = newPath.replace(/\.\./g, '');

    conn = await createConnection(server);
    await execCommand(conn, `mv "${safeOldPath}" "${safeNewPath}"`);

    conn.end();
    res.json({ success: true, message: 'Item renamed successfully' });
  } catch (err) {
    if (conn) conn.end();
    logger.error('Rename item error:', err);
    res.status(500).json({ error: err.message || 'Failed to rename item' });
  }
};

/**
 * Download file
 */
exports.download = async (req, res) => {
  let conn = null;
  try {
    const { serverId } = req.params;
    const { path: filePath } = req.query;

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Sanitize path
    const safePath = filePath.replace(/\.\./g, '');

    conn = await createConnection(server);

    // Check file size (limit to 100MB for download)
    const sizeOutput = await execCommand(conn, `stat -c%s "${safePath}" 2>/dev/null || echo "0"`);
    const fileSize = parseInt(sizeOutput.trim()) || 0;

    if (fileSize > 100 * 1024 * 1024) {
      conn.end();
      return res.status(400).json({ error: 'File too large (max 100MB)' });
    }

    // Get file content as base64
    const content = await execCommand(conn, `base64 "${safePath}"`);

    conn.end();

    const filename = safePath.split('/').pop();
    const buffer = Buffer.from(content.trim(), 'base64');

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    if (conn) conn.end();
    logger.error('Download file error:', err);
    res.status(500).json({ error: err.message || 'Failed to download file' });
  }
};
