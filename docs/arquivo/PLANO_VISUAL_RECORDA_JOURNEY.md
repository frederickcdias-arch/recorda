# Plano Visual, Textual e Responsivo do Recorda

> Documento oficial de continuidade do plano visual do Recorda.
> Qualquer IA (GPT, Claude, Gemini) pode retomar a execução a partir deste arquivo.

---

## 1. Regra Central

**Journey = sensação, NÃO paleta.**

O Recorda adota a sensação estética do Journey (calma, respiração, silêncio, foco, ausência de ruído visual) como princípio de design — mas preserva integralmente a identidade cromática azul-índigo do Recorda.

Não introduzir: areia, âmbar, terracota, off-white quente.
A cor `#444ce7` (primary-600) é a identidade do Recorda e **nunca pode ser alterada**.

---

## 2. Identidade Cromática

| Token                 | Valor         | Uso                              |
| --------------------- | ------------- | -------------------------------- |
| `--color-primary-600` | `#444ce7`     | Identidade do Recorda — imutável |
| `--color-primary-50`  | `#eef4ff`     | Fundo de active states discretos |
| `--color-primary-100` | `#e0eaff`     | Badges informativos de contagem  |
| `--color-primary-300` | `#a4bcfd`     | Focus rings                      |
| `--color-primary-700` | (dark indigo) | Texto sobre fundo primary-50     |

### Regra 60/30/10

| Proporção | Uso                                                                 |
| --------- | ------------------------------------------------------------------- |
| **60%**   | Branco (`#ffffff`) e gray-50 — superfícies, fundos, cards           |
| **30%**   | Cinza — textos, bordas, estrutura de navegação                      |
| **10%**   | Primary-600 (`#444ce7`) — ações primárias, indicadores ativos, foco |

O problema identificado no diagnóstico original não era a cor, era a **proporção**: primary-600 aparecia em >20% das superfícies. Corrigido na Fase 1.

---

## 3. Regras Visuais

### Cards

- Hover shadow: `shadow-sm` (nunca `shadow-md` ou maior em hover de cards comuns)
- Transição: `duration-200` mínimo
- Raio interno: `rounded-xl`; `rounded-2xl` apenas em cards de nível de página quando necessário

### Badges

- Informativos (contagem, status): `bg-primary-100 text-primary-700` ou neutro (`bg-gray-100 text-text-secondary`)
- Alerta real: `bg-error-600 text-white` — apenas para ações destrutivas confirmadas
- Bordas visíveis apenas em `error` e `default`; demais variantes usam `border-transparent`
- Peso: `font-medium` (nunca `font-bold` em badges)

### Botões

- Transição: `duration-200`
- Focus rings: `ring-2` (nunca `ring-[3px]`)
- Hierarquia de ações destrutivas: Confirmar (`success`) > Ação secundária (`ghost`) > Cancelar (`ghost`)
- Ações de cancelamento: variant `ghost`, não `secondary` nem `danger`

### Tabelas

- Cabeçalhos: `text-xs font-medium` — sem `uppercase`, sem `tracking-wide`, sem `font-semibold`
- Hover de linha: `hover:bg-[var(--color-bg-secondary)]`
- Divisores: `divide-[var(--color-border-primary)]`
- Thead background: `bg-[var(--color-bg-secondary)]`

### Modais

- Overlay: `bg-black/40` (nunca `bg-black/55` ou maior)
- Sombra do painel: `shadow-xl` (nunca `shadow-2xl`)
- Sem parágrafos longos — descrições máx. 1 linha
- Border inferior do header: `border-[var(--color-border-primary)]`

### Navegação

- Active state de sidebar: `border-l-2 border-primary-600 bg-primary-50 text-primary-700` — nunca fill sólido
- Badges de contagem na nav: `bg-primary-100 text-primary-700` — nunca `bg-error-600`
- Subtítulos de layout e nav: remover frases genéricas e óbvias

### Sombras

- Cards hover: `shadow-sm`
- Modais: `shadow-xl`
- Tabs ativas: `shadow-sm` (sem cor)

### Transições

- Mínimo `duration-200` para todas as interações visíveis
- `--ease-bounce` não usar em interações funcionais

### Section Headers Internos

- Nunca usar `bg-primary-*` sólido em headers internos
- Padrão: `bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)]` + `text-[var(--color-text-primary)]`

### Ícones de Estado

- Vazio/erro: máx. `h-10 w-10` (nunca `h-16 w-16`)

### Tokens de Cor

- **Sempre CSS vars**: `text-[var(--color-text-primary)]`, `bg-[var(--color-bg-secondary)]`, etc.
- **Nunca** classes Tailwind raw: `text-gray-900`, `bg-gray-50`, `border-gray-200`

---

## 4. Regras Textuais

1. Subtítulos de `PageHeader`: ≤ 60 caracteres; se óbvio, remover
2. Títulos de página: `font-semibold` (nunca `font-bold` em H1 de interface)
3. Títulos de itens de menu: ≤ 25 caracteres
4. Mensagens de estado vazio: máx. 1 linha curta — sem parágrafos explicativos
5. Não repetir o óbvio: "Consulte os comunicados" → "Seus comunicados internos."
6. `CardHeader` descriptions: remover quando o título já é auto-explicativo; máx. 1 linha quando necessário
7. Mensagens de erro: usar `error.message` como título (não texto fixo)
8. Caixa alta (`uppercase`): não usar em labels de cards, cabeçalhos de tabela ou botões secundários
9. Textos de modal: sem parágrafos longos; placeholder é suficiente em campos de motivo
10. Títulos de modal: usar em-dash (—) e acentos corretos

