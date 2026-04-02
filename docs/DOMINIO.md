# Domínio Recorda

## Visão Geral

O domínio Recorda modela o sistema de gestão de processos administrativos com foco em rastreamento de produção e digitalização.

---

## REALIDADE OPERACIONAL

> **Esta seção descreve como o sistema funciona na prática, em linguagem simples.**

### Como a Produção Entra no Sistema

A produção **NUNCA** é digitada diretamente no sistema. Existem apenas duas formas de entrada:

1. **PLANILHA** - Importação em lote de dados de produção
2. **OCR (Câmera)** - Captura de documentos via dispositivo móvel

Mesmo que no futuro existam usuários operacionais no sistema, eles **NÃO** lançam produção diretamente. A produção sempre vem de uma dessas duas fontes.

### O que é um Processo

Todo **PROCESSO** possui:

- Um **PROTOCOLO** (número único de identificação)
- Pode ter **VOLUMES** (subdivisões físicas quando excede páginas)

### Processo Principal vs Apenso

Um processo pode ser:

- **PRINCIPAL** - Processo autônomo que pode receber apensos
- **APENSO** - Processo com protocolo próprio, mas vinculado a um principal

**Importante:** Apensos também podem ter seus próprios volumes.

### Visão Gerencial

Gerencialmente, **processo principal + volumes + apensos** são vistos como **UM CONJUNTO**.

Porém, cada um mantém seu **protocolo distinto** para rastreabilidade.

### Como a Produção é Registrada

A produção é registrada por:

- **ETAPA** - Fase do fluxo de trabalho (ex: triagem, digitalização)
- **COLABORADOR** - Quem executou o trabalho
- **PERÍODO** - Data em que a produção foi realizada
- **PROCESSO** - Pode ser principal OU apenso (ambos são válidos)

### Regras de Integridade

1. **Nada existe órfão**
   - Volume SEMPRE pertence a um Processo
   - Apenso SEMPRE referencia um Processo Principal
   - Registro de Produção SEMPRE tem processo, etapa e colaborador

2. **Produção não é sobrescrita**
   - Registro de produção é IMUTÁVEL após criado
   - Correções são feitas via cancelamento + novo registro
   - O banco de dados impede UPDATE e DELETE físico

---

## Diagrama de Relações

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AGREGADO RAIZ                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      ProcessoPrincipal                               │    │
│  │  - id: EntityId                                                      │    │
│  │  - numero: NumeroProcesso                                            │    │
│  │  - assunto: string                                                   │    │
│  │  - status: StatusProcesso                                            │    │
│  │  - dataAbertura: DataPassada                                         │    │
│  │  - dataArquivamento: DataPassada | null                              │    │
│  │  - coordenadoriaOrigemId: EntityId ──────────────────────┐           │    │
│  │  - coordenadoriaAtualId: EntityId ───────────────────────┤           │    │
│  │  - volumes: Volume[] ◆────────────────────────┐          │           │    │
│  │  - apensos: Apenso[] ◆────────────────────────┼──┐       │           │    │
│  └───────────────────────────────────────────────┼──┼───────┼───────────┘    │
│                                                  │  │       │                │
│  ┌───────────────────────────────────────────────┼──┼───────┼───────────┐    │
│  │                        Volume                 │  │       │           │    │
│  │  - id: EntityId                               │  │       │           │    │
│  │  - processoId: EntityId ◄─────────────────────┘  │       │           │    │
│  │  - numero: number                                │       │           │    │
│  │  - quantidadePaginas: Quantidade                 │       │           │    │
│  │  - dataAbertura: DataPassada                     │       │           │    │
│  │  - dataFechamento: DataPassada | null            │       │           │    │
│  └──────────────────────────────────────────────────┼───────┼───────────┘    │
│                                                     │       │                │
│  ┌──────────────────────────────────────────────────┼───────┼───────────┐    │
│  │                        Apenso                    │       │           │    │
│  │  - id: EntityId                                  │       │           │    │
│  │  - processoPrincipalId: EntityId ◄───────────────┘       │           │    │
│  │  - numeroProcessoApenso: NumeroProcesso                  │           │    │
│  │  - tipo: TipoApenso                                      │           │    │
│  │  - dataApensamento: DataPassada                          │           │    │
│  │  - dataDesapensamento: DataPassada | null                │           │    │
│  └──────────────────────────────────────────────────────────┼───────────┘    │
└─────────────────────────────────────────────────────────────┼────────────────┘
                                                              │
                                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Coordenadoria                                      │
