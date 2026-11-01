import { createServer } from 'node:http';
import { databaseUrl, serverConfig } from '../config.ts';
import { connectDatabase } from '../db/client.ts';
import { createStore } from '../db/store.ts';
import { createApi } from './api.ts';

try {
  const { db, pool } = connectDatabase(databaseUrl());
  const store = createStore(db);
  const server = createServer(
    { requestTimeout: 15_000, headersTimeout: 10_000 },
    createApi(store),
  );
  const { host, port } = serverConfig();
  try {
    await store.health();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    console.log(`Taskink API listening on http://${host}:${port}`);
    let closing = false;
    const shutdown = () => {
      if (closing) return;
      closing = true;
      const forceClose = setTimeout(() => server.closeAllConnections(), 5000);
      forceClose.unref();
      server.close(() => {
        clearTimeout(forceClose);
        void pool.end();
      });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    await pool.end();
    throw error;
  }
} catch (error) {
  console.error(
    'Could not start Task-tui:',
    error instanceof Error ? error.message : error,
  );
  console.error(
    'Check DATABASE_URL, start PostgreSQL, and run npm run db:migrate.',
  );
  process.exitCode = 1;
}