---

## 5. Regras Responsivas

1. Container máximo: `max-w-[1280px]` — não ultrapassar
2. Inputs/selects: `h-11 sm:h-9` (44px mobile, 36px desktop) — previne zoom no iOS
3. Font-size em inputs: mínimo `16px` em mobile (já em `index.css`)
4. Bottom nav mobile: sem subtítulos nas sheets; badges compactos
5. Tabelas: usar `hideOnMobile` em colunas secundárias
6. Grid gaps: `gap-4 sm:gap-6` (respiro menor em mobile, normal em sm+)
7. `FilterBar` mobile: colapso com botão "Filtros / Ocultar"; em `sm+` sempre visível
8. Cards de insight/ação: `padding="md"` em mobile para reduzir rolagem
9. Empty states: padding reduzido em mobile (`p-8` em vez de `p-12`)

---

## 6. Histórico de Fases Executadas

### Fase 1 — Fundação Visual (Julho 2025)

**Objetivo:** Calibrar tokens de duração/sombra, sidebar active state, tipografia base e estados vazios.

**Arquivos alterados:**

- `styles/design-tokens.css` — durations calibradas (150ms→200ms base), focus rings 3px→2px
- `index.css` — body color → CSS var
- `components/ui/Button.tsx` — duration-200, ring-2
- `components/ui/Card.tsx` — hover shadow-sm, duration-200
- `components/ui/Input.tsx` / `Select.tsx` — duration-200, ring-2
- `components/ui/Modal.tsx` — overlay bg-black/40, shadow-xl
- `components/ui/Table.tsx` — headers sem uppercase/tracking-wide → font-medium
- `components/ui/PageState.tsx` — ícone h-10, erro usa error.message como título
- `components/ui/PageHeader.tsx` — título font-semibold
- `components/layout/AppLayout.tsx` — max-w-[1280px]
- `components/layout/Sidebar.tsx` — active state border-l-2, badges primary-100; subtítulo removido
- `components/layout/MobileBottomNav.tsx` — subtítulo removido, badges primary-100
- `pages/ComunicadosPage.tsx`, `RelatorioAusenciasPage.tsx`, `MinhasAusenciasPage.tsx`, `AusenciasPage.tsx`

**Validação:** typecheck ✓ / build ✓

---

### Fase 2 — Densidade, Filtros e Páginas (Julho 2025)

**Objetivo:** Reduzir densidade real das telas — filtros colapsáveis mobile, badges mais suaves, hierarquia de ações corrigida.

**Arquivos alterados:**

- `components/ui/Icon.tsx` — ícones chevron-up e filter adicionados
- `components/ui/Badge.tsx` — border-transparent em primary/success/warning/info; apenas error e default com borda visível
- `components/ui/FilterBar.tsx` — colapso mobile com prop activeCount; em sm+ sempre visível
- `config/menu.ts` — ícone settings (era alert-triangle); labels com acentos corretos
- `pages/ComunicadosPage.tsx` (user + admin) — badges simplificados, ícones menores, empty state compacto
- `pages/configuracoes/AusenciasPage.tsx` — botões Rejeitar/Cancelar → ghost; modal simplificado
- `pages/colaborador/MinhasAusenciasPage.tsx` — título e texto de cancelamento corrigidos
- `pages/relatorios/RelatorioAusenciasPage.tsx` — SummaryCard text-xl font-semibold tabular-nums

**Decisões registradas:**

- Badges: bordas visíveis só em `error` (alerta real) e `default` (neutro estrutural)
- FilterBar mobile: toggle como `Button variant="secondary" size="sm"` com `icon="filter"`
- Hierarquia de ações: Aprovar (success) > Rejeitar (ghost) > Cancelar (ghost)
- `uppercase tracking-wide` removidos de labels — criam ruído sem acrescentar hierarquia

**Validação:** typecheck ✓ / build ✓

---

### Fase 3-A — Dashboard e Feedbacks Visuais (Maio 2026)

**Objetivo:** Reduzir densidade do Dashboard, suavizar ícones, progress bars, cards de status e toasts.

**Arquivos alterados:**

- `pages/Dashboard.tsx` — ícones menores (h-10→h-8), progress bars h-3→h-2, CQ card neutro (primary-50→bg-secondary), 6 CardHeader descriptions removidas, subtítulo admin removido, InsightCard neutro
- `components/ui/Toast.tsx` — largura 420px→380px
- `components/ui/Skeleton.tsx` — padding p-6→p-5, skeleton number h-6 w-14

**Decisões registradas:**

- Retrabalho CQ: dado operacional, não alerta → fundo neutro
- InsightCard: ícone cinza, não primary (atalhos ≠ alertas)
- Progress bars h-2: transmite mesma informação com menos agressividade
- "Atualizado agora" removido de todos os StatCards — óbvio e repetitivo

