# Recorda Design System v2.0

> Sistema de design moderno, fino e elegante para o Recorda.
> Inspirado em: Linear, Vercel, Stripe

## Princípios de Design

1. **Minimalismo Sofisticado** - Menos é mais. Cada elemento tem propósito.
2. **Hierarquia Visual Clara** - Guia o olhar do usuário naturalmente.
3. **Microinterações Suaves** - Feedback sutil que encanta.
4. **Acessibilidade WCAG AA** - Design inclusivo para todos.

---

## 🎨 Cores

### Primária (Brand)
Azul sofisticado e profissional.

| Token | Hex | Uso |
|-------|-----|-----|
| `--color-primary-25` | #f5f8ff | Background hover sutil |
| `--color-primary-50` | #eef4ff | Background de destaque |
| `--color-primary-100` | #e0eaff | Focus ring |
| `--color-primary-500` | #6172f3 | Texto secundário |
| `--color-primary-600` | #444ce7 | **Cor principal** |
| `--color-primary-700` | #3538cd | Hover state |

### Semânticas

#### Success (Verde)
| Token | Hex | Uso |
|-------|-----|-----|
| `--color-success-50` | #ecfdf3 | Background |
| `--color-success-600` | #039855 | Texto/Ícone |

#### Warning (Âmbar)
| Token | Hex | Uso |
|-------|-----|-----|
| `--color-warning-50` | #fffaeb | Background |
| `--color-warning-600` | #dc6803 | Texto/Ícone |

#### Error (Vermelho)
| Token | Hex | Uso |
|-------|-----|-----|
| `--color-error-50` | #fef3f2 | Background |
| `--color-error-600` | #d92d20 | Texto/Ícone |

### Neutras (Cinza)
| Token | Hex | Uso |
|-------|-----|-----|
| `--color-gray-50` | #f9fafb | Background secundário |
| `--color-gray-100` | #f2f4f7 | Background terciário |
| `--color-gray-200` | #eaecf0 | Bordas |
| `--color-gray-300` | #d0d5dd | Bordas hover |
| `--color-gray-400` | #98a2b3 | Placeholder |
| `--color-gray-500` | #667085 | Texto terciário |
| `--color-gray-600` | #475467 | Texto secundário |
| `--color-gray-700` | #344054 | Texto primário |
| `--color-gray-900` | #101828 | Títulos |

---

## 📝 Tipografia

### Família
```css
--font-family-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Escala de Tamanhos

| Token | Tamanho | Uso |
|-------|---------|-----|
| `--font-size-2xs` | 11px | Badges, overlines |
| `--font-size-xs` | 12px | Captions, labels pequenos |
| `--font-size-sm` | 13px | Texto secundário |
| `--font-size-base` | 14px | **Corpo principal** |
| `--font-size-md` | 16px | Texto de destaque |
| `--font-size-lg` | 18px | Headings pequenos |
| `--font-size-xl` | 20px | Headings médios |
| `--font-size-2xl` | 24px | Títulos de página |
| `--font-size-3xl` | 30px | Display |

### Classes Tipográficas

```html
<!-- Display - Títulos grandes -->
<h1 class="text-display">Título Principal</h1>

<!-- Headings -->
<h2 class="text-heading">Seção</h2>
<h3 class="text-heading-sm">Subseção</h3>

<!-- Body -->
<p class="text-body">Texto padrão do corpo</p>
<p class="text-body-sm">Texto menor</p>

