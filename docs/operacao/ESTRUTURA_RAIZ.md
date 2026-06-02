# Estrutura da raiz do repositório

Este repositório usa a raiz como ponto de integração entre monorepo, Docker, Railway, Vercel e ferramentas de desenvolvimento. Nem todo arquivo solto na raiz é "bagunça": parte deles precisa permanecer ali porque ferramentas externas esperam caminhos fixos.

## Arquivos que obrigatoriamente ficam na raiz

| Arquivo                    | Função                                             | Quem usa                              | Pode mover? | Risco                                 |
| -------------------------- | -------------------------------------------------- | ------------------------------------- | ----------- | ------------------------------------- |
| `package.json`             | Define workspaces e scripts principais do monorepo | `npm`, CI, Docker build               | Não         | Quebra scripts e workspaces           |
| `package-lock.json`        | Lockfile do monorepo                               | `npm ci`, Docker build, CI            | Não         | Builds não reprodutíveis              |
| `README.md`                | Entrada principal do repositório                   | GitHub, time                          | Não         | Perda de onboarding                   |
| `.gitignore`               | Regras de versionamento local                      | Git                                   | Não         | Poluição do repositório               |
| `.env.example`             | Exemplo de ambiente local                          | Pessoas, onboarding                   | Não         | Onboarding incompleto                 |
| `.env.homologacao.example` | Exemplo de ambiente de homologação                 | Pessoas, operação                     | Não         | Operação inconsistente                |
| `.editorconfig`            | Convenções de edição                               | Editores                              | Não         | Formatação inconsistente              |
| `.nvmrc`                   | Versão base do Node                                | `nvm`, pessoas                        | Não         | Ambiente divergente                   |
| `.prettierrc`              | Configuração de formatação                         | Prettier, CI local                    | Não         | Formatação divergente                 |
| `.prettierignore`          | Exclusões do Prettier                              | Prettier                              | Não         | Formatação indevida                   |
| `.eslintrc.json`           | Configuração global de lint                        | ESLint                                | Não         | Lint quebrado                         |
| `tsconfig.base.json`       | Base de TypeScript compartilhada                   | Workspaces TS                         | Não         | Typecheck e build quebrados           |
| `docker-compose.yml`       | Banco local via Docker Compose                     | Docker Compose, desenvolvimento local | Não         | Subida local quebra                   |
| `vercel.json`              | Configuração de deploy/frontend SPA                | Vercel                                | Não         | Deploy e rewrites quebram             |
| `railway.json`             | Configuração de deploy do backend                  | Railway                               | Não         | Deploy quebra                         |
| `nixpacks.toml`            | Fase de build em infraestrutura Railway/Nixpacks   | Railway/Nixpacks                      | Não         | Build remoto quebra                   |
| `Dockerfile.backend`       | Imagem do backend                                  | Railway, Docker                       | Não         | `railway.json` aponta direto para ele |
| `Dockerfile.frontend`      | Imagem do frontend                                 | Docker build/manual                   | Não         | Build Docker do frontend quebra       |
| `nginx.conf`               | Configuração do Nginx da imagem frontend           | `Dockerfile.frontend`                 | Não         | Container frontend quebra             |
| `healthcheck.sh`           | Healthcheck do container frontend                  | `Dockerfile.frontend`                 | Não         | Healthcheck e imagem quebram          |

## Arquivos que podem ficar na raiz por convenção

| Arquivo | Função                                 | Quem usa              | Pode mover?                     | Risco                               |
| ------- | -------------------------------------- | --------------------- | ------------------------------- | ----------------------------------- |
| `.env`  | Ambiente local real, ignorado pelo Git | Desenvolvimento local | Não mover dentro do repositório | Baixo, mas pode quebrar setup local |

## Diretórios principais

| Diretório   | Papel                                                 |
| ----------- | ----------------------------------------------------- |
| `packages/` | Workspaces `backend`, `frontend` e `shared`           |
| `db/`       | Migrations, baseline histórico e utilitários de banco |
| `docs/`     | Documentação operacional, técnica e auditorias        |
| `scripts/`  | Scripts administrativos e auxiliares                  |
| `tests/`    | Testes manuais, de carga e de segurança               |
| `assets/`   | Logos e arquivos estáticos compartilhados             |

## Arquivos que não devem permanecer na raiz

Arquivos temporários e logs locais podem aparecer na raiz durante investigação, build ou debug. Eles não devem ser versionados e podem ser removidos localmente quando não forem mais úteis:

- `.tmp-*.log`
- `.tmp-*.err.log`
- `.tmp-*.jpg`
- `vite-build-debug.log`
- `vite-debug-full.log`

Esses artefatos já são ignorados pelo Git e não fazem parte da estrutura oficial do repositório.

## Por que não mover agora os arquivos de infraestrutura

Os candidatos mais óbvios a uma pasta `infra/` foram auditados, mas hoje ainda têm dependência direta por nome/caminho:

- `railway.json` aponta para `Dockerfile.backend` via `dockerfilePath`.
- `Dockerfile.frontend` faz `COPY nginx.conf` e `COPY healthcheck.sh` a partir da raiz do contexto Docker.
- A documentação operacional e os comandos de deploy atuais assumem esses caminhos.
- `nixpacks.toml` costuma ser lido a partir da raiz da aplicação no Railway/Nixpacks.

Mover esses arquivos exigiria uma reorganização coordenada de deploy e documentação. Não é uma limpeza visual de baixo risco.
