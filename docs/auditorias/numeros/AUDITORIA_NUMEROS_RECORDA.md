# Auditoria Profunda de Números em Tela — Sistema Recorda

## 1. Resumo executivo

Esta auditoria foi realizada por análise estática completa do repositório local `recorda`, cobrindo frontend React/Vite, backend Fastify/TypeScript, migrações SQL, scripts e variáveis de ambiente locais. Não houve alteração de código funcional; o objetivo foi rastrear números exibidos em tela, suas origens, seus cálculos e os riscos de consistência.

Principais conclusões:

- O sistema exibe números operacionais em dashboards, histórico do colaborador, filas operacionais, relatórios, CQ, importações, auditoria e administração.
- A maior parte dos números vem de `producao_repositorio`, `repositorios`, `checklists`, `recebimento_processos`, `importacoes_legado_operacional` e `auditoria`, com agregações diretas em rotas backend.
- Há inconsistência relevante de timezone entre backend e frontend: o backend alterna `America/Cuiaba`, `America/Sao_Paulo` e `CURRENT_DATE`; o processo Node define `TZ='America/Sao_Paulo'`.
- Dashboard, relatórios operacionais e relatórios gerenciais excluem deliberadamente produção legada nas etapas `RECEBIMENTO` e `CONTROLE_QUALIDADE`, enquanto outras telas do colaborador não excluem. Isso cria divergência real entre telas.
- O frontend converte silenciosamente valores inválidos para `0` em vários pontos, o que reduz erro visível, mas mascara regressões de API.
- A importação legada converte quantidade inválida para `1` e também força `session_replication_role='replica'`, o que aumenta risco de números persistidos sem todas as proteções de trigger/auditoria.
- O ambiente local está configurado para backend e banco locais por padrão, mas o frontend aceita `VITE_API_BASE` externo; há risco operacional se essa variável for apontada para produção em ambiente local.
- Não foram encontrados valores monetários ou cálculos financeiros na superfície funcional auditada. O sistema atual é predominantemente operacional, não financeiro.

Status geral da auditoria:

- Correto: origem principal dos números operacionais é rastreável.
- Parcialmente correto: formatação, paginação e agregações básicas.
- Suspeito: consistência entre telas, timezone, exclusão seletiva de etapas e tratamento silencioso de dados inválidos.
- Crítico: risco de divergência entre telas e importações por regras diferentes e defaults permissivos.

## 2. Metodologia usada

1. Mapeamento da arquitetura pelo monorepo:
   Frontend em `packages/frontend`, backend em `packages/backend`, schema e migrações em `db/`.
2. Levantamento de rotas e telas:
   `packages/frontend/src/routes/index.tsx`, páginas, hooks e componentes.
3. Rastreamento de números visíveis:
   busca por `toLocaleString`, `toLocaleDateString`, paginação, contadores, `total`, `quantidade`, `meta`, `dias`, `hora`, `percentual`.
4. Rastreamento de origem:
   Banco → query SQL → rota Fastify → hook React Query / serviço API → componente/página.
5. Verificação de ambiente:
   `.env`, `.env.example`, `vite.config.ts`, `server.ts`, `config/index.ts`, `docker-compose.yml`, docs de deploy.
6. Busca de mocks/placeholders:
   `mock`, `seed`, `hardcoded`, `fallback`, `simulado`, `placeholder`.
7. Consolidação das evidências com foco em números realmente exibidos em tela.

Limitações objetivas desta auditoria:

- Não houve acesso a banco local populado, homologação ou produção.
- Não foi possível confrontar valor persistido real versus valor renderizado em runtime.
- Não foi possível validar cache externo/Redis em execução.
- Não há arquivos `.env.homolog` ou `.env.production` no repositório para comparação direta.

## 3. Mapa geral de telas auditadas

