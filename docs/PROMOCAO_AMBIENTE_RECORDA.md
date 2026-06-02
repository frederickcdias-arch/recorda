# Checklist de Promoção para Próximo Ambiente — Recorda

**Data de auditoria:** 2026-06-01  
**Executor:** GitHub Copilot (agente automatizado)  
**Ambiente de origem:** Desenvolvimento local (Windows, Docker PostgreSQL 15)  
**Ambiente de destino:** Homologação interna / piloto  
**Arquitetura de destino:** Backend → Railway (Dockerfile.backend) | Frontend → Vercel (Vite)

> **Escopo desta auditoria:** somente configuração, infraestrutura e segurança de deploy.
> Nenhuma funcionalidade, migration ou lógica de negócio foi alterada.

---

## Sumário Executivo

| #   | Área                               | Status          | Ação Necessária                                              |
| --- | ---------------------------------- | --------------- | ------------------------------------------------------------ |
| 1   | Variáveis de ambiente — backend    | ⚠️ PENDENTE     | Definir 4 variáveis obrigatórias em prod                     |
| 2   | Variáveis de ambiente — frontend   | ⚠️ PENDENTE     | Definir `VITE_API_BASE`                                      |
| 3   | JWT_SECRET                         | ⚠️ PENDENTE     | Gerar segredo ≥ 32 chars; valor padrão inseguro              |
| 4   | CORS                               | ⚠️ PENDENTE     | Definir `CORS_ORIGIN` com URL exata do frontend              |
| 5   | Banco de dados — conexão Railway   | ⚠️ PENDENTE     | Usar `DATABASE_URL` ou definir `DB_*` + `DB_PASSWORD`        |
| 6   | Banco de dados — SSL               | ✅ OK           | `DB_SSL=false` para ignorar; padrão ativa SSL em prod        |
| 7   | Migrations — runner                | ✅ OK           | Automático no startup do container backend                   |
| 8   | Migrations — duplicatas de prefixo | ⚠️ CLASSIFICADO | 074a+074 e 096+096 — funcionam mas violam regra REGRAS.md    |
| 9   | Storage / uploads — persistência   | ⚠️ RISCO        | Diretórios criados no container; ephemeral sem volume        |
| 10  | Healthcheck backend                | ✅ OK           | `GET /health` → 200 em porta 3001                            |
| 11  | Healthcheck frontend (nginx)       | ⚠️ RISCO        | Script usa `curl`; `nginx:alpine` não inclui curl            |
| 12  | HTTPS / TLS                        | ✅ OK           | Railway e Vercel gerenciam TLS automaticamente               |
| 13  | Rate limiting                      | ✅ OK           | Ativo em produção (`NODE_ENV=production`)                    |
| 14  | Helmet / Security Headers          | ✅ OK           | Registrado; CSP ativo em produção                            |
| 15  | CSP nginx (frontend)               | ⚠️ BACKLOG      | `unsafe-inline` presente em nginx.conf                       |
| 16  | Criação de usuário administrador   | ⚠️ PENDENTE     | Executar `scripts/create-admin-user.js` com `ADMIN_PASSWORD` |
| 17  | SMTP / e-mail                      | ℹ️ OPCIONAL     | Sem `SMTP_HOST` → logs no console; configurar para prod real |
| 18  | VAPID / Push Notifications         | ℹ️ OPCIONAL     | Gerar chaves com `npm run push:vapid` para prod              |
| 19  | OpenAI — Captura de Mapas          | ✅ OK           | Desabilitado por padrão (`OPENAI_IMAGE_ENABLED=false`)       |
| 20  | Build de produção                  | ✅ OK           | `npm run build` completo sem erros                           |
| 21  | Validações automatizadas           | ✅ OK           | Typecheck + testes 100% verde                                |

---

## Detalhamento por Item

### 1. Variáveis de Ambiente — Backend (Railway)

Definir no painel de variáveis do serviço Railway:

| Variável       | Obrigatória           | Observação                                                                                   |
| -------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`     | **Sim**               | `production`                                                                                 |
| `DATABASE_URL` | **Sim** (recomendado) | Alternativa: definir `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` separadamente |
| `JWT_SECRET`   | **Sim**               | Min. 32 chars. Gerar: `openssl rand -base64 48`                                              |
| `CORS_ORIGIN`  | **Sim**               | URL exata do frontend oficial (preferencial: `https://recorda.company`)                      |
| `APP_URL`      | **Sim**               | URL pública do frontend (usado em links de e-mail de reset de senha)                         |
| `TZ`           | Recomendada           | `America/Sao_Paulo`                                                                          |
| `PORT`         | Não                   | Dockerfile já define `PORT=3001`; Railway sobrescreve automaticamente                        |

