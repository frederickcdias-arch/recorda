import pg from 'pg';
import type { DatabaseConfig } from '../config/index.js';

const { Pool } = pg;

export interface DatabaseConnection {
  pool: pg.Pool;
  query: <T extends pg.QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<pg.QueryResult<T>>;
  healthCheck: () => Promise<boolean>;
  close: () => Promise<void>;
}

export interface DatabaseLogger {
  error: (msg: string, err?: unknown) => void;
}

export async function createDatabaseConnection(
  config: DatabaseConfig,
  logger: DatabaseLogger = { error: (msg, err) => process.stderr.write(`${msg} ${String(err)}\n`) }
): Promise<DatabaseConnection> {
  const isProduction = process.env.NODE_ENV === 'production';
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ...(isProduction &&
      process.env.DB_SSL !== 'false' && {
        ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
      }),
  });

  pool.on('error', (err: Error) => {
    logger.error('Unexpected error on idle pg client', err);
  });

  const connection: DatabaseConnection = {
    pool,
    query: async <T extends pg.QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<pg.QueryResult<T>> => {
      return pool.query<T>(text, params);
    },
    healthCheck: async (): Promise<boolean> => {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    close: async (): Promise<void> => {
      await pool.end();
    },
  };

  return connection;
}
