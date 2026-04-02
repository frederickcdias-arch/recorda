const bcrypt = require('bcryptjs');
const pg = require('pg');

async function createAdmin() {
  const client = new pg.Client({
    host: 'localhost',
    port: 5433,
    user: 'recorda',
    password: 'recorda',
    database: 'recorda',
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Hash da senha "password123"
    const senha = 'password123';
    const senhaHash = await bcrypt.hash(senha, 10);
    
    console.log('Hash gerado:', senhaHash);

    // Deletar usuário existente
    await client.query("DELETE FROM usuarios WHERE email = 'admin@recorda.com'");
    console.log('Usuário anterior deletado');

    // Inserir novo usuário
    const result = await client.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, perfil, ativo, criado_em, atualizado_em) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING id, email`,
      ['550e8400-e29b-41d4-a716-446655440000', 'Administrador', 'admin@recorda.com', senhaHash, 'administrador', true]
    );

    console.log('Usuário criado:', result.rows[0]);

    // Verificar
    const verify = await client.query("SELECT email, length(senha_hash) as hash_length FROM usuarios WHERE email = 'admin@recorda.com'");
    console.log('Verificação:', verify.rows[0]);

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await client.end();
  }
}

createAdmin();