**Comportamento do código em produção sem `CORS_ORIGIN`:** o servidor lança exceção na inicialização e recusa subir.

**Comportamento sem `JWT_SECRET`:** o servidor lança exceção na inicialização e recusa subir.

**Comportamento sem `DB_PASSWORD` (quando não usar DATABASE_URL):** `config/index.ts` chama `getEnvOrThrow('DB_PASSWORD')` em produção e lança exceção.

---

### 2. Variáveis de Ambiente — Frontend (Vercel)

| Variável                | Obrigatória | Observação                                                                 |
| ----------------------- | ----------- | -------------------------------------------------------------------------- |
| `VITE_API_BASE`         | **Sim**     | URL pública da API (preferencial: `https://api.recorda.company`; temporário: Railway) |
| `VITE_VAPID_PUBLIC_KEY` | Condicional | Obrigatória se push notifications estiver ativo                            |
| `VITE_APP_VERSION`      | Não         | Exibida na AdminPage; padrão `'dev'` se ausente                            |

**Comportamento sem `VITE_API_BASE`:** frontend usa `/api` como base, que no Vercel (sem proxy) aponta para o próprio servidor de arquivos estáticos e todos os chamados de API falharão com 404.

---

### 3. JWT_SECRET

- **Código**: `packages/backend/src/infrastructure/http/routes/auth.ts` — valida obrigatoriedade e comprimento mínimo de 32 chars em produção. Falha com exceção na inicialização.
- **Risco**: valor padrão do `.env.example` (`your-secure-jwt-secret-change-in-production`) tem 44 chars mas é público e não deve ser usado.
- **Ação**: gerar novo segredo único por ambiente — `openssl rand -base64 48`.

---

### 4. CORS

- **Código**: `packages/backend/src/infrastructure/http/server.ts` — em produção, exige `process.env.CORS_ORIGIN`; aceita 1 origin ou uma lista separada por vírgula.
- **Em dev**: `origin: true` (qualquer origem).
- **Ação**: definir `CORS_ORIGIN=https://recorda.company`; durante migração, pode usar `https://recorda.company,https://recorda-six.vercel.app`.

---

### 5. Banco de Dados

