const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../services/logger');
const { encryptCredentials, decryptCredentials } = require('../services/encryption');

/**
 * Compute SHA256 fingerprint from public key (OpenSSH format)
 */
function computeFingerprint(publicKey) {
  try {
    // Extract the base64 part from "ssh-xxx AAAA... comment"
    const parts = publicKey.trim().split(' ');
    const keyData = Buffer.from(parts[1], 'base64');
    const hash = crypto.createHash('sha256').update(keyData).digest('base64');
    return `SHA256:${hash.replace(/=+$/, '')}`;
  } catch {
    return null;
  }
}

/**
 * Generate SSH key pair
 */
function generateKeyPair(type, bits, passphrase) {
  if (type === 'ed25519') {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        ...(passphrase ? { cipher: 'aes-256-cbc', passphrase } : {}),
      },
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
    });
    // Convert to OpenSSH format
    const pubKeyObj = crypto.createPublicKey(publicKey);
    const sshPublic = pubKeyObj.export({ type: 'spki', format: 'pem' });
    return { privateKey, publicKey: sshPublic, type: 'ed25519', bits: 256 };
  }

  if (type === 'ecdsa') {
    const namedCurve = bits === 521 ? 'P-521' : bits === 384 ? 'P-384' : 'P-256';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve,
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        ...(passphrase ? { cipher: 'aes-256-cbc', passphrase } : {}),
      },
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
    });
    return { privateKey, publicKey, type: 'ecdsa', bits: bits || 256 };
  }

  // Default: RSA
  const keySize = [2048, 3072, 4096].includes(bits) ? bits : 4096;
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: keySize,
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
      ...(passphrase ? { cipher: 'aes-256-cbc', passphrase } : {}),
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  });
  return { privateKey, publicKey, type: 'rsa', bits: keySize };
}

/**
 * Strip private key from identity response
 */
function safeIdentity(identity) {
  const { private_key_encrypted, passphrase_encrypted, ...safe } = identity;
  return safe;
}

// List all identities
exports.list = async (req, res) => {
  try {
    const identities = await db('ssh_identities')
      .leftJoin('users', 'ssh_identities.created_by', 'users.id')
      .select(
        'ssh_identities.id',
        'ssh_identities.name',
        'ssh_identities.description',
        'ssh_identities.key_type',
        'ssh_identities.key_bits',
        'ssh_identities.public_key',
        'ssh_identities.has_passphrase',
        'ssh_identities.fingerprint',
        'ssh_identities.created_at',
        'ssh_identities.updated_at',
        'users.username as created_by_name'
      )
      .orderBy('ssh_identities.created_at', 'desc');

    // Count how many servers use each identity
    const usageCounts = await db('servers')
      .select('ssh_identity_id')
      .whereNotNull('ssh_identity_id')
      .count('* as count')
      .groupBy('ssh_identity_id');

    const usageMap = {};
    usageCounts.forEach(({ ssh_identity_id, count }) => {
      usageMap[ssh_identity_id] = parseInt(count);
    });

    res.json(identities.map((id) => ({
      ...id,
      server_count: usageMap[id.id] || 0,
    })));
  } catch (err) {
    logger.error('List SSH identities error:', err);
    res.status(500).json({ error: 'Failed to load SSH identities' });
  }
};

// Get single identity (without private key)
exports.get = async (req, res) => {
  try {
    const { id } = req.params;
    const identity = await db('ssh_identities').where({ id }).first();
    if (!identity) {
      return res.status(404).json({ error: 'Identity not found' });
    }
    res.json(safeIdentity(identity));
  } catch (err) {
    logger.error('Get SSH identity error:', err);
    res.status(500).json({ error: 'Failed to get identity' });
  }
};

// Generate new key pair
exports.generate = async (req, res) => {
  try {
    const { name, description, key_type = 'ed25519', key_bits, passphrase } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    logger.info(`Generating ${key_type} key pair for identity "${name}"`);

    const keyPair = generateKeyPair(key_type, key_bits, passphrase || undefined);

    const fingerprint = computeFingerprint(keyPair.publicKey);

    const [identity] = await db('ssh_identities')
      .insert({
        name,
        description: description || null,
        key_type: keyPair.type,
        key_bits: keyPair.bits,
        public_key: keyPair.publicKey,
        private_key_encrypted: encryptCredentials({ key: keyPair.privateKey }),
        has_passphrase: !!passphrase,
        passphrase_encrypted: passphrase ? encryptCredentials({ passphrase }) : null,
        fingerprint,
        created_by: req.user?.id,
      })
      .returning('*');

    logger.info(`SSH identity "${name}" created with ID ${identity.id}`);

    res.json(safeIdentity(identity));
  } catch (err) {
    logger.error('Generate SSH identity error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate key pair' });
  }
};

