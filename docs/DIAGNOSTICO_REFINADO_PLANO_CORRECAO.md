# Diagnóstico Refinado e Plano de Correção — Projeto Recorda

> **Método**: Cada problema foi verificado diretamente no código-fonte real antes de classificar.  
> **Regras**: Nenhum arquivo foi alterado. Nenhum comando destrutivo executado. Apenas leitura e análise.  
> **Data**: 2026-07-07

---

## 1. Resumo Executivo

O sistema está **funcionalmente operacional** para as rotas críticas (login, refresh, lançamento de produção, auditoria, recebimento). Não existem bugs de travamento ou perda de dados confirmados.

Os problemas reais encontrados se dividem em três grupos:

**Grupo A — Erros de dados silenciosos (risco real em produção):**

- `ATENDIMENTO` e `RECONFERENCIA` existem no TypeScript e no backend, mas `ATENDIMENTO` **não está no enum PostgreSQL** — qualquer INSERT com esta etapa vai falhar com erro de banco.
- `RECONFERENCIA` só foi adicionada pela migration 084, que ainda não está no baseline — em bancos provisionados sem essa migration, a etapa também falhará.

**Grupo B — Problemas de UX/semântica (funciona, mas confuso):**

- `LancarProducaoPage` usa listas de "órgãos de recebimento/unidades" para o campo "Coordenadoria" — funciona, mas o conceito está errado. Usuário cria uma `unidade_recebimento`, não uma `coordenadoria`.
- Auditoria não retorna o nome do usuário, apenas o UUID — dificulta leitura humana dos logs.
- Rota `operacao/conhecimento` pode ser "capturada" por `operacao/:etapa` dependendo da ordem de definição — em React Router v7 com `createBrowserRouter` isso é um bug confirmado na ordem atual.

**Grupo C — Infraestrutura não conectada (não é bug, é decisão pendente):**

- Redis está provisionado no `docker-compose.yml` e na dependência `package.json` do backend, mas **nenhum código no backend importa ou usa Redis**. É dead infrastructure.
- Duas migrations com número `066` coexistem — o runner usa o nome completo do arquivo como versão, então ambas rodam. Mas o número duplicado é confuso e pode causar conflito em ferramentas de migração externas.

**O que corrigir primeiro:** `ATENDIMENTO` no enum PostgreSQL (Problema 1.5) — é o único que causa erro 500 em produção ao tentar usar a etapa.

**O que não mexer agora:** Redis (Problema 1.7) — requer decisão de arquitetura (implementar cache ou remover dependência). Mudança de semântica de "coordenadoria" vs "unidade" (Problema 1.2) — requer decisão de produto sobre nomenclatura.

---

## 2. Matriz dos Problemas

| ID  | Problema                                                                | Status                                          | Gravidade | Migration? | Frontend? | Backend?      | Prioridade |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------- | --------- | ---------- | --------- | ------------- | ---------- |
| 1.1 | Auditoria: nome do usuário ausente na resposta                          | ✅ Confirmado (UX)                              | Baixa     | Não        | Não       | Sim           | Fase 3     |
| 1.2 | LancarProducaoPage usa unidades de recebimento como "coordenadoria"     | ✅ Confirmado                                   | Média     | Não        | Sim       | Não           | Fase 2     |
| 1.3 | Trigger checklist na baseline usa condição errada (ABERTO vs CONCLUIDO) | ✅ Confirmado — JÁ CORRIGIDO pela migration 051 | Resolvido | —          | —         | —             | —          |
| 1.4 | Rota `operacao/conhecimento` capturada por `operacao/:etapa`            | ✅ Confirmado                                   | Média     | Não        | Sim       | Não           | Fase 1     |
| 1.5 | `ATENDIMENTO` ausente no enum `etapa_fluxo` do PostgreSQL               | ✅ Confirmado                                   | Alta      | Sim        | Não       | Não           | Fase 1     |
| 1.6 | Reset de senha usa `refresh_tokens` como storage (gambeta)              | ✅ Confirmado — funciona, design questionável   | Baixa     | Não        | Não       | Não           | Fase 3     |
| 1.7 | Redis provisionado mas não conectado ao backend                         | ✅ Confirmado                                   | Baixa     | Não        | Não       | Sim (decisão) | Fase 4     |
| 1.8 | Duas migrations com número `066`                                        | ✅ Confirmado                                   | Baixa     | Não        | Não       | Não           | Fase 3     |

---

## 3. Análise Detalhada por Problema

---