- **Driver**: `pg` (node-postgres), pool de 20 conexões.
- **Opção 1 (recomendada)**: `DATABASE_URL=postgresql://user:pass@host:5432/dbname` — Railway injeta automaticamente quando o serviço PostgreSQL está vinculado.
- **Opção 2**: variáveis individuais `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- **SSL**: em produção, SSL é ativado automaticamente a menos que `DB_SSL=false`. Para certificados autoassinados, adicionar também `DB_SSL_REJECT_UNAUTHORIZED=false`.
- **Porta local dev**: 5433 (host) → 5432 (container). Em Railway, porta padrão é 5432.

---

### 6. Banco de Dados — SSL

Comportamento automático no código (`connection.ts`):

```
NODE_ENV=production → SSL ativo (a menos que DB_SSL=false)
DB_SSL_REJECT_UNAUTHORIZED=false → aceita certs autoassinados
```

**Status: ✅ OK** — comportamento correto para Railway com PostgreSQL gerenciado.

---

### 7. Migrations — Runner

- **Arquivo**: `packages/backend/src/infrastructure/database/migrate.ts`
- **Ativação**: o `CMD` do `Dockerfile.backend` executa `migrate.js` **antes** de subir o servidor:
  ```dockerfile
  CMD sh -c "node packages/backend/dist/infrastructure/database/migrate.js && node packages/backend/dist/main.js"
  ```
- **Idempotência**: migrations já aplicadas são ignoradas (`schema_migrations` tabela; aliases para `074a`).
- **Diretório**: lê exclusivamente `db/migrations/*.sql` ordenado alfabeticamente.
- **Status: ✅ OK** — nenhuma ação manual necessária; migrations rodam automaticamente no deploy.

---

### 8. Migrations — Duplicatas de Prefixo Numérico

**Encontrado:** dois pares com prefixo repetido:

| Par | Arquivos                                                               | Observação                                       |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| 074 | `074_gestao_pessoas.sql` / `074a_cq_avaliacoes_aceitar_apensos.sql`    | `074a` usa sufixo; alias registrado no runner    |
| 096 | `096_comunicados_internos_extensao.sql` / `096_push_subscriptions.sql` | **Sem alias** — dois arquivos com prefixo `096_` |

**Impacto funcional:** o runner usa o nome completo do arquivo como chave em `schema_migrations`, não apenas o prefixo numérico. Portanto, os dois arquivos `096_*` são tratados como versões independentes e **ambos são aplicados corretamente**.

**Risco:** viola a regra 2 de `db/migrations/REGRAS.md` ("Não repetir prefixo numérico"). Pode causar confusão de ordem de aplicação em ambientes novos onde ambas as migrations ainda não foram aplicadas — ordem depende de ordenação alfabética (`096_comunicados...` antes de `096_push...`).

**Classificação:** ⚠️ **TÉCNICO / BACKLOG** — funciona em produção, mas deve ser corrigido na próxima janela de manutenção renomeando `096_push_subscriptions.sql` para `098_push_subscriptions.sql` (próximo disponível após 097) com alias no runner para ambientes já migrados.

**Ação para este deploy:** nenhuma — aplicar as migrations normalmente; observar logs de startup para confirmar que ambas as `096_*` aparecem como "applied".

---

### 9. Storage / Uploads — Persistência

**Situação atual:**

- O `Dockerfile.backend` cria os diretórios de upload no momento do build:
  ```
  uploads/planilhas  uploads/ocr  uploads/ocr-recebimento
  uploads/ausencias  uploads/logos  uploads/relatorios
  uploads/mapas/original  uploads/mapas/corrigidas  uploads/mapas/thumbs
  ```
- O backend escreve arquivos em `process.cwd()/uploads/*` (caminhos relativos ao processo).
- **Containers são efêmeros**: qualquer redeploy ou restart apaga os arquivos dentro do container.

**Subdiretórios e uso:**

| Diretório                 | Conteúdo                                        | Risco                     |
| ------------------------- | ----------------------------------------------- | ------------------------- |
| `uploads/planilhas`       | Planilhas de importação                         | Perda no redeploy         |
| `uploads/ocr`             | Arquivos OCR de documentos                      | Perda no redeploy         |
| `uploads/ocr-recebimento` | OCR de recebimentos                             | Perda no redeploy         |
| `uploads/ausencias`       | Comprovantes de ausência                        | Perda no redeploy         |
| `uploads/logos`           | Logo da empresa (banco + arquivo)               | Perda no redeploy         |
| `uploads/mapas`           | Mapas capturados (original + corrigido + thumb) | Perda no redeploy         |
| `uploads/relatorios`      | PDFs gerados                                    | Baixo risco (regenerável) |

**Observação sobre logos:** a migration `085_logo_in_database.sql` armazena o logo no banco (`configuracao_empresa.logo_blob`). O diretório `uploads/logos` pode ser redundante dependendo da implementação atual, mas `pdf-export-service.ts` e `operacional-pdf-service.ts` resolvem o logo via `path.resolve('uploads', 'logos')`, indicando que ainda é usado.

**Ação recomendada (pré-produção real, não para esta promoção):**

- Montar volume persistente no Railway para `/app/uploads`, ou
- Migrar uploads para armazenamento externo (S3-compatible: Cloudflare R2, AWS S3).
- Para este ambiente de homologação interna: documentar a limitação e evitar uploads críticos que não possam ser recriados.

---

### 10. Healthcheck Backend

- **Endpoint**: `GET /health` → HTTP 200 (registrado em `routes/health.ts`)
- **Porta**: 3001 (definida no Dockerfile como `ENV PORT=3001`)
- **Configuração Railway** (`railway.json`): `healthcheckPath: "/health"`, timeout 120s
- **Status: ✅ OK**

---

### 11. Healthcheck Frontend (nginx)

**Problema encontrado:**

O arquivo `healthcheck.sh` contém:

```bash
curl -sf http://localhost:3000/health
```

A imagem base do `Dockerfile.frontend` é `nginx:alpine`. A imagem `nginx:alpine` **não inclui `curl` por padrão**. Isso faz com que o HEALTHCHECK do Docker falhe com `command not found`.

**Workarounds:**

- **Opção A (preferida):** substituir `curl` por `wget` no script — `wget -q -O /dev/null http://localhost:3000/health`.
- **Opção B:** adicionar `apk add --no-cache curl` no `Dockerfile.frontend` após a instrução `FROM nginx:alpine`.

**Impacto para Railway/Vercel:** Railway usa o `healthcheckPath` definido em `railway.json` diretamente (HTTP check), **não** o HEALTHCHECK do Dockerfile. Portanto, o backend não é afetado. O frontend é deployado via Vercel (sem Docker), portanto o `Dockerfile.frontend` e `healthcheck.sh` **não são usados no deploy Vercel**.

**Impacto prático para homologação via Railway+Vercel:** nenhum bloqueador. O bug no healthcheck.sh só impacta deploys via `docker compose` ou Docker standalone do frontend.

**Classificação:** ⚠️ **BACKLOG** — corrigir antes de usar `Dockerfile.frontend` em produção Docker.

---

### 12. HTTPS / TLS

- **Railway**: provisiona certificado TLS automaticamente para o domínio `*.up.railway.app` e domínios customizados configurados.
- **Vercel**: provisiona certificado TLS automaticamente.
- **Status: ✅ OK** — nenhuma configuração adicional necessária.

---

### 13. Rate Limiting

- **Global**: 100 req/min por IP, ativo somente quando `NODE_ENV=production`.
- **Granular (sempre ativo)**:
  - `POST /auth/login`: 5 req/min
  - `POST /auth/forgot-password`: 3 req/min
  - `POST /auth/reset-password`: 5 req/min
  - `POST /operacional/fontes-importacao/*/importar`: 30 req/min
- **Status: ✅ OK**

---

### 14. Helmet / Security Headers

- Registrado via `@fastify/helmet`.
- **CSP do Helmet**: ativo apenas em `NODE_ENV=production` (`contentSecurityPolicy: process.env.NODE_ENV === 'production'`).
- `crossOriginResourcePolicy: false` — necessário para servir assets de uploads.
- **Status: ✅ OK**

---

### 15. CSP nginx (frontend)

**Encontrado em `nginx.conf`:**

```
add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'";
```

`'unsafe-inline'` permite execução de scripts inline, reduzindo a proteção contra XSS.

**Impacto atual:** o frontend Vercel **não usa o `nginx.conf`** deste repositório — Vercel serve os assets estáticos diretamente com seus próprios headers. O `nginx.conf` só é usado quando o `Dockerfile.frontend` é executado (deploy Docker).

**Classificação:** ⚠️ **BACKLOG** — para hardening em deploy Docker futuro, restringir CSP removendo `'unsafe-inline'` e adicionando nonces ou hashes, após auditoria dos scripts inline do React.

---

### 16. Criação do Usuário Administrador

O banco de dados não inclui um usuário administrador padrão nas migrations. Para criar o primeiro admin em ambiente novo:

```bash
# Definir variáveis de ambiente do banco antes de executar
ADMIN_EMAIL="admin@suaempresa.com" \
ADMIN_PASSWORD="senha_forte_aqui" \
ADMIN_NAME="Administrador" \
node scripts/create-admin-user.js
```

O script é idempotente — se o e-mail já existir, não faz nada.

Variáveis do script:

| Variável         | Padrão                | Observação                                          |
| ---------------- | --------------------- | --------------------------------------------------- |
| `ADMIN_EMAIL`    | `admin@recorda.local` | Alterar para e-mail corporativo                     |
| `ADMIN_PASSWORD` | —                     | **Obrigatória**; script encerra com erro se ausente |
| `ADMIN_NAME`     | `Administrador`       | Nome de exibição                                    |
| `ADMIN_ROLE`     | `administrador`       | Perfil no sistema                                   |

**Ação: ⚠️ PENDENTE** — executar após o banco estar provisionado e as migrations aplicadas.

---

### 17. SMTP / E-mail

- **Código**: `email-service-smtp.ts` — se `SMTP_HOST` não estiver definido, e-mails são logados no console (sem envio real).
- **Funcionalidades dependentes**: reset de senha (`POST /auth/forgot-password`), notificações.
- **Ação para homologação interna:** opcional. Configurar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` se envio real for necessário. Caso contrário, os e-mails aparecerão nos logs do servidor.

