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
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PASSWORD = requireEnv('DB_PASSWORD');

ensureSafeDbHost(DB_HOST);

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (value) return value;
  throw new Error(`Defina ${name} antes de executar este script.`);
}

function ensureSafeDbHost(hostname) {
  const normalized = hostname.trim().toLowerCase();
  const isLocalHost =
    normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
  const allowRemote = (process.env.DB_ALLOW_REMOTE || '').trim().toLowerCase() === 'true';
  if (!isLocalHost && !allowRemote) {
    throw new Error(
      'Este script parece apontar para banco remoto. Defina DB_ALLOW_REMOTE=true se tiver certeza.'
    );
  }
}

const client = new pg.Client({
  host: DB_HOST,
  port: parseInt(process.env.DB_PORT || '5433', 10),
  user: process.env.DB_USER || 'recorda',
  password: DB_PASSWORD,
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