### Problema 1.1 — Auditoria retorna `usuario_id` (UUID) sem nome do usuário

**Status:** ✅ Confirmado — Gap de UX, não é crash

**Evidências no código:**

- `packages/backend/src/infrastructure/http/routes/auditoria.ts` linha ~55: o SELECT inclui `usuario_id` mas **não faz JOIN** com a tabela `usuarios`.
- A migration `061_auditoria_fk_usuario.sql` renomeou corretamente a coluna `colaborador_id` → `usuario_id` e atualizou o trigger. A rota está alinhada com este schema.
- O baseline `db/baseline/000_baseline_schema.sql` mostra `colaborador_id` porque foi gerado antes da migration 061, mas a migration sempre roda após o baseline (é do grupo 051+). Não é um bug em produção.

**Causa:** A rota de auditoria foi atualizada para usar `usuario_id` mas não foi enriquecida com dados do usuário.

**Impacto:** Logs de auditoria mostram UUIDs ao invés de nomes. Dificulta leitura humana, mas não impede funcionamento.

**Correção recomendada:**

```sql
-- No SELECT da rota, adicionar:
LEFT JOIN usuarios u ON u.id = a.usuario_id
-- E incluir na projeção:
u.nome AS usuario_nome
```

**Arquivos afetados:**

- `packages/backend/src/infrastructure/http/routes/auditoria.ts`
- `packages/frontend/src/pages/auditoria/AuditoriaPage.tsx` (para exibir o campo)

**Precisa migration?** Não  
**Risco da correção:** Baixo  
**Testes necessários:** Verificar se `AuditoriaPage` renderiza `usuario_nome` corretamente

---

### Problema 1.2 — LancarProducaoPage usa unidades de recebimento como "Coordenadoria"

**Status:** ✅ Confirmado — Erro semântico

**Evidências no código:**

- `packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx`: usa o hook `useOrgaosRecebimento()` (linha ~30) para popular o dropdown chamado "Coordenadoria".
- `packages/frontend/src/hooks/useQueries.ts` linha 184-196: `useOrgaosRecebimento()` chama `/operacional/orgaos-recebimento`, que retorna dados mesclados de `unidades_recebimento` + histórico de `repositorios.orgao` + marcadores de `producao_repositorio`.
- O quick-create no formulário chama `useCriarOrgaoRecebimento()` (linha ~818 de `useQueries.ts`), que faz POST em `/operacional/orgaos-recebimento` → insere em `unidades_recebimento`.
- O backend `/producao/lancar-direto` usa o valor recebido em `body.coordenadoria` como `orgaoRepositorio` (linha ~609 de `metas.ts`): `const orgaoRepositorio = body.coordenadoria?.trim() || 'SGPA'`.

**Causa:** O campo "Coordenadoria" no formulário foi conectado à lista de unidades de recebimento (que representa órgãos externos/clientes) em vez de `coordenadorias` (unidades internas da empresa). A semântica correta seria: "Coordenadoria" = departamento interno do colaborador; "Órgão" = cliente externo que enviou o arquivo.

**Impacto:**

1. Colaboradores confundem órgãos clientes com coordenadorias internas.
2. Ao criar "nova coordenadoria", na verdade se cria uma `unidade_recebimento` no banco.
3. O marcador `coordenadoria` em `producao_repositorio` armazena o nome do órgão, não da coordenadoria interna.

**Decisão de produto necessária:** Confirmar se o campo "Coordenadoria" deveria ser:

- (A) A coordenadoria interna do colaborador (lida de `usuarios.coordenadoria_id → coordenadorias.nome`) — sem seleção manual
- (B) O órgão de recebimento (como está hoje, mas renomear o campo no UI para "Órgão / Unidade")
- (C) Campo livre livre de texto

**Correção recomendada (opção A):**  
Remover o dropdown e preencher automaticamente com `usuario.coordenadoria.nome` obtido do token JWT / `/auth/me`.

**Arquivos afetados:**

- `packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx`

**Precisa migration?** Não  
**Risco da correção:** Médio (altera comportamento visível ao colaborador)  
**Testes necessários:** Fluxo completo de lançamento de produção

---

### Problema 1.3 — Trigger `fn_validar_producao_com_checklist_ativo` com lógica errada

**Status:** ✅ Confirmado como BUG HISTÓRICO — **JÁ RESOLVIDO** pela migration 051

**Evidências no código:**