**Validação:** typecheck ✓ / build ✓ (84 entries precached)

---

### Fase 3-B — Relatórios, Usuários e Configurações (Maio 2026)

**Objetivo:** Refinamento visual de páginas administrativas não-críticas.

**Arquivos alterados:**

- `pages/relatorios/RelatoriosGerenciaisPage.tsx` — section headers neutros (bg-secondary border-b)
- `pages/relatorios/ExportacoesPage.tsx` — números text-base font-semibold; título de modal com em-dash
- `pages/configuracoes/UsuariosPage.tsx` — avatares h-8 gray-100; labels font-medium
- `pages/configuracoes/AdminPage.tsx` — CardHeader descriptions encurtadas
- `pages/configuracoes/ProjetosPage.tsx` — labels uppercase removido
- `pages/configuracoes/EmpresaPage.tsx` — rounded-2xl→rounded-xl em containers; subtítulos encurtados

**Padrão aplicado:** labels uppercase→font-medium; números text-2xl→text-xl; section headers neutros; avatares h-8 gray-100; rounded-2xl→rounded-xl em containers internos; CardHeader descriptions removidas/encurtadas.

**Validação:** typecheck ✓ / build ✓ (~237ms, 84 entries precached)

---

### Fase 3-C — Páginas Operacionais Intermediárias (Maio 2026)

**Objetivo:** Padronizar grays/blues hardcoded → CSS vars; reduzir textos de orientação; simplificar badges.

**Arquivos alterados:**

- `pages/operacao/AuditoriaPage.tsx` — empty state compacto (py-10 h-8); grays → CSS vars; mobile card sem uppercase
- `pages/operacao/ProducaoPage.tsx` — subtitle lowercase; badges total_itens neutros; coordenadoria text-text-primary
- `pages/operacao/DevolucoesPage.tsx` — preview container neutro (bg-secondary); rounded-2xl→rounded-xl; blues → primary CSS vars
- `pages/operacao/ConhecimentoOperacionalPage.tsx` — "Glossário de Gestão Documental" → "Glossário"; "Legislação e Normas..." → "Leis e Normas"; label busca → "Buscar"; hint de exportação → title no botão

**Decisões registradas:**

- `text-orange-500` para INATIVO: mantido (cor semântica de aviso, não identidade)
- Botão "Limpar produções importadas": mantido `variant="danger"` (ação destrutiva real)
- URL links de leis: `hover:text-[var(--color-primary-600)]` mantido (identificação de link navegável)
- Tabs no ConhecimentoOperacional: ativa usa `bg-[var(--color-bg-primary)] shadow-sm` — sem fill primary

**Validação:** typecheck ✓ / build ✓ (~538ms, 84 entries precached)

---

### Fase 3-D — EtapaOperacional e ControleQualidade (Maio 2026)

**Objetivo:** Concluir padronização CSS vars nas páginas operacionais críticas; simplificar badges e textos; remover uppercase de tabelas.

**Arquivos alterados:**

- `pages/operacao/EtapaOperacionalPage.tsx`
- `pages/operacao/ControleQualidadePanel.tsx`

**Principais mudanças — EtapaOperacionalPage:**

- Subtitle: "Gestão operacional por etapa." → "Fila operacional."
- Summary card counter: primary-700 font-bold uppercase → CSS var font-medium
- Sub-tabs border/texto: gray hardcoded → CSS vars
- Etiquetas — descrição: texto longo → "Agrupa 4 etiquetas por folha, em layout vertical."
- Filtro e form Criar Repositório: grays → CSS vars
- Mobile e desktop: badges de processo bg-primary-100 font-bold → bg-secondary font-medium
- Table headers: font-semibold uppercase → font-medium (sem uppercase)
- Todos os grays/blues hardcoded → CSS vars

**Principais mudanças — ControleQualidadePanel:**

- Badge APROVADO: "OK Aprovado" bg-green-100 font-semibold → "Aprovado" bg-green-50 font-medium
- Badge REPROVADO: "X Reprovado" bg-red-100 font-semibold → "Reprovado" bg-red-50 font-medium
- Filter buttons: blue-\* → primary CSS vars
- Search inputs: focus:ring-blue-200 → focus:ring primary CSS var
- Lista repos selecionado: bg-blue-50 border-blue-300 → primary CSS vars
- Table headers: font-semibold uppercase "Observacao/Acoes" → font-medium "Observação/Ações"
- Empty state: "Nenhum processo cadastrado neste repositorio." → "Nenhum processo cadastrado."
- Termo Combinado: acentos corrigidos; h2/h3 → CSS vars
- Preview modal: border-b e h3 → CSS vars; "Termo de Devolucao" → "Termo de Devolução"

**Validação:** typecheck EXIT 0 / build EXIT 0

---

## 7. Arquivos Já Impactados

