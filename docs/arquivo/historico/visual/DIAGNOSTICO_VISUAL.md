# Diagnóstico Visual Completo do Sistema

> **Data:** Maio 2026 | **Escopo:** `packages/frontend/` | **Versão:** @recorda/frontend 0.1.0  
> **Instrução:** Documento de leitura/análise — nenhum arquivo foi alterado.

---

## 1. Visão Geral Visual do Sistema

### Proposta Visual

O Recorda é um sistema de gestão documental e controle de produção com interface **administrativa desktop-first com suporte mobile via PWA**. A proposta visual é **minimalista e sofisticada**, declarada explicitamente no próprio arquivo de tokens:

> _"Design System moderno, fino e elegante. Inspirado em: Linear, Vercel, Stripe"_

### Identidade Visual Predominante

- **Cor primária:** Azul índigo (`#444ce7` / `--color-primary-600`) — fria, corporativa, confiável
- **Fundo geral:** `bg-gray-50` (`#f9fafb`) — cinza muito claro, evita branco puro
- **Superfícies:** Cards brancos com bordas `border-gray-200` e sombra sutil
- **Tipografia:** Inter (variável), corpo em 14px (`--font-size-base: 0.875rem`)
- **Login:** Fundo dramático `gradient-to-br from-slate-900 via-blue-900 to-slate-900` — único elemento com personalidade mais forte

### Consistência Visual Geral

**Alta consistência** no núcleo do sistema (componentes UI). **Inconsistências pontuais** em páginas mais recentes e no componente `Dashboard.tsx` genérico, que parece ter sido adicionado posteriormente com padrões diferentes.

**Perfil da interface:** Administrativo/operacional, desktop-first, com adaptação mobile funcional via bottom nav + sidebar overlay.

---

## 2. Estrutura Visual do Projeto

### Mapa de Arquivos Visuais

| Diretório / Arquivo                      | Responsabilidade                            | Impacto Visual                                       |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| `src/styles/design-tokens.css`           | Variáveis CSS de todo o design system       | **CRÍTICO** — altera todo o visual se modificado     |
| `src/index.css`                          | Base: importa tokens, Tailwind, resets      | **CRÍTICO** — ponto de entrada do CSS                |
| `tailwind.config.js`                     | Config Tailwind (mínima)                    | Médio — sem extensões customizadas                   |
| `src/components/ui/`                     | ~20 componentes base reutilizáveis          | **CRÍTICO** — usados em todas as telas               |
| `src/components/layout/`                 | AppLayout, Sidebar, Header, MobileBottomNav | **CRÍTICO** — estrutura de todas as páginas internas |
| `src/components/dashboard/Dashboard.tsx` | Widget dashboard genérico                   | Baixo — uso isolado                                  |
| `src/pages/`                             | ~15 telas distribuídas em 8 módulos         | Alto                                                 |
| `src/config/menu.ts`                     | Definição do menu lateral e navegação       | Alto — controla o que o usuário vê                   |
| `public/`                                | Assets estáticos: ícones PWA, favicon       | Baixo                                                |
| `assets/`                                | `logo-icon.png`, `logo.jpeg`                | Médio                                                |

### Componentes por Categoria

**UI base** (`src/components/ui/`):

```
ActionMenu.tsx     AgingBadge.tsx    Alert.tsx         Badge.tsx
Button.tsx         Card.tsx          ConfirmDialog.tsx  ErrorBoundary.tsx
Icon.tsx           Input.tsx         LoadingSpinner.tsx  MarkdownEditor.tsx
PageState.tsx      Pagination.tsx    ProgressIndicator.tsx
RouteErrorFallback.tsx  Skeleton.tsx   StatusBadge.tsx   Toast.tsx
index.ts
```

**Layout** (`src/components/layout/`):

- `AppLayout.tsx` — Wrapper principal com grid sidebar + content
- `Sidebar.tsx` — Menu lateral colapsável (~350 linhas)
- `Header.tsx` — Cabeçalho com breadcrumbs e título mobile
- `MobileBottomNav.tsx` — Navegação inferior para mobile

**Dashboard** (`src/components/dashboard/`):

- `Dashboard.tsx` — Componente genérico de widgets com Recharts

**Auth** (`src/components/auth/`):

- `ProtectedRoute.tsx`, `RoleRoute.tsx`

---

## 3. Stack Visual e Bibliotecas de UI

### Framework e Dependências

| Item              | Tecnologia                                             | Versão |
| ----------------- | ------------------------------------------------------ | ------ |
| Framework UI      | React                                                  | 18     |
| Estilização       | Tailwind CSS + CSS Variables                           | 3.x    |
| Ícones            | SVG inline próprio (`Icon.tsx`)                        | —      |
| Gráficos          | Recharts                                               | —      |
| Tabelas           | Nativo (HTML table + classes Tailwind)                 | —      |
| Formulários       | Controlados (useState + validação manual)              | —      |
| Modal/Dialog      | Componente próprio (`ConfirmDialog.tsx`)               | —      |
| Toast             | Componente próprio (`Toast.tsx` + Context)             | —      |
| Calendário / Date | Input date nativo + utilitários próprios               | —      |
| Upload            | Input file nativo + FormData                           | —      |
| Markdown          | `MarkdownEditor.tsx` próprio com preview               | —      |
| PWA               | `vite-plugin-pwa` (Workbox)                            | —      |
| Animações         | Tailwind utilities (`transition-all`, `animate-pulse`) | —      |

### Design System: Próprio ou Biblioteca?

**Design system próprio, bem estruturado.** Não há dependência de Ant Design, MUI, Chakra ou similar. O sistema tem:

- Tokens centralizados em `design-tokens.css` com CSS variables completas
- Escala de cores com 11 tonalidades por cor semântica
- Sistema tipográfico com classes utilitárias (`.text-display`, `.text-heading`, `.text-body`)
- Escala de espaçamento em 4px, bordas, sombras e z-index documentados

**Risco:** Tailwind configurado com `theme.extend: {}` vazio — os tokens CSS não estão mapeados como utilidades Tailwind. Componentes usam `bg-[var(--color-primary-600)]` (sintaxe de valor arbitrário) em vez de `bg-primary-600`. Funciona, mas é verboso e não aparece em autocomplete.

