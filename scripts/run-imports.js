#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const API_BASE = process.env.IMPORT_API_BASE || 'http://localhost:3000';
const IMPORT_EMAIL = process.env.IMPORT_EMAIL || 'admin@recorda.local';
const IMPORT_PASSWORD = requireEnv('IMPORT_PASSWORD');
const FILES = [
  '1 - Recebimento - Produção.csv',
  '2 - Preparação.xlsx',
  '3 - Digitalização.xlsx',
  '4 - Conferência.xlsx',
  '5 - Reconferência.xlsx',
  '6 - Montagem.xlsx',
];

const MAP = {
  colaborador: 'Colaborador',
  etapa: 'Função',
  quantidade: 'Quantidade',
  data: 'Data',
  coordenadoria: 'Coordenadoria',
  processo: 'Repositório',
  observacao: 'Tipo',
};

ensureSafeBaseUrl(API_BASE, 'IMPORT_ALLOW_REMOTE');

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (value) return value;
  throw new Error(`Defina ${name} antes de executar este script.`);
}

function ensureSafeBaseUrl(baseUrl, allowRemoteEnv) {
  const parsed = new URL(baseUrl);
  const host = parsed.hostname.toLowerCase();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const allowRemote = process.env[allowRemoteEnv]?.trim().toLowerCase() === 'true';
  if (!isLocalHost && !allowRemote) {
    throw new Error(
      `Este script parece apontar para ambiente remoto. Defina ${allowRemoteEnv}=true se tiver certeza.`
    );
  }
}

async function login() {
  const body = { email: IMPORT_EMAIL, senha: IMPORT_PASSWORD };
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.accessToken;
}

async function importFile(token, filePath) {
  const buffer = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append('arquivo', new Blob([buffer]), path.basename(filePath));
  formData.append('mapeamento', JSON.stringify(MAP));

  const res = await fetch(`${API_BASE}/producao/importar-arquivo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const text = await res.text();
  return { status: res.status, body: text };
}

(async () => {
  try {
    const token = await login();
    for (const relative of FILES) {
      const filePath = path.resolve(process.cwd(), relative);
      if (!fs.existsSync(filePath)) {
        console.warn(`Arquivo não encontrado: ${filePath}`);
        continue;
      }
      console.log(`\nImportando ${filePath}...`);
      const result = await importFile(token, filePath);
      console.log(`Status: ${result.status}`);
      console.log(result.body);
    }
  } catch (err) {
    console.error('Erro ao executar importações:', err);
    process.exit(1);
  }
})();