---

### 18. VAPID / Push Notifications

- **Código**: `web-push-service.ts` — se `VAPID_PUBLIC_KEY` ou `VAPID_PRIVATE_KEY` estiverem ausentes, push notifications são silenciosamente desabilitadas.
- **Geração de chaves**: `npm run push:vapid` (script `scripts/generate-vapid-keys.mjs`).
- **Variáveis necessárias**:
  - Backend: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  - Frontend: `VITE_VAPID_PUBLIC_KEY` (deve ser igual ao `VAPID_PUBLIC_KEY` do backend)
- **Ação para homologação:** opcional se push notifications não forem testadas neste ciclo.

---

### 19. OpenAI — Captura de Mapas

- **Padrão**: `OPENAI_IMAGE_ENABLED=false` — processamento via OpenAI desabilitado.
- **Scan fiel (determinístico)**: `MAP_IMAGE_FAITHFUL_SCAN_ENABLED=true` — ativo por padrão, não usa IA generativa.
- **Para habilitar OpenAI**: definir `OPENAI_IMAGE_ENABLED=true` e `OPENAI_API_KEY=<chave>`.
- **Status: ✅ OK** — sem ação necessária para homologação básica.

---

### 20. Build de Produção

```
npm run build
```

**Resultado:**

- Backend: `packages/backend/dist/` — TypeScript compilado para ESM
- Frontend: `packages/frontend/dist/` — bundle Vite + PWA (SW, manifest)
- Shared: `packages/shared/dist/` — tipos compartilhados

