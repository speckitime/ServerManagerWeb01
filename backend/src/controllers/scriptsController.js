const db = require('../config/database');
const { Client: SSHClient } = require('ssh2');
const { decryptCredentials } = require('../services/encryption');
const logger = require('../services/logger');

// List all global scripts
const list = async (req, res) => {
  try {
    const scripts = await db('global_scripts')
      .select(
        'global_scripts.*',
        'creator.username as created_by_name',
        'updater.username as updated_by_name'
      )
      .leftJoin('users as creator', 'global_scripts.created_by', 'creator.id')
      .leftJoin('users as updater', 'global_scripts.updated_by', 'updater.id')
      .orderBy('global_scripts.updated_at', 'desc');
    res.json(scripts);
  } catch (err) {
    logger.error('List scripts error:', err);
    res.status(500).json({ error: 'Failed to list scripts' });
  }
};

// Get single script
const get = async (req, res) => {
  try {
    const script = await db('global_scripts')
      .select(
        'global_scripts.*',
        'creator.username as created_by_name',
        'updater.username as updated_by_name'
      )
      .leftJoin('users as creator', 'global_scripts.created_by', 'creator.id')
      .leftJoin('users as updater', 'global_scripts.updated_by', 'updater.id')
      .where('global_scripts.id', req.params.id)
      .first();

    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Get recent executions
    const executions = await db('script_executions')
      .select(
        'script_executions.*',
        'servers.hostname as server_hostname',
        'servers.display_name as server_display_name',
        'users.username as executed_by_name'
      )
      .leftJoin('servers', 'script_executions.server_id', 'servers.id')
      .leftJoin('users', 'script_executions.executed_by', 'users.id')
      .where('script_executions.script_id', req.params.id)
      .orderBy('script_executions.created_at', 'desc')
      .limit(20);

    res.json({ ...script, executions });
  } catch (err) {
    logger.error('Get script error:', err);
    res.status(500).json({ error: 'Failed to get script' });
  }
};

// Create script
const create = async (req, res) => {
  try {
    const { name, description, content, language, tags } = req.body;

    const [script] = await db('global_scripts')
      .insert({
        name,
        description: description || null,
        content,
        language: language || 'bash',
        tags: JSON.stringify(tags || []),
        created_by: req.user.id,
        updated_by: req.user.id,
      })
      .returning('*');

    // Activity log
    await db('activity_logs').insert({
      user_id: req.user.id,
      action: 'script_created',
      details: `Created script "${name}"`,
    }).catch(() => {});

    res.status(201).json(script);
  } catch (err) {
    logger.error('Create script error:', err);
    res.status(500).json({ error: 'Failed to create script' });
  }
};

// Update script
const update = async (req, res) => {
  try {
    const { name, description, content, language, tags } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (content !== undefined) updates.content = content;
    if (language !== undefined) updates.language = language;
    if (tags !== undefined) updates.tags = JSON.stringify(tags);
    updates.updated_by = req.user.id;
    updates.updated_at = new Date();

    const [script] = await db('global_scripts')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');

    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    res.json(script);
  } catch (err) {
    logger.error('Update script error:', err);
    res.status(500).json({ error: 'Failed to update script' });
  }
};

// Delete script
const remove = async (req, res) => {
  try {
    const deleted = await db('global_scripts')
      .where({ id: req.params.id })
      .del();

    if (!deleted) {
      return res.status(404).json({ error: 'Script not found' });
    }

    res.json({ message: 'Script deleted' });
  } catch (err) {
    logger.error('Delete script error:', err);
    res.status(500).json({ error: 'Failed to delete script' });
  }
};

// Execute script on a server via SSH
const execute = async (req, res) => {
  try {
    const { serverId } = req.body;
    const scriptId = req.params.id;

    // Get the script
    const script = await db('global_scripts').where({ id: scriptId }).first();
    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Get the server
    const server = await db('servers').where({ id: serverId }).first();
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ error: 'Script execution only available for Linux servers' });
    }

    // Create execution record
    const [execution] = await db('script_executions')
      .insert({
        script_id: scriptId,
        server_id: serverId,
        executed_by: req.user.id,
        status: 'pending',
      })
      .returning('*');

    // Send response immediately
    res.status(201).json(execution);

    // Execute in background via SSH
    executeViaSSH(server, script, execution.id, req.user, req.app.get('io'));
  } catch (err) {
    logger.error('Execute script error:', err);
    res.status(500).json({ error: 'Failed to execute script' });
  }
};

// Get execution details
const getExecution = async (req, res) => {
  try {
    const execution = await db('script_executions')
      .select(
        'script_executions.*',
        'servers.hostname as server_hostname',
        'servers.display_name as server_display_name',
        'global_scripts.name as script_name',
        'users.username as executed_by_name'
      )
      .leftJoin('servers', 'script_executions.server_id', 'servers.id')
      .leftJoin('global_scripts', 'script_executions.script_id', 'global_scripts.id')
      .leftJoin('users', 'script_executions.executed_by', 'users.id')
      .where('script_executions.id', req.params.executionId)
      .first();

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json(execution);
  } catch (err) {
    logger.error('Get execution error:', err);
    res.status(500).json({ error: 'Failed to get execution' });
  }
};

