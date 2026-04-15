# 🔄 Validação de Fluxo de Etapas - Sistema Recorda

**Data:** 15 de Abril de 2026  
**Escopo:** Sequenciamento obrigatório de etapas de produção

---

## 📋 Sequência Obrigatória de Etapas

```
1. RECEBIMENTO          (etapa inicial - sempre permitida)
   ↓
2. PREPARACAO           (requer: RECEBIMENTO)
   ↓
3. DIGITALIZACAO        (requer: PREPARACAO)
   ↓  - P/B e Colorido
   ↓
4. CONFERENCIA          (requer: DIGITALIZACAO)
   ↓
5. RECONFERENCIA        (requer: CONFERENCIA)
   ↓
6. MONTAGEM             (requer: RECONFERENCIA)
   ↓
7. ATENDIMENTO          (requer: MONTAGEM)
```

---

## 🎯 Regras de Validação

### 1️⃣ Duplicatas na MESMA Etapa

**Bloqueado:** Não pode lançar a mesma produção duas vezes na mesma etapa.

**Critérios de duplicata (todos devem ser idênticos):**
- ✅ Mesmo colaborador
- ✅ Mesmo repositório
- ✅ Mesma data
- ✅ Mesma etapa
- ✅ Mesma quantidade
- ✅ Mesmo tipo (Imagens/Caixas)
- ✅ Mesma função
- ✅ Mesma coordenadoria

**Exemplo Bloqueado:**
```
❌ 150/2026 CINF - Preparação - 10 unidades (já lançado)
❌ 150/2026 CINF - Preparação - 10 unidades (DUPLICATA BLOQUEADA)
```

---

### 2️⃣ Mesmo Repositório em Etapas Diferentes

**Permitido:** O mesmo repositório pode estar em múltiplas etapas.

**Exemplos Permitidos:**
```
✅ 150/2026 CINF - Preparação    (lançado)
✅ 150/2026 CINF - Digitalização (PERMITIDO - etapa diferente)
✅ 150/2026 CINF - Conferência   (PERMITIDO - etapa diferente)
```

---

### 3️⃣ Mesmo Repositório em Coordenadorias Diferentes

**Permitido:** 150/2026 pode existir na CINF e na CEE simultaneamente.

**Exemplos Permitidos:**
```
✅ 150/2026 CINF - Preparação (lançado)
✅ 150/2026 CEE  - Preparação (PERMITIDO - coordenadoria diferente)
```

**Por quê?** São processos independentes de coordenadorias diferentes.

---

### 4️⃣ Sequenciamento Obrigatório

**Bloqueado:** Não pode pular etapas.

**Validação:** Para lançar etapa X, DEVE existir registro da etapa anterior do MESMO repositório+coordenadoria.

**Exemplos:**

#### ✅ Sequência Correta
```
1. 150/2026 CINF - Recebimento   ✅ (primeira etapa, sempre permitida)
2. 150/2026 CINF - Preparação    ✅ (tem RECEBIMENTO)
3. 150/2026 CINF - Digitalização ✅ (tem PREPARACAO)
4. 150/2026 CINF - Conferência   ✅ (tem DIGITALIZACAO)
```

#### ❌ Sequência Incorreta (Pula Etapa)
```
1. 150/2026 CINF - Recebimento   ✅ (OK)
2. 150/2026 CINF - Preparação    ✅ (OK)
3. 150/2026 CINF - Conferência   ❌ BLOQUEADO!
   Erro: "Não é possível lançar produção na etapa CONFERENCIA sem ter passado pela etapa DIGITALIZACAO primeiro."
```

#### ❌ Sequência Incorreta (Sem Etapa Inicial)
```
1. 150/2026 CINF - Digitalização ❌ BLOQUEADO!
   Erro: "Não é possível lançar produção na etapa DIGITALIZACAO sem ter passado pela etapa PREPARACAO primeiro."
```

---

## 🔍 Lógica de Verificação

### Verificação de Etapa Anterior

**Query SQL:**
```sql
SELECT id
FROM producao_repositorio
WHERE repositorio_id = $repositorioId
  AND etapa = $etapaAnterior
  AND COALESCE(marcadores->>'coordenadoria', '') = $coordenadoria
LIMIT 1
```

**Validação:**
- Se não encontrar registro da etapa anterior → **BLOQUEIA**
- Se encontrar → **PERMITE** lançamento

---

## 📊 Cenários Práticos

### Cenário 1: Fluxo Normal (CEE e CINF Paralelos)

```
150/2026 CEE
├─ Recebimento   ✅ (dia 01)
├─ Preparação    ✅ (dia 02)
├─ Digitalização ✅ (dia 03)
└─ Conferência   ✅ (dia 04)

150/2026 CINF
├─ Recebimento   ✅ (dia 01)
├─ Preparação    ✅ (dia 03)
└─ Digitalização ✅ (dia 05)
```

**Resultado:** ✅ **PERMITIDO** - São coordenadorias diferentes.

---

### Cenário 2: Tentativa de Pular Etapa