| Tela | Rota | Principais números visíveis | Fonte principal |
|---|---|---|---|
| Dashboard Admin | `/dashboard` | produção do mês, repositórios ativos, usuários ativos, produção por etapa, status, retrabalho CQ | `/dashboard` |
| Dashboard Colaborador | `/dashboard` | total de registros, quantidade total, últimos 7 dias, produção por etapa/tipo | `/producao/meu-historico` |
| Meu Histórico | `/minha-producao/historico` | totais, último registro, produção por etapa, paginação, quantidades por linha | `/producao/meu-historico` |
| Lançar Produção | `/minha-producao/lancar` | quantidade informada no lançamento | `/producao/lancar-direto` |
| Produção Operacional | `/producao` | total de registros, quantidades por linha, paginação, filtros por data | `/operacional/producao` |
| Fila Operacional | `/operacao/:etapa` | contadores por status, total geral, total de processos, checklist preenchido, aging em segundos/dias | `/operacional/repositorios` e rotas auxiliares |
| Recebimento Avulsos | painel | paginação, volume atual/total, quantidade de processos/apensos | `/operacional/recebimento-avulsos` |
| Controle de Qualidade | painel | total, aprovados, reprovados, pendentes, total de repositórios em CQ | rotas CQ |
| Relatórios Gerenciais | `/relatorios/gerenciais` | totais por etapa, total caixas, total imagens, total por coordenadoria/colaborador | `/relatorios` |
| Exportações | `/relatorios/exportacoes` | preview de totais, quantidades operacionais, contagem de registros | `/relatorios`, `/relatorios/operacional` |
| Importar Produção | `/producao/importar` | total de registros, válidos, duplicados, inseridos, atualizados, ignorados, erros | rotas de importação legado |
| Auditoria | `/auditoria/*` | paginação, totais por tabela/operação/data | `/auditoria` |
| Administração | `/configuracoes/admin` | total processado em recontagem, data/hora atual | rotas admin |
| Vincular Produções | `/configuracoes/vincular-producoes` | total produções, repositórios, preview, total registros, quantidade total | rotas admin |
| Conhecimento Operacional | `/operacao/conhecimento` | contadores por aba, ordem/versão | rotas conhecimento |

## 4. Inventário completo de números encontrados