async function executeViaSSH(server, script, executionId, user, io) {
  const sshConn = new SSHClient();

  try {
    let credentials = null;
    if (server.ssh_credentials_encrypted) {
      credentials = decryptCredentials(server.ssh_credentials_encrypted);
    }

    if (!credentials || !credentials.username) {
      await db('script_executions')
        .where({ id: executionId })
        .update({ status: 'failed', error_output: 'No SSH credentials configured', completed_at: new Date() });
      return;
    }

    const sshConfig = {
      host: server.ip_address,
      port: server.ssh_port || 22,
      username: credentials.username,
      readyTimeout: 10000,
      algorithms: {
        kex: [
          'curve25519-sha256', 'curve25519-sha256@libssh.org',
          'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
          'diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1',
        ],
      },
    };

    if (server.ssh_private_key_encrypted) {
      try {
        const keyData = decryptCredentials(server.ssh_private_key_encrypted);
        if (keyData && keyData.key) {
          sshConfig.privateKey = keyData.key;
          if (credentials.passphrase) {
            sshConfig.passphrase = credentials.passphrase;
          }
        }
      } catch (e) {
        logger.error('Failed to decrypt SSH key:', e);
      }
    }

    if (credentials.password) {
      sshConfig.password = credentials.password;
    }

    await db('script_executions')
      .where({ id: executionId })
      .update({ status: 'running', started_at: new Date() });

    // Emit status to frontend
    if (io) {
      io.emit('script_execution_update', {
        execution_id: executionId,
        script_id: script.id,
        server_id: server.id,
        status: 'running',
      });
    }

    sshConn.on('ready', () => {
      // Determine interpreter
      let command;
      if (script.language === 'python') {
        command = `python3 -c ${escapeShellArg(script.content)}`;
      } else if (script.language === 'powershell') {
        command = `pwsh -Command ${escapeShellArg(script.content)}`;
      } else {
        command = `bash -c ${escapeShellArg(script.content)}`;
      }

      let output = '';
      let errorOutput = '';

      sshConn.exec(command, (err, stream) => {
        if (err) {
          db('script_executions')
            .where({ id: executionId })
            .update({ status: 'failed', error_output: err.message, completed_at: new Date() })
            .catch((e) => logger.error('Update execution error:', e));
          sshConn.end();
          return;
        }

        stream.on('data', (data) => {
          const chunk = data.toString('utf8');
          output += chunk;
          // Stream output to frontend
          if (io) {
            io.emit('script_execution_output', {
              execution_id: executionId,
              type: 'stdout',
              data: chunk,
            });
          }
        });

        stream.stderr.on('data', (data) => {
          const chunk = data.toString('utf8');
          errorOutput += chunk;
          if (io) {
            io.emit('script_execution_output', {
              execution_id: executionId,
              type: 'stderr',
              data: chunk,
            });
          }
        });

        stream.on('close', async (code) => {
          const status = code === 0 ? 'completed' : 'failed';
          await db('script_executions')
            .where({ id: executionId })
            .update({
              status,
              exit_code: code,
              output: output.substring(0, 100000), // Limit stored output
              error_output: errorOutput.substring(0, 100000),
              completed_at: new Date(),
            })
            .catch((e) => logger.error('Update execution error:', e));

          if (io) {
            io.emit('script_execution_update', {
              execution_id: executionId,
              script_id: script.id,
              server_id: server.id,
              status,
              exit_code: code,
            });
          }

          // Activity log
          db('activity_logs').insert({
            user_id: user.id,
            server_id: server.id,
            action: 'script_executed',
            details: `Executed script "${script.name}" on ${server.hostname} - ${status} (exit ${code})`,
          }).catch(() => {});

          sshConn.end();
        });
      });
    });

    sshConn.on('error', async (err) => {
      await db('script_executions')
        .where({ id: executionId })
        .update({ status: 'failed', error_output: err.message, completed_at: new Date() })
        .catch((e) => logger.error('Update execution error:', e));

      if (io) {
        io.emit('script_execution_update', {
          execution_id: executionId,
          script_id: script.id,
          server_id: server.id,
          status: 'failed',
          error: err.message,
        });
      }
    });

    sshConn.connect(sshConfig);
  } catch (err) {
    logger.error('SSH execution error:', err);
    await db('script_executions')
      .where({ id: executionId })
      .update({ status: 'failed', error_output: err.message, completed_at: new Date() })
      .catch((e) => logger.error('Update execution error:', e));
  }
}

function escapeShellArg(arg) {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

module.exports = { list, get, create, update, remove, execute, getExecution };
