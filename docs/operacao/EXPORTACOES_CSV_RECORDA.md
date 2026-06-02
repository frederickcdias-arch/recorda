# Exportações CSV — Recorda

> **Padrão BR Excel:** separador `;`, encoding UTF-8 com BOM (`\uFEFF`), terminadores CRLF (`\r\n`).

## Índice de Exportações

| #   | Arquivo gerado                           | Endpoint                                               | Origem   | Separador | BOM | CRLF |
| --- | ---------------------------------------- | ------------------------------------------------------ | -------- | --------- | --- | ---- |
| 1   | `ausencias-{YYYY-MM-DD}.csv`             | `GET /relatorios/ausencias/exportar`                   | Backend  | `;`       | ✅  | ✅   |
| 2   | `historico-comunicados-{YYYY-MM-DD}.csv` | `GET /admin/comunicados/exportar`                      | Backend  | `;`       | ✅  | ✅   |
| 3   | `relatorio-recebimento-{id}.csv`         | `GET /operacional/relatorios/:id/download?formato=csv` | Backend  | `;`       | ✅  | ✅   |
| 4   | `importacao-erros-{id}.csv`              | `GET /operacional/importacoes-legado/:id/erros-csv`    | Backend  | `;`       | ✅  | ✅   |
| 5   | `producao_{inicio}_a_{fim}.csv`          | `GET /relatorios/operacional/export?formato=csv`       | Backend  | `;`       | ✅  | ✅   |
| 6   | `comunicado-{titulo}-{filtro}.csv`       | _Client-side_ (`ComunicadosPage.tsx`)                  | Frontend | `;`       | ✅  | ✅   |

---

## Detalhamento por Exportação

### 1. Ausências (`ausencias-{YYYY-MM-DD}.csv`)

**Arquivo:** `packages/backend/src/infrastructure/http/routes/relatorios.ts`  
**Rota:** `GET /relatorios/ausencias/exportar`  
**Perfil:** `administrador`  
**Filtros disponíveis:** `dataInicio`, `dataFim`, `colaboradorId`, `tipoAusenciaId`, `status`

| Coluna             | Descrição                                                 |
| ------------------ | --------------------------------------------------------- |
| `Colaborador`      | Nome completo do usuário                                  |
| `Tipo de Ausência` | Nome do tipo de ausência (ex.: Férias, Licença médica)    |
| `Data Início`      | Data de início no formato `DD/MM/YYYY`                    |
| `Data Fim`         | Data de término no formato `DD/MM/YYYY`                   |
| `Dias`             | Quantidade de dias de ausência                            |
| `Período`          | Período (ex.: INTEGRAL, MANHA, TARDE)                     |
| `Horas`            | Horas de ausência (quando aplicável)                      |
| `Status`           | Status atual (SOLICITADO, APROVADO, REJEITADO, CANCELADO) |
| `Justificativa`    | Texto justificativo fornecido pelo colaborador            |
| `Observações`      | Observações adicionais                                    |
| `Motivo Rejeição`  | Motivo informado ao rejeitar (se aplicável)               |
| `Solicitado em`    | Data/hora da solicitação no formato `DD/MM/YYYY`          |

> **Uso:** Relatório gerencial de RH; auditoria de ausências por período.

---

### 2. Histórico de Comunicados (`historico-comunicados-{YYYY-MM-DD}.csv`)

**Arquivo:** `packages/backend/src/infrastructure/http/routes/comunicados.ts`  
**Rota:** `GET /admin/comunicados/exportar`  
**Perfil:** `administrador`  
**Filtros disponíveis:** mesmos filtros da listagem admin (`status`, `prioridade`, `tipo`, `busca`, etc.)

| Coluna                | Descrição                                                |
| --------------------- | -------------------------------------------------------- |
| `titulo`              | Título do comunicado                                     |
| `tipo`                | Tipo do comunicado (ex.: AVISO, ALERTA, INFORMATIVO)     |
| `categoria`           | Categoria temática                                       |
| `status`              | Status de publicação (RASCUNHO, PUBLICADO, ENCERRADO)    |
| `prioridade`          | Prioridade (BAIXA, MEDIA, ALTA, URGENTE)                 |
| `escopo`              | Escopo de destinatários (TODOS, COORDENADORIA, USUARIO)  |
| `leitura_obrigatoria` | `SIM` ou `NAO`                                           |
| `criado_em`           | ISO 8601 da data de criação                              |
| `publicado_em`        | ISO 8601 da publicação (vazio se não publicado)          |
| `encerrado_em`        | ISO 8601 do encerramento (vazio se ativo)                |
| `destinatarios`       | Quantidade total de destinatários                        |
| `lidos`               | Quantidade de leituras confirmadas                       |
| `pendentes`           | Quantidade pendente de leitura (`destinatarios - lidos`) |

> **Uso:** Auditoria de comunicação interna; monitoramento de engajamento.

---

### 3. Relatório de Recebimento (`relatorio-recebimento-{id}.csv` / `termo-recebimento-{id}.csv`)

**Arquivo:** `packages/backend/src/infrastructure/http/routes/operacional-cq.ts`  
**Rota:** `GET /operacional/relatorios/:id/download?formato=csv`  
**Perfil:** `operador`, `administrador`  
**Fonte de dados:** Campo `dados_snapshot.processos` do relatório operacional armazenado

| Coluna          | Descrição                                      |
| --------------- | ---------------------------------------------- |
| `#`             | Número sequencial do processo (1-based)        |
| `REPOSITORIO`   | Código GED do repositório (ex.: `000001/2024`) |
| `UNIDADE`       | Unidade/órgão responsável                      |
| `SETOR`         | Setor de origem                                |
| `PROTOCOLO`     | Número de protocolo                            |
| `INTERESSADO`   | Nome do interessado                            |
| `CLASSIFICACAO` | Classificação do documento                     |
| `VOLUME`        | Número do volume                               |
| `CAIXAS`        | Quantidade de caixas                           |
| `APENSO`        | `SIM` ou `NAO` — indica se é apenso            |
| `OBS`           | Observações do processo                        |

