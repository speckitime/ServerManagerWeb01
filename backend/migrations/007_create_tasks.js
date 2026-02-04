exports.up = function (knex) {
  return knex.schema
    .createTable('scheduled_tasks', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('server_id').notNullable().references('id').inTable('servers').onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.text('description');
      table.enum('type', ['update', 'reboot', 'script']).notNullable();
      table.string('cron_expression', 100).notNullable();
      table.text('script_content').nullable();
      table.boolean('is_active').defaultTo(true);
      table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('last_run').nullable();
      table.timestamp('next_run').nullable();
      table.timestamps(true, true);
    })
    .createTable('task_logs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('task_id').notNullable().references('id').inTable('scheduled_tasks').onDelete('CASCADE');
      table.uuid('server_id').notNullable().references('id').inTable('servers').onDelete('CASCADE');
      table.enum('status', ['running', 'completed', 'failed']).notNullable();
      table.text('output');
      table.timestamp('started_at').defaultTo(knex.fn.now());
      table.timestamp('completed_at').nullable();
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('task_logs')
    .dropTableIfExists('scheduled_tasks');
};
