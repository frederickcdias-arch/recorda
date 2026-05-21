# Database Baseline

## Estado atual

O fluxo oficial de criação e atualização do banco usa apenas:

```bash
npm run db:migrate
```

Ou seja:

- a fonte de verdade ativa é `db/migrations`
- o runner em `packages/backend/src/infrastructure/database/migrate.ts` não aplica `db/baseline` automaticamente
- a pasta `db/baseline` fica preservada apenas como artefato histórico até uma consolidação nova e validada

## Motivo

O baseline atual ficou desalinhado do estado real do sistema:

- não representa todos os módulos recentes
- não acompanha corretamente a política atual de migrations
- gerava um fluxo híbrido difícil de auditar

Até uma nova consolidação confiável, o caminho seguro é manter somente a cadeia completa de migrations como bootstrap oficial.

## Regra operacional

Para novos ambientes:

1. criar o banco
2. rodar `npm run db:migrate`

Para ambientes existentes:

1. manter `schema_migrations`
2. aplicar apenas migrations ainda não registradas

## Próxima consolidação

Uma nova consolidação de baseline só deve ser feita quando:

- todas as migrations ativas estiverem validadas
- o conteúdo de `db/baseline` puder ser regenerado do banco atual
- a documentação e o runner forem atualizados em conjunto
