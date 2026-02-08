exports.up = async function(knex) {
  // Create settings table for key-value storage
  await knex.schema.createTable('settings', (table) => {
    table.string('key').primary();
    table.text('value');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Create backups table
  await knex.schema.createTable('backups', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('filename').notNullable();
    table.string('filepath').notNullable();
    table.bigInteger('size').defaultTo(0);
    table.enum('status', ['pending', 'in_progress', 'completed', 'failed']).defaultTo('pending');
    table.integer('progress').defaultTo(0);
    table.text('error_message');
    table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');
  });

  // Create failed_logins table for Fail2Ban functionality
  await knex.schema.createTable('failed_logins', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('ip_address').notNullable();
    table.string('username');
    table.timestamp('attempted_at').defaultTo(knex.fn.now());
  });

  // Create ip_bans table
  await knex.schema.createTable('ip_bans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('ip_address').notNullable().unique();
    table.string('reason');
    table.timestamp('banned_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at');
    table.uuid('banned_by').references('id').inTable('users').onDelete('SET NULL');
  });

  // Insert default settings (batch insert for efficiency)
  const defaults = [
    { key: 'site_name', value: 'ServerManager' },
    { key: 'timezone', value: 'Europe/Berlin' },
    { key: 'date_format', value: 'DD.MM.YYYY' },
    { key: 'session_timeout', value: '30' },
    { key: 'two_factor_enabled', value: 'false' },
    { key: 'fail2ban_enabled', value: 'false' },
    { key: 'fail2ban_max_attempts', value: '5' },
    { key: 'fail2ban_ban_time', value: '600' },
    { key: 'ip_whitelist', value: '' },
    { key: 'smtp_host', value: '' },
    { key: 'smtp_port', value: '587' },
    { key: 'smtp_user', value: '' },
    { key: 'smtp_password', value: '' },
    { key: 'smtp_secure', value: 'true' },
    { key: 'mail_from', value: '' },
    { key: 'mail_from_name', value: 'ServerManager' },
    { key: 'auto_backup', value: 'false' },
    { key: 'backup_schedule', value: 'daily' },
    { key: 'retention_days', value: '30' },
    { key: 'backup_path', value: '/var/backups/servermanager' },
  ];

  await knex('settings').insert(defaults).onConflict('key').ignore();
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('ip_bans');
  await knex.schema.dropTableIfExists('failed_logins');
  await knex.schema.dropTableIfExists('backups');
  await knex.schema.dropTableIfExists('settings');
};
