const fs = require('fs');
const pg = require('pg');

async function applyMigration() {
  const client = new pg.Client({
    host: 'localhost',
    port: 5433,
    user: 'recorda',
    password: 'recorda',
    database: 'recorda',
  });

  try {
    await client.connect();
    console.log('Conectado ao banco de dados');

    const sql = fs.readFileSync('c:\\projects\\recorda\\db\\migrations\\074_gestao_pessoas.sql', 'utf8');
    
    console.log('Aplicando migration de Gestão de Pessoas...');
    await client.query(sql);
    
    console.log('✅ Migration aplicada com sucesso!');
    
    // Registrar na tabela de migrations
    await client.query(
      `INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT (version) DO NOTHING`,
      ['074_gestao_pessoas.sql']
    );
    
    console.log('✅ Migration registrada');

  } catch (error) {
    console.error('❌ Erro ao aplicar migration:');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
