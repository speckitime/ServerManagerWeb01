const jwt = require('jsonwebtoken');
const { Client: SSHClient } = require('ssh2');
const config = require('../config/app');
const db = require('../config/database');
const { decryptCredentials } = require('../services/encryption');
const logger = require('../services/logger');

module.exports = (io) => {
  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await db('users')
        .where({ id: decoded.userId, is_active: true })
        .first();

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = {
        id: user.id,
        username: user.username,
        role: user.role,
      };

      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`User ${socket.user.username} connected via WebSocket`);

    // Join server rooms for real-time updates
    socket.on('subscribe_server', async (serverId) => {
      try {
        if (socket.user.role !== 'admin') {
          const access = await db('user_servers')
            .where({ user_id: socket.user.id, server_id: serverId })
            .first();
          if (!access) return;
        }

        socket.join(`server:${serverId}`);
        logger.debug(`User ${socket.user.username} subscribed to server ${serverId}`);
      } catch (err) {
        logger.error('Subscribe server error:', err);
      }
    });

    socket.on('unsubscribe_server', (serverId) => {
      socket.leave(`server:${serverId}`);
    });

    // SSH Terminal
    socket.on('ssh_connect', async (data) => {
      try {
        const { serverId } = data;

        // Check access
        if (socket.user.role !== 'admin') {
          const access = await db('user_servers')
            .where({ user_id: socket.user.id, server_id: serverId })
            .first();
          if (!access) {
            socket.emit('ssh_error', { error: 'Access denied' });
            return;
          }
        }

        const server = await db('servers').where({ id: serverId }).first();
        if (!server) {
          socket.emit('ssh_error', { error: 'Server not found' });
          return;
        }

        if (server.os_type !== 'linux') {
          socket.emit('ssh_error', { error: 'SSH only available for Linux servers' });
          return;
        }

        let credentials = null;
        if (server.ssh_credentials_encrypted) {
          try {
            credentials = decryptCredentials(server.ssh_credentials_encrypted);
          } catch (e) {
            logger.error('Failed to decrypt SSH credentials:', e);
          }
        }

        if (!credentials || !credentials.username) {
          socket.emit('ssh_error', { error: 'No SSH credentials configured. Edit the server to add SSH username/password or a private key.' });
          return;
        }

        const sshConn = new SSHClient();
        const sshConfig = {
          host: server.ip_address,
          port: server.ssh_port || 22,
          username: credentials.username,
          readyTimeout: 10000,
          algorithms: {
            kex: [
              'curve25519-sha256',
              'curve25519-sha256@libssh.org',
              'ecdh-sha2-nistp256',
              'ecdh-sha2-nistp384',
              'ecdh-sha2-nistp521',
              'diffie-hellman-group-exchange-sha256',
              'diffie-hellman-group14-sha256',
              'diffie-hellman-group14-sha1',
            ],
          },
        };

        // Try private key first, then password
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

        sshConn.on('ready', () => {
          socket.emit('ssh_connected');

          sshConn.shell(
            { term: 'xterm-256color', cols: data.cols || 80, rows: data.rows || 24 },
            (err, stream) => {
              if (err) {
                socket.emit('ssh_error', { error: err.message });
                return;
              }

              socket._sshStream = stream;
              socket._sshConn = sshConn;

              stream.on('data', (data) => {
                socket.emit('ssh_data', data.toString('utf8'));
              });

              stream.on('close', () => {
                socket.emit('ssh_closed');
                sshConn.end();
              });

              stream.stderr.on('data', (data) => {
                socket.emit('ssh_data', data.toString('utf8'));
              });
            }
          );

          // Log SSH connection
          db('activity_logs').insert({
            user_id: socket.user.id,
            server_id: serverId,
            action: 'ssh_connected',
            details: `SSH connection to ${server.hostname}`,
          }).catch((err) => logger.error('Activity log error:', err));
        });

        sshConn.on('error', (err) => {
          socket.emit('ssh_error', { error: err.message });
        });

        sshConn.connect(sshConfig);
      } catch (err) {
        logger.error('SSH connect error:', err);
        socket.emit('ssh_error', { error: 'Connection failed' });
      }
    });

    socket.on('ssh_data', (data) => {
      if (socket._sshStream) {
        socket._sshStream.write(data);
      }
    });

    socket.on('ssh_resize', (data) => {
      if (socket._sshStream) {
        socket._sshStream.setWindow(data.rows, data.cols, data.height, data.width);
      }
    });

    socket.on('ssh_disconnect', () => {
      if (socket._sshStream) {
        socket._sshStream.close();
      }
      if (socket._sshConn) {
        socket._sshConn.end();
      }
    });

    socket.on('disconnect', () => {
      logger.info(`User ${socket.user.username} disconnected`);
      if (socket._sshStream) {
        socket._sshStream.close();
      }
      if (socket._sshConn) {
        socket._sshConn.end();
      }
    });
  });

  // Agent namespace for server agents
  const agentIo = io.of('/agent');

  agentIo.use(async (socket, next) => {
    try {
      const apiKey = socket.handshake.auth.apiKey;
      if (!apiKey) {
        return next(new Error('API key required'));
      }

      const server = await db('servers')
        .where({ agent_api_key: apiKey })
        .first();

      if (!server) {
        return next(new Error('Invalid API key'));
      }

      socket.server = server;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  agentIo.on('connection', (socket) => {
    const server = socket.server;
    logger.info(`Agent connected for server ${server.hostname}`);

    socket.join(`agent:${server.id}`);

    // Update server status
    db('servers')
      .where({ id: server.id })
      .update({ status: 'online', last_seen: new Date(), agent_installed: true })
      .catch((err) => logger.error('Update server status error:', err));

    socket.on('metrics', async (data) => {
      try {
        await db('server_metrics').insert({
          server_id: server.id,
          ...data,
          disk_partitions: JSON.stringify(data.disk_partitions),
          top_processes: JSON.stringify(data.top_processes),
        });

        await db('servers')
          .where({ id: server.id })
          .update({ last_seen: new Date() });

        // Forward to subscribed users
        io.to(`server:${server.id}`).emit('server_metrics', {
          server_id: server.id,
          ...data,
        });
      } catch (err) {
        logger.error('Process agent metrics error:', err);
      }
    });

    socket.on('log_content', (data) => {
      io.to(`server:${server.id}`).emit('log_content', {
        server_id: server.id,
        ...data,
      });
    });

    socket.on('update_progress', (data) => {
      io.to(`server:${server.id}`).emit('update_progress', {
        server_id: server.id,
        ...data,
      });
    });

    socket.on('task_result', (data) => {
      io.to(`server:${server.id}`).emit('task_result', {
        server_id: server.id,
        ...data,
      });
    });

    socket.on('disconnect', () => {
      logger.info(`Agent disconnected for server ${server.hostname}`);
      db('servers')
        .where({ id: server.id })
        .update({ status: 'offline' })
        .catch((err) => logger.error('Update server status error:', err));

      io.to(`server:${server.id}`).emit('server_status', {
        server_id: server.id,
        status: 'offline',
      });
    });
  });

  return io;
};
