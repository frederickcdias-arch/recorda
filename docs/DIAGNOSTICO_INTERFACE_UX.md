# Diagnóstico de Interface e UX — Projeto Recorda

> **Data:** Julho 2025  
> **Escopo:** Frontend completo — `packages/frontend/src/`  
> **Método:** Leitura e análise estática de código. Nenhum arquivo foi alterado.  
> **Stack:** React 18 · React Router v7 · Vite 5 · TypeScript · Tailwind CSS v3 · TanStack Query v5

---

## 1. Resumo Executivo

O frontend do Recorda possui uma base técnica sólida e bem estruturada. O sistema de design token (`design-tokens.css`) é profissional, o roteamento está correto e os componentes primitivos (`Button`, `Card`, `Input`, `Select`, `Badge`, `Alert`, `PageState`) são bem implementados e usam CSS vars consistentemente.

**O problema central é a adoção irregular desses componentes.** A maioria das telas de conteúdo (histórico, auditoria, relatórios, projetos, etapa operacional) ignora os componentes da UI lib e constrói inputs, selects e tabelas inline com classes Tailwind hardcoded — frequentemente misturando `blue-600` do Tailwind padrão com o indigo `primary-600` definido nos tokens. Isso resulta em identidade visual fragmentada, dívida de manutenção alta e inconsistência de UX entre seções do mesmo produto.

**Áreas críticas a corrigir, em ordem de impacto:**

| Prioridade | Problema                                                           | Páginas afetadas                                                 |
| ---------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 🔴 Alta    | Nenhum componente `<Table>` reutilizável                           | Todas as páginas com listagem                                    |
| 🔴 Alta    | Inputs/selects raw HTML ao invés de componentes UI                 | MeuHistorico, Auditoria, Relatórios, Projetos, EtapaOperacional  |
| 🟠 Média   | Cor primária hardcoded `blue-600` em vez de `primary-600` (tokens) | Sidebar, MeuHistorico, LancarProducao, EtapaOperacional, filtros |
| 🟠 Média   | Header vazio — sem identidade do usuário nem ações contextuais     | Header.tsx                                                       |
| 🟠 Média   | MobileBottomNav sem acesso a Configurações/Auditoria para admin    | MobileBottomNav.tsx                                              |
| 🟡 Baixa   | Debounce inconsistente (useRef manual vs hook `useDebounce`)       | MeuHistorico vs EtapaOperacional                                 |
| 🟡 Baixa   | `EtapaOperacionalPage` monolítica — 2 fluxos num único arquivo     | EtapaOperacionalPage.tsx                                         |
| 🟡 Baixa   | ProjetosPage com funcionalidades TODO não implementadas            | ProjetosPage.tsx                                                 |
| 🟡 Baixa   | `border-opacity-50` descontinuado no Tailwind v3                   | Dashboard.tsx                                                    |

---

## 2. Estado Atual da Interface

### 2.1 Design System

