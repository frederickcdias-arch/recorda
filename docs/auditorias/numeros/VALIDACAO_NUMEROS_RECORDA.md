# Validação Final dos Números do Sistema Recorda

## 1. Resumo da validação

A validação foi feita por leitura estática do código corrigido, comparação com `AUDITORIA_NUMEROS_RECORDA.md` e `CORRECAO_NUMEROS_RECORDA.md`, buscas globais por regras antigas e tentativa de execução dos comandos de teste.

O fluxo crítico auditado ficou coerente:
- regra central de `producao_contabilizada` existe e está sendo reutilizada nas rotas principais;
- timezone oficial `America/Cuiaba` está aplicado no fluxo principal;
- importação legada passou a validar quantidade e data de forma rígida;
- o uso ativo de `session_replication_role` saiu das rotas;
- as telas críticas deixaram de mascarar payload inválido como `0`.

Persistem ressalvas fora do fluxo principal e não foi possível executar a suíte automatizada neste ambiente porque `node` não está disponível no `PATH`.

## 2. Status geral

Classificação final: **Aprovado com ressalvas**

Motivo:
- P0 do escopo auditado estão resolvidos no código.
- P1 principais estão resolvidos.
- Há resíduos secundários fora do miolo auditado.
- A validação automatizada ficou bloqueada por ambiente incompleto.

## 3. Correções P0 validadas

- Regra única de produção:
  - Confirmada em [producao-metrics.ts](/c:/projects/recorda/packages/backend/src/domain/producao/producao-metrics.ts).
  - A definição está correta: inclui `SISTEMA`, inclui `LEGADO`, exclui `RECEBIMENTO` e `CONTROLE_QUALIDADE` apenas quando a origem é `LEGADO`.
- Reuso da regra:
  - Confirmado em [dashboard.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/dashboard.ts), [metas.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/metas.ts) e [relatorios.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/relatorios.ts).
  - [operacional-helpers.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/operacional-helpers.ts) não consome a regra de produção porque é um helper genérico; isso não é divergência funcional.
- Timezone oficial:
  - Confirmado em [main.ts](/c:/projects/recorda/packages/backend/src/main.ts), [dashboard.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/dashboard.ts), [metas.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/metas.ts), [relatorios.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/relatorios.ts), [operacional-importacao-legado.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/operacional-importacao-legado.ts) e [date.ts](/c:/projects/recorda/packages/frontend/src/utils/date.ts).
- Importação legada:
  - Confirmada a validação compartilhada por preview, validação de duplicatas e importação final em [operacional-importacao-legado.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/operacional-importacao-legado.ts) via [importacao-legado.ts](/c:/projects/recorda/packages/backend/src/domain/producao/importacao-legado.ts).
  - Quantidade inválida não vira `1`.
  - Data inválida não vira data atual.
- `session_replication_role`:
  - Não existe mais uso ativo no código de runtime auditado.

## 4. Correções P1 validadas

- O card do dashboard foi renomeado para `Repositórios com Produção` em [Dashboard.tsx](/c:/projects/recorda/packages/frontend/src/pages/Dashboard.tsx).
- O relatório consolidado passou a agregar internamente por `usuario_id` em [relatorios.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/relatorios.ts).
- Os números críticos do frontend usam [number.ts](/c:/projects/recorda/packages/frontend/src/utils/number.ts) para distinguir `0` real de valor ausente/inválido.

## 5. Testes executados

Comandos tentados:
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `node_modules\.bin\vitest.cmd run packages/backend/src/domain/producao/importacao-legado.test.ts packages/backend/src/domain/producao/producao-metrics.test.ts packages/frontend/src/utils/number.test.ts`
- `node_modules\.bin\tsc.cmd --noEmit -p packages/backend/tsconfig.json`
- `node_modules\.bin\tsc.cmd --noEmit -p packages/frontend/tsconfig.json`
- `node_modules\.bin\eslint.cmd . --ext .ts,.tsx`

## 6. Resultado dos testes

Nenhum dos comandos que dependem de Node pôde ser executado neste shell.

Erro retornado:

```text
'"node"' não é reconhecido como um comando interno
ou externo, um programa operável ou um arquivo em lotes.
```

