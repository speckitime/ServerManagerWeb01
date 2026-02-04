exports.up = function (knex) {
  return knex.schema.createTable('server_metrics', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('server_id').notNullable().references('id').inTable('servers').onDelete('CASCADE');
    table.float('cpu_usage');
    table.bigInteger('ram_total');
    table.bigInteger('ram_used');
    table.float('ram_usage_percent');
    table.jsonb('disk_partitions');
    table.bigInteger('network_rx_bytes');
    table.bigInteger('network_tx_bytes');
    table.float('load_avg_1');
    table.float('load_avg_5');
    table.float('load_avg_15');
    table.integer('process_count');
    table.jsonb('top_processes');
    table.bigInteger('uptime_seconds');
    table.timestamp('recorded_at').defaultTo(knex.fn.now());

    table.index(['server_id', 'recorded_at']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('server_metrics');
};
