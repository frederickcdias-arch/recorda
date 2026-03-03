#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const API_BASE = process.env.IMPORT_API_BASE || 'http://localhost:3000';
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

async function login() {
  const body = { email: process.env.IMPORT_EMAIL || 'admin@recorda.local', senha: process.env.IMPORT_PASSWORD || 'admin123' };
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
