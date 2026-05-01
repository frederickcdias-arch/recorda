# Recorda

Sistema de gestão de processos administrativos com rastreamento de produção e digitalização.

## Documentação Principal

- [Documentação oficial](docs/README.md)
- [Domínio do sistema](docs/regras-de-negocio/DOMINIO.md)
- [Números e métricas](docs/regras-de-negocio/NUMEROS_E_METRICAS.md)
- [Timezone oficial](docs/regras-de-negocio/TIMEZONE.md)
- [Importação legada](docs/regras-de-negocio/IMPORTACAO_LEGADO.md)
- [Deploy](docs/operacao/DEPLOY.md)

## Requisitos

- Node.js 20.x
- Docker
- npm 10.x

## Estrutura do Projeto

```text
recorda/
├── db/
├── docs/
├── packages/
├── scripts/
├── tests/
├── docker-compose.yml
├── package.json
├── package-lock.json
├── tsconfig.base.json
└── README.md
```

## Setup Rápido

```bash
npm install
cp .env.example .env
docker-compose up -d
npm run db:bootstrap
npm run dev
```

## Comandos

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia frontend e backend em modo desenvolvimento |
| `npm run dev:backend` | Inicia apenas o backend |
| `npm run dev:frontend` | Inicia apenas o frontend |
| `npm run build` | Build de produção |
| `npm run lint` | Executa ESLint |
| `npm run format` | Formata código com Prettier |
| `npm run typecheck` | Verifica tipos TypeScript |
| `npm run db:bootstrap` | Prepara o banco local |

## Testes

Consulte:

- [docs/operacao/TESTES.md](docs/operacao/TESTES.md)

## Deploy

Consulte:

- [docs/operacao/DEPLOY.md](docs/operacao/DEPLOY.md)
