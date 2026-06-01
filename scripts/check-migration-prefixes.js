#!/usr/bin/env node
/**
 * check-migration-prefixes.js
 *
 * Valida que nenhum prefixo numérico novo foi duplicado em db/migrations/.
 * Falha com código de saída 1 se encontrar duplicatas além das exceções conhecidas.
 *
 * Uso:
 *   node scripts/check-migration-prefixes.js
 *
 * Exceções conhecidas (não falham o check):
 *   096 — dois arquivos existentes (096_comunicados_internos_extensao e 096_push_subscriptions).
 *         Decisão de renumeração pendente de aprovação formal. Não alterar sem decisão documentada.
 */

import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'db', 'migrations');

// Prefixos duplicados já conhecidos e aprovados. Não adicionar novos sem decisão formal.
const KNOWN_DUPLICATE_PREFIXES = new Set([
  '074', // 074_gestao_pessoas + 074a_cq_avaliacoes_aceitar_apensos — alias em MIGRATION_VERSION_ALIASES
  '096', // 096_comunicados_internos_extensao + 096_push_subscriptions — renumeração pendente de decisão formal
]);

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql') && /^\d+[a-z]?_/.test(f))
  .sort();

const prefixMap = new Map(); // prefix -> [filename, ...]

for (const file of files) {
  const match = file.match(/^(\d+)[a-z]?_/);
  if (!match) continue;
  const prefix = match[1].replace(/^0+/, '') || '0'; // strip leading zeros for grouping
  const canonical = match[1]; // keep original for display

  if (!prefixMap.has(canonical)) {
    prefixMap.set(canonical, []);
  }
  prefixMap.get(canonical).push(file);
}

let hasError = false;

for (const [prefix, filesWithPrefix] of prefixMap.entries()) {
  if (filesWithPrefix.length <= 1) continue;

  const paddedPrefix = prefix.padStart(3, '0');

  if (KNOWN_DUPLICATE_PREFIXES.has(paddedPrefix)) {
    console.warn(
      `[AVISO] Prefixo duplicado CONHECIDO: ${paddedPrefix}\n` +
      `  Arquivos: ${filesWithPrefix.join(', ')}\n` +
      `  Exceção documentada — não alterar sem decisão formal.`
    );
    continue;
  }

  console.error(
    `[ERRO] Prefixo duplicado NÃO AUTORIZADO: ${paddedPrefix}\n` +
    `  Arquivos: ${filesWithPrefix.join(', ')}\n` +
    `  Ação: renumere um dos arquivos e registre a decisão.`
  );
  hasError = true;
}

if (hasError) {
  console.error('\nVerificação de prefixos de migration FALHOU.');
  process.exit(1);
} else {
  console.log('Verificação de prefixos de migration OK.');
  process.exit(0);
}
