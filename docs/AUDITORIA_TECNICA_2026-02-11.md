# AUDITORIA TÉCNICA COMPLETA — RECORDA

**Data:** 2026-02-11 | **Auditor:** Arquiteto de Software / QA Lead / Tech Lead

---

## 1. VISÃO GERAL DO SISTEMA

| Item            | Detalhe                                                              |
| --------------- | -------------------------------------------------------------------- |
| **Nome**        | Recorda — Sistema de Gestão de Processos Administrativos             |
| **Stack**       | Node.js 20 / Fastify / React 18 / Vite / TailwindCSS / PostgreSQL 15 |
| **Arquitetura** | Monorepo (npm workspaces) — `backend`, `frontend`, `shared`          |
| **Banco**       | PostgreSQL via Docker, 38 migrações SQL                              |
| **Auth**        | JWT (access + refresh tokens) com bcrypt                             |
| **PWA**         | Configurado via vite-plugin-pwa                                      |

---

## 2. INVENTÁRIO COMPLETO

### 2.1 Front-End — Telas e Rotas

| Rota                           | Componente                    | Status                                            |
| ------------------------------ | ----------------------------- | ------------------------------------------------- |
| `/login`                       | `LoginPage`                   | ✅ Funcional                                      |
| `/forgot-password`             | `ForgotPasswordPage`          | ⚠️ Parcial (sem envio de e-mail real)             |
| `/dashboard`                   | `DashboardPage`               | ✅ Funcional                                      |
| `/operacao/:etapa`             | `EtapaOperacionalPage`        | ✅ Funcional (complexo, ~855 linhas)              |
| `/operacao/conhecimento`       | `ConhecimentoOperacionalPage` | ✅ Funcional                                      |
| `/operacao/importacao-legado`  | `ImportacaoLegadoPage`        | ✅ Funcional                                      |
| `/relatorios/gerenciais`       | `RelatoriosGerenciaisPage`    | ✅ Funcional                                      |
| `/relatorios/operacionais`     | `RelatoriosOperacionaisPage`  | ⚠️ Rota backend inexistente                       |
| `/relatorios/exportacoes`      | `ExportacoesPage`             | ⚠️ Fake — todos os botões chamam o mesmo endpoint |
| `/configuracoes/empresa`       | `EmpresaPage`                 | ✅ Funcional                                      |
| `/configuracoes/projetos`      | `ProjetosPage`                | ⚠️ Sem edição/exclusão/toggle                     |
| `/configuracoes/colaboradores` | `ColaboradoresPage`           | ✅ Funcional                                      |
| `/configuracoes/etapas`        | `EtapasPage`                  | ✅ Funcional                                      |
| `/configuracoes/usuarios`      | `UsuariosPage`                | ✅ Funcional                                      |
| `/auditoria/importacoes`       | `AuditoriaPage`               | ⚠️ Mesma página para 4 sub-rotas                  |
| `/auditoria/ocr`               | `AuditoriaPage` (reuso)       | ⚠️ Sem filtro por tipo                            |
| `/auditoria/correcoes`         | `AuditoriaPage` (reuso)       | ⚠️ Sem filtro por tipo                            |
| `/auditoria/acoes`             | `AuditoriaPage` (reuso)       | ⚠️ Sem filtro por tipo                            |

**Diretórios vazios (telas planejadas mas não implementadas):**

- `pages/conhecimento/` — vazio
- `pages/producao/` — vazio
- `pages/recebimento/` — vazio
- `backend/src/infrastructure/http/routes/producao/` — vazio

### 2.2 Back-End — Endpoints

