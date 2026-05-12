# Deploy: Railway (backend) + Nginx/Docker (frontend)

> **Plataforma ativa:** Railway (backend via Nixpacks). O frontend é servido via Nginx embutido na imagem Docker ou pode ser hospedado em qualquer CDN/static host.

## 1. Preparar repositório Git

Se o repositório já existir:

```bash
git add .
git commit -m "chore: deploy"
git push
```

## 2. Railway (Backend)

### Configuração do projeto

1. Criar projeto Railway e conectar ao repositório GitHub.
2. Service root: repositório raiz (`recorda`).
3. Railway usa [railway.json](../../railway.json):
   - builder: `NIXPACKS`
   - start: `npm run start --workspace=@recorda/backend`
   - healthcheck: `/health`
4. A fase de build do Nixpacks é configurada em [nixpacks.toml](../../nixpacks.toml):
   - install: `npm ci --include=dev`
   - build compartilhado e do backend via workspaces.

### Variáveis obrigatórias no Railway

- `NODE_ENV=production`
- `PORT`
- `HOST=0.0.0.0`
- `JWT_SECRET`
- `CORS_ORIGIN=https://<seu-front>`
- `APP_URL=https://<seu-front>`
- `DATABASE_URL`

## 3. Frontend (Docker / Nginx)

O frontend é construído pela imagem `Dockerfile.frontend` e servido via Nginx conforme [nginx.conf](../../nginx.conf).

```bash
docker build -f Dockerfile.frontend -t recorda-frontend .
docker run -p 80:80 recorda-frontend
```

A variável de build obrigatória é:

- `VITE_API_BASE=https://<seu-backend>.up.railway.app`

## 4. Ordem recomendada de publicação

1. Subir backend no Railway.
2. Copiar URL pública do Railway.
3. Buildar frontend com `VITE_API_BASE` apontando para o Railway.
4. Publicar imagem do frontend.
5. Atualizar `CORS_ORIGIN` e `APP_URL` no Railway.

## 5. Verificação pós-deploy

### Backend

- `GET https://<railway-url>/health` deve retornar `200`.

### Frontend

- abrir `/login`;
- testar login;
- validar rotas principais:
  - `/dashboard`
  - `/producao`
  - `/operacao/recebimento`
  - `/relatorios/gerenciais`

## 6. Arquivos Relacionados

- [railway.json](../../railway.json)
- [nixpacks.toml](../../nixpacks.toml)
- [nginx.conf](../../nginx.conf)
- [Dockerfile.backend](../../Dockerfile.backend)
- [Dockerfile.frontend](../../Dockerfile.frontend)
- [.env.example](../../.env.example)
- [packages/backend/src/infrastructure/config/index.ts](../../packages/backend/src/infrastructure/config/index.ts)
- [packages/frontend/src/services/api.ts](../../packages/frontend/src/services/api.ts)
