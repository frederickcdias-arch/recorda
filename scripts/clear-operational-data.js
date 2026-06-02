#!/usr/bin/env node
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

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

const config = {
  host: DB_HOST,
  port: Number(process.env.DB_PORT || 5433),
  user: process.env.DB_USER || 'recorda',
  password: DB_PASSWORD,
  database: process.env.DB_NAME || 'recorda',
};

async function clearData() {
  const confirm = process.env.CONFIRM_CLEAR;
  if (confirm !== 'LIMPAR_OPERACIONAL') {
    console.error(
      'Operação cancelada: confirmação não fornecida.\n' +
      'Para executar, defina CONFIRM_CLEAR=LIMPAR_OPERACIONAL:\n' +
      '  CONFIRM_CLEAR=LIMPAR_OPERACIONAL node scripts/clear-operational-data.js\n' +
      '\nATENÇÃO: este script executa TRUNCATE CASCADE nas tabelas operacionais.\n' +
      'Use apenas em ambiente de desenvolvimento ou com aprovação formal.'
    );
    process.exit(1);
  }

  const client = new pg.Client(config);
  try {
    await client.connect();
    console.log('Connected to database');

    const tables = ['registros_producao', 'registros_importados', 'importacoes'];

    for (const table of tables) {
      try {
        await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
        console.log(`Cleared table: ${table}`);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('relation') &&
          error.message.includes('does not exist')
        ) {
          console.warn(`Table ${table} not found, skipping.`);
        } else {
          throw error;
        }
      }
    }

    console.log('Operational data cleared successfully');
  } catch (error) {
    console.error('Failed to clear data:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

clearData();