Evidência:
- os wrappers [vitest.cmd](/c:/projects/recorda/node_modules/.bin/vitest.cmd), [tsc.cmd](/c:/projects/recorda/node_modules/.bin/tsc.cmd) e [eslint.cmd](/c:/projects/recorda/node_modules/.bin/eslint.cmd) chamam `node` explicitamente.
- `where.exe node` e `where.exe npm` não localizaram binários.

Como executar localmente:
1. Garantir Node 20+ no `PATH`.
2. Na raiz do monorepo, rodar:
   - `npm test`
   - `npm run typecheck`
   - `npm run lint`
3. Se quiser isolar os testes críticos:
   - `node_modules\\.bin\\vitest.cmd run packages/backend/src/domain/producao/importacao-legado.test.ts packages/backend/src/domain/producao/producao-metrics.test.ts packages/frontend/src/utils/number.test.ts`

## 7. Busca por regras antigas

Status:
- **Fluxo crítico aprovado**.
- Não encontrei duplicação manual divergente da regra de produção nos arquivos principais auditados.

Uso confirmado da regra central:
- [dashboard.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/dashboard.ts)
- [metas.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/metas.ts)
- [relatorios.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/relatorios.ts)

Observação:
- [operacional-helpers.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/operacional-helpers.ts) não aplica regra de produção; ele só expõe helpers utilitários.

## 8. Busca por timezone antigo

Ocorrências classificadas:

- [main.ts](/c:/projects/recorda/packages/backend/src/main.ts): `America/Cuiaba`
  - Classificação: correta.
- [date.ts](/c:/projects/recorda/packages/frontend/src/utils/date.ts): `America/Cuiaba`
  - Classificação: correta.
- [operacional-helpers.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/operacional-helpers.ts): `toLocaleString(... { timeZone: 'America/Cuiaba' })`
  - Classificação: correta.
- [admin.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/admin.ts): `AT TIME ZONE 'America/Sao_Paulo'`
  - Classificação: precisa migrar.
  - Impacto: rota administrativa de limpeza/recontagem ainda usa timezone antigo para estatísticas de produção.
- [MultiTenantService.ts](/c:/projects/recorda/packages/backend/src/infrastructure/multi-tenant/MultiTenantService.ts): `timezone: 'America/Sao_Paulo'`
  - Classificação: suspeita.
  - Impacto: não é fluxo numérico auditado principal, mas pode contaminar defaults.
- [ZeroTrustService.ts](/c:/projects/recorda/packages/backend/src/infrastructure/security/ZeroTrustService.ts): `timezone: 'America/Sao_Paulo'`
  - Classificação: pode permanecer.
  - Impacto: serviço de segurança, fora do fluxo de números em tela auditado.

Sobre `CURRENT_DATE`:
- Não restou uso em `dashboard.ts`, `metas.ts`, `relatorios.ts` ou `operacional-importacao-legado.ts`.
- No fluxo crítico auditado, a migração foi concluída.

Sobre `new Date()`, `Date.now()`, `toLocaleDateString`, `toLocaleString`:
- Há muitas ocorrências no repositório fora do escopo crítico.
- No fluxo crítico principal:
  - comparações simples de período no frontend com `new Date(dataInicio) > new Date(dataFim)` em [RelatoriosGerenciaisPage.tsx](/c:/projects/recorda/packages/frontend/src/pages/relatorios/RelatoriosGerenciaisPage.tsx) e [ExportacoesPage.tsx](/c:/projects/recorda/packages/frontend/src/pages/relatorios/ExportacoesPage.tsx)
    - Classificação: pode permanecer.
  - geração de nomes de arquivo e mensagens em [relatorios.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/relatorios.ts)
    - Classificação: pode permanecer, mas não padroniza timezone explicitamente.
  - ordenação por data em [ProducaoPage.tsx](/c:/projects/recorda/packages/frontend/src/pages/operacao/ProducaoPage.tsx)
    - Classificação: correta.

## 9. Busca por fallbacks numéricos perigosos