│  - id: EntityId                                                              │
│  - nome: Nome                                                                │
│  - sigla: string                                                             │
│  - ativa: boolean                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         │ pertence a
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Colaborador                                       │
│  - id: EntityId                                                              │
│  - nome: Nome                                                                │
│  - matricula: string                                                         │
│  - coordenadoriaId: EntityId                                                 │
│  - ativo: boolean                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         │ registra produção
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RegistroProducao (IMUTÁVEL)                             │
│  - id: EntityId                                                              │
│  - processoId: EntityId ─────────────────────────► ProcessoPrincipal         │
│  - volumeId: EntityId | null ────────────────────► Volume                    │
│  - etapaId: EntityId ────────────────────────────► Etapa                     │
│  - colaboradorId: EntityId ──────────────────────► Colaborador               │
│  - fonteDeDadosId: EntityId ─────────────────────► FonteDeDados              │
│  - quantidade: Quantidade                                                    │
│  - dataRegistro: DataPassada                                                 │
│  - dataProducao: DataPassada                                                 │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Etapa                                           │
│  - id: EntityId                                                              │
│  - nome: Nome                                                                │
│  - descricao: string                                                         │
│  - unidade: UnidadeMedida (PROCESSO|VOLUME|PAGINA|DOCUMENTO)                 │
│  - ordem: number                                                             │
│  - ativa: boolean                                                            │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           FonteDeDados                                       │
│  - id: EntityId                                                              │
│  - nome: Nome                                                                │
│  - tipo: TipoFonte (SISTEMA|PLANILHA|MANUAL|OCR)                             │
│  - descricao: string                                                         │
│  - ativa: boolean                                                            │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           DocumentoOCR                                       │
│  - id: EntityId                                                              │
│  - processoId: EntityId ─────────────────────────► ProcessoPrincipal         │
│  - volumeId: EntityId | null ────────────────────► Volume                    │
│  - caminhoArquivo: string                                                    │
│  - status: StatusOCR (PENDENTE|PROCESSANDO|CONCLUIDO|ERRO)                   │
│  - textoExtraido: string | null                                              │
│  - dataUpload: DataPassada                                                   │
│  - dataProcessamento: DataPassada | null                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Entidades

### ProcessoPrincipal (Agregado Raiz)

O `ProcessoPrincipal` é o agregado raiz do domínio. Todas as operações que envolvem `Volume` e `Apenso` devem passar por ele.

**Invariantes:**

- Sempre possui pelo menos um volume (criado automaticamente)
- Apenas processos ativos podem receber novos volumes ou apensos
- Não pode ser arquivado com apensos ativos
- Data de arquivamento não pode ser anterior à data de abertura

**Status:**

- `ATIVO`: Processo em tramitação normal
- `ARQUIVADO`: Processo finalizado
- `SUSPENSO`: Processo temporariamente parado
- `CANCELADO`: Processo anulado

### Volume

Representa um volume físico do processo.

**Invariantes:**

- Nunca existe sem `ProcessoPrincipal` (criado via agregado)
- Número deve ser inteiro positivo
- Data de fechamento não pode ser anterior à data de abertura
- Não pode ser fechado se já estiver fechado

### Apenso

Representa a vinculação de outro processo ao processo principal.

**Invariantes:**

- Sempre referencia um `ProcessoPrincipal`
- Data de desapensamento não pode ser anterior à data de apensamento
- Não pode ser desapensado se já estiver desapensado

**Tipos:**