| ID | Tela | Rota | Componente | Número exibido | Significado | Origem | Status | Risco |
|---|---|---|---|---|---|---|---|---|
| N001 | Dashboard Admin | `/dashboard` | cards principais | `producaoTotal` | produção do mês | `SUM(producao_repositorio.quantidade)` | Parcialmente correto | Alto |
| N002 | Dashboard Admin | `/dashboard` | card | `processosAtivos` | repositórios com produção | `COUNT(DISTINCT repositorio_id)` | Parcialmente correto | Alto |
| N003 | Dashboard Admin | `/dashboard` | card | `processosNovosHoje` | repositórios com produção hoje | `COUNT(DISTINCT repositorio_id)` com data | Suspeito | Alto |
| N004 | Dashboard Admin | `/dashboard` | card | `colaboradoresAtivos` | usuários ativos | `COUNT(*) FROM usuarios WHERE ativo` | Correto | Médio |
| N005 | Dashboard Admin | `/dashboard` | gráfico/lista | `producaoPorEtapa.valor` | soma por etapa/função | agregação backend | Parcialmente correto | Alto |
| N006 | Dashboard Admin | `/dashboard` | lista | `statusRecebimento.valor` | importados hoje, registros no mês, importações com erro | agregações distintas | Parcialmente correto | Alto |
| N007 | Dashboard Admin | `/dashboard` | lista | `retrabalhoCQ.total` | reprovações por motivo | `COUNT(*) lotes_controle_qualidade_itens` | Correto | Médio |
| N008 | Dashboard Colaborador | `/dashboard` | cards | `total` | total de registros do usuário | `/producao/meu-historico` | Correto | Médio |
| N009 | Dashboard Colaborador | `/dashboard` | cards | `totalQuantidade` | soma das quantidades do usuário | `/producao/meu-historico` | Correto | Médio |
| N010 | Dashboard Colaborador | `/dashboard` | cards | `registrosUltimos7Dias`, `quantidadeUltimos7Dias` | atividade recente | `/producao/meu-historico` | Suspeito | Alto |
| N011 | Meu Histórico | `/minha-producao/historico` | cards/tabela | total, totalQuantidade, paginação | histórico filtrado do usuário | `/producao/meu-historico` | Correto | Médio |
| N012 | Meu Histórico | `/minha-producao/historico` | card | último registro | data do primeiro item retornado | frontend sobre lista ordenada | Parcialmente correto | Médio |
| N013 | Produção Operacional | `/producao` | header/tabela/paginação | total e quantidades | registros operacionais filtrados | `/operacional/producao` | Parcialmente correto | Alto |
| N014 | Fila Operacional | `/operacao/:etapa` | summary cards/badges | `contadores`, `totalGeral` | fila por status/etapa | `/operacional/repositorios` | Parcialmente correto | Alto |
| N015 | Fila Operacional | `/operacao/:etapa` | badges | `total_processos`, `total_relatorios` | documentação/relatórios por repositório | CTEs backend | Correto | Médio |
| N016 | Fila Operacional | `/operacao/:etapa` | checklist progress | `preenchidos/totalItens` | progresso do checklist | frontend sobre itens carregados | Correto | Baixo |
| N017 | Recebimento | `/operacao/recebimento` | processos/apensos | `volume_atual/volume_total` | controle documental | recebimento processual | Parcialmente correto | Médio |
| N018 | CQ | `/operacao/controle-qualidade` | resumo | total, aprovados, reprovados, pendentes | situação do CQ | rotas CQ | Parcialmente correto | Médio |
| N019 | Relatórios Gerenciais | `/relatorios/gerenciais` | tabelas e cards | total por etapa, caixas, imagens, colaboradores, coordenadorias | agregação consolidada | `/relatorios` | Parcialmente correto | Crítico |
| N020 | Exportações | `/relatorios/exportacoes` | preview gerencial | totais do relatório | `/relatorios` | Parcialmente correto | Crítico |
| N021 | Exportações | `/relatorios/exportacoes` | preview operacional | quantidade por linha e contagem de registros | `/relatorios/operacional` | Parcialmente correto | Alto |
| N022 | Importar Produção | `/producao/importar` | preview importação | total, válidos, duplicados, inseridos, atualizados, ignorados, erros | validação/importação legado | rotas importação | Suspeito | Crítico |
| N023 | Importar Produção | `/producao/importar` | histórico | total_registros, sucesso, erro | `importacoes_legado_operacional` | Correto | Médio |
| N024 | Auditoria | `/auditoria/*` | paginação/estatísticas | total, totalPaginas, totais por operação/tabela/data | tabela `auditoria` | Correto | Médio |
| N025 | Admin | `/configuracoes/admin` | feedback | total processado na recontagem | consulta admin | Suspeito | Médio |
| N026 | Vincular Produções | `/configuracoes/vincular-producoes` | cards/tabelas | total produções, total repositórios, quantidade_total | rotas admin | Parcialmente correto | Médio |
| N027 | Conhecimento Operacional | `/operacao/conhecimento` | tabs | contagem por aba | frontend sobre arrays carregados | Correto | Baixo |
| N028 | Diversas telas | várias | datas/horas | datas em pt-BR | backend + frontend | Parcialmente correto | Alto |

## 5. Análise detalhada por tela

### 5.1 Tela: Dashboard Admin

#### Número: Produção do Mês
- Local: card "Produção do Mês".
- Arquivo: `packages/frontend/src/pages/Dashboard.tsx`.
- Componente: `DashboardContent`.
- Origem: `useDashboard()` → `GET /dashboard`.
- Endpoint: `packages/backend/src/infrastructure/http/routes/dashboard.ts`.
- Banco/tabela/campo: `producao_repositorio.quantidade`.
- Regra de cálculo: soma mensal de `quantidade` desde o primeiro dia do mês.
- Formatação: inteiro com `toLocaleString('pt-BR')`.
- Ambiente: API local por proxy `/api` ou `VITE_API_BASE`.
- Validação: a regra é clara, mas exclui produção legada de `RECEBIMENTO` e `CONTROLE_QUALIDADE`.
- Problemas encontrados: mesma palavra "produção" aparece em outras telas sem essa exclusão.
- Risco: Alto.
- Recomendação: unificar definição de produção entre dashboard, relatórios e histórico.

