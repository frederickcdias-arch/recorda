# Timezone do Sistema Recorda

## Timezone Oficial

O timezone oficial do sistema Recorda é:

- `America/Cuiaba`

## Onde Isso Se Aplica

Esse timezone deve ser respeitado em:

- dashboards;
- relatórios;
- histórico do colaborador;
- filtros de período;
- importações;
- comparações de data;
- definição de “hoje”, “últimos 7 dias” e “mês atual”.

## O Que Evitar

Não usar em fluxo numérico:

- `America/Sao_Paulo`;
- `CURRENT_DATE` sem timezone explícito;
- fronteiras implícitas de dia em cálculos críticos;
- conversões manuais fora do utilitário central quando já houver helper existente.

## Fontes Centrais

- `packages/backend/src/main.ts`
- `packages/frontend/src/utils/date.ts`

## Exemplos de Uso Correto

- backend definindo timezone oficial do processo;
- filtros de período baseados em `America/Cuiaba`;
- formatação de datas críticas usando utilitário central do frontend;
- relatórios que calculam início e fim do dia explicitamente no timezone oficial.

## Alerta Obrigatório

Qualquer ocorrência de `America/Sao_Paulo` em fluxo numérico deve ser tratada como suspeita até revisão.

Qualquer ocorrência de `CURRENT_DATE` em:

- relatórios;
- dashboards;
- histórico;
- importações;

deve ser revisada para garantir timezone explícito.
