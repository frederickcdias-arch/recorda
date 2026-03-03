#!/usr/bin/env node
import fs from 'fs';
import pg from 'pg';
import path from 'path';

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node apply-migration.js <migration-file-path>');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(migrationFile), 'utf-8');

const client = new pg.Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  user: process.env.DB_USER || 'recorda',
  password: process.env.DB_PASSWORD || 'recorda',
  database: process.env.DB_NAME || 'recorda',
});

(async () => {
  try {
    await client.connect();
    console.log(`Applying migration ${migrationFile}`);
    await client.query(sql);
    console.log('Migration applied successfully');
    await client.end();
  } catch (err) {
    console.error('Failed to apply migration:', err.message || err);
    process.exit(1);
  }
})();