#### Número: Repositórios Ativos / Importados Hoje
- Local: cards e status.
- Arquivo: `packages/frontend/src/pages/Dashboard.tsx`.
- Origem: `/dashboard`.
- Banco/tabela/campo: `COUNT(DISTINCT p.repositorio_id)`.
- Regra de cálculo: conta repositórios com produção, não repositórios ativos por status.
- Validação: o título "Repositórios Ativos" é potencialmente impreciso; mede atividade produtiva, não estoque operacional atual.
- Problemas encontrados: divergência semântica entre rótulo visual e SQL real.
- Risco: Alto.
- Recomendação: renomear ou recalcular.

### 5.2 Tela: Dashboard Colaborador

#### Número: Total de Registros / Quantidade Total
- Local: cards "Minhas Estatísticas".
- Arquivo: `packages/frontend/src/pages/Dashboard.tsx`.
- Componente: `DashboardColaborador`.
- Origem: `GET /producao/meu-historico`.
- Banco/tabela/campo: `COUNT(*)`, `SUM(pr.quantidade)` em `producao_repositorio`.
- Regra de cálculo: agregação por `usuario_id`.
- Validação: coerente.
- Problemas encontrados: fallback silencioso no frontend quando `data.total` não existe usa `producoes.length` e `reduce` local.
- Risco: Médio.
- Recomendação: falhar explicitamente quando payload vier incompleto.

#### Número: Últimos 7 dias
- Local: cards de atividade recente.
- Origem: backend.
- Regra de cálculo: usa `CURRENT_DATE - INTERVAL '7 days'` sem `AT TIME ZONE 'America/Cuiaba'`.
- Validação: diverge do mesmo endpoint que filtra datas do histórico com `America/Cuiaba`.
- Problemas encontrados: mesmo endpoint mistura duas lógicas temporais.
- Risco: Alto.
- Recomendação: padronizar timezone e fronteira de dia.

### 5.3 Tela: Meu Histórico

#### Número: Último Registro
- Local: card "Último Registro".
- Arquivo: `packages/frontend/src/pages/colaborador/MeuHistoricoPage.tsx`.
- Origem: primeiro item da lista paginada.
- Regra de cálculo: `producoes[0]?.data_producao`.
- Validação: só é correto se a ordenação do backend for consistente e a página atual for a primeira.
- Problemas encontrados: se o usuário estiver na página 2+, o "último registro" passa a significar "primeiro item da página atual".
- Risco: Médio.
- Recomendação: backend deveria devolver `ultimoRegistro` global.

#### Número: Paginação e totais
- Origem: `/producao/meu-historico`.
- Regra de cálculo: `COUNT(*)` + `Math.ceil(total / limite)`.
- Validação: correta.
- Problemas encontrados: nenhum comprovado.
- Risco: Baixo.

### 5.4 Tela: Produção Operacional

#### Número: Total de registros de produção
- Local: header e paginação.
- Arquivo: `packages/frontend/src/pages/operacao/ProducaoPage.tsx`.
- Origem: `/operacional/producao`.
- Banco/tabela/campo: `COUNT(*)` em `producao_repositorio`.
- Regra de cálculo: filtra por origem `LEGADO/SISTEMA`, mas para `LEGADO` exclui etapas `RECEBIMENTO` e `CONTROLE_QUALIDADE`.
- Validação: não bate necessariamente com histórico individual do colaborador.
- Problemas encontrados: regra diferente entre telas.
- Risco: Alto.
- Recomendação: padronizar escopo do que é "produção" operacional.

### 5.5 Tela: Fila Operacional

#### Número: Contadores por status e total geral
- Local: summary cards e filtros.
- Arquivo: `packages/frontend/src/pages/operacao/EtapaOperacionalPage.tsx`.
- Origem: `/operacional/repositorios`.
- Banco/tabela/campo: `repositorios.status_atual`, `COUNT(*)`.
- Regra de cálculo: contadores são calculados separadamente da lista, com filtros equivalentes.
- Validação: coerente.
- Problemas encontrados: como a lista exclui projetos `LEGADO` e `IMPORTACAO_PRODUCAO`, os números não refletem todo o universo de produção do sistema.
- Risco: Médio.
- Recomendação: explicitar visualmente que a fila operacional exclui legados/importações.

#### Número: Total de processos / relatórios por repositório
- Local: badges nos cards.
- Origem: CTEs `proc_count` e `rel_count`.
- Validação: coerente com o local da tela.
- Problemas encontrados: nenhum comprovado.
- Risco: Baixo.

