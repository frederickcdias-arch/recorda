#!/usr/bin/env node
const dotenv = require('dotenv');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

dotenv.config();

const EMAIL = process.env.ADMIN_EMAIL || 'admin@recorda.local';
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) {
  console.error(
    'ERRO: ADMIN_PASSWORD não definido.\n' +
    'Defina via variável de ambiente antes de executar este script.\n' +
    'Exemplo: ADMIN_PASSWORD="senha_forte_aqui" node scripts/create-admin-user.js'
  );
  process.exit(1);
}
const NOME = process.env.ADMIN_NAME || 'Administrador';
const PERFIL = process.env.ADMIN_ROLE || 'administrador';
const DB_HOST = process.env.DB_HOST || 'localhost';

ensureSafeDbHost(DB_HOST);

function ensureSafeDbHost(hostname) {
  const normalized = hostname.trim().toLowerCase();
  const isLocalHost =
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === 'recorda-db';
  const allowRemote = (process.env.ADMIN_SCRIPT_ALLOW_REMOTE_DB || '').trim().toLowerCase() === 'true';
  if (!isLocalHost && !allowRemote) {
    console.error(
      'ERRO: este script parece apontar para banco remoto. Defina ADMIN_SCRIPT_ALLOW_REMOTE_DB=true se tiver certeza.'
    );
    process.exit(1);
  }
}

const client = new Client({
  host: DB_HOST,
  port: Number(process.env.DB_PORT || 5433),
  user: process.env.DB_USER || 'recorda',
  password: process.env.DB_PASSWORD || 'recorda',
  database: process.env.DB_NAME || 'recorda',
});

(async () => {
  try {
    await client.connect();
    console.log('Connected to database');

    const existing = await client.query('SELECT id FROM usuarios WHERE email = $1', [EMAIL.toLowerCase()]);

    if (existing.rows.length > 0) {
      console.log(`Usuário com e-mail ${EMAIL} já existe (id: ${existing.rows[0].id}). Nada a fazer.`);
      process.exit(0);
    }

    const senhaHash = await bcrypt.hash(PASSWORD, 10);

    const insert = await client.query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nome, email, perfil`,
      [NOME, EMAIL.toLowerCase(), senhaHash, PERFIL]
    );

    const novo = insert.rows[0];
    console.log('Usuário criado com sucesso:', novo);
  } catch (error) {
    console.error('Falha ao criar usuário:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
