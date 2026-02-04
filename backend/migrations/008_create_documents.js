exports.up = function (knex) {
  return knex.schema
    .createTable('server_documents', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('server_id').notNullable().references('id').inTable('servers').onDelete('CASCADE');
      table.string('title', 255).notNullable();
      table.text('content');
      table.integer('version').defaultTo(1);
      table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);
    })
    .createTable('document_versions', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('document_id').notNullable().references('id').inTable('server_documents').onDelete('CASCADE');
      table.integer('version').notNullable();
      table.text('content');
      table.uuid('changed_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);
    })
    .createTable('document_attachments', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('document_id').notNullable().references('id').inTable('server_documents').onDelete('CASCADE');
      table.string('filename', 255).notNullable();
      table.string('original_name', 255).notNullable();
      table.string('mime_type', 100);
      table.bigInteger('file_size');
      table.string('file_path', 500).notNullable();
      table.uuid('uploaded_by').references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('document_attachments')
    .dropTableIfExists('document_versions')
    .dropTableIfExists('server_documents');
};