| Método                   | Rota                                         | Finalidade            | Status                        |
| ------------------------ | -------------------------------------------- | --------------------- | ----------------------------- |
| GET                      | `/health`                                    | Healthcheck           | ✅ Funcional                  |
| POST                     | `/auth/login`                                | Login                 | ✅ Funcional                  |
| POST                     | `/auth/refresh`                              | Refresh token         | ✅ Funcional                  |
| POST                     | `/auth/logout`                               | Logout                | ✅ Funcional                  |
| GET                      | `/auth/me`                                   | Dados do usuário      | ✅ Funcional                  |
| POST                     | `/auth/register`                             | Criar usuário         | ✅ Funcional                  |
| GET                      | `/auth/usuarios`                             | Listar usuários       | ✅ Funcional                  |
| PATCH                    | `/auth/usuarios/:id/toggle-ativo`            | Ativar/desativar      | ✅ Funcional                  |
| PUT                      | `/auth/change-password`                      | Alterar senha         | ✅ Funcional                  |
| POST                     | `/auth/forgot-password`                      | Solicitar reset       | ⚠️ Sem envio de e-mail        |
| POST                     | `/auth/reset-password`                       | Redefinir senha       | ⚠️ Sem UI de reset            |
| GET                      | `/dashboard`                                 | Dados do dashboard    | ✅ Funcional                  |
| GET                      | `/relatorios`                                | Relatório completo    | ✅ Funcional (JSON/PDF/Excel) |
| GET                      | `/configuracao/empresa`                      | Config empresa        | ✅ Funcional                  |
| PUT                      | `/configuracao/empresa`                      | Salvar config         | ✅ Funcional                  |
| GET                      | `/configuracao/projetos`                     | Listar projetos       | ✅ Funcional                  |
| POST                     | `/configuracao/projetos`                     | Criar projeto         | ✅ Funcional                  |
| GET                      | `/coordenadorias`                            | Listar coordenadorias | ✅ Funcional                  |
| GET                      | `/colaboradores`                             | Listar colaboradores  | ✅ Funcional                  |
| POST                     | `/colaboradores`                             | Criar colaborador     | ✅ Funcional                  |
| PUT                      | `/colaboradores/:id`                         | Atualizar colaborador | ✅ Funcional                  |
| PATCH                    | `/colaboradores/:id/toggle-ativo`            | Toggle ativo          | ✅ Funcional                  |
| GET                      | `/colaboradores/:id`                         | Buscar por ID         | ✅ Funcional                  |
| GET                      | `/etapas`                                    | Listar etapas         | ✅ Funcional                  |
| POST                     | `/etapas`                                    | Criar etapa           | ✅ Funcional                  |
| PUT                      | `/etapas/:id`                                | Atualizar etapa       | ✅ Funcional                  |
| PATCH                    | `/etapas/:id/toggle-ativa`                   | Toggle ativa          | ✅ Funcional                  |
| GET                      | `/etapas/:id`                                | Buscar por ID         | ✅ Funcional                  |
| GET                      | `/auditoria`                                 | Logs de auditoria     | ✅ Funcional                  |
| GET                      | `/auditoria/estatisticas`                    | Estatísticas          | ✅ Funcional                  |
| GET                      | `/producao/metas`                            | Listar metas          | ✅ Funcional                  |
| POST                     | `/producao/metas`                            | Criar meta            | ✅ Funcional                  |
| GET                      | `/producao/desempenho`                       | Indicadores           | ⚠️ Meta hardcoded (1000)      |
| GET                      | `/producao/mapeamentos`                      | Templates             | ✅ Funcional                  |
| POST                     | `/producao/mapeamentos`                      | Criar template        | ✅ Funcional                  |
| GET                      | `/operacional/armarios`                      | Listar armários       | ✅ Funcional                  |
| POST                     | `/operacional/repositorios`                  | Criar repositório     | ✅ Funcional                  |
| GET                      | `/operacional/repositorios`                  | Listar repositórios   | ✅ Funcional                  |
| + ~20 rotas operacionais | Checklists, CQ, OCR, etc.                    | ✅ Funcional          |
| GET                      | `/operacional/conhecimento/*`                | Base de conhecimento  | ✅ Funcional                  |
| \*                       | `/recebimento`, `/producao`, `/conhecimento` | Legado                | ❌ Retorna 410 GONE           |

**Rota referenciada no front que NÃO EXISTE no back:**

- `GET /relatorios/operacional` — chamada em `RelatoriosOperacionaisPage.tsx` linha 30 via `fetchWithAuth('/api/relatorios/operacional?...')`. Essa rota não existe. Vai retornar 404.

### 2.3 Banco de Dados — Tabelas (38 migrações)

