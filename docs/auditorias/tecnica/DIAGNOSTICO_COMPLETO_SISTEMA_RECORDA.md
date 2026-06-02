# DIAGNÓSTICO COMPLETO DO SISTEMA RECORDA

**Data da análise:** 2025  
**Escopo:** Levantamento completo — frontend, backend, banco de dados, perfis e seções  
**Metodologia:** Leitura estática de código-fonte; execução de `npm run typecheck` e `npm run build`  
**Restrição:** Nenhum arquivo foi alterado durante esta análise

---

## ÍNDICE

1. [Resumo Executivo](#1-resumo-executivo)
2. [Stack Tecnológica](#2-stack-tecnológica)
3. [Perfis de Usuário e Modelo de Permissões](#3-perfis-de-usuário-e-modelo-de-permissões)
4. [Mapa de Menus — Visão Completa por Perfil](#4-mapa-de-menus--visão-completa-por-perfil)
5. [Mapa de Rotas Frontend](#5-mapa-de-rotas-frontend)
6. [Mapa de Rotas Backend](#6-mapa-de-rotas-backend)
7. [Alinhamento Frontend ↔ Backend](#7-alinhamento-frontend--backend)
8. [Alinhamento Backend ↔ Banco de Dados](#8-alinhamento-backend--banco-de-dados)
9. [Análise por Perfil — Colaborador](#9-análise-por-perfil--colaborador)
10. [Análise por Perfil — Operador](#10-análise-por-perfil--operador)
11. [Análise por Perfil — Administrador](#11-análise-por-perfil--administrador)
12. [Seção Dashboard](#12-seção-dashboard)
13. [Seção Minha Produção](#13-seção-minha-produção)
14. [Seção Produção (Painel Operador/Admin)](#14-seção-produção-painel-operadoradmin)
15. [Seção Operação — Recebimento](#15-seção-operação--recebimento)
16. [Seção Operação — Controle de Qualidade](#16-seção-operação--controle-de-qualidade)
17. [Seção Operação — Devoluções](#17-seção-operação--devoluções)
18. [Seção Base de Conhecimento](#18-seção-base-de-conhecimento)
19. [Seção Comunicados](#19-seção-comunicados)
20. [Seção Relatórios](#20-seção-relatórios)
21. [Seção Configurações — Empresa](#21-seção-configurações--empresa)
22. [Seção Configurações — Projetos](#22-seção-configurações--projetos)
23. [Seção Configurações — Usuários](#23-seção-configurações--usuários)
24. [Seção Configurações — Vincular Produções](#24-seção-configurações--vincular-produções)
25. [Seção Configurações — Gestão de Comunicados](#25-seção-configurações--gestão-de-comunicados)
26. [Seção Configurações — Justificativas de Ausência](#26-seção-configurações--justificativas-de-ausência)
27. [Seção Sistema / Administração](#27-seção-sistema--administração)
28. [Seção Auditoria](#28-seção-auditoria)
29. [Funcionalidades de Backend Sem Interface Dedicada](#29-funcionalidades-de-backend-sem-interface-dedicada)
30. [PWA e Push Notifications](#30-pwa-e-push-notifications)
31. [Classificação de Maturidade por Seção](#31-classificação-de-maturidade-por-seção)
32. [Problemas Encontrados](#32-problemas-encontrados)
33. [Decisões de Regras de Negócio Pendentes](#33-decisões-de-regras-de-negócio-pendentes)
34. [Roadmap Sugerido](#34-roadmap-sugerido)
35. [Confirmação de Integridade](#35-confirmação-de-integridade)

---

## 1. RESUMO EXECUTIVO

O sistema Recorda é um monorepo TypeScript composto por frontend React (Vite + PWA), backend Node.js/Fastify e banco de dados PostgreSQL com ~96 migrations. O sistema destina-se à gestão de digitalização e controle de acervos documentais, com fluxo operacional que vai do recebimento de processos físicos até a entrega pós-controle de qualidade.

**Pontos fortes identificados:**

- `npm run typecheck` passou **sem nenhum erro** em todos os workspaces
- `npm run build` passou **sem nenhum erro** — 469 módulos transformados, build de produção limpo
- Estrutura bem organizada: monorepo com `packages/backend`, `packages/frontend`, `packages/shared` e `db/migrations`
- Autenticação JWT com refresh token bem implementada
- Auditoria de banco de dados via triggers bem estruturada
- Rate limiting diferenciado por tipo de endpoint
- Proteção de rotas no frontend (`ProtectedRoute` + `RoleRoute`) consistente com autorizações no backend
- PWA com service worker, manifest e push notifications estruturados

**Pontos de atenção (resumo):**

- Módulo de Ausências está incompleto: banco de dados, backend e frontend admin existem, mas não há endpoint nem tela para que o colaborador **submeta** uma ausência. O fluxo é unilateral (admin só aprova/rejeita, mas não há quem submeta)
- Algumas etapas do fluxo operacional (Preparação, Digitalização, Conferência, Montagem, Atendimento, Reconferência) existem no banco de dados mas não têm páginas operacionais no frontend
- A seção "Metas de Produção" tem backend completo mas **nenhuma página frontend dedicada**
- Três inconsistências de nomenclatura/estrutura de menu identificadas (documentadas em detalhes abaixo)
- Perfil `supervisor` foi corretamente migrado para `operador` (migration 035) — nenhum resquício no código-fonte atual

---

## 2. STACK TECNOLÓGICA

### Frontend

| Componente    | Tecnologia                                                         |
| ------------- | ------------------------------------------------------------------ |
| Framework     | React 18 + TypeScript                                              |
| Build         | Vite 5                                                             |
| Roteamento    | React Router v6 (Data Router)                                      |
| Fetch/Cache   | TanStack Query v5                                                  |
| Estilos       | Tailwind CSS                                                       |
| PWA           | vite-plugin-pwa (Workbox / injectManifest)                         |
| UI Components | Biblioteca própria (`packages/frontend/src/components/ui/`)        |
| Markdown      | Editor e visualizador lazy-loaded                                  |
| Imagens       | sharp (processamento no backend), perspectiveCorrection.js (no FE) |

### Backend

| Componente     | Tecnologia                                           |
| -------------- | ---------------------------------------------------- |
| Framework      | Fastify + TypeScript                                 |
| Banco de dados | PostgreSQL (driver `pg`, SQL raw)                    |
| Autenticação   | JWT (access 8h / refresh 7d, stored in localStorage) |
| Validação      | Zod                                                  |
| PDF            | pdfkit                                               |
| Excel          | exceljs                                              |
| Upload         | @fastify/multipart                                   |
| OCR            | Serviço Python externo                               |
| Imagens        | sharp                                                |

### Banco de Dados

| Componente       | Tecnologia                                                         |
| ---------------- | ------------------------------------------------------------------ |
| SGBD             | PostgreSQL                                                         |
| Migrations       | 96 arquivos SQL sequenciais (001 a 096)                            |
| Auditoria        | Triggers PostgreSQL (`auditoria` table)                            |
| Funções          | `set_config('app.current_user_id', ...)` para auditoria contextual |
| Full-text search | trgm extension (migration 091)                                     |

### Compartilhado

- `@recorda/shared`: tipos TypeScript, constantes e DTOs usados por FE e BE
- Profiles: `PerfilUsuario = 'colaborador' | 'operador' | 'administrador'`

---

## 3. PERFIS DE USUÁRIO E MODELO DE PERMISSÕES

### Perfis disponíveis

Exatamente **3 perfis** — sem `supervisor` ou qualquer outro:

- `colaborador`
- `operador`
- `administrador`

### Modelo de autorização

O sistema usa **dois mecanismos simultâneos**:

1. **`RoleRoute` no frontend** — guarda as rotas React verificando `allowedProfiles`
2. **`authorize(...)` no backend** — middleware Fastify que verifica o `perfil` do JWT

Existe também um sistema de **permissões nominais** (`PERMISSOES_POR_PERFIL` em `@recorda/shared`):

| Permissão                 | colaborador | operador | administrador |
| ------------------------- | ----------- | -------- | ------------- |
| `visualizar_dashboard`    | ✅          | ✅       | ✅            |
| `gerar_relatorios`        | ❌          | ✅       | ✅            |
| `importar_producao`       | ❌          | ✅       | ✅            |
| `capturar_documentos`     | ❌          | ✅       | ✅            |
| `gerenciar_configuracoes` | ❌          | ❌       | ✅            |
| `gerenciar_usuarios`      | ❌          | ❌       | ✅            |

> ⚠️ **Observação importante:** O método `temPermissao()` do `AuthContext` existe mas é pouco utilizado na prática. A proteção real de rotas depende do `RoleRoute` no frontend e do `authorize()` no backend. O sistema de permissões nominais é redundante e parcialmente inconsistente (ex: `capturar_documentos` está associado a `operador`, mas a funcionalidade Captura de Mapas é restrita a `colaborador`).

### Autenticação

- `POST /auth/login` → retorna `accessToken` + `refreshToken`
- `GET /auth/me` → valida token e retorna dados do usuário
- `POST /auth/refresh` → renova tokens
- `POST /auth/logout` → invalida refresh token
- `POST /auth/forgot-password` → envia email com link de reset
- `POST /auth/reset-password` → redefine senha com token válido
- Rate limiting: 5/min para login, 3/min para forgot-password
- JWT armazenado em `localStorage` (sem httpOnly cookies — design escolhido, XSS risk residual)

---

## 4. MAPA DE MENUS — VISÃO COMPLETA POR PERFIL

### 4.1 Estrutura de menu por seção

| Seção          | basePath                 | Perfis          | Itens                                                                             | Status                              |
| -------------- | ------------------------ | --------------- | --------------------------------------------------------------------------------- | ----------------------------------- |
| Dashboard      | `/dashboard`             | Todos           | — (link direto)                                                                   | ✅ Funcional                        |
| Produção       | `/producao`              | operador, admin | Painel, Importar                                                                  | ✅ Funcional                        |
| Minha Produção | `/minha-producao`        | colaborador     | Lançar, Histórico, Captura Mapas                                                  | ✅ Funcional                        |
| Comunicados    | `/comunicados`           | Todos           | — (link direto)                                                                   | ✅ Funcional                        |
| Operação       | `/operacao`              | operador, admin | Recebimento, Controle Qualidade, Devoluções                                       | ✅ Parcial (ver §15/16)             |
| Conhecimento   | `/operacao/conhecimento` | operador, admin | Base de Conhecimento                                                              | ✅ Funcional                        |
| Relatórios     | `/relatorios`            | operador, admin | Relatórios Gerenciais, Exportações                                                | ✅ Funcional                        |
| Configurações  | `/configuracoes`         | admin           | Empresa, Projetos, Usuários, Vincular Produções, Gestão de Comunicados, Ausências | ✅ Funcional (Ausências incompleto) |
| Sistema        | `/configuracoes/admin`   | admin           | Administração                                                                     | ✅ Funcional                        |
| Auditoria      | `/auditoria`             | operador, admin | Importações, OCR, Correções, Ações (admin-only)                                   | ✅ Funcional                        |

### 4.2 Menu por perfil

#### Colaborador vê:

1. Dashboard
2. Minha Produção → Lançar Produção, Meu Histórico, Captura de Mapas
3. Comunicados

#### Operador vê:

1. Dashboard
2. Produção → Painel, Importar Produção
3. Comunicados
4. Operação → Recebimento, Controle de Qualidade, Devoluções
5. Conhecimento → Base de Conhecimento
6. Relatórios → Relatórios Gerenciais, Exportações
7. Auditoria → Importações, OCR, Correções _(sem Ações de Usuários)_

#### Administrador vê:

1. Dashboard
2. Produção → Painel, Importar Produção
3. Comunicados
4. Operação → Recebimento, Controle de Qualidade, Devoluções
5. Conhecimento → Base de Conhecimento
6. Relatórios → Relatórios Gerenciais, Exportações
7. Configurações → Empresa, Projetos, Usuários, Vincular Produções, Gestão de Comunicados, Ausências
8. Sistema → Administração
9. Auditoria → Importações, OCR, Correções, Ações de Usuários

### 4.3 Inconsistências estruturais de menu

**A) Seção "Conhecimento" aninhada sob URL de Operação**  
`basePath: '/operacao/conhecimento'` — a seção aparece no sidebar como seção principal de primeiro nível chamada "Conhecimento", mas seu caminho vive dentro do espaço `/operacao/`. Isso faz com que ambos os itens de menu (`Operação` e `Conhecimento`) apareçam como ativos simultaneamente ao navegar pela Base de Conhecimento.

**B) Seção "Sistema" aninhada sob URL de Configurações**  
`basePath: '/configuracoes/admin'` — o menu exibe "Sistema" como seção principal separada, mas sua única sub-rota está em `/configuracoes/admin`. Isso faz com que "Configurações" também apareça como ativo ao usar "Sistema".

**C) Seção "Conhecimento" redundante**  
A seção tem apenas **um item** ("Base de Conhecimento") que leva ao mesmo endereço que o `basePath` da seção. O nível intermediário de menu não adiciona valor.

---

## 5. MAPA DE ROTAS FRONTEND

### 5.1 Rotas públicas (sem autenticação)

| Rota               | Página               | Observação |
| ------------------ | -------------------- | ---------- |
| `/login`           | `LoginPage`          | —          |
| `/forgot-password` | `ForgotPasswordPage` | —          |
| `/reset-password`  | `ResetPasswordPage`  | —          |

### 5.2 Rotas protegidas — Todos os perfis autenticados

| Rota           | Página            | Observação                    |
| -------------- | ----------------- | ----------------------------- |
| `/dashboard`   | `DashboardPage`   | Conteúdo diferente por perfil |
| `/comunicados` | `ComunicadosPage` | Vista do usuário (não admin)  |

### 5.3 Rotas protegidas — Colaborador apenas

| Rota                           | Página               | Observação |
| ------------------------------ | -------------------- | ---------- |
| `/minha-producao/lancar`       | `LancarProducaoPage` | —          |
| `/minha-producao/historico`    | `MeuHistoricoPage`   | —          |
| `/minha-producao/captura-mapa` | `CapturaMapaPage`    | —          |

> Não existe `/minha-producao` (root) — está implícito por redirect.

### 5.4 Rotas protegidas — Operador e Administrador

| Rota                           | Página                                  | Observação          |
| ------------------------------ | --------------------------------------- | ------------------- |
| `/producao`                    | `ProducaoPage`                          | —                   |
| `/producao/importar`           | `ImportarProducaoPage`                  | —                   |
| `/operacao`                    | redirect → `/operacao/recebimento`      | —                   |
| `/operacao/recebimento`        | `EtapaOperacionalPage`                  | via `:etapa`        |
| `/operacao/controle-qualidade` | `EtapaOperacionalPage`                  | via `:etapa`        |
| `/operacao/devolucoes`         | `DevolucoesPage`                        | rota explícita      |
| `/operacao/conhecimento`       | `ConhecimentoOperacionalPage`           | rota explícita      |
| `/operacao/:etapa`             | `EtapaOperacionalPage`                  | catch-all (ver §32) |
| `/relatorios`                  | redirect → `/relatorios/gerenciais`     | —                   |
| `/relatorios/gerenciais`       | `RelatoriosGerenciaisPage`              | —                   |
| `/relatorios/exportacoes`      | `ExportacoesPage`                       | —                   |
| `/auditoria`                   | redirect → `/auditoria/importacoes`     | —                   |
| `/auditoria/importacoes`       | `AuditoriaPage categoria="importacoes"` | —                   |
| `/auditoria/ocr`               | `AuditoriaPage categoria="ocr"`         | —                   |
| `/auditoria/correcoes`         | `AuditoriaPage categoria="correcoes"`   | —                   |

### 5.5 Rotas protegidas — Somente Administrador

| Rota                                | Página                              | Observação |
| ----------------------------------- | ----------------------------------- | ---------- |
| `/configuracoes`                    | redirect → `/configuracoes/empresa` | —          |
| `/configuracoes/empresa`            | `EmpresaPage`                       | —          |
| `/configuracoes/projetos`           | `ProjetosPage`                      | —          |
| `/configuracoes/usuarios`           | `UsuariosPage`                      | —          |
| `/configuracoes/admin`              | `AdminPage`                         | —          |
| `/configuracoes/vincular-producoes` | `VincularProducoesPage`             | —          |
| `/configuracoes/comunicados`        | `ComunicadosAdminPage`              | —          |
| `/configuracoes/ausencias`          | `AusenciasPage`                     | —          |
| `/auditoria/acoes`                  | `AuditoriaPage categoria="acoes"`   | —          |

### 5.6 Rota catch-all

| Rota | Página         |
| ---- | -------------- |
| `*`  | `NotFoundPage` |

---

## 6. MAPA DE ROTAS BACKEND

### 6.1 Auth (`/auth`)

| Método | Rota                    | Acesso      | Implementação |
| ------ | ----------------------- | ----------- | ------------- |
| POST   | `/auth/login`           | público     | ✅            |
| GET    | `/auth/me`              | autenticado | ✅            |
| POST   | `/auth/refresh`         | público     | ✅            |
| POST   | `/auth/logout`          | autenticado | ✅            |
| POST   | `/auth/forgot-password` | público     | ✅            |
| POST   | `/auth/reset-password`  | público     | ✅            |

### 6.2 Dashboard

| Método | Rota         | Acesso          | Implementação |
| ------ | ------------ | --------------- | ------------- |
| GET    | `/dashboard` | operador, admin | ✅            |

### 6.3 Produção / Metas (`metas.ts`)

| Método | Rota                        | Acesso | Implementação |
| ------ | --------------------------- | ------ | ------------- |
| GET    | `/producao/metas`           | todos  | ✅            |
| POST   | `/producao/metas`           | admin  | ✅            |
| GET    | `/producao/desempenho`      | todos  | ✅            |
| GET    | `/producao/mapeamentos`     | todos  | ✅            |
| POST   | `/producao/mapeamentos`     | admin  | ✅            |
| DELETE | `/producao/mapeamentos/:id` | admin  | ✅            |
| GET    | `/producao/meu-historico`   | todos  | ✅            |
| GET    | `/producao/vincular`        | todos  | ✅            |
| POST   | `/producao/vincular`        | admin  | ✅            |
| POST   | `/producao/lancar-direto`   | todos  | ✅            |

### 6.4 Relatórios (`relatorios.ts`)

| Método | Rota          | Acesso          | Implementação       |
| ------ | ------------- | --------------- | ------------------- |
| GET    | `/relatorios` | operador, admin | ✅ (JSON/PDF/Excel) |

### 6.5 Configuração (`configuracao.ts`)

| Endpoint                                 | Acesso | Observação            |
| ---------------------------------------- | ------ | --------------------- |
| GET/PUT `/configuracao/empresa`          | admin  | logo, CNPJ, relatório |
| POST/DELETE `/configuracao/empresa/logo` | admin  | upload                |
| CRUD `/configuracao/projetos`            | admin  | —                     |
| CRUD `/configuracao/etapas`              | admin  | —                     |
| CRUD `/configuracao/coordenadorias`      | admin  | —                     |

### 6.6 Usuários (`colaboradores.ts` / registro)

| Método | Rota                       | Acesso | Implementação |
| ------ | -------------------------- | ------ | ------------- |
| GET    | `/colaboradores`           | admin  | ✅            |
| POST   | `/auth/register`           | admin  | ✅            |
| PUT    | `/colaboradores/:id`       | admin  | ✅            |
| PATCH  | `/colaboradores/:id/ativo` | admin  | ✅            |

### 6.7 Operacional — Recebimento

| Método              | Rota                                      | Acesso          | Implementação |
| ------------------- | ----------------------------------------- | --------------- | ------------- |
| GET/POST/PUT/DELETE | `/operacional/recebimento-processos`      | operador, admin | ✅            |
| GET/POST/PUT/DELETE | `/operacional/volumes`                    | operador, admin | ✅            |
| GET/POST/PUT/DELETE | `/operacional/apensos`                    | operador, admin | ✅            |
| GET                 | `/operacional/setores-recebimento`        | todos           | ✅            |
| GET                 | `/operacional/classificacoes-recebimento` | todos           | ✅            |
| GET                 | `/operacional/orgaos-recebimento`         | todos           | ✅            |
| GET/PUT             | `/operacional/checklists`                 | operador, admin | ✅            |
| GET/POST            | `/operacional/avulsos`                    | operador, admin | ✅            |
| POST                | `/operacional/avulsos/batch`              | operador, admin | ✅            |

### 6.8 Operacional — Etapa / Repositório

| Método | Rota                                       | Acesso          | Implementação |
| ------ | ------------------------------------------ | --------------- | ------------- |
| GET    | `/operacional/repositorios`                | operador, admin | ✅            |
| POST   | `/operacional/repositorios/:id/avancar`    | operador, admin | ✅            |
| POST   | `/operacional/repositorios/:id/retroceder` | operador, admin | ✅            |

### 6.9 Operacional — CQ

| Método     | Rota                                 | Acesso          | Implementação                |
| ---------- | ------------------------------------ | --------------- | ---------------------------- |
| POST       | `/operacional/lotes-cq`              | **admin only**  | ✅ (operador não pode criar) |
| GET        | `/operacional/lotes-cq`              | operador, admin | ✅                           |
| PUT/DELETE | `/operacional/lotes-cq/:id`          | operador, admin | ✅                           |
| POST       | `/operacional/lotes-cq/:id/aprovar`  | operador, admin | ✅                           |
| POST       | `/operacional/lotes-cq/:id/rejeitar` | operador, admin | ✅                           |

### 6.10 Operacional — OCR

| Método          | Rota                          | Acesso          | Implementação    |
| --------------- | ----------------------------- | --------------- | ---------------- |
| POST            | `/operacional/ocr-preview`    | operador, admin | ✅ (rate 10/min) |
| GET/POST/DELETE | `/operacional/documentos-ocr` | operador, admin | ✅               |

### 6.11 Operacional — Devoluções

| Método         | Rota                                        | Acesso          | Implementação |
| -------------- | ------------------------------------------- | --------------- | ------------- |
| GET/POST       | `/operacional/devolucoes`                   | operador, admin | ✅            |
| GET/PUT/DELETE | `/operacional/devolucoes/:id`               | operador, admin | ✅            |
| POST           | `/operacional/devolucoes/:id/pdf`           | operador, admin | ✅            |
| GET            | `/operacional/responsaveis-retirada-opcoes` | operador, admin | ✅            |

### 6.12 Conhecimento Operacional

| Método         | Rota                                  | Acesso                          | Implementação |
| -------------- | ------------------------------------- | ------------------------------- | ------------- |
| GET            | `/conhecimento/documentos`            | operador, admin                 | ✅            |
| POST           | `/conhecimento/documentos`            | admin                           | ✅            |
| GET/PUT/DELETE | `/conhecimento/documentos/:id`        | operador(GET)/admin(PUT/DELETE) | ✅            |
| POST           | `/conhecimento/documentos/:id/versao` | admin                           | ✅            |
| CRUD           | `/conhecimento/glossario`             | admin(CUD)/operador(R)          | ✅            |
| CRUD           | `/conhecimento/leis-normas`           | admin(CUD)/operador(R)          | ✅            |

### 6.13 Comunicados

| Método | Rota                                   | Acesso | Implementação |
| ------ | -------------------------------------- | ------ | ------------- |
| GET    | `/comunicados`                         | todos  | ✅            |
| PATCH  | `/comunicados/:id/lido`                | todos  | ✅            |
| GET    | `/comunicados/nao-lidos`               | todos  | ✅            |
| GET    | `/admin/comunicados`                   | admin  | ✅            |
| POST   | `/admin/comunicados`                   | admin  | ✅            |
| POST   | `/admin/comunicados/:id/publicar`      | admin  | ✅            |
| POST   | `/admin/comunicados/:id/encerrar`      | admin  | ✅            |
| PUT    | `/admin/comunicados/:id`               | admin  | ✅            |
| DELETE | `/admin/comunicados/:id`               | admin  | ✅            |
| GET    | `/admin/comunicados/:id/destinatarios` | admin  | ✅            |

### 6.14 Admin (`admin.ts`)

| Método | Rota                                   | Acesso | Implementação |
| ------ | -------------------------------------- | ------ | ------------- |
| GET    | `/admin/colaboradores-legado`          | admin  | ✅            |
| GET    | `/admin/vincular-producoes/stats`      | admin  | ✅            |
| POST   | `/admin/limpar-duplicatas-producao`    | admin  | ✅            |
| POST   | `/admin/limpar-duplicatas-recebimento` | admin  | ✅            |
| POST   | `/admin/recontar-producao`             | admin  | ✅            |
| POST   | `/admin/otimizar-banco`                | admin  | ✅            |
| GET    | `/admin/ausencias`                     | admin  | ✅            |
| POST   | `/admin/ausencias/:id/aprovar`         | admin  | ✅            |
| POST   | `/admin/ausencias/:id/rejeitar`        | admin  | ✅            |
| GET    | `/admin/health-check`                  | admin  | ✅            |

### 6.15 Capturas de Mapa

| Método | Rota                                      | Acesso      | Implementação |
| ------ | ----------------------------------------- | ----------- | ------------- |
| POST   | `/colaborador/capturas-mapa`              | colaborador | ✅            |
| GET    | `/colaborador/capturas-mapa`              | colaborador | ✅            |
| GET    | `/colaborador/capturas-mapa/:id/download` | colaborador | ✅            |
| DELETE | `/colaborador/capturas-mapa/:id`          | colaborador | ✅            |

### 6.16 Push Notifications

| Método | Rota                | Acesso      | Implementação |
| ------ | ------------------- | ----------- | ------------- |
| POST   | `/push/subscribe`   | autenticado | ✅            |
| DELETE | `/push/unsubscribe` | autenticado | ✅            |
| POST   | `/push/test-push`   | admin       | ✅            |

### 6.17 Importações Legado

| Método | Rota                                | Acesso                 | Implementação |
| ------ | ----------------------------------- | ---------------------- | ------------- |
| GET    | `/importacoes-legado`               | operador, admin        | ✅            |
| POST   | `/importacoes-legado/upload`        | operador, admin        | ✅            |
| POST   | `/importacoes-legado/:id/processar` | operador, admin        | ✅            |
| DELETE | `/importacoes-legado/:id`           | operador, admin        | ✅            |
| GET    | `/fontes-importacao`                | operador, admin        | ✅            |
| CRUD   | `/fontes-importacao`                | admin(CUD)/operador(R) | ✅            |

### 6.18 Endpoints Bloqueados (legacy)

Paths que casam `/recebimento/*` ou `/conhecimento/*` retornam **410 GONE** — legado bloqueado explicitamente.

---

## 7. ALINHAMENTO FRONTEND ↔ BACKEND

### 7.1 Consistências confirmadas

| Funcionalidade                        | FE exige        | BE permite                                     | Status                            |
| ------------------------------------- | --------------- | ---------------------------------------------- | --------------------------------- |
| Dashboard                             | todos           | operador/admin (stats) + todos (meu-historico) | ✅ Consistente                    |
| Lançar Produção                       | colaborador     | todos                                          | ✅ BE mais permissivo (aceitável) |
| Meu Histórico                         | colaborador     | todos                                          | ✅ BE mais permissivo (aceitável) |
| Captura de Mapas                      | colaborador     | colaborador                                    | ✅ Consistente                    |
| Produção/Painel                       | operador, admin | operador, admin                                | ✅ Consistente                    |
| Importar Produção                     | operador, admin | operador, admin                                | ✅ Consistente                    |
| Recebimento                           | operador, admin | operador, admin                                | ✅ Consistente                    |
| Controle de Qualidade (consulta)      | operador, admin | operador, admin                                | ✅ Consistente                    |
| Devoluções                            | operador, admin | operador, admin                                | ✅ Consistente                    |
| Base de Conhecimento                  | operador, admin | operador, admin                                | ✅ Consistente                    |
| Comunicados (user)                    | todos           | todos                                          | ✅ Consistente                    |
| Relatórios                            | operador, admin | operador, admin                                | ✅ Consistente                    |
| Configurações                         | admin           | admin                                          | ✅ Consistente                    |
| Auditoria (importacoes/ocr/correcoes) | operador, admin | operador, admin                                | ✅ Consistente                    |
| Auditoria (acoes)                     | admin           | admin                                          | ✅ Consistente                    |

### 7.2 Inconsistências identificadas

| #    | Funcionalidade                   | FE                                                        | BE                                       | Problema                                                        |
| ---- | -------------------------------- | --------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| I-01 | Criar lote CQ                    | `RoleRoute ['operador', 'administrador']` — sem distinção | `authorize('administrador')` apenas      | Operador vê o botão "Criar Lote" na UI mas recebe 403 ao tentar |
| I-02 | `capturar_documentos` permission | Permissão nominal atribuída ao `operador`                 | Capturas são exclusivas do `colaborador` | Permissão nominal é enganosa; nunca usada diretamente           |

---

## 8. ALINHAMENTO BACKEND ↔ BANCO DE DADOS

### 8.1 Tabelas principais e seus backends

| Tabela DB                              | Criada em             | Rota Backend                              | Status          |
| -------------------------------------- | --------------------- | ----------------------------------------- | --------------- |
| `usuarios`                             | migration 019         | `colaboradores.ts`, `auth.ts`             | ✅              |
| `repositorios` (recebimento_processos) | migration 022         | `operacional-recebimento.ts`              | ✅              |
| `producao_repositorio`                 | migration 009         | `metas.ts`                                | ✅              |
| `etapas`                               | migration 004         | `configuracao.ts`                         | ✅              |
| `coordenadorias`                       | migration 002         | `configuracao.ts`                         | ✅              |
| `metas_producao`                       | migration 032         | `metas.ts`                                | ✅              |
| `lotes_cq`                             | migration 033         | `operacional-cq.ts`                       | ✅              |
| `checklists`                           | migration 033         | `operacional-recebimento.ts`              | ✅              |
| `auditoria`                            | migration 012         | `auditoria.ts`                            | ✅              |
| `configuracao_empresa`                 | migration 018/064/083 | `configuracao.ts`                         | ✅              |
| `importacoes_legado_operacional`       | migration 038         | `importacoes.ts`                          | ✅              |
| `base_conhecimento_operacional`        | migration 036         | `conhecimento-operacional.ts`             | ✅              |
| `glossario_operacional`                | migration 036         | `conhecimento-operacional.ts`             | ✅              |
| `comunicados`                          | migration 095         | `comunicados.ts`                          | ✅              |
| `devolucoes_operacionais`              | migration 090         | `operacional-devolucoes.ts`               | ✅              |
| `capturas_mapa`                        | migration 093         | `capturas-mapa.ts`                        | ✅              |
| `tipos_ausencia`                       | migration 074         | _sem backend de CRUD_                     | ⚠️ Apenas seeds |
| `ausencias`                            | migration 074         | `admin.ts` (parcial: list/approve/reject) | ⚠️ Sem criação  |
| `push_subscriptions`                   | migration 096         | `push.ts`                                 | ✅              |
| `password_reset_tokens`                | migration 089         | `auth.ts`                                 | ✅              |
| `fontes_importacao`                    | migration 056         | `importacoes.ts`                          | ✅              |
| `projetos`                             | migration 024         | `configuracao.ts`                         | ✅              |

### 8.2 Tabelas órfãs / removidas

| Migrations                          | Ação                                            | Status   |
| ----------------------------------- | ----------------------------------------------- | -------- |
| 013-017 (artigos, tags, categorias) | Criadas e depois **removidas** em migration 072 | ✅ Limpo |
| Migration 039 `drop_orphan_tables`  | Remoção de tabelas legado                       | ✅ Limpo |

### 8.3 Evolução recente do esquema (últimas 15 migrações)

| Migration | Descrição                                      | Impacto                    |
| --------- | ---------------------------------------------- | -------------------------- |
| 082       | Seed inicial de conhecimento                   | Dados iniciais             |
| 083       | Layout do logo em relatórios                   | Configuração empresa       |
| 084       | Adiciona `RECONFERENCIA` ao enum `etapa_fluxo` | Novo valor de etapa        |
| 085       | Logo no banco de dados                         | Empresa                    |
| 086       | Adiciona `ATENDIMENTO` ao enum `etapa_fluxo`   | Novo valor de etapa        |
| 087       | Índice em refresh_tokens                       | Performance                |
| 089       | Tabela `password_reset_tokens`                 | Novo recurso (reset senha) |
| 090       | Tabela `devolucoes_operacionais`               | Novo recurso               |
| 091       | Muda coordenadoria_destino para texto + trgm   | Evolução de campo          |
| 092       | Auditoria de gestão de pessoas                 | Fix/melhoria               |
| 093       | Tabela `capturas_mapa`                         | Novo recurso               |
| 094       | Versionamento de capturas                      | Evolução                   |
| 095       | Tabela `comunicados`                           | Novo recurso               |
| 096       | Tabela `push_subscriptions`                    | Novo recurso (PWA)         |

---

## 9. ANÁLISE POR PERFIL — COLABORADOR

### O que o colaborador acessa

O colaborador tem acesso ao menor conjunto de funcionalidades, focado em:

1. **Dashboard** — versão simplificada com suas próprias estatísticas de produção (contador de registros, distribuição por etapa, histórico recente em tabela)
2. **Lançar Produção** — formulário para registrar quantidade produzida por repositório/etapa/tipo. Cria o órgão (coordenadoria) inline se não existir. Chama `POST /producao/lancar-direto`.
3. **Meu Histórico** — tabela paginada de sua própria produção com filtros por data, etapa e busca textual. Chama `GET /producao/meu-historico`.
4. **Captura de Mapas** — tela para capturar imagens de mapas via câmera/upload, com correção de perspectiva automática ou manual (4 pontos). Chama `POST /colaborador/capturas-mapa`.
5. **Comunicados** — leitura de comunicados publicados, marca como lido. Chama `GET /comunicados`.

### O que o colaborador NÃO acessa

- Painel de produção geral (outros colaboradores)
- Importação de produção legado
- Qualquer tela de Operação (recebimento, CQ, devoluções)
- Base de Conhecimento
- Relatórios
- Configurações
- Auditoria
- Justificativas de Ausência (não existe tela para submeter)

### Avaliação geral do perfil colaborador

**Status: ✅ Funcional com lacuna grave**  
As funcionalidades existentes funcionam corretamente. A lacuna crítica é a **inexistência de tela e endpoint para o colaborador submeter uma justificativa de ausência**.

---

## 10. ANÁLISE POR PERFIL — OPERADOR

### O que o operador acessa

1. **Dashboard** — versão completa com estatísticas operacionais: total em recebimento, CQ, alertas, tempo médio de processamento, backlog por etapa
2. **Produção / Painel** — visão completa de todas as produções com filtros; pode deletar registros individuais e limpar em massa
3. **Produção / Importar** — importação de produção legado via CSV/Excel, com preview, validação, rollback e gestão de fontes
4. **Operação / Recebimento** — gestão completa do recebimento de processos: criar processo, volumes, apensos, OCR de documentos, checklist, avançar etapa, lotes avulsos, batch
5. **Operação / Controle de Qualidade** — consulta de lotes CQ, auditoria de itens, aprovação/rejeição de repositórios (**NÃO pode criar lotes** — apenas admin)
6. **Operação / Devoluções** — CRUD de devoluções + geração de PDF
7. **Base de Conhecimento** — somente leitura de documentos, glossário e leis/normas
8. **Relatórios Gerenciais** — geração de relatórios em JSON/PDF/Excel com filtros de período e coordenadoria
9. **Exportações** — exportação de dados tabulares
10. **Auditoria** — acesso a importações, OCR e correções; **não acessa** "Ações de Usuários"
11. **Comunicados** — leitura de comunicados publicados

### O que o operador NÃO acessa

- Minha Produção (lançamento, histórico individual, captura de mapas)
- Criar lotes de CQ
- Configurações do sistema
- Gestão de usuários
- Auditoria de ações de usuários
- Envio de comunicados
- Qualquer ação de administração (recontar, limpar duplicatas, etc.)

### Avaliação geral do perfil operador

**Status: ✅ Funcional com uma restrição intencional e uma ambiguidade**

- Restrição de criar lotes CQ para admin parece intencional mas pode ser limitante operacionalmente
- A permissão nominal `capturar_documentos` atribuída ao operador nunca é verificada; a funcionalidade pertence ao colaborador

---

## 11. ANÁLISE POR PERFIL — ADMINISTRADOR

### O que o administrador acessa

O administrador tem **acesso completo**, com a adição:

1. Tudo que o operador acessa
2. **Configurações / Empresa** — nome, CNPJ, endereço, logo, configurações de relatório
3. **Configurações / Projetos** — CRUD de projetos de digitalização
4. **Configurações / Usuários** — CRUD de usuários: criar, atualizar perfil/email/nome, ativar/desativar
5. **Configurações / Vincular Produções** — ferramenta para associar registros legados (por nome de texto) a contas de usuário
6. **Configurações / Gestão de Comunicados** — criar, publicar, encerrar e excluir comunicados; segmentar por usuários específicos
7. **Configurações / Justificativas de Ausência** — visualizar, aprovar e rejeitar ausências pendentes
8. **Sistema / Administração** — ações de manutenção: limpar duplicatas (produção e recebimento), recontar produção, otimizar banco, verificar saúde do sistema
9. **Auditoria / Ações de Usuários** — consulta de log de auditoria filtrado por tabela `usuarios`
10. **Criar lotes CQ** — único perfil que pode criar novos lotes de controle de qualidade
11. **CRUD de Base de Conhecimento** — criar, editar e versionar documentos, glossário e leis

### Avaliação geral do perfil administrador

**Status: ✅ Funcional com uma lacuna no módulo de ausências**

- O admin pode aprovar/rejeitar ausências mas **não pode criar** uma ausência para um colaborador
- Não há UI para gerenciar os `tipos_ausencia` (somente seeds do banco)

---

## 12. SEÇÃO DASHBOARD

### Funcionamento

A `DashboardPage` detecta o perfil do usuário autenticado e renderiza conteúdo diferente:

**Colaborador:**

- Consulta `GET /producao/meu-historico` e `GET /producao/desempenho`
- Exibe: total de produções no mês, distribuição por etapa, últimas produções (tabela), animação de contadores (useCountUp)

**Operador e Administrador:**

- Consulta `GET /dashboard`
- Exibe: total em recebimento, total em CQ, tempo médio de processamento, alertas (repositórios parados), backlog por etapa, últimas movimentações

### Alinhamento

- ✅ Frontend correto por perfil
- ✅ Backend implementado
- ✅ Sem erros de tipo (typecheck passou)

### Maturidade: **FUNCIONAL**

---

## 13. SEÇÃO MINHA PRODUÇÃO

### 13.1 Lançar Produção (`/minha-producao/lancar`)

**Funcionalidade:** Colaborador registra sua produção informando: data, repositório, etapa, função, coordenadoria e quantidade.

**Backend:** `POST /producao/lancar-direto` em `metas.ts` — autoriza todos os perfis. Cria o repositório e a coordenadoria se não existirem. Registra em `producao_repositorio`.

**Avaliação:** ✅ Funcional. Criação inline de órgão via `useCriarOrgaoRecebimento` é conveniente.

### 13.2 Meu Histórico (`/minha-producao/historico`)

**Funcionalidade:** Colaborador vê seu histórico de produções com paginação e filtros.

**Backend:** `GET /producao/meu-historico` em `metas.ts` — filtra por `usuario_id = usuário autenticado`.

**Avaliação:** ✅ Funcional.

### 13.3 Captura de Mapas (`/minha-producao/captura-mapa`)

**Funcionalidade:** Colaborador captura imagem via câmera/upload, aplica correção de perspectiva (4 pontos manuais ou auto-detecção), envia para o backend.

**Backend:** `POST /colaborador/capturas-mapa` — aceita base64, valida MIME (jpeg/png/webp), limita a 10MB, aplica perspectiva via sharp, armazena em `uploads/mapas/`.

**Segurança:** Path traversal protection implementada (`resolveUploadPath` valida que o path está dentro de `uploads/`).

**Avaliação:** ✅ Funcional. Implementação bem cuidada.

### Maturidade da seção: **FUNCIONAL**

---

## 14. SEÇÃO PRODUÇÃO (PAINEL OPERADOR/ADMIN)

### 14.1 Painel de Produção (`/producao`)

**Funcionalidade:** Visualização de todos os registros de produção com filtros por período, colaborador, etapa, coordenadoria. Permite deletar registros individuais e realizar limpeza em massa.

**Avaliação:** ✅ Funcional.  
⚠️ **Ação destrutiva acessível para operador** — o operador pode deletar registros de produção sem restrição adicional além do perfil. Dependendo das regras do negócio, essa permissão pode ser excessiva para operadores.

### 14.2 Importar Produção (`/producao/importar`)

**Funcionalidade:** Upload de planilha CSV/Excel de produção legado. Fluxo:

1. Upload do arquivo e seleção da fonte
2. Preview modal com validação de linhas
3. Processamento e registro em `importacoes_legado_operacional`
4. Possibilidade de rollback (desfazer importação)

**Backend:** `operacional-importacoes.ts` (via `operacional.ts`) + `fontes-importacao.ts`

**Avaliação:** ✅ Funcional. Bem implementado com preview e rollback.

### Maturidade da seção: **FUNCIONAL**

---

## 15. SEÇÃO OPERAÇÃO — RECEBIMENTO

### Funcionamento

`EtapaOperacionalPage` com slug `recebimento` renderiza o painel de recebimento. Inclui:

- **RecebimentoAvulsosPanel** — criação de processos avulsos (sem protocolo formal) e batch
- **ChecklistModal** — checklist antes de avançar etapa
- **AvancarEtapaModal** — confirmação com checklist obrigatório para avançar repositório
- **RecebimentoOcrModal** — upload e OCR de documentos do repositório (chama serviço Python)
- **BatchAddModal** — adição em lote de repositórios
- **PdfPreviewModal** — visualização de PDF de documentos

**Fluxo:** Status inicial `RECEBIDO`. Avança para `EM_PREPARACAO` com checklist.

**Backend:** `operacional-recebimento.ts` — GET/POST/PUT/DELETE de processos, volumes, apensos, checklists, avulsos

**OCR:** Rate limitado a 10/min, suporta preview antes de salvar.

**Avaliação:** ✅ Funcional e bem implementado.

### Maturidade da seção: **FUNCIONAL**

---

## 16. SEÇÃO OPERAÇÃO — CONTROLE DE QUALIDADE

### Funcionamento

`EtapaOperacionalPage` com slug `controle-qualidade` renderiza o painel de CQ. Inclui:

- Listagem de lotes CQ com status (ABERTO, EM_AUDITORIA, CONCLUIDO)
- `ControleQualidadePanel` — auditoria de repositórios por documento, aprovação/rejeição
- Pode retornar repositório para recebimento sem checklist (migration 078)

**Fluxo:** Status `AGUARDANDO_CQ_LOTE` → `EM_CQ` → `CQ_APROVADO` ou `CQ_REPROVADO`

### Problema identificado

**⚠️ Criar lote CQ restrito a admin:** `POST /operacional/lotes-cq` usa `authorize('administrador')`. O operador vê o formulário de criação no frontend (não há ocultação da UI por perfil no `ControleQualidadePanel`), mas a chamada falha com 403.  
**Decisão de negócio necessária:** Operador deve poder criar lotes CQ?

**Avaliação:** ✅ Funcional para admin. ⚠️ Operador tem UI habilitada mas backend nega.

### Maturidade da seção: **FUNCIONAL (com restrição de perfil a esclarecer)**

---

## 17. SEÇÃO OPERAÇÃO — DEVOLUÇÕES

### Funcionamento

`DevolucoesPage` — CRUD completo de devoluções operacionais:

- Criar devolução com: coordenadoria destino, responsável pela retirada, data, observações
- Adicionar itens (repositório, órgão, protocolo, interessado, volume, obs)
- Vincular ao recebimento original (opcional)
- Gerar PDF do termo de devolução
- Autocomplete de responsável via `GET /operacional/responsaveis-retirada-opcoes`

**Backend:** `operacional-devolucoes.ts` — CRUD + PDF (pdfkit)

**DB:** `devolucoes_operacionais` + `devolucao_operacional_itens` (migration 090+091)

**Avaliação:** ✅ Funcional e bem implementado.

### Maturidade da seção: **FUNCIONAL**

---

## 18. SEÇÃO BASE DE CONHECIMENTO

### Funcionamento

`ConhecimentoOperacionalPage` — 3 abas:

1. **Documentos** — CRUD com categorias (MANUAIS, PROCEDIMENTOS_ETAPA, CHECKLISTS_EXPLICADOS, NORMAS_LEIS, ATUALIZACOES_PROCESSO), nível de acesso (OPERADOR_ADMIN, ADMIN), editor Markdown, versionamento
2. **Glossário** — CRUD de termos/definições
3. **Leis e Normas** — CRUD de leis com referências

**Permissões:** Admin cria/edita/versiona; Operador somente lê.

**Backend:** `conhecimento-operacional.ts` — CRUD completo com autorização diferenciada

**DB:** Migration 036 + 082 (seed inicial) + 058 (full-text search) + 069 (FK deferrable)

### Observação

As etapas listadas no frontend para o filtro de "Procedimentos por Etapa" são 7 (RECEBIMENTO, PREPARACAO, DIGITALIZACAO, CONFERENCIA, MONTAGEM, CONTROLE_QUALIDADE, ENTREGA), mas o enum `etapa_fluxo` no DB tem 10 valores: faltam RECONFERENCIA, DIGITALIZACAO_COLORIDA e ATENDIMENTO na lista de filtros do frontend.

**Avaliação:** ✅ Funcional. Lacuna menor nos filtros de etapa.

### Maturidade da seção: **FUNCIONAL**

---

## 19. SEÇÃO COMUNICADOS

### 19.1 Vista do Usuário (`/comunicados`) — Todos os perfis

**Funcionalidade:** Lista de comunicados publicados com filtros por status e prioridade. Marcação de leitura individual. Contador de não lidos no ícone do menu.

**Backend:** `GET /comunicados`, `PATCH /comunicados/:id/lido`, `GET /comunicados/nao-lidos`

**Avaliação:** ✅ Funcional.

### 19.2 Gestão Admin (`/configuracoes/comunicados`) — Só admin

**Funcionalidade:** Ciclo de vida completo:

- Criar rascunho (RASCUNHO)
- Publicar com escopo TODOS ou USUARIOS_ESPECIFICOS (com seleção de usuários)
- Encerrar (ENCERRADO)
- Excluir rascunhos/encerrados
- Visualizar lista de destinatários e status de leitura

**Prioridades:** BAIXA, MEDIA, ALTA  
**Backend:** `comunicados.ts` com routes admin

**Avaliação:** ✅ Funcional.

### Maturidade da seção: **FUNCIONAL**

---

## 20. SEÇÃO RELATÓRIOS

### 20.1 Relatórios Gerenciais (`/relatorios/gerenciais`)

**Funcionalidade:** Geração de relatórios com filtros de período, coordenadoria, etapa, tipo. Formatos: visualização na tela (JSON), PDF, Excel.

**Backend:** `GET /relatorios` com param `formato=json|pdf|excel` e `tipo=gerencial|...`. Único endpoint que serve os três formatos.

**Avaliação:** ✅ Funcional.

### 20.2 Exportações (`/relatorios/exportacoes`)

**Funcionalidade:** Exportação de dados tabulares (processos, produções, repositórios) em Excel.

**Avaliação:** ✅ Funcional.

### Maturidade da seção: **FUNCIONAL**

---

## 21. SEÇÃO CONFIGURAÇÕES — EMPRESA

### Funcionamento

`EmpresaPage` — gerencia:

- Dados cadastrais: nome, CNPJ, endereço, telefone, email
- Logo: upload (multipart), remoção, preview
- Configurações de relatório: exibir logo/endereço/contato, largura do logo, alinhamento (ESQUERDA/CENTRO/DIREITA), deslocamento Y

**Backend:** `GET/PUT /configuracao/empresa`, `POST/DELETE /configuracao/empresa/logo`

**DB:** Migration 018 (criação) + 064 (normalização) + 083 (logo layout) + 085 (logo in DB)

**Avaliação:** ✅ Funcional.

### Maturidade da seção: **FUNCIONAL**

---

## 22. SEÇÃO CONFIGURAÇÕES — PROJETOS

### Funcionamento

`ProjetosPage` — CRUD de projetos de digitalização associados a coordenadorias e etapas.

**Backend:** `configuracao.ts`

**Avaliação:** ✅ Funcional (baseado em análise do bundle — não lido linha a linha).

### Maturidade da seção: **FUNCIONAL**

---

## 23. SEÇÃO CONFIGURAÇÕES — USUÁRIOS

### Funcionamento

`UsuariosPage` — CRUD de usuários:

- Listar com filtro por busca e perfil
- Criar (nome, email, perfil, senha temporária)
- Editar (nome, email, perfil)
- Ativar/Desativar

### Inconsistência de campo identificada

A interface local `Usuario` em `UsuariosPage.tsx` usa o campo `papel: string` (compatível com formato legado que usava `'ADMIN'`). O tipo compartilhado usa `perfil: PerfilUsuario`. A função `formatarPapel` converte `'ADMIN'` para `'Administrador'` como fallback legado.

```typescript
// Local (UsuariosPage.tsx)
interface Usuario {
  papel: string; // campo legado — API retorna 'colaborador'|'operador'|'administrador'
}
function formatarPapel(papel: string): string {
  if (papel === 'ADMIN') return 'Administrador'; // fallback que nunca deve ocorrer
  ...
}
```

Isso indica que em algum momento o backend retornava `'ADMIN'` em uppercase (possivelmente antes da migration 035). O banco atual nunca retorna `'ADMIN'`, então esse fallback é código morto mas não causa bug.

**Avaliação:** ✅ Funcional. Código morto de legado (sem impacto operacional).

### Maturidade da seção: **FUNCIONAL**

---

## 24. SEÇÃO CONFIGURAÇÕES — VINCULAR PRODUÇÕES

### Funcionamento

`VincularProducoesPage` — ferramenta de migração de dados legados:

- Lista colaboradores do sistema legado (registros por `marcadores->>'colaborador_nome'` texto livre)
- Permite vincular um nome legado a uma conta de usuário
- Migra registros de produção históricos para o novo usuário

**Backend:** `GET /admin/colaboradores-legado`, `POST /admin/vincular-producoes`

**Avaliação:** ✅ Funcional. Ferramenta de uso pontual/único — pode ser desativada após a migração completa.

### Maturidade da seção: **FUNCIONAL (utilitário de migração)**

---

## 25. SEÇÃO CONFIGURAÇÕES — GESTÃO DE COMUNICADOS

Descrita em §19.2.

### Maturidade da seção: **FUNCIONAL**

---

## 26. SEÇÃO CONFIGURAÇÕES — JUSTIFICATIVAS DE AUSÊNCIA

### Funcionamento atual

`AusenciasPage` — visão administrativa:

- Lista todas as ausências com filtros (status, usuário, busca, tipo, período)
- Detalhe expandido de cada ausência
- Aprovar ausência pendente (com observação opcional)
- Rejeitar ausência pendente (com motivo obrigatório)

**Backend disponível:**

- `GET /admin/ausencias` — lista com filtros
- `POST /admin/ausencias/:id/aprovar` — aprovação
- `POST /admin/ausencias/:id/rejeitar` — rejeição

### Lacunas críticas do módulo

**Lacuna 1 — Sem submissão pelo colaborador**  
Não existe endpoint `POST /ausencias` para que um colaborador registre sua própria ausência. A tabela `ausencias` no banco tem o campo `criado_por UUID REFERENCES usuarios(id)` e `status = 'pendente'` como padrão, claramente projetada para receber registros de usuários. Mas o fluxo de submissão **nunca foi implementado** no backend nem no frontend.

**Lacuna 2 — Sem criação manual pelo admin**  
O admin também não pode criar uma ausência manualmente para um colaborador.

**Lacuna 3 — Sem gestão de tipos de ausência**  
A tabela `tipos_ausencia` tem 12 tipos pré-populados via seed (migration 074) mas não há CRUD de gerenciamento. O admin não consegue criar, editar ou desativar tipos.

**Lacuna 4 — Sem notificação**  
Não há integração com push notifications para avisar o usuário quando sua ausência é aprovada ou rejeitada.

**Avaliação:** ❌ Módulo incompleto. Infraestrutura de DB e UI admin existem, mas o fluxo principal (usuário → submete → admin aprova) está pela metade.

### Maturidade da seção: **INCOMPLETA (alta prioridade)**

---

## 27. SEÇÃO SISTEMA / ADMINISTRAÇÃO

### Funcionamento

`AdminPage` (`/configuracoes/admin`, menu "Sistema") — ações de manutenção destrutivas com confirmação:

| Ação                             | Endpoint                                    | Retorno            | Observação         |
| -------------------------------- | ------------------------------------------- | ------------------ | ------------------ |
| Limpar duplicatas de produção    | `POST /admin/limpar-duplicatas-producao`    | `{ removidos: N }` | Irreversível       |
| Limpar duplicatas de recebimento | `POST /admin/limpar-duplicatas-recebimento` | `{ removidos: N }` | Irreversível       |
| Recontar produção                | `POST /admin/recontar-producao`             | `{ total: N }`     | Pode demorar       |
| Otimizar banco                   | `POST /admin/otimizar-banco`                | `{ tabelas: [] }`  | ANALYZE em tabelas |
| Verificação de saúde             | `GET /admin/health-check`                   | status detalhado   | —                  |

Todas as ações usam `ConfirmDialog` antes de executar. A ação de otimizar banco registra entrada na tabela `auditoria`.

**Avaliação:** ✅ Funcional. Ações destrutivas têm confirmação adequada.

### Maturidade da seção: **FUNCIONAL**

---

## 28. SEÇÃO AUDITORIA

### Funcionamento

`AuditoriaPage` — página unificada com 4 categorias:

| Categoria     | Tabelas filtradas                                     | Perfil          |
| ------------- | ----------------------------------------------------- | --------------- |
| `importacoes` | `importacoes_legado_operacional`, `fontes_importacao` | operador, admin |
| `ocr`         | `documentos_ocr`, `recebimento_documentos`            | operador, admin |
| `correcoes`   | `producao_repositorio`                                | operador, admin |
| `acoes`       | `usuarios`                                            | **admin only**  |

**Roteamento:** Cada subcategoria tem rota explícita definida no router com `RoleRoute` adequado:

- `/auditoria/importacoes` → operador+admin
- `/auditoria/ocr` → operador+admin
- `/auditoria/correcoes` → operador+admin
- `/auditoria/acoes` → **admin only**

O componente recebe `categoria` como prop — não depende de `useLocation` para determinar a categoria.

**Backend:** `GET /auditoria` com filtros `tabela`, `operacao`, `dataInicio`, `dataFim`, `usuarioId`  
`GET /auditoria/estatisticas` — contagens agregadas

**DB:** Tabela `auditoria` populada automaticamente por triggers em todas as tabelas principais. Migration 057 adicionou política de retenção e índices. Migration 061 adicionou FK para `usuarios`. Migration 068 adicionou índice por `(tabela, data)`.

**Avaliação:** ✅ Funcional e bem estruturado. Auditoria automática via triggers é uma implementação sólida.

### Maturidade da seção: **FUNCIONAL**

---

## 29. FUNCIONALIDADES DE BACKEND SEM INTERFACE DEDICADA

### 29.1 Metas de Produção

**Backend:** `GET/POST /producao/metas` (admin cria, todos leem), `DELETE /producao/mapeamentos/:id`  
**Frontend:** Nenhuma página dedicada para CRUD de metas. Os dados de meta aparecem no `GET /producao/desempenho` (percentual de meta atingido), mas o admin não tem como gerenciar as metas pela interface.

**Status:** ⚠️ Backend implementado, sem UI de gerenciamento.

### 29.2 Mapeamentos de Produção

**Backend:** `GET/POST/DELETE /producao/mapeamentos` — templates para normalizar nomes de colaboradores legados  
**Frontend:** Não encontrada página dedicada; pode ser exposta como parte de Vincular Produções.

**Status:** ⚠️ Backend implementado, UI parcial ou inexistente.

### 29.3 Health Check

**Backend:** `GET /admin/health-check` — verificação abrangente  
**Frontend:** `AdminPage` pode ter acesso via utilitário, mas não vi UI explícita para exibir o relatório detalhado.

**Status:** ℹ️ Funcional como API; exposição na UI pode ser parcial.

### 29.4 Desempenho por Colaborador

**Backend:** `GET /producao/desempenho` — ranking de colaboradores por produção vs. meta  
**Frontend:** Exibido no Dashboard do colaborador mas não há painel admin dedicado ao ranking de desempenho de equipe.

**Status:** ⚠️ Funcionalidade parcialmente exposta.

---

## 30. PWA E PUSH NOTIFICATIONS

### Estado do PWA

- `vite-plugin-pwa` configurado com `injectManifest` (custom service worker)
- `dist/sw.js` gerado com 82 entradas de precache (1.76 MiB)
- `manifest.webmanifest` com ícones, tema e display standalone
- Service worker em `packages/frontend/src/sw.ts`

### Push Notifications

- Backend: migration 096 criou `push_subscriptions`; `push.ts` tem subscribe/unsubscribe/test-push
- Frontend: `usePwaNotifications.ts` hook para gerenciamento de permissão e subscrição
- `POST /push/subscribe` — salva subscription do browser
- `POST /push/test-push` — admin pode testar envio

**Integração:** A lógica de envio de push ao publicar comunicado não está no arquivo `comunicados.ts` — o push pode ser enviado diretamente pelo serviço de push ou via chamada separada.

**Avaliação:** ✅ Estrutura PWA completa. Push notifications implementado mas integração com eventos do sistema pode ser incompleta (ex: não identificada chamada a push ao aprovar ausência, ao publicar comunicado, etc.).

### Maturidade: **ESTRUTURA FUNCIONAL, INTEGRAÇÃO PARCIAL**

---

## 31. CLASSIFICAÇÃO DE MATURIDADE POR SEÇÃO

| Seção                                     | Maturidade        | Observação                                      |
| ----------------------------------------- | ----------------- | ----------------------------------------------- |
| Autenticação (login/logout/refresh/reset) | ✅ MADURA         | Completa e segura                               |
| Dashboard                                 | ✅ MADURA         | Diferenciado por perfil                         |
| Lançar Produção                           | ✅ MADURA         | —                                               |
| Meu Histórico                             | ✅ MADURA         | —                                               |
| Captura de Mapas                          | ✅ MADURA         | Perspectiva automática/manual                   |
| Produção / Painel                         | ✅ FUNCIONAL      | —                                               |
| Produção / Importar                       | ✅ MADURA         | Preview + rollback                              |
| Operação / Recebimento                    | ✅ MADURA         | OCR, checklist, batch                           |
| Operação / CQ                             | ⚠️ FUNCIONAL      | Criar lote: admin only; operador tem UI mas 403 |
| Operação / Devoluções                     | ✅ MADURA         | CRUD + PDF                                      |
| Base de Conhecimento                      | ✅ FUNCIONAL      | Filtro de etapas incompleto                     |
| Comunicados (usuário)                     | ✅ MADURA         | —                                               |
| Comunicados (admin)                       | ✅ MADURA         | Ciclo de vida completo                          |
| Relatórios Gerenciais                     | ✅ FUNCIONAL      | —                                               |
| Exportações                               | ✅ FUNCIONAL      | —                                               |
| Configurações / Empresa                   | ✅ MADURA         | —                                               |
| Configurações / Projetos                  | ✅ FUNCIONAL      | —                                               |
| Configurações / Usuários                  | ✅ FUNCIONAL      | Campo `papel` é código morto mas sem impacto    |
| Configurações / Vincular Produções        | ✅ MADURA         | Ferramenta pontual de migração                  |
| Sistema / Administração                   | ✅ FUNCIONAL      | Ações destrutivas com confirmação               |
| Auditoria                                 | ✅ MADURA         | Triggers automáticos, sub-rotas corretas        |
| **Justificativas de Ausência**            | ❌ **INCOMPLETA** | Fluxo de submissão ausente                      |
| Metas de Produção                         | ⚠️ BACKEND ONLY   | Sem UI de gerenciamento                         |
| Push Notifications                        | ⚠️ ESTRUTURAL     | Integração com eventos incompleta               |

---

## 32. PROBLEMAS ENCONTRADOS

### 🔴 CRÍTICOS

Não foram encontrados problemas que tornem o sistema completamente inoperante ou que representem falha de segurança ativa. `npm run typecheck` e `npm run build` passaram sem erros.

### 🟠 ALTOS

**[A-01] Módulo de Ausências com fluxo incompleto**

- **Descrição:** A tabela `ausencias`, os tipos, a UI admin e os endpoints de aprovação/rejeição existem. Porém não há `POST /ausencias` (colaborador submete) nem `POST /admin/ausencias` (admin cria manualmente). O módulo é funcional **somente na metade final do fluxo**.
- **Impacto:** Nenhum colaborador pode registrar uma ausência; nenhuma ausência nunca estará em estado `pendente` para o admin aprovar/rejeitar. A tela `AusenciasPage` sempre mostrará lista vazia.
- **Arquivos:** `db/migrations/074_gestao_pessoas.sql`, `packages/backend/src/infrastructure/http/routes/admin.ts`, `packages/frontend/src/pages/configuracoes/AusenciasPage.tsx`

**[A-02] Feature de criação de Lote CQ incompleta no frontend (diagnóstico anterior desatualizado)**

- **Descrição:** O diagnóstico anterior afirmava que `ControleQualidadePanel` exibia um botão "Criar Lote" sem verificação de perfil, causando 403 para operadores. Análise do código atual (2026-05-25) mostra que isso não ocorre: o botão de criação de Lote CQ **não existe** em nenhum componente renderizado. O hook `useCriarLoteCQ` está implementado e exportado em `useQueries.ts`, mas não é consumido por nenhuma página ou componente. Não há rota frontend dedicada ao gerenciamento de Lotes CQ.
- **Estado atual das regras de negócio:** `administrador` cria e fecha Lotes CQ (`POST /operacional/lotes-cq` e `POST /operacional/lotes-cq/:id/fechar`); `operador` e `administrador` consultam e auditam itens (`GET /operacional/lotes-cq` e `PATCH /operacional/lotes-cq/:id/itens/:itemId`). Essa divisão está corretamente implementada no backend e alinhada com `docs/auditorias/tecnica/DIAGNOSTICO_TECNICO.md`.
- **Impacto real:** Não há bug ativo de permissão nem UX confusa. A funcionalidade de criação de Lote CQ simplesmente não foi exposta na interface. Repositórios em `AGUARDANDO_CQ_LOTE` não podem ser agrupados em lotes pela UI.
- **Arquivos relevantes:** `packages/backend/src/infrastructure/http/routes/operacional-cq.ts` (backend correto), `packages/frontend/src/hooks/useQueries.ts` (hook pronto, não conectado), `packages/frontend/src/pages/operacao/ControleQualidadePanel.tsx` (sem botão de criação)
- **Implementação futura:** Criar UI admin-only em `ControleQualidadePanel` (ou página dedicada) para criação de Lote CQ, usando `useCriarLoteCQ` já existente e protegendo a ação com verificação `isAdmin`. O backend não precisa de alteração.

### 🟡 MÉDIOS

**[M-01] Etapas intermediárias do fluxo sem tela operacional**

- **Descrição:** O enum `etapa_fluxo` tem 10 valores: RECEBIMENTO, PREPARACAO, DIGITALIZACAO, DIGITALIZACAO_COLORIDA, CONFERENCIA, RECONFERENCIA, MONTAGEM, ATENDIMENTO, CONTROLE_QUALIDADE, ENTREGA. O menu de Operação expõe apenas `Recebimento` e `Controle de Qualidade`. As etapas intermediárias (Preparação, Digitalização, Conferência, Montagem, etc.) existem no fluxo de dados mas não têm páginas operacionais dedicadas.
- **Impacto:** Repositórios avançam de etapa via backend mas o operador não tem UI para gerenciar as etapas intermediárias. Navegando para `/operacao/preparacao` o componente `EtapaOperacionalPage` renderiza com um slug sem mapeamento no `ETAPA_MAP`, resultando em estado de erro/vazio.
- **Arquivos:** `packages/frontend/src/pages/operacao/EtapaOperacionalPage.tsx` (ETAPA_MAP), `packages/shared/src/entities/operacional.ts`

**[M-02] Seção "Sistema" com basePath inconsistente**

- **Descrição:** A seção do menu "Sistema" usa `basePath: '/configuracoes/admin'`, fazendo com que tanto "Configurações" quanto "Sistema" apareçam como ativos simultaneamente ao acessar `/configuracoes/admin`. A seção "Conhecimento" tem `basePath: '/operacao/conhecimento'` com o mesmo problema para "Operação" e "Conhecimento".
- **Impacto:** Inconsistência visual no menu lateral — dois itens de seção ficam marcados como ativos.

**[M-03] Sem gestão de `tipos_ausencia` via UI**

- **Descrição:** A tabela `tipos_ausencia` tem 12 tipos populados via seed. Não há endpoint nem UI para criar, editar ou desativar tipos. Ao resolver [A-01], a ausência de gestão de tipos pode se tornar limitante.
- **Impacto:** Médio (por ora não há ausências, então tipos não importam; ao implementar submissão, torna-se relevante).

**[M-04] Filtro de etapas na Base de Conhecimento incompleto**

- **Descrição:** `ConhecimentoOperacionalPage` lista 7 etapas no filtro de "Procedimentos por Etapa" (faltam RECONFERENCIA, DIGITALIZACAO_COLORIDA e ATENDIMENTO).
- **Impacto:** Documentos vinculados a essas etapas podem não aparecer filtrados corretamente.
- **Arquivo:** `packages/frontend/src/pages/operacao/ConhecimentoOperacionalPage.tsx`

**[M-05] Sem UI de gerenciamento de Metas de Produção**

- **Descrição:** `GET/POST /producao/metas` e `DELETE /producao/mapeamentos/:id` existem no backend mas não há página frontend para o admin configurar metas por etapa.
- **Impacto:** O admin não pode alterar metas pela interface; precisaria de acesso direto ao banco.

### 🔵 BAIXOS

**[B-01] Código morto de legado em `UsuariosPage`**

- **Descrição:** O campo `papel: string` (interface local) e a função `formatarPapel` tratam o valor `'ADMIN'` (uppercase) que o backend não mais retorna.
- **Impacto:** Nenhum — é código morto, mas pode confundir desenvolvedores.

**[B-02] Permissão nominal `capturar_documentos` atribuída ao perfil errado**

- **Descrição:** `PERMISSOES_POR_PERFIL.operador` inclui `capturar_documentos`, mas a funcionalidade de Captura de Mapas pertence ao `colaborador`.
- **Impacto:** A permissão nominal nunca é verificada diretamente na prática, então não há bug. Mas é semanticamente incorreto e pode confundir futuras implementações baseadas em `temPermissao()`.
- **Arquivo:** `packages/shared/src/entities/usuario.ts`

**[B-03] Seleção de seção "Conhecimento" redundante no menu**

- **Descrição:** A seção "Conhecimento" tem apenas um item filho que aponta para o mesmo URL que o `basePath` da seção. Poderia ser um link direto ao invés de seção expansível.
- **Impacto:** UX levemente mais verboso.

**[B-04] JWT armazenado em localStorage**

- **Descrição:** O token de acesso é guardado em `localStorage`. Em caso de XSS, o token pode ser roubado. A alternativa mais segura seria `httpOnly cookie`.
- **Impacto:** Risco residual de segurança (OWASP A07 — Identification and Authentication Failures). Mitigado pelo `Content-Security-Policy` se configurado no servidor.
- **Observação:** Esta é uma decisão arquitetural explícita do projeto (comentário no código). Registrado para informação.

**[B-05] Integração push notifications com eventos não confirmada**

- **Descrição:** Não identificada chamada a push ao publicar comunicado, ao aprovar ausência, etc. A estrutura existe mas a integração com eventos de negócio pode estar incompleta.
- **Impacto:** Notificações push podem não ser enviadas em momentos relevantes.

---

## 33. DECISÕES DE REGRAS DE NEGÓCIO PENDENTES

As seguintes questões foram identificadas durante a análise e **não podem ser resolvidas por código sem decisão explícita de regras de negócio**:

### [RN-01] Quem pode submeter uma Justificativa de Ausência?

**Questão:** O colaborador deve poder registrar sua própria ausência pela interface? Ou o fluxo correto é o admin lançar ausências para os colaboradores?  
**Impacto:** Define se é necessário criar endpoint e tela para colaborador submeter ausência, ou se a lógica atual (somente admin aprova/rejeita) é suficiente.

### [RN-02] Operador pode criar Lotes de CQ?

**Questão:** A restrição atual de `POST /operacional/lotes-cq` apenas para administrador é intencional? Ou o operador deve poder criar lotes?  
**Impacto:** Se operador deve criar, é necessário alterar `authorize('administrador')` para `authorize('operador', 'administrador')` e ocultar/mostrar UI conforme perfil.

### [RN-03] Operador pode deletar registros de produção?

**Questão:** No `ProducaoPage`, tanto operador quanto administrador podem deletar registros individuais e realizar limpeza em massa. Isso é intencional?  
**Impacto:** Se deleção deve ser restrita ao admin, é necessário adicionar verificação no backend e ocultar ações na UI para operador.

### [RN-04] As etapas intermediárias (Preparação, Digitalização, etc.) precisam de telas operacionais?

**Questão:** O fluxo operacional atual usa somente Recebimento e CQ como pontos com gestão ativa. As etapas intermediárias são registradas via lançamento manual de produção pelos colaboradores ou devem ter telas de gestão dedicadas para o operador?  
**Impacto:** Se necessário, requer criação de `EtapaOperacionalPage` com ETAPA_MAP expandido para cada etapa.

### [RN-05] Metas de produção devem ser gerenciáveis pela interface?

**Questão:** O backend de metas existe completo. O admin deve ter acesso a uma tela para definir metas diárias/mensais por etapa?  
**Impacto:** Se sim, requer criação de página de gerenciamento (provavelmente em Configurações).

### [RN-06] Quem pode receber e enviar comunicados?

**Questão:** O sistema atual envia comunicados para TODOS os usuários ou USUARIOS_ESPECIFICOS. Os colaboradores recebem comunicados? (Sim, pelo código — todos os perfis veem comunicados). Essa é a regra desejada?  
**Impacto:** Nenhum se confirmado; mudança de escopo se necessário restringir.

### [RN-07] O módulo de Vincular Produções ainda é necessário?

**Questão:** Após a migração inicial de dados legados, este módulo se torna obsoleto. Deve ser desativado ou removido?  
**Impacto:** Manutenção desnecessária se migração já foi concluída.

### [RN-08] Fechamento mensal do módulo de Ausências (fase futura)

**Questão:** O módulo atual não implementa o conceito de fechamento mensal de ausências. Deve existir uma operação administrativa para "fechar" o mês de ausências (congelar os registros aprovados para fins de folha de pagamento)?  
**Impacto:** Se necessário, exigiria:

1. Nova tabela `fechamentos_ausencias` (ano, mês, fechado_por, fechado_em, status: `aberto` | `fechado`).
2. Endpoint `POST /admin/ausencias/fechar-mes` (admin-only) que registra o fechamento e bloqueia alterações de status em ausências do período.
3. Endpoint para reabertura por admin, com log de auditoria.
4. Lógica de bloqueio: ausências cujo mês de referência está fechado não podem ser aprovadas, rejeitadas ou canceladas.
5. Relatório oficial de folha exportando somente ausências aprovadas no período fechado.  
   **Estado atual:** Não implementado e sem decisão de negócio. O relatório `GET /relatorios/ausencias` (exportável via CSV) serve como base de dados para fechamento manual externo.  
   **Recomendação:** Implementar somente após validação do fluxo básico com usuários reais e confirmação de que o fechamento mensal é necessário no sistema (vs. planilha externa).

---

## 34. ROADMAP SUGERIDO

Baseado nas lacunas identificadas, em ordem de prioridade:

### Prioridade 1 — Correções de Inconsistência (sem decisão de negócio necessária)

1. **[B-02]** Corrigir `capturar_documentos` permission: mover de `operador` para `colaborador` em `PERMISSOES_POR_PERFIL`
2. **[M-04]** Completar lista de etapas em `ConhecimentoOperacionalPage` (adicionar RECONFERENCIA, DIGITALIZACAO_COLORIDA, ATENDIMENTO)
3. **[B-01]** Remover código legado `papel === 'ADMIN'` de `UsuariosPage`

### Prioridade 2 — Aguardam decisão de negócio (ver §33)

4. **[RN-02 + A-02]** Decidir e implementar: operador pode criar lotes CQ? → Ocultar UI ou liberar endpoint
5. **[RN-01 + A-01]** Decidir e implementar fluxo completo de Ausências: submissão de colaborador + ou criação pelo admin

### Prioridade 3 — Melhorias de UX

6. **[M-02]** Corrigir basePaths do menu para "Sistema" e "Conhecimento" (evitar dupla seleção)
7. **[M-05 + RN-05]** Criar página de gerenciamento de Metas de Produção se aprovado
8. **[M-03]** Criar CRUD de `tipos_ausencia` no admin (necessário junto com [A-01])

### Prioridade 4 — Funcionalidades novas

9. **[RN-04]** Decidir e eventualmente implementar telas para etapas intermediárias
10. **[B-05]** Integrar push notifications com eventos de negócio (publicação de comunicado, aprovação de ausência)
11. **[RN-08]** Avaliar e implementar fechamento mensal de ausências (ver §33 [RN-08])

### Prioridade 5 — Segurança e Manutenção

11. **[B-04]** Avaliar migração de JWT para httpOnly cookie (breaking change — requer planejamento)
12. **[RN-07]** Avaliar desativação do módulo Vincular Produções se migração legada estiver concluída

---

## 35. CONFIRMAÇÃO DE INTEGRIDADE

### Arquivos verificados (leitura)

- `packages/frontend/src/config/menu.ts`
- `packages/frontend/src/routes/index.tsx`
- `packages/frontend/src/contexts/AuthContext.tsx`
- `packages/frontend/src/hooks/useQueries.ts`
- `packages/frontend/src/pages/Dashboard.tsx`
- `packages/frontend/src/pages/auditoria/AuditoriaPage.tsx`
- `packages/frontend/src/pages/operacao/EtapaOperacionalPage.tsx`
- `packages/frontend/src/pages/operacao/ConhecimentoOperacionalPage.tsx`
- `packages/frontend/src/pages/operacao/DevolucoesPage.tsx`
- `packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx`
- `packages/frontend/src/pages/configuracoes/AusenciasPage.tsx`
- `packages/frontend/src/pages/configuracoes/ComunicadosPage.tsx`
- `packages/frontend/src/pages/configuracoes/EmpresaPage.tsx`
- `packages/frontend/src/pages/configuracoes/UsuariosPage.tsx`
- `packages/frontend/src/pages/configuracoes/AdminPage.tsx`
- `packages/backend/src/infrastructure/http/server.ts`
- `packages/backend/src/infrastructure/http/routes/admin.ts`
- `packages/backend/src/infrastructure/http/routes/auditoria.ts`
- `packages/backend/src/infrastructure/http/routes/comunicados.ts`
- `packages/backend/src/infrastructure/http/routes/relatorios.ts`
- `packages/backend/src/infrastructure/http/routes/conhecimento-operacional.ts`
- `packages/backend/src/infrastructure/http/routes/capturas-mapa.ts`
- `packages/backend/src/infrastructure/http/routes/operacional-cq.ts`
- `packages/backend/src/infrastructure/http/routes/operacional-devolucoes.ts`
- `packages/backend/src/infrastructure/http/routes/metas.ts`
- `packages/shared/src/entities/usuario.ts`
- `packages/shared/src/entities/operacional.ts`
- `db/migrations/033_fluxo_operacional_repositorios.sql`
- `db/migrations/074_gestao_pessoas.sql`
- `db/migrations/090_devolucoes_operacionais.sql`
- `db/migrations/095_comunicados_internos.sql`
- E diversas buscas por padrão de texto em todo o workspace

### Comandos executados (somente leitura)

```
npm run typecheck    → PASSOU (0 erros em todos os workspaces)
npm run build        → PASSOU (469 módulos, sem warnings de TS ou Vite)
```

### ✅ CONFIRMAÇÃO FORMAL

**Nenhum arquivo do projeto foi criado, modificado ou excluído durante esta análise.**  
O unico arquivo criado foi o presente relatorio de diagnostico, em `docs/auditorias/tecnica/DIAGNOSTICO_COMPLETO_SISTEMA_RECORDA.md`.

---

_Relatório gerado por análise estática completa do repositório. Versão: 1.0_
