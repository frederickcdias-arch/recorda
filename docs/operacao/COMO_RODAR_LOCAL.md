# Como Rodar Localmente

## Pre-requisitos

- Node.js 20.x
- npm 10.x
- Docker

## Passo a passo

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar ambiente

```bash
cp .env.example .env
```

### 3. Subir a infraestrutura local

```bash
docker-compose up -d
```

### 4. Preparar o banco

Use uma das opcoes:

```bash
npm run db:bootstrap
```

ou, se o banco ja existir:

```bash
npm run db:migrate
```

### 5. Rodar frontend e backend

```bash
npm run dev
```

## Portas padrao

- frontend: `5173`
- backend: `3000`
- PostgreSQL local: `5433`

## Observacoes

- o fluxo oficial do banco usa somente `db/migrations`;
- `db/baseline` esta preservado como artefato historico e nao participa do bootstrap ativo;
- em desenvolvimento, o frontend pode usar proxy `/api` quando `VITE_API_BASE` nao estiver definido;
- para mudancas em numeros e datas, consulte antes:
  - `../regras-de-negocio/NUMEROS_E_METRICAS.md`
  - `../regras-de-negocio/TIMEZONE.md`
  - `../padroes/PADRAO_NUMEROS_RECORDA.md`