<!-- Auxiliares -->
<span class="text-caption">Texto de ajuda</span>
<label class="text-label">Label de campo</label>
<span class="text-overline">CATEGORIA</span>
```

---

## 📐 Espaçamento

Sistema baseado em 4px.

| Token | Valor | Pixels |
|-------|-------|--------|
| `--space-1` | 0.25rem | 4px |
| `--space-2` | 0.5rem | 8px |
| `--space-3` | 0.75rem | 12px |
| `--space-4` | 1rem | 16px |
| `--space-5` | 1.25rem | 20px |
| `--space-6` | 1.5rem | 24px |
| `--space-8` | 2rem | 32px |
| `--space-10` | 2.5rem | 40px |
| `--space-12` | 3rem | 48px |

---

## 🔲 Bordas

### Border Radius

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-sm` | 4px | Chips, tags |
| `--radius-md` | 6px | Inputs, buttons pequenos |
| `--radius-DEFAULT` | 8px | Buttons, cards pequenos |
| `--radius-lg` | 10px | Cards |
| `--radius-xl` | 12px | Modais, cards grandes |
| `--radius-2xl` | 16px | Containers |
| `--radius-full` | 9999px | Pills, avatares |

---

## 🌑 Sombras

| Token | Uso |
|-------|-----|
| `--shadow-xs` | Elementos sutis |
| `--shadow-sm` | Cards padrão |
| `--shadow-md` | Cards elevados, dropdowns |
| `--shadow-lg` | Modais |
| `--shadow-xl` | Popovers |

---

## ⚡ Transições

### Durações
| Token | Valor | Uso |
|-------|-------|-----|
| `--duration-fast` | 100ms | Micro-interações |
| `--duration-normal` | 150ms | **Padrão** |
| `--duration-moderate` | 200ms | Animações médias |
| `--duration-slow` | 300ms | Animações complexas |

### Easings
| Token | Uso |
|-------|-----|
| `--ease-out` | Entradas |
| `--ease-in-out` | **Padrão** |
| `--ease-bounce` | Efeitos especiais |

---

## 🧩 Componentes

### Button

```tsx
import { Button } from '@/components/ui/Button';

// Variantes
<Button variant="primary">Primário</Button>
<Button variant="secondary">Secundário</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger">Perigo</Button>
<Button variant="success">Sucesso</Button>

// Tamanhos
<Button size="xs">Extra Pequeno</Button>
<Button size="sm">Pequeno</Button>
<Button size="md">Médio (padrão)</Button>
<Button size="lg">Grande</Button>

// Com ícone
<Button icon="plus" iconPosition="left">Adicionar</Button>
<Button icon="arrow-right" iconPosition="right">Próximo</Button>

// Apenas ícone
<Button icon="settings" iconOnly />

// Estados
<Button loading>Salvando...</Button>
<Button disabled>Desabilitado</Button>
<Button fullWidth>Largura Total</Button>
```

### Input

```tsx
import { Input } from '@/components/ui/Input';

// Básico
<Input label="Nome" placeholder="Digite seu nome" />

// Com ícones
<Input 
  label="Buscar" 
  leftIcon="search" 
  placeholder="Pesquisar..." 
/>

<Input 
  label="Senha" 
  type="password"
  rightIcon="eye"
  onRightIconClick={() => togglePassword()}
/>

// Estados
<Input error="Campo obrigatório" />
<Input hint="Mínimo 8 caracteres" />
<Input disabled />

// Tamanhos
<Input inputSize="sm" />
<Input inputSize="md" /> {/* padrão */}
<Input inputSize="lg" />
```

### Card

```tsx
import { Card, CardHeader, CardFooter, CardSection } from '@/components/ui/Card';

// Básico
<Card>
  <CardHeader 
    title="Título do Card" 
    description="Descrição opcional"
    action={<Button size="sm">Ação</Button>}
  />
  <p>Conteúdo do card</p>
  <CardFooter>
    <Button variant="secondary">Cancelar</Button>
    <Button>Salvar</Button>
  </CardFooter>
</Card>

// Variantes
<Card variant="default">Padrão com borda</Card>
<Card variant="elevated">Elevado com sombra</Card>
<Card variant="outlined">Apenas borda</Card>
<Card variant="ghost">Background sutil</Card>

// Interativo
<Card hover onClick={() => handleClick()}>
  Card clicável
</Card>

// Padding
<Card padding="none">Sem padding</Card>
<Card padding="sm">Pequeno</Card>
<Card padding="lg">Grande</Card>
```

