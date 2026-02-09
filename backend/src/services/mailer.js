const nodemailer = require('nodemailer');
const db = require('../config/database');
const logger = require('./logger');

let transporter = null;
let settingsCache = null;
let settingsCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Get mail settings from database with caching
 */
async function getMailSettings() {
  const now = Date.now();
  if (settingsCache && now - settingsCacheTime < CACHE_TTL) {
    return settingsCache;
  }

  const rows = await db('settings').whereIn('key', [
    'smtp_host',
    'smtp_port',
    'smtp_user',
    'smtp_password',
    'smtp_secure',
    'mail_from',
    'mail_from_name',
  ]);

  const settings = {};
  rows.forEach((row) => {
    settings[row.key] = row.value;
  });

  settingsCache = {
    host: settings.smtp_host || '',
    port: parseInt(settings.smtp_port) || 587,
    user: settings.smtp_user || '',
    password: settings.smtp_password || '',
    secure: settings.smtp_secure === 'true',
    from: settings.mail_from || '',
    fromName: settings.mail_from_name || 'ServerManager',
  };
  settingsCacheTime = now;

  return settingsCache;
}

/**
 * Clear settings cache
 */
function clearSettingsCache() {
  settingsCache = null;
  settingsCacheTime = 0;
  transporter = null;
}

/**
 * Get or create transporter
 */
async function getTransporter() {
  const settings = await getMailSettings();

  if (!settings.host) {
    throw new Error('SMTP host not configured');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: settings.user
        ? {
            user: settings.user,
            pass: settings.password,
          }
        : undefined,
    });
  }

  return transporter;
}

/**
 * Send an email
 */
async function sendMail({ to, subject, text, html }) {
  const settings = await getMailSettings();
  const transport = await getTransporter();

  const mailOptions = {
    from: `"${settings.fromName}" <${settings.from}>`,
    to,
    subject,
    text,
    html,
  };

  try {
    const info = await transport.sendMail(mailOptions);
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Failed to send email to ${to}:`, err);
    throw err;
  }
}

/**
 * Send a test email
 */
async function sendTestMail(to) {
  return sendMail({
    to,
    subject: 'ServerManager Test Email',
    text: 'This is a test email from ServerManager. If you received this, your mail configuration is working correctly.',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">ServerManager</h1>
        </div>
        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="color: #1f2937;">Test Email</h2>
          <p style="color: #4b5563;">This is a test email from ServerManager.</p>
          <p style="color: #4b5563;">If you received this, your mail configuration is working correctly.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px;">Sent from ServerManager</p>
        </div>
      </div>
    `,
  });
}

/**
 * Send server alert email
 */
async function sendServerAlert({ serverName, alertType, message, to }) {
  const alertColors = {
    critical: '#dc2626',
    warning: '#f59e0b',
    info: '#3b82f6',
  };

  const color = alertColors[alertType] || alertColors.info;

  return sendMail({
    to,
    subject: `[${alertType.toUpperCase()}] Server Alert: ${serverName}`,
    text: `Server: ${serverName}\nAlert Type: ${alertType}\n\n${message}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${color}; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">${alertType.toUpperCase()} Alert</h1>
        </div>
        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="color: #1f2937;">Server: ${serverName}</h2>
          <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid ${color};">
            <p style="color: #4b5563; margin: 0;">${message}</p>
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px;">Sent from ServerManager</p>
        </div>
      </div>
    `,
  });
}

/**
 * Send backup notification email
 */
async function sendBackupNotification({ status, filename, size, error, to }) {
  const isSuccess = status === 'completed';
  const color = isSuccess ? '#10b981' : '#dc2626';
  const title = isSuccess ? 'Backup Completed' : 'Backup Failed';

  return sendMail({
    to,
    subject: `[ServerManager] ${title}`,
    text: isSuccess
      ? `Backup completed successfully.\nFilename: ${filename}\nSize: ${size}`
      : `Backup failed.\nError: ${error}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${color}; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">${title}</h1>
        </div>
        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          ${
            isSuccess
              ? `
            <p style="color: #4b5563;">Your database backup has completed successfully.</p>
            <div style="background: white; padding: 15px; border-radius: 6px; border: 1px solid #e5e7eb;">
              <p style="margin: 5px 0;"><strong>Filename:</strong> ${filename}</p>
              <p style="margin: 5px 0;"><strong>Size:</strong> ${size}</p>
            </div>
          `
              : `
            <p style="color: #4b5563;">Your database backup has failed.</p>
            <div style="background: #fef2f2; padding: 15px; border-radius: 6px; border: 1px solid #fecaca;">
              <p style="color: #991b1b; margin: 0;"><strong>Error:</strong> ${error}</p>
            </div>
          `
          }
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px;">Sent from ServerManager</p>
        </div>
      </div>
    `,
  });
}

/**
 * Send login alert email
 */
async function sendLoginAlert({ username, ip, location, to }) {
  return sendMail({
    to,
    subject: '[ServerManager] New Login Detected',
    text: `A new login was detected for your account.\n\nUsername: ${username}\nIP Address: ${ip}\nLocation: ${location || 'Unknown'}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">New Login Detected</h1>
        </div>
        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="color: #4b5563;">A new login was detected for your account.</p>
          <div style="background: white; padding: 15px; border-radius: 6px; border: 1px solid #e5e7eb;">
            <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
            <p style="margin: 5px 0;"><strong>IP Address:</strong> ${ip}</p>
            <p style="margin: 5px 0;"><strong>Location:</strong> ${location || 'Unknown'}</p>
            <p style="margin: 5px 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p style="color: #6b7280; font-size: 14px; margin-top: 15px;">If this wasn't you, please change your password immediately.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px;">Sent from ServerManager</p>
        </div>
      </div>
    `,
  });
}

/**
 * Verify SMTP connection
 */
async function verifyConnection() {
  try {
    const transport = await getTransporter();
    await transport.verify();
    return { success: true, message: 'SMTP connection verified' };
  } catch (err) {
    logger.error('SMTP verification failed:', err);
    return { success: false, message: err.message };
  }
}

module.exports = {
  sendMail,
  sendTestMail,
  sendServerAlert,
  sendBackupNotification,
  sendLoginAlert,
  verifyConnection,
  clearSettingsCache,
  getMailSettings,
};
