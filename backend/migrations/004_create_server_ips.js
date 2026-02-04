exports.up = function (knex) {
  return knex.schema.createTable('server_ips', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('server_id').notNullable().references('id').inTable('servers').onDelete('CASCADE');
    table.string('ip_address', 45).notNullable();
    table.enum('type', ['ipv4', 'ipv6']).defaultTo('ipv4');
    table.boolean('is_primary').defaultTo(false);
    table.string('label', 100);
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('server_ips');
};
