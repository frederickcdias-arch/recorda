# Deploy: Git + Railway + Vercel

## 1) Preparar repositório Git

Se ainda não houver repositório Git inicializado:

```bash
git init
git add .
git commit -m "chore: prepare deploy for railway and vercel"
git branch -M main
git remote add origin <URL_DO_REPOSITORIO>
git push -u origin main
```

Se o repositório já existir:

```bash
git add .
git commit -m "chore: deploy configs railway/vercel"
git push
```

## 2) Railway (backend)

### Configuração do projeto

1. Criar projeto Railway e conectar ao repositório.
2. Service root: repositório raiz (`recorda`).
3. Railway usa [railway.json](../railway.json):
   - build: `npm ci && npm run build --workspace=@recorda/shared && npm run build --workspace=@recorda/backend`
   - start: `npm run start --workspace=@recorda/backend`
   - healthcheck: `/health`

### Variáveis obrigatórias (Railway)

- `NODE_ENV=production`
- `PORT` (Railway injeta automaticamente)
- `HOST=0.0.0.0`
- `JWT_SECRET` (48+ chars)
- `CORS_ORIGIN=https://<seu-front>.vercel.app`
- `APP_URL=https://<seu-front>.vercel.app`
- `DATABASE_URL` (preferencial, se usar plugin Postgres Railway)

Observação:
- O backend já suporta `DATABASE_URL` automaticamente.
- Se não usar `DATABASE_URL`, configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.

## 3) Vercel (frontend)

### Configuração do projeto

1. Importar o mesmo repositório no Vercel.
2. Root Directory: repositório raiz (`recorda`).
3. Vercel usa [vercel.json](../vercel.json):
   - install: `npm ci`
   - build: `npm run build --workspace=@recorda/frontend`
   - output: `packages/frontend/dist`
   - SPA fallback para `index.html`

### Variáveis obrigatórias (Vercel)

- `VITE_API_BASE=https://<seu-backend>.up.railway.app`

Observação:
- O frontend foi preparado para usar `VITE_API_BASE`.
- Em dev local, sem `VITE_API_BASE`, continua usando `/api` com proxy do Vite.

## 4) Ordem recomendada de publicação

1. Subir backend no Railway.
2. Copiar URL pública do Railway.
3. Configurar `VITE_API_BASE` no Vercel.
4. Publicar frontend no Vercel.
5. Atualizar no Railway:
   - `CORS_ORIGIN` com URL final do Vercel
   - `APP_URL` com URL final do Vercel
6. Redeploy dos dois serviços.

## 5) Verificação pós-deploy

### Backend

- `GET https://<railway-url>/health` deve retornar `200`.

### Frontend

- Abrir `https://<vercel-url>/login`.
- Testar login.
- Validar rotas principais:
  - `/dashboard`
  - `/producao`
  - `/operacao/recebimento`
  - `/relatorios/gerenciais`

## 6) Arquivos de deploy adicionados/ajustados

- [railway.json](../railway.json)
- [vercel.json](../vercel.json)
- [.env.example](../.env.example)
- [packages/backend/src/infrastructure/config/index.ts](../packages/backend/src/infrastructure/config/index.ts)
- [packages/frontend/src/services/api.ts](../packages/frontend/src/services/api.ts)
- [packages/frontend/src/contexts/AuthContext.tsx](../packages/frontend/src/contexts/AuthContext.tsx)
