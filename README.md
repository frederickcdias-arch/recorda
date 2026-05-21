# Recorda

Sistema de gestao documental e operacional com rastreamento de producao, digitalizacao, controle de fluxo e auditoria.

## Documentacao principal

- [Guia mestre da documentacao](docs/README.md)
- [Dominio do sistema](docs/regras-de-negocio/DOMINIO.md)
- [Numeros e metricas](docs/regras-de-negocio/NUMEROS_E_METRICAS.md)
- [Timezone oficial](docs/regras-de-negocio/TIMEZONE.md)
- [Importacao legada](docs/regras-de-negocio/IMPORTACAO_LEGADO.md)
- [Como rodar localmente](docs/operacao/COMO_RODAR_LOCAL.md)
- [Testes](docs/operacao/TESTES.md)
- [Deploy](docs/operacao/DEPLOY.md)
- [Processamento de documento fotografado](docs/operacao/PROCESSAMENTO_DOCUMENTO.md)

## Requisitos

- Node.js 20.x
- npm 10.x
- Docker

## Estrutura do projeto

```text
recorda/
|-- db/
|   |-- baseline/          (artefato historico, nao usado no bootstrap ativo)
|   |-- migrations/        (cadeia oficial do banco, atualmente ate 096)
|   `-- scripts/
|-- docs/
|-- packages/
|   |-- backend/
|   |-- frontend/
|   `-- shared/
|-- scripts/
|-- tests/
|   |-- load/
|   |-- manual/
|   `-- security/
|-- docker-compose.yml
|-- Dockerfile.backend
|-- Dockerfile.frontend
|-- nginx.conf
|-- nixpacks.toml
|-- railway.json
|-- package.json
|-- tsconfig.base.json
`-- README.md
```

## Setup rapido

```bash
npm install
cp .env.example .env
docker-compose up -d
npm run db:bootstrap
npm run dev
```

Observacoes:

- `npm run db:bootstrap` cria o banco local, garante `schema_migrations` e aplica a cadeia oficial em `db/migrations`.
- `npm run db:migrate` deve ser usado quando o banco ja existe e voce so precisa aplicar novas migrations.
- O baseline em `db/baseline` esta preservado apenas como artefato historico.

## Comandos principais

| Comando                | Finalidade                                      |
| ---------------------- | ----------------------------------------------- |
| `npm run dev`          | Sobe backend e frontend em desenvolvimento      |
| `npm run dev:backend`  | Sobe apenas o backend                           |
| `npm run dev:frontend` | Sobe apenas o frontend                          |
| `npm run build`        | Build de todos os workspaces                    |
| `npm run typecheck`    | Typecheck de todos os workspaces                |
| `npm run lint`         | ESLint no monorepo                              |
| `npm run format`       | Prettier no repositorio                         |
| `npm run db:bootstrap` | Cria o banco local e aplica todas as migrations |
| `npm run db:migrate`   | Aplica novas migrations no banco existente      |
| `npm run push:vapid`   | Gera chaves VAPID para push/PWA                 |
| `npm run test:push`    | Executa o fluxo operacional de teste de push    |

## Testes

Os comandos principais de validacao ficam em [docs/operacao/TESTES.md](docs/operacao/TESTES.md).

## Deploy

As instrucoes operacionais de publicacao ficam em [docs/operacao/DEPLOY.md](docs/operacao/DEPLOY.md).