- `db/baseline/000_baseline_schema.sql` linhas 681-698: versão do baseline verifica `status = 'ABERTO' AND ativo = TRUE` — lógica contraditória (checklist ativo é exatamente o que foi concluído, não o aberto).
- `db/migrations/051_fix_producao_checklist_trigger.sql` comentário explícito: "The old logic was contradictory and always blocked production registration."
- A migration 051 corrige para `status = 'CONCLUIDO'` (sem checar `ativo`).

**Situação atual:** Como a migration 051 está no grupo 051+ (sempre roda após baseline em bancos novos), e em bancos existentes já foi aplicada, o bug **não existe em produção**. O código do backend em `metas.ts` (linhas 630-640) cria checklist com `status = 'CONCLUIDO', ativo = FALSE` antes de inserir produção, alinhado com a trigger corrigida.

**Ação necessária:** Nenhuma. Documentado para referência.

---

### Problema 1.4 — Rota `operacao/:etapa` captura `operacao/conhecimento`

**Status:** ✅ Confirmado

**Evidências no código:**

- `packages/frontend/src/routes/index.tsx` linhas ~180-200: rota `operacao/:etapa` está definida **antes** de `operacao/conhecimento`.
- React Router v7 com `createBrowserRouter` usa **ordem de definição** para resolução de rotas — uma rota dinâmica captura antes da estática se vier primeiro.
- `EtapaOperacionalPage.tsx` linhas 43-45 e 118-130: `EtapaSlug` aceita apenas `'recebimento' | 'controle-qualidade'`. Para o slug `'conhecimento'`, `isEtapaSlug('conhecimento')` retorna `false`, e linha 387-389 retorna: `<div>Etapa Operacional inválida.</div>`.

**Impacto:** Ao navegar para `/operacao/conhecimento`, o usuário vê "Etapa Operacional inválida." em vez da página `ConhecimentoOperacionalPage`.

**Correção recomendada:**  
Inverter a ordem das rotas em `index.tsx` — colocar `operacao/conhecimento` **antes** de `operacao/:etapa`.

```tsx
// Antes (ordem atual — ERRADA):
{ path: 'operacao/:etapa', element: <EtapaOperacionalPage /> },
{ path: 'operacao/conhecimento', element: <ConhecimentoOperacionalPage /> },

// Depois (ordem correta):
{ path: 'operacao/conhecimento', element: <ConhecimentoOperacionalPage /> },
{ path: 'operacao/:etapa', element: <EtapaOperacionalPage /> },
```

**Arquivos afetados:**

- `packages/frontend/src/routes/index.tsx`

**Precisa migration?** Não  
**Risco da correção:** Mínimo (mudança de 2 linhas)  
**Testes necessários:** Navegar para `/operacao/conhecimento` e verificar se `ConhecimentoOperacionalPage` renderiza

---

### Problema 1.5 — `ATENDIMENTO` ausente no enum `etapa_fluxo` do PostgreSQL

**Status:** ✅ Confirmado — **Bug ativo em produção**

**Evidências no código:**

- `db/baseline/000_baseline_schema.sql` linhas 37-46: `CREATE TYPE public.etapa_fluxo AS ENUM` com valores: `RECEBIMENTO, PREPARACAO, DIGITALIZACAO, DIGITALIZACAO_COLORIDA, CONFERENCIA, MONTAGEM, CONTROLE_QUALIDADE, ENTREGA`. **`ATENDIMENTO` está ausente.**
- `db/migrations/084_add_reconferencia_etapa_fluxo.sql`: adiciona apenas `RECONFERENCIA` (`ALTER TYPE etapa_fluxo ADD VALUE IF NOT EXISTS 'RECONFERENCIA' AFTER 'CONFERENCIA'`). `ATENDIMENTO` não foi adicionado em nenhuma migration.
- `packages/shared/src/entities/operacional.ts` linha 13: `EtapaFluxo` inclui `'ATENDIMENTO'`.
- `packages/backend/src/infrastructure/http/routes/metas.ts` linhas 600-620: `etapaStatusMap` e `sequenciaEtapas` incluem `ATENDIMENTO`.
- Em bancos com todas as migrations (incluindo 084), `RECONFERENCIA` existe. `ATENDIMENTO` **nunca foi adicionado ao PostgreSQL** em nenhuma migration existente.

**Causa:** A etapa `ATENDIMENTO` foi adicionada ao TypeScript e ao backend, mas a migration correspondente de `ALTER TYPE etapa_fluxo ADD VALUE 'ATENDIMENTO'` **nunca foi criada**.

