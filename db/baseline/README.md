# Database Baseline

Este diretorio esta mantido como artefato historico.

## Situacao atual

O bootstrap oficial do banco nao usa estes arquivos automaticamente.

O fluxo ativo do projeto e:

```bash
npm run db:migrate
```

ou, para criar o banco local do zero:

```bash
npm run db:bootstrap
```

Ambos usam somente a cadeia oficial em `db/migrations`.

## Por que o baseline foi desativado no runner

O baseline atual nao acompanha com seguranca o estado completo do sistema. Antes de voltar a ser usado, ele precisa ser regenerado e revalidado junto com:

- `schema_migrations`
- documentacao
- organizacao da pasta `db/migrations`
- politica de arquivamento

## Quando mexer aqui

So regenere estes arquivos quando houver uma consolidacao nova, validada de ponta a ponta.
