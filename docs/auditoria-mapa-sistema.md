# Auditoria: Mapa de Seções, Ações, Rotas e Banco

Data: 2026-03-05  
Escopo: `packages/frontend`, `packages/backend`, `db/migrations`

## 1) Frontend (Seções e Sub-seções)

Fonte: `packages/frontend/src/routes/index.tsx`

- Autenticação
  - `/login`
  - `/forgot-password`
  - `/reset-password`
- Dashboard
  - `/dashboard`
- Produção
  - `/producao`
  - `/producao/importar`
- Operação
  - `/operacao/:etapa`
  - etapas ativas no código: `recebimento`, `controle-qualidade`
  - sub-seções de `recebimento`:
    - `repositórios`
    - `avulsos`
  - sub-seções internas de OCR/Recebimento:
    - `processos`
    - `ocr`
  - `/operacao/conhecimento`
- Relatórios
  - `/relatorios/gerenciais`
  - `/relatorios/exportacoes`
- Configurações (admin)
  - `/configuracoes/empresa`
  - `/configuracoes/usuarios`
  - `/configuracoes/admin`
- Auditoria (admin)
  - `/auditoria/importacoes`
  - `/auditoria/ocr`
  - `/auditoria/correcoes`
  - `/auditoria/acoes`

## 2) Frontend (Ações/API por domínio)

Fonte principal: `packages/frontend/src/hooks/useQueries.ts`

- Auth/Usuários
  - `POST /auth/register`
  - `PATCH /auth/usuarios/:id/toggle-ativo`
  - `GET /auth/usuarios`
- Repositórios/Operação
  - `POST /operacional/repositorios`
  - `DELETE /operacional/repositorios/:id`
  - `PATCH /operacional/repositorios/:id/avancar`
  - `POST /operacional/repositorios/:id/producao`
  - `POST /operacional/repositorios/:id/checklists`
  - `POST /operacional/checklists/:id/itens`
  - `POST /operacional/checklists/:id/concluir`
- Recebimento
  - `GET/POST /operacional/repositorios/:id/recebimento-processos`
  - `DELETE /operacional/recebimento-processos/:processoId`
  - `POST /operacional/recebimento-processos/:processoId/apensos`
  - `DELETE /operacional/recebimento-apensos/:apensoId`
  - `POST /operacional/repositorios/:id/recebimento-processos/batch`
  - `PATCH /operacional/recebimento-processos/vincular`
  - `POST /operacional/recebimento-avulsos`
  - `POST /operacional/recebimento-avulsos/ocr-preview`
- CQ
  - `POST /operacional/lotes-cq`
  - `PATCH /operacional/lotes-cq/:id/itens/:itemId`
  - `POST /operacional/lotes-cq/:id/fechar`
  - `PUT /operacional/repositorios/:id/cq-avaliacoes/:processoId`
  - `POST /operacional/repositorios/:id/cq-aprovar-todos`
  - `POST /operacional/repositorios/:id/cq-concluir`
  - `POST /operacional/repositorios/:id/cq-retornar-recebimento`
- Relatórios
  - `POST /operacional/relatorio-recebimento`
  - `POST /operacional/repositorios/:id/relatorio-producao`
  - `GET /operacional/relatorios/:id/download`
  - `GET /relatorios/*` (gerenciais/exportação)
- Conhecimento
  - `GET/POST/PATCH /operacional/conhecimento/documentos*`
  - `GET/POST/PATCH/DELETE /operacional/conhecimento/glossario*`
  - `GET/POST/PATCH/DELETE /operacional/conhecimento/leis-normas*`
- Importação legado
  - `POST /operacional/importacoes-legado/validar`
  - `POST /operacional/importacoes-legado/recebimento`
  - `POST /operacional/importacoes-legado/producao`
  - `GET /operacional/importacoes-legado`
  - `DELETE /operacional/importacoes-legado/limpar`
  - `POST /operacional/importacoes-legado/fetch-sheets`
  - `GET/POST/DELETE /operacional/fontes-importacao*`
  - `POST /operacional/fontes-importacao/:id/validar-duplicatas`
  - `POST /operacional/fontes-importacao/:id/importar`
  - `POST /operacional/fontes-importacao/importar-todas`

## 3) Backend (Rotas por módulo)

Fonte: `packages/backend/src/infrastructure/http/routes`

- `auth.ts`
  - login, refresh, logout, me, register, usuários (listar/toggle), troca de senha, forgot/reset
- `operacional-repositorios.ts`
  - CRUD de repositórios, unidades de recebimento (órgãos), OCR repo, confirmação seadesk
- `operacional-recebimento.ts`
  - setores/classificações, processos, volumes/apensos, documentos recebimento
- `operacional-avulsos.ts`
  - OCR avulso, lista/criação avulsos, batch, vincular/desvincular
- `operacional-checklists.ts`
  - modelos checklist, checklists, produção operacional, avanço/entrega, relatórios por repositório
- `operacional-cq.ts`
  - lotes CQ, avaliações por documento, concluir/devolver, termos e download de relatório
