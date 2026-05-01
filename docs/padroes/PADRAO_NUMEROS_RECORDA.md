# Padrão de Números do Sistema Recorda

## 1. Objetivo

Este documento define as regras técnicas definitivas para números exibidos no sistema Recorda, com base nos diagnósticos e correções já aprovados em:

- `docs/auditorias/numeros/AUDITORIA_NUMEROS_RECORDA.md`
- `docs/auditorias/numeros/CORRECAO_NUMEROS_RECORDA.md`
- `docs/auditorias/numeros/VALIDACAO_NUMEROS_RECORDA.md`
- `docs/auditorias/numeros/FECHAMENTO_RESSALVAS_NUMEROS_RECORDA.md`

Qualquer nova tela, rota, relatório, dashboard, importação ou componente que exiba números deve seguir este padrão.

## 2. Regra Oficial de Produção Contabilizada

Regra oficial: `producao_contabilizada`.

Definição:

- origem `SISTEMA` entra;
- origem `LEGADO` entra;
- `RECEBIMENTO` e `CONTROLE_QUALIDADE` só são excluídos quando `origem = LEGADO`.

Consequências obrigatórias:

- a palavra “produção” não pode representar regras diferentes sem nome explícito;
- qualquer nova tela que mostre produção deve reutilizar a regra central;
- se existir uma segunda métrica legítima, ela deve ser nomeada claramente, por exemplo:
  - `produção contabilizada`
  - `produção operacional`
  - `produção legada`
  - `produção total`
- não é permitido reimplementar essa regra manualmente em SQL, backend ou frontend se o helper central já existir.

Fonte oficial:

- `packages/backend/src/domain/producao/producao-metrics.ts`

## 3. Timezone Oficial

Timezone oficial do sistema:

- `America/Cuiaba`

Regras obrigatórias:

- não usar `America/Sao_Paulo` em fluxo numérico;
- não usar `CURRENT_DATE` sem timezone explícito em:
  - relatórios
  - dashboards
  - histórico
  - importações
  - filtros de período
- “hoje”, “últimos 7 dias”, “mês atual”, “início do dia” e “fim do dia” devem respeitar `America/Cuiaba`;
- datas exibidas em tela devem usar utilitário central quando fizerem parte de fluxo numérico validado;
- qualquer cálculo de comparação entre datas em backend deve explicitar a fronteira temporal adotada.

Arquivos centrais do padrão temporal:

- `packages/backend/src/main.ts`
- `packages/frontend/src/utils/date.ts`

## 4. Regras para Importação

As regras de importação são estritas. Não é permitido normalizar entrada inválida para um valor aparentemente válido.

Regras obrigatórias:

- quantidade inválida não pode virar `1`;
- data inválida não pode virar data atual;
- preview e importação final devem usar a mesma validação;
- linha inválida deve ser bloqueada;
- linha inválida não pode ser inserida;
- linha inválida não pode ser atualizada;
- mensagens de erro devem ser claras e determinísticas.

Mensagens padrão:

- `Quantidade inválida. Informe um número inteiro maior que zero.`
- `Data de produção inválida. Corrija a data na planilha antes de importar.`

Casos que devem ser rejeitados:

- quantidade vazia;
- quantidade textual;
- quantidade decimal;
- quantidade negativa;
- quantidade zero;
- data vazia;
- data incompleta;
- data impossível;
- data inválida em formato ambíguo.

Fonte oficial:

- `packages/backend/src/domain/producao/importacao-legado.ts`

## 5. Regras para Frontend

O frontend não pode mascarar contrato quebrado como número real.

Regras obrigatórias:

- payload inválido não pode aparecer como `0`;
- `0` real deve aparecer como `0`;
- valor ausente ou inválido deve aparecer como `—` ou erro explícito;
- erro de API deve ter mensagem clara;
- fallback técnico só pode existir quando não altera o valor textual percebido pelo usuário;
- barra visual, paginação técnica ou largura percentual podem usar fallback interno apenas se o texto principal continuar correto.

Comportamentos esperados:

- valor numérico válido: renderizar normalmente;
- valor `0`: renderizar `0`;
- valor `null`, `undefined`, `NaN` ou contrato quebrado: renderizar `—` ou mensagem de erro;
- falha de API: exibir estado explícito de erro, nunca zero falso.

Fonte oficial:

- `packages/frontend/src/utils/number.ts`

## 6. Regras para Dashboards e Relatórios

Regras obrigatórias:

- não duplicar regra SQL manualmente se já existe helper central;
- não agregar colaborador por nome quando existir `usuario_id`;
- label visual deve bater com cálculo real;
- não chamar “ativos” o que é, na prática, “com produção”;
- não aplicar agregação duplicada backend + frontend sem necessidade;
- não misturar período, origem ou escopo sem nome claro;
- qualquer divergência intencional entre telas deve ser explicitada no nome do indicador.

Aplicações práticas:

- dashboards devem consumir a regra central de produção quando exibirem produção contabilizada;
- relatórios consolidados devem usar `usuario_id` como chave de agregação interna;
- o nome mostrado ao usuário pode ser o nome do colaborador, mas a identidade interna deve ser estável;
- filtros por etapa, data, origem e usuário devem ser consistentes entre backend e tela.

## 7. Checklist Obrigatório para Futuras Alterações

Antes de abrir PR, validar manualmente e por busca:

- procurar por `America/Sao_Paulo`;
- procurar por `CURRENT_DATE`;
- procurar por `|| 0`;
- procurar por `?? 0`;
- procurar por `|| 1`;
- procurar por `parseInt(...) || 1`;
- procurar por `session_replication_role`;
- procurar por regras de produção reescritas fora do helper central;
- procurar agregações por nome em vez de `usuario_id`;
- rodar testes;
- rodar `typecheck`;
- rodar `lint`.

Se houver ocorrência:

- classificar se é `correta`, `pode permanecer`, `fora do escopo` ou `precisa corrigir`;
- documentar a justificativa quando permanecer.

## 8. Arquivos Centrais que Devem Ser Respeitados

Os seguintes arquivos são a fonte central do padrão numérico atual e não devem ser contornados por implementação paralela:

- `packages/backend/src/domain/producao/producao-metrics.ts`
- `packages/backend/src/domain/producao/importacao-legado.ts`
- `packages/frontend/src/utils/number.ts`
- `packages/frontend/src/utils/date.ts`

## 9. Regras de Governança

Para qualquer alteração futura em número exibido:

- primeiro identificar a origem do dado;
- depois validar se a regra já existe em helper central;
- só então alterar backend, frontend ou SQL;
- nunca corrigir apenas visualmente se a regra real estiver errada na origem;
- nunca corrigir apenas no frontend quando o problema é backend;
- nunca introduzir fallback silencioso em número crítico;
- sempre validar o mesmo número entre banco, backend, frontend e tela quando o fluxo for crítico.

## 10. Resumo Executivo do Padrão

O sistema Recorda adota, como padrão definitivo:

- produção contabilizada centralizada em helper único;
- timezone oficial `America/Cuiaba`;
- importação estrita, sem normalização permissiva;
- frontend sem zero falso;
- dashboards e relatórios coerentes com a regra central;
- revisão obrigatória por busca e validação automatizada antes de liberar mudanças.
