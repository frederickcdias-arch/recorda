# Testes do Sistema Recorda

## Validacao principal na raiz

```bash
npm run typecheck
npm run build
npm run lint
```

## Testes por workspace

### Backend

```bash
npm run test --workspace=@recorda/backend
npm run test:integration --workspace=@recorda/backend
```

### Frontend

```bash
npm run test --workspace=@recorda/frontend
npm run test:e2e --workspace=@recorda/frontend
```

## Testes operacionais especificos

### Push/PWA

```bash
npm run test:push
```

## Testes criticos de numeros

```bash
node_modules/.bin/vitest run packages/backend/src/domain/producao/importacao-legado.test.ts packages/backend/src/domain/producao/producao-metrics.test.ts packages/frontend/src/utils/number.test.ts
```

## Quando rodar

Rode validacao automatizada sempre que houver mudanca em:

- numeros exibidos em tela;
- relatorios;
- dashboards;
- timezone;
- importacao legada;
- push/PWA;
- contratos compartilhados entre backend e frontend;
- helpers centrais em `packages/backend/src/domain/producao/`;
- utilitarios em `packages/frontend/src/utils/`.

## Checklist minimo

- `typecheck`
- `build`
- testes do workspace afetado
- validacao manual do fluxo alterado

## Checklist reforcado para alteracoes sensiveis

- `lint`
- busca por drift de permissao
- revisao de rotas e payloads
- confirmacao de impacto em mobile/PWA quando houver UI
