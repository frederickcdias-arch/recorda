# P2 — SUBIDA CONTROLADA DO AMBIENTE DE HOMOLOGAÇÃO / PILOTO INTERNO

## RECORDA — Relatório de Execução

**Data de execução:** 2026-06-01  
**Responsável:** GitHub Copilot (agente automatizado)  
**Branch:** `main`  
**Ambiente alvo:** Railway (backend) + Vercel (frontend)

---

## 1. Resumo Executivo

Execução completa de todas as etapas de preparação para subida controlada do ambiente de homologação/piloto interno. Todos os bloqueadores identificados na P1 foram resolvidos ou classificados como risco aceito. Todas as validações automatizadas passaram sem erros. O sistema está **PRONTO COM RESSALVAS** para homologação — as ressalvas estão documentadas na seção de riscos aceitos.

---

## 2. Ambiente Alvo

| Componente     | Plataforma            | Observações                                                   |
| -------------- | --------------------- | ------------------------------------------------------------- |
| Backend (API)  | Railway               | Dockerfile.backend · PORT=3001 · healthcheck /health          |
| Frontend (SPA) | Vercel                | Vite static · SPA routing · VITE_API_BASE obrigatória         |
| Banco de dados | PostgreSQL 15         | Railway managed ou externo · migrations auto na inicialização |
| Armazenamento  | Ephemeral (container) | Aceitável para homologação curta — ver seção de riscos        |

---

## 3. Arquivos Analisados

| Arquivo                                                            | Propósito                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `Dockerfile.backend`                                               | Build e runtime do backend (multi-stage, node:20-alpine)           |
| `Dockerfile.frontend`                                              | Build e runtime do frontend nginx (multi-stage, nginx:alpine)      |
| `nginx.conf`                                                       | Configuração nginx: porta 3000, SPA, /health, headers de segurança |
| `healthcheck.sh`                                                   | Script de healthcheck do container frontend                        |
| `railway.json`                                                     | Configuração de deploy Railway                                     |
| `vercel.json`                                                      | Configuração de deploy Vercel                                      |
| `.env.example`                                                     | Template de variáveis de ambiente (dev)                            |
| `packages/backend/src/infrastructure/database/migrate.ts`          | Runner de migrations automático                                    |
| `packages/backend/src/infrastructure/http/server.ts`               | Bootstrap Fastify, CORS, Helmet, rate limit                        |
| `packages/backend/src/infrastructure/config/index.ts`              | Leitura e validação de variáveis de ambiente                       |
| `packages/backend/src/infrastructure/http/routes/auth.ts`          | Validação JWT_SECRET no startup                                    |
| `packages/backend/src/infrastructure/services/file-storage.ts`     | Gestão de uploads (planilhas, ocr)                                 |
| `packages/backend/src/infrastructure/http/routes/capturas-mapa.ts` | Upload de mapas                                                    |
| `scripts/create-admin-user.js`                                     | Criação idempotente do usuário administrador                       |

---

## 4. Arquivos Alterados / Criados

### `healthcheck.sh` — CORRIGIDO

**Problema:** Script usava `curl`, que não está disponível na imagem base `nginx:alpine`.  
**Correção:** Substituído por `wget` (disponível em alpine por padrão).

```sh
#!/bin/sh
# Uses wget (available in nginx:alpine) instead of curl.
if ! pgrep nginx > /dev/null; then exit 1; fi
if wget -q -O /dev/null http://localhost:3000/health; then exit 0; else exit 1; fi
```

**Impacto:** Apenas containers Docker do frontend (standalone). Railway usa HTTP check via `healthcheckPath`; Vercel não usa Docker para o frontend.

---

### `.env.homologacao.example` — CRIADO

Template completo e seguro de variáveis de ambiente para o ambiente de homologação. Sem segredos reais — todos os valores sensíveis usam placeholders `[PREENCHER_*]`. Localização: raiz do repositório.

---

## 5. Variáveis de Ambiente — Guia de Configuração

### Variáveis obrigatórias para o backend funcionar

| Variável       | Valor de exemplo                      | Observação                                                                                    |
| -------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `NODE_ENV`     | `production`                          | Ativa validações de segurança                                                                 |
| `PORT`         | `3001`                                | Já definido no Dockerfile                                                                     |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Preferido sobre DB\_\* individuais                                                            |
| `JWT_SECRET`   | string aleatória ≥32 chars            | Servidor recusa boot sem isso                                                                 |
| `CORS_ORIGIN`  | `https://recorda.company`             | Servidor recusa boot sem isso em produção; aceita lista separada por vírgula durante migração |

### Variáveis obrigatórias para o frontend funcionar

| Variável        | Valor de exemplo              | Observação                                                                            |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| `VITE_API_BASE` | `https://api.recorda.company` | Se ausente, todos os calls de API falham com 404; usar Railway apenas temporariamente |

### Variáveis opcionais importantes