Arquivos críticos validados:
- [number.ts](/c:/projects/recorda/packages/frontend/src/utils/number.ts): correto.
- [Dashboard.tsx](/c:/projects/recorda/packages/frontend/src/pages/Dashboard.tsx): correto no tratamento principal; `?? 0` restante só é usado para largura visual do gráfico.
- [MeuHistoricoPage.tsx](/c:/projects/recorda/packages/frontend/src/pages/colaborador/MeuHistoricoPage.tsx): correto nos cards; `total ?? 0` restante só é usado na frase de paginação.
- [ProducaoPage.tsx](/c:/projects/recorda/packages/frontend/src/pages/operacao/ProducaoPage.tsx): correto.
- [RelatoriosGerenciaisPage.tsx](/c:/projects/recorda/packages/frontend/src/pages/relatorios/RelatoriosGerenciaisPage.tsx): correto.
- [ExportacoesPage.tsx](/c:/projects/recorda/packages/frontend/src/pages/relatorios/ExportacoesPage.tsx): correto para renderização crítica; preview operacional converte inválido para `NaN`, que depois vira `—`.

Ocorrências sensíveis restantes:
- [components/dashboard/Dashboard.tsx](/c:/projects/recorda/packages/frontend/src/components/dashboard/Dashboard.tsx): `const value = data.value || 0;`
  - Classificação: suspeita.
  - Impacto: componente secundário, fora da tela principal auditada, mas ainda mascara ausência como zero.
- [LancarProducaoPage.tsx](/c:/projects/recorda/packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx): `parseInt(e.target.value) || 1`
  - Classificação: precisa migrar.
  - Impacto: formulário de lançamento ainda força `1` no frontend ao apagar o campo, embora o backend já rejeite quantidade inválida.
- [Dashboard.tsx](/c:/projects/recorda/packages/frontend/src/pages/Dashboard.tsx): `valor ?? 0` no cálculo da largura da barra
  - Classificação: pode permanecer.
  - Impacto: só afeta visualização da barra, não o texto exibido.

## 10. Validação da importação legada

Status: **validada por análise estática**

Confirmado:
- quantidade vazia: rejeitada.
- quantidade textual: rejeitada.
- quantidade decimal: rejeitada.
- quantidade negativa: rejeitada.
- quantidade zero: rejeitada.
- data vazia: rejeitada.
- data incompleta: rejeitada.
- data impossível: rejeitada.
- data inválida não vira data atual.
- quantidade inválida não vira `1`.
- preview e importação final compartilham a mesma validação via `parseImportRowStrict`.
- linha inválida não entra no fluxo de insert.
- linha inválida não entra no fluxo de update.

Mensagens confirmadas em [importacao-legado.ts](/c:/projects/recorda/packages/backend/src/domain/producao/importacao-legado.ts):
- `Quantidade inválida. Informe um número inteiro maior que zero.`
- `Data de produção inválida. Corrija a data na planilha antes de importar.`

Ressalva:
- Na rota `validar-duplicatas` em [operacional-importacao-legado.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/operacional-importacao-legado.ts), linhas inválidas entram como `novos` com `motivo` de erro em vez de aparecerem em uma estrutura formal de inválidos. A validação existe, mas a UX dessa rota secundária não está tão consistente quanto o preview principal.

## 11. Validação da regra de produção contabilizada

Status: **validada**

Definição central em [producao-metrics.ts](/c:/projects/recorda/packages/backend/src/domain/producao/producao-metrics.ts):
- origem `SISTEMA`: incluída.
- origem `LEGADO`: incluída.
- etapas `RECEBIMENTO` e `CONTROLE_QUALIDADE`: excluídas apenas quando `origem = LEGADO`.

Uso confirmado:
- dashboard operacional
- desempenho/meta
- meu histórico
- relatório operacional
- exportação operacional
- listagem `/operacional/producao`
- relatório consolidado `/relatorios`

Não encontrei outra query divergente duplicando essa regra manualmente nos arquivos críticos.

## 12. Validação do frontend

Status: **parcialmente validado**

Confirmado:
- `0` real permanece `0`.
- dado ausente nos cards críticos vira `—`.
- payload inválido deixa de aparecer como `0` nas telas críticas corrigidas.
- não há mais `toSafeNumber` nas páginas críticas auditadas.

