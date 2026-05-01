# Testes do Sistema Recorda

## Comandos Principais

Na raiz do monorepo:

```bash
npm test
npm run typecheck
npm run lint
```

## Testes por Workspace

### Backend

```bash
npm run test --workspace=@recorda/backend
```

### Frontend

```bash
npm run test --workspace=@recorda/frontend
```

## Testes Críticos de Números

Executar especialmente:

```bash
node_modules/.bin/vitest run packages/backend/src/domain/producao/importacao-legado.test.ts packages/backend/src/domain/producao/producao-metrics.test.ts packages/frontend/src/utils/number.test.ts
```

## Quando Rodar

Rodar obrigatoriamente quando houver mudança em:

- números exibidos em tela;
- relatórios;
- dashboards;
- timezone;
- importação legada;
- helpers centrais em `packages/backend/src/domain/producao/`;
- utilitários em `packages/frontend/src/utils/`.

## Checklist de Validação

- `test`
- `typecheck`
- `lint`
- validação manual do fluxo alterado
- revisão por busca de `America/Sao_Paulo`, `CURRENT_DATE`, `|| 0`, `?? 0`, `|| 1`, `parseInt(...) || 1`