- `operacional-importacao-legado.ts`
  - validação/importação legado, fontes de importação, importação em lote de fontes
- `conhecimento-operacional.ts`
  - documentos, versões, glossário e leis/normas
- `relatorios.ts`
  - relatórios operacional/gerenciais/exportações, exclusão de produção
- `configuracao.ts`
  - empresa, logo, projetos
- `dashboard.ts`, `auditoria.ts`, `admin.ts`, `health.ts`, `metas.ts`, `colaboradores.ts`, `etapas.ts`

## 4) Contratos de resposta (status/shape)

- Há boa cobertura de schema Fastify em parte das rotas (principalmente operacional/configuração).
- Há rotas com contrato explícito parcial e outras sem schema de `response` completo (especialmente auth e alguns fluxos legados).
- Recomendação: padronizar `response` para `200/201/400/401/403/404/409/500` nos módulos críticos.

## 5) Banco de dados (tabelas atuais relevantes)

Fonte: `db/migrations` (sem `archive`)

Domínio operacional:
- `repositorios`, `movimentacoes_armario`, `checklists`, `checklist_itens`, `checklist_modelos`
- `producao_repositorio`, `historico_etapas`, `relatorios_operacionais`, `excecoes_repositorio`
- `lotes_controle_qualidade`, `lotes_controle_qualidade_itens`, `cq_avaliacoes`

Domínio recebimento:
- `recebimento_documentos`
- `recebimento_processos`, `recebimento_volumes`, `recebimento_apensos`, `recebimento_apenso_volumes`
- `setores_recebimento`, `classificacoes_recebimento`, `unidades_recebimento`

Domínio importação:
- `importacoes_legado_operacional`
- `fontes_importacao`
- `importacao_fontes_linhas` (idempotência)

Domínio configuração/conhecimento:
- `configuracao_empresa`, `configuracao_projetos`
- `kb_documentos`, `kb_documento_versoes`, `kb_documento_etapas`
- `kb_glossario`, `kb_leis_normas`

Domínio base:
- `usuarios`, `coordenadorias`, `schema_migrations`, `metas_producao`, `mapeamentos_importacao`

## 6) Achados de risco/falhas potenciais

1. Regra de duplicidade de repositório aplicada de forma inconsistente na validação de duplicatas da importação.
- Em `operacional-importacao-legado.ts` há trecho de validação (`/fontes-importacao/:id/validar-duplicatas`) ainda consultando apenas `id_repositorio_ged`.
- Já a criação/importação principal foi ajustada para contexto (`id_repositorio_ged + orgao + projeto`).
- Risco: falso positivo de duplicidade na pré-validação.

2. Texto com encoding corrompido (mojibake) em mensagens/comentários.
- Ex.: `Importacao`, `Repositorio`, `nao`.
- Risco: UX ruim, documentação OpenAPI poluída e manutenção difícil.

3. Duplicação de lógica de parse CSV/importação.
- Parsing e normalizações aparecem em múltiplos blocos no mesmo arquivo de importação legado.
- Risco: correções parciais e divergência de comportamento entre validar/importar.

4. Cobertura de testes focada em hooks e menos em integração de rotas críticas.
- Risco maior em fluxos com regras de negócio complexas: importação, CQ e recebimento.

5. Crescimento de arquivo monolítico de importação legado.
- `operacional-importacao-legado.ts` concentra validação, fetch, parsing, import, idempotência e logging.
- Risco: maior chance de regressão e resolução de conflito difícil.

## 7) Prioridade de correção sugerida

1. Alinhar pré-validação de duplicatas da importação para a regra composta (`id + unidade + projeto`).
2. Consolidar parser/normalização de planilha em util compartilhado.
3. Corrigir encoding dos arquivos de rota para UTF-8 consistente.
4. Adicionar testes de integração para:
- criação de repositório com mesma GED em unidade/projeto diferentes;
- fluxo `validar-duplicatas` vs `importar` de fonte;
- idempotência por linha com reimportação da mesma planilha.

## 8) Status de execucao (2026-03-05)

1. Concluido: validacao de duplicidade na rota `POST /operacional/fontes-importacao/:id/validar-duplicatas` agora usa contexto de repositorio (`id_repositorio_ged + orgao + projeto='LEGADO'`).
2. Concluido: fetch/parse CSV da importacao por fonte foi consolidado em helpers compartilhados (`buildCsvUrlFromSourceUrl`, `fetchCsvFromSourceUrl`, `parseImportRowsFromCsv`) para reduzir divergencia entre rotas.
3. Parcial: mensagens principais do fluxo de importacao por fonte foram normalizadas para texto legivel; ainda existem trechos antigos com encoding corrompido no mesmo arquivo e em outros modulos.
4. Concluido: adicionados testes de integracao cobrindo:
- GED igual permitido em contexto diferente (unidade/projeto);
- bloqueio de GED duplicado no mesmo contexto;
- validacao de duplicatas por fonte respeitando contexto do repositorio.
