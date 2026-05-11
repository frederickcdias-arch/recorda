# Diagnóstico Técnico — Projeto Recorda

> Gerado em: 2026-05-08  
> Tipo: Leitura profunda / sem alterações  
> Escopo: Todos os pacotes do monorepo

---

## Sumário

1. [Mapa Geral do Projeto](#1-mapa-geral-do-projeto)
2. [Tecnologias e Dependências](#2-tecnologias-e-dependências)
3. [Banco de Dados e Schema](#3-banco-de-dados-e-schema)
4. [Backend, APIs e Serviços](#4-backend-apis-e-serviços)
5. [Frontend e Telas](#5-frontend-e-telas)
6. [Autenticação e Permissões](#6-autenticação-e-permissões)
7. [Fluxos Principais](#7-fluxos-principais)
8. [Inconsistências e Problemas Encontrados](#8-inconsistências-e-problemas-encontrados)
9. [Pontos Incompletos](#9-pontos-incompletos)
10. [Configurações de Ambiente e Deploy](#10-configurações-de-ambiente-e-deploy)

---

## 1. Mapa Geral do Projeto

### Tipo de projeto

Sistema de Gestão Documental e Produção para arquivamento físico de documentos públicos. Inclui fluxo operacional completo: recebimento → preparação → digitalização → conferência → controle de qualidade → entrega.

### Estrutura

**Monorepo** com npm workspaces. Três pacotes em `packages/`:

| Pacote              | Caminho              | Função                            |
| ------------------- | -------------------- | --------------------------------- |
| `@recorda/backend`  | `packages/backend/`  | API REST (Fastify)                |
| `@recorda/frontend` | `packages/frontend/` | SPA (React + Vite)                |
| `@recorda/shared`   | `packages/shared/`   | Tipos e constantes compartilhados |

### Pastas relevantes na raiz

| Pasta/Arquivo                                | Função                                                              |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `db/migrations/`                             | 85 migrações SQL numeradas (001–085)                                |
| `db/baseline/`                               | Dump consolidado do schema atual (gerado automaticamente)           |
| `scripts/`                                   | Utilitários de manutenção (bootstrap, importação, criação de admin) |
| `docker-compose.yml`                         | PostgreSQL 15 (porta 5433) + Redis 7 (porta 6380) para dev local    |
| `Dockerfile.backend` / `Dockerfile.frontend` | Imagens Docker                                                      |
| `railway.json`                               | Configuração de deploy do backend no Railway                        |
| `vercel.json`                                | Configuração de deploy do frontend na Vercel                        |
| `nixpacks.toml`                              | Build para Railway via Nixpacks                                     |
| `nginx.conf`                                 | Nginx para servir o frontend em produção                            |
| `docs/`                                      | Documentação técnica (changelogs, diagnósticos, regras)             |
| `uploads/`                                   | Arquivos locais: OCR, planilhas, relatórios                         |
| `tests/`                                     | Testes de carga (load) e manuais                                    |

---

## 2. Tecnologias e Dependências

### Runtime e linguagem

| Item      | Valor                                          |
| --------- | ---------------------------------------------- |
| Linguagem | TypeScript 5.4                                 |
| Node.js   | >= 20.0.0                                      |
| Módulos   | ESM (`"type": "module"` em backend e frontend) |

### Backend (`@recorda/backend`)

| Categoria               | Biblioteca                    | Versão        |
| ----------------------- | ----------------------------- | ------------- |
| Framework HTTP          | Fastify                       | ^5.7.4        |
| Banco de dados          | pg (PostgreSQL)               | ^8.11.3       |
| Cache                   | redis                         | ^4.6.10       |
| Autenticação            | @fastify/jwt + bcryptjs       | ^10 / ^3      |
| Validação               | zod                           | ^4.3.6        |
| Upload de arquivos      | @fastify/multipart            | ^9.4.0        |
| Rate limiting           | @fastify/rate-limit           | ^10.3.0       |
| Segurança HTTP          | @fastify/helmet               | ^13.0.2       |
| CORS                    | @fastify/cors                 | ^11.2.0       |
| OpenAPI/Swagger         | @fastify/swagger + swagger-ui | ^9 / ^5       |
| OCR                     | tesseract.js                  | ^7.0.0        |
| Processamento de imagem | sharp                         | ^0.34.5       |
| PDF                     | pdf-lib + pdfkit              | ^1.17 / ^0.15 |
| Excel                   | exceljs                       | ^4.4.0        |
| E-mail                  | nodemailer                    | ^8.0.1        |
| Parsing HTML            | cheerio                       | ^1.0.0-rc.12  |
| Planilhas legado        | xlsx                          | ^0.18.5       |
| Variáveis de ambiente   | dotenv                        | ^17.2.3       |
| Dev server              | tsx (watch)                   | ^4.7.0        |
| Testes                  | vitest                        | ^1.3.0        |

### Frontend (`@recorda/frontend`)

| Categoria             | Biblioteca                  | Versão     |
| --------------------- | --------------------------- | ---------- |
| Framework UI          | React                       | ^18.2.0    |
| Build                 | Vite                        | ^5.1.0     |
| Roteamento            | react-router-dom            | ^7.13.0    |
| Data fetching / cache | @tanstack/react-query       | ^5.90.21   |
| CSS                   | Tailwind CSS                | ^3.4.1     |
| Gráficos              | recharts                    | ^3.7.0     |
| Markdown              | react-markdown + remark-gfm | ^10 / ^4   |
| PWA                   | vite-plugin-pwa + workbox   | ^0.19 / ^7 |
| Testes unitários      | vitest + @testing-library   | ^1.6       |
| Testes E2E            | Playwright                  | ^1.58      |

### Shared (`@recorda/shared`)

Apenas TypeScript. Exporta tipos de entidades, DTOs, constantes e utilitários usados por frontend e backend.

### Scripts da raiz (`package.json`)

```
dev             → concurrently backend + frontend em dev
build           → build de todos os workspaces
lint / lint:fix → ESLint
format          → Prettier
typecheck       → tsc --noEmit em todos os workspaces
db:migrate      → executa migrations no backend
db:bootstrap    → script de bootstrap do banco
prepare         → husky (git hooks)
```

---

## 3. Banco de Dados e Schema

### Banco usado

**PostgreSQL 15** (sem ORM — SQL puro via `pg.Pool`).

### Gerenciamento de migrations

- Script: `packages/backend/src/infrastructure/database/migrate.ts`
- Pasta de migrations: `db/migrations/` (85 arquivos numerados)
- Pasta de baseline: `db/baseline/` (dump consolidado aplicado em banco vazio)
- Tabela de controle: `schema_migrations (version, applied_at)`
- Estratégia: se o banco está vazio, aplica o baseline; depois aplica apenas migrations ainda não registradas.

### Extensões PostgreSQL

- `uuid-ossp` (geração de UUIDs)

### ENUMs do banco

| Enum                         | Valores                                                                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `perfil_usuario`             | `operador`, `supervisor`, `administrador`, `colaborador` _(supervisor legado, colaborador adicionado em 066)_                                                                                                                 |
| `etapa_fluxo`                | `RECEBIMENTO`, `PREPARACAO`, `DIGITALIZACAO`, `DIGITALIZACAO_COLORIDA`, `CONFERENCIA`, `RECONFERENCIA` _(084)_, `MONTAGEM`, `CONTROLE_QUALIDADE`, `ENTREGA`                                                                   |
| `status_repositorio`         | `RECEBIDO`, `EM_PREPARACAO`, `PREPARADO`, `EM_DIGITALIZACAO`, `DIGITALIZADO`, `EM_CONFERENCIA`, `CONFERIDO`, `EM_MONTAGEM`, `MONTADO`, `AGUARDANDO_CQ_LOTE`, `EM_CQ`, `CQ_APROVADO`, `CQ_REPROVADO`, `EM_ENTREGA`, `ENTREGUE` |
| `status_checklist`           | `ABERTO`, `CONCLUIDO`                                                                                                                                                                                                         |
| `status_importacao`          | `PENDENTE`, `PROCESSANDO`, `CONCLUIDA`, `ERRO`, `CANCELADA`                                                                                                                                                                   |
| `status_lote_cq`             | `ABERTO`, `FECHADO`                                                                                                                                                                                                           |
| `status_ocr`                 | `PENDENTE`, `PROCESSANDO`, `CONCLUIDO`, `ERRO`                                                                                                                                                                                |
| `status_processo`            | `ATIVO`, `ARQUIVADO`, `SUSPENSO`, `CANCELADO`                                                                                                                                                                                 |
| `tipo_operacao` (auditoria)  | `INSERT`, `UPDATE`, `DELETE`, `CANCEL`                                                                                                                                                                                        |
| `unidade_medida`             | `PROCESSO`, `VOLUME`, `PAGINA`, `DOCUMENTO`                                                                                                                                                                                   |
| `kb_categoria`               | `MANUAIS`, `PROCEDIMENTOS_ETAPA`, `CHECKLISTS_EXPLICADOS`, `GLOSSARIO`, `NORMAS_LEIS`, `ATUALIZACOES_PROCESSO`                                                                                                                |
| `kb_nivel_acesso`            | `OPERADOR_ADMIN`, `ADMIN`                                                                                                                                                                                                     |
| `kb_status_documento`        | `ATIVO`, `INATIVO`                                                                                                                                                                                                            |
| `tipo_relatorio_operacional` | `RECEBIMENTO`, `PRODUCAO`, `ENTREGA`                                                                                                                                                                                          |
| `tipo_excecao_repositorio`   | `MIDIA`, `COLORIDO`, `MAPA`, `FRAGILIDADE`                                                                                                                                                                                    |
| `tipo_fonte`                 | `SISTEMA`, `PLANILHA`, `MANUAL`, `OCR`, `API`                                                                                                                                                                                 |
| `tipo_importacao`            | `PLANILHA`, `SISTEMA`, `OCR`, `MANUAL`                                                                                                                                                                                        |
| `tipo_movimentacao_armario`  | `RETIRADA`, `DEVOLUCAO`                                                                                                                                                                                                       |
| `resultado_item_checklist`   | `CONFORME`, `NAO_CONFORME_COM_TRATATIVA`                                                                                                                                                                                      |
| `resultado_cq_item`          | `PENDENTE`, `APROVADO`, `REPROVADO`                                                                                                                                                                                           |
| `status_artigo`              | `RASCUNHO`, `PUBLICADO`, `ARQUIVADO`                                                                                                                                                                                          |
| `status_tratativa_excecao`   | `ABERTA`, `EM_TRATATIVA`, `RESOLVIDA`                                                                                                                                                                                         |
| `tipo_apenso`                | `APENSO`, `ANEXO`, `APENSAMENTO`                                                                                                                                                                                              |

### Tabelas principais

| Tabela                           | Descrição                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `usuarios`                       | Usuários do sistema (login + perfil)                                           |
| `coordenadorias`                 | Unidades organizacionais                                                       |
| `colaboradores`                  | Pessoas que executam produção (vinculadas a coordenadorias)                    |
| `refresh_tokens`                 | Tokens de refresh JWT (hash, validade, revogado)                               |
| `repositorios`                   | Unidade central do fluxo operacional (id_ged + org + projeto + status + etapa) |
| `historico_etapas`               | Log de transições de etapa dos repositórios                                    |
| `recebimento_processos`          | Processos registrados no recebimento                                           |
| `recebimento_volumes`            | Volumes de processos                                                           |
| `recebimento_apensos`            | Apensos de processos principais                                                |
| `recebimento_apenso_volumes`     | Volumes de apensos                                                             |
| `recebimento_documentos`         | Documentos OCR do recebimento                                                  |
| `setores_recebimento`            | Setores de origem dos documentos                                               |
| `classificacoes_recebimento`     | Classificações dos processos recebidos                                         |
| `armarios`                       | Armários físicos de armazenamento                                              |
| `movimentacoes_armario`          | Histórico de retirada/devolução de repositórios nos armários                   |
| `excecoes_repositorio`           | Exceções registradas (MIDIA, COLORIDO, MAPA, FRAGILIDADE)                      |
| `checklist_modelos`              | Modelos de checklist por etapa                                                 |
| `checklists`                     | Checklists abertos/concluídos por repositório e etapa                          |
| `checklist_itens`                | Itens respondidos de cada checklist                                            |
| `producao_repositorio`           | Registro de produção por repositório, etapa e checklist                        |
| `lotes_controle_qualidade`       | Lotes de CQ (máx. 10 repositórios)                                             |
| `lotes_controle_qualidade_itens` | Itens individuais do lote de CQ                                                |
| `kb_documentos`                  | Documentos da base de conhecimento                                             |
| `kb_documento_versoes`           | Versões de cada documento KB                                                   |
| `kb_documento_etapas`            | Associação documento KB ↔ etapa                                                |
| `metas_producao`                 | Metas diária/mensal por etapa                                                  |
| `mapeamentos_importacao`         | Mapeamentos de colunas para importação de planilhas                            |
| `importacoes_legado_operacional` | Log de importações do sistema legado                                           |
| `configuracao_empresa`           | Dados da empresa (logo, CNPJ, endereço)                                        |
| `configuracao_projetos`          | Projetos configuráveis                                                         |
| `auditoria`                      | Log de todas as operações auditadas (INSERT/UPDATE/DELETE)                     |
| `schema_migrations`              | Controle de migrations aplicadas                                               |
| `registros_producao`             | Produção registrada pelo sistema antigo (legado)                               |

> **Tabelas legado provavelmente removidas** por `039_drop_orphan_tables.sql` e `072_drop_tabelas_legado_artigos.sql`: artigos, tags, artigos_tags, artigos_relacionados, processos_principais, volumes, apensos, documentos_ocr, fontes_dados antigas.

### Funções e triggers do banco

| Função                                              | Disparada por                               | Função                                                                |
| --------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| `audit_trigger_function()`                          | INSERT/UPDATE/DELETE em tabelas auditadas   | Insere registro na tabela `auditoria` com snapshot JSONB antes/depois |
| `check_registros_producao_immutable()`              | BEFORE UPDATE em `registros_producao`       | Impede qualquer alteração exceto cancelamento                         |
| `check_delete_registros_producao()`                 | BEFORE DELETE em `registros_producao`       | Só permite delete se `importacao_id IS NOT NULL`                      |
| `fn_validar_avanco_etapa_repositorio()`             | BEFORE UPDATE em `repositorios`             | Bloqueia avanço de etapa sem checklist concluído                      |
| `fn_validar_conclusao_checklist()`                  | BEFORE UPDATE em `checklists`               | Bloqueia conclusão se itens obrigatórios incompletos                  |
| `fn_validar_fechamento_lote_cq()`                   | BEFORE UPDATE em `lotes_controle_qualidade` | Exige exatamente 10 itens sem pendências                              |
| `fn_aplicar_resultado_cq_em_repositorios()`         | AFTER UPDATE em `lotes_controle_qualidade`  | Ao fechar lote: APROVADO → ENTREGUE, REPROVADO → CQ_REPROVADO         |
| `fn_validar_producao_com_checklist_ativo()`         | BEFORE INSERT em `producao_repositorio`     | Exige checklist ABERTO da mesma etapa e repositório                   |
| `artigos_busca_trigger()`                           | INSERT/UPDATE em `artigos` (legado)         | Full-text search em português                                         |
| `update_timestamp()` / `update_updated_at_column()` | UPDATE em diversas tabelas                  | Atualiza `atualizado_em` automaticamente                              |

### Relações principais

```
usuarios ─── coordenadorias (1:N)
colaboradores ─── coordenadorias (N:1)
repositorios ─── recebimento_processos (1:N)
repositorios ─── checklists (1:N)
repositorios ─── producao_repositorio (1:N)
repositorios ─── lotes_controle_qualidade_itens (N:M via lote)
checklists ─── checklist_itens (1:N)
checklist_itens ─── checklist_modelos (N:1)
lotes_controle_qualidade ─── lotes_controle_qualidade_itens (1:N)
kb_documentos ─── kb_documento_versoes (1:N)
kb_documentos ─── kb_documento_etapas (N:M via join table)
```

---

## 4. Backend, APIs e Serviços

### Arquitetura

O backend segue uma estrutura inspirada em **Clean Architecture / Ports & Adapters**:

```
src/
  main.ts                    ← bootstrap da aplicação
  infrastructure/
    config/                  ← configuração lida de variáveis de ambiente
    database/
      connection.ts          ← pg.Pool centralizado
      migrate.ts             ← runner de migrations
    http/
      server.ts              ← criação e configuração do Fastify
      middleware/
        auth.ts              ← authenticate(), authorize(), requireAuth()
        error-handler.ts     ← handler padrão de erros
        validate.ts          ← validação de body via Zod
      routes/                ← todos os módulos de rota
      schemas/               ← schemas Zod de validação
    repositories/            ← repository de usuário (pouco usado; maioria é SQL inline)
    services/                ← OCR, PDF, Excel, e-mail, etiqueta PDF
    logging/                 ← logger estruturado
  application/
    ports/                   ← interfaces OCRService, EmailService
    services/                ← não-identificado no código atual (pasta vazia exceto .gitkeep)
    use-cases/               ← gerar-relatorio-completo.ts
  domain/
    entities/                ← não-identificado no código atual (verificar se há entidades de domínio)
    producao/
      producao-metrics.ts    ← helpers SQL para cálculo de produção contabilizada
    value-objects/           ← não-identificado no código atual
```

> **Observação**: A camada `application/services/` e `domain/entities/` parecem estar vazias ou pouco populadas. A maioria da lógica de negócio está inline nas rotas.

### Módulos de rota registrados

| Rota base                                                                                                             | Arquivo                            | Perfis com acesso                                                      |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `/health`                                                                                                             | `health.ts`                        | Público                                                                |
| `/auth/*`                                                                                                             | `auth.ts`                          | Público (login/refresh/forgot/reset), Autenticado (me/logout/register) |
| `/dashboard`                                                                                                          | `dashboard.ts`                     | Autenticado                                                            |
| `/relatorios`                                                                                                         | `relatorios.ts`                    | operador, administrador                                                |
| `/colaboradores`, `/coordenadorias`                                                                                   | `colaboradores.ts`                 | Autenticado                                                            |
| `/etapas`                                                                                                             | `etapas.ts`                        | Autenticado                                                            |
| `/auditoria`                                                                                                          | `auditoria.ts`                     | Autenticado                                                            |
| `/producao/metas`, `/producao/lancar`, `/producao/historico`, `/producao/*`                                           | `metas.ts`                         | Variado (ver abaixo)                                                   |
| `/operacional/repositorios`                                                                                           | `operacional-repositorios.ts`      | operador, administrador                                                |
| `/operacional/setores-recebimento`, `/operacional/classificacoes-recebimento`, `/operacional/recebimento-processos/*` | `operacional-recebimento.ts`       | operador, administrador                                                |
| `/operacional/avulsos/*`                                                                                              | `operacional-avulsos.ts`           | operador, administrador                                                |
| `/operacional/fontes-importacao/*`, `/operacional/importacoes-legado/*`                                               | `operacional-importacao-legado.ts` | operador, administrador                                                |
| `/operacional/checklist-modelos/*`, `/operacional/repositorios/:id/checklist/*`                                       | `operacional-checklists.ts`        | operador, administrador                                                |
| `/operacional/lotes-cq/*`                                                                                             | `operacional-cq.ts`                | administrador (criar/fechar), operador/administrador (auditar)         |
| `/operacional/etiquetas/*`                                                                                            | `operacional-etiquetas.ts`         | operador, administrador                                                |
| `/operacional/conhecimento/*`                                                                                         | `conhecimento-operacional.ts`      | operador, administrador                                                |
| `/configuracao/*`                                                                                                     | `configuracao.ts`                  | administrador                                                          |
| `/admin/*`                                                                                                            | `admin.ts`                         | administrador                                                          |

### Endpoints de autenticação (`/auth/*`)

| Método  | Rota                              | Função                                                                 |
| ------- | --------------------------------- | ---------------------------------------------------------------------- |
| `POST`  | `/auth/login`                     | Login com e-mail + senha, retorna accessToken (8h) + refreshToken (7d) |
| `POST`  | `/auth/refresh`                   | Renova access token usando refresh token válido                        |
| `POST`  | `/auth/logout`                    | Revoga refresh token                                                   |
| `GET`   | `/auth/me`                        | Retorna dados do usuário autenticado                                   |
| `POST`  | `/auth/register`                  | Cria novo usuário (requer autenticação)                                |
| `PUT`   | `/auth/usuarios/:id`              | Atualiza dados do usuário                                              |
| `PATCH` | `/auth/usuarios/:id/toggle-ativo` | Ativa/desativa usuário                                                 |
| `GET`   | `/auth/usuarios`                  | Lista usuários                                                         |
| `POST`  | `/auth/forgot-password`           | Envia e-mail de reset de senha                                         |
| `POST`  | `/auth/reset-password`            | Confirma reset com token                                               |

### Rate limits configurados

| Rota                                               | Limite  |
| -------------------------------------------------- | ------- |
| `POST /auth/login`                                 | 5/min   |
| `POST /auth/forgot-password`                       | 3/min   |
| `POST /auth/reset-password`                        | 5/min   |
| `POST /operacional/fontes-importacao/:id/importar` | 30/min  |
| `POST /operacional/importacoes-legado/*`           | 3/min   |
| `POST */ocr-preview`                               | 10/min  |
| `POST /operacional/relatorios/*`                   | 5/min   |
| Global (produção)                                  | 100/min |

### Endpoints legacy bloqueados (HTTP 410)

As rotas `/recebimento/*` e `/conhecimento/*` retornam **410 Gone** com mensagem de migração para `/operacional/*`.

### Serviços de infraestrutura

| Serviço         | Arquivo                      | Descrição                                                                                        |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| OCR             | `ocr-service-default.ts`     | Tesseract.js com pré-processamento via `sharp` (idioma: `por`). Retorna texto + confiança (0–1). |
| E-mail          | `email-service-smtp.ts`      | SMTP via nodemailer em produção; console log em dev (sem SMTP_HOST).                             |
| PDF operacional | `operacional-pdf-service.ts` | PDFs de relatório de recebimento, produção, entrega.                                             |
| PDF exportação  | `pdf-export-service.ts`      | Exportação de relatórios gerenciais.                                                             |
| Excel           | `excel-export-service.ts`    | Exportação de relatórios gerenciais.                                                             |
| Etiqueta PDF    | `etiqueta-pdf-service.ts`    | Etiquetas físicas para repositórios.                                                             |
| Armazenamento   | `file-storage.ts`            | Armazenamento de arquivos em disco local (pasta `uploads/`).                                     |

---

## 5. Frontend e Telas

### Organização do código

```
src/
  App.tsx              ← provider de AuthContext + QueryClient + RouterProvider
  main.tsx             ← ponto de entrada
  routes/index.tsx     ← definição de todas as rotas com lazy loading
  config/menu.ts       ← estrutura do menu lateral por perfil
  contexts/
    AuthContext.tsx    ← estado global de autenticação
  components/
    auth/
      ProtectedRoute.tsx   ← redireciona não-autenticados para /login
      RoleRoute.tsx        ← redireciona perfil não-autorizado para /dashboard
    layout/
      AppLayout.tsx        ← layout principal (sidebar + header + outlet)
      Sidebar.tsx          ← navegação lateral
      Header.tsx           ← cabeçalho
      MobileBottomNav.tsx  ← nav inferior mobile
    ui/                    ← biblioteca de componentes base (Button, Card, Input, etc.)
  hooks/
    useQueries.ts          ← todos os hooks de data fetching (TanStack Query)
    useRecebimento.ts      ← hooks específicos do fluxo de recebimento
    useRecebimentoAvulsos.ts
    useConfirmDialog.ts
    useDebounce.ts
    useUltimoIdRepositorioGed.ts
  services/
    api.ts             ← cliente HTTP centralizado (fetch + auth header automático)
    tokenStorage.ts    ← gerenciamento de tokens (sessionStorage / localStorage)
  pages/               ← páginas do sistema
  types/               ← tipos de navegação e UI
  utils/               ← formatação de datas, números, erros, etapas
```

### Páginas existentes

| Rota                                | Componente                                    | Perfil                  | Função                                                 |
| ----------------------------------- | --------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| `/login`                            | `Login.tsx`                                   | Público                 | Autenticação                                           |
| `/forgot-password`                  | `ForgotPassword.tsx`                          | Público                 | Solicitar reset de senha                               |
| `/reset-password`                   | `ResetPassword.tsx` / `ResetPasswordPage.tsx` | Público                 | Confirmar reset de senha                               |
| `/dashboard`                        | `Dashboard.tsx`                               | Todos                   | Cards de estatísticas, gráficos, minha produção        |
| `/producao`                         | `ProducaoPage.tsx`                            | operador, administrador | Painel de produção com filtros, paginação, exportação  |
| `/producao/importar`                | `ImportarProducaoPage.tsx`                    | administrador           | Importação de planilhas de produção                    |
| `/minha-producao/lancar`            | `LancarProducaoPage.tsx`                      | colaborador             | Lançamento de produção individual                      |
| `/minha-producao/historico`         | `MeuHistoricoPage.tsx`                        | colaborador             | Histórico pessoal com estatísticas                     |
| `/operacao/recebimento`             | `EtapaOperacionalPage.tsx`                    | operador, administrador | Gestão de repositórios no recebimento                  |
| `/operacao/controle-qualidade`      | `EtapaOperacionalPage.tsx`                    | operador, administrador | Gestão de lotes de CQ                                  |
| `/operacao/conhecimento`            | `ConhecimentoOperacionalPage.tsx`             | operador, administrador | Base de conhecimento KB                                |
| `/relatorios/gerenciais`            | `RelatoriosGerenciaisPage.tsx`                | operador, administrador | Relatórios com filtros e exportação                    |
| `/relatorios/exportacoes`           | `ExportacoesPage.tsx`                         | operador, administrador | Exportações de dados                                   |
| `/configuracoes/empresa`            | `EmpresaPage.tsx`                             | administrador           | Dados e logo da empresa                                |
| `/configuracoes/usuarios`           | `UsuariosPage.tsx`                            | administrador           | CRUD de usuários                                       |
| `/configuracoes/projetos`           | `ProjetosPage.tsx`                            | administrador           | Gestão de projetos                                     |
| `/configuracoes/vincular-producoes` | `VincularProducoesPage.tsx`                   | administrador           | Vincular produções legadas a usuários                  |
| `/configuracoes/admin`              | `AdminPage.tsx`                               | administrador           | Painel administrativo avançado                         |
| `/auditoria`                        | `AuditoriaPage.tsx`                           | Autenticado             | Logs de auditoria (importações, OCR, correções, ações) |
| `*`                                 | `NotFoundPage.tsx`                            | —                       | Página 404                                             |

### Componentes de UI (`components/ui/`)

Biblioteca interna de componentes base: `ActionMenu`, `AgingBadge`, `Alert`, `Badge`, `Button`, `Card`, `ConfirmDialog`, `ErrorBoundary`, `Icon`, `Input`, `LoadingSpinner`, `MarkdownEditor`, `PageState`, `Pagination`, `ProgressIndicator`, `RouteErrorFallback`, `Select`, `Skeleton`, `StatusBadge`, `Toast`.

### Painéis inline na `EtapaOperacionalPage`

A página operacional renderiza painéis condicionais dependendo do parâmetro `:etapa`:

- `recebimento` → painel principal de repositórios + processos/volumes + OCR + checklists + relatórios
- `controle-qualidade` → `ControleQualidadePanel.tsx` (lotes CQ)
- Ambas podem exibir `RecebimentoAvulsosPanel.tsx` e `RecebimentoLoteModal.tsx`

### Hooks principais (`useQueries.ts`)

O arquivo define **todos** os hooks de data fetching em um único módulo (~1000+ linhas). Inclui:

- `useDashboard()` — dados do dashboard
- `useRepositorios()`, `useCreateRepositorio()`, `useDeleteRepositorio()`, `useAvancarEtapa()`
- `useProducao()`, `useDeleteProducao()`, `useLimparProducoes()`
- `useRecebimentoProcessos()`, `useDocumentosRecebimento()`
- `useCriarChecklist()`, `useConcluirChecklist()`
- `useGerarRelatorioRecebimento()`, `useGerarRelatorioProducao()`
- `useRegistrarProducao()`, `useBatchProcessos()`
- `useLotesCQ()`, `useCriarLoteCQ()`, `useFecharLoteCQ()`
- `useKnowledgeDocs()`, `useKnowledgeDocDetalhe()`
- `useUsuarios()`, `useRegisterUsuario()`, `useUpdateUsuario()`
- `useColaboradores()`, `useCoordenadorias()`
- `useEtapas()`, `useMetas()`
- `useAuditoria()`

### PWA

Configurado em produção (`vite.config.ts`): manifest com ícones, `registerType: 'autoUpdate'`, workbox com `NetworkOnly` para `/api/*`.

---

## 6. Autenticação e Permissões

### Fluxo de autenticação

1. `POST /auth/login` → retorna `accessToken` (JWT, 8h) + `refreshToken` (JWT, 7d, hash armazenado no banco)
2. Frontend armazena:
   - `accessToken` → **sempre em `sessionStorage`** (nunca localStorage)
   - `refreshToken` → `localStorage` se `rememberMe=true`, `sessionStorage` caso contrário
3. Toda requisição inclui `Authorization: Bearer <accessToken>` via `api.ts`
4. Quando o servidor retorna 401, o frontend tenta renovar via `POST /auth/refresh`
5. Se a renovação falhar, redireciona para `/login`

### Verificação de autenticação ao carregar

- `AuthContext.tsx` faz `GET /auth/me` ao montar
- Se falhar, tenta renovar o refresh token automaticamente

### Perfis e permissões

| Perfil          | Permissões                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `colaborador`   | Dashboard, lançar própria produção, ver próprio histórico                                         |
| `operador`      | Tudo do colaborador + dashboard, relatórios, importação, captura de documentos, fluxo operacional |
| `administrador` | Tudo + gerenciar configurações, usuários, projetos, CQ, admin                                     |

> **Nota**: O perfil `supervisor` ainda existe no enum do banco mas foi migrado para `operador` em dados (migration 035). O código faz mapeamento `supervisor → OPERADOR` na função `perfilToPapel()` no `auth.ts`.

### Proteção de rotas

**Backend**: middleware `authenticate` verifica JWT, `authorize(...perfis)` verifica papel. Combinado via `requireAuth(...perfis)` ou `preHandler: [server.authenticate, authorize(...)]`.

**Frontend**: `ProtectedRoute` redireciona não-autenticados para `/login`. `RoleRoute` redireciona perfil não-autorizado para `/dashboard` com toast de aviso.

### Segurança adicional

- JWT secret obrigatório (mínimo 32 chars em produção)
- Refresh tokens armazenados como **hash bcrypt** (não em texto plano)
- `set_config('app.current_user_id')` propaga o ID do usuário para os triggers de auditoria PostgreSQL
- Rate limiting granular em endpoints de auth
- Helmet para headers HTTP
- CORS restrito a origem específica em produção

---

## 7. Fluxos Principais

---

### Fluxo 1: Login

**Arquivos envolvidos:**

- `packages/frontend/src/pages/Login.tsx`
- `packages/frontend/src/contexts/AuthContext.tsx`
- `packages/frontend/src/services/api.ts`
- `packages/frontend/src/services/tokenStorage.ts`
- `packages/backend/src/infrastructure/http/routes/auth.ts`

**Como funciona hoje:**

1. Usuário preenche e-mail e senha em `Login.tsx`
2. `AuthContext.login()` chama `api.post('/auth/login', { email, senha })`
3. Backend verifica e-mail (case-insensitive), compara senha com `bcrypt`, retorna JWT
4. Frontend armazena tokens via `tokenStorage.setStoredTokens()`
5. Redireciona para `/dashboard`

**Banco:** tabela `usuarios`, `refresh_tokens`  
**Status:** ✅ Completo e funcional

---

### Fluxo 2: Recebimento de Repositório

**Arquivos envolvidos:**

- `pages/operacao/EtapaOperacionalPage.tsx`
- `hooks/useQueries.ts` (`useCreateRepositorio`, `useBatchProcessos`)
- `packages/backend/src/infrastructure/http/routes/operacional-repositorios.ts`
- `packages/backend/src/infrastructure/http/routes/operacional-recebimento.ts`

**Como funciona hoje:**

1. Operador acessa `/operacao/recebimento`
2. Cria repositório (`POST /operacional/repositorios`) com ID GED, orgão, projeto, classificação
3. Adiciona processos/volumes/apensos ao repositório via OCR ou entrada manual
4. OCR opcional: envia imagem base64 → servidor usa Tesseract.js → retorna texto + confiança
5. Abre checklist de recebimento (`POST /operacional/repositorios/:id/checklist`)
6. Preenche itens do checklist
7. Conclui checklist (`PATCH /operacional/checklists/:id/concluir`)
8. Avança etapa (`POST /operacional/repositorios/:id/avancar-etapa`)
9. Gera relatório de recebimento (PDF)

**Banco:** `repositorios`, `recebimento_processos`, `recebimento_volumes`, `recebimento_apensos`, `checklists`, `checklist_itens`, `historico_etapas`, `relatorios_operacionais`  
**Status:** ✅ Completo

---

### Fluxo 3: Produção (Colaborador)

**Arquivos envolvidos:**

- `pages/colaborador/LancarProducaoPage.tsx`
- `pages/colaborador/MeuHistoricoPage.tsx`
- `packages/backend/src/infrastructure/http/routes/metas.ts` (endpoint `/producao/lancar`)

**Como funciona hoje:**

1. Colaborador acessa `/minha-producao/lancar`
2. Preenche: data, ID do repositório GED, etapa, função (tipo), coordenadoria, quantidade
3. Envia `POST /producao/lancar`
4. Registro é criado em `producao_repositorio` com `marcadores.origem = 'SISTEMA'`
5. Visualiza histórico em `/minha-producao/historico`

**Banco:** `producao_repositorio`, `usuarios`, `repositorios`  
**Status:** ✅ Parcialmente completo (ver inconsistência abaixo)

---

### Fluxo 4: Importação de Produção Legada

**Arquivos envolvidos:**

- `pages/producao/ImportarProducaoPage.tsx`
- `packages/backend/src/infrastructure/http/routes/operacional-importacao-legado.ts`

**Como funciona hoje:**

1. Administrador faz upload de planilha (`POST /operacional/importacoes-legado/validar`)
2. Sistema valida e retorna preview com erros/avisos
3. Administrador confirma (`POST /operacional/importacoes-legado/importar`)
4. Registros são inseridos em `producao_repositorio` com `marcadores.origem = 'LEGADO'`
5. Log salvo em `importacoes_legado_operacional`

**Banco:** `producao_repositorio`, `repositorios`, `importacoes_legado_operacional`  
**Status:** ✅ Completo

---

### Fluxo 5: Controle de Qualidade

**Arquivos envolvidos:**

- `pages/operacao/ControleQualidadePanel.tsx`
- `packages/backend/src/infrastructure/http/routes/operacional-cq.ts`

**Como funciona hoje:**

1. Administrador cria lote de CQ com 1–10 repositórios (`POST /operacional/lotes-cq`)
2. Auditor avalia cada repositório (`PATCH /operacional/lotes-cq/:loteId/itens/:itemId`)
3. Ao finalizar as avaliações, fecha o lote (`PATCH /operacional/lotes-cq/:id/fechar`)
4. Trigger `fn_aplicar_resultado_cq_em_repositorios()` aplica os resultados:
   - APROVADO → status `ENTREGUE`, etapa `ENTREGA`
   - REPROVADO → status `CQ_REPROVADO`, etapa `CONFERENCIA`
5. Gera relatório de entrega (PDF)

**Banco:** `lotes_controle_qualidade`, `lotes_controle_qualidade_itens`, `repositorios`, `historico_etapas`, `relatorios_operacionais`  
**Status:** ✅ Completo (lote exige exatamente 10 itens no trigger — verificar se isso é intencionado)

---

### Fluxo 6: Relatórios Gerenciais

**Arquivos envolvidos:**

- `pages/relatorios/RelatoriosGerenciaisPage.tsx`
- `packages/backend/src/infrastructure/http/routes/relatorios.ts`
- `packages/backend/src/infrastructure/services/pdf-export-service.ts`
- `packages/backend/src/infrastructure/services/excel-export-service.ts`
- `packages/backend/src/application/use-cases/gerar-relatorio-completo.ts`

**Como funciona hoje:**

1. Operador/admin seleciona período e tipo de relatório
2. `GET /relatorios?dataInicio=&dataFim=&formato=pdf|excel|json`
3. Backend consulta `producao_repositorio`, `registros_producao`, `colaboradores`, `etapas`
4. Retorna JSON ou gera PDF/Excel

**Banco:** `producao_repositorio`, `registros_producao`, `colaboradores`, `etapas`, `coordenadorias`, `configuracao_empresa`  
**Status:** ✅ Completo

---

### Fluxo 7: Base de Conhecimento Operacional

**Arquivos envolvidos:**

- `pages/operacao/ConhecimentoOperacionalPage.tsx`
- `packages/backend/src/infrastructure/http/routes/conhecimento-operacional.ts`

**Como funciona hoje:**

1. Operador/admin acessa `/operacao/conhecimento`
2. Listagem de documentos com filtro por categoria, etapa, busca full-text
3. Criação/edição de documentos com suporte a Markdown e versionamento
4. Glossário e leis/normas em seções dedicadas

**Banco:** `kb_documentos`, `kb_documento_versoes`, `kb_documento_etapas`  
**Status:** ✅ Completo

---

### Fluxo 8: Reset de Senha

**Arquivos envolvidos:**

- `pages/ForgotPassword.tsx`, `pages/ResetPasswordPage.tsx`
- `packages/backend/src/infrastructure/http/routes/auth.ts`
- `packages/backend/src/infrastructure/services/email-service-smtp.ts`

**Como funciona hoje:**

1. Usuário informa e-mail em `/forgot-password`
2. `POST /auth/forgot-password` → gera token, armazena hash em `usuarios.reset_password_token` (ou tabela similar — **não confirmado no schema do baseline**)
3. Envia e-mail com link `APP_URL/reset-password?token=...`
4. Usuário confirma nova senha via `POST /auth/reset-password`

**Status:** ⚠️ Parcial — o schema do baseline não mostra coluna de reset token na tabela `usuarios`. Pode ter sido adicionado em migration posterior não inspecionada.

---

## 8. Inconsistências e Problemas Encontrados

### CONFIRMADOS no código

#### 8.1 — Coluna `usuario_id` inexistente na tabela `auditoria`

**Arquivo:** `packages/backend/src/infrastructure/http/routes/auditoria.ts` (linha 55)  
**Problema:** A query SELECT na rota de auditoria inclui `usuario_id` na cláusula de retorno, mas o schema da tabela `auditoria` tem `colaborador_id` (não `usuario_id`). O trigger também não popula um campo `usuario_id` nessa tabela.

```sql
-- O que o código tenta fazer:
SELECT ..., usuario_id, ...
FROM auditoria

-- O que existe no schema:
colaborador_id uuid  -- FK para colaboradores, não para usuarios
```

**Impacto:** A query retorna `usuario_id` como `null` sempre, ou pode causar erro dependendo da versão da migration aplicada. **A tela de auditoria provavelmente não exibe corretamente quem fez cada operação.**

---

#### 8.2 — Número duplicado de migration (066)

**Problema:** Existem dois arquivos com prefixo `066`:

- `066_add_perfil_colaborador.sql` — adiciona valor `colaborador` ao enum
- `066_indice_refresh_tokens_expira.sql` — cria índice em `refresh_tokens`

O runner de migrations usa o nome completo do arquivo como versão, então ambos são aplicados. Mas cria confusão na ordenação e pode indicar falta de processo de controle.

---

#### 8.3 — RECONFERENCIA e ATENDIMENTO ausentes no baseline

**Problema:** O tipo `EtapaFluxo` em `packages/shared/src/entities/operacional.ts` define:

```typescript
| 'RECONFERENCIA'
| 'ATENDIMENTO'
```

O enum `etapa_fluxo` no baseline **não inclui** `RECONFERENCIA` (adicionado apenas na migration 084) nem `ATENDIMENTO`. Isso significa que, em um banco provisionado **sem** as migrations 084+, inserções com esses valores falharão. `ATENDIMENTO` não aparece em nenhuma migration identificada.

---

#### 8.4 — Redis configurado mas não utilizado no backend

**Problema:** Redis está em:

- `docker-compose.yml` (serviço `redis`, porta 6380)
- `.env.example` (`REDIS_URL=redis://localhost:6380`, `CACHE_TTL=3600`)
- `packages/backend/package.json` (dependência `redis: ^4.6.10`)

Nenhuma importação ou uso do Redis foi encontrado nos arquivos TypeScript do backend. A dependência está instalada mas inativa.

**Impacto:** Dependência morta; custos desnecessários em infraestrutura Docker; documentação enganosa.

---

#### 8.5 — `LancarProducaoPage` usa `useOrgaosRecebimento` para coordenadorias

**Arquivo:** `packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx`  
**Problema:** O hook `useOrgaosRecebimento()` busca orgãos de recebimento (`/operacional/orgaos-recebimento`), mas o campo sendo populado no formulário é chamado "coordenadoria". No backend, orgãos de recebimento são a propriedade `orgao` dos repositórios — uma lista distinta de `coordenadorias`. O colaborador deveria selecionar sua coordenadoria, não um orgão de recebimento.

---

#### 8.6 — Etapas operacionais sem painel no frontend

**Problema:** O fluxo operacional define etapas: RECEBIMENTO → PREPARACAO → DIGITALIZACAO → DIGITALIZACAO_COLORIDA → CONFERENCIA → RECONFERENCIA → MONTAGEM → CONTROLE_QUALIDADE → ENTREGA.

O frontend só tem painéis para:

- `recebimento` → `EtapaOperacionalPage` (recebimento completo)
- `controle-qualidade` → `ControleQualidadePanel` (CQ)

As etapas PREPARACAO, DIGITALIZACAO, DIGITALIZACAO_COLORIDA, CONFERENCIA, RECONFERENCIA, MONTAGEM e ENTREGA **não têm tela dedicada** no frontend. A rota `operacao/:etapa` está definida mas renderizaria uma página possivelmente vazia ou com comportamento incompleto para essas etapas.

---

#### 8.7 — Perfil `supervisor` ainda presente no enum

O enum `perfil_usuario` do banco ainda contém o valor `supervisor` (não foi removido, apenas migrado em dados). Qualquer inserção com `perfil = 'supervisor'` seria aceita pelo banco mas causaria comportamento inesperado no sistema (o mapeamento `supervisor → OPERADOR` só existe no `auth.ts`, não em outros pontos).

---

### HIPÓTESES (precisam de investigação adicional)

#### 8.8 — Schema de reset de senha não identificado no baseline

O fluxo de reset de senha (`/auth/forgot-password`) precisa armazenar um token temporário. A tabela `usuarios` no baseline não tem coluna para isso. Pode estar em uma migration posterior (entre 061–085) não lida. **Investigar as migrations 061–085 especificamente.**

#### 8.9 — `producao_repositorio` exige checklist mas `LancarProducaoPage` pode não ter

O trigger `fn_validar_producao_com_checklist_ativo()` exige checklist ABERTO ao inserir em `producao_repositorio`. Se o colaborador lançar produção via `LancarProducaoPage` para um repositório sem checklist aberto, o insert falhará no banco. O frontend pode não tratar esse erro de forma clara.

#### 8.10 — `registros_producao` vs `producao_repositorio` — dois sistemas de produção

Existem duas tabelas de registro de produção:

- `registros_producao` — schema legado (colaborador_id, etapa_id, quantidade, cancelado)
- `producao_repositorio` — schema operacional (repositorio_id, etapa, checklist_id, usuario_id, quantidade, marcadores JSONB)

As migrações mais antigas (009–031) trabalham com `registros_producao`. O sistema atual parece usar `producao_repositorio`. Os relatórios em `producao-metrics.ts` referenciam `producao_repositorio`. **A tabela `registros_producao` pode ser um legado não mais utilizado ou apenas para dados históricos importados.**

---

## 9. Pontos Incompletos

| Item                                                                               | Nível | Observação                                   |
| ---------------------------------------------------------------------------------- | ----- | -------------------------------------------- |
| Etapas operacionais sem painel (PREPARACAO, DIGITALIZACAO, CONFERENCIA, MONTAGEM…) | Alto  | Rotas definidas mas funcionalidade ausente   |
| Redis declarado mas não implementado                                               | Médio | Dependência instalada sem uso                |
| `usuario_id` vs `colaborador_id` em auditoria                                      | Alto  | Bug ativo na query da rota de auditoria      |
| ATENDIMENTO faltando no enum DB                                                    | Médio | Tipo TS define, banco não tem                |
| Camadas `application/services/` e `domain/entities/` vazias                        | Baixo | Arquitetura incompleta                       |
| Reset de senha — storage do token não identificado no baseline                     | Médio | Pode estar em migration não lida             |
| Tela de auditoria pode não mostrar o autor correto da operação                     | Alto  | Consequência do item usuario_id              |
| `LancarProducaoPage` — coordenadoria populada com orgãos de recebimento            | Médio | Dado semanticamente errado                   |
| Migration 066 duplicada                                                            | Baixo | Confusão no histórico, sem impacto funcional |
| `producao_repositorio` exige checklist; colaborador pode não ter um aberto         | Médio | Possível falha silenciosa                    |

---

## 10. Configurações de Ambiente e Deploy

### Local (desenvolvimento)

```yaml
# docker-compose.yml
postgres: localhost:5433   recorda/recorda/recorda
redis: localhost:6380
```

Frontend: `npm run dev` → Vite em porta padrão (5173), proxy para backend em `http://localhost:3000`.

Backend: `npm run dev` → `tsx watch src/main.ts` na porta 3000.

### Produção

| Componente | Plataforma  | Detalhes                                                                                                                                 |
| ---------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend   | **Vercel**  | Build: `shared + frontend`, output: `packages/frontend/dist`, SPA com fallback para `index.html`, `VITE_API_BASE` apontando para backend |
| Backend    | **Railway** | Build via Nixpacks, start: `migrate && start`, health check em `/health`, `DATABASE_URL` como string de conexão única                    |

### Variáveis de ambiente obrigatórias em produção

| Variável                 | Onde             | Descrição                                                 |
| ------------------------ | ---------------- | --------------------------------------------------------- |
| `JWT_SECRET`             | Backend          | Mínimo 32 chars, gerado com `openssl rand -base64 48`     |
| `DATABASE_URL` ou `DB_*` | Backend          | Conexão com PostgreSQL                                    |
| `CORS_ORIGIN`            | Backend          | URL do frontend (ex: `https://recorda.vercel.app`)        |
| `APP_URL`                | Backend          | URL do frontend (para links de e-mail)                    |
| `VITE_API_BASE`          | Frontend (build) | URL do backend (ex: `https://recorda-api.up.railway.app`) |

### Variáveis opcionais

| Variável                                                        | Descrição                                             |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envio de e-mail real (sem SMTP_HOST → console em dev) |
| `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`                          | SSL do banco em produção                              |
| `REDIS_URL`, `CACHE_TTL`                                        | Redis (configurado mas não implementado)              |
| `RECORDA_IMPORT_DEBUG`                                          | Debug de importações                                  |
| `TZ`                                                            | Fuso horário (padrão: `America/Cuiaba`)               |

### Diferenças local vs produção

| Comportamento | Local                          | Produção                         |
| ------------- | ------------------------------ | -------------------------------- |
| CORS          | Aceita qualquer origem         | Restrito a `CORS_ORIGIN`         |
| Rate limiting | Desabilitado (apenas granular) | Global 100/min + granular        |
| Helmet CSP    | Desabilitado                   | Habilitado                       |
| Swagger UI    | `/docs` acessível              | Não registrado                   |
| SSL no banco  | Não                            | Sim (a menos que `DB_SSL=false`) |
| E-mail        | Console log                    | SMTP real                        |
| PWA           | Não registrado                 | Ativo                            |

---

## Apêndice: Resumo de Status por Área

| Área                                        | Status              | Observações                                     |
| ------------------------------------------- | ------------------- | ----------------------------------------------- |
| Autenticação JWT                            | ✅ Funcional        | Refresh token, rate limit, bcrypt               |
| Login / logout                              | ✅ Funcional        | —                                               |
| Reset de senha                              | ⚠️ Incompleto       | Storage do token não confirmado no schema       |
| Fluxo de recebimento                        | ✅ Funcional        | —                                               |
| OCR                                         | ✅ Funcional        | Tesseract.js, pré-processamento com sharp       |
| Checklists                                  | ✅ Funcional        | Com validação de triggers no banco              |
| Controle de Qualidade                       | ✅ Funcional        | Lote de 10, triggers aplicam resultado          |
| Produção (colaborador)                      | ⚠️ Parcial          | Inconsistência com coordenadoria/orgão          |
| Relatórios gerenciais                       | ✅ Funcional        | JSON + PDF + Excel                              |
| Base de conhecimento                        | ✅ Funcional        | Versionamento, full-text search                 |
| Auditoria                                   | ❌ Bug ativo        | `usuario_id` não existe na tabela               |
| Etapas intermediárias (PREPARACAO…MONTAGEM) | ❌ Ausente          | Sem painel no frontend                          |
| Redis                                       | ❌ Não implementado | Dependência morta                               |
| Importação legado                           | ✅ Funcional        | —                                               |
| Gestão de usuários                          | ✅ Funcional        | —                                               |
| Configurações da empresa                    | ✅ Funcional        | Logo, dados, relatórios                         |
| Migrations                                  | ⚠️ Atenção          | Número 066 duplicado; ATENDIMENTO sem migration |