---

## 4. Mapeamento das Telas Principais

### Módulo: Autenticação

#### `/login` — LoginPage

- **Arquivo:** `src/pages/LoginPage.tsx` (inferido — existe como `Login.tsx`)
- **Objetivo:** Autenticação do usuário
- **Layout:** Página isolada, sem AppLayout
- **Componentes:** `Input`, `Button` (fullWidth, loading), `Alert`
- **Dados:** email + senha + rememberMe
- **Ações:** Login, link para "Esqueci a senha"
- **Visual forte:** Fundo gradiente escuro slate/blue — cria contraste forte com o card branco central
- **Visual frágil:** Logo circular `160×160px` pode parecer grande em telas pequenas; ausência de divider visual entre logo e form
- **Inconsistência:** Único uso de `gradient-to-br from-slate-900` — outras páginas usam `bg-gray-50`

#### `/forgot-password`, `/reset-password`

- **Arquivos:** `src/pages/ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`
- **Objetivo:** Recuperação de senha
- **Visual:** Presume mesmo padrão da LoginPage (não verificado em detalhe)

---

### Módulo: Dashboard

#### `/dashboard` — Dashboard principal

- **Arquivo:** `src/pages/Dashboard.tsx` (como página principal)
- **Componente:** `src/components/dashboard/Dashboard.tsx` (componente genérico de widgets)
- **Objetivo:** Visão geral de métricas de produção
- **Layout:** Grid de stats cards + gráficos
- **Dados:** Stats (total registros, quantidade, últimos 7 dias), gráfico por etapa, gráfico por tipo
- **Gráficos:** Recharts (`LineChart`, `BarChart`, `PieChart` com `Cell`)
- **Visual forte:** Cards de métricas com ícones e números formatados
- **Visual frágil:**
  - `Dashboard.tsx` (componente) usa `fetch()` direto, não o `api.ts` — pode gerar erros sem tratamento adequado em produção
  - `const COLORS = ['#0088FE', '#00C49F', ...]` — paleta de gráficos hardcoded, fora do design system
  - Parece um componente genérico adicionado separadamente do sistema de design

**⚠ Problema real:** O `Dashboard.tsx` em `components/dashboard/` usa `data?: any`, `options?: Record<string, any>`, e `console.error` diretamente. Contrasta com o padrão do restante do sistema.

---

### Módulo: Operação

#### `/operacao/recebimento` e `/operacao/controle-qualidade` — EtapaOperacionalPage

- **Arquivo:** `src/pages/operacao/EtapaOperacionalPage.tsx`
- **Objetivo:** Tela principal da operação — gerenciar repositórios por etapa
- **Componentes:** `Card`, `Button`, `Input`, `PageState`, `StatusBadge`, `ProgressIndicator`, `AgingBadge`, `ActionMenu`, `ConfirmDialog`, `Pagination`
- **Dados:** Lista de repositórios com status, etapa, progresso, processos
- **Ações:** Criar repositório, avançar etapa, abrir checklist, gerar relatório, registrar produção, CRUD de processos
- **Visual forte:** Uso rico de componentes especializados (`ProgressIndicator`, `AgingBadge`)
- **Visual frágil:** Página muito densa — muitos painéis condicionais (`ControleQualidadePanel`, `RecebimentoAvulsosPanel`) podem criar experiência confusa dependendo do estado

#### `/operacao/conhecimento` — ConhecimentoOperacionalPage

- **Arquivo:** `src/pages/operacao/ConhecimentoOperacionalPage.tsx`
- **Objetivo:** Base de conhecimento operacional (artigos, glossário)
- **Componente especial:** `MarkdownEditor.tsx` com preview

---

### Módulo: Colaborador

#### `/minha-producao/lancar` — LancarProducaoPage

- **Arquivo:** `src/pages/colaborador/LancarProducaoPage.tsx`
- **Objetivo:** Formulário para colaborador lançar produção
- **Componentes:** `Card`, `Button`, `Input`, `PageState`, `ActionFeedback`
- **Dados:** data, repositório, etapa, coordenadoria, quantidade, tipo
- **Visual forte:** Formulário simples, focado
- **⚠ Problema real:** O array `etapas` tem **duas entradas com o mesmo `value: 'DIGITALIZACAO'`** (uma para P/B, outra para Colorida). Um `<select>` com dois itens com o mesmo value enviará sempre o mesmo dado. Inconsistência lógico-visual.

```tsx
{ value: 'DIGITALIZACAO', label: 'Digitalização P/B' },    // ← mesmo value
{ value: 'DIGITALIZACAO', label: 'Digitalização Colorida' }, // ← mesmo value
```

#### `/minha-producao/historico` — MeuHistoricoPage

- **Arquivo:** `src/pages/colaborador/MeuHistoricoPage.tsx`
- **Objetivo:** Histórico pessoal de produção com filtros e stats
- **Componentes:** `Card`, `Icon`, `PageState`, `Button`
- **Dados:** Lista de produções, stats por etapa, filtros de data com presets
- **Visual forte:** Presets de período ("hoje", "semana", "mês", "mês anterior") — boa UX
- **⚠ Problema real:** Cores de etapa definidas como objeto `etapaCores` com classes Tailwind hardcoded (`bg-purple-50`, `text-purple-700`, etc.) — fora do design system. Duplicação de chaves com e sem acento (`Digitalização` e `Digitalizacao`, `Conferência` e `Conferencia`).

---

### Módulo: Relatórios

#### `/relatorios/gerenciais` — RelatoriosGerenciaisPage

- **Arquivo:** `src/pages/relatorios/RelatoriosGerenciaisPage.tsx`
- **Objetivo:** Relatório gerencial de produção por período e coordenadoria
- **Componentes:** `Icon`, `Button`, `ActionFeedback`; tabelas nativas
- **Dados:** Filtros data/coordenadoria, tabela de produção por colaborador/etapa
- **Visual frágil:** Usa `Icon` mas não usa `Card` ou `Input` — layout pode parecer menos estruturado que outras páginas
- **Inferência:** Provavelmente imprime/exporta relatório, então evita estilos pesados intencionalmente