| Tabela                           | Campos-chave                                              | Auditoria  | Constraints             |
| -------------------------------- | --------------------------------------------------------- | ---------- | ----------------------- |
| `schema_migrations`              | version, applied_at                                       | —          | PK                      |
| `coordenadorias`                 | id, nome, sigla, ativa                                    | ✅ Trigger | ✅                      |
| `colaboradores`                  | id, nome, matricula, email, ativo, coordenadoria_id       | ✅ Trigger | ✅ FK                   |
| `etapas`                         | id, nome, descricao, unidade, ordem, ativa                | ✅ Trigger | ✅                      |
| `fontes_dados`                   | id, nome, tipo                                            | ✅ Trigger | ✅                      |
| `processos_principais`           | id, numero, assunto, status, datas, coordenadorias        | ✅ Trigger | ✅ FK, CHECK            |
| `volumes`                        | id, numero, processo_id, tipo                             | ✅ Trigger | ✅ FK                   |
| `apensos`                        | id, processo_principal_id, processo_apenso_id             | ✅ Trigger | ✅ FK                   |
| `registros_producao`             | id, processo_id, etapa_id, colaborador_id, quantidade     | ✅ Trigger | ✅ FK, CHECK, IMMUTABLE |
| `documentos_ocr`                 | id, imagem, texto, confianca                              | ✅ Trigger | ✅                      |
| `importacoes`                    | id, tipo, arquivo, status                                 | ✅ Trigger | ✅                      |
| `auditoria`                      | id, tabela, registro_id, operacao, dados                  | —          | ✅ CHECK                |
| `categorias`                     | id, nome, slug                                            | —          | ✅                      |
| `tags`                           | id, nome, slug                                            | —          | ✅                      |
| `artigos`                        | id, titulo, conteudo, slug, categoria_id                  | —          | ✅ FK                   |
| `artigos_tags`                   | artigo_id, tag_id                                         | —          | ✅ FK                   |
| `artigos_relacionados`           | artigo_id, relacionado_id                                 | —          | ✅ FK                   |
| `configuracao_empresa`           | id, nome, cnpj, endereco, etc.                            | —          | ✅                      |
| `usuarios`                       | id, nome, email, senha_hash, perfil, ativo                | ✅ Trigger | ✅ CHECK, UNIQUE        |
| `refresh_tokens`                 | id, usuario_id, token_hash, expira_em, revogado           | —          | ✅ FK, CHECK            |
| `fontes_dados_api`               | id, fonte_dados_id, url, headers                          | —          | ✅ FK                   |
| `fontes_dados_configuracoes`     | id, fonte_dados_id, chave, valor                          | —          | ✅ FK                   |
| `recebimentos`                   | id, processo_id, data, status                             | —          | ✅ FK                   |
| `glossario`                      | id, termo, definicao, categoria                           | —          | ✅                      |
| `configuracao_projetos`          | id, nome, descricao, ativo                                | —          | ✅                      |
| `registros_importados`           | (migration 028)                                           | —          | ✅                      |
| `metas_producao`                 | etapa_id, meta_diaria, meta_mensal                        | —          | ✅ FK                   |
| `mapeamentos_importacao`         | nome, mapeamento (JSONB)                                  | —          | ✅                      |
| `armarios`                       | id, codigo, descricao, ativo                              | —          | ✅ UNIQUE, CHECK        |
| `repositorios`                   | id_repositorio_recorda, id_repositorio_ged, status, etapa | —          | ✅ FK, CHECK, ENUM      |
| `movimentacoes_armario`          | repositorio_id, armario_id, tipo, usuario_id              | —          | ✅ FK                   |
| `checklist_modelos`              | etapa, codigo, descricao, obrigatorio, ordem              | —          | ✅ UNIQUE               |
| `checklists`                     | repositorio_id, etapa, status, responsavel_id             | —          | ✅ FK, CHECK            |
| `checklist_itens`                | checklist_id, modelo_id, resultado                        | —          | ✅ FK                   |
| `excecoes_repositorio`           | repositorio_id, tipo, status_tratativa                    | —          | ✅ FK, ENUM             |
| `lotes_cq`                       | codigo, status                                            | —          | ✅                      |
| `lote_cq_itens`                  | lote_id, repositorio_id, resultado                        | —          | ✅ FK, ENUM             |
| `producao_repositorio`           | repositorio_id, etapa, usuario_id, quantidade             | —          | ✅ FK                   |
| `relatorios_operacionais`        | tipo, repositorio_id, arquivo_path, hash                  | —          | ✅ FK, ENUM             |
| `kb_documentos`                  | id, codigo, titulo, categoria, nivel_acesso               | —          | ✅ ENUM                 |
| `kb_documento_versoes`           | documento_id, versao, conteudo_markdown                   | —          | ✅ FK                   |
| `kb_documento_etapas`            | documento_id, etapa                                       | —          | ✅ FK                   |
| `recebimento_documentos`         | repositorio_id, processo, interessado, origem             | —          | ✅ FK, ENUM             |
| `importacoes_legado_operacional` | tipo, total, sucesso, erro, usuario_destino_id            | —          | ✅ FK                   |

---

## 3. RELATÓRIO DE DIAGNÓSTICO

### ✅ Tabela de Problemas Encontrados

