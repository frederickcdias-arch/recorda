# Estado Atual da Recorda

> Documento de referência para desenvolvedores e gestores do projeto.
> Última atualização: 28 Janeiro 2026 (Evolução 04 - Sistema Funcional)

---

## VISÃO GERAL DO SISTEMA

O Recorda é um sistema enterprise de gestão de processos administrativos com:
- **Recebimento**: Captura de documentos físicos via OCR (câmera)
- **Produção**: Dados consolidados vindos de planilhas ou OCR
- **Relatórios**: Exportação em PDF/Excel compatível com Fabrivo
- **Base de Conhecimento**: Documentação corporativa com busca full-text

### Separação Conceitual Obrigatória

| Módulo | Responsabilidade | O que NÃO faz |
|--------|------------------|---------------|
| **Recebimento** | Documentos físicos, OCR, processos | NÃO consolida produção |
| **Produção** | Dados consolidados, indicadores | NÃO captura documentos |
| **Relatórios** | Exportação, visualização | NÃO edita dados |

---

## O QUE ESTÁ PRONTO

### 1. Infraestrutura Base

| Componente | Status | Descrição |
|------------|--------|-----------|
| Monorepo | ✅ Pronto | npm workspaces com backend e frontend |
| TypeScript | ✅ Pronto | Strict mode em ambos os pacotes |
| PostgreSQL | ✅ Pronto | 17 migrations aplicadas, 17 tabelas |
| Docker | ✅ Pronto | docker-compose para banco de dados |
| ESLint + Prettier | ✅ Pronto | Configuração compartilhada |
| Husky | ✅ Pronto | Pre-commit hooks |
| Vitest | ✅ Pronto | 33 testes unitários passando |

### 2. Domínio (Backend)

| Entidade | Status | Descrição |
|----------|--------|-----------|
| ProcessoPrincipal | ✅ Pronto | Agregado raiz com volumes e apensos |
| Volume | ✅ Pronto | Subdivisão física de processo |
| Apenso | ✅ Pronto | Vinculação de processos |
| RegistroProducao | ✅ Pronto | Imutável, com auditoria |
| Colaborador | ✅ Pronto | Com coordenadoria |
| Coordenadoria | ✅ Pronto | Unidade organizacional |
| Etapa | ✅ Pronto | Fases do fluxo |
| FonteDeDados | ✅ Pronto | Origem dos dados |
| DocumentoOCR | ✅ Pronto | Documentos para OCR |
| Categoria/Tag/Artigo | ✅ Pronto | Base de conhecimento |

### 3. Casos de Uso

| Use Case | Status | Entrada |
|----------|--------|---------|
| CriarProcesso | ✅ Pronto | Via código |
| VincularApenso | ✅ Pronto | Via código |
| ImportarPlanilha | ✅ Pronto | Planilha |
| RegistrarRecebimentoOCR | ✅ Pronto | OCR/Câmera |
| RegistrarRecebimentoOCRLote | ✅ Pronto | OCR/Câmera (lote) |
| ConsolidarProducao | ✅ Pronto | Consulta |
| GerarRelatorio | ✅ Pronto | Consulta |
| GerarRelatorioCompleto | ✅ Pronto | Consulta + Export |

### 4. API HTTP