> **Uso:** Registro de recebimento físico de processos; possível reimport de dados de recebimento.

---

### 4. Erros de Importação (`importacao-erros-{id}.csv`)

**Arquivo:** `packages/backend/src/infrastructure/http/routes/operacional-importacao-legado.ts`  
**Rota:** `GET /operacional/importacoes-legado/:id/erros-csv`  
**Perfil:** `operador`, `administrador` (operador só acessa suas próprias importações)  
**Fonte de dados:** Campo `detalhes_erros` da importação legado

| Coluna        | Descrição                                    |
| ------------- | -------------------------------------------- |
| `linha`       | Número da linha da planilha que gerou o erro |
| `erro`        | Descrição do erro encontrado                 |
| `repositorio` | Código do repositório na linha com erro      |
| `colaborador` | Nome do colaborador na linha com erro        |
| `funcao`      | Função na linha com erro                     |
| `tipo`        | Tipo de produção na linha com erro           |
| `data`        | Data na linha com erro                       |
| `quantidade`  | Quantidade na linha com erro                 |

> **Uso:** Diagnóstico de falhas em importações; correção e reimportação de planilhas.

---

### 5. Produção Detalhada (`producao_{inicio}_a_{fim}.csv`)

**Arquivo:** `packages/backend/src/infrastructure/http/routes/relatorios.ts`  
**Rota:** `GET /relatorios/operacional/export?formato=csv`  
**Perfil:** `operador`, `administrador`  
**Filtros disponíveis:** `dataInicio` (obrigatório), `dataFim` (obrigatório), `etapa`, `colaborador`, `origem` (`legado`|`sistema`|`fluxo`), `busca`  
**Limite:** até 50.000 linhas (cabeçalho `X-Truncated: true` indica truncamento)

| Coluna          | Descrição                                        |
| --------------- | ------------------------------------------------ |
| `data`          | Data de produção no formato `DD/MM/YYYY`         |
| `colaborador`   | Nome do colaborador responsável                  |
| `funcao`        | Função exercida na etapa                         |
| `repositorio`   | Código GED do repositório                        |
| `coordenadoria` | Sigla da coordenadoria                           |
| `quantidade`    | Quantidade produzida                             |
| `tipo`          | Tipo de item (ex.: Imagens, Repositórios)        |
| `etapa`         | Etapa do fluxo (ex.: DIGITALIZACAO, CONFERENCIA) |
| `origem`        | `Legado` ou `Fluxo`                              |

> **Formato compatível com importação legado:** As 7 primeiras colunas (`data`, `colaborador`, `funcao`, `repositorio`, `coordenadoria`, `quantidade`, `tipo`) correspondem ao formato esperado por `parseCsvToProducao`. Isso permite **recuperar ou reconstruir produção a partir do CSV** em caso de perda de dados no banco.
>
> **Uso:** Backup operacional de produção; auditoria por período; geração de relatórios gerenciais; recuperação de dados.

---

### 6. Destinatários de Comunicado (`comunicado-{titulo}-{filtro}.csv`)

**Arquivo:** `packages/frontend/src/pages/configuracoes/ComunicadosPage.tsx`  
**Origem:** Gerado no **frontend** (client-side), sem chamada ao backend  
**Perfil:** `administrador` (página restrita)  
**Filtros aplicados:** reflete o filtro ativo na página (`todos`, `pendentes`, `lidos`)

| Coluna           | Descrição                                              |
| ---------------- | ------------------------------------------------------ |
| `nome`           | Nome do destinatário                                   |
| `email`          | E-mail do destinatário                                 |
| `status_leitura` | `lido` ou `pendente`                                   |
| `usuario_ativo`  | `ativo` ou `inativo`                                   |
| `entregue_em`    | Data/hora de entrega (ISO 8601, vazio se não entregue) |
| `lido_em`        | Data/hora de leitura (ISO 8601, vazio se não lido)     |

> **Uso:** Rastreamento de entrega e leitura de comunicados específicos; auditoria de ciência.

---

## Padrão de Formatação

Todos os CSVs seguem o padrão brasileiro para compatibilidade com Microsoft Excel:

```
\uFEFF"Coluna A";"Coluna B";"Coluna C"\r\n
"valor1";"valor2";"valor3"\r\n
```

### Regras de Escaping

Campos que contenham qualquer um dos caracteres a seguir são envoltos em aspas duplas:

- `"` (aspas duplas) — escapadas como `""`
- `;` (ponto-e-vírgula)
- `\n` (nova linha)
- `\r` (retorno de carro)

**Exemplo:** O valor `Fulano; Ciclano` é gravado como `"Fulano; Ciclano"` no CSV.

---

## Testes

Os testes de formato CSV estão em:

- [`packages/backend/src/infrastructure/http/routes/csv-exports.test.ts`](../../packages/backend/src/infrastructure/http/routes/csv-exports.test.ts)

Execute com:

```bash
npm run test --workspace=@recorda/backend -- "csv-exports"
```

Os testes cobrem, para cada exportação:

- Status HTTP 200 e `Content-Type: text/csv; charset=utf-8`
- Presença do BOM UTF-8 (`\uFEFF`) no início do corpo
- Terminadores CRLF em todas as linhas
- Separador ponto-e-vírgula no cabeçalho
- Cabeçalho com as colunas corretas
- Escaping de caracteres especiais (`;`, `"`)
- Controle de acesso por perfil (401/403)
