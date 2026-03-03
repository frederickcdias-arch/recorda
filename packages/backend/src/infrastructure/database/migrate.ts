import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import { logger } from '../logging/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const {
  DB_HOST = 'localhost',
  DB_PORT = '5433',
  DB_USER = 'recorda',
  DB_PASSWORD = 'recorda',
  DB_NAME = 'recorda',
} = process.env;

const migrationsDir = path.resolve(__dirname, '../../../../../db/migrations');
const baselineDir = path.resolve(__dirname, '../../../../../db/baseline');

async function ensureMigrationsTable(client: pg.Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function extractVersion(filename: string): string {
  return filename.replace(/\.sql$/i, '');
}

async function runMigrations() {
  const client = new pg.Client({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });

  try {
    await client.connect();
    logger.info('Connected to database', { component: 'migrate' });

    await ensureMigrationsTable(client);

    const appliedResult = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations'
    );
    const appliedVersions = new Set(appliedResult.rows.map(row => row.version));

    // Apply baseline if no migrations have been applied and baseline exists
    if (appliedVersions.size === 0 && fs.existsSync(baselineDir)) {
      const baselineFiles = fs
        .readdirSync(baselineDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      if (baselineFiles.length > 0) {
        logger.info('No migrations applied — applying baseline...', { component: 'migrate' });
        for (const file of baselineFiles) {
          const sql = fs.readFileSync(path.join(baselineDir, file), 'utf-8');
          logger.info(`Applying baseline ${file}`, { component: 'migrate' });
          try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('COMMIT');
            logger.info(`Baseline ${file} applied`, { component: 'migrate' });
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          }
        }

        // Refresh applied versions after baseline
        const refreshed = await client.query<{ version: string }>(
          'SELECT version FROM schema_migrations'
        );
        for (const row of refreshed.rows) {
          appliedVersions.add(row.version);
        }
        logger.info(`Baseline applied (${appliedVersions.size} versions registered)`, { component: 'migrate' });
      }
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = extractVersion(file);
      if (appliedVersions.has(version)) {
        logger.info(`Skipping ${file} (already applied)`, { component: 'migrate' });
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      logger.info(`Applying migration ${file}`, { component: 'migrate' });

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
          [version]
        );
        await client.query('COMMIT');
        logger.info(`Migration ${file} applied`, { component: 'migrate' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    logger.info('All migrations processed', { component: 'migrate' });
  } catch (error) {
    logger.error('Migration failed', { component: 'migrate', error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void runMigrations();