| Variável                                 | Padrão                | Observação                                                       |
| ---------------------------------------- | --------------------- | ---------------------------------------------------------------- |
| `APP_URL`                                | —                     | Usado em e-mails e links externos                                |
| `SERVER_URL`                             | `http://localhost:80` | URLs de logo em PDFs — definir para URL do backend               |
| `SMTP_*`                                 | —                     | Se ausente, logs no console (não envia e-mails)                  |
| `OPENAI_API_KEY`                         | —                     | Se ausente ou `OPENAI_IMAGE_ENABLED=false`, feature desabilitada |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | —                     | Se ausentes, push notifications desabilitadas silenciosamente    |
| `FAST_PERSPECTIVE_WARP_SCRIPT`           | —                     | Script Python para correção de mapas — opcional                  |

### Criação do usuário administrador

```bash
ADMIN_EMAIL=admin@minhaorg.com \
ADMIN_PASSWORD=[PREENCHER_SENHA_FORTE] \
ADMIN_NAME="Administrador" \
ADMIN_ROLE=admin \
node scripts/create-admin-user.js
```

Script idempotente: não cria duplicatas se o e-mail já existir. Requer variáveis `DB_*` configuradas.

---

## 6. Checklist Backend (Railway)

- [x] **Dockerfile.backend** validado: multi-stage, non-root user (`nodejs:nodejs`, uid 1001), PORT=3001
- [x] **Migrations automáticas**: `migrate.ts` executa antes do `main.ts` no CMD do container
- [x] **JWT_SECRET**: servidor rejeita boot se ausente ou < 32 chars em `production`
- [x] **CORS_ORIGIN**: servidor rejeita boot se ausente em `production`
- [x] **HEALTHCHECK interno**: `GET http://localhost:3001/health` a cada 30s (Dockerfile.backend)
- [x] **HEALTHCHECK Railway**: `healthcheckPath: "/health"`, timeout 120s (`railway.json`)
- [x] **Diretórios de upload**: criados no build (`planilhas`, `ocr`, `ocr-recebimento`, `ausencias`, `logos`, `relatorios`, `mapas/*`)
- [x] **Rate limiting**: 100 req/min global em produção; limites específicos em rotas de auth

---

## 7. Checklist Frontend (Vercel)

- [x] **vercel.json** validado: framework vite, build compartilhado + frontend, SPA routing
- [x] **VITE_API_BASE**: definir nas variáveis de ambiente do Vercel — obrigatório
- [x] **SPA routing**: todas as rotas redirecionam para `/index.html` (`vercel.json` rewrite)
- [x] **PWA**: `sw.js` e manifesto gerados no build (86 entradas precacheadas)
- [x] **nginx /health**: retorna 200 para healthcheck (standalone Docker)
- [x] **healthcheck.sh**: corrigido (`wget` em vez de `curl`)

---

## 8. Checklist Banco de Dados

- [x] **PostgreSQL 15**: versão compatível com todas as migrations
- [x] **Runner automático**: migrations executam na inicialização do container, antes do servidor
- [x] **Tabela de controle**: `schema_migrations (version VARCHAR PRIMARY KEY)` — idempotente
- [x] **Ordenação**: migrations executadas por ordem alfabética do nome do arquivo
- [x] **Alias 074a**: `MIGRATION_VERSION_ALIASES` em `migrate.ts` mapeia `074a` → `074` corretamente
- [x] **Duplicata 096**: dois arquivos com prefixo 096 — risco aceito (ver seção de riscos)
- [x] **Total**: 97+ migrations — todas aplicadas automaticamente no startup

---

## 9. Checklist Storage

- [x] **Diretórios existentes**: `uploads/planilhas`, `uploads/ocr`, `uploads/ocr-recebimento`, `uploads/ausencias`, `uploads/logos`, `uploads/relatorios`, `uploads/mapas/*`
- [x] **Criados no build**: o `Dockerfile.backend` cria todos os diretórios necessários
- [x] **Permissões**: diretórios pertencem ao usuário `nodejs` (non-root)
- [x] **Classificação**: armazenamento ephemeral (perdido a cada redeploy) — aceitável para homologação
- [ ] **Produção real**: requer volume persistente ou S3/MinIO/R2 — ver pendências

---

## 10. Checklist Pós-Deploy

Execute estes testes manualmente após subir o ambiente:

| #   | Cenário                    | Resultado esperado                        |
| --- | -------------------------- | ----------------------------------------- |
| 1   | `GET /health` no backend   | HTTP 200                                  |
| 2   | Frontend carrega (`/`)     | Página de login exibida                   |
| 3   | Login como admin           | Dashboard carregado, sem erros de console |
| 4   | Dashboard — dados carregam | Totalizadores e gráficos visíveis         |
| 5   | Criar recebimento de teste | Salvo com sucesso                         |
| 6   | Registrar produção         | Registro salvo                            |
| 7   | Abrir painel de painéis    | Sem erro 500                              |
| 8   | Exportar CSV               | Arquivo baixado corretamente              |
| 9   | Acessar módulo CQ          | Página carrega sem erro                   |
| 10  | Ver comunicados internos   | Lista carrega                             |
| 11  | Registrar ausência         | Formulário funcional                      |
| 12  | Captura de mapas           | Upload e preview funcionais               |
| 13  | Logout                     | Redireciona para login, token invalidado  |
| 14  | Login como colaborador     | Acesso restrito conforme papel            |