| #   | Módulo     | Local                                                                          | Problema                                                                                                                                                                                                                     | Gravidade   | Impacto                                                                    |
| --- | ---------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| 1   | Front      | `RelatoriosOperacionaisPage.tsx:30`                                            | Chama `GET /api/relatorios/operacional` que **não existe** no backend. Página sempre mostra erro ou tabela vazia.                                                                                                            | **Crítica** | Tela completamente quebrada                                                |
| 2   | Front      | `ExportacoesPage.tsx:17-28`                                                    | 5 tipos de relatório listados (produção, colaboradores, etapas, processos, importações) mas **todos chamam o mesmo endpoint** `/api/relatorios`. O parâmetro `_tipo` é ignorado. Funcionalidade fake.                        | **Alta**    | Usuário pensa que exporta relatórios diferentes, mas recebe sempre o mesmo |
| 3   | Front      | Rotas de auditoria (linhas 128-162 do routes/index.tsx)                        | 4 sub-rotas (`/importacoes`, `/ocr`, `/correcoes`, `/acoes`) renderizam **o mesmo componente `AuditoriaPage`** sem distinção. Não há filtro automático por tipo.                                                             | **Alta**    | Funcionalidade ilusória — 4 itens de menu fazem a mesma coisa              |
| 4   | Front      | `EmpresaPage.tsx:40,79`                                                        | Usa `fetch()` direto em vez do `api` service. **Não envia token de autenticação** (depende do monkey-patch global do fetch). Inconsistente com o padrão do projeto.                                                          | **Média**   | Pode falhar se o patch global não estiver ativo                            |
| 5   | Front      | `ColaboradoresPage.tsx:59`, `EtapasPage.tsx:40`, `AuditoriaPage.tsx:51`        | Mesma inconsistência: usam `fetch()` direto em vez do `api` service centralizado.                                                                                                                                            | **Média**   | Inconsistência de padrão, risco de falha de auth                           |
| 6   | Front      | `ProjetosPage.tsx`                                                             | Falta edição, exclusão e toggle ativo/inativo de projetos. Apenas criação e listagem. CRUD incompleto.                                                                                                                       | **Média**   | Usuário não consegue gerenciar projetos existentes                         |
| 7   | Front      | `ForgotPasswordPage.tsx:39`                                                    | Referencia `/images/logo-recorda.png` que provavelmente não existe (Login usa `/images/logo-icon.png`). Imagem quebrada.                                                                                                     | **Baixa**   | Logo não aparece na tela de recuperação                                    |
| 8   | Front      | `ForgotPasswordPage.tsx`                                                       | Fluxo de reset de senha incompleto: não há tela para inserir o token de reset e a nova senha. O backend tem `POST /auth/reset-password` mas não há UI correspondente.                                                        | **Alta**    | Usuário não consegue redefinir senha                                       |
| 9   | Front      | `pages/conhecimento/`, `pages/producao/`, `pages/recebimento/`                 | Diretórios vazios — telas planejadas nunca implementadas.                                                                                                                                                                    | **Baixa**   | Código morto/lixo no projeto                                               |
| 10  | Front      | `PlaceholderPage.tsx`                                                          | Componente placeholder existe mas **não é usado em nenhuma rota**. Código morto.                                                                                                                                             | **Baixa**   | Lixo no projeto                                                            |
| 11  | Front      | `relatorioApi.ts`                                                              | Serviço separado de relatórios que **não usa autenticação** (usa `fetch()` direto sem token). Duplica lógica do `api.ts`.                                                                                                    | **Média**   | Chamadas sem auth podem falhar com 401                                     |
| 12  | Front      | `routes/index.tsx:53-55`                                                       | Rota `/operacao/:etapa` é genérica e captura `/operacao/conhecimento` e `/operacao/importacao-legado` se acessadas antes das rotas específicas. **Ordem de rotas pode causar conflito.**                                     | **Média**   | Possível renderização errada de página                                     |
| 13  | Back       | `metas.ts:69`                                                                  | Meta de produção **hardcoded como 1000** em vez de buscar da tabela `metas_producao`.                                                                                                                                        | **Alta**    | Indicadores de desempenho sempre incorretos                                |
| 14  | Back       | `auth.ts:342,349,376,383,388,401`                                              | Strings com encoding quebrado: `"usuÃ¡rios"`, `"NÃ£o Ã©"`, etc. Caracteres UTF-8 corrompidos nas mensagens de erro.                                                                                                          | **Média**   | Mensagens de erro ilegíveis para o usuário                                 |
| 15  | Back       | `auth.ts:34-38`                                                                | Função `perfilToPapel` mapeia `'supervisor'` para `'OPERADOR'`, mas o enum `perfil_usuario` no banco inclui `'supervisor'` que **não é usado em nenhum lugar do sistema**. Perfil fantasma.                                  | **Baixa**   | Inconsistência de domínio                                                  |
| 16  | Back       | `auth.ts:501-519`                                                              | `forgot-password` salva token de reset na tabela `refresh_tokens` com prefixo `reset:` **sem hash**. Tokens de reset ficam em texto plano no banco.                                                                          | **Alta**    | Vulnerabilidade de segurança — tokens de reset expostos                    |
| 17  | Back       | `operacional.ts` (1566 linhas)                                                 | Arquivo monolítico com **1566 linhas**. Contém ~20 rotas, lógica de OCR, PDF, checklists, CQ, etc. Viola SRP massivamente.                                                                                                   | **Média**   | Manutenibilidade muito baixa                                               |
| 18  | Back       | `routes/producao/`                                                             | Diretório vazio. Rota legada desativada (410 GONE) mas sem substituto claro para todas as funcionalidades.                                                                                                                   | **Baixa**   | Código morto                                                               |
| 19  | Back       | `server.ts:49-52`                                                              | CORS com `origin: true` aceita **qualquer origem**. Inseguro para produção.                                                                                                                                                  | **Alta**    | Vulnerabilidade CSRF em produção                                           |
| 20  | Back       | `server.ts:56`                                                                 | CSP desabilitado (`contentSecurityPolicy: false`).                                                                                                                                                                           | **Média**   | Headers de segurança ausentes                                              |
| 21  | Back       | Rate limiting                                                                  | Desabilitado em desenvolvimento (esperado), mas **sem configuração granular** para produção (100 req/min global, sem distinção por rota).                                                                                    | **Média**   | Login brute-force possível mesmo em produção                               |
| 22  | Back       | Repositórios (DDD)                                                             | Apenas 2 repositórios implementados (`colaborador-repository.ts`, `etapa-repository.ts`). Todas as outras rotas fazem **queries SQL diretas** no handler. Arquitetura hexagonal abandonada.                                  | **Alta**    | Violação arquitetural grave — domain/application layers são decorativos    |
| 23  | Back       | Use-cases                                                                      | 6 use-cases implementados mas **nenhum é usado pelas rotas atuais**. As rotas fazem tudo inline. Código morto.                                                                                                               | **Alta**    | Camada de aplicação inteira é código morto                                 |
| 24  | Back       | Domain entities                                                                | 13 entidades de domínio implementadas mas **não são instanciadas em nenhum lugar**. Código morto.                                                                                                                            | **Alta**    | Camada de domínio inteira é código morto                                   |
| 25  | Back       | Value objects                                                                  | 6 value objects implementados mas **não são usados**. Código morto.                                                                                                                                                          | **Média**   | Código morto                                                               |
| 26  | Back       | Ports                                                                          | `repositories.ts` define interfaces de repositório que **não são implementadas** (exceto 2).                                                                                                                                 | **Média**   | Contratos não cumpridos                                                    |
| 27  | Banco      | `processos_principais`, `volumes`, `apensos`                                   | Tabelas do modelo original que **não são acessadas pelo fluxo operacional atual** (que usa `repositorios`). Sistema migrou de modelo mas manteve tabelas antigas.                                                            | **Média**   | Tabelas órfãs, confusão de domínio                                         |
| 28  | Banco      | `fontes_dados`, `fontes_dados_api`, `fontes_dados_configuracoes`               | Tabelas criadas mas **sem nenhuma rota ou lógica que as acesse**.                                                                                                                                                            | **Média**   | Tabelas nunca utilizadas                                                   |
| 29  | Banco      | `recebimentos` (migration 022)                                                 | Tabela de recebimentos legada. O fluxo atual usa `recebimento_documentos` (migration 037).                                                                                                                                   | **Baixa**   | Tabela órfã                                                                |
| 30  | Banco      | `artigos`, `categorias`, `tags`, `artigos_tags`, `artigos_relacionados`        | Base de conhecimento legada. O fluxo atual usa `kb_documentos`, `kb_documento_versoes`, `kb_documento_etapas` (migration 036).                                                                                               | **Baixa**   | 5 tabelas órfãs                                                            |
| 31  | Banco      | `registros_producao` (migration 009) vs `producao_repositorio` (migration 033) | **Duas tabelas de produção** com propósitos sobrepostos. `registros_producao` é do modelo antigo, `producao_repositorio` é do fluxo operacional. Dashboard usa `producao_repositorio`, relatórios usam `registros_producao`. | **Alta**    | Dados de produção fragmentados entre duas tabelas                          |
| 32  | Banco      | `configuracao_empresa`                                                         | Sem campo `created_at` / `criado_em`. Apenas `data_atualizacao`.                                                                                                                                                             | **Baixa**   | Falta de auditoria de criação                                              |
| 33  | Banco      | `refresh_tokens`                                                               | Sem limpeza automática de tokens expirados. Tabela cresce indefinidamente.                                                                                                                                                   | **Média**   | Degradação de performance ao longo do tempo                                |
| 34  | Integração | `relatorioApi.ts` vs `api.ts`                                                  | Dois serviços de API no frontend. `relatorioApi.ts` não usa auth, duplica lógica.                                                                                                                                            | **Média**   | Inconsistência, risco de falha                                             |
| 35  | Integração | Relatórios gerenciais                                                          | Usam dados de `registros_producao` (modelo antigo). Dashboard usa `producao_repositorio` (modelo novo). **Dados inconsistentes entre dashboard e relatórios.**                                                               | **Crítica** | Relatórios podem mostrar dados diferentes do dashboard                     |
| 36  | Integração | PWA manifest                                                                   | Descrição diz "Sistema de Memorização" em vez de "Gestão de Processos Administrativos".                                                                                                                                      | **Baixa**   | Branding incorreto                                                         |
| 37  | Integração | Vite proxy                                                                     | Proxy para `/producao` e `/recebimento` configurado, mas essas rotas retornam 410 GONE no backend. Configuração obsoleta.                                                                                                    | **Baixa**   | Configuração morta                                                         |
| 38  | Front      | `.env`                                                                         | JWT_SECRET hardcoded com valor previsível no `.env`. **Arquivo `.env` commitado no repositório.**                                                                                                                            | **Crítica** | Segurança comprometida se repositório for público                          |
| 39  | Back       | Graceful shutdown                                                              | Sem handler de SIGTERM/SIGINT. Conexões de banco não são fechadas graciosamente.                                                                                                                                             | **Média**   | Risco de conexões órfãs em produção                                        |
| 40  | Front      | `useCamera.ts`                                                                 | Hook de câmera implementado mas **não referenciado em nenhuma página**.                                                                                                                                                      | **Baixa**   | Código morto                                                               |

