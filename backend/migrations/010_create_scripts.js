exports.up = function (knex) {
  return knex.schema
    .createTable('global_scripts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name').notNullable();
      table.text('description');
      table.text('content').notNullable();
      table.string('language').defaultTo('bash'); // bash, python, powershell
      table.jsonb('tags').defaultTo('[]');
      table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);
    })
    .createTable('script_executions', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('script_id').references('id').inTable('global_scripts').onDelete('CASCADE');
      table.uuid('server_id').references('id').inTable('servers').onDelete('CASCADE');
      table.uuid('executed_by').references('id').inTable('users').onDelete('SET NULL');
      table.string('status').defaultTo('pending'); // pending, running, completed, failed
      table.integer('exit_code');
      table.text('output');
      table.text('error_output');
      table.timestamp('started_at');
      table.timestamp('completed_at');
      table.timestamps(true, true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('script_executions')
    .dropTableIfExists('global_scripts');
};
