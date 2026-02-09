exports.up = function (knex) {
  return knex.schema.alterTable('server_metrics', (table) => {
    // Network interface details
    table.jsonb('network_interfaces').nullable();
    // Network traffic rates (bytes per second)
    table.bigInteger('network_rx_rate').nullable();
    table.bigInteger('network_tx_rate').nullable();
    // Disk I/O
    table.bigInteger('disk_read_bytes').nullable();
    table.bigInteger('disk_write_bytes').nullable();
    table.integer('disk_read_iops').nullable();
    table.integer('disk_write_iops').nullable();
    // SMART disk data
    table.jsonb('disk_smart').nullable();
    // Temperature sensors
    table.jsonb('temperatures').nullable();
    // Swap memory
    table.bigInteger('swap_total').nullable();
    table.bigInteger('swap_used').nullable();
    table.float('swap_usage_percent').nullable();
    // CPU details
    table.jsonb('cpu_cores').nullable();
    table.float('cpu_freq_current').nullable();
    table.float('cpu_freq_max').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('server_metrics', (table) => {
    table.dropColumn('network_interfaces');
    table.dropColumn('network_rx_rate');
    table.dropColumn('network_tx_rate');
    table.dropColumn('disk_read_bytes');
    table.dropColumn('disk_write_bytes');
    table.dropColumn('disk_read_iops');
    table.dropColumn('disk_write_iops');
    table.dropColumn('disk_smart');
    table.dropColumn('temperatures');
    table.dropColumn('swap_total');
    table.dropColumn('swap_used');
    table.dropColumn('swap_usage_percent');
    table.dropColumn('cpu_cores');
    table.dropColumn('cpu_freq_current');
    table.dropColumn('cpu_freq_max');
  });
};