---

## 4. TESTES FUNCIONAIS E DE FLUXO (Simulação Mental)

### 👤 Usuário Comum (Operador)

| Fluxo                                          | Resultado                                        |
| ---------------------------------------------- | ------------------------------------------------ |
| Login → Dashboard                              | ✅ Funciona                                      |
| Dashboard → Operação Recebimento               | ✅ Funciona                                      |
| Criar repositório → Checklist → Avançar etapas | ✅ Funciona                                      |
| Acessar Relatórios Operacionais                | ❌ **QUEBRA** — endpoint inexistente             |
| Acessar Exportações                            | ⚠️ Funciona mas todos exportam o mesmo relatório |
| Acessar Configurações                          | ✅ Bloqueado corretamente (RoleRoute)            |
| Esqueci senha → Redefinir                      | ❌ **QUEBRA** — sem tela de reset                |

### 👑 Usuário Administrador

| Fluxo                                  | Resultado                                   |
| -------------------------------------- | ------------------------------------------- |
| Criar colaborador → Editar → Desativar | ✅ Funciona                                 |
| Criar etapa → Editar → Desativar       | ✅ Funciona                                 |
| Criar projeto → Editar → Excluir       | ❌ **Incompleto** — só cria                 |
| Criar usuário → Desativar              | ✅ Funciona                                 |
| Configurar empresa → Salvar            | ✅ Funciona                                 |
| Auditoria → Filtrar por tipo           | ❌ **Não funciona** — 4 sub-rotas idênticas |
| Relatórios Gerenciais → PDF/Excel      | ✅ Funciona                                 |

