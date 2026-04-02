# Checklist Pré-Produção — Recorda

> Auditoria completa do sistema antes de ir para produção.
> Data: 2026-02-13 | Atualizado: 2026-02-13

---

## 🔴 P0 — Bloqueantes

### 1. ~~JWT_SECRET fraco~~ ✅ RESOLVIDO

- **Correção:** `auth.ts` agora valida `JWT_SECRET.length >= 32` em produção. Erro fatal se não atender.
- **Deploy:** Gerar com `openssl rand -base64 48` e setar via variável de ambiente.

### 2. Senha do banco padrão ⚠️ AÇÃO NO DEPLOY

- `.env` usa `DB_PASSWORD=recorda` em dev. `config/index.ts` já usa `getEnvOrThrow('DB_PASSWORD')` em produção.
- **Deploy:** Gerar senha forte e configurar no PostgreSQL e `.env` de produção.

### 3. ~~NODE_ENV não definido~~ ✅ RESOLVIDO

- **Correção:** `NODE_ENV=development` adicionado ao `.env`. Swagger, rate limiting, CORS e CSP agora dependem corretamente de `NODE_ENV=production`.

### 4. ~~Swagger/OpenAPI exposto~~ ✅ RESOLVIDO

- **Correção:** `server.ts` agora registra Swagger/SwaggerUI apenas quando `!isProduction`.

### 5. ~~Reset token exposto em dev~~ ✅ RESOLVIDO

- Já estava condicionado a `NODE_ENV !== 'production'`. Com item 3 resolvido, funciona corretamente.

### 6. ~~DISABLE TRIGGER em importação~~ ✅ RESOLVIDO

- **Correção:** Substituído `ALTER TABLE ... DISABLE/ENABLE TRIGGER` por `SET LOCAL session_replication_role = 'replica'` em ambas as rotas de importação. Afeta apenas a transação corrente — reverte automaticamente no COMMIT/ROLLBACK.

### 7. ~~Tabela de auditoria sem retenção~~ ✅ RESOLVIDO

- **Correção:**
  - Cleanup automático a cada 6h: deleta registros com mais de 90 dias (`main.ts`).
  - Índice `idx_auditoria_data_operacao` criado para queries de limpeza (migration 057).
  - `session_replication_role = 'replica'` desabilita triggers de auditoria durante importações.

---

## 🟡 P1 — Importantes

### 8. ~~Falta index de dedup~~ ✅ RESOLVIDO

- **Correção:** Índice `idx_producao_dedup (usuario_id, repositorio_id, data_producao, etapa, quantidade)` criado (migration 057).

### 9. Importação N+1 queries 📋 BACKLOG

- Para cada linha: 3-5 queries. Com 1000 linhas = 3000-5000 queries.
- **Ação futura:** Batch as operações — carregar repos de uma vez, usar `INSERT ... ON CONFLICT` em batch.

### 10. ~~bodyLimit de 50MB~~ ✅ RESOLVIDO

- **Correção:** Reduzido para `10 * 1024 * 1024` (10MB) global em `server.ts`.

### 11. ~~Pool de conexões sem SSL~~ ✅ RESOLVIDO

- **Correção:** `connection.ts` agora habilita SSL automaticamente em produção. Configurável via `DB_SSL` e `DB_SSL_REJECT_UNAUTHORIZED`.

### 12. Falta HTTPS / proxy reverso ⚠️ AÇÃO NO DEPLOY

- Backend escuta em HTTP puro na porta 3000.
- **Deploy:** Configurar Nginx/Caddy como proxy reverso com TLS.

### 13. ~~Limpeza de refresh_tokens~~ ✅ RESOLVIDO

- **Correção:** Cleanup agora mantém tokens revogados por 30 dias antes de deletar (`main.ts`).

### 14. ~~Validação de tamanho do JWT_SECRET~~ ✅ RESOLVIDO

- Coberto pelo item 1 — `auth.ts` exige mínimo 32 caracteres em produção.

