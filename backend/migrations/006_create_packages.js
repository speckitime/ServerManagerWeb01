exports.up = function (knex) {
  return knex.schema
    .createTable('server_packages', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('server_id').notNullable().references('id').inTable('servers').onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.string('version', 100);
      table.string('description', 500);
      table.string('available_update', 100).nullable();
      table.timestamp('last_checked').defaultTo(knex.fn.now());
      table.timestamps(true, true);

      table.unique(['server_id', 'name']);
    })
    .createTable('update_history', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('server_id').notNullable().references('id').inTable('servers').onDelete('CASCADE');
      table.string('package_name', 255);
      table.string('from_version', 100);
      table.string('to_version', 100);
      table.enum('status', ['pending', 'running', 'completed', 'failed']).defaultTo('pending');
      table.text('log_output');
      table.uuid('initiated_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('started_at');
      table.timestamp('completed_at');
      table.timestamps(true, true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('update_history')
    .dropTableIfExists('server_packages');
};