### 🔒 Usuário Não Autenticado

| Fluxo                           | Resultado                                   |
| ------------------------------- | ------------------------------------------- |
| Acessar qualquer rota protegida | ✅ Redirecionado para login                 |
| Acessar API sem token           | ✅ Retorna 401                              |
| Token expirado → Refresh        | ✅ Funciona                                 |
| Brute force login               | ⚠️ Sem rate limiting em dev, básico em prod |

---

## 5. PLANO DE CORREÇÃO

### 🔴 Fase 1 — Correções Críticas (Sistema Funcionar)

**Prazo sugerido:** 1-2 dias | **Risco:** Baixo

| #   | Ação                                                                                                                                        | Dependência        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1.1 | Criar endpoint `GET /relatorios/operacional` no backend (ou corrigir o front para usar endpoint existente)                                  | Nenhuma            |
| 1.2 | Remover `.env` do repositório, adicionar ao `.gitignore`, rotacionar JWT_SECRET                                                             | Nenhuma            |
| 1.3 | Unificar dados de produção: decidir entre `registros_producao` e `producao_repositorio` e fazer relatórios e dashboard usarem a mesma fonte | Decisão de negócio |
| 1.4 | Corrigir strings UTF-8 corrompidas em `auth.ts`                                                                                             | Nenhuma            |

### 🟠 Fase 2 — Correções Estruturais (Qualidade e Consistência)

**Prazo sugerido:** 3-5 dias | **Risco:** Médio

| #    | Ação                                                                                       | Dependência                              |
| ---- | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 2.1  | Criar tela de reset de senha (`/reset-password?token=xxx`)                                 | Fase 1                                   |
| 2.2  | Diferenciar as 4 sub-rotas de auditoria (filtro automático por tipo)                       | Nenhuma                                  |
| 2.3  | Corrigir `ExportacoesPage` para gerar relatórios diferentes por tipo                       | Backend precisa de endpoints específicos |
| 2.4  | Padronizar todas as chamadas de API no front para usar `api.ts` (remover `fetch()` direto) | Nenhuma                                  |
| 2.5  | Hashear tokens de reset de senha no banco (como refresh tokens)                            | Nenhuma                                  |
| 2.6  | Corrigir meta hardcoded em `/producao/desempenho` para buscar de `metas_producao`          | Nenhuma                                  |
| 2.7  | Completar CRUD de projetos (edição, exclusão, toggle)                                      | Nenhuma                                  |
| 2.8  | Configurar CORS restritivo para produção                                                   | Nenhuma                                  |
| 2.9  | Corrigir imagem da logo em `ForgotPasswordPage`                                            | Nenhuma                                  |
| 2.10 | Remover `relatorioApi.ts` duplicado                                                        | 2.4                                      |

### 🟡 Fase 3 — Refatorações e Melhorias

**Prazo sugerido:** 1-2 semanas | **Risco:** Médio-Alto

