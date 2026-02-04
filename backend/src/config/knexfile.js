require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'servermanager',
      user: process.env.DB_USER || 'servermanager',
      password: process.env.DB_PASSWORD || 'password',
    },
    pool: { min: 2, max: 10 },
    migrations: {
      directory: '../../migrations',
      tableName: 'knex_migrations',
    },
  },
  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
    pool: { min: 2, max: 20 },
    migrations: {
      directory: '../../migrations',
      tableName: 'knex_migrations',
    },
  },
};