```text
packages/frontend/src/styles/design-tokens.css
packages/frontend/src/index.css
packages/frontend/src/config/menu.ts
packages/frontend/src/components/ui/Button.tsx
packages/frontend/src/components/ui/Card.tsx
packages/frontend/src/components/ui/Input.tsx
packages/frontend/src/components/ui/Select.tsx
packages/frontend/src/components/ui/Modal.tsx
packages/frontend/src/components/ui/Table.tsx
packages/frontend/src/components/ui/PageState.tsx
packages/frontend/src/components/ui/PageHeader.tsx
packages/frontend/src/components/ui/Toast.tsx
packages/frontend/src/components/ui/Skeleton.tsx
packages/frontend/src/components/ui/Badge.tsx
packages/frontend/src/components/ui/FilterBar.tsx
packages/frontend/src/components/ui/Icon.tsx
packages/frontend/src/components/layout/AppLayout.tsx
packages/frontend/src/components/layout/Sidebar.tsx
packages/frontend/src/components/layout/MobileBottomNav.tsx
packages/frontend/src/pages/Dashboard.tsx
packages/frontend/src/pages/ComunicadosPage.tsx
packages/frontend/src/pages/colaborador/MinhasAusenciasPage.tsx
packages/frontend/src/pages/relatorios/RelatorioAusenciasPage.tsx
packages/frontend/src/pages/relatorios/RelatoriosGerenciaisPage.tsx
packages/frontend/src/pages/relatorios/ExportacoesPage.tsx
packages/frontend/src/pages/configuracoes/AusenciasPage.tsx
packages/frontend/src/pages/configuracoes/ComunicadosPage.tsx
packages/frontend/src/pages/configuracoes/UsuariosPage.tsx
packages/frontend/src/pages/configuracoes/AdminPage.tsx
packages/frontend/src/pages/configuracoes/ProjetosPage.tsx
packages/frontend/src/pages/configuracoes/EmpresaPage.tsx
packages/frontend/src/pages/operacao/AuditoriaPage.tsx
packages/frontend/src/pages/operacao/ProducaoPage.tsx
packages/frontend/src/pages/operacao/DevolucoesPage.tsx
packages/frontend/src/pages/operacao/ConhecimentoOperacionalPage.tsx
packages/frontend/src/pages/operacao/EtapaOperacionalPage.tsx
packages/frontend/src/pages/operacao/ControleQualidadePanel.tsx
packages/frontend/src/pages/auth/AuthShell.tsx
packages/frontend/src/pages/Login.tsx
packages/frontend/src/pages/ForgotPassword.tsx
packages/frontend/src/pages/ResetPassword.tsx
packages/frontend/src/contexts/ThemeContext.tsx
packages/frontend/src/components/layout/Header.tsx
packages/frontend/src/components/ui/ActionMenu.tsx
packages/frontend/src/components/ui/ConfirmDialog.tsx
docs/arquivo/PLANO_VISUAL_RECORDA_JOURNEY.md
```

---

## 8. O Que Não Pode Mudar

- `--color-primary-600: #444ce7` — identidade cromática imutável
- Princípio conceitual: Journey = sensação, não paleta
- Não introduzir: areia, âmbar, terracota, off-white quente
- `packages/backend` — backend, serviços, controladores
- `packages/shared` — tipos compartilhados, schemas
- Banco de dados — migrations, schemas SQL, scripts de dados
- Rotas e autenticação — estrutura de roteamento, perfis, guards
- Service worker (`sw.ts`) e lógica PWA
- Captura de Mapas — componentes e fluxo
- Importação Histórica — fluxo e regras
- OCR — processamento e lógica
- Regras de CQ — aprovação/reprovação, criação de lotes, critérios
- Ordem de etapas operacionais
- Endpoints de API, payloads, mutations, comportamento funcional

### Fase 3-E — Painéis e Modais de Recebimento/Devolução (Julho 2025)

**Objetivo:** Eliminar todos os `text-gray-*`, `bg-blue-*`, `border-b` sem CSS var e `rounded-2xl` dos painéis e modais do fluxo de Recebimento e Devolução; corrigir bug de `value` removido do `<select>` do Setor.

**Arquivos alterados:**

- `pages/operacao/AvancarEtapaModal.tsx`
- `pages/operacao/BatchAddModal.tsx`
- `pages/operacao/ChecklistModal.tsx`
- `pages/operacao/PdfPreviewModal.tsx`
- `pages/operacao/RecebimentoOcrModal.tsx`
- `pages/operacao/RecebimentoAvulsosPanel.tsx`
- `pages/operacao/RecebimentoLoteModal.tsx`
- `pages/operacao/DevolucaoDetalhePanel.tsx`

**Arquivos SEM alteração (já corretos):**

- `pages/operacao/DevolucaoEditModal.tsx` — tokens já usados corretamente; `border-[var(--color-gray-300)]` é token válido.

**Principais mudanças:**