| #    | Ação                                                                                                                                 | Dependência        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 3.1  | Quebrar `operacional.ts` (1566 linhas) em módulos menores                                                                            | Fase 2             |
| 3.2  | Decidir sobre a arquitetura hexagonal: ou implementar de verdade (usar use-cases/entities/repositories) ou remover as camadas mortas | Decisão técnica    |
| 3.3  | Limpar tabelas órfãs do banco ou criar migration de remoção                                                                          | Decisão de negócio |
| 3.4  | Implementar limpeza automática de refresh_tokens expirados (cron/scheduled)                                                          | Nenhuma            |
| 3.5  | Remover diretórios vazios e código morto (`PlaceholderPage`, `useCamera`, etc.)                                                      | Nenhuma            |
| 3.6  | Adicionar graceful shutdown no backend                                                                                               | Nenhuma            |
| 3.7  | Habilitar CSP no helmet                                                                                                              | Nenhuma            |
| 3.8  | Implementar rate limiting granular (login: mais restritivo)                                                                          | Nenhuma            |
| 3.9  | Corrigir descrição do PWA manifest                                                                                                   | Nenhuma            |
| 3.10 | Remover proxy de rotas legadas no vite.config.ts                                                                                     | Nenhuma            |

### 🟢 Fase 4 — Preparação para Produção

**Prazo sugerido:** 1-2 semanas | **Risco:** Alto

| #    | Ação                                                                    | Dependência       |
| ---- | ----------------------------------------------------------------------- | ----------------- |
| 4.1  | Implementar envio real de e-mail para forgot-password                   | Serviço de e-mail |
| 4.2  | Configurar variáveis de ambiente por ambiente (dev/staging/prod)        | Infra             |
| 4.3  | Implementar logging estruturado (não apenas console.log)                | Nenhuma           |
| 4.4  | Adicionar testes E2E para fluxos críticos (login, operação, relatórios) | Fase 1-2          |
| 4.5  | Configurar CI/CD pipeline                                               | Infra             |
| 4.6  | Audit de dependências (npm audit)                                       | Nenhuma           |
| 4.7  | Configurar backup automático do PostgreSQL                              | Infra             |
| 4.8  | Implementar monitoramento (health checks, métricas)                     | Infra             |
| 4.9  | Documentar API (OpenAPI/Swagger)                                        | Fase 3            |
| 4.10 | Revisão de segurança completa (OWASP Top 10)                            | Fase 2-3          |

---

## 6. STATUS FINAL DO SISTEMA

### ⚠️ MVP Incompleto

**Justificativa técnica:**

1. **Funcionalidades core funcionam** — O fluxo operacional principal (recebimento → preparação → digitalização → conferência → montagem → CQ → entrega) está implementado e funcional. Login, dashboard, configurações básicas e relatórios gerenciais (PDF/Excel) funcionam.

2. **Porém há problemas que impedem uso em produção:**
   - Uma tela inteira quebrada (Relatórios Operacionais)
   - Funcionalidades fake (Exportações, sub-rotas de Auditoria)
   - Fluxo de recuperação de senha incompleto
   - Vulnerabilidades de segurança (CORS aberto, tokens em texto plano, .env commitado)
   - Dados fragmentados entre modelo antigo e novo (relatórios vs dashboard)
   - Arquitetura hexagonal declarada mas não implementada (3 camadas inteiras de código morto)

3. **Dívida técnica significativa:**
   - ~10 tabelas órfãs no banco
   - ~20 arquivos de código morto (entities, use-cases, value-objects, repositories)
   - Arquivo monolítico de 1566 linhas
   - Inconsistência de padrões (fetch direto vs api service)

4. **O que falta para ser "Funcional com riscos":**
   - Corrigir a tela de Relatórios Operacionais
   - Unificar fonte de dados de produção
   - Fechar vulnerabilidades de segurança
   - Completar fluxo de reset de senha

**Estimativa para atingir "Funcional com riscos" (🟡):** 3-5 dias de trabalho focado (Fases 1 e 2).
**Estimativa para atingir "Pronto para produção" (🟢):** 4-6 semanas (todas as fases).

---

## 7. CORREÇÕES IMPLEMENTADAS (2026-02-11)

### 7.1 Backend — Validações e Regras de Negócio