**Impacto:** Qualquer INSERT em `producao_repositorio` com `etapa = 'ATENDIMENTO'` retorna erro PostgreSQL `invalid input value for enum etapa_fluxo: "ATENDIMENTO"` (HTTP 500). A etapa está disponível no formulário de lançamento de produção para o colaborador selecionar.

**Correção recomendada:**  
Criar migration `086_add_atendimento_etapa_fluxo.sql`:

```sql
-- Migration: 086_add_atendimento_etapa_fluxo
ALTER TYPE etapa_fluxo ADD VALUE IF NOT EXISTS 'ATENDIMENTO' AFTER 'MONTAGEM';

INSERT INTO schema_migrations (version)
SELECT '086_add_atendimento_etapa_fluxo'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '086_add_atendimento_etapa_fluxo'
);
```

**Arquivos afetados:**

- `db/migrations/086_add_atendimento_etapa_fluxo.sql` (novo arquivo)

**Precisa migration?** Sim — obrigatório  
**Risco da correção:** Mínimo (`ADD VALUE IF NOT EXISTS` é não-destrutivo)  
**Testes necessários:** Inserção de produção com etapa `ATENDIMENTO`

---

### Problema 1.6 — Reset de senha usa tabela `refresh_tokens` como storage

**Status:** ✅ Confirmado — Funciona, design questionável

**Evidências no código:**

- `packages/backend/src/infrastructure/http/routes/auth.ts` linhas ~695-750:
  - `/auth/forgot-password` gera `crypto.randomUUID()`, faz SHA-256, e insere em `refresh_tokens` com `token_hash = 'reset:' + tokenHash`.
  - `/auth/reset-password` busca na tabela `refresh_tokens` com `WHERE rt.token_hash = $1` usando o prefixo `reset:`.
- A tabela `refresh_tokens` não tem coluna para distinguir tipo de token (autenticação vs reset) — o prefixo `reset:` na string é o único discriminador.
- Em desenvolvimento, o `resetToken` é retornado no response body (conveniência de teste). Em produção, o e-mail é enviado via `server.emailService.send()`.

**Causa:** Reutilização da tabela `refresh_tokens` para armazenar tokens de reset — evita criar nova tabela, mas mistura responsabilidades.

**Impacto real:**

1. Consultas de limpeza de refresh tokens expirados (se existirem) podem remover tokens de reset acidentalmente.
2. Um `revogado = true` global (ex.: logout) **não revoga** tokens de reset (o WHERE de revogação usa `usuario_id` apenas nos refresh tokens, não nos reset tokens — verificado no código de logout).
3. Sem tipo de token explícito, monitoramento/auditoria de sessões ativas fica impreciso.

**Ação necessária:** Não é um bug de funcionamento, mas é uma dívida técnica. Recomenda-se criar tabela dedicada `password_reset_tokens` em evolução futura.

**Precisa migration?** Não (para corrigir agora) / Sim (para migrar para tabela própria)  
**Risco da correção:** Médio (se criar nova tabela)

---

### Problema 1.7 — Redis provisionado mas não utilizado no backend

**Status:** ✅ Confirmado — Infrastructure dead code

**Evidências no código:**

- `docker-compose.yml` linhas 19-31: serviço `redis` completo (Redis 7-alpine, porta 6380, persistência, healthcheck).
- `.env.example` e `.env`: `REDIS_URL=redis://localhost:6380`.
- `packages/backend/package.json`: dependência `redis: ^4.6.10`.
- Busca completa em `packages/backend/src` (incluindo arquivos ignorados): **zero ocorrências de `redis`**.

**Causa:** Redis foi planejado para cache (rate limiting, sessões, cache de queries) mas nunca foi integrado ao código do backend.

**Impacto:** Overhead de infraestrutura sem benefício. Em produção cloud (Railway), gera custo de serviço Redis sem uso.

**Decisão necessária:**

- (A) **Remover**: retirar Redis do `docker-compose.yml`, `.env`, e `package.json` do backend.
- (B) **Implementar**: usar para cache de queries frequentes (dashboard, repositórios) ou rate limiting no `/auth/forgot-password`.

**Precisa migration?** Não  
**Risco:** Baixo (remover) / Médio (implementar)

---

### Problema 1.8 — Duas migrations com número `066`

**Status:** ✅ Confirmado — Sem impacto em produção, mas confuso

**Evidências no código:**

