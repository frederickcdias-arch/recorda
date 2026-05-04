# Correção dos Números do Sistema Recorda

## 1. Resumo das correções

Foram aplicadas correções estruturais para unificar a regra de produção contabilizada, padronizar o timezone oficial em `America/Cuiaba`, endurecer a validação da importação legada e impedir que telas críticas convertam payload inválido em `0` silenciosamente.

Também foi criada uma camada central de regras numéricas no backend para reduzir divergência entre dashboard, histórico, relatórios e listagem operacional.

## 2. Problemas P0 corrigidos

- `D001` e `D002`: dashboard, histórico do colaborador, relatórios gerenciais e listagem operacional passaram a reutilizar a mesma regra central `producao_contabilizada`.
- `D003`: timezone oficial padronizado para `America/Cuiaba` em inicialização do backend, filtros principais e utilitário de datas do frontend.
- `D007`: importação legada não aceita mais quantidade vazia, textual, decimal ou não positiva.
- `D008`: importação legada não aceita mais data vazia, incompleta ou inválida; o fallback para data atual foi removido.
- `D010`: o uso de `session_replication_role = 'replica'` foi removido das rotas de importação auditadas.

## 3. Problemas P1 corrigidos

- O card do dashboard admin foi renomeado para `Repositórios com Produção`.
- As telas críticas deixaram de tratar payload inválido como `0` em cards e resumos principais; o fallback visual agora é `—`.
- O relatório consolidado deixou de agrupar colaboradores por nome normalizado e passou a usar `usuario_id` como chave interna de agregação.

## 4. Regra final de produção adotada

Regra central: `producao_contabilizada`.

Definição:

- Inclui registros com origem `SISTEMA`.
- Inclui registros com origem `LEGADO`.
- Exclui `RECEBIMENTO` e `CONTROLE_QUALIDADE` apenas quando a origem é `LEGADO`.

Essa regra foi centralizada em `packages/backend/src/domain/producao/producao-metrics.ts`.

## 5. Timezone final adotado

Timezone oficial adotado: `America/Cuiaba`.

Aplicações feitas:

- `packages/backend/src/main.ts`
- filtros de período nas rotas de dashboard, metas/histórico e relatórios
- utilitário `packages/frontend/src/utils/date.ts`

## 6. Mudanças na importação legada

- A validação de quantidade foi centralizada em `packages/backend/src/domain/producao/importacao-legado.ts`.
- A validação de data foi centralizada no mesmo módulo.
- Preview, validação de duplicatas e importação efetiva passaram a compartilhar a mesma validação estrita.
- Quantidade inválida agora gera: `Quantidade inválida. Informe um número inteiro maior que zero.`
- Data inválida agora gera: `Data de produção inválida. Corrija a data na planilha antes de importar.`
- O fallback silencioso para `1` e para a data atual foi removido.

## 7. Mudanças no frontend

- `packages/frontend/src/utils/number.ts` foi criado para diferenciar `0` real de valor ausente/inválido.
- Dashboard admin e colaborador, Meu Histórico, Produção, Relatórios Gerenciais e Exportações passaram a usar esse tratamento nos números críticos.
- Datas exibidas nessas telas passaram a usar o utilitário central de data com timezone do sistema.

## 8. Arquivos alterados

- `packages/backend/src/domain/producao/importacao-legado.ts`
- `packages/backend/src/domain/producao/importacao-legado.test.ts`
- `packages/backend/src/domain/producao/producao-metrics.ts`
- `packages/backend/src/domain/producao/producao-metrics.test.ts`
- `packages/backend/src/infrastructure/http/routes/dashboard.ts`
- `packages/backend/src/infrastructure/http/routes/metas.ts`
- `packages/backend/src/infrastructure/http/routes/operacional-helpers.ts`
- `packages/backend/src/infrastructure/http/routes/operacional-importacao-legado.ts`
- `packages/backend/src/infrastructure/http/routes/relatorios.ts`
- `packages/backend/src/main.ts`
- `packages/frontend/src/pages/Dashboard.tsx`
- `packages/frontend/src/pages/colaborador/MeuHistoricoPage.tsx`
- `packages/frontend/src/pages/operacao/ProducaoPage.tsx`
- `packages/frontend/src/pages/relatorios/ExportacoesPage.tsx`
- `packages/frontend/src/pages/relatorios/RelatoriosGerenciaisPage.tsx`
- `packages/frontend/src/utils/date.ts`
- `packages/frontend/src/utils/number.ts`
- `packages/frontend/src/utils/number.test.ts`

## 9. Testes criados ou ajustados

Criados:

- `packages/backend/src/domain/producao/importacao-legado.test.ts`
- `packages/backend/src/domain/producao/producao-metrics.test.ts`
- `packages/frontend/src/utils/number.test.ts`

Cobertura adicionada:

- quantidade válida vs inválida
- data válida vs inválida
- regra central de produção contabilizada
- diferença entre `0` real e payload inválido no frontend

## 10. Pontos pendentes de decisão humana

- Confirmar se `producao_contabilizada` deve mesmo ser a mesma regra exibida em todas as visões de colaborador, ou se alguma tela precisa expor uma segunda métrica nomeada explicitamente.
- Confirmar se o lançamento direto de produção deve rejeitar ausência de data no backend, ou se a UI sempre deve enviar a data explicitamente.
- Confirmar se há outras rotas fora do escopo auditado que ainda precisam migrar para `America/Cuiaba`.

## 11. Como validar manualmente

1. Importar uma planilha com quantidade vazia, decimal e textual; cada linha deve aparecer como inválida no preview e não pode ser importada.
2. Importar uma planilha com data vazia, `31/02/2026` e `11-21`; as linhas devem ser rejeitadas no preview e na importação final.
3. Comparar o mesmo período entre Dashboard Admin, Meu Histórico, Produção Operacional e Relatórios Gerenciais; a regra de produção exibida deve bater.
4. Validar registros próximos da virada do dia para garantir consistência com `America/Cuiaba`.
5. Induzir payload numérico inválido em dashboard/relatórios/exportações e verificar que o valor não aparece como `0`.

## 12. Riscos restantes

- Não foi possível executar `typecheck` ou a suíte automatizada neste ambiente porque `node`/`npm` não estão expostos no shell atual.
- Existem mudanças prévias do usuário em arquivos sensíveis fora do escopo desta correção; elas foram preservadas, mas exigem validação integrada.
- Há rotas fora do grupo auditado que ainda podem usar `America/Sao_Paulo` ou convenções antigas e não foram alteradas nesta etapa.
