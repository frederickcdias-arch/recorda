#!/usr/bin/env node
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5433),
  user: process.env.DB_USER || 'recorda',
  password: process.env.DB_PASSWORD || 'recorda',
  database: process.env.DB_NAME || 'recorda',
};

async function clearData() {
  const client = new pg.Client(config);
  try {
    await client.connect();
    console.log('Connected to database');

    const tables = [
      'registros_producao',
      'registros_importados',
      'importacoes',
    ];

    for (const table of tables) {
      try {
        await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
        console.log(`Cleared table: ${table}`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('relation') && error.message.includes('does not exist')) {
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