// Import existing key
exports.import = async (req, res) => {
  try {
    const { name, description, public_key, private_key, passphrase } = req.body;

    if (!name || !public_key || !private_key) {
      return res.status(400).json({ error: 'Name, public key, and private key are required' });
    }

    // Detect key type from public key
    let key_type = 'rsa';
    let key_bits = null;
    if (public_key.includes('ECDSA')) key_type = 'ecdsa';
    if (public_key.includes('ED25519') || public_key.includes('-----BEGIN PUBLIC KEY-----')) {
      key_type = 'ed25519';
      key_bits = 256;
    }

    const fingerprint = computeFingerprint(public_key);

    const [identity] = await db('ssh_identities')
      .insert({
        name,
        description: description || null,
        key_type,
        key_bits,
        public_key,
        private_key_encrypted: encryptCredentials({ key: private_key }),
        has_passphrase: !!passphrase,
        passphrase_encrypted: passphrase ? encryptCredentials({ passphrase }) : null,
        fingerprint,
        created_by: req.user?.id,
      })
      .returning('*');

    res.json(safeIdentity(identity));
  } catch (err) {
    logger.error('Import SSH identity error:', err);
    res.status(500).json({ error: err.message || 'Failed to import key' });
  }
};

// Update identity metadata (not the key itself)
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const [identity] = await db('ssh_identities')
      .where({ id })
      .update({ name, description, updated_at: new Date() })
      .returning('*');

    if (!identity) {
      return res.status(404).json({ error: 'Identity not found' });
    }

    res.json(safeIdentity(identity));
  } catch (err) {
    logger.error('Update SSH identity error:', err);
    res.status(500).json({ error: 'Failed to update identity' });
  }
};

// Delete identity
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if any server uses this identity
    const serverCount = await db('servers')
      .where({ ssh_identity_id: id })
      .count('* as count')
      .first();

    if (parseInt(serverCount.count) > 0) {
      return res.status(400).json({
        error: `Cannot delete: ${serverCount.count} server(s) use this identity. Please reassign them first.`,
      });
    }

    await db('ssh_identities').where({ id }).del();
    res.json({ success: true });
  } catch (err) {
    logger.error('Delete SSH identity error:', err);
    res.status(500).json({ error: 'Failed to delete identity' });
  }
};

// Export public key
exports.exportPublicKey = async (req, res) => {
  try {
    const { id } = req.params;
    const identity = await db('ssh_identities').where({ id }).first();
    if (!identity) {
      return res.status(404).json({ error: 'Identity not found' });
    }

    const filename = `${identity.name.replace(/\s+/g, '_')}.pub`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain');
    res.send(identity.public_key);
  } catch (err) {
    logger.error('Export public key error:', err);
    res.status(500).json({ error: 'Failed to export public key' });
  }
};

// Export private key (admin only, logged)
exports.exportPrivateKey = async (req, res) => {
  try {
    const { id } = req.params;
    const identity = await db('ssh_identities').where({ id }).first();
    if (!identity) {
      return res.status(404).json({ error: 'Identity not found' });
    }

    const keyData = decryptCredentials(identity.private_key_encrypted);
    if (!keyData || !keyData.key) {
      return res.status(500).json({ error: 'Failed to decrypt private key' });
    }

    // Log the export
    await db('activity_logs').insert({
      user_id: req.user?.id,
      action: 'ssh_key_export',
      details: `Exported private key for identity "${identity.name}"`,
      ip_address: req.ip,
    });

    const filename = `${identity.name.replace(/\s+/g, '_')}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain');
    res.send(keyData.key);
  } catch (err) {
    logger.error('Export private key error:', err);
    res.status(500).json({ error: 'Failed to export private key' });
  }
};