#### `/relatorios/exportacoes` — ExportacoesPage

- **Arquivo:** `src/pages/relatorios/ExportacoesPage.tsx`
- **Objetivo:** Download/exportação de dados

---

### Módulo: Configurações

#### `/configuracoes/empresa` — EmpresaPage

- **Arquivo:** `src/pages/configuracoes/EmpresaPage.tsx`
- **Objetivo:** Configurações da empresa, upload de logo, layout de relatórios
- **Componentes:** `Card`, `CardHeader`, `Button`, `Input`, `PageState`, `ActionFeedback`, `ConfirmDialog`, `Icon`
- **Visual forte:** Uso correto de `CardHeader` com title/description, ActionFeedback para feedback inline
- **Visual frágil:** Vários `useEffect` e estados de loading granulares podem criar flash de estados

#### `/configuracoes/usuarios` — UsuariosPage

- **Arquivo:** `src/pages/configuracoes/UsuariosPage.tsx`
- **Objetivo:** CRUD de usuários
- **Componentes:** `Card`, `Button`, `Input`, `PageState`, `ActionFeedback`, `Icon`
- **⚠ Problema real:** O modal de criar/editar usuário é implementado inline com classes `fixed inset-0` (inferência — padrão comum nesta base). Não usa o componente `ConfirmDialog` centralizado.
- **⚠ Problema real:** Mapeia `usuario.papel === 'ADMIN'` para `'administrador'` — inconsistência entre o que o backend retorna e o que o frontend espera (o restante do sistema usa `'administrador'` em lowercase)

#### `/configuracoes/admin` — AdminPage

- **Arquivo:** `src/pages/configuracoes/AdminPage.tsx`
- **Objetivo:** Configurações administrativas avançadas

#### `/configuracoes/vincular-producoes` — VincularProducoesPage

- **Arquivo:** `src/pages/admin/VincularProducoesPage.tsx`
- **Objetivo:** Vincular produções legado a usuários reais
- **Rota:** `/configuracoes/vincular-producoes` → arquivo em `pages/admin/` — **inconsistência de localização**
- **⚠ Problema real:** Usa `onSuccess: (data: any)` e `onError: (error: any)` — único arquivo que usa `any` em callbacks de mutation de forma explícita

---

### Módulo: Auditoria

#### `/auditoria/*` — AuditoriaPage

- **Arquivo:** `src/pages/auditoria/AuditoriaPage.tsx`
- **Objetivo:** Log de auditoria por categoria (importações, OCR, correções, ações)
- **Padrão:** Uma única página com prop `categoria` — reutilização inteligente
- **Componentes:** `Card`, `Button`, `Icon`, `PageState`
- **Dados:** Filtros de data, tabela de logs paginada, accordion para detalhes

---

### Módulo: Produção

#### `/producao/importar` — ImportarProducaoPage

- **Arquivo:** `src/pages/producao/ImportarProducaoPage.tsx`
- **Objetivo:** Importação em lote de produções via CSV/planilha
- **Componentes:** `Button`, `Card`, `PageState`, `ConfirmDialog`
- **Visual forte:** Feedback granular de preview (linhas válidas, inválidas, duplicatas)
- **Visual frágil:** Lógica pesada de parsing CSV inline na página (~100 linhas de helpers)

---

## 5. Layout Geral e Navegação

### Estrutura do AppLayout

