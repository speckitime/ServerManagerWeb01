exports.up = function (knex) {
  return knex.schema
    .createTable('alert_rules', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('server_id').nullable().references('id').inTable('servers').onDelete('CASCADE');
      table.uuid('group_id').nullable().references('id').inTable('server_groups').onDelete('CASCADE');
      table.string('name').notNullable();
      table.string('metric').notNullable(); // cpu_usage, ram_usage_percent, disk_usage, etc.
      table.string('condition').notNullable(); // gt, lt, eq, gte, lte
      table.float('threshold').notNullable();
      table.integer('duration_seconds').defaultTo(60); // How long condition must be true
      table.string('severity').defaultTo('warning'); // info, warning, critical
      table.boolean('is_active').defaultTo(true);
      table.boolean('notify_email').defaultTo(true);
      table.boolean('notify_webhook').defaultTo(false);
      table.text('webhook_url').nullable();
      table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);
    })
    .createTable('alerts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('rule_id').notNullable().references('id').inTable('alert_rules').onDelete('CASCADE');
      table.uuid('server_id').notNullable().references('id').inTable('servers').onDelete('CASCADE');
      table.string('metric').notNullable();
      table.float('value').notNullable();
      table.float('threshold').notNullable();
      table.string('severity').notNullable();
      table.string('status').defaultTo('active'); // active, acknowledged, resolved
      table.text('message');
      table.uuid('acknowledged_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('acknowledged_at').nullable();
      table.timestamp('resolved_at').nullable();
      table.timestamp('triggered_at').defaultTo(knex.fn.now());
      table.timestamps(true, true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('alerts')
    .dropTableIfExists('alert_rules');
};