- `db/migrations/066_add_perfil_colaborador.sql`: `ALTER TYPE perfil_usuario ADD VALUE IF NOT EXISTS 'colaborador'`.
- `db/migrations/066_indice_refresh_tokens_expira.sql`: `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expira_em`.
- `packages/backend/src/infrastructure/database/migrate.ts` linha 36: `extractVersion(filename)` retorna o **nome completo** do arquivo sem `.sql`. Portanto as versões são `'066_add_perfil_colaborador'` e `'066_indice_refresh_tokens_expira'` — **são diferentes**, ambas rodam, e ambas são registradas em `schema_migrations` separadamente.

**Impacto real:** Nenhum em produção. Ambas as migrations executam corretamente. O problema é:

1. Confusão visual ao revisar histórico de migrations.
2. Ferramentas externas (ex.: `pg-migrate`, `flyway`) que usam apenas o número como versão poderiam ter conflito.

**Correção recomendada:** Renumerar uma delas para `087_indice_refresh_tokens_expira.sql` (ou próximo número disponível após 085). **Requer cuidado**: se o banco em produção já tem `066_indice_refresh_tokens_expira` em `schema_migrations`, a renumeração precisa de um script de migração de dados na tabela `schema_migrations`.

**Precisa migration?** Sim (para corrigir o registro em produção)  
**Risco da correção:** Médio

---

## 4. Ordem Recomendada de Correção

### Fase 1 — Crítico / Seguro (fazer agora, sem decisão de produto necessária)

| #   | Ação                                                                 | Arquivo                                  | Risco  |
| --- | -------------------------------------------------------------------- | ---------------------------------------- | ------ |
| 1   | Criar migration `086_add_atendimento_etapa_fluxo.sql`                | `db/migrations/`                         | Mínimo |
| 2   | Inverter ordem das rotas `operacao/conhecimento` e `operacao/:etapa` | `packages/frontend/src/routes/index.tsx` | Mínimo |

### Fase 2 — Funcional / Requer decisão de produto

| #   | Ação                                                                       | Arquivo                                                          | Risco |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----- |
| 3   | Definir semântica de "Coordenadoria" em `LancarProducaoPage` (opção A/B/C) | `packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx` | Médio |
| 4   | Adicionar JOIN com `usuarios` na rota de auditoria                         | `packages/backend/src/infrastructure/http/routes/auditoria.ts`   | Baixo |

### Fase 3 — Limpeza / Dívida técnica

| #   | Ação                                                   | Arquivo                            | Risco |
| --- | ------------------------------------------------------ | ---------------------------------- | ----- |
| 5   | Renumerar migration `066_indice_refresh_tokens_expira` | `db/migrations/` + script de dados | Médio |
| 6   | Avaliar migração de reset tokens para tabela própria   | `auth.ts` + nova migration         | Médio |

### Fase 4 — Evolução / Decisão de arquitetura

| #   | Ação                | Descrição                                                                         | Risco       |
| --- | ------------------- | --------------------------------------------------------------------------------- | ----------- |
| 7   | Decidir sobre Redis | Remover infraestrutura ou implementar cache                                       | Baixo/Médio |
| 8   | Regenerar baseline  | Após estabilizar todas as migrations 001-086, regenerar `000_baseline_schema.sql` | Médio       |

---

## 5. Plano de Execução Futura

Os prompts abaixo são focados e podem ser executados de forma independente, na ordem recomendada.

---

**Prompt 1 — Fase 1, item 1: Criar migration para ATENDIMENTO**

> Crie o arquivo `db/migrations/086_add_atendimento_etapa_fluxo.sql` que adiciona o valor `ATENDIMENTO` ao enum `etapa_fluxo` do PostgreSQL, logo após `MONTAGEM`. Use `ADD VALUE IF NOT EXISTS` para segurança. Siga o padrão das migrations existentes: inclua cabeçalho de comentário com nome, descrição e data; e insira o registro em `schema_migrations` com guard `WHERE NOT EXISTS`. Não altere nenhum outro arquivo.

---

**Prompt 2 — Fase 1, item 2: Corrigir ordem das rotas**

> No arquivo `packages/frontend/src/routes/index.tsx`, a rota estática `operacao/conhecimento` está definida após a rota dinâmica `operacao/:etapa`, fazendo com que o React Router v7 intercepte a URL `/operacao/conhecimento` e renderize "Etapa Operacional inválida." em vez de `ConhecimentoOperacionalPage`. Corrija apenas a ordem dessas duas rotas: mova `operacao/conhecimento` para antes de `operacao/:etapa`. Não altere mais nada.

---

