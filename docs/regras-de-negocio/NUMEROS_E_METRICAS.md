# Números e Métricas do Sistema Recorda

## Objetivo

Este documento define a regra oficial para números exibidos em telas, dashboards, históricos e relatórios do Recorda.

## Regra Oficial de Produção Contabilizada

Regra oficial: `producao_contabilizada`.

Definição:

- origem `SISTEMA` entra;
- origem `LEGADO` entra;
- `RECEBIMENTO` e `CONTROLE_QUALIDADE` só são excluídos quando `origem = LEGADO`.

Fonte central:

- `packages/backend/src/domain/producao/producao-metrics.ts`

Obrigatoriedades:

- qualquer nova tela que mostre produção deve reutilizar a regra central;
- não é permitido duplicar a mesma regra manualmente em SQL ou no frontend;
- se uma tela precisar de outra definição legítima, o nome do indicador deve explicitar a diferença.

## Números do Dashboard

As telas de dashboard devem respeitar:

- produção exibida com base na regra `producao_contabilizada`;
- labels coerentes com o cálculo real;
- ausência de número crítico não pode virar `0` silenciosamente;
- `0` real deve continuar aparecendo como `0`.

## Números do Histórico

O histórico do colaborador deve:

- usar a mesma base de produção contabilizada quando estiver exibindo produção;
- respeitar os mesmos filtros de período aplicados no backend;
- diferenciar erro de API, dado ausente e `0` real.

## Números dos Relatórios

Relatórios devem:

- usar a mesma regra central quando o conceito for produção contabilizada;
- agregar colaboradores por `usuario_id`, não por nome;
- usar o nome apenas como label visual;
- evitar dupla agregação backend + frontend quando não houver necessidade real;
- manter coerência entre total exibido, exportado e consolidado.

## Regra da Importação

Quando números vêm da importação legada:

- quantidade inválida não pode virar `1`;
- data inválida não pode virar data atual;
- preview e importação final devem usar a mesma validação;
- linha inválida deve ser bloqueada;
- linha inválida não pode ser inserida nem atualizada.

Fonte central:

- `packages/backend/src/domain/producao/importacao-legado.ts`

## Regra de Exibição no Frontend

Padrão visual:

- `0` real: exibir `0`;
- valor ausente ou inválido: exibir `—`;
- erro de API: exibir mensagem de erro explícita;
- payload inválido: nunca exibir `0` falso.

Fonte central:

- `packages/frontend/src/utils/number.ts`

## Diferença Entre `0`, `—` e Erro

- `0`
  - significa dado válido cujo valor é zero.
- `—`
  - significa dado ausente, inválido ou indisponível sem confirmação de erro fatal.
- erro explícito
  - significa falha de API, contrato quebrado ou impossibilidade real de carregar o número.

## Checklist Antes de Alterar Métricas

- confirmar a origem do dado;
- confirmar se a regra já existe em helper central;
- procurar por `|| 0`, `?? 0`, `|| 1` e `parseInt(...) || 1`;
- comparar banco, backend, frontend e tela;
- validar se o label visual continua coerente com o cálculo real.