**Último resultado:** ✅ Build completo sem erros nem warnings críticos.

---

### 21. Validações Automatizadas

Executadas em 2026-06-01:

| Validação                                         | Resultado                                      |
| ------------------------------------------------- | ---------------------------------------------- |
| `npm run typecheck --workspace=@recorda/backend`  | ✅ 0 erros                                     |
| `npm run typecheck --workspace=@recorda/frontend` | ✅ 0 erros                                     |
| `npm run test --workspace=@recorda/backend`       | ✅ 414/414 testes passando (32 suítes)         |
| `npm run test --workspace=@recorda/frontend`      | ✅ 72/72 testes passando (8 suítes)            |
| `npm run build`                                   | ✅ Sem erros                                   |
| Verificação de duplicatas em migrations           | ⚠️ 2 pares (074/074a e 096/096) — classificado |

---

## Checklist de Ações Antes do Deploy

### Obrigatórias (bloqueadoras)

- [ ] **Railway — Backend**: definir `NODE_ENV=production`
- [ ] **Railway — Backend**: definir `DATABASE_URL` (ou variáveis `DB_*`)
- [ ] **Railway — Backend**: gerar e definir `JWT_SECRET` (`openssl rand -base64 48`)
- [ ] **Railway — Backend**: definir `CORS_ORIGIN=https://recorda.company`
- [ ] **Railway — Backend**: definir `APP_URL=https://recorda.company`
- [ ] **Vercel — Frontend**: definir `VITE_API_BASE=https://api.recorda.company` ou, temporariamente, a URL Railway da API
- [ ] **Banco**: executar `scripts/create-admin-user.js` com `ADMIN_PASSWORD` forte

### Recomendadas

- [ ] Confirmar que ambas as migrations `096_*` foram aplicadas verificando logs de startup do container
- [ ] Verificar que o volume persistente para `/app/uploads` está montado (ou aceitar a limitação ephemeral documentada)
- [ ] Configurar `TZ=America/Sao_Paulo` no Railway

### Backlog (não bloqueadoras para homologação)

- [ ] Corrigir `healthcheck.sh`: substituir `curl` por `wget` (afeta deploy Docker do frontend)
- [ ] Corrigir duplicata de prefixo `096_push_subscriptions.sql` → `098_push_subscriptions.sql` + alias no runner
- [ ] Restringir CSP no `nginx.conf`: remover `'unsafe-inline'`
- [ ] Avaliar persistência de uploads: montar volume ou migrar para S3-compatible

---

## Arquitetura de Deploy de Referência

```
Internet
    │
    ├─── HTTPS ──► Vercel (Frontend)
    │               Vite build / nginx CDN
    │               VITE_API_BASE → api.recorda.company (ou Railway temporariamente)
    │
    └─── HTTPS ──► Railway (Backend)
                    Dockerfile.backend
                    PORT=3001 (Railway sobrescreve)
                    NODE_ENV=production
                    DATABASE_URL → PostgreSQL Railway
                    CORS_ORIGIN → https://recorda.company
```

**Fluxo de inicialização do backend (container):**

1. `migrate.js` conecta ao banco e aplica migrations pendentes
2. `main.ts` inicializa config, valida `JWT_SECRET` e `CORS_ORIGIN`
3. Fastify registra plugins (helmet, cors, rate-limit, rotas)
4. Servidor escuta em `0.0.0.0:PORT`
5. Railway confirma healthcheck via `GET /health`

---

_Documento gerado como parte do P1 — Checklist de Promoção para Próximo Ambiente._  
_Nenhuma alteração de código, migration ou funcionalidade foi realizada durante esta auditoria._