- `APENSO`: Vinculação temporária
- `ANEXO`: Vinculação permanente
- `APENSAMENTO`: Junção de processos

### RegistroProducao (Imutável)

Registra a produção de um colaborador em uma etapa.

**Invariantes:**

- Imutável após criação (não possui métodos de alteração)
- Quantidade deve ser maior que zero
- Etapa deve estar ativa
- Colaborador deve estar ativo
- Fonte de dados deve estar ativa
- Unidade de medida é definida pela Etapa

### Colaborador

Representa um funcionário que registra produção.

**Invariantes:**

- Não pode ser vinculado a coordenadoria inativa
- Matrícula não pode ser vazia

### Coordenadoria

Representa uma unidade organizacional.

**Invariantes:**

- Sigla não pode ser vazia
- Sigla é normalizada para maiúsculas

### Etapa

Define uma fase do fluxo de trabalho.

**Invariantes:**

- Unidade de medida deve ser válida
- Ordem deve ser inteiro não negativo

### FonteDeDados

Origem dos dados de produção.

**Invariantes:**

- Tipo deve ser válido

### DocumentoOCR

Documento para extração de texto via OCR.

**Invariantes:**

- Caminho do arquivo não pode ser vazio
- Transições de status são controladas (PENDENTE → PROCESSANDO → CONCLUIDO/ERRO)

## Value Objects

### EntityId

Identificador único baseado em UUID v4.

### DataPassada

Data que não pode ser no futuro. Garante consistência temporal.

### NumeroProcesso

Número do processo com validação de formato.

### Nome

String não vazia com limite de caracteres.

### Quantidade

Número inteiro não negativo para contagens.

## Invariantes Globais

### Integridade Referencial (Nada Órfão)

1. **Volume SEMPRE pertence a um Processo**
   - Garantido pelo construtor privado e factory method
   - `processoId` é obrigatório e nunca nulo

2. **Apenso SEMPRE referencia um Processo Principal**
   - `processoPrincipalId` é obrigatório no construtor
   - Apenso não pode existir sem processo pai

3. **Registro de Produção SEMPRE tem referências válidas**
   - `processoId`, `etapaId`, `colaboradorId`, `fonteDeDadosId` obrigatórios
   - Todas as referências devem existir e estar ativas

### Imutabilidade da Produção

4. **RegistroProducao é IMUTÁVEL após criação**
   - Não possui métodos de alteração
   - Props são `readonly` e congeladas com `Object.freeze`
   - Banco de dados tem RULE que impede UPDATE/DELETE
   - Correções são feitas via cancelamento + novo registro

### Entrada de Produção Controlada

5. **Produção entra APENAS via planilha ou OCR**
   - Não existe endpoint HTTP para criação direta
   - Use cases `ImportarPlanilha` e `RegistrarRecebimentoOCR` são as únicas portas de entrada
   - Usuários operacionais NÃO lançam produção diretamente

### Agregados e Consistência

6. **ProcessoPrincipal é agregado raiz**
   - Volume e Apenso são criados/modificados apenas através do ProcessoPrincipal
   - Garante consistência transacional

7. **Unidade é definida pela Etapa**
   - RegistroProducao usa a unidade da Etapa referenciada

8. **Datas nunca no futuro**
   - Garantido pelo Value Object `DataPassada`

## Estrutura de Arquivos

```
packages/backend/src/domain/
├── entities/
│   ├── index.ts
│   ├── processo-principal.ts    # Agregado raiz
│   ├── volume.ts
│   ├── apenso.ts
│   ├── registro-producao.ts     # Imutável
│   ├── colaborador.ts
│   ├── coordenadoria.ts
│   ├── etapa.ts
│   ├── fonte-de-dados.ts
│   └── documento-ocr.ts
├── value-objects/
│   ├── index.ts
│   ├── entity-id.ts
│   ├── data-passada.ts
│   ├── numero-processo.ts
│   ├── nome.ts
│   └── quantidade.ts
├── errors/
│   └── domain-error.ts
└── index.ts
```