### 5.6 Tela: Recebimento / Avulsos

#### Número: Volume atual / volume total
- Local: processos e apensos.
- Origem: `recebimento_processos` e `recebimento_apensos`.
- Regra de cálculo: valores persistidos, exibidos como fração.
- Validação: correta para visualização.
- Problemas encontrados: ausência de validação global nesta auditoria sobre `volume_atual <= volume_total`.
- Risco: Médio.

### 5.7 Tela: Controle de Qualidade

#### Número: Total / aprovados / reprovados / pendentes
- Local: resumo do painel CQ.
- Arquivo: `packages/frontend/src/pages/operacao/ControleQualidadePanel.tsx`.
- Origem: rotas CQ.
- Regra de cálculo: backend retorna `resumo`.
- Validação: frontend faz fallback para zeros (`{ total: 0, aprovados: 0, ... }`) em erro ou ausência.
- Problemas encontrados: quebra de payload pode virar "zero" em vez de gerar alerta visual forte.
- Risco: Médio.

### 5.8 Tela: Relatórios Gerenciais

#### Número: Resumo por etapa / total caixas / total imagens
- Local: tabela principal.
- Arquivo: `packages/frontend/src/pages/relatorios/RelatoriosGerenciaisPage.tsx`.
- Origem: `GET /relatorios`.
- Banco/tabela/campo: `producao_repositorio.quantidade`.
- Regra de cálculo: backend classifica unidade por função; digitalização vira `IMAGENS`, demais `CAIXAS`.
- Validação: lógica rastreável, porém dependente de `marcadores.funcao`.
- Problemas encontrados:
  - exclui `RECEBIMENTO` e `CONTROLE_QUALIDADE` no consolidado;
  - colaborador é agregado por nome normalizado, não por `id`;
  - coordenadoria pode vir do usuário ou do marcador;
  - média por colaborador usa `Math.round`, escondendo frações.
- Risco: Crítico.
- Recomendação: consolidar por identificadores estáveis (`usuario_id`, `coordenadoria_id`) e documentar exclusões.

#### Número: Produção por colaborador
- Regra de cálculo: frontend volta a agregar linhas do relatório por `nome + etapa`.
- Problemas encontrados: dupla agregação backend + frontend aumenta risco de divergência e colisão homônima.
- Risco: Alto.

### 5.9 Tela: Exportações

#### Número: Preview operacional
- Local: modal de preview.
- Arquivo: `packages/frontend/src/pages/relatorios/ExportacoesPage.tsx`.
- Origem: `/relatorios/operacional`.
- Regra de cálculo: preview mostra até 100 linhas, com aviso.
- Validação: coerente para UX, mas não é um espelho integral do export.
- Problemas encontrados: o modal exibe `previewOperacional.length` como se fosse universo completo carregado; isso depende da API, não do arquivo exportado.
- Risco: Médio.

#### Número: Totais do preview gerencial
- Origem: `/relatorios`.
- Problemas encontrados: frontend usa `toSafeNumber`, mascarando `null`, `undefined` e erro de contrato como `0`.
- Risco: Alto.

### 5.10 Tela: Importar Produção

#### Número: Total, válidos, duplicados, inseridos, atualizados, ignorados, erros
- Local: preview, resumo por fonte e histórico.
- Arquivo: `packages/frontend/src/pages/producao/ImportarProducaoPage.tsx`.
- Origem: rotas de importação legado.
- Banco/tabela/campo: `producao_repositorio`, `importacoes_legado_operacional`, `fontes_importacao`, `importacao_fontes_linhas`.
- Regra de cálculo:
  - preview conta duplicidade intra-planilha e duplicidade no banco;
  - importação efetiva pode inserir, atualizar, ignorar ou marcar erro;
  - histórico persiste agregados.
- Validação: fluxo é rastreável, mas permissivo.
- Problemas encontrados:
  - quantidade inválida é normalizada para `1`;
  - datas inválidas podem virar data atual;
  - erros completos são truncados em resposta (`slice(0, 20)` / `slice(0, 50)`);
  - importação usa `session_replication_role='replica'`.