### Alert

```tsx
import { Alert } from '@/components/ui/Alert';

// Variantes
<Alert variant="info" title="Informação">
  Mensagem informativa.
</Alert>

<Alert variant="success" title="Sucesso!">
  Operação realizada com sucesso.
</Alert>

<Alert variant="warning" title="Atenção">
  Verifique os dados antes de continuar.
</Alert>

<Alert variant="error" title="Erro">
  Não foi possível completar a operação.
</Alert>

// Com botão de fechar
<Alert variant="info" onClose={() => setShow(false)}>
  Alerta dispensável
</Alert>

// Tamanhos
<Alert variant="info" size="sm">Compacto</Alert>
<Alert variant="info" size="md">Padrão</Alert>
```

---

## 📄 Layout de Página

### Estrutura Padrão

```tsx
function MinhaPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Título da Página</h1>
        <p className="page-description">Descrição opcional</p>
      </div>
      
      <Card>
        {/* Conteúdo */}
      </Card>
    </div>
  );
}
```

### Classes de Layout

```css
.page-container    /* max-width + padding */
.page-header       /* margin-bottom */
.page-title        /* Estilo de título */
.page-description  /* Estilo de descrição */
.divider           /* Linha divisória */
```

---

## 🎭 Animações

### Classes de Animação

```html
<div class="animate-fade-in">Fade in</div>
<div class="animate-fade-in-up">Fade in de baixo</div>
<div class="animate-fade-in-down">Fade in de cima</div>
<div class="animate-scale-in">Scale in</div>
<div class="animate-slide-in-right">Slide da direita</div>
<div class="animate-pulse">Pulsando</div>
<div class="animate-spin">Girando</div>
```

---

## ♿ Acessibilidade

### Focus States

Todos os elementos interativos têm focus ring visível:

```css
.focus-ring:focus-visible {
  outline: none;
  box-shadow: var(--shadow-primary); /* 3px ring azul */
}
```

### Contraste

- Texto primário: 7:1 (AAA)
- Texto secundário: 4.5:1 (AA)
- Texto terciário: 3:1 (mínimo para texto grande)

### ARIA

Todos os componentes incluem atributos ARIA apropriados:
- `role` quando necessário
- `aria-label` para elementos sem texto
- `aria-describedby` para hints/errors

---

## 🔄 Guia de Migração

### De classes Tailwind hardcoded para tokens

**Antes:**
```tsx
<div className="bg-blue-600 text-white hover:bg-blue-700">
```

**Depois:**
```tsx
<div className="bg-[var(--color-primary-600)] text-white hover:bg-[var(--color-primary-700)]">
```

### De estilos inline para componentes

**Antes:**
```tsx
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
  Salvar
</button>
```

**Depois:**
```tsx
<Button variant="primary">Salvar</Button>
```

### Checklist de Migração

- [ ] Substituir cores hardcoded por tokens CSS
- [ ] Usar componentes padronizados (Button, Input, Card, Alert)
- [ ] Aplicar classes tipográficas (text-heading, text-body, etc.)
- [ ] Padronizar espaçamentos usando tokens
- [ ] Adicionar animações de entrada em modais/alerts
- [ ] Verificar contraste de acessibilidade
- [ ] Testar focus states com teclado

---

## 📁 Estrutura de Arquivos

```
src/
├── styles/
│   └── design-tokens.css    # Tokens CSS
├── components/
│   └── ui/
│       ├── Button.tsx       # Botões
│       ├── Input.tsx        # Campos de entrada
│       ├── Card.tsx         # Cards
│       ├── Alert.tsx        # Alertas
│       ├── Icon.tsx         # Ícones
│       ├── LoadingSpinner.tsx
│       ├── PageState.tsx    # Estados de página
│       └── EmptyState.tsx   # Estado vazio
```

---

*Design System v2.0 - Recorda © 2026*
