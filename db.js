import pg from 'pg';
const { Pool } = pg;

let pool = null;

/**
 * Returns/Creates the PostgreSQL connection pool.
 */
function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    const config = {
      connectionString,
    };

    // Heroku Postgres requires SSL connections.
    // We check if we are in production (DATABASE_URL is set) to enable SSL.
    if (connectionString) {
      config.ssl = {
        rejectUnauthorized: false,
      };
    } else {
      // Fallback for local development
      config.connectionString = 'postgresql://postgres:postgres@localhost:5432/gitsocial';
    }

    pool = new Pool(config);
  }
  return pool;
}

/**
 * Executes a PostgreSQL query.
 * @param {string} text
 * @param {any[]} [params]
 */
export async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}

/**
 * Initializes the database schema.
 */
export async function initDb() {
  // We use double quotes for "imageUrl" to preserve camelCase in PostgreSQL
  await query(`
    CREATE TABLE IF NOT EXISTS posts (
      id VARCHAR(255) PRIMARY KEY,
      "imageUrl" TEXT NOT NULL,
      caption TEXT,
      author VARCHAR(255) DEFAULT 'Anonymous',
      timestamp BIGINT NOT NULL,
      likes INTEGER DEFAULT 0,
      type VARCHAR(50) NOT NULL
    );
  `);
}
