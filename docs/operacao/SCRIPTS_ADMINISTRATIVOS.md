# Scripts Administrativos e Manuais

## Objetivo

Centralizar o uso seguro de scripts auxiliares e manuais que dependem de credenciais, banco local ou chamadas HTTP no Recorda.

## Regras

- use apenas em `localhost` por padrao
- nao execute contra producao real
- credenciais devem vir de variaveis de ambiente
- quando um script bloquear ambiente remoto, so libere conscientemente

## Scripts auditados

### `tests/manual/test-login.js`

Variaveis:

```bash
TEST_LOGIN_BASE_URL=http://localhost:3000
TEST_LOGIN_EMAIL=admin@recorda.local
TEST_LOGIN_PASSWORD=defina_uma_senha_local
TEST_LOGIN_ALLOW_REMOTE=true
```

### `tests/manual/test-frontend-login.html`

- abre um teste manual de login no navegador
- preencha a senha manualmente antes de executar
- a opcao de ambiente remoto vem desmarcada por padrao

### `scripts/run-imports.js`

Variaveis:

```bash
IMPORT_API_BASE=http://localhost:3000
IMPORT_EMAIL=admin@recorda.local
IMPORT_PASSWORD=defina_uma_senha_local
IMPORT_ALLOW_REMOTE=true
```

### `scripts/test-push-flow.mjs`

Variaveis:

```bash
PUSH_TEST_FRONTEND_URL=http://localhost:4173
PUSH_TEST_BACKEND_URL=http://localhost:3000
PUSH_TEST_ADMIN_EMAIL=admin@recorda.local
PUSH_TEST_ADMIN_PASSWORD=defina_uma_senha_local
PUSH_TEST_USER_EMAIL=push.teste@recorda.local
PUSH_TEST_USER_PASSWORD=defina_uma_senha_local
PUSH_TEST_ALLOW_REMOTE=true
```

### `scripts/create-admin-user.js`

Variaveis:

```bash
ADMIN_EMAIL=admin@recorda.local
ADMIN_PASSWORD=defina_uma_senha_local
ADMIN_NAME=Administrador
ADMIN_ROLE=administrador
ADMIN_SCRIPT_ALLOW_REMOTE_DB=true
```

### `tests/manual/setup-test-users.sql`

- exemplo local aceitavel
- usa contas `@recorda.local` ficticias
- nao contem senha em texto puro
- nao execute em producao real
