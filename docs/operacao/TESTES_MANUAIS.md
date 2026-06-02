# Testes Manuais

## Objetivo

Documentar a execucao segura de scripts manuais do Recorda. Esses scripts existem para validacoes operacionais controladas e nao devem ser usados contra producao por padrao.

## Ambiente recomendado

- `localhost`
- homologacao controlada, somente com confirmacao explicita

## Script de ausencias

Arquivo:

- `tests/manual/test-ausencias-fase1.mjs`

Comando:

```bash
node tests/manual/test-ausencias-fase1.mjs
```

Variaveis necessarias:

```bash
RECORDA_MANUAL_BASE_URL=http://localhost:3000
RECORDA_MANUAL_ADMIN_EMAIL=admin@recorda.local
RECORDA_MANUAL_ADMIN_PASSWORD=defina_uma_senha_local
RECORDA_MANUAL_COLABORADOR_EMAIL=teste@recorda.local
RECORDA_MANUAL_COLABORADOR_PASSWORD=defina_uma_senha_local
RECORDA_MANUAL_OPERADOR_EMAIL=operador.teste@recorda.local
RECORDA_MANUAL_OPERADOR_PASSWORD=defina_uma_senha_local
RECORDA_MANUAL_COLABORADOR_ID=defina_um_uuid_local
RECORDA_MANUAL_ADMIN_USUARIO_ID=defina_um_uuid_local
```

Protecao contra ambiente remoto:

- por padrao, o script aceita apenas `localhost`, `127.0.0.1` e `::1`
- para rodar contra ambiente remoto, defina `RECORDA_MANUAL_ALLOW_REMOTE=true`
- nao use essa liberacao para producao real

Exemplo local no PowerShell:

```powershell
$env:RECORDA_MANUAL_BASE_URL='http://localhost:3000'
$env:RECORDA_MANUAL_ADMIN_EMAIL='admin@recorda.local'
$env:RECORDA_MANUAL_ADMIN_PASSWORD='sua_senha_local'
$env:RECORDA_MANUAL_COLABORADOR_EMAIL='teste@recorda.local'
$env:RECORDA_MANUAL_COLABORADOR_PASSWORD='sua_senha_local'
$env:RECORDA_MANUAL_OPERADOR_EMAIL='operador.teste@recorda.local'
$env:RECORDA_MANUAL_OPERADOR_PASSWORD='sua_senha_local'
$env:RECORDA_MANUAL_COLABORADOR_ID='00000000-0000-0000-0000-000000000001'
$env:RECORDA_MANUAL_ADMIN_USUARIO_ID='00000000-0000-0000-0000-000000000002'
node tests/manual/test-ausencias-fase1.mjs
```

## Alerta

Nao execute testes manuais contra producao real. Se a URL nao for local, o script bloqueia a execucao por padrao e exige `RECORDA_MANUAL_ALLOW_REMOTE=true`.
