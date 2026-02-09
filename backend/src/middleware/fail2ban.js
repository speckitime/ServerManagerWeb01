const db = require('../config/database');
const logger = require('../services/logger');

// Cache settings to avoid DB queries on every request
let settingsCache = null;
let settingsCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Get Fail2Ban settings from database with caching
 */
async function getSettings() {
  const now = Date.now();
  if (settingsCache && now - settingsCacheTime < CACHE_TTL) {
    return settingsCache;
  }

  const rows = await db('settings').whereIn('key', [
    'fail2ban_enabled',
    'fail2ban_max_attempts',
    'fail2ban_ban_time',
    'ip_whitelist',
  ]);

  const settings = {};
  rows.forEach((row) => {
    settings[row.key] = row.value;
  });

  settingsCache = {
    enabled: settings.fail2ban_enabled === 'true',
    maxAttempts: parseInt(settings.fail2ban_max_attempts) || 5,
    banTime: parseInt(settings.fail2ban_ban_time) || 600, // seconds
    whitelist: (settings.ip_whitelist || '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean),
  };
  settingsCacheTime = now;

  return settingsCache;
}

/**
 * Clear settings cache (call when settings are updated)
 */
function clearSettingsCache() {
  settingsCache = null;
  settingsCacheTime = 0;
}

/**
 * Get the real client IP address
 */
function getClientIp(req) {
  // Trust X-Forwarded-For if behind proxy
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection.remoteAddress || 'unknown';
}

/**
 * Check if an IP is currently banned
 */
async function isIpBanned(ip) {
  const ban = await db('ip_bans')
    .where('ip_address', ip)
    .where(function () {
      this.whereNull('expires_at').orWhere('expires_at', '>', new Date());
    })
    .first();

  return !!ban;
}

/**
 * Record a failed login attempt
 */
async function recordFailedAttempt(ip, username = null) {
  const settings = await getSettings();
  if (!settings.enabled) return { banned: false };

  // Check whitelist
  if (settings.whitelist.includes(ip)) {
    return { banned: false };
  }

  // Record the failed attempt
  await db('failed_logins').insert({
    ip_address: ip,
    username,
    attempted_at: new Date(),
  });

  // Count recent failures within the ban time window
  const windowStart = new Date(Date.now() - settings.banTime * 1000);
  const failureCount = await db('failed_logins')
    .where('ip_address', ip)
    .where('attempted_at', '>', windowStart)
    .count('* as count')
    .first();

  const count = parseInt(failureCount.count);

  // If exceeded max attempts, ban the IP
  if (count >= settings.maxAttempts) {
    const expiresAt = new Date(Date.now() + settings.banTime * 1000);

    // Upsert ban record
    await db('ip_bans')
      .insert({
        ip_address: ip,
        reason: `Exceeded ${settings.maxAttempts} failed login attempts`,
        banned_at: new Date(),
        expires_at: expiresAt,
      })
      .onConflict('ip_address')
      .merge({
        reason: `Exceeded ${settings.maxAttempts} failed login attempts`,
        banned_at: new Date(),
        expires_at: expiresAt,
      });

    logger.warn(`IP ${ip} banned for ${settings.banTime}s after ${count} failed attempts`);

    return { banned: true, expiresAt, attemptsRemaining: 0 };
  }

  return {
    banned: false,
    attemptsRemaining: settings.maxAttempts - count,
  };
}

/**
 * Clear failed attempts for an IP (call on successful login)
 */
async function clearFailedAttempts(ip) {
  await db('failed_logins').where('ip_address', ip).del();
}

/**
 * Middleware to check if IP is banned before processing request
 */
const checkBan = async (req, res, next) => {
  try {
    const settings = await getSettings();
    if (!settings.enabled) {
      return next();
    }

    const ip = getClientIp(req);

    // Check whitelist
    if (settings.whitelist.includes(ip)) {
      return next();
    }

    // Check if banned
    const banned = await isIpBanned(ip);
    if (banned) {
      logger.warn(`Blocked request from banned IP: ${ip}`);
      return res.status(403).json({
        error: 'Access denied',
        message: 'Your IP has been temporarily banned due to too many failed login attempts',
      });
    }

    next();
  } catch (err) {
    logger.error('Fail2Ban check error:', err);
    // Don't block on error, fail open
    next();
  }
};

/**
 * Get list of currently banned IPs (for admin dashboard)
 */
async function getBannedIps() {
  return db('ip_bans')
    .where(function () {
      this.whereNull('expires_at').orWhere('expires_at', '>', new Date());
    })
    .orderBy('banned_at', 'desc');
}

/**
 * Manually unban an IP
 */
async function unbanIp(ip) {
  await db('ip_bans').where('ip_address', ip).del();
  await db('failed_logins').where('ip_address', ip).del();
  logger.info(`IP ${ip} manually unbanned`);
}

/**
 * Manually ban an IP
 */
async function banIp(ip, reason, userId = null, expiresAt = null) {
  await db('ip_bans')
    .insert({
      ip_address: ip,
      reason: reason || 'Manually banned',
      banned_at: new Date(),
      expires_at: expiresAt,
      banned_by: userId,
    })
    .onConflict('ip_address')
    .merge({
      reason: reason || 'Manually banned',
      banned_at: new Date(),
      expires_at: expiresAt,
      banned_by: userId,
    });

  logger.info(`IP ${ip} manually banned by user ${userId}`);
}

/**
 * Clean up expired bans and old failed login records
 */
async function cleanup() {
  const settings = await getSettings();

  // Remove expired bans
  const expiredBans = await db('ip_bans')
    .whereNotNull('expires_at')
    .where('expires_at', '<', new Date())
    .del();

  // Remove old failed login records (older than 2x ban time)
  const cutoff = new Date(Date.now() - settings.banTime * 2000);
  const oldRecords = await db('failed_logins').where('attempted_at', '<', cutoff).del();

  if (expiredBans > 0 || oldRecords > 0) {
    logger.info(`Fail2Ban cleanup: removed ${expiredBans} expired bans, ${oldRecords} old records`);
  }
}

module.exports = {
  checkBan,
  recordFailedAttempt,
  clearFailedAttempts,
  isIpBanned,
  getBannedIps,
  unbanIp,
  banIp,
  cleanup,
  clearSettingsCache,
  getClientIp,
};