```
┌─────────────────────────────────────────────────────────────────┐
│  AppLayout (min-h-screen, bg-gray-50, flex)                     │
│  ┌──────────────┬──────────────────────────────────────────┐   │
│  │              │  Header                                   │   │
│  │  Sidebar     │  (breadcrumbs desktop / título mobile)   │   │
│  │  (hidden     ├──────────────────────────────────────────┤   │
│  │   md:flex)   │                                          │   │
│  │              │  <Outlet /> — conteúdo da página         │   │
│  │  collapsed:  │                                          │   │
│  │  64px        │                                          │   │
│  │  expanded:   │                                          │   │
│  │  256px       │                                          │   │
│  └──────────────┴──────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  MobileBottomNav (fixed bottom, md:hidden)              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

- **Arquivo:** `src/components/layout/AppLayout.tsx`
- **Título da página:** Atualizado via `document.title` com `routeTitles` map (hardcoded)
- **Overflow:** `overflow-x: hidden` no root — evita scroll horizontal indesejado

### Sidebar

- **Arquivo:** `src/components/layout/Sidebar.tsx`
- **Collapsível:** 256px ↔ 64px (icons only)
- **Mobile:** Overlay com `fixed inset-0 z-50` + backdrop preto semitransparente
- **Itens filtrados por perfil:** `canAccessByProfile(item, usuario?.perfil)`
- **Estado ativo:** Destaque azul no item da rota atual
- **User section:** Initials avatar + nome + perfil + logout
- **Consistência:** Bem implementada, padrão único

### Header

- **Arquivo:** `src/components/layout/Header.tsx`
- **Breadcrumbs:** Desktop apenas (`hidden sm:flex`)
- **Título:** Mobile apenas (`hidden sm:hidden` → visível mobile)
- **Sem ações globais** (sem busca global, sem notificações, sem perfil quick-access)

### MobileBottomNav

- **Arquivo:** `src/components/layout/MobileBottomNav.tsx`
- **Itens:** Dinâmicos por perfil (2–5 itens)
- **`grid` com colunas dinâmicas** por contagem de itens
- **Safe area:** `padding-bottom: env(safe-area-inset-bottom)` — iOS notch support correto
- **Sem breadcrumbs:** Usuário mobile depende do título no Header

### Navegação sem Breadcrumbs Ativos no Mobile

**Possível melhoria:** Mobile tem apenas o título da página no Header — sem histórico de navegação visível. Para páginas profundas (ex.: relatório de um repositório específico), usuário mobile pode se perder.

---

## 6. Componentes Visuais Reutilizáveis

### Button

- **Arquivo:** `src/components/ui/Button.tsx`
- **Variantes:** `primary` | `secondary` | `outline` | `ghost` | `danger` | `success`
- **Tamanhos:** `xs` | `sm` | `md` | `lg`
- **Features:** ícone left/right, iconOnly, loading (spinner inline), fullWidth
- **Uso:** Todas as páginas — componente mais usado do sistema
- **Consistência:** Alta — único padrão em todo o sistema

### Input

- **Arquivo:** `src/components/ui/Input.tsx`
- **Tamanhos:** `sm` | `md` | `lg`
- **Features:** label, error, hint, helperText, leftIcon, rightIcon com clique, password toggle
- **Validação:** Borda/ring vermelha em erro
- **Uso:** Todos os formulários
- **⚠ Problema:** Em `LancarProducaoPage`, `UsuariosPage` e outras, `<select>` nativo é usado **sem wrapper de componente** — estilos inconsistentes com o `Input.tsx`

### Card

- **Arquivo:** `src/components/ui/Card.tsx`
- **Variantes:** `default` | `elevated` | `outlined` | `ghost`
- **Padding:** `none` | `xs` | `sm` | `md` | `lg` | `xl`
- **Subcomponentes:** `CardHeader`, `CardFooter`, `CardSection`
- **Hover:** shadow-md + border color
- **Uso:** Todas as páginas como container principal
- **Consistência:** Alta

### Badge / StatusBadge / AgingBadge

- **Badge (`Badge.tsx`):** 6 variantes semânticas + dot + removable + ícone
- **StatusBadge (`StatusBadge.tsx`):** Badges específicos para status de repositório/etapa
- **AgingBadge (`AgingBadge.tsx`):** Badge visual para envelhecimento de itens na fila
- **Uso:** StatusBadge e AgingBadge em `EtapaOperacionalPage`; Badge em cards e listagens
- **Inconsistência:** `MeuHistoricoPage` usa objeto `etapaCores` inline com classes Tailwind `bg-purple-50 text-purple-700` — **não usa `Badge` nem `StatusBadge`** para colorir etapas

### Icon

- **Arquivo:** `src/components/ui/Icon.tsx`
- **Tipo:** SVG inline — sem dependência de biblioteca externa
- **Ícones:** ~50 ícones estilo Heroicons (stroke, strokeWidth=2, 24×24)
- **Uso:** Em quase todos os componentes e páginas
- **Risco:** Se precisar de novo ícone, deve-se adicionar manualmente no arquivo. Não há fallback para nome desconhecido.

### Toast / Alert

- **Toast (`Toast.tsx`):** Context-based, auto-dismiss 5s, posição fixed bottom-left mobile
- **Alert (`Alert.tsx`):** Inline, 4 variantes, closeable
- **Consistência:** Uso correto na maioria das páginas via `useToastHelpers()`
- **⚠ Inconsistência:** `LancarProducaoPage` usa tanto `setMensagem` (estado inline → `ActionFeedback`) quanto `useToastHelpers()` — dois sistemas de feedback na mesma tela

### PageState / ActionFeedback

- **Arquivo:** `src/components/ui/PageState.tsx`
- **Loading:** `LoadingSpinner` centralizado com mensagem opcional
- **Error:** Card vermelho com title, details, e action button "Tentar novamente"
- **Empty:** Ícone + título + descrição + ação
- **ActionFeedback:** Banner inline success/error/warning/info com dismiss
- **Uso:** Consistente em todas as páginas
- **Ponto forte:** Padrão claro — toda tela usa `<PageState loading={} error={}>` como wrapper

### Skeleton

- **Arquivo:** `src/components/ui/Skeleton.tsx`
- **Exports:** `SkeletonTable`, `SkeletonCards`
- **Uso:** Inferido como disponível, mas nem todas as páginas os usam — algumas usam apenas o `PageState loading`

### ProgressIndicator

- **Arquivo:** `src/components/ui/ProgressIndicator.tsx`
- **Visual:** Dots coloridos com label em `10px`
- **⚠ Problema:** Usa classes Tailwind hardcoded (`bg-blue-600`, `bg-blue-300`, `bg-gray-200`) fora do design system

### MarkdownEditor

- **Arquivo:** `src/components/ui/MarkdownEditor.tsx`
- **Modos:** Edit | Preview | Split
- **Toolbar:** Negrito, itálico, lista, cabeçalhos
- **Uso:** `ConhecimentoOperacionalPage`

### Pagination

- **Arquivo:** `src/components/ui/Pagination.tsx`
- **Tipo:** Prev/Next simples
- **Uso:** `MeuHistoricoPage`, `AuditoriaPage`
- **Possível melhoria:** Sem indicação de página atual vs total de páginas visible no componente (inferência baseada na simplicidade descrita)

### ConfirmDialog

- **Arquivo:** `src/components/ui/ConfirmDialog.tsx`
- **Variantes:** `danger` | `warning` | `default`
- **Hook associado:** `useConfirmDialog.ts`
- **Uso:** `EmpresaPage`, `LancarProducaoPage`, `ImportarProducaoPage`
- **⚠ Inconsistência:** `UsuariosPage` não usa `ConfirmDialog` — implementa confirmação inline ou sem confirmação

---

## 7. Identidade Visual e Design System

### Onde Estão os Padrões

| Elemento                   | Local                                              | Centralizado?            |
| -------------------------- | -------------------------------------------------- | ------------------------ |
| Cores semânticas           | `src/styles/design-tokens.css`                     | ✅ Sim                   |
| Tipografia                 | `src/styles/design-tokens.css` + classes `.text-*` | ✅ Sim                   |
| Espaçamento                | `src/styles/design-tokens.css` (vars `--space-*`)  | ✅ Sim, mas...           |
| Sombras                    | `src/styles/design-tokens.css`                     | ✅ Sim                   |
| Z-index                    | `src/styles/design-tokens.css` (`--z-*`)           | ✅ Sim                   |
| Transições                 | `src/styles/design-tokens.css`                     | ✅ Sim                   |
| Cores de etapa (badges)    | `MeuHistoricoPage.tsx`                             | ❌ Não — inline          |
| Cores de gráficos          | `Dashboard.tsx`                                    | ❌ Não — hardcoded       |
| Cores do ProgressIndicator | `ProgressIndicator.tsx`                            | ❌ Não — Tailwind direto |

### Estado do Tailwind Config

```js
// tailwind.config.js — ATUAL
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} }, // ← VAZIO
  plugins: [],
};
```

**Implicação:** Os tokens CSS não estão mapeados como utilidades Tailwind. Para usar as cores do design system, os componentes escrevem:

```tsx
className = 'bg-[var(--color-primary-600)] text-[var(--color-primary-50)]';
```

Em vez do ideal:

```tsx
className = 'bg-primary-600 text-primary-50';
```

Isso funciona mas é verboso e reduz o autocomplete no editor.

### Fontes

- **Inter** — sans-serif, todas as telas internas
- **JetBrains Mono** — disponível via token mas uso inferido como apenas campos de código (se houver)
- **Carregamento:** Via `index.css` ou `index.html` (não verificado o preload)

### Dark Mode

**Não implementado.** Sem `@media (prefers-color-scheme: dark)` nos tokens. Sistema é sempre light.

---

## 8. Responsividade e Experiência Mobile

### Abordagem

**Desktop-first com adaptações mobile via classes Tailwind responsivas.**

### Breakpoints Usados

Tailwind padrão — sem customização:

- `sm`: 640px
- `md`: 768px (principal — divide desktop/mobile no layout)
- `lg`, `xl`: raramente usados

### Adaptações Mobile Implementadas

| Elemento  | Desktop               | Mobile                                          |
| --------- | --------------------- | ----------------------------------------------- |
| Sidebar   | Lateral colapsável    | Overlay com backdrop + botão hamburger          |
| Header    | Breadcrumbs           | Título da página                                |
| Navegação | Sidebar lateral       | MobileBottomNav (fixed bottom)                  |
| Layout    | `md:flex` com sidebar | `flex-col` empilhado                            |
| Conteúdo  | `pb-4`                | `pb-24` para não sobrepor bottom nav            |
| Safe area | —                     | `env(safe-area-inset-bottom)` correto           |
| Font size | 14px                  | `16px !important` em inputs (evita zoom no iOS) |

### Pontos de Atenção Mobile

- **Tabelas:** Usam `overflow-x-auto` com `-webkit-overflow-scrolling: touch` — scroll horizontal em tabelas densas
- **EtapaOperacionalPage:** Tela muito densa com muitos painéis — experiência mobile provavelmente desafiadora
- **RelatoriosGerenciaisPage:** Tabelas de relatório em landscape seria mais usável
- **`img, svg, video, canvas { max-width: 100% }`** — global no `index.css` — correto

---

## 9. Estados de Interface

### Inventário de Estados

| Estado               | Componente                | Aplicado?                    | Consistente?                    |
| -------------------- | ------------------------- | ---------------------------- | ------------------------------- |
| Loading (tela cheia) | `PageState loading`       | ✅ Todas as pages            | ✅ Sim                          |
| Loading (botão)      | `Button loading`          | ✅ Ações de submit           | ✅ Sim                          |
| Erro (tela)          | `PageState error`         | ✅ Todas as pages            | ✅ Sim                          |
| Sucesso (inline)     | `ActionFeedback success`  | ✅ Formulários               | ✅ Sim                          |
| Sucesso (toast)      | `useToastHelpers success` | ✅ Mutações                  | ✅ Sim                          |
| Empty state          | `PageState empty`         | Parcial                      | ⚠ Nem todas                     |
| Campo inválido       | `Input error`             | ✅ Login                     | ⚠ Inconsistente em outros forms |
| Confirmação exclusão | `ConfirmDialog danger`    | ✅ Maioria                   | ⚠ Falta em UsuariosPage         |
| Skeleton loading     | `SkeletonTable/Cards`     | ⚠ Disponível mas uso incerto | —                               |
| Estado offline       | —                         | ❌ Não implementado          | —                               |
| Sem permissão        | `RoleRoute` redirect      | ✅ Rota                      | Não visual inline               |

### Pontos Fortes

O `PageState` é um padrão excelente — toda tela tem um wrapper único que trata loading/error/empty. Elimina estados inconsistentes.

### Lacunas

- **Empty states:** Nem todas as listagens têm estado vazio tratado visualmente (inferência)
- **Skeleton:** Disponível em `Skeleton.tsx` mas pode não estar sendo usado em todas as telas — algumas podem usar apenas o spinner centralizado
- **Validação de formulários:** Login tem validação campo a campo com estado `touched`; outros formulários (ex.: `LancarProducaoPage`) têm validação apenas no submit

---

## 10. Formulários e Usabilidade

### Padrões de Formulário Encontrados

**Formulários simples (estado local):**

- `LancarProducaoPage`: `useState` único para `formData` object
- `UsuariosPage`: `useState` para `formData` + estado do modal
- `EmpresaPage`: `useState` para `config` object

**Validação:**

- Login: Validação field-by-field com `touched` state — melhor UX
- Demais forms: Validação apenas no submit, sem feedback em tempo real
- `LancarProducaoPage`: Função `validarQuantidade()` isolada — boa prática

**Inconsistência de `<select>`:**

```tsx
// LancarProducaoPage — select nativo sem wrapper
<select className="..." value={formData.etapa} onChange={...}>
  {etapas.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
</select>
```

vs. `<Input>` com estilos padronizados. O `<select>` nativo tem aparência nativa do OS, quebrando o padrão visual.

**Máscaras e condicionais:**

- Sem bibliotecas de máscara (ex.: CNPJ, telefone em `EmpresaPage` são texto livre)
- Campos condicionais por perfil na `LancarProducaoPage`

---

## 11. Listagens, Tabelas e Dashboards

### Padrões de Exibição de Dados

| Tela                     | Tipo                | Filtros              | Busca | Paginação    | Ações por linha  |
| ------------------------ | ------------------- | -------------------- | ----- | ------------ | ---------------- |
| EtapaOperacionalPage     | Cards + lista       | Sim (status, etapa)  | Sim   | `Pagination` | `ActionMenu`     |
| MeuHistoricoPage         | Cards/lista         | Sim (data, etapa)    | Não   | `Pagination` | Não              |
| AuditoriaPage            | Tabela              | Sim (data, operação) | Não   | `Pagination` | Accordion expand |
| UsuariosPage             | Lista/cards         | Não                  | Não   | Não          | Botões inline    |
| VincularProducoesPage    | Selects + preview   | Não                  | Não   | Não          | Um submit        |
| RelatoriosGerenciaisPage | Tabela hierárquica  | Sim (data, coord.)   | Não   | Não          | Download         |
| ImportarProducaoPage     | Preview + histórico | Não                  | Não   | Não          | Rollback         |

### Dashboard (Métricas)

- **Stats cards:** Grid de 4 cards com número destacado e label
- **Gráficos:** Recharts — `LineChart`, `BarChart`, `PieChart`
- **COLORS hardcoded:** `['#0088FE', '#00C49F', '#FFBB28', '#FF8042', ...]` — fora do design system
- **Auto-refresh:** `setInterval` a cada 5s no `Dashboard.tsx` genérico — pode causar requisições excessivas

### ActionMenu

- **Arquivo:** `src/components/ui/ActionMenu.tsx`
- **Posicionamento:** Dinâmico (detecta borda da tela)
- **Uso:** `EtapaOperacionalPage` — ações por repositório

---

## 12. Acessibilidade Visual

### Pontos Positivos

- `font-size: 16px !important` em inputs mobile — evita zoom forçado do iOS
- `env(safe-area-inset-bottom)` no MobileBottomNav — suporte correto a notches
- Cores semânticas claras (success verde, error vermelho, warning âmbar)
- `disabled:opacity-50` em botões — feedback visual de estado desabilitado
- Focus ring nos inputs (`focus:ring-2 focus:ring-primary-500` inferido)

### Riscos de Acessibilidade

| Problema                                                                               | Local                           | Risco                         |
| -------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------- |
| `<select>` sem label visual consistente                                                | `LancarProducaoPage`            | Médio                         |
| Ícones sem `aria-label`                                                                | `Icon.tsx` — SVG sem title/desc | Alto                          |
| Modal implementado inline sem `role="dialog"`, `aria-modal`                            | `UsuariosPage` (inferido)       | Alto                          |
| Cores de etapa em `MeuHistoricoPage` — contraste não verificado                        | `text-purple-700 bg-purple-50`  | Baixo                         |
| `ProgressIndicator` labels em 10px                                                     | `ProgressIndicator.tsx`         | Médio — abaixo do mínimo WCAG |
| Navegação mobile via grid sem `aria-label` no nav                                      | `MobileBottomNav.tsx`           | Médio                         |
| `Toast` posição `fixed bottom-4` — pode sobrepor conteúdo sem aviso a leitores de tela | `Toast.tsx`                     | Baixo                         |

**Nota:** Sem `aria-label` nos SVGs do `Icon.tsx`, ícones sozinhos (como `iconOnly` buttons) não têm texto alternativo para leitores de tela.

---

## 13. Assets, Imagens, Logos e Ícones

### Assets do Projeto

```
assets/
  logo-icon.png      — Ícone quadrado/circular, usado no login (160×160)
  logo.jpeg          — Logo completa com nome da empresa

public/
  favicon.ico
  favicon.svg
  apple-touch-icon.png
  pwa-192x192.png
  pwa-512x512.png
  pwa-maskable-512x512.png   — PWA maskable icon
  images/
    logo-icon.png    — Duplicata do assets/logo-icon.png (ver abaixo)
```

**⚠ Problema real:** `logo-icon.png` existe em dois locais:

- `assets/logo-icon.png`
- `public/images/logo-icon.png`

Risco de atualizar um e esquecer o outro.

### Ícones do Sistema

- **Todos ícones SVG inline em `Icon.tsx`** — sem dependência externa (Heroicons, Lucide, etc.)
- **~50 ícones** definidos como paths SVG
- **Sem fallback** para nome desconhecido — silenciosamente renderiza SVG vazio
- **Otimização:** SVG inline é zero-request mas aumenta o bundle JS

### Logo da Empresa (Dinâmica)

Armazenada no banco de dados (após fix desta sessão). Servida via `/configuracao/empresa/logo/arquivo` com `?v=<timestamp>` para cache busting.

**PWA e imagens:** Service worker cacheará a logo com `StaleWhileRevalidate` por até 30 dias. Após o fix de persistência no banco, o `?v=<timestamp>` garante que nova versão seja buscada — mas o cache antigo do service worker pode servir a versão antiga por um tempo.

---

## 14. Inconsistências Visuais e Dívidas de Interface

### Inventário de Dívidas

| #   | Problema                                                                   | Arquivo                                              | Impacto                                    | Manutenção                     | Prioridade |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ | ------------------------------ | ---------- |
| 1   | `<select>` nativo sem wrapper — estilo inconsistente                       | `LancarProducaoPage.tsx`, `UsuariosPage.tsx`, outros | Médio — quebra uniformidade de forms       | Médio                          | **Alta**   |
| 2   | Dois `value: 'DIGITALIZACAO'` no array de etapas                           | `LancarProducaoPage.tsx`                             | Alto — bug funcional mascarado visualmente | Alto                           | **Alta**   |
| 3   | Cores de etapa hardcoded fora do design system                             | `MeuHistoricoPage.tsx` (`etapaCores` object)         | Médio — inconsistente com Badge system     | Médio                          | **Média**  |
| 4   | `Dashboard.tsx` com `fetch()` direto, `any`, `console.error`               | `components/dashboard/Dashboard.tsx`                 | Baixo (isolado)                            | Alto                           | **Média**  |
| 5   | Cores de gráficos hardcoded (`#0088FE`, etc.)                              | `components/dashboard/Dashboard.tsx`                 | Baixo                                      | Baixo                          | Baixa      |
| 6   | `ProgressIndicator` usa `bg-blue-600` em vez de design token               | `ProgressIndicator.tsx`                              | Baixo                                      | Baixo                          | Baixa      |
| 7   | Tailwind `theme.extend: {}` vazio — tokens não mapeados como classes       | `tailwind.config.js`                                 | Baixo visual, alto DX                      | Médio                          | **Média**  |
| 8   | `logo-icon.png` duplicado em `assets/` e `public/images/`                  | —                                                    | Baixo                                      | Médio                          | Baixa      |
| 9   | `VincularProducoesPage` em `pages/admin/` mas rota em `/configuracoes/`    | `src/pages/admin/`                                   | Baixo                                      | Alto — confuso para novos devs | Baixa      |
| 10  | Modal inline em `UsuariosPage` sem `ConfirmDialog` centralizado            | `UsuariosPage.tsx`                                   | Baixo                                      | Médio                          | Baixa      |
| 11  | Dois sistemas de feedback em `LancarProducaoPage` (Toast + ActionFeedback) | `LancarProducaoPage.tsx`                             | Baixo                                      | Baixo                          | Baixa      |
| 12  | `routeTitles` hardcoded em `AppLayout.tsx`                                 | `AppLayout.tsx`                                      | Baixo                                      | Médio                          | Baixa      |
| 13  | `UsuariosPage` mapeia `papel === 'ADMIN'` — inconsistente com restante     | `UsuariosPage.tsx`                                   | Funcional (bug latente)                    | Médio                          | **Média**  |
| 14  | Ícones SVG sem `aria-label` ou `title`                                     | `Icon.tsx`                                           | Acessibilidade                             | Alto                           | **Alta**   |

---

## 15. Pontos Críticos para Futuras Alterações Visuais

| Área             | Arquivo/Caminho                       | Por que é crítico                                                    | Risco                                                      |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| Design System    | `src/styles/design-tokens.css`        | Todas as cores, tipografia, espaçamento, sombras, z-index do sistema | **Muito Alto** — qualquer alteração impacta 100% das telas |
| CSS Base         | `src/index.css`                       | Resets, base styles, mobile font-size fix                            | **Alto** — alterações podem quebrar mobile                 |
| Layout Principal | `src/components/layout/AppLayout.tsx` | Estrutura de todas as páginas internas                               | **Alto** — quebra a grade inteira                          |
| Sidebar          | `src/components/layout/Sidebar.tsx`   | Navegação de todo o sistema + filtragem por perfil                   | **Alto**                                                   |
| Botão            | `src/components/ui/Button.tsx`        | Usado em todas as telas — ~200+ instâncias                           | **Muito Alto**                                             |
| Input            | `src/components/ui/Input.tsx`         | Formulários em todo o sistema                                        | **Alto**                                                   |
| Card             | `src/components/ui/Card.tsx`          | Container de todos os módulos                                        | **Alto**                                                   |
| PageState        | `src/components/ui/PageState.tsx`     | Estados loading/error/empty em todas as telas                        | **Alto**                                                   |
| Toast            | `src/components/ui/Toast.tsx`         | Feedback de todas as ações                                           | **Alto**                                                   |
| Icon             | `src/components/ui/Icon.tsx`          | Ícones em todos os componentes                                       | **Médio** — adicionar ícone é seguro; renomear quebra      |
| Menu             | `src/config/menu.ts`                  | Controla toda a navegação                                            | **Médio**                                                  |
| Tailwind Config  | `tailwind.config.js`                  | Afeta purge e todas as classes                                       | **Médio**                                                  |
| Rotas            | `src/routes/index.tsx`                | Lazy loading + proteção + estrutura de navegação                     | **Médio**                                                  |

---

## 16. Diagnóstico Prático por Prioridade

### 🔴 Alta Prioridade

**1. Bug: dois itens com `value: 'DIGITALIZACAO'` no array de etapas**

- **Onde:** `src/pages/colaborador/LancarProducaoPage.tsx`
- **Por que importa:** Usuário seleciona "Digitalização Colorida" mas o sistema envia "DIGITALIZACAO" idêntico ao P/B. Dado enviado não reflete a escolha visual.
- **Antes de corrigir:** Verificar se o backend tem distinção entre P/B e Colorida (campo separado ou valor diferente)

**2. `<select>` nativo sem componente wrapper**

- **Onde:** `LancarProducaoPage.tsx`, `UsuariosPage.tsx`, `RelatoriosGerenciaisPage.tsx`
- **Por que importa:** Quebra a uniformidade visual dos formulários — o select tem estilo nativo do OS enquanto inputs seguem o design system
- **Antes de corrigir:** Criar componente `Select` baseado no `Input.tsx` ou usar `select` com classes do Input

**3. Ícones SVG sem `aria-label` ou `title`**

- **Onde:** `src/components/ui/Icon.tsx` — todos os botões `iconOnly`
- **Por que importa:** Inacessível para leitores de tela
- **Antes de corrigir:** Mapear todos os usos de `iconOnly` no sistema

### 🟡 Média Prioridade

**4. Mapeamento `papel === 'ADMIN'` inconsistente**

- **Onde:** `src/pages/configuracoes/UsuariosPage.tsx`
- **Por que importa:** Backend retorna `'ADMIN'` ou `'administrador'`? Se inconsistente, edição de usuários admin pode falhar silenciosamente
- **Antes de corrigir:** Verificar o que `GET /auth/usuarios` retorna no campo `papel`

**5. Tailwind sem extensão de tokens**

- **Onde:** `tailwind.config.js`
- **Por que importa:** Reduz DX (sem autocomplete), força sintaxe verbosa `bg-[var(--)]`
- **Antes de corrigir:** Mapear os tokens mais usados; pode ser feito incrementalmente

**6. `Dashboard.tsx` genérico desacoplado do design system**

- **Onde:** `src/components/dashboard/Dashboard.tsx`
- **Por que importa:** Usa `fetch()` direto, `any` types, auto-refresh a cada 5s — não segue os padrões da codebase
- **Antes de corrigir:** Verificar se este componente é realmente usado em produção ou é vestigial

**7. Cores de etapa hardcoded em `MeuHistoricoPage`**

- **Onde:** `src/pages/colaborador/MeuHistoricoPage.tsx`
- **Por que importa:** Manutenção inconsistente — quando criar nova etapa, deve-se lembrar de adicionar em dois lugares
- **Antes de corrigir:** Centralizar em `StatusBadge.tsx` ou em um utilitário compartilhado

### 🟢 Baixa Prioridade

**8. `logo-icon.png` duplicado**

- **Onde:** `assets/` e `public/images/`
- Risco baixo, mas organização ruim

**9. `VincularProducoesPage` localizada em `pages/admin/`**

- Convenção inconsistente — deveria estar em `pages/configuracoes/`

**10. Cores de gráficos hardcoded no `Dashboard.tsx`**

- Cosmético, área de impacto limitada

**11. `routeTitles` hardcoded no AppLayout**

- Manutenção menor — ao adicionar rota nova, deve-se lembrar de atualizar o map

---

## 17. Mapa Prático para Futuras Melhorias Visuais

### Por Objetivo

| Objetivo                                         | Arquivo(s) Principal(is)                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Entender o visual do sistema                     | `src/styles/design-tokens.css` → `src/components/ui/` → `src/components/layout/AppLayout.tsx` |
| Alterar layout geral (sidebar, header, conteúdo) | `src/components/layout/AppLayout.tsx`, `Sidebar.tsx`, `Header.tsx`                            |
| Alterar cores e identidade                       | `src/styles/design-tokens.css` (variáveis `--color-*`)                                        |
| Alterar botões                                   | `src/components/ui/Button.tsx`                                                                |
| Alterar inputs                                   | `src/components/ui/Input.tsx`                                                                 |
| Alterar cards                                    | `src/components/ui/Card.tsx`                                                                  |
| Corrigir responsividade                          | `src/index.css` + `AppLayout.tsx` + `MobileBottomNav.tsx`                                     |
| Ajustar dashboards                               | `src/components/dashboard/Dashboard.tsx` + `src/pages/Dashboard.tsx`                          |
| Ajustar formulários                              | `src/components/ui/Input.tsx` + pages individualmente                                         |
| Adicionar ícone                                  | `src/components/ui/Icon.tsx` — adicionar no objeto `icons`                                    |
| Debug visual de rota                             | `src/routes/index.tsx` → página específica                                                    |
| Alterar navegação/menu                           | `src/config/menu.ts` + `src/components/layout/Sidebar.tsx`                                    |

### Ordem de Leitura Recomendada para Dev/Designer Novo

1. `src/styles/design-tokens.css` — entender a paleta, tipografia e espaçamento
2. `src/index.css` — entender os resets e base
3. `src/components/ui/Button.tsx` + `Input.tsx` + `Card.tsx` — os três componentes mais usados
4. `src/components/layout/AppLayout.tsx` + `Sidebar.tsx` — estrutura da aplicação
5. `src/routes/index.tsx` — mapa de rotas e lazy loading
6. `src/pages/colaborador/LancarProducaoPage.tsx` — exemplo de página simples de formulário
7. `src/pages/operacao/EtapaOperacionalPage.tsx` — exemplo de página complexa
8. `src/components/ui/PageState.tsx` + `Toast.tsx` — padrões de estado e feedback
9. `src/hooks/useQueries.ts` — como dados fluem de API para tela

---

## 18. Resumo Executivo Final

### Estrutura Visual

Sistema administrativo desktop-first com suporte mobile PWA funcional. Design system próprio bem estruturado (`design-tokens.css`) com tokens completos de cores, tipografia, espaçamento, sombras e z-index. Sem dependência de biblioteca UI externa. Componentes base (~20) cobrindo todos os casos de uso principais.

### Principais Padrões Encontrados

- **Layout:** Sidebar + Header + Outlet + MobileBottomNav
- **Dados:** `useQuery` + `PageState` — padrão consistente em todas as telas
- **Feedback:** `Toast` para ações, `ActionFeedback` inline para formulários
- **Confirmação:** `ConfirmDialog` com `useConfirmDialog` hook
- **Ícones:** SVG inline próprio em `Icon.tsx`
- **Estilização:** Tailwind CSS + CSS Variables (tokens não mapeados em Tailwind)

### Principais Telas/Módulos Analisados

Login, Dashboard, EtapaOperacional (Recebimento/CQ), LancarProdução, MeuHistórico, RelatoriosGerenciais, EmpresaPage, UsuariosPage, AuditoriaPage, VincularProduções, ImportarProdução, ConhecimentoOperacional.

### Maiores Riscos Visuais

1. **`design-tokens.css`** — arquivo único que controla 100% do visual. Uma alteração incorreta quebra todo o sistema.
2. **`Button.tsx`, `Card.tsx`, `Input.tsx`** — componentes com centenas de instâncias. Mudança de API ou classe pode gerar regressão ampla.
3. **`AppLayout.tsx`** — estrutura de todas as páginas internas.

### Maiores Inconsistências

1. **`<select>` nativo vs. `<Input>`** — formulários com aparência mista
2. **Cores de etapa hardcoded** em `MeuHistoricoPage` fora do sistema de badges
3. **`Dashboard.tsx` genérico** desalinhado com padrões do restante
4. **`ProgressIndicator`** com cores fora dos tokens
5. **Bug de duplicate value** no array de etapas do `LancarProducaoPage`

### Oportunidades Reais de Padronização

1. **Criar componente `Select`** baseado no `Input.tsx` para eliminar `<select>` nativo
2. **Mapear tokens no Tailwind** (`theme.extend.colors`, `theme.extend.spacing`) para melhorar DX
3. **Centralizar cores de etapa** em `StatusBadge` ou utilitário compartilhado
4. **Adicionar `aria-label` prop** ao `Icon.tsx` para acessibilidade
5. **Mover `VincularProducoesPage`** para `pages/configuracoes/` para consistência

### Próximos Passos Antes de Qualquer Alteração Visual

1. **Ler `design-tokens.css` completo** antes de tocar em qualquer cor ou espaçamento
2. **Verificar todos os usos** de `Button`, `Input`, `Card` antes de alterar a API desses componentes — são altamente reutilizados
3. **Corrigir o bug do `value: 'DIGITALIZACAO'` duplicado** antes de qualquer refatoração de formulário
4. **Alinhar com backend** se `papel` retorna `'ADMIN'` ou `'administrador'` antes de mexer em `UsuariosPage`
5. **Confirmar se `Dashboard.tsx` genérico** está realmente em uso ou pode ser removido/refatorado sem impacto

---

_Diagnóstico gerado por análise estática do código. Nenhum arquivo foi modificado._