---

## 🟢 P2 — Melhorias

### 15. Falta backup automatizado ⚠️ AÇÃO NO DEPLOY

- **Deploy:** Configurar `pg_dump` diário com rotação (7 diários + 4 semanais).

### 16. Falta monitoramento/alertas ⚠️ AÇÃO NO DEPLOY

- Health check endpoint já existe (`/health`).
- **Deploy:** Configurar UptimeRobot/Healthchecks.io + alertas para disco, banco, 5xx.

### 17. Logs estruturados sem destino ⚠️ AÇÃO NO DEPLOY

- Fastify logger escreve em stdout (JSON).
- **Deploy:** Redirecionar para arquivo com rotação (`pino-file`) ou serviço de logs.

### 18. ~~PWA assets faltando~~ ✅ VERIFICADO

- Todos os assets existem em `public/`: `pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon.png`, `favicon.ico`, `favicon.svg`.

### 19. Frontend sem variável de API URL ⚠️ AÇÃO NO DEPLOY

- Vite proxy funciona em dev. Em produção, servir frontend e backend no mesmo domínio via proxy reverso.

### 20. ~~Rate limiting em endpoints pesados~~ ✅ RESOLVIDO

- **Correção:** Rate limits adicionados em `server.ts`:
  - Importação: 2/min
  - Importações legado: 3/min
  - OCR preview: 10/min
  - Relatórios: 5/min

### 21. Falta VACUUM/ANALYZE automatizado ⚠️ AÇÃO NO DEPLOY

- **Deploy:** Verificar `autovacuum` habilitado. Ajustar `autovacuum_vacuum_scale_factor` para `auditoria`.

---

## 🔵 P3 — Nice to have

### 22. Unique constraint na dedup de produção 📋 BACKLOG

- Considerar `UNIQUE` constraint em `(usuario_id, repositorio_id, data_producao::date, etapa, quantidade, marcadores->>'tipo')`.

### 23. Migração para connection pooler 📋 BACKLOG

- Com mais usuários, considerar PgBouncer.

### 24. CI/CD pipeline completo 📋 BACKLOG

- `.github/workflows/ci.yml` existe. Falta: deploy automatizado, migration em staging, smoke tests.

### 25. Testes E2E contra ambiente de staging 📋 BACKLOG

- 8 specs Playwright existem mas não rodam em CI.

---

## Resumo

| Prioridade | Total  | Resolvidos | Pendentes (deploy) | Backlog |
| ---------- | ------ | ---------- | ------------------ | ------- |
| 🔴 P0      | 7      | **6**      | 1 (senha DB)       | 0       |
| 🟡 P1      | 7      | **5**      | 1 (HTTPS)          | 1 (N+1) |
| 🟢 P2      | 7      | **2**      | 4 (infra deploy)   | 0       |
| 🔵 P3      | 4      | 0          | 0                  | 4       |
| **Total**  | **25** | **13**     | **6**              | **5**   |

---

## Verificação

- **Backend tsc:** 0 erros ✅
- **Frontend tsc:** 0 erros ✅
- **Backend vitest:** 111/111 ✅
- **Frontend vitest:** 36/36 ✅
- **Migration 057:** Aplicada ✅

---

## Checklist de Deploy

- [ ] `NODE_ENV=production` definido
- [ ] `JWT_SECRET` com 48+ caracteres aleatórios (`openssl rand -base64 48`)
- [ ] `DB_PASSWORD` forte e única
- [ ] `CORS_ORIGIN` apontando para domínio real
- [ ] `APP_URL` apontando para URL pública
- [ ] SMTP configurado para emails reais
- [ ] Proxy reverso (Nginx/Caddy) com HTTPS
- [ ] Backup automatizado do PostgreSQL (`pg_dump` diário)
- [ ] Monitoramento de uptime configurado
- [ ] Logs redirecionados para arquivo/serviço
- [ ] Testar login, importação e relatório em staging
- [ ] Testar restore de backup
