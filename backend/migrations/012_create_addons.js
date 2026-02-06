exports.up = function(knex) {
  return knex.schema
    .createTable('addons', (table) => {
      table.increments('id').primary();
      table.string('slug', 50).unique().notNullable(); // e.g., 'cloudflare-tunnel', 'wireguard'
      table.string('name', 100).notNullable();
      table.text('description');
      table.string('version', 20).defaultTo('1.0.0');
      table.string('author', 100).defaultTo('System');
      table.string('icon', 50); // icon name or emoji
      table.string('category', 50).defaultTo('integration'); // integration, security, monitoring, etc.
      table.boolean('is_enabled').defaultTo(true); // global enable/disable
      table.json('default_config'); // default configuration template
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
    .createTable('server_addons', (table) => {
      table.increments('id').primary();
      table.uuid('server_id').notNullable()
        .references('id').inTable('servers').onDelete('CASCADE');
      table.integer('addon_id').unsigned().notNullable()
        .references('id').inTable('addons').onDelete('CASCADE');
      table.boolean('is_enabled').defaultTo(true);
      table.json('config'); // server-specific configuration
      table.string('status', 20).defaultTo('inactive'); // inactive, active, error
      table.text('status_message');
      table.timestamp('last_checked');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['server_id', 'addon_id']);
    })
    .then(() => {
      // Insert default addons
      return knex('addons').insert([
        {
          slug: 'cloudflare-tunnel',
          name: 'Cloudflare Tunnel',
          description: 'Manage Cloudflare Tunnel (cloudflared) connections. Expose services securely without opening ports.',
          version: '1.0.0',
          author: 'System',
          icon: '☁️',
          category: 'networking',
          is_enabled: true,
          default_config: JSON.stringify({
            service_name: 'cloudflared',
            config_path: '/etc/cloudflared',
            tunnel_name: ''
          })
        },
        {
          slug: 'wireguard',
          name: 'WireGuard VPN',
          description: 'Manage WireGuard VPN configurations. View peers, status, and transfer statistics.',
          version: '1.0.0',
          author: 'System',
          icon: '🔐',
          category: 'networking',
          is_enabled: true,
          default_config: JSON.stringify({
            interface: 'wg0',
            config_path: '/etc/wireguard'
          })
        },
        {
          slug: 'docker',
          name: 'Docker Containers',
          description: 'View and manage Docker containers, images, and networks on the server.',
          version: '1.0.0',
          author: 'System',
          icon: '🐳',
          category: 'container',
          is_enabled: true,
          default_config: JSON.stringify({
            socket_path: '/var/run/docker.sock'
          })
        },
        {
          slug: 'nginx-proxy-manager',
          name: 'Nginx Proxy Manager',
          description: 'View Nginx Proxy Manager hosts and SSL certificates.',
          version: '1.0.0',
          author: 'System',
          icon: '🌐',
          category: 'networking',
          is_enabled: false,
          default_config: JSON.stringify({
            api_url: '',
            api_token: ''
          })
        },
        {
          slug: 'fail2ban',
          name: 'Fail2Ban',
          description: 'Monitor Fail2Ban jails, banned IPs, and security events.',
          version: '1.0.0',
          author: 'System',
          icon: '🛡️',
          category: 'security',
          is_enabled: true,
          default_config: JSON.stringify({
            client_path: '/usr/bin/fail2ban-client'
          })
        }
      ]);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('server_addons')
    .dropTableIfExists('addons');
};
