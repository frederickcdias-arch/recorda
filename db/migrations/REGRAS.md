# Regras de Migrations — Recorda

## Regras obrigatórias

### 1. Nunca renomear uma migration já aplicada

Migrations são identificadas pelo nome do arquivo (sem `.sql`) como chave única em `schema_migrations`.
Renomear um arquivo já aplicado em produção causará **re-aplicação da migration**, resultando em erros de banco (tabelas duplicadas, colunas duplicadas, etc.).

**Único caminho seguro:** se renumeração for inevitável, usar `MIGRATION_VERSION_ALIASES` em `packages/backend/src/infrastructure/database/migrate.ts` e criar uma migration de correção no padrão de `088_fix_version_066_indice.sql`.

### 2. Não repetir prefixo numérico

Cada migration deve ter um prefixo numérico único: `001_`, `002_`, … `097_`, etc.
Dois arquivos com o mesmo número numérico inicial (ex.: `096_aaa.sql` e `096_bbb.sql`) causam confusão de ordem e dificultam manutenção, mesmo que tecnicamente funcionem (o runner usa o nome completo como chave).

Use o próximo número disponível após o maior existente.

### 3. Sequência incremental sem lacunas

Migrations devem ser adicionadas em ordem, sempre com número maior que o maior existente.
Não inserir migrations com número intermediário (ex.: não criar `050b_` para inserir entre 050 e 051 já aplicados).

### 4. Autoregistro preferencial via SQL

O padrão recomendado de autoregistro no final de cada migration é:

```sql
INSERT INTO schema_migrations (version) VALUES ('<nome_arquivo_sem_.sql>')
  ON CONFLICT (version) DO NOTHING;
```

O runner também insere automaticamente via código, mas o autoregistro no SQL é a forma preferida e mais explícita.

### 5. Operações destrutivas exigem guards

- `DROP TABLE` → sempre `DROP TABLE IF EXISTS`
- `DROP COLUMN` → sempre `ALTER TABLE x DROP COLUMN IF EXISTS`
- `DROP INDEX` → sempre `DROP INDEX IF EXISTS`
- `DROP TRIGGER` → sempre `DROP TRIGGER IF EXISTS ON`
- `DROP TYPE` → sempre `DROP TYPE IF EXISTS`

### 6. ENUMs idempotentes

Criar tipos ENUM com wrapper idempotente:

```sql
DO $$
BEGIN
  CREATE TYPE meu_tipo AS ENUM ('A', 'B');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
```

---

## Exceções conhecidas e documentadas

### Duplicidade `074` / `074a` (resolvida via alias)

| Arquivo                                  | Propósito                                |
| ---------------------------------------- | ---------------------------------------- |
| `074_gestao_pessoas.sql`                 | Criação das tabelas de gestão de pessoas |
| `074a_cq_avaliacoes_aceitar_apensos.sql` | Extensão de CQ — aceite de apensos       |

O arquivo `074a` usa sufixo alfanumérico para intercalação. A compatibilidade com bancos que aplicaram a versão original com nome `074_cq_avaliacoes_aceitar_apensos` é mantida via `MIGRATION_VERSION_ALIASES` no runner TypeScript.

### Duplicidade `096` (não alterar sem decisão formal)

Existem dois arquivos com prefixo `096`:

| Arquivo                                 | Tabelas afetadas                    | Data       |
| --------------------------------------- | ----------------------------------- | ---------- |
| `096_comunicados_internos_extensao.sql` | `comunicados` (ALTER TABLE)         | 2026-05-25 |
| `096_push_subscriptions.sql`            | `push_subscriptions` (CREATE TABLE) | 2026-05-20 |

**Por que não é um problema imediato:** o runner usa o nome completo do arquivo como chave, não apenas o prefixo numérico. As duas migrations têm versões distintas (`096_comunicados_internos_extensao` e `096_push_subscriptions`) e afetam tabelas completamente diferentes. O runner não confunde uma com a outra.

**Por que é uma inconsistência:** viola a regra de prefixo único, pode confundir mantenedores sobre a ordem de criação.

**Ação pendente:** renumerar `096_push_subscriptions` para o próximo número disponível (ex.: `098_`) quando houver janela para:

1. Criar `MIGRATION_VERSION_ALIASES` para a versão antiga
2. Criar migration de correção de `schema_migrations` no padrão `088_fix_version_066_indice.sql`
3. Renomear o arquivo

**Até lá:** não alterar nenhum dos dois arquivos `096_`. Usar `scripts/check-migration-prefixes.js` para garantir que não surjam novos duplicados.

---

## Pasta `archive/`

`db/migrations/archive/` contém cópias de referência das migrations `001` a `050`.
**Não são lidas pelos runners.** Existem apenas como backup histórico.
Os runners leem exclusivamente `db/migrations/*.sql` (sem subpastas).

---

## Verificação automatizada

```bash
node scripts/check-migration-prefixes.js
```

Falha com código 1 se houver prefixo duplicado não documentado.
Emite aviso (sem falhar) para a exceção `096` conhecida.
