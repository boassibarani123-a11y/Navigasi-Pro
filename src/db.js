const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
module.exports = { pool, query: (text, params) => pool.query(text, params) };