- Todos os `text-gray-*`, `bg-blue-*`, `border-blue-*` → CSS vars equivalentes
- Overlay: `bg-black/50` → `bg-black/40` (PdfPreviewModal, RecebimentoLoteModal)
- Headers: `border-b` sem token → `border-b border-[var(--color-border-primary)]`
- Botões "Cancelar": `variant="secondary"` → `variant="ghost"`
- Badges: `bg-blue-100 text-blue-700`, `bg-gray-100 text-gray-600` → tokens `bg-tertiary`/`text-secondary`
- Spinners de carregamento: `border-blue-200 border-t-blue-600` → tokens primary
- Apenso rows: `bg-gray-50 border-b` → CSS vars
- Vincular modal inline: `border-blue-500 bg-blue-50` → `border-primary-600 bg-primary-50` tokens
- Textos "font-semibold uppercase tracking-wide" em labels → `font-medium` (DevolucaoDetalhePanel)
- `rounded-2xl` → `rounded-xl` em cards mobile (DevolucaoDetalhePanel)
- `bg-[var(--color-gray-100)]` → `bg-[var(--color-bg-tertiary)]` (DevolucaoDetalhePanel)
- Bug corrigido: `value={form.setorId}` removido acidentalmente de `<select>` em RecebimentoAvulsosPanel — restaurado.

**Validação:** `npm run typecheck` EXIT 0 · `npm run build --workspace=packages/frontend` EXIT 0.

---

### Fase 4-A — Captura de Mapas (Maio 2026)

**Objetivo:** Reduzir ruído visual e textual da Captura de Mapas, com foco em mobile/PWA, sem alterar captura, upload, processamento, OCR ou backend.

**Arquivos alterados:**

- `pages/colaborador/CapturaMapaPage.tsx`
- `docs/arquivo/PLANO_VISUAL_RECORDA_JOURNEY.md`

**Principais mudanças visuais:**

- Header e aviso de retenção simplificados; retenção de 30 dias mantida em card neutro, sem alerta pesado.
- Área principal de captura reorganizada em fluxo de 3 etapas curtas: capturar/enviar, revisar bordas, processar lote.
- Dropzone suavizada com CSS vars e menor contraste agressivo; ações principais ficaram mais claras sem expandir o uso de primary.
- Cards da fila receberam bordas e ações mais confortáveis em touch, com remoção sempre acessível no mobile.
- Preview e editor passaram a usar modais mais leves para tela pequena (`scrollable`), com imagem contida e largura controlada.
- Lista de capturas recentes saiu do padrão “linhas divididas” e virou cards compactos, com melhor leitura em mobile.

**Textos reduzidos:**

- Subtítulo da página encurtado para a sequência essencial do fluxo.
- Instruções permanentes da área de captura reduzidas para formato curto e orientado à ação.
- Ações renomeadas para linguagem direta: `Usar camera`, `Escolher arquivos`, `Baixar todas`, `Limpar fila`, `Atualizar lista`.
- Empty states e ajuda de lista recente simplificados para 1 linha curta quando possível.

**Melhorias mobile/PWA:**

- Botões principais da captura e da lista recente passaram para `size="md"` e largura cheia no mobile.
- Cards da fila ganharam áreas de toque maiores para remover, revisar, visualizar e baixar.
- Preview original/corrigido mantém `object-contain` e `max-h` controlado para nao estourar o container.
- Modais de ajuste e preview agora rolam no overlay, reduzindo peso visual e corte de conteúdo em telas pequenas.
- Ações do lote e da lista recente foram reorganizadas em grids simples no mobile e distribuição equilibrada no desktop.

**O que nao foi alterado:**

- Pipeline técnico de imagem.
- Captura por câmera, upload em lote, correção de perspectiva, OCR e processamento.
- Payloads, endpoints, backend, banco, `packages/shared`, service worker, permissões e rotas.

**Pendências restantes:**

- Revisar `ImportarProducaoPage.tsx` e `Importação Histórica` na próxima fase do mesmo eixo.
- Fazer validação visual manual em dispositivo real/PWA para confirmar conforto de toque e leitura dos estados de fallback.

**Próxima fase recomendada:** Fase 4-B — Importação Histórica, aplicando o mesmo corte de ruído visual/textual sem tocar na lógica.

---

### Fase 4-B — Importação Histórica (Maio 2026)

**Objetivo:** Reduzir ruído visual, textual e responsivo da Importação Histórica / Importar Produção, sem alterar importação, validação, exclusão, payloads ou backend.

**Arquivos alterados:**

- `pages/producao/ImportarProducaoPage.tsx`
- `pages/producao/PreviewImportacaoModal.tsx`
- `docs/arquivo/PLANO_VISUAL_RECORDA_JOURNEY.md`

**Principais mudanças visuais:**

- Header simplificado; ação `Excluir dados importados` mantida como destrutiva visível.
- Bloco principal de importação reorganizado com etapas curtas e áreas de entrada mais calmas.
- Tabs de origem suavizadas com CSS vars e menos contraste agressivo.
- Fontes cadastradas, validação de duplicatas e resultado de importação em lote migraram para cards mais leves e legíveis.
- Preview inline recebeu melhor contenção em mobile/tablet e tabela com overflow controlado no desktop.
- Histórico de importações ficou menos denso, com cabeçalho mais limpo e leitura melhor entre mobile e desktop.

**Textos reduzidos:**

- Subtítulo da página encurtado para o fluxo essencial.
- Descrições de cards e instruções de origem ficaram mais curtas e diretas.
- Mensagens de apoio de preview e lista foram reduzidas para uma linha quando possível.
- Modal de pré-visualização condensado para foco em impacto, duplicidade, inválidos e datas.

**Melhorias mobile/tablet/desktop:**