| #   | Arquivo                       | Alteração                                                                                                                                                                                                                                  |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `operacional-checklists.ts`   | **Validação de checklist no avanço de etapa** — PATCH `/avancar` agora verifica se existe checklist concluído da etapa atual antes de permitir avanço (complementa trigger DB `fn_validar_avanco_etapa_repositorio` com mensagem amigável) |
| 2   | `operacional-checklists.ts`   | **Bloqueio Seadesk no avanço da Digitalização** — PATCH `/avancar` verifica `seadesk_confirmado_em IS NOT NULL` quando etapa atual é DIGITALIZACAO                                                                                         |
| 3   | `operacional-checklists.ts`   | **CRUD de Checklist Modelos (admin-only)** — GET/POST/PUT/PATCH para `/operacional/checklist-modelos` com `authorize('administrador')`                                                                                                     |
| 4   | `operacional-cq.ts`           | **Rotas CQ restritas a admin** — POST `/lotes-cq`, POST `/lotes-cq/:id/fechar`, POST `/lotes-cq/:id/relatorio-entrega` agora exigem `authorize('administrador')`                                                                           |
| 5   | `operacional-cq.ts`           | **Remoção de UPDATEs redundantes no fechamento de lote CQ** — O trigger DB `fn_aplicar_resultado_cq_em_repositorios` já atualiza `status_atual` e `etapa_atual` dos repositórios; UPDATEs manuais removidos para evitar conflito           |
| 6   | `operacional-repositorios.ts` | **Endpoint Seadesk** — PATCH `/operacional/repositorios/:id/seadesk-confirmar` valida etapa DIGITALIZACAO e grava `seadesk_confirmado_em` + `seadesk_confirmado_por`                                                                       |
| 7   | `dashboard.ts`                | **3 novos indicadores** — Backlog por armário, tempo médio por etapa (corrigido para usar `data_evento`), relatório detalhado de retrabalho CQ                                                                                             |
| 8   | `dashboard.ts`                | **Correção SQL tempo médio** — Coluna corrigida de `data_hora` para `data_evento` (conforme schema `historico_etapas`); query reescrita com LEAD window function                                                                           |

### 7.2 Frontend — UI e Funcionalidades

| #   | Arquivo                      | Alteração                                                                                                                |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | `EtapaOperacionalPage.tsx`   | **Botão "Avançar Etapa"** com modal de seleção de armário destino, chamando PATCH `/avancar`                             |
| 2   | `EtapaOperacionalPage.tsx`   | **Botão "Registrar Produção"** chamando POST `/producao`                                                                 |
| 3   | `EtapaOperacionalPage.tsx`   | **Botão "Devolver"** para retornar repositório à etapa anterior (reusa PATCH `/avancar` com `prevEtapaApi`/`prevStatus`) |
| 4   | `EtapaOperacionalPage.tsx`   | **Botão "Seadesk"** visível apenas na etapa Digitalização, chamando PATCH `/seadesk-confirmar`                           |
| 5   | `EtapaOperacionalPage.tsx`   | **ETAPA_MAP expandido** com `nextEtapaApi`, `nextStatus`, `prevEtapaApi`, `prevStatus` para todas as etapas              |
| 6   | `ControleQualidadePanel.tsx` | **Campo "motivo" editável** por item de CQ reprovado                                                                     |
| 7   | `ControleQualidadePanel.tsx` | **Botão "Baixar PDF"** após gerar relatório de entrega                                                                   |
| 8   | `ChecklistModelosPage.tsx`   | **Nova página CRUD** para modelos de checklist (admin-only)                                                              |
| 9   | `Dashboard.tsx`              | **3 novas seções** — Backlog por Armário, Tempo Médio por Etapa, Retrabalho CQ                                           |
| 10  | `menu.ts`                    | **Menu "Modelos de Checklist"** adicionado à seção Configurações                                                         |
| 11  | `AppLayout.tsx`              | **Título de rota** para `/configuracoes/checklist-modelos`                                                               |
| 12  | `routes/index.tsx`           | **Rota** `/configuracoes/checklist-modelos` com `RoleRoute` admin-only                                                   |

### 7.3 Banco de Dados

| #   | Arquivo                       | Alteração                                                                                                                                                      |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `040_seadesk_confirmacao.sql` | **Nova migração** — Adiciona `seadesk_confirmado_em` (TIMESTAMPTZ) e `seadesk_confirmado_por` (UUID FK → usuarios) à tabela `repositorios`, com índice parcial |

### 7.4 Testes

| #   | Teste                                     | Resultado                                                    |
| --- | ----------------------------------------- | ------------------------------------------------------------ |
| 1   | Lista modelos de checklist (admin)        | ✅ 200                                                       |
| 2   | Cria modelo de checklist (admin)          | ✅ 201                                                       |
| 3   | Rejeita modelo sem campos obrigatórios    | ✅ 400                                                       |
| 4   | Atualiza modelo de checklist (admin)      | ✅ 200                                                       |
| 5   | Toggle ativo de modelo (admin)            | ✅ 200                                                       |
| 6   | Bloqueia operador em checklist-modelos    | ✅ 403                                                       |
| 7   | Seadesk — rejeita fora da Digitalização   | ✅ 400 (ETAPA_INVALIDA)                                      |
| 8   | Bloqueia operador em fechar lote CQ       | ✅ 403                                                       |
| 9   | Bloqueia operador em relatório entrega CQ | ✅ 403                                                       |
| 10  | Dashboard inclui novos indicadores        | ✅ 200 (backlogPorArmario, tempoMedioPorEtapa, retrabalhoCQ) |

**Total de testes:** 72 backend + 7 frontend = **79 testes passando**
**TypeScript:** Compilação limpa em ambos os pacotes (`tsc --noEmit`)