Ressalvas:
- [Dashboard.tsx](/c:/projects/recorda/packages/frontend/src/pages/Dashboard.tsx) do colaborador não exibe estado de erro explícito; evita zero falso, mas em falha de API tende a cair em ausência visual e não em feedback de erro.
- [MeuHistoricoPage.tsx](/c:/projects/recorda/packages/frontend/src/pages/colaborador/MeuHistoricoPage.tsx) segue o mesmo padrão: evita número falso, mas não mostra erro explícito de contrato/API.
- [LancarProducaoPage.tsx](/c:/projects/recorda/packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx) ainda tem fallback local de quantidade para `1`.

## 13. Validação manual recomendada

Checklist sugerido:

### Importação

Testar planilha com:
- quantidade vazia
- quantidade `0`
- quantidade `-1`
- quantidade `1.5`
- quantidade `abc`
- data vazia
- `31/02/2026`
- `11-21`

Resultado esperado:
- a linha aparece como inválida no preview;
- a linha não é importada;
- a mensagem de erro é clara.

### Consistência entre telas

Comparar o mesmo período em:
- Dashboard Admin
- Dashboard Colaborador
- Meu Histórico
- Produção Operacional
- Relatórios Gerenciais
- Exportações

Confirmar:
- quando o escopo for equivalente, os totais batem;
- `Repositórios com Produção` não é lido como “ativos por status”.

### Timezone

Criar ou localizar registros próximos da virada do dia em Cuiabá:
- `23:50` `America/Cuiaba`
- `00:10` `America/Cuiaba`

Confirmar:
- “hoje” respeita Cuiabá;
- “últimos 7 dias” respeita Cuiabá;
- “mês atual” respeita Cuiabá;
- relatórios por período respeitam Cuiabá.

## 14. Problemas restantes

- [admin.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/admin.ts) ainda usa `America/Sao_Paulo` em estatísticas administrativas de produção.
- [LancarProducaoPage.tsx](/c:/projects/recorda/packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx) ainda faz `parseInt(... ) || 1`.
- [components/dashboard/Dashboard.tsx](/c:/projects/recorda/packages/frontend/src/components/dashboard/Dashboard.tsx) ainda usa `data.value || 0`.
- Não foi possível executar testes, typecheck ou lint neste ambiente por ausência de `node` no `PATH`.

## 15. Riscos ainda existentes

- Risco baixo a médio de inconsistência residual em rotas administrativas que ainda usam `America/Sao_Paulo`.
- Risco de UX enganosa no formulário de lançamento do colaborador por fallback local para `1`.
- Risco de componentes secundários ainda mascararem ausência numérica como zero fora das telas principais auditadas.
- Risco de regressão não detectada automaticamente enquanto a suíte não for executada em ambiente com Node.

## 16. Próximas correções recomendadas

1. Migrar [admin.ts](/c:/projects/recorda/packages/backend/src/infrastructure/http/routes/admin.ts) para `America/Cuiaba`.
2. Remover o fallback `parseInt(...) || 1` de [LancarProducaoPage.tsx](/c:/projects/recorda/packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx).
3. Revisar [components/dashboard/Dashboard.tsx](/c:/projects/recorda/packages/frontend/src/components/dashboard/Dashboard.tsx) para eliminar `|| 0` onde o valor é crítico.
4. Executar a suíte completa (`test`, `typecheck`, `lint`) em máquina com Node 20+ e registrar o resultado.
5. Se quiser fechar o tema de UX, adicionar estado explícito de erro no dashboard do colaborador e em Meu Histórico.

## 17. Conclusão

O sistema está **Aprovado com ressalvas**.

Os P0 do escopo auditado foram resolvidos no código: a regra central de produção contabilizada foi de fato centralizada e reutilizada, o timezone crítico foi migrado para `America/Cuiaba`, a importação legada parou de aceitar defaults perigosos e o frontend principal deixou de transformar payload inválido em `0`.

As ressalvas restantes não invalidam a correção principal, mas impedem classificar o sistema como `Aprovado` sem reservas: ainda há uso de timezone antigo em rota administrativa, um fallback local de quantidade no formulário do colaborador e a suíte não pôde ser executada neste ambiente.