- Botões principais e ações por fonte passaram para áreas de toque mais confortáveis.
- Upload, Google Sheets e colagem agora ficam em blocos isolados e mais fáceis de escanear no mobile.
- Preview em cards continua forte no mobile; tabela ganhou `overflow-x-auto` no desktop para evitar estouro.
- Modal de pré-visualização agora usa `Modal` com `scrollable`, melhorando tablet e telas pequenas.
- Histórico mantém ações seguras no mobile e leitura mais confortável no desktop amplo.

**Ações sensíveis preservadas:**

- `Excluir dados importados` continua com peso destrutivo claro.
- `Desfazer` no histórico continua destrutivo.
- Fluxo de confirmação e consequências administrativas não foram suavizados a ponto de perder gravidade.

**O que nao foi alterado:**

- Lógica de importação histórica.
- Lógica de validação, duplicidade, exclusão e rollback.
- Payloads, endpoints, backend, banco, `packages/shared`, service worker, permissões e rotas.

**Pendências restantes:**

- Revisar títulos/subtítulos de páginas secundárias fora do eixo operacional crítico.
- Validar visualmente em dispositivo real se a tabela de preview mantém conforto em tablets menores.

**Próxima fase recomendada:** Fase 5 — Dark Mode, ou Fase 6 — Refinamento Geral com validação visual real, conforme prioridade do produto.

---

### Fase 4-C — Validação Visual Geral (Maio 2026)

**Objetivo:** Revisar componentes e páginas já impactados para corrigir pequenas inconsistências visuais, textuais e responsivas sem abrir nova frente funcional.

**Arquivos alterados:**

- `components/ui/ErrorBoundary.tsx`
- `components/ui/RouteErrorFallback.tsx`
- `components/ui/Pagination.tsx`
- `components/ui/ProgressIndicator.tsx`
- `components/ui/AgingBadge.tsx`
- `components/ui/StatusBadge.tsx`
- `components/ui/LoadingSpinner.tsx`
- `pages/relatorios/RelatoriosGerenciaisPage.tsx`
- `pages/colaborador/MeuHistoricoPage.tsx`
- `docs/arquivo/PLANO_VISUAL_RECORDA_JOURNEY.md`

**Ajustes aplicados:**

- Componentes de erro e fallback reescritos com `Button`, CSS vars e hierarquia neutra/primary alinhada ao restante do sistema.
- `Pagination`, `ProgressIndicator`, `AgingBadge`, `StatusBadge` e `LoadingOverlay` receberam padronização final de cor, peso tipográfico e contraste.
- `RelatoriosGerenciaisPage` teve limpeza de `gray-*`, pesos excessivos, labels em caixa alta estrutural e cards mobile com bordas inconsistentes.
- `MeuHistoricoPage` teve ajuste de textos estatísticos, pesos numéricos e contraste em cards/indicadores.

**Inconsistências encontradas:**

- Hardcodes residuais em componentes utilitários de erro, paginação, status e loading.
- Alguns cards mobile de relatórios ainda usavam `gray-*` e `font-bold` sem necessidade.
- Pontos isolados de texto secundário e números de destaque ainda estavam mais agressivos do que o padrão 60/30/10.

**Melhorias mobile/tablet/desktop:**

- Estados de erro e fallback ficaram mais consistentes e legíveis em telas pequenas.
- Cards e resumos de relatórios mobile ficaram menos densos.
- Componentes utilitários agora reutilizam melhor a base de tokens, reduzindo ruído entre desktop e tablet.

**Pendências restantes:**

- Auth screens (`Login`, `ForgotPassword`, `ResetPassword`) ainda concentram hardcodes e visual de exceção; podem entrar em uma fase específica se o produto quiser alinhar também esse fluxo.
- Alguns componentes especializados fora do eixo principal (`MarkdownEditor`, pontos isolados em telas operacionais secundárias) ainda têm resíduos de `gray-*`.
- Dark mode segue pendente no nível de tokens.

**Próxima fase recomendada:** Fase 5 — Dark Mode, seguida de validação visual real em browser/dispositivos para fechar o ciclo.

---

### Fase 4-D — Autenticação e Primeira Impressão (Maio 2026)

**Objetivo:** Alinhar Login, ForgotPassword e ResetPassword ao padrão visual/textual/responsivo do Recorda, sem alterar autenticação, endpoints, payloads ou validações de segurança.

**Arquivos alterados:**

- `pages/auth/AuthShell.tsx`
- `pages/Login.tsx`
- `pages/ForgotPassword.tsx`
- `pages/ResetPassword.tsx`
- `docs/arquivo/PLANO_VISUAL_RECORDA_JOURNEY.md`

**Mudanças em Login:**

- Login passou a usar um shell visual compartilhado, com largura controlada, fundo mais calmo e card principal menos pesado.
- Branding saiu de caixa alta e contraste agressivo para apresentação discreta com CSS vars.
- Formulário manteve o fluxo original, mas ganhou espaçamento melhor, CTA mais clara e checkbox de permanência mais leve.
- Mensagens de erro continuam explícitas via `Alert`, sem alterar as regras de autenticação.

**Mudanças em recuperação e redefinição:**

