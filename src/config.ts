import { loadEnvFile } from 'node:process';

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

export function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value)
    throw new Error(
      'DATABASE_URL is missing. Copy .env.example to .env and configure PostgreSQL.',
    );
  if (!/^postgres(?:ql)?:\/\//u.test(value))
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  return value;
}

export function serverConfig() {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer between 1 and 65535.');
  return { port, host: process.env.HOST ?? '127.0.0.1' };
}
