exports.up = function (knex) {
  return knex.schema.createTable('servers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('hostname', 255).notNullable();
    table.string('display_name', 255);
    table.string('ip_address', 45).notNullable();
    table.enum('os_type', ['linux', 'windows']).notNullable();
    table.string('os_version', 100);
    table.text('description');
    table.enum('status', ['online', 'offline', 'maintenance', 'error']).defaultTo('offline');
    table.integer('ssh_port').defaultTo(22);
    table.integer('rdp_port').defaultTo(3389);
    table.text('ssh_credentials_encrypted').nullable();
    table.text('rdp_credentials_encrypted').nullable();
    table.text('ssh_private_key_encrypted').nullable();
    table.string('agent_api_key', 255).nullable();
    table.boolean('agent_installed').defaultTo(false);
    table.timestamp('last_seen').nullable();
    table.uuid('group_id').references('id').inTable('server_groups').onDelete('SET NULL');
    table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('servers');
};