- `ForgotPassword` trocou inputs e botões hardcoded por `Input` e `Button`, com instrução curta e CTA direta.
- Estado de sucesso da recuperação ficou mais discreto, com confirmação curta e sem excesso de destaque.
- `ResetPassword` ganhou organização mais clara entre token, nova senha e confirmação.
- Regra mínima de senha continua visível em helper curto, mantendo a orientação de segurança.

**Melhorias responsivas:**

- Shell centralizado com largura máxima controlada para desktop e padding mais confortável em mobile/tablet.
- Inputs e botões `lg` preservam área de toque adequada em PWA/mobile.
- Cards não ficam apertados em telas pequenas e evitam aparência de desktop espremido em tablet.

**O que não foi alterado:**

- Lógica de autenticação.
- Endpoints, payloads e chamadas de API.
- Regras de login, recuperação de senha, token e validações de segurança.
- Backend, banco, `packages/shared`, permissões, rotas e service worker.

**Pendências restantes:**

- `MarkdownEditor` e alguns painéis secundários ainda têm resíduos pontuais de `gray-*` e pesos tipográficos antigos.
- Dark mode segue pendente no nível de tokens.
- Validação visual real em navegador/dispositivos continua recomendada para fechamento do ciclo.

**Próxima fase recomendada:** Fase 5 — Dark Mode, seguida de uma rodada curta de QA visual real em desktop, tablet e mobile.

---

### Fase 5 — Dark Mode (Maio 2026)

**Objetivo:** Implementar/refinar o dark mode do Recorda com base na identidade atual, sem criar nova paleta e sem alterar comportamento funcional.

**Arquivos alterados:**

- `styles/design-tokens.css`
- `contexts/ThemeContext.tsx`
- `components/ui/Button.tsx`
- `components/ui/Input.tsx`
- `components/ui/Select.tsx`
- `components/ui/Card.tsx`
- `components/ui/Badge.tsx`
- `components/ui/Table.tsx`
- `components/ui/Modal.tsx`
- `components/layout/Sidebar.tsx`
- `components/layout/MobileBottomNav.tsx`
- `pages/auth/AuthShell.tsx`
- `docs/arquivo/PLANO_VISUAL_RECORDA_JOURNEY.md`

**Tokens criados/ajustados:**

- Aliases de superfície: `surface-primary`, `surface-secondary`, `surface-tertiary`, `surface-elevated`.
- Aliases de interação: `fill-hover`, `fill-hover-strong`, `fill-selected`, `fill-selected-strong`.
- Overlay: `overlay-backdrop`.
- Família `info` alinhada à própria família `primary`, sem criar paleta paralela.
- Refinos de dark em `background`, `border`, `text`, `primary`, `success`, `warning`, `error`, `shadow` e foco.
- Suporte tanto a `data-theme="dark"` quanto à classe `.dark`.

**Componentes impactados:**

- `Button`, `Input`, `Select`, `Card`, `Badge`, `Table`, `Modal`.
- `Sidebar`, `MobileBottomNav`.
- `AuthShell` das telas de autenticação.

**Páginas checadas pelo escopo:**

- Login.
- Dashboard.
- Comunicados.
- Ausências.
- Relatórios.
- Auditoria.
- Etapa Operacional.
- Controle de Qualidade.
- Captura de Mapas.
- Importação Histórica.

**Decisões de contraste:**

- Fundo escuro manteve azul-índigo frio e suave, sem preto absoluto dominante.
- `#444ce7` foi preservado como identidade; os tints escuros ficaram translúcidos e controlados.
- Overlays e hovers passaram a depender de tokens em vez de `black/40` ou `gray-50` fixos.
- Estados semânticos continuam claros, mas sem efeito neon em badges, fills ou foco.

**O que não foi alterado:**

- Regras de negócio.
- Backend, banco, `packages/shared`, endpoints, payloads, permissões, rotas e service worker.
- Lógica de autenticação, produção, CQ, captura, OCR e importação.

**Pendências restantes:**

- `MarkdownEditor` e alguns painéis secundários ainda dependem de mapeamentos de fallback para classes Tailwind antigas.
- Falta validação visual real em navegador/dispositivos para contraste fino em telas operacionais densas.
- A auditoria textual de títulos e subtítulos secundários continua pendente.

**Próxima fase recomendada:** Fase 6 — Refinamento Geral com validação visual real.

---

### Fase 6 — Validação Visual Real e Refinamento Final (Maio 2026)

**Objetivo:** Validar o frontend em browser real após as fases anteriores, em claro/escuro e múltiplos breakpoints, aplicando apenas refinamentos visuais, textuais e responsivos finais.

**Telas validadas:**

- `Login`, `ForgotPassword`, `ResetPassword`
- `Dashboard`
- `Comunicados` do usuário
- `Gestão de Comunicados`
- `Ausências` admin
- `Minhas Ausências`
- `Relatório de Ausências`
- `Relatórios Gerenciais`
- `Usuários`
- `Empresa`
- `Projetos`
- `Administração`
- `Auditoria`
- `Produção`
- `Devoluções`
- `Base de Conhecimento`
- `Etapa Operacional` (`Recebimento`)
- `Controle de Qualidade`
- `Recebimento Avulsos` e `Recebimento em Lote` no contexto de `Recebimento`
- `Captura de Mapas`
- `Importação Histórica`

