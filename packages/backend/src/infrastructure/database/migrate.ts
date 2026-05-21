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
  DATABASE_URL,
  DB_HOST = 'localhost',
  DB_PORT = '5433',
  DB_USER = 'recorda',
  DB_PASSWORD = 'recorda',
  DB_NAME = 'recorda',
} = process.env;

const migrationsDir = path.resolve(__dirname, '../../../../../db/migrations');

const MIGRATION_VERSION_ALIASES: Record<string, string[]> = {
  '074a_cq_avaliacoes_aceitar_apensos': ['074_cq_avaliacoes_aceitar_apensos'],
};

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

function isMigrationApplied(version: string, appliedVersions: Set<string>): boolean {
  const versionsToCheck = [version, ...(MIGRATION_VERSION_ALIASES[version] ?? [])];
  return versionsToCheck.some((candidate) => appliedVersions.has(candidate));
}

async function runMigrations() {
  const client = DATABASE_URL?.trim()
    ? new pg.Client({ connectionString: DATABASE_URL.trim() })
    : new pg.Client({
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
    const appliedVersions = new Set(appliedResult.rows.map((row) => row.version));

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    logger.info('Running migrations from db/migrations only', {
      component: 'migrate',
      discovered: files.length,
    });

    for (const file of files) {
      const version = extractVersion(file);
      if (isMigrationApplied(version, appliedVersions)) {
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
    logger.error('Migration failed', {
      component: 'migrate',
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void runMigrations();
