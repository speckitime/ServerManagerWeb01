exports.up = function (knex) {
  return knex.schema
    .createTable('user_servers', (table) => {
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('server_id').notNullable().references('id').inTable('servers').onDelete('CASCADE');
      table.primary(['user_id', 'server_id']);
      table.timestamps(true, true);
    })
    .createTable('activity_logs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
      table.uuid('server_id').references('id').inTable('servers').onDelete('SET NULL');
      table.string('action', 100).notNullable();
      table.text('details');
      table.string('ip_address', 45);
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['user_id', 'created_at']);
      table.index(['server_id', 'created_at']);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('activity_logs')
    .dropTableIfExists('user_servers');
};