**Temas validados:**

- Claro
- Escuro

**Breakpoints validados:**

- Desktop
- Mobile
- Tablet via resize/devtools
- Desktop amplo via largura controlada no layout e inspeção do container máximo

**Arquivos alterados:**

- `components/layout/AppLayout.tsx`
- `components/layout/Header.tsx`
- `components/ui/ActionMenu.tsx`
- `components/ui/ConfirmDialog.tsx`
- `docs/arquivo/PLANO_VISUAL_RECORDA_JOURNEY.md`

**Ajustes feitos:**

- Overlay do menu mobile e dos dialogs padronizado para `--color-overlay-backdrop`.
- Hovers residuais de `Header` e `ActionMenu` migrados de `gray-*` fixo para tokens neutros do sistema.
- Ação destrutiva e ação padrão no `ActionMenu` agora seguem tokens semânticos também no dark mode.
- Fechamento visual final concentrou-se em consistência de hover/overlay, sem tocar em fluxo ou comportamento.

**Problemas encontrados:**

- O frontend local pôde ser validado em browser real, mas a validação completa com backend/dados reais não ficou disponível no ambiente deste turno.
- Algumas telas administrativas (`Usuários`, `Ausências` admin) dependem de payloads mais completos para inspeção visual plena sem fallback.

**Problemas deixados como pendência:**

- Rodada final de QA visual com dados reais do backend, principalmente em `Usuários`, `Ausências` admin e fluxos operacionais densos.
- Revisão final do `MarkdownEditor` e de painéis secundários ainda com resíduos pontuais de classes antigas.
- Checagem em dispositivo físico/PWA para confirmar conforto visual fora do ambiente de simulação.

**Confirmações:**

- Journey segue conceito, não paleta.
- `#444ce7` segue preservado como `primary-600`.
- Backend, banco, `packages/shared`, payloads, permissões, rotas e service worker não foram alterados.

**Próxima fase recomendada:** QA visual final com dados reais e checklist de homologação, sem nova frente de redesign.

---

## 9. Pendências Atuais (após Fase 6)

| Pendência                                                                 | Prioridade | Observação                                                                       |
| ------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| Auditoria de texto em títulos de páginas secundárias                      | Média      | Revisão geral de subtítulos                                                      |
| Componentes especializados (`MarkdownEditor`, alguns painéis secundários) | Média      | Resíduos de `gray-*` e pesos tipográficos                                        |
| `animate-fade-in-up` — não validado em dispositivos lentos                | Baixa      | Dashboard                                                                        |
| QA visual com dados reais de backend                                      | Baixa      | Validar `Usuários`, `Ausências` admin e fluxos operacionais com payload completo |

---

## 10. Próximas Fases Recomendadas

### Fase 4 — Captura de Mapas / Importação Histórica

**Escopo:** Páginas de Captura de Mapas e Importação Histórica.

**Requisito:** diagnóstico visual isolado antes de qualquer mudança. Não tocar lógica — apenas substituir CSS classes por CSS vars.

**Risco:** alto — fluxos críticos de entrada de dados.

### Fase 5 — Dark Mode

**Requisito:** definir tokens `--color-*` em `.dark {}` dentro de `design-tokens.css`.

**Validação:** testar contraste WCAG AA em todas as superfícies impactadas.

**Dependência:** `ThemeContext` já existe — faltam apenas os tokens.

### Fase 6 — Refinamento Geral com Validação Visual

**Escopo:** revisão completa de todos os arquivos impactados com validação visual real (screenshot ou browser tool).

**Objetivo:** garantir consistência 60/30/10 em todas as telas; corrigir eventuais regressões visuais.

---

## 11. Como Continuar

Para qualquer IA retomar este trabalho:

1. **Leia este arquivo primeiro** — entenda as decisões e restrições antes de qualquer edição.
2. **Leia `packages/frontend/src/styles/design-tokens.css`** — entenda o sistema de tokens atual.
3. **Execute** `npm run typecheck` para verificar o estado atual.
4. **Execute** `npm run build --workspace=packages/frontend` para validar a build.
5. **Ao modificar componentes:**
   - Ler o arquivo completo antes de editar
   - Usar `multi_replace_string_in_file` para mudanças múltiplas
   - Validar `npm run typecheck` ao final
   - Nunca usar classes Tailwind raw de cor — sempre CSS vars
6. **Nunca alterar:** `--color-primary-600`, backend, migrações, service worker.
7. **Consulte a Seção 9 (Pendências)** para as próximas prioridades.
8. **Use `docs/auditorias/homologacao/CHECKLIST_HOMOLOGACAO_VISUAL_RECORDA.md`** para a homologacao visual final com dados reais ou o mais proximos do real.

**Comandos de validação:**

```powershell
cd c:\projects\recorda
npm run typecheck
npm run build --workspace=packages/frontend
```

---

_Criado na Fase 1 — Julho 2025._
_Atualizado nas Fases 2, 3-A, 3-B, 3-C, 3-D, 3-E — Julho 2025._
_Workspace: `c:\projects\recorda`_
_Stack: React + TypeScript + Vite + TailwindCSS v3_