| Item                   | Estado                    | Detalhe                                                                                            |
| ---------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| Tokens CSS             | ✅ Completo               | `design-tokens.css` — 11 tons por cor, tipografia, espaçamentos, sombras, animações                |
| Tailwind config        | ✅ Correto                | Cores mapeadas para CSS vars via `var(--color-*)`                                                  |
| Fonte                  | ✅ Inter + JetBrains Mono | Carregada via Google Fonts no HTML                                                                 |
| Cor primária           | ⚠️ Inconsistente          | Token: `#444ce7` (indigo-600); Tailwind padrão: `blue-600` (#2563eb). **Ambos são usados.**        |
| Componentes primitivos | ✅ Bem feitos             | Button, Card, Input, Select, Badge, Alert, PageState, Pagination, ConfirmDialog, ActionMenu, Toast |
| Componente Table       | ❌ Ausente                | Nenhuma abstração — cada página cria tabela inline                                                 |

### 2.2 Arquitetura de Componentes

```
src/components/
  layout/
    AppLayout       ✅ Flex, mobile overlay sidebar, animate-fade-in-up por rota
    Sidebar         ⚠️ Seções inativas colapsadas; cor ativa hardcoded blue-600
    Header          ⚠️ Extremamente minimalista (apenas título/breadcrumb)
    MobileBottomNav ⚠️ Sem Configurações/Auditoria para admin
  ui/
    Button          ✅ 6 variantes, 4 tamanhos, loading state, touch targets
    Card            ✅ 4 variantes, 6 paddings, hover lift, subcomponentes
    Input           ✅ forwardRef, label, error, hint, ícones, 3 tamanhos
    Select          ✅ forwardRef, tokens CSS, placeholder, opções via props ou children
    Badge           ✅ 6 variantes, dot/icon/removable, StatusBadge incluído
    Alert           ✅ 4 variantes, tokens CSS, onClose, 2 tamanhos
    PageState       ✅ loading/error/empty states com tokens CSS
    Pagination      ✅ Anterior/Próxima, oculta quando totalPaginas ≤ 1
    ConfirmDialog   ⚠️ variantStyles.danger usa text-gray-900 hardcoded, não token
    ActionMenu      ⚠️ bg-gray-100, text-gray-500, text-gray-700 hardcoded (botão trigger)
    Toast           ✅ (não lido em detalhe mas usado via useToastHelpers)
    MarkdownEditor  ✅ Presente e usado em ConhecimentoOperacionalPage
    Icon            ✅ (lucide-react, inferido pelo uso)
```

### 2.3 Páginas Avaliadas

| Página                   | Rota                      | Perfil         | Qualidade Geral                                                             |
| ------------------------ | ------------------------- | -------------- | --------------------------------------------------------------------------- |
| Login                    | `/login`                  | todos          | ✅ Excelente — mais consistente do sistema                                  |
| Dashboard (colaborador)  | `/`                       | colaborador    | 🟠 Bom layout; tokens inconsistentes; `border-opacity-50` deprecated        |
| Dashboard (admin)        | `/`                       | admin/operador | 🟡 Não lido completamente — inferido como similar ao colaborador            |
| Lançar Produção          | `/colaborador/lancar`     | colaborador    | 🟠 Usa componentes UI, mas `bg-blue-600` hardcoded em botão inline          |
| Meu Histórico            | `/colaborador/historico`  | colaborador    | 🔴 Filtros com raw HTML; debounce manual; tabela inline                     |
| Importar Produção        | `/producao/importar`      | admin/operador | 🟠 Funcionalidade rica; validação, preview, fontes salvas                   |
| Produção (listagem)      | `/producao`               | admin/operador | 🟠 Ordenação por coluna implementada; filtros raw HTML                      |
| Etapa Operacional        | `/operacao/:etapa`        | admin/operador | 🔴 Monolítica; mistura Recebimento + CQ; raw HTML interno                   |
| Conhecimento Operacional | `/operacao/conhecimento`  | admin/operador | ✅ Usa componentes UI; URL state bem feito; MarkdownEditor                  |
| Relatórios Gerenciais    | `/relatorios`             | admin/operador | 🟠 Auto-load quando datas mudam; exportação PDF/Excel; raw HTML nos filtros |
| Auditoria                | `/auditoria*`             | admin          | 🟠 URL state, paginação, expandir registro; raw HTML nos filtros            |
| Usuários                 | `/configuracoes/usuarios` | admin          | ✅ Usa Input e Select componentes corretamente; modal com ESC               |
| Projetos                 | `/configuracoes/projetos` | admin          | 🔴 TODO não implementados; raw `<input>` no form; `confirm()` nativo        |
| Empresa                  | `/configuracoes/empresa`  | admin          | não lido                                                                    |
| Admin                    | `/configuracoes/admin`    | admin          | não lido                                                                    |

---

## 3. Problemas por Área

### 3.1 Consistência de Componentes

**Problema:** As páginas não usam uniformemente os componentes da UI lib. Existem dois padrões paralelos convivendo:

**Padrão A — Componente (correto):**

```tsx
// UsuariosPage.tsx — usa componentes corretamente
<Input label="Nome" value={formData.nome} onChange={...} />
<Select label="Perfil" options={perfilOptions} value={formData.perfil} onChange={...} />
```

**Padrão B — Raw HTML (incorreto):**

```tsx
// MeuHistoricoPage.tsx — ignora os componentes
<input
  type="date"
  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
/>
<select className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
```

O Padrão B replica manualmente ~80% do CSS do componente `Input`/`Select`, mas usa `blue-500`/`blue-300` do Tailwind padrão ao invés do token `primary-*`.

**Páginas com Padrão B (raw HTML):** MeuHistoricoPage, AuditoriaPage, RelatoriosGerenciaisPage, ProjetosPage, LancarProducaoPage (parcialmente), ProducaoPage, EtapaOperacionalPage.

---

### 3.2 Cores e Tokens

**Problema:** Cor "azul" tem duas origens diferentes no projeto:

| Origem              | Valor hex               | Referência no código                              |
| ------------------- | ----------------------- | ------------------------------------------------- |
| Token `primary-600` | `#444ce7` (indigo)      | `var(--color-primary-600)`                        |
| Tailwind `blue-600` | `#2563eb` (azul padrão) | `bg-blue-600`, `text-blue-600`, `border-blue-500` |

Os componentes primitivos usam os tokens. As telas de conteúdo usam `blue-*`. **Resultado:** a interface muda visivelmente de tom de azul entre componentes diferentes na mesma tela.

**Ocorrências de hardcode identificadas:**

- `Sidebar.tsx`: item ativo → `bg-blue-600 text-white` (deveria ser `bg-[var(--color-primary-600)]`)
- `MeuHistoricoPage.tsx`: preset ativo → `bg-blue-600 text-white border-blue-600`; focus → `focus:border-blue-500`
- `LancarProducaoPage.tsx`: botão "Adicionar" → `bg-blue-600`; info box → `bg-blue-50 border-blue-200`
- `AuditoriaPage.tsx`: focus → `focus:ring-blue-500`; INSERT badge → `text-blue-800 bg-blue-100`
- `ProjetosPage.tsx`: checkbox → `text-blue-600 focus:ring-blue-500 border-gray-300`
- `ConfirmDialog.tsx`: `variantStyles.default` → `text-blue-600` hardcoded
- `ActionMenu.tsx`: trigger button → `text-gray-500 hover:bg-gray-100 hover:text-gray-700`
- `Dashboard.tsx`: `border-opacity-50` descontinuado no Tailwind v3 (substituir por `border-gray-100/50`)

---

### 3.3 Tabelas

**Problema crítico:** Não existe nenhum componente `<Table>` reutilizável. Cada página implementa a tabela do zero com `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<td>` manualmente.

**Observações por página:**

| Página                   | Ordenação                   | Hover              | Responsive        | Ações                              |
| ------------------------ | --------------------------- | ------------------ | ----------------- | ---------------------------------- |
| MeuHistoricoPage         | ❌                          | `hover:bg-gray-50` | `overflow-x-auto` | nenhuma                            |
| ProducaoPage             | ✅ por coluna (client-side) | `hover:bg-gray-50` | `overflow-x-auto` | Excluir via ActionMenu             |
| UsuariosPage             | ❌                          | `hover:bg-gray-50` | `overflow-x-auto` | Editar/Toggle via botões inline    |
| AuditoriaPage            | ❌                          | ❌                 | `overflow-x-auto` | Expandir (accordion) + copiar JSON |
| RelatoriosGerenciaisPage | ❌                          | ❌                 | não avaliado      | nenhuma                            |

**Consequências:**

- Padding das células varia: algumas usam `px-4 py-3`, outras `px-6 py-4`
- Estilo de `<th>` varia: algumas `uppercase tracking-wider`, outras sem
- Ausência de estado vazio padronizado nas tabelas (umas mostram ícone+texto, outras apenas texto)
- Sem suporte a seleção de múltiplos registros (checkbox) em nenhuma tabela

---

### 3.4 Filtros e Busca

**Problema:** Padrões inconsistentes de filtro em páginas diferentes.

| Aspecto          | EtapaOperacional           | MeuHistórico              | ProducaoPage                | AuditoriaPage |
| ---------------- | -------------------------- | ------------------------- | --------------------------- | ------------- |
| Componente Input | raw HTML                   | raw HTML                  | raw HTML                    | raw HTML      |
| Debounce busca   | `useDebounce` hook (300ms) | `useRef` manual (400ms)   | `useEffect` + state (400ms) | não tem busca |
| URL sync         | ✅                         | ✅                        | ✅                          | ✅            |
| Limpar filtros   | ✅ botão                   | ✅ botão                  | não tem botão               | não tem botão |
| Presets de data  | ❌                         | ✅ (Hoje/7d/Mês/Mês ant.) | ❌                          | ❌            |

**Inconsistência de debounce:** Três implementações diferentes para a mesma necessidade. A correta é `useDebounce` (hook existente), mas só `EtapaOperacionalPage` a usa.

---

### 3.5 Formulários

| Página           | Usa `<Input>` | Usa `<Select>` | Validação     | Erro exibido     |
| ---------------- | ------------- | -------------- | ------------- | ---------------- |
| Login            | ✅            | N/A            | blur-based    | inline no campo  |
| LancarProdução   | ✅ (parcial)  | ✅ (parcial)   | submit        | toast            |
| Usuários         | ✅            | ✅             | submit        | ActionFeedback   |
| Projetos         | ❌ raw HTML   | ❌ N/A         | submit        | Alert            |
| AuditoriaFiltros | ❌ raw HTML   | ❌ raw HTML    | N/A (filtros) | inline p.text-xs |

**Bug semântico em LancarProducaoPage:** O `<Select>` de etapa usa `value={formData.funcao}` e cada `<option>` tem `value={etapa.label}` — o campo é nomeado `funcao` mas armazena a label da etapa. Isso torna o binding confuso e propenso a erros em submit/validação.

**Uso de `confirm()` nativo:** `ProjetosPage.tsx` usa `if (!confirm('...'))` ao invés do componente `<ConfirmDialog>`. Isso quebra a UI quando a ação de exclusão é chamada.

---

### 3.6 Header

O `Header.tsx` é extremamente minimalista:

- Desktop: apenas breadcrumb gerado de `title.split(' - ')` (string estática)
- Mobile: ícone de hamburguer + nome da página truncado
- **Ausente:** perfil do usuário, avatar, notificações, ações contextuais

O breadcrumb é gerado de uma string estática passada via `usePageTitle()`. Não reflete a estrutura de roteamento real — se o título não contiver `-`, não há separação de nível.

---

### 3.7 Sidebar

- **Seções inicialmente colapsadas:** Seções inativas iniciam `expanded = isActive`. Quando o usuário navega para uma rota diferente da atual, todas as seções ficam fechadas — o menu lateral fica colapsado e o usuário precisa clicar para expandir a seção desejada. Isso gera fricção em navegação frequente.
- **Cor ativa hardcoded:** Item ativo usa `bg-blue-600 text-white` em vez de `bg-[var(--color-primary-600)] text-white`.
- **Colapso total (ícone-only):** No modo `w-16`, os ícones ficam visíveis mas sem tooltip. Em acessibilidade, o usuário de leitor de tela não tem label visível.

---

### 3.8 Navegação Mobile

`MobileBottomNav` oferece atalhos distintos por perfil:

| Perfil           | Itens na bottom nav                             |
| ---------------- | ----------------------------------------------- |
| admin / operador | Dashboard · Recebimento · Produção · Relatórios |
| colaborador      | Dashboard · Produção · Histórico                |

**Lacunas:**

- Admin não consegue acessar **Configurações** pela bottom nav em mobile — precisa abrir o sidebar overlay.
- Admin não acessa **Auditoria** em mobile via bottom nav.
- Não há acesso a **Conhecimento Operacional** na bottom nav.
- O menu de Operação (Recebimento, CQ, Conhecimento) não tem representação direta — apenas "Recebimento" aparece.

---

## 4. Problemas por Tela

| Tela                         | Problemas Identificados                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Login**                    | Nenhum problema relevante. Página mais consistente.                                                                                                                             |
| **Dashboard (colaborador)**  | `border-opacity-50` deprecated; `text-2xl font-bold text-gray-900` hardcoded; tabela de histórico inline                                                                        |
| **Lançar Produção**          | `bg-blue-600` hardcoded no botão "Adicionar"; `value={formData.funcao}` para armazenar label de etapa (bug semântico); instrução box com `bg-blue-50 border-blue-200` hardcoded |
| **Meu Histórico**            | Todos os filtros em raw HTML; debounce manual via `useRef`; tabela inline; presets usam `bg-blue-600` hardcoded                                                                 |
| **Importar Produção**        | Bom no geral; estado `validacaoResult: any` sem tipagem; `queryClient.fetchQuery` diretamente (não-idiomático para dados de UI)                                                 |
| **Produção (listagem)**      | Filtros raw HTML; ordenação client-side (sem reflexo na URL); botão "Limpar importadas" destrutivo sem destaque                                                                 |
| **Etapa Operacional**        | Maior arquivo da aplicação — 2 fluxos distintos (Recebimento e CQ) num único componente; raw HTML interno; 20+ useState                                                         |
| **Conhecimento Operacional** | Bem feito; auto-select do primeiro item ao carregar; URL sync em todas as abas                                                                                                  |
| **Relatórios Gerenciais**    | Auto-load correto (quando ambas as datas preenchidas); filtros raw HTML; `ordemEtapa()` com lógica `toUpperCase().includes()` frágil                                            |
| **Auditoria**                | Filtros raw HTML; badges de operação com `bg-blue-100 text-blue-800` hardcoded; JSON diff expandível bem implementado                                                           |
| **Usuários**                 | Melhor página de CRUD do sistema — usa Input/Select corretamente; modal com ESC handler                                                                                         |
| **Projetos**                 | `confirm()` nativo; raw HTML no form; TODOs visíveis ao usuário (editar/excluir não implementados); `handleToggleAtivo` não funcional                                           |
| **Empresa / Admin**          | Não analisados em detalhe                                                                                                                                                       |

---

## 5. Responsividade

### Pontos positivos:

- `AppLayout` esconde sidebar no mobile e usa overlay com backdrop
- `MobileBottomNav` com `safe-area-inset-bottom` e `min-h-[60px]`
- Padding adicional no `<main>`: `pb-24` em mobile para evitar sobreposição com bottom nav
- Grids responsivos: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` amplamente usados
- Botões com `touch-manipulation` e `h-11` (44px) em mobile (tamanho mínimo de toque)

### Pontos negativos:

- Tabelas sem estratégia de responsividade além de `overflow-x-auto` — em telas muito pequenas o usuário precisa rolar horizontalmente
- Sem versão de card/stack para tabelas em mobile (pattern comum: mostrar cada linha como card em `< sm`)
- Header mobile mostra apenas o último segmento do título — sem nível hierárquico
- Modais (UsuariosPage, EtapaOperacional) não têm scroll interno garantido em viewport pequeno — podem cortar conteúdo
- `ConhecimentoOperacionalPage` tem layout de dois painéis (lista + detalhe) que não colapsa em mobile

---

## 6. Navegação e Estrutura

### Estrutura de Rotas (resumo)

```
/                     → Dashboard (por perfil)
/login                → Login
/colaborador/lancar   → Lançar Produção
/colaborador/historico → Meu Histórico
/producao             → Produção (listagem)
/producao/importar    → Importar Produção
/producao/vincular    → Vincular Produções (← existe na rota, mas NÃO está no menu)
/operacao/conhecimento → Conhecimento Operacional
/operacao/:etapa      → Etapa Operacional (recebimento | controle-qualidade)
/relatorios           → Relatórios Gerenciais
/auditoria            → Auditoria (geral)
/auditoria/importacoes → Auditoria de Importações
/auditoria/ocr        → Auditoria de OCR
/auditoria/correcoes  → Auditoria de Correções
/auditoria/acoes      → Ações de Usuários
/configuracoes        → Redirect → /configuracoes/empresa
/configuracoes/empresa → Empresa
/configuracoes/usuarios → Usuários
/configuracoes/projetos → Projetos
/configuracoes/admin  → Configurações Admin
```

### Problemas de navegação:

1. **Rota fantasma:** `/producao/vincular` (`VincularProducoesPage`) existe nas rotas mas não aparece no menu lateral — inacessível pela UI sem URL direta.
2. **ETAPA_MAP incompleto:** Em `EtapaOperacionalPage`, `ETAPA_MAP` só mapeia `recebimento` e `controle-qualidade`. Qualquer slug diferente mostra "Etapa inválida", mesmo que seja uma rota legítima futura.
3. **Breadcrumb estático:** `Header.tsx` gera breadcrumb de `title.split(' - ')`. Se o título não tiver `-`, não há hierarquia visível. O título não muda com sub-rotas/abas (ex: Auditoria > Importações não reflete no header).
4. **Seções do menu colapsadas:** Ao navegar entre seções, as seções não-ativas fecham. Não há persistência de estado de expansão (ex: em localStorage).

---

## 7. Tabelas, Filtros e Ordenações

### Estado atual:

- Nenhuma abstração de `<Table>`. Cada página recria `<table>`, `<thead>`, `<tbody>`, `<th>`, `<td>` do zero.
- Padding inconsistente: `px-4 py-3` vs `px-6 py-4`
- `<th>` inconsistente: algumas com `uppercase tracking-wider`, outras sem
- Apenas `ProducaoPage` implementa ordenação por coluna (client-side, sem URL sync)
- Todas as tabelas usam `overflow-x-auto` mas sem estratégia responsiva real para mobile
- Nenhuma tabela suporta seleção múltipla (checkboxes)
- Estado vazio varia: icon + texto vs apenas texto vs nada

### Filtros:

- URL sync correto e consistente em todas as páginas que têm filtros
- `keepPreviousData` usado em `MeuHistoricoPage` e `EtapaOperacionalPage` para UX suave ao paginar
- Presets de data apenas em `MeuHistoricoPage` — deveriam existir em `ProducaoPage`, `RelatoriosGerenciaisPage` e `AuditoriaPage`
- `RelatoriosGerenciaisPage` tem auto-load inteligente (só busca quando ambas as datas estão preenchidas), mas a lógica está diretamente no componente

---

## 8. Formulários

### Boas práticas presentes:

- `Login.tsx` e `UsuariosPage.tsx` usam os componentes `Input`/`Select` corretamente
- Validação com mensagens de erro inline (Login)
- `ConfirmDialog` para ações destrutivas (na maioria das páginas)
- `PageState` para estados de loading/error/empty
- `useToastHelpers` para feedback não-bloqueante após mutações

### Problemas:

| Problema                                      | Arquivos                                                | Impacto                                  |
| --------------------------------------------- | ------------------------------------------------------- | ---------------------------------------- |
| Raw `<input>` em filtros                      | MeuHistorico, Auditoria, Relatórios, Producao, Projetos | Inconsistência visual                    |
| Raw `<select>` em filtros                     | MeuHistorico, Auditoria, EtapaOperacional (interno)     | Inconsistência visual                    |
| `confirm()` nativo                            | ProjetosPage                                            | Quebra a UI, sem suporte a loading state |
| Campo `funcao` armazena label de etapa        | LancarProducaoPage                                      | Bug semântico, dificulta debug           |
| Nenhum form usa `react-hook-form` ou Zod      | todas                                                   | Validação manual inconsistente           |
| Botão "Adicionar" órgão inline sem componente | LancarProducaoPage                                      | Inconsistência visual e sem loading      |

---

## 9. Performance Percebida

### Positivo:

- `React.lazy` + `Suspense` em todas as 17 rotas → code splitting automático
- `keepPreviousData` em queries paginadas → sem flicker ao mudar página
- `useDebounce` (quando usado) → evita requisições excessivas
- `animate-fade-in-up` na transição de rotas → sensação de fluidez
- `active:scale-[0.97]` nos botões → feedback tátil imediato
- Count-up animado no Dashboard → percepção de dinamismo

### Negativo:

- `EtapaOperacionalPage` carrega lógica de dois painéis distintos em um único bundle → bundle desnecessariamente grande
- `RelatoriosGerenciaisPage` faz auto-fetch ao mudar qualquer filtro sem debounce — pode gerar requisições excessivas ao alterar datas rapidamente
- `Dashboard.tsx` usa `rAF` (requestAnimationFrame) manual para count-up — funciona, mas poderia usar `framer-motion` ou CSS counter para simplificar
- Ausência de `Skeleton` loading nas tabelas — usa apenas o spinner central (`PageState loading`)

---

## 10. Proposta de Design System

O sistema de tokens já é correto. O único ajuste é padronizar o uso. Proposta:

### 10.1 Consolidar a cor primária

Remover toda referência a `blue-*` do Tailwind padrão. Usar exclusivamente:

```css
/* ✅ Correto */
bg-[var(--color-primary-600)]
text-[var(--color-primary-600)]
border-[var(--color-primary-300)]
focus:ring-[var(--color-primary-100)]

/* ❌ Eliminar */
bg-blue-600
text-blue-600
border-blue-500
focus:ring-blue-200
```

Alternativa mais ergonômica: adicionar alias no `tailwind.config.js`:

```js
// tailwind.config.js — já tem isso, apenas garantir que está sendo usado
theme: {
  extend: {
    colors: {
      primary: { 600: 'var(--color-primary-600)', ... }
    }
  }
}
// Uso: bg-primary-600 em vez de bg-[var(--color-primary-600)]
```

### 10.2 Tipografia padronizada

Criar classes utilitárias para padrões repetidos:

| Classe proposta | CSS equivalente                                               | Uso atual (hardcoded)      |
| --------------- | ------------------------------------------------------------- | -------------------------- |
| `heading-page`  | `text-2xl font-bold text-[var(--color-text-primary)]`         | Todos os títulos de página |
| `subtext-page`  | `text-sm text-[var(--color-text-secondary)] mt-1`             | Subtítulos de página       |
| `label-filter`  | `text-xs font-medium text-[var(--color-text-secondary)] mb-1` | Labels de filtros          |

---

## 11. Componentes que Devem ser Criados ou Padronizados

### 11.1 `<Table>` — **Crítico**

Componente reutilizável de tabela com:

- `<Table>`, `<TableHead>`, `<TableBody>`, `<TableRow>`, `<TableCell>`, `<TableHeader>`
- Suporte a ordenação por coluna (com ícone de seta e callback `onSort`)
- Estado vazio integrado (ícone + título + descrição)
- `overflow-x-auto` embutido
- Versão responsiva mobile: `hidden sm:table-cell` nas colunas secundárias

### 11.2 `<FilterBar>` — **Alta prioridade**

Wrapper para a barra de filtros padrão:

- Usa `Input`, `Select`, `Button` internamente (nunca raw HTML)
- Slot para filtros à esquerda + botão "Limpar" à direita
- Suporte a presets de data reutilizáveis

### 11.3 `<DateRangePicker>` — **Média prioridade**

Combo de data início + data fim com:

- Presets: Hoje, 7 dias, Este mês, Mês passado, Período personalizado
- Validação de `max`/`min` sincronizados entre os dois campos
- Usa os tokens do sistema

### 11.4 `<PageHeader>` — **Média prioridade**

Cabeçalho de página padronizado:

```tsx
<PageHeader
  title="Meu Histórico"
  subtitle="Acompanhe sua produção"
  actions={<Button variant="primary">Nova ação</Button>}
/>
```

Substitui o padrão manual `<h1 className="text-2xl font-bold text-gray-900">` repetido em todas as páginas.

### 11.5 `useDebounce` — Garantir adoção

O hook `useDebounce` já existe. Todas as páginas devem usá-lo em vez de `useRef` manual. Remover debounce ad-hoc de `MeuHistoricoPage` e `ProducaoPage`.

### 11.6 `<EmptyState>` — Integrar ao `<Table>`

`PageState` já tem um `empty` state. Deve ser aproveitado (ou extraído) para estado vazio de tabelas.

---

## 12. Ordem Recomendada de Implementação

### Sprint 1 — Fundação (sem impacto funcional, apenas visual)

1. **Padronizar cor primária:** substituir todas as ocorrências de `blue-*` por tokens ou por `primary-*` via Tailwind config.  
   _Arquivos:_ Sidebar.tsx, MeuHistoricoPage.tsx, LancarProducaoPage.tsx, AuditoriaPage.tsx, ProjetosPage.tsx, ConfirmDialog.tsx, ActionMenu.tsx, Dashboard.tsx

2. **Corrigir `border-opacity-50`** no Dashboard.tsx → `border-gray-100/50` (sintaxe moderna Tailwind v3)

3. **Sidebar:** item ativo com token; seções persistem estado de expansão em localStorage ou mantêm abertas as anteriores via `defaultExpanded`.

### Sprint 2 — Componentes base

4. **Criar `<Table>` e subcomponentes** (TableHead, TableRow, TableCell, TableHeader)
5. **Criar `<PageHeader>`** e substituir em todas as páginas
6. **Criar `<DateRangePicker>`** com presets reutilizáveis
7. **Criar `<FilterBar>`** que orquestra os filtros com componentes UI

### Sprint 3 — Migração de páginas (maior impacto UX)

8. **MeuHistoricoPage:** substituir raw HTML por `Input`/`Select`, usar `useDebounce`, usar `<Table>`
9. **ProducaoPage:** mesmo que MeuHistoricoPage; migrar ordenação para URL params
10. **AuditoriaPage:** substituir raw HTML por `Input`/`Select`; corrigir badges hardcoded
11. **RelatoriosGerenciaisPage:** substituir raw HTML por `Input`/`Select`; adicionar debounce no auto-load
12. **ProjetosPage:** remover `confirm()` nativo → `<ConfirmDialog>`; implementar edição/exclusão ou ocultar botões com TODO

### Sprint 4 — Header e navegação

13. **Header:** adicionar avatar/nome do usuário no canto direito; notificações (placeholder); ações contextuais por página
14. **MobileBottomNav:** adicionar item "Mais" (ellipsis) com sheet/drawer para Configurações e Auditoria no mobile
15. **Breadcrumb:** implementar breadcrumb real baseado em rota atual (React Router `useMatches`)

### Sprint 5 — Refatoração de páginas complexas

16. **LancarProducaoPage:** corrigir bug `funcao`/`etapa`; migrar botão "Adicionar" inline para componente `Button`
17. **EtapaOperacionalPage:** dividir em `RecebimentoPage` e `ControleQualidadePage`; extrair lógica de OCR em hook dedicado
18. **Adicionar `/producao/vincular`** ao menu lateral ou remover a rota

---

## 13. Próximos Prompts de Correção

Os prompts abaixo podem ser executados em sequência após aprovação:

---

### Prompt 1 — Padronizar cor primária

```
Substitua todas as ocorrências de classes Tailwind hardcoded de azul padrão (blue-*)
pelas classes do sistema de tokens do Recorda nos seguintes arquivos:

- packages/frontend/src/components/layout/Sidebar.tsx
  - Item ativo: `bg-blue-600 text-white` → `bg-[var(--color-primary-600)] text-white`

- packages/frontend/src/components/ui/ConfirmDialog.tsx
  - variantStyles.default: `text-blue-600` → `text-[var(--color-primary-600)]`

- packages/frontend/src/components/ui/ActionMenu.tsx
  - hover do item default: `hover:bg-blue-50 hover:text-blue-700` → `hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)]`

- packages/frontend/src/pages/colaborador/MeuHistoricoPage.tsx
  - Preset ativo: `bg-blue-600 text-white border-blue-600` → tokens primary-600
  - Preset hover: `hover:border-blue-400 hover:text-blue-600` → tokens primary-400/600
  - Inputs: `focus:border-blue-500 focus:ring-1 focus:ring-blue-500` → tokens
  - Ícone stat card: `text-blue-600` → `text-[var(--color-primary-600)]`

- packages/frontend/src/pages/colaborador/LancarProducaoPage.tsx
  - Botão "Adicionar" inline: `bg-blue-600` → token
  - Caixa de instrução: `bg-blue-50 border-blue-200` → tokens primary-50/200

- packages/frontend/src/pages/auditoria/AuditoriaPage.tsx
  - focus dos inputs: `focus:ring-blue-500` → token
  - badge INSERT: `bg-blue-100 text-blue-800` → `bg-[var(--color-primary-100)] text-[var(--color-primary-800)]`
  - badge UPDATE: `bg-blue-50 text-blue-700` → tokens

- packages/frontend/src/pages/configuracoes/ProjetosPage.tsx
  - checkbox: `text-blue-600 focus:ring-blue-500` → tokens
  - raw input focus: `focus:ring-blue-500 focus:border-blue-500` → tokens

Não altere nenhuma lógica ou estrutura. Apenas substitua as classes de cor.
```

---

### Prompt 2 — Criar componente Table

```
Crie o arquivo packages/frontend/src/components/ui/Table.tsx com os seguintes
subcomponentes exportados:

- Table: wrapper com overflow-x-auto + min-w-full
- TableHead: <thead> com bg-[var(--color-gray-50)]
- TableBody: <tbody> com divide-y divide-[var(--color-border-primary)]
- TableRow: <tr> com hover:bg-[var(--color-gray-50)] transition-colors
- TableHeader: <th> — text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide px-4 py-3 text-left
- TableCell: <td> — text-sm text-[var(--color-text-primary)] px-4 py-3

Usar tokens CSS (var(--color-*)) em vez de classes Tailwind hardcoded para cores.
Adicionar suporte a prop `colSpan` no TableCell para estado vazio.
Sem dependências externas além do React.
```

---

### Prompt 3 — Migrar MeuHistoricoPage para componentes UI

```
Em packages/frontend/src/pages/colaborador/MeuHistoricoPage.tsx:

1. Substituir todos os <input type="date"> pelos componentes <Input> importados de
   '../../components/ui/Input', passando type="date", label, value e onChange.

2. Substituir o <select> de Etapa pelo componente <Select> importado de
   '../../components/ui/Select', com options={etapasDisponiveis.map(e => ({value: e, label: e}))}.

3. Substituir o <input type="text"> de busca por <Input> com leftIcon="search".

4. Substituir o debounce manual via useRef por importação do hook useDebounce:
   import { useDebounce } from '../../hooks/useDebounce';
   E usar: const busca = useDebounce(buscaInput, 400);
   Removendo o estado `busca` separado e o ref `buscaDebounce`.

5. Substituir a <table> inline pela composição Table/TableHead/TableBody/TableRow/
   TableHeader/TableCell criados no Prompt 2.

Não altere a lógica de filtros, URL sync, presets de data, paginação ou queries.
```

---

### Prompt 4 — PageHeader e padronização de títulos

```
Crie o componente packages/frontend/src/components/ui/PageHeader.tsx:

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions, badge }: PageHeaderProps): JSX.Element {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

Em seguida, substitua os blocos de título manual em todas as páginas que usam o padrão:
  <div>
    <h1 className="text-2xl font-bold text-gray-900">...</h1>
    <p className="text-gray-500 mt-1">...</p>
  </div>

Páginas a atualizar: MeuHistoricoPage, ProducaoPage, AuditoriaPage, RelatoriosGerenciaisPage,
UsuariosPage, ProjetosPage, ConhecimentoOperacionalPage.
```

---

### Prompt 5 — Corrigir ProjetosPage

```
Em packages/frontend/src/pages/configuracoes/ProjetosPage.tsx:

1. Substituir `if (!confirm(...))` por uma chamada ao useConfirmDialog (padrão do projeto):
   import { useConfirmDialog } from '../../hooks/useConfirmDialog';
   const confirmDialog = useConfirmDialog();

   handleExcluir deve chamar confirmDialog.confirm({...}) em vez de window.confirm().
   Adicionar <ConfirmDialog state={confirmDialog.state} ... /> no JSX.

2. Substituir os <input> raw do formulário pelos componentes <Input> do UI lib.

3. Ocultar os botões Editar e Toggle de projetos da lista (ou exibir Badge "Em breve")
   enquanto os endpoints não estiverem implementados — evitar expor TODOs visíveis ao usuário.

4. Corrigir: handleToggleAtivo não recebe parâmetro `projeto` mas precisa saber qual projeto
   foi clicado — ajustar a assinatura.
```

---

### Prompt 6 — Header com info do usuário

```
Em packages/frontend/src/components/layout/Header.tsx, adicione no lado direito do header:

1. Nome e perfil do usuário (obtidos via useAuth()) — exibir apenas no desktop (hidden sm:flex)
2. Avatar circular com inicial do nome (bg-[var(--color-primary-100)] text-[var(--color-primary-700)])
3. Botão de logout secundário (icon-only com ghost variant) ao lado do avatar

Manter o breadcrumb existente à esquerda sem alterações.
Usar flexbox: justify-between entre breadcrumb e área de usuário.
```

---

### Prompt 7 — MobileBottomNav com acesso a mais seções

```
Em packages/frontend/src/components/layout/MobileBottomNav.tsx:

Para os perfis admin e operador, adicionar um 5º item "Mais" (icon: menu) que ao ser clicado
abre um Bottom Sheet (div fixo na parte inferior com backdrop) listando:
- Configurações (ícone settings) → navegar para /configuracoes
- Auditoria (ícone activity) → navegar para /auditoria
- Conhecimento (ícone book) → navegar para /operacao/conhecimento

O Bottom Sheet deve:
- Animar de baixo para cima (transform translateY)
- Fechar ao clicar no backdrop
- Fechar ao clicar em qualquer item
- Ter z-index acima da bottom nav (z-50)

Não alterar os 4 itens existentes nem a lógica de perfil colaborador.
```

---

_Diagnóstico gerado por análise estática de código — julho de 2025_
