import { Pool, PoolConfig } from 'pg';

const config: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'docbridge',
  user: process.env.DB_USER || 'docbridge',
  password: process.env.DB_PASSWORD || 'docbridge',
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

export const pool = new Pool(config);

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

/**
 * Run a single query against the pool.
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

/**
 * Gracefully close the pool (for tests and shutdown).
 */
export async function closePool(): Promise<void> {
  await pool.end();
}
