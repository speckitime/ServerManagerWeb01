exports.up = function (knex) {
  return knex.schema
    .createTable('ssh_identities', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name').notNullable();
      table.text('description').nullable();
      table.string('key_type').notNullable().defaultTo('ed25519'); // rsa, ed25519, ecdsa
      table.integer('key_bits').nullable(); // 2048, 4096 for RSA
      table.text('public_key').notNullable();
      table.text('private_key_encrypted').notNullable(); // encrypted private key
      table.boolean('has_passphrase').defaultTo(false);
      table.text('passphrase_encrypted').nullable(); // optional encrypted passphrase
      table.text('fingerprint').nullable(); // SHA256 fingerprint for display
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);
    })
    .alterTable('servers', (table) => {
      table.uuid('ssh_identity_id').nullable().references('id').inTable('ssh_identities').onDelete('SET NULL');
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable('servers', (table) => {
      table.dropColumn('ssh_identity_id');
    })
    .dropTableIfExists('ssh_identities');
};