- Risco: Crítico.
- Recomendação: rejeitar dados inválidos em vez de autocorrigir silenciosamente.

### 5.11 Tela: Auditoria

#### Número: Totais por operação, tabela e data
- Local: estatísticas e paginação.
- Origem: tabela `auditoria`.
- Validação: coerente.
- Problemas encontrados: retenção automática apaga registros após 90 dias; auditorias históricas deixam de sustentar comparação retroativa.
- Risco: Médio.

## 6. Números financeiros

Não foram encontrados, nas telas auditadas e rotas correspondentes, valores monetários, saldos, comissões, faturamento, descontos, repasses, inadimplência ou quaisquer números financeiros transacionais visíveis ao usuário.

Conclusão desta seção:

- Não há evidência atual de risco financeiro direto na UI auditada.
- O risco principal é operacional e analítico, não monetário.
- Se houver módulos financeiros fora deste repositório ou ainda não roteados, eles não foram auditados aqui.

## 7. Contadores e totais

Achados principais:

- Existem contadores com semântica divergente entre título visual e cálculo real.
  Exemplo: "Repositórios Ativos" no dashboard admin é derivado de repositórios com produção, não do estado atual de `repositorios.status_atual`.
- Há exclusões seletivas de etapas nas consultas de dashboard/relatórios/produção operacional, mas não no histórico do colaborador.
- Contadores de importação resumem erros, porém truncam evidência de detalhe.
- Contadores de CQ e fila operacional são razoavelmente consistentes, mas parte do frontend faz fallback para zero em caso de falha.

Status: Parcialmente correto.

## 8. Percentuais e métricas

Métricas visíveis identificadas:

- `producaoTrend` no dashboard admin.
- larguras percentuais de barras em dashboard e histórico.
- confiança OCR mostrada em `%` no recebimento.

Achados:

- `producaoTrend` depende de comparação mensal simples e arredonda com `toFixed(0)`, perdendo granularidade.
- barras visuais usam valor máximo do conjunto atual e podem mascarar pequenas diferenças quando o topo é muito alto.
- OCR usa `(confianca * 100).toFixed(1)`; a origem é externa/serviço OCR, sem validação adicional de faixa.

Status: Parcialmente correto.

## 9. Datas, horários e períodos

Achado crítico central:

- O backend usa `America/Cuiaba` em relatórios, produção e histórico, mas usa `America/Sao_Paulo` no `TZ` do processo, em rotas admin e em várias verificações de duplicidade/importação.

Evidências:

- `packages/backend/src/main.ts`: `process.env.TZ = 'America/Sao_Paulo'`.
- `packages/backend/src/infrastructure/http/routes/metas.ts`: filtros com `AT TIME ZONE 'America/Cuiaba'`.
- `packages/backend/src/infrastructure/http/routes/relatorios.ts`: filtros com `America/Cuiaba`.
- `packages/backend/src/infrastructure/http/routes/operacional-importacao-legado.ts`: comparações com `America/Sao_Paulo`.

Impacto:

- fronteira de dia diferente entre importação, histórico e relatórios;
- duplicidade pode ser detectada num timezone e exibida noutro;
- "últimos 7 dias" usa `CURRENT_DATE`, não o mesmo timezone explícito dos filtros.

Status: Incorreto.

## 10. Gráficos e dashboards

Validação:

- Os dashboards usam agregações SQL próprias e não reaproveitam o mesmo consolidado dos relatórios.
- O dashboard admin exclui etapas legadas específicas; o dashboard do colaborador não replica essa exclusão.
- O frontend usa `toSafeNumber` e renderiza mesmo com payload imperfeito.

Riscos:

- cards e listas podem "bater" visualmente na maior parte do tempo, mas não seguem uma definição única de produção.
- divergência maior em períodos próximos da virada do dia e em dados legados/importados.

Status: Suspeito.

## 11. Mocks, placeholders e números fixos encontrados

### Permitido

- `packages/frontend/tests/e2e/support/mockApi.ts`
- `packages/backend/src/test/helpers.ts`
- `packages/backend/src/infrastructure/http/server.integration.test.ts`

### Suspeito

- `packages/frontend/src/pages/configuracoes/EmpresaPage.tsx`: "Cabeçalho simulado em A4" para preview visual, sem impacto direto em KPI.
- `docs` e `scripts` com senhas default para setup local.

