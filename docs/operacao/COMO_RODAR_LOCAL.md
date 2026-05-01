# Como Rodar Localmente

## Pré-requisitos

- Node.js 20.x
- npm 10.x
- Docker

## Passo a Passo

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar ambiente

```bash
cp .env.example .env
```

### 3. Subir o PostgreSQL local

```bash
docker-compose up -d
```

### 4. Preparar banco

```bash
npm run db:bootstrap
```

### 5. Rodar frontend e backend

```bash
npm run dev
```

## Portas Padrão

- frontend: `5173`
- backend: `3000`
- PostgreSQL: `5432`

## Observações

- o backend e o frontend usam a configuração do monorepo na raiz;
- em desenvolvimento, o frontend pode usar proxy `/api` quando `VITE_API_BASE` não estiver definido;
- para mudanças em números e datas, consultar antes:
  - `../regras-de-negocio/NUMEROS_E_METRICAS.md`
  - `../regras-de-negocio/TIMEZONE.md`
  - `../padroes/PADRAO_NUMEROS_RECORDA.md`
