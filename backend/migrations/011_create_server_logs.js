exports.up = function(knex) {
  return knex.schema.createTable('server_log_paths', (table) => {
    table.increments('id').primary();
    table.integer('server_id').unsigned().notNullable()
      .references('id').inTable('servers').onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.string('path', 500).notNullable();
    table.string('category', 50).defaultTo('custom'); // system, application, custom
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['server_id', 'path']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('server_log_paths');
};
