import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { databaseUrl } from '../config.ts';
import { connectDatabase } from './client.ts';

const { db, pool } = connectDatabase(databaseUrl());
try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle/', import.meta.url)),
  });
  console.log('Database migrations applied.');
} catch (error) {
  console.error(
    'Migration failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