```
150/2026 CINF
├─ Recebimento   ✅ (dia 01)
├─ Preparação    ✅ (dia 02)
└─ Conferência   ❌ BLOQUEADO (não passou por DIGITALIZACAO)

HTTP 422 Unprocessable Entity
{
  "error": "Sequência de etapas inválida",
  "message": "Não é possível lançar produção na etapa CONFERENCIA sem ter passado pela etapa DIGITALIZACAO primeiro.",
  "detalhes": {
    "repositorio": "150/2026",
    "coordenadoria": "CINF",
    "etapaAtual": "CONFERENCIA",
    "etapaAnteriorNecessaria": "DIGITALIZACAO",
    "sequenciaCompleta": [
      "RECEBIMENTO",
      "PREPARACAO",
      "DIGITALIZACAO",
      "CONFERENCIA",
      "RECONFERENCIA",
      "MONTAGEM",
      "ATENDIMENTO"
    ]
  }
}
```

---

### Cenário 3: Duplicata Exata na Mesma Etapa

```
150/2026 CINF
├─ Preparação - 10 unidades ✅ (dia 02, 10h)
└─ Preparação - 10 unidades ❌ BLOQUEADO (dia 02, 15h - DUPLICATA)

HTTP 409 Conflict
{
  "error": "Produção duplicada",
  "message": "Você já lançou esta produção: PREPARACAO - 150/2026 - 10 unidade(s) na data 02/04/2026",
  "detalhes": {
    "registroExistenteId": "uuid",
    "repositorio": "150/2026",
    "etapa": "PREPARACAO",
    "quantidade": 10,
    "data": "2026-04-02T10:00:00.000Z"
  }
}
```

---

### Cenário 4: Mesma Etapa, Quantidade Diferente

```
150/2026 CINF
├─ Preparação - 10 unidades ✅ (dia 02, 10h)
└─ Preparação - 15 unidades ✅ PERMITIDO (dia 02, 15h - quantidade diferente)
```

**Por quê?** Pode ser complemento ou ajuste.

---

## 🎨 Mapeamento de Status

Quando uma produção é lançada, o repositório recebe um status:

```typescript
const etapaStatusMap = {
  RECEBIMENTO: 'RECEBIDO',
  PREPARACAO: 'EM_PREPARACAO',
  DIGITALIZACAO: 'EM_DIGITALIZACAO',
  CONFERENCIA: 'EM_CONFERENCIA',
  RECONFERENCIA: 'EM_CONFERENCIA',      // Mesmo status
  MONTAGEM: 'EM_MONTAGEM',
  ATENDIMENTO: 'EM_ENTREGA',            // Novo
  CONTROLE_QUALIDADE: 'AGUARDANDO_CQ_LOTE',
  ENTREGA: 'EM_ENTREGA',
}
```

---

## 🔒 Códigos HTTP de Resposta

| Status | Código | Descrição |
|--------|--------|-----------|
| **Sucesso** | 201 Created | Produção lançada com sucesso |
| **Duplicata** | 409 Conflict | Já existe produção idêntica na mesma etapa |
| **Sequência Inválida** | 422 Unprocessable Entity | Tentou pular etapa obrigatória |
| **Erro Servidor** | 500 Internal Server Error | Erro inesperado |

---

## 📝 Resumo das Validações

### ✅ O que é PERMITIDO:

1. ✅ Mesmo repositório em etapas diferentes
2. ✅ Mesmo repositório em coordenadorias diferentes
3. ✅ Mesma etapa com quantidade diferente
4. ✅ Mesma etapa em datas diferentes
5. ✅ Avançar etapas em sequência correta

### ❌ O que é BLOQUEADO:

1. ❌ Duplicata exata (mesma etapa, mesma quantidade, mesma data)
2. ❌ Pular etapas (ir direto de PREPARACAO para CONFERENCIA)
3. ❌ Lançar etapa sem ter passado pela anterior (do mesmo repo+coord)

---

## 🚀 Benefícios

### Integridade de Dados
- ✅ Previne duplicatas acidentais
- ✅ Garante sequência lógica do processo
- ✅ Rastreabilidade completa

### UX
- ✅ Mensagens claras de erro
- ✅ Detalhes para correção
- ✅ Sequência completa informada

### Gestão
- ✅ Processos padronizados
- ✅ Controle de fluxo
- ✅ Dados confiáveis para relatórios

---

## 📌 Notas Importantes

1. **RECEBIMENTO** é sempre permitido (etapa inicial)
2. Validação é por **repositório + coordenadoria** (não apenas repositório)
3. **P/B e Colorido** fazem parte da etapa DIGITALIZACAO
4. **RECONFERENCIA** é uma nova etapa entre Conferência e Montagem
5. **ATENDIMENTO** é uma nova etapa após Montagem
6. Colaboradores diferentes podem lançar o mesmo repositório em etapas diferentes

---

## 🔧 Implementação Técnica

**Arquivo:** `packages/backend/src/infrastructure/http/routes/metas.ts`

**Sequência de Validações:**
1. Validação de schema (Zod)
2. Autenticação (JWT)
3. Autorização (perfil)
4. Verificação de duplicata (mesma etapa)
5. Verificação de sequência (etapa anterior existe)
6. Inserção no banco

**Performance:**
- ✅ 2 queries adicionais (duplicata + etapa anterior)
- ✅ Queries indexadas
- ✅ Impacto mínimo (<50ms)
