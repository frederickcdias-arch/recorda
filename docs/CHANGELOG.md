# 📋 Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [Unreleased] — 2026-05-12

### 🧹 Manutenção / Limpeza

- Removidos scripts duplicados e pontuais: `scripts/maintenance/create-admin.js`, `scripts/maintenance/apply-gestao-pessoas.js`, `db/scripts/vincular_producoes_colaboradores.sql`
- Removidos documentos de diagnóstico antigos de `docs/archive/` (diagnósticos superados fev/2026, backlog mar/2026)
- Removido `docs/DIAGNOSTICO_INTERFACE_UX.md` (jul/2025, superado pelos diagnósticos de 2026)
- Removido `vercel.json` — deploy ativo é exclusivamente Railway
- Testes k6 consolidados em `tests/`: `scripts/performance/` → `tests/load/`, `scripts/security/` → `tests/security/`
- Logs e screenshots de diagnóstico limpos de `logs/`

### 🐛 Corrigido

- **Backend (`health.ts`):** `server.authenticate` substituído por `authenticate` importado diretamente de `middleware/auth.js` — crash na inicialização em produção resolvido (commit `87fc80d`)
- **Frontend:** `useCallback` em handlers de `useEffect` em `RelatoriosGerenciaisPage`, `ExportacoesPage`; `useMemo` em arrays derivados de query em `ConhecimentoOperacionalPage`; `catch (error: unknown)` com narrowing em `AuthContext`; validação de e-mail em `ForgotPassword` (commit `3fe0c6d`)
- **DB (`074_gestao_pessoas.sql`):** `INSERT INTO schema_migrations` ausente adicionado; função duplicada `update_updated_at_column()` removida (commit `ef49485`)
- **DB (`074a_cq_avaliacoes_aceitar_apensos.sql`):** renumerada a antiga `074_cq_avaliacoes_aceitar_apensos.sql` para eliminar prefixo duplicado, com compatibilidade preservada no runner

### ✨ Adicionado

- **DB (`092_gestao_pessoas_auditoria_e_fixes.sql`):** 7 triggers de auditoria para tabelas de gestão de pessoas; trigger `sync_ferias_dias` para atualização automática de `ferias.dias_restantes`; trigger `BEFORE UPDATE` em `tipos_ausencia` (commit `ef49485`)

---

## [1.0.0] - 2026-04-15

### 🎉 Lançamento Inicial - Sistema Completo

#### ✨ Adicionado

**Módulo de Colaborador**

- Sistema completo de lançamento de produção para colaboradores
- Interface simplificada para lançamento diário
- Campo Coordenadoria com select + criação rápida
- Campo Tipo com opções fixas (Imagens/Caixas)
- Validação de duplicatas (mesma etapa)
- Validação de sequência obrigatória de etapas
- Diferenciação de origem (SISTEMA vs LEGADO)
- Criação automática de repositórios e checklists

**Novas Etapas**

- RECONFERENCIA (entre Conferência e Montagem)
- ATENDIMENTO (após Montagem)

**Segurança**

- Validação rigorosa com Zod (10/10 em auditoria)
- Formato de data: YYYY-MM-DD obrigatório
- Quantidade mínima: 1 (inteiro)
- Tamanhos máximos de strings (anti-buffer overflow)
- Proteção contra SQL Injection (100% prepared statements)
- Autenticação JWT em todos os endpoints
- Autorização por perfil (RBAC)

**Painel Admin**

- Ordenação clicável em todas as colunas
- Indicador visual de ordenação (setas)
- Badge de diferenciação (Sistema vs Legado)
- Inclusão de produções de colaboradores em relatórios

**Testes**

- 16 testes unitários de schema Zod
- 35 testes unitários de endpoint
- 10 testes E2E com Playwright
- Helpers de teste reutilizáveis
- Cobertura completa de casos críticos

**Documentação**

- README.md atualizado
- Arquitetura completa documentada
- Sistema de Colaborador Completo (30 páginas)
- Auditoria de Segurança (nota 10/10)
- Validação de Fluxo de Etapas
- Plano de Testes
- CHANGELOG inicial

#### 🔧 Modificado

**Backend**

- Endpoint `/producao/lancar-direto` com validações completas
- Queries de relatórios incluem `origem IN ('LEGADO', 'SISTEMA')`
- Mapeamento de status por etapa atualizado
- Marcadores JSONB com campo `origem`

**Frontend**

- `LancarProducaoPage.tsx` refatorada
- `ProducaoPage.tsx` com ordenação de colunas
- Toast helpers para feedback

**Banco de Dados**

- Migration 066: Perfil colaborador
- Índices otimizados para performance
- Triggers de auditoria completos

#### 🐛 Corrigido

- Validação de duplicatas agora permite etapas diferentes
- Validação de sequência considera coordenadoria
- Repositórios criados com status correto
- Checklists criados como CONCLUIDO automaticamente
- Queries de relatório incluem ambas origens

#### 🔒 Segurança

- Zero vulnerabilidades de SQL Injection
- Validação de inputs em múltiplas camadas
- Prepared statements em 100% das queries
- Rate limiting ativo
- Security headers (Helmet)
- Auditoria automática de todas operações

---

## [Unreleased]

### 🚧 Em Desenvolvimento

- [ ] Cache Redis para queries frequentes
- [ ] WebSocket para notificações em tempo real
- [ ] Exportação de relatórios em PDF
- [ ] Dashboard de métricas em tempo real
- [ ] Integração com OCR para digitalização

### 💡 Planejado

- [ ] Mobile app (React Native)
- [ ] Modo offline completo (PWA)
- [ ] Importação via API REST
- [ ] Webhooks para integrações externas
- [ ] Auditoria com visualização de diferenças

---

## Versões Anteriores

### [0.9.0] - 2026-03-01

#### ✨ Adicionado

- Sistema de fluxo operacional completo
- Controle de qualidade com checklists
- Metas e acompanhamento de produtividade
- Dashboard administrativo
- Importação de dados legados

### [0.5.0] - 2026-02-01

#### ✨ Adicionado

- Sistema de autenticação com JWT
- Gestão de usuários
- Perfis (Administrador, Operador)
- Auditoria de ações

### [0.1.0] - 2026-01-01

#### 🎉 Primeira Versão

- Estrutura inicial do projeto
- Setup de monorepo
- Configuração de TypeScript
- Configuração de ESLint/Prettier

---

## 📝 Convenções de Commit

Este projeto segue o padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/):

- `feat`: Nova funcionalidade
- `fix`: Correção de bug
- `docs`: Documentação
- `style`: Formatação
- `refactor`: Refatoração
- `test`: Testes
- `chore`: Tarefas de build/config

**Exemplos:**

```
feat(colaborador): adicionar validação de sequência de etapas
fix(relatorios): incluir origem SISTEMA nas queries
docs: atualizar README com novo módulo de colaborador
test: adicionar testes E2E para lançamento de produção
```

---

## 🔗 Links Úteis

- [Guia de Contribuição](CONTRIBUTING.md)
- [Código de Conduta](CODE_OF_CONDUCT.md)
- [Documentação Completa](README.md)
- [Issues](https://github.com/seu-usuario/recorda/issues)
- [Pull Requests](https://github.com/seu-usuario/recorda/pulls)

---

**Mantido por:** Equipe Recorda  
**Última Atualização:** 15 de Abril de 2026
