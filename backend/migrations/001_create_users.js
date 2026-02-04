exports.up = function (knex) {
  return knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('username', 100).notNullable().unique();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('full_name', 200);
    table.enum('role', ['admin', 'user', 'readonly']).defaultTo('user');
    table.boolean('is_active').defaultTo(true);
    table.string('totp_secret', 255).nullable();
    table.boolean('totp_enabled').defaultTo(false);
    table.string('language', 5).defaultTo('en');
    table.string('theme', 10).defaultTo('dark');
    table.timestamp('last_login').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('users');
};
