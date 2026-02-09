import { Pool } from 'pg';

// Neon (and most cloud Postgres) require SSL; allow config via env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
  execute: (text: string, params?: any[]) => pool.query(text, params),
  getPool: () => pool,
};
