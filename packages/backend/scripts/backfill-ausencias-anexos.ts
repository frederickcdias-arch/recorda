import dotenv from 'dotenv';
import pg from 'pg';
import { backfillAusenciasAnexos } from '../src/infrastructure/services/ausencias-anexos-backfill.js';

dotenv.config();

const {
  DATABASE_URL,
  DB_HOST = 'localhost',
  DB_PORT = '5433',
  DB_USER = 'recorda',
  DB_PASSWORD = 'recorda',
  DB_NAME = 'recorda',
} = process.env;

const client = DATABASE_URL?.trim()
  ? new pg.Client({ connectionString: DATABASE_URL.trim() })
  : new pg.Client({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
    });

async function main(): Promise<void> {
  await client.connect();
  const result = await backfillAusenciasAnexos(client, { log: (line) => console.log(line) });
  console.log(
    `Backfill concluído. Total: ${result.total}. Atualizados: ${result.updated}. Ignorados: ${result.skipped}.`
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