### Incorreto

- `scripts/create-admin-user.js`: fallback `admin123`.
- `scripts/run-imports.js`: fallback para `admin@recorda.local` / `admin123`.
- `db/migrations/019_usuarios.sql` e `041_usuario_operador_padrao.sql`: seeds documentadas com senha padrão.

### Crítico

- `packages/backend/src/infrastructure/datalakes/DataLakesService.ts` e outros serviços infra avançados possuem números simulados/randomizados. Não encontrei essas rotas expostas nas telas auditadas, mas se forem habilitadas em UI futura sem hardening, produzirão números falsos.

## 12. Validação por ambiente

### Local

- Backend:
  - `DB_HOST=localhost`
  - `DB_PORT=5433`
  - `DB_NAME=recorda`
  - `DB_USER=recorda`
  - `DB_PASSWORD=recorda`
- Frontend:
  - por padrão usa `/api`;
  - no dev, Vite faz proxy para `VITE_DEV_API_TARGET` ou `http://localhost:3000`.
- Banco:
  - `docker-compose.yml` sobe Postgres local em `5433`.
- Cache:
  - `REDIS_URL=redis://localhost:6380`.
- Risco:
  - Baixo por default.
  - Alto se `VITE_API_BASE` for configurado manualmente para produção durante desenvolvimento.

### Homologação

- Não há `.env.homolog`, pipeline específico, nem variáveis de homologação versionadas.
- Não há diferenciação explícita de banco/URL entre local e homologação no repositório.
- Status: Não foi possível validar.
- Risco: Alto, por ausência de configuração documentada/versionada.

### Produção

- O repositório espera:
  - `NODE_ENV=production`
  - `CORS_ORIGIN`
  - `DATABASE_URL` ou `DB_*`
  - `VITE_API_BASE`
- O backend exige `CORS_ORIGIN` em produção e suporta `DATABASE_URL`.
- O frontend pode apontar diretamente para backend externo via `VITE_API_BASE`.
- Riscos:
  - frontend local consumir API produtiva via `VITE_API_BASE`;
  - backend subir com `DB_PASSWORD` fallback fora do fluxo correto;
  - falta de arquivo versionado de produção dificulta auditoria comparativa.

## 13. Divergências encontradas

| ID | Local | Esperado | Encontrado | Causa provável | Risco | Prioridade |
|---|---|---|---|---|---|---|
| D001 | Dashboard vs Histórico do colaborador | mesma definição de produção | dashboard exclui legados de `RECEBIMENTO`/`CQ`; histórico não exclui | regras SQL diferentes | Crítico | P0 |
| D002 | Relatórios gerenciais vs histórico | mesma produção consolidada por período | relatórios excluem `RECEBIMENTO` e `CONTROLE_QUALIDADE` | regra de negócio implícita não documentada | Crítico | P0 |
| D003 | Importação vs histórico/relatórios | mesma data de produção | importação compara com `America/Sao_Paulo`; telas filtram com `America/Cuiaba` | timezone inconsistente | Crítico | P0 |
| D004 | Dashboard "Repositórios Ativos" | contar repositórios ativos do fluxo | conta repositórios com produção | label visual divergente do SQL | Alto | P1 |
| D005 | Último registro em Meu Histórico | último registro global do usuário | primeiro item da página atual | cálculo frontend sobre lista paginada | Médio | P2 |
| D006 | Falha de payload numérico | erro explícito | fallback para `0` em várias telas | `toSafeNumber` / `?? 0` | Alto | P1 |
| D007 | Quantidade inválida em importação | rejeição | normalização automática para `1` | parser permissivo | Crítico | P0 |
| D008 | Data inválida em importação | rejeição | fallback para data atual | parser permissivo | Crítico | P0 |
| D009 | Histórico de erros de importação | evidência completa | respostas truncadas (`slice(0,20/50)`) | simplificação de payload | Médio | P2 |
| D010 | Auditoria de importação | triggers/retention normais | importação usa `session_replication_role='replica'` | tentativa de contornar triggers | Crítico | P0 |

## 14. Riscos críticos