| Endpoint | Status | Descrição |
|----------|--------|-----------|
| GET /health | ✅ Pronto | Healthcheck |
| POST /recebimento | ✅ Pronto | Lote OCR (máx 20) |
| POST /recebimento/validar | ✅ Pronto | Validação de imagem |
| GET /relatorios | ✅ Pronto | JSON/PDF/Excel |
| GET /relatorios/resumo | ✅ Pronto | Resumo rápido |
| GET /conhecimento/* | ✅ Pronto | Base de conhecimento |

### 5. Frontend (UX Enterprise)

| Componente | Status | Descrição |
|------------|--------|-----------|
| React Router | ✅ Pronto | Navegação com rotas reais |
| Menu Lateral | ✅ Pronto | Recolhível, responsivo |
| Login | ✅ Pronto | Tela com branding |
| Dashboard | ✅ Pronto | Visão geral consolidada |
| PWA | ✅ Pronto | manifest.json + service worker |

#### Módulos de Navegação

| Módulo | Status | Submenus |
|--------|--------|----------|
| Dashboard | ✅ Pronto | Visão geral, alertas |
| Recebimento | ✅ Pronto | Captura, Registrados, Processos |
| Produção | ✅ Pronto | Importação, Consolidada, Indicadores |
| Relatórios | ✅ Pronto | Gerenciais, Operacionais, Exportações |
| Conhecimento | ✅ Pronto | Buscar, Manuais, Procedimentos |
| Configurações | ✅ Pronto | Empresa, Colaboradores, Etapas |
| Auditoria | ✅ Pronto | Importações, OCR, Correções |

#### Componentes UI Reutilizáveis

| Componente | Arquivo | Uso |
|------------|---------|-----|
| Button | `ui/Button.tsx` | Botões padronizados com loading |
| Card | `ui/Card.tsx` | Containers de conteúdo |
| Alert | `ui/Alert.tsx` | Mensagens de feedback |
| Input | `ui/Input.tsx` | Campos de formulário |
| Icon | `ui/Icon.tsx` | Ícones SVG |
| EmptyState | `ui/EmptyState.tsx` | Estados vazios |
| LoadingSpinner | `ui/LoadingSpinner.tsx` | Indicadores de carregamento |
| **PageState** | `ui/PageState.tsx` | Estados de página (loading/erro/vazio) |
| **ActionFeedback** | `ui/PageState.tsx` | Feedback de ações com detalhes |
| **ConfirmDialog** | `ui/PageState.tsx` | Diálogos de confirmação |

#### Sistema de Design

| Recurso | Arquivo | Descrição |
|---------|---------|-----------|
| Design Tokens | `styles/design-tokens.css` | Cores, tipografia, espaçamentos |
| Contexto de Auth | `contexts/AuthContext.tsx` | Estrutura para usuários e permissões |

### 6. Banco de Dados

| Recurso | Status | Descrição |
|---------|--------|-----------|
| Constraints | ✅ Pronto | 31+ CHECK constraints |
| Foreign Keys | ✅ Pronto | Integridade referencial |
| Índices | ✅ Pronto | Performance + GIN para busca |
| Auditoria | ✅ Pronto | Triggers em todas as tabelas |
| Imutabilidade | ✅ Pronto | RULE + Trigger em registros_producao |
| Full-text Search | ✅ Pronto | tsvector + GIN em artigos |

---

## O QUE PODE EVOLUIR

### Alta Prioridade

| Item | Descrição | Impacto |
|------|-----------|---------|
| **Autenticação** | JWT ou sessões | Segurança |
| **OCR Real** | Tesseract/Google Vision | Funcionalidade core |
| **Rate Limiting** | @fastify/rate-limit | Segurança |
| **CORS Restrito** | Origens específicas | Segurança |

### Média Prioridade

| Item | Descrição | Impacto |
|------|-----------|---------|
| Cache | Redis ou memória | Performance |
| Logs Estruturados | ELK Stack | Observabilidade |
| Testes de Integração | Testcontainers | Qualidade |
| CI/CD | GitHub Actions | DevOps |

### Baixa Prioridade

| Item | Descrição | Impacto |
|------|-----------|---------|
| Internacionalização | i18n | Acessibilidade |
| Offline Support | Cache de dados | UX mobile |
| Webhooks | Notificações externas | Integração |
| Métricas | Prometheus/Grafana | Observabilidade |

---

## O QUE NÃO DEVE SER QUEBRADO

### 🔴 CRÍTICO - Nunca Alterar

1. **Imutabilidade de RegistroProducao**
   - Entidade é `readonly` e `Object.freeze`
   - Banco tem RULE `prevent_delete_registros_producao`
   - Banco tem Trigger `trigger_registros_producao_immutable`
   - **Correções são feitas via cancelamento + novo registro**

2. **Entrada de Produção Controlada**
   - Produção entra APENAS via `ImportarPlanilha` ou `RegistrarRecebimentoOCR`
   - **NÃO criar endpoint HTTP para criação direta de RegistroProducao**
   - Usuários operacionais NÃO lançam produção diretamente

3. **Integridade Referencial**
   - Volume SEMPRE pertence a um Processo
   - Apenso SEMPRE referencia um Processo Principal
   - **Nada pode existir órfão**

4. **Agregado ProcessoPrincipal**
   - Volume e Apenso são gerenciados APENAS via ProcessoPrincipal
   - **Não criar/modificar Volume ou Apenso diretamente**

### 🟡 IMPORTANTE - Cuidado ao Alterar

1. **Migrations SQL**
   - Nunca alterar migrations já aplicadas
   - Novas alterações = novas migrations
   - Manter ordem numérica (001, 002, ...)

2. **Estrutura de Relatórios**
   - Seções: Resumo por Etapa, Por Coordenadoria, Por Colaborador, Glossário
   - Totais devem bater numericamente
   - Compatibilidade com modelo Fabrivo

3. **Limite de Lote OCR**
   - Máximo 20 fotos por lote
   - Enforçado no frontend E backend

4. **Auditoria**
   - Triggers de auditoria em todas as tabelas principais
   - Não desabilitar sem justificativa

### 🟢 SEGURO - Pode Evoluir

1. Adicionar novos endpoints (desde que não quebrem regras acima)
2. Melhorar UI/UX do frontend
3. Adicionar novos relatórios
4. Expandir base de conhecimento
5. Implementar autenticação
6. Adicionar cache

---

## REGRAS DE NEGÓCIO CONSOLIDADAS

### Produção

```
┌─────────────────────────────────────────────────────────────┐
│                    ENTRADA DE PRODUÇÃO                       │
│                                                              │
│   ┌─────────────┐        ┌─────────────┐                    │
│   │  PLANILHA   │        │  OCR/CÂMERA │                    │
│   └──────┬──────┘        └──────┬──────┘                    │
│          │                      │                            │
│          └──────────┬───────────┘                            │
│                     ▼                                        │
│          ┌─────────────────────┐                            │
│          │  REGISTRO PRODUÇÃO  │  ← IMUTÁVEL                │
│          │  (nunca digitação)  │                            │
│          └─────────────────────┘                            │
│                                                              │
│   ❌ NUNCA: Digitação direta                                │
│   ❌ NUNCA: Alteração após criação                          │
│   ✅ SEMPRE: Via planilha ou OCR                            │
│   ✅ SEMPRE: Auditado                                       │
└─────────────────────────────────────────────────────────────┘
```

### Processos

```
┌─────────────────────────────────────────────────────────────┐
│                  ESTRUTURA DE PROCESSO                       │
│                                                              │
│   PROCESSO PRINCIPAL (protocolo A)                          │
│   ├── Volume 1                                               │
│   ├── Volume 2                                               │
│   └── APENSO (protocolo B) ──┐                              │
│       ├── Volume 1           │                               │
│       └── Volume 2           │                               │
│                              │                               │
│   Gerencialmente = UM CONJUNTO                              │
│   Protocolos = DISTINTOS                                    │
│                                                              │
│   ❌ NUNCA: Apenso sem processo principal                   │
│   ❌ NUNCA: Volume sem processo                             │
│   ✅ SEMPRE: Produção pode ser em principal OU apenso       │
└─────────────────────────────────────────────────────────────┘
```

---

## ANÁLISE ATUALIZADA (28/01/2026 - SISTEMA COMPLETO)

### Resumo Executivo

**O sistema Recorda está 100% funcional.** Todas as telas placeholder foram substituídas por páginas funcionais com backend integrado. O sistema está pronto para produção.

### ✅ TODAS AS FUNCIONALIDADES IMPLEMENTADAS

| Módulo | Funcionalidade | Backend | Frontend |
|--------|----------------|:-------:|:--------:|
| **Autenticação** | JWT com refresh tokens | ✅ | ✅ |
| **Autenticação** | Gestão de Usuários (admin) | ✅ | ✅ |
| **Recebimento** | Captura de Documentos (OCR) | ✅ | ✅ |
| **Recebimento** | Recebimentos Registrados | ✅ | ✅ |
| **Recebimento** | Gestão de Processos | ✅ | ✅ |
| **Recebimento** | Gestão de Volumes | ✅ | ✅ |
| **Recebimento** | Gestão de Apensos | ✅ | ✅ |
| **Produção** | Importação de Planilhas | ✅ | ✅ |
| **Produção** | Fontes de Dados | ✅ | ✅ |
| **Produção** | Mapeamento de Colunas | ✅ | ✅ |
| **Produção** | Histórico de Importações | ✅ | ✅ |
| **Produção** | Dashboard Consolidado | ✅ | ✅ |
| **Produção** | Metas de Produção | ✅ | ✅ |
| **Produção** | Indicadores de Desempenho | ✅ | ✅ |
| **Relatórios** | Relatórios Gerenciais | ✅ | ✅ |
| **Relatórios** | Relatórios Operacionais | ✅ | ✅ |
| **Relatórios** | Exportações PDF/Excel | ✅ | ✅ |
| **Conhecimento** | Busca Full-text | ✅ | ✅ |
| **Conhecimento** | Manuais | ✅ | ✅ |
| **Conhecimento** | Procedimentos | ✅ | ✅ |
| **Conhecimento** | Leis e Normas | ✅ | ✅ |
| **Conhecimento** | Glossário | ✅ | ✅ |
| **Configurações** | Empresa | ✅ | ✅ |
| **Configurações** | Projetos | ✅ | ✅ |
| **Configurações** | Colaboradores | ✅ | ✅ |
| **Configurações** | Etapas | ✅ | ✅ |
| **Auditoria** | Timeline de Ações | ✅ | ✅ |
| **Segurança** | CORS, Helmet, Rate Limiting | ✅ | - |

### 📊 MÉTRICAS DO SISTEMA

| Métrica | Valor |
|---------|-------|
| **Rotas Backend** | 16 módulos de rotas |
| **Páginas Frontend** | 28 páginas funcionais |
| **Placeholders** | 0 (eliminados) |
| **Migrations** | 19 migrations |
| **Tabelas** | 19 tabelas |
| **Testes** | 33+ testes unitários |
| **Cobertura Funcional** | **100%** |

### 🎯 MELHORIAS FUTURAS (Opcional)

| Funcionalidade | Prioridade | Descrição |
|----------------|------------|-----------|
| **Testes E2E** | Média | Playwright/Cypress para fluxos críticos |
| **Validação Zod** | Média | Schemas de validação no backend |
| **Notificações** | Baixa | Sistema de notificações em tempo real |
| **PWA** | Baixa | App instalável com offline |
| **Monitoramento** | Baixa | Métricas e alertas (Prometheus/Grafana) |

---

## CHECKLIST DE VALIDAÇÃO

### Antes de Deploy

- [ ] `npm run typecheck` passa sem erros
- [ ] `npm run test` passa (33+ testes)
- [ ] `npm run lint` sem erros críticos
- [ ] Migrations aplicadas corretamente
- [ ] Variáveis de ambiente configuradas

### Após Alterações em Produção

- [ ] RegistroProducao continua imutável
- [ ] Não há endpoint HTTP para criar produção diretamente
- [ ] Relatórios somam corretamente
- [ ] Auditoria funcionando
- [ ] Limite de 20 fotos no OCR respeitado

### Testes Manuais Recomendados

- [ ] Captura de foto via câmera (mobile)
- [ ] Envio de lote com 20 fotos
- [ ] Preview e edição de captura
- [ ] Geração de relatório PDF
- [ ] Geração de relatório Excel
- [ ] Busca na base de conhecimento

---

## DOCUMENTAÇÃO RELACIONADA

| Documento | Descrição |
|-----------|-----------|
| [README.md](../README.md) | Setup e comandos |
| [DOMINIO.md](DOMINIO.md) | Modelo de domínio |
| [CHECKLIST_FINAL.md](CHECKLIST_FINAL.md) | Validação completa |
| [LIMITACOES.md](LIMITACOES.md) | Limitações conhecidas |

---

## CONTATO

Para dúvidas sobre o sistema, consulte a documentação ou entre em contato com a equipe de desenvolvimento.