---

## 11. Riscos Aceitos

### R1 — Storage Ephemeral

**Descrição:** Uploads (planilhas, OCR, mapas, logos) são armazenados no container. Redeploys apagam os arquivos.  
**Impacto em homologação:** Baixo — ciclos curtos, arquivos de teste substituíveis.  
**Resolução para produção:** Montar volume persistente no Railway ou integrar S3/MinIO/Cloudflare R2.

### R2 — Duplicata de prefixo 096 em migrations

**Descrição:** `096_comunicados_internos_extensao.sql` e `096_push_subscriptions.sql` compartilham o prefixo 096, violando a convenção de migrations únicas.  
**Impacto funcional:** Nenhum — o runner usa o nome completo do arquivo como chave, não o prefixo. As duas migrations são aplicadas corretamente em ordem alfabética.  
**Resolução para produção:** Renomear `096_push_subscriptions.sql` → `098_push_subscriptions.sql` e adicionar alias em `migrate.ts`. **Não fazer em homologação** (renomear migrations já aplicadas exige alias e retest completo).

### R3 — CSP `unsafe-inline` no nginx.conf

**Descrição:** O header `Content-Security-Policy` em `nginx.conf` inclui `'unsafe-inline'`.  
**Impacto em homologação:** Nenhum — frontend em homologação vai para Vercel (que tem seus próprios headers), não para Docker standalone.  
**Resolução para produção:** Extrair hashes de scripts inline ou migrar para `nonce`.

---

## 12. Pendências Antes de Produção Real

| Item                                      | Prioridade | Descrição                                                      |
| ----------------------------------------- | ---------- | -------------------------------------------------------------- |
| Volume persistente / S3                   | Alta       | Storage ephemeral inaceitável em produção real                 |
| Renomear `096_push_subscriptions` → `098` | Média      | Limpar duplicata de prefixo nas migrations                     |
| Hardening CSP no nginx.conf               | Média      | Remover `unsafe-inline`                                        |
| `SERVER_URL` configurada                  | Média      | URLs de logo em PDFs gerados apontam para localhost se ausente |
| Configurar SMTP                           | Baixa      | Sem SMTP, notificações por e-mail só aparecem nos logs         |
| VAPID keys para push                      | Baixa      | Sem as chaves, notificações push silenciosamente desabilitadas |

---

## 13. Resultado das Validações Automatizadas

| Validação                | Comando                                           | Resultado                                          |
| ------------------------ | ------------------------------------------------- | -------------------------------------------------- |
| Typecheck backend        | `npm run typecheck --workspace=@recorda/backend`  | ✅ 0 erros                                         |
| Typecheck frontend       | `npm run typecheck --workspace=@recorda/frontend` | ✅ 0 erros                                         |
| Testes backend           | `npm run test --workspace=@recorda/backend`       | ✅ 32 suítes · 414 testes · 0 falhas               |
| Testes frontend          | `npm run test --workspace=@recorda/frontend`      | ✅ 8 suítes · 72 testes · 0 falhas                 |
| Build completo           | `npm run build`                                   | ✅ shared + frontend + PWA (86 entradas)           |
| Duplicatas de migrations | prefixo dos .sql agrupados                        | ⚠️ 074 (x2) · 096 (x2) — conhecidos, classificados |

---

## 14. Confirmações de Escopo P2

- ✅ Sem feature nova
- ✅ Sem migration nova
- ✅ Sem alteração de regra de negócio
- ✅ Sem alteração de layout
- ✅ Sem fluxo operacional alterado
- ✅ Sem segredo real commitado — apenas placeholders `[PREENCHER_*]`
- ✅ Sem comando destrutivo de banco
- ✅ Sem Python/OpenCV adicionado ao Docker
- ✅ Migrations existentes não renomeadas

---

## 15. Status Final

> **PRONTO COM RESSALVAS**
>
> O ambiente de homologação/piloto interno pode ser subido com segurança. As ressalvas (storage ephemeral, duplicata de prefixo 096, CSP unsafe-inline) estão documentadas, classificadas e são aceitáveis para ciclos de homologação de curta duração. Todas as validações automatizadas passaram. Os passos de configuração manual estão documentados neste relatório e no arquivo `.env.homologacao.example`.
>
> **Antes de promover para produção real**, resolver os itens da seção "Pendências Antes de Produção Real", em especial o storage persistente.
