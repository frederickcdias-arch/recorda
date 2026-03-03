#!/usr/bin/env node

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  user: process.env.DB_USER || 'recorda',
  password: process.env.DB_PASSWORD || 'recorda',
  database: 'postgres',
};

const targetDatabase = process.env.DB_NAME || 'recorda';

async function bootstrap() {
  const client = new pg.Client(config);

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    const result = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDatabase]
    );

    if (result.rows.length === 0) {
      console.log(`Creating database: ${targetDatabase}`);
      await client.query(`CREATE DATABASE ${targetDatabase}`);
      console.log(`Database ${targetDatabase} created successfully`);
    } else {
      console.log(`Database ${targetDatabase} already exists`);
    }

    await client.end();

    const dbClient = new pg.Client({
      ...config,
      database: targetDatabase,
    });

    await dbClient.connect();
    console.log(`Connected to ${targetDatabase}`);

    // Garantir infraestrutura mínima de migrações antes de checar versões aplicadas.
    await dbClient.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const appliedResult = await dbClient.query(`SELECT version FROM schema_migrations`);
    const appliedMigrations = new Set(appliedResult.rows.map((row) => row.version));

    const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const version = file.replace(/\.sql$/i, '');
      if (appliedMigrations.has(version)) {
        console.log(`Skipping migration already applied: ${file}`);
        continue;
      }

      const migrationPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(migrationPath, 'utf-8');

      console.log(`Applying migration: ${file}`);
      await dbClient.query(sql);
      await dbClient.query(
        `INSERT INTO schema_migrations (version)
         VALUES ($1)
         ON CONFLICT (version) DO NOTHING`,
        [version]
      );
      appliedMigrations.add(version);
      console.log(`Migration ${file} applied successfully`);
    }

    await dbClient.end();
    console.log('Bootstrap completed successfully');
  } catch (error) {
    console.error('Bootstrap failed:', error.message);
    process.exit(1);
  }
}

bootstrap();
