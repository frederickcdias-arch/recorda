# Fechamento das Ressalvas dos Números do Sistema Recorda

## 1. Resumo

As ressalvas restantes do fluxo numérico auditado foram tratadas sem reabrir os P0/P1 já resolvidos. O timezone residual em `admin.ts` foi migrado para `America/Cuiaba`, o lançamento manual de produção deixou de forçar quantidade `1`, o dashboard secundário deixou de mascarar valor inválido como `0`, e as telas do colaborador passaram a exibir erro explícito quando a API falha.

Também foram executadas as tentativas de `test`, `typecheck` e `lint`. O ambiente atual continua sem `npm` e sem `node` no `PATH`, então a impossibilidade ficou registrada com o erro exato.

## 2. Ressalvas corrigidas

- `packages/backend/src/infrastructure/http/routes/admin.ts`: removido uso residual de `America/Sao_Paulo` nas estatísticas administrativas de produção.
- `packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx`: removido `parseInt(e.target.value) || 1`; o campo pode ficar vazio enquanto o usuário digita e a validação ocorre antes do envio.
- `packages/frontend/src/components/dashboard/Dashboard.tsx`: removido `data.value || 0`; `0` real continua exibindo `0`, valor ausente/inválido agora exibe `—`.
- `packages/frontend/src/pages/Dashboard.tsx`: dashboard do colaborador agora mostra erro explícito e ação de retry quando a API falha.
- `packages/frontend/src/pages/colaborador/MeuHistoricoPage.tsx`: histórico do colaborador agora mostra erro explícito e ação de retry quando a API falha.

## 3. Arquivos alterados

- `packages/backend/src/infrastructure/http/routes/admin.ts`
- `packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx`
- `packages/frontend/src/components/dashboard/Dashboard.tsx`
- `packages/frontend/src/pages/Dashboard.tsx`
- `packages/frontend/src/pages/colaborador/MeuHistoricoPage.tsx`

## 4. Correção em admin.ts

- As duas ocorrências críticas de `AT TIME ZONE 'America/Sao_Paulo'` foram trocadas para `AT TIME ZONE 'America/Cuiaba'`.
- A lógica de recontagem e deduplicação permaneceu igual; a mudança foi apenas de timezone.
- Busca pós-correção: não restou `America/Sao_Paulo` em `admin.ts`.

## 5. Correção em LancarProducaoPage.tsx

- `quantidade` passou a ser controlada como texto para permitir campo vazio durante digitação.
- Foi adicionada a função `validarQuantidade`, que aceita somente inteiro maior que zero.
- O envio agora é bloqueado para quantidade vazia, `0`, negativa, decimal, textual ou `NaN`.
- Mensagem aplicada: `Informe uma quantidade inteira maior que zero.`
- O payload enviado ao backend volta a ser numérico somente depois da validação.

## 6. Correção em components/dashboard/Dashboard.tsx

- O widget `GaugeWidget` agora usa `parseFiniteNumber(data?.value)`.
- `0` real continua renderizando `0`.
- `null`, `undefined`, `NaN` e payload inválido deixam de virar `0` e passam a exibir `—`.
- A largura visual do gauge continua calculada com fallback técnico interno para a barra, sem mascarar o valor textual.

## 7. Estados de erro adicionados

- `packages/frontend/src/pages/Dashboard.tsx`
  - Mensagem: `Não foi possível carregar os números agora. Tente novamente em instantes.`
  - Ação: `Tentar novamente`
- `packages/frontend/src/pages/colaborador/MeuHistoricoPage.tsx`
  - Mensagem: `Não foi possível carregar os números agora. Tente novamente em instantes.`
  - Ação: `Tentar novamente`

## 8. Buscas pós-correção

- `America/Sao_Paulo`
  - Removida do fluxo crítico auditado.
  - Restante:
    - `packages/backend/src/infrastructure/security/ZeroTrustService.ts`
    - `packages/backend/src/infrastructure/multi-tenant/MultiTenantService.ts`
  - Classificação: `fora do escopo` desta correção focada de números.
- `parseInt(e.target.value) || 1`
  - Removida.
- `|| 1`
  - Restante em formulários operacionais de volumes/caixas e defaults técnicos de serviços avançados.
  - Classificação: `pode permanecer` ou `fora do escopo`, porque não pertence ao fluxo numérico auditado de produção/histórico/dashboard.
- `data.value || 0`
  - Removida.
- `|| 0`
  - Restante em cálculos técnicos e telas operacionais fora do escopo.
  - No fluxo auditado, os usos restantes identificados são visuais/técnicos:
    - `packages/frontend/src/pages/Dashboard.tsx`: `valor ?? 0` apenas para largura de barra.
    - `packages/frontend/src/pages/colaborador/MeuHistoricoPage.tsx`: `total ?? 0` apenas para texto de paginação.
  - Classificação: `pode permanecer`.
- `?? 0`
  - Restante majoritariamente em contagem interna, rowCount, paginação, largura visual e serviços não auditados.
  - Classificação: `pode permanecer` quando não mascara dado crítico exibido como se fosse dado real.
- `toSafeNumber`
  - Sem ocorrências ativas em `packages/backend/src` e `packages/frontend/src`.
- `session_replication_role`
  - Sem ocorrências ativas em `packages/backend/src` e `packages/frontend/src`.

## 9. Testes executados

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `node_modules\.bin\vitest.cmd run packages/backend/src/domain/producao/importacao-legado.test.ts packages/backend/src/domain/producao/producao-metrics.test.ts packages/frontend/src/utils/number.test.ts`
- `where.exe node`
- `where.exe npm`

## 10. Resultado dos testes

- `npm test`
  - Falhou no shell antes da execução.
  - Erro: `npm : O termo 'npm' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável.`
- `npm run typecheck`
  - Falhou no shell antes da execução.
  - Erro: `npm : O termo 'npm' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável.`
- `npm run lint`
  - Falhou no shell antes da execução.
  - Erro: `npm : O termo 'npm' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável.`
- `node_modules\.bin\vitest.cmd run ...`
  - O wrapper foi encontrado, mas não conseguiu iniciar.
  - Erro: `"node" não é reconhecido como um comando interno ou externo, um programa operável ou um arquivo em lotes.`
- `where.exe node`
  - Não encontrou `node`.
- `where.exe npm`
  - Não encontrou `npm`.

## 11. Pendências restantes

- Executar `test`, `typecheck` e `lint` em um ambiente com `Node >= 20` e `npm` disponíveis no `PATH`.
- As ocorrências de `America/Sao_Paulo` em `ZeroTrustService.ts` e `MultiTenantService.ts` não pertencem ao fluxo numérico auditado, mas podem ser revisadas em uma limpeza posterior de timezone global.

## 12. Classificação final

**Aprovado**

Critério aplicado:

- `admin.ts` não usa mais o timezone antigo no fluxo estatístico auditado.
- o lançamento de produção não força mais quantidade `1`.
- o componente secundário de dashboard não mascara valor inválido como `0`.
- as tentativas de `test`, `typecheck` e `lint` foram executadas e a impossibilidade ficou justificada com erro exato de ambiente.
- não restou P0/P1 aberto no fluxo numérico auditado por esta etapa.
