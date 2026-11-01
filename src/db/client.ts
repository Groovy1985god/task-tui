import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export function connectDatabase(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
  });
  pool.on('error', (error) =>
    console.error('PostgreSQL pool error:', error.message),
  );
  return { pool, db: drizzle(pool, { schema }) };
}

export type Database = ReturnType<typeof connectDatabase>['db'];
