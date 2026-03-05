# Recorda

Sistema de GestÃ£o de Processos Administrativos com rastreamento de produÃ§Ã£o e digitalizaÃ§Ã£o.

> **Para entender o domÃ­nio do sistema, leia:** [docs/DOMINIO.md](docs/DOMINIO.md)
>
> **Deploy Git + Railway + Vercel:** [docs/DEPLOY_RAILWAY_VERCEL.md](docs/DEPLOY_RAILWAY_VERCEL.md)
>
> **Backlog de melhorias por seção:** [docs/BACKLOG_EXECUTAVEL_2026.md](docs/BACKLOG_EXECUTAVEL_2026.md)

## Requisitos

- Node.js 20.x
- Docker (para PostgreSQL)
- npm 10.x

## Estrutura do Projeto

```
recorda/
â”œâ”€â”€ packages/
â”‚   â”œâ”€â”€ backend/                 # API Fastify
â”‚   â”‚   â””â”€â”€ src/
â”‚   â”‚       â”œâ”€â”€ application/     # Casos de uso
â”‚   â”‚       â”œâ”€â”€ domain/          # Entidades e regras de negÃ³cio
â”‚   â”‚       â””â”€â”€ infrastructure/  # Adaptadores externos
â”‚   â”‚           â”œâ”€â”€ config/      # ConfiguraÃ§Ãµes
â”‚   â”‚           â”œâ”€â”€ database/    # ConexÃ£o PostgreSQL
â”‚   â”‚           â””â”€â”€ http/        # Servidor e rotas
â”‚   â”‚               â””â”€â”€ routes/  # Endpoints
â”‚   â””â”€â”€ frontend/                # React + Vite PWA
â”‚       â”œâ”€â”€ public/              # Assets estÃ¡ticos
â”‚       â””â”€â”€ src/                 # CÃ³digo fonte
â”œâ”€â”€ db/
â”‚   â””â”€â”€ migrations/              # MigraÃ§Ãµes SQL
â”œâ”€â”€ scripts/                     # Scripts de automaÃ§Ã£o
â”œâ”€â”€ .husky/                      # Git hooks
â”œâ”€â”€ docker-compose.yml           # PostgreSQL container
â”œâ”€â”€ tsconfig.base.json           # TypeScript compartilhado
â”œâ”€â”€ .eslintrc.json               # ESLint config
â”œâ”€â”€ .prettierrc                  # Prettier config
â””â”€â”€ package.json                 # Workspaces root
```

## Setup

### 1. Instalar dependÃªncias

```bash
npm install
```

### 2. Configurar variÃ¡veis de ambiente

```bash
cp .env.example .env
```

### 3. Iniciar PostgreSQL

```bash
docker-compose up -d
```

### 4. Executar bootstrap do banco

```bash
npm run db:bootstrap
```

### 5. Iniciar desenvolvimento

```bash
npm run dev
```

## Comandos

| Comando | DescriÃ§Ã£o |
|---------|-----------|
| `npm run dev` | Inicia frontend e backend em modo desenvolvimento |
| `npm run dev:backend` | Inicia apenas o backend |
| `npm run dev:frontend` | Inicia apenas o frontend |
| `npm run build` | Build de produÃ§Ã£o |
| `npm run lint` | Executa ESLint |
| `npm run lint:fix` | Corrige erros de lint automaticamente |
| `npm run format` | Formata cÃ³digo com Prettier |
| `npm run format:check` | Verifica formataÃ§Ã£o |
| `npm run typecheck` | Verifica tipos TypeScript |
| `npm run db:bootstrap` | Cria banco e executa migraÃ§Ãµes |

## Testes

| Tipo | Comando | Notas |
|------|---------|-------|
| UnitÃ¡rio (backend) | `npm run test --workspace=@recorda/backend` | Vitest; cobre casos de uso e integraÃ§Ãµes mockadas |
| UnitÃ¡rio (frontend) | `npm run test --workspace=@recorda/frontend` | Vitest + Testing Library |
| IntegraÃ§Ã£o HTTP | `npm run test --workspace=@recorda/backend` | Inclui testes `server.integration.test.ts` com mocks de DB/OCR/fetch |
| E2E | `npm run test:e2e --workspace=@recorda/frontend` | Playwright; requer `npm run dev` ativo e browsers instalados (`npx playwright install`) |
| Performance | `npx k6 run scripts/performance/dashboard-load-test.js` | Define `BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` conforme necessÃ¡rio |
| SeguranÃ§a | `npx k6 run scripts/security/auth-endpoints-check.js` | Garante respostas 401 corretas e ausÃªncia de headers sensÃ­veis |

## Endpoints

### Health
| MÃ©todo | Rota | DescriÃ§Ã£o |
|--------|------|-----------|
| GET | `/health` | Healthcheck da API |

### Recebimento (Operacional)
| MÃ©todo | Rota | DescriÃ§Ã£o |
|--------|------|-----------|
| POST | `/operacional/repositorios/:id/ocr-preview` | OCR assistido para pré-cadastro |
| GET | `/operacional/repositorios/:id/recebimento-processos` | Lista processos do recebimento |
| POST | `/operacional/repositorios/:id/recebimento-processos` | Cadastra processo no recebimento |

### RelatÃ³rios
| MÃ©todo | Rota | DescriÃ§Ã£o |
|--------|------|-----------|
| GET | `/relatorios` | RelatÃ³rio completo (JSON/PDF/Excel) |
| GET | `/relatorios/resumo` | Resumo rÃ¡pido |

### Base de Conhecimento (Operacional)
| MÃ©todo | Rota | DescriÃ§Ã£o |
|--------|------|-----------|
| GET | `/operacional/conhecimento/documentos` | Lista documentos da base |
| GET | `/operacional/conhecimento/documentos/:id` | Detalhe de documento |
| POST | `/operacional/conhecimento/documentos` | Cria documento/versão inicial |
| GET | `/operacional/conhecimento/glossario` | Lista glossário |

### Endpoints Legados
| MÃ©todo | Rota | Status |
|--------|------|--------|
| * | `/recebimento/*` | `410 LEGACY_ENDPOINT_GONE` |
| * | `/conhecimento/*` | `410 LEGACY_ENDPOINT_GONE` |

## Arquitetura

### Backend - Hexagonal

- **Domain**: Entidades e regras de negÃ³cio puras
- **Application**: Casos de uso e orquestraÃ§Ã£o
- **Infrastructure**: Adaptadores (HTTP, Database, etc.)

### Frontend - PWA

- React 18 com TypeScript
- Vite como bundler
- TailwindCSS para estilos
- Service Worker para offline

## Portas

| ServiÃ§o | Porta |
|---------|-------|
| Frontend (Vite) | 5173 |
| Backend (Fastify) | 3000 |
| PostgreSQL | 5432 |

## Tecnologias

- **Runtime**: Node.js 20.x
- **Backend**: Fastify
- **Frontend**: React + Vite
- **Estilos**: TailwindCSS
- **Banco**: PostgreSQL 16
- **Linguagem**: TypeScript (strict mode)
- **Linting**: ESLint + Prettier
- **Git Hooks**: Husky