1. Mistura de regras de negócio entre telas sobre o que conta como "produção".
2. Inconsistência de timezone entre `America/Cuiaba`, `America/Sao_Paulo` e `CURRENT_DATE`.
3. Importação permissiva que transforma quantidade inválida em `1`.
4. Importação permissiva que transforma data inválida em data atual.
5. Uso de `session_replication_role='replica'` em importações, com potencial bypass de trigger/auditoria.
6. Frontend local com capacidade de apontar para backend externo via `VITE_API_BASE`.

## 15. Correções recomendadas

- Centralizar a definição de produção em uma função/consulta de domínio reutilizada por dashboard, relatórios e listagens.
- Padronizar timezone do sistema inteiro.
- Eliminar defaults silenciosos em dados críticos:
  - quantidade inválida não pode virar `1`;
  - data inválida não pode virar "hoje";
  - payload numérico inválido não pode virar `0` automaticamente sem log/erro visível.
- Substituir agregações por nome em relatórios por agregação por identificador estável.
- Revisar labels visuais que não correspondem ao cálculo real.
- Remover ou isolar o uso de `session_replication_role='replica'`.
- Criar configuração formal de homologação e checklist de proteção para `VITE_API_BASE`.

## 16. Ordem sugerida de correção

1. P0 — Unificar regra de produção entre dashboard, relatórios e histórico.
2. P0 — Padronizar timezone e fronteira de dia.
3. P0 — Corrigir parser/importação para rejeitar quantidade/data inválidas.
4. P0 — Revisar importação com `session_replication_role='replica'`.
5. P1 — Remover fallbacks silenciosos para `0` nas telas críticas.
6. P1 — Ajustar label "Repositórios Ativos" e outros rótulos semânticos.
7. P1 — Consolidar relatórios por IDs, não por nomes.
8. P2 — Melhorar evidência completa de erros de importação.
9. P2 — Corrigir "Último Registro" paginado.
10. P3 — Padronizar formatação visual e mensagens auxiliares.

## 17. Pontos que precisam de confirmação humana

- A exclusão de `RECEBIMENTO` e `CONTROLE_QUALIDADE` em produção/relatórios é regra oficial ou desvio histórico?
- O timezone de negócio oficial da Recorda deve ser `America/Cuiaba` ou `America/Sao_Paulo`?
- "Repositórios Ativos" deve significar estoque atual por status ou repositórios com produção registrada?
- Em importação legada, quantidade inválida deve bloquear a linha ou assumir valor mínimo?
- Data inválida na planilha deve bloquear a linha, usar data da planilha de origem ou usar data atual?
- O ambiente de homologação existe fora deste repositório? Se sim, quais URLs/bancos usa?
- Há exigência operacional para manter `session_replication_role='replica'` durante importações?

## 18. Conclusão

O Recorda possui boa rastreabilidade estrutural dos números exibidos, mas ainda não possui uma semântica única e rigorosa para todos os agregados visíveis. O maior problema não é falta de dados, e sim diferença de regra entre telas, timezone inconsistente e tolerância excessiva a dado inválido na importação.

Com base no diagnóstico atual, a próxima etapa de correção deve atacar primeiro os pontos P0: definição única de produção, timezone, validação estrita de importação e revisão do fluxo que desabilita proteções do banco. Só depois disso vale ajustar visual, nomenclatura e padronização fina de exibição.

## Arquivos mais sensíveis para correção posterior

- `packages/backend/src/infrastructure/http/routes/dashboard.ts`
- `packages/backend/src/infrastructure/http/routes/relatorios.ts`
- `packages/backend/src/infrastructure/http/routes/metas.ts`
- `packages/backend/src/infrastructure/http/routes/operacional-importacao-legado.ts`
- `packages/frontend/src/pages/Dashboard.tsx`
- `packages/frontend/src/pages/colaborador/MeuHistoricoPage.tsx`
- `packages/frontend/src/pages/operacao/ProducaoPage.tsx`
- `packages/frontend/src/pages/relatorios/RelatoriosGerenciaisPage.tsx`
- `packages/frontend/src/pages/relatorios/ExportacoesPage.tsx`
- `packages/frontend/src/services/api.ts`
- `packages/frontend/src/utils/date.ts`
