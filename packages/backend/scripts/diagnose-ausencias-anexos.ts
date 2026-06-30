import dotenv from 'dotenv';
import pg from 'pg';
import { serveAusenciaAnexo } from '../src/infrastructure/services/file-storage.js';

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

interface AusenciaLegacyRow {
  id: string;
  documento_anexo: string;
  data_inicio: string;
  data_fim: string;
  colaborador_nome: string;
  tipo_ausencia_nome: string;
}

async function main(): Promise<void> {
  await client.connect();

  const result = await client.query<AusenciaLegacyRow>(`
    SELECT
      a.id,
      a.documento_anexo,
      a.data_inicio::text,
      a.data_fim::text,
      u.nome AS colaborador_nome,
      ta.nome AS tipo_ausencia_nome
    FROM ausencias a
    JOIN usuarios u ON u.id = a.usuario_id
    JOIN tipos_ausencia ta ON ta.id = a.tipo_ausencia_id
    WHERE a.documento_anexo IS NOT NULL
      AND a.documento_anexo <> ''
      AND a.documento_anexo NOT ILIKE 'data:%'
    ORDER BY u.nome, a.data_inicio, a.data_fim, a.criado_em
  `);

  const resolvidos: Array<{
    id: string;
    colaborador: string;
    periodo: string;
    tipo: string;
    filename: string;
    mimeType: string;
  }> = [];
  const inconsistentes: Array<{
    id: string;
    colaborador: string;
    periodo: string;
    tipo: string;
    valor: string;
    motivo: string;
  }> = [];

  for (const row of result.rows) {
    try {
      const resolved = await serveAusenciaAnexo(row.documento_anexo);
      resolvidos.push({
        id: row.id,
        colaborador: row.colaborador_nome,
        periodo: `${row.data_inicio} a ${row.data_fim}`,
        tipo: row.tipo_ausencia_nome,
        filename: resolved.filename,
        mimeType: resolved.mimeType,
      });
    } catch (error) {
      inconsistentes.push({
        id: row.id,
        colaborador: row.colaborador_nome,
        periodo: `${row.data_inicio} a ${row.data_fim}`,
        tipo: row.tipo_ausencia_nome,
        valor: row.documento_anexo,
        motivo: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(`Total legados analisados: ${result.rows.length}`);
  console.log(`Resolvidos pelo backend atual: ${resolvidos.length}`);
  console.log(`Ainda inconsistentes: ${inconsistentes.length}`);

  if (inconsistentes.length > 0) {
    console.log('\nRegistros inconsistentes:');
    for (const item of inconsistentes) {
      console.log(`- id: ${item.id}`);
      console.log(`  colaborador: ${item.colaborador}`);
      console.log(`  periodo: ${item.periodo}`);
      console.log(`  tipo: ${item.tipo}`);
      console.log(`  motivo: ${item.motivo}`);
      console.log(`  documento_anexo: ${item.valor}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