**Prompt 3 — Fase 2, item 3: Corrigir semântica de Coordenadoria em LancarProducaoPage (opção A)**

> Em `packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx`, o campo "Coordenadoria" usa `useOrgaosRecebimento()` (lista de unidades externas de recebimento) em vez da coordenadoria interna do colaborador. A correção consiste em: (1) remover o hook `useOrgaosRecebimento` e a mutation `useCriarOrgaoRecebimento` deste componente; (2) preencher automaticamente o campo `coordenadoria` do formulário com `usuario.coordenadoria?.nome ?? ''` obtido do hook `useAuth()`; (3) exibir o valor como texto somente-leitura (não editável) no formulário; (4) remover o inline quick-create de "nova coordenadoria". Se o usuário não tiver coordenadoria, exibir campo vazio mas não bloquear o envio.

---

**Prompt 4 — Fase 2, item 4: Enriquecer resposta de auditoria com nome do usuário**

> Em `packages/backend/src/infrastructure/http/routes/auditoria.ts`, o SELECT da rota principal retorna `usuario_id` (UUID) mas não inclui o nome do usuário. Adicione um `LEFT JOIN usuarios u ON u.id = a.usuario_id` e inclua `u.nome AS usuario_nome` na projeção. Em seguida, em `packages/frontend/src/pages/auditoria/AuditoriaPage.tsx`, exiba `usuario_nome` (com fallback para o UUID truncado caso seja null) na coluna/campo que mostra quem realizou a ação.

---

**Prompt 5 — Fase 3, item 5: Renumerar migration 066 duplicada**

> Existem dois arquivos com prefixo `066` em `db/migrations/`: `066_add_perfil_colaborador.sql` e `066_indice_refresh_tokens_expira.sql`. O runner atual usa o nome completo como versão, então ambos funcionam, mas o número duplicado é problemático. Renomeie `066_indice_refresh_tokens_expira.sql` para `087_indice_refresh_tokens_expira.sql`. Em seguida, crie uma migration `088_fix_version_066_indice.sql` que atualiza o registro na tabela `schema_migrations` em bancos onde a versão antiga já foi aplicada: `UPDATE schema_migrations SET version = '087_indice_refresh_tokens_expira' WHERE version = '066_indice_refresh_tokens_expira'`. Não altere o conteúdo SQL da migration renumerada.

---

**Prompt 6 — Fase 3, item 6: Migrar reset tokens para tabela própria**

> A implementação atual de reset de senha armazena tokens na tabela `refresh_tokens` com o prefixo `reset:` no campo `token_hash`, misturando duas responsabilidades distintas. Crie uma migration `089_password_reset_tokens.sql` com uma nova tabela `password_reset_tokens(id, usuario_id, token_hash, expira_em, usado, criado_em)`. Atualize as rotas `/auth/forgot-password` e `/auth/reset-password` em `packages/backend/src/infrastructure/http/routes/auth.ts` para usar a nova tabela. Remova os registros do tipo `reset:*` da tabela `refresh_tokens` com uma instrução `DELETE` na migration. Mantenha toda a lógica de segurança existente (SHA-256 hash, 1h de validade, revogação após uso).

---

**Prompt 7 — Fase 4, item 7: Decisão sobre Redis**

> O Redis está provisionado no `docker-compose.yml`, no `.env`, e como dependência em `packages/backend/package.json`, mas nenhum código no backend o importa ou usa. Há duas opções: (A) **Remover**: apague o serviço `redis` do `docker-compose.yml`, remova `REDIS_URL` do `.env.example`, e remova `redis` das dependências do `packages/backend/package.json`. (B) **Implementar cache**: use Redis para cachear a resposta de `/dashboard` (TTL: 60s) e `/operacional/orgaos-recebimento` (TTL: 5min). Indique qual opção você quer executar antes de prosseguir.

---

**Prompt 8 — Fase 4, item 8: Regenerar baseline**

> Após todas as migrations de 001 a 086+ estarem aplicadas e estáveis, regenere o baseline do banco executando `pg_dump --schema-only` no banco de desenvolvimento completamente provisionado. Salve o resultado em `db/baseline/000_baseline_schema.sql`, substituindo o arquivo atual. Atualize `db/BASELINE.md` para refletir o novo conjunto de migrations incluídas no baseline. Verifique que o novo baseline inclui: enum `etapa_fluxo` com `RECONFERENCIA` e `ATENDIMENTO`; tabela `auditoria` com `usuario_id`; `audit_trigger_function` com `usuario_id`; e função `audit_extract_registro_id`.
