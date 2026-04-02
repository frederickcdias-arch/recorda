# Conhecimento Operacional - Plano de Conteudo

Data: 2026-03-05
Escopo: secao `/operacao/conhecimento` (documentos, glossario, leis/normas)

## 1) Estrutura alvo

### 1.1 Documentos (kb_documentos)

Categorias recomendadas:

- `MANUAIS`
- `PROCEDIMENTOS_ETAPA`
- `CHECKLISTS_EXPLICADOS`
- `ATUALIZACOES_PROCESSO`
- `NORMAS_LEIS`

Nivel de acesso:

- `OPERADOR_ADMIN`: materiais operacionais de execucao
- `ADMIN`: regras internas sensiveis, governanca, auditoria

### 1.2 Glossario (kb_glossario)

Padrao por termo:

- Definicao curta (1-2 frases)
- Quando usar
- Erro comum de interpretacao

### 1.3 Leis e Normas (kb_leis_normas)

Padrao por item:

- O que e
- Impacto operacional
- Responsavel por conformidade
- Evidencia exigida

## 2) Conteudo minimo para primeira onda

### 2.1 Documentos por etapa

1. `KB-REC-001` - Manual de Recebimento e Triagem

- Categoria: `MANUAIS`
- Etapas: `RECEBIMENTO`

2. `KB-PRE-001` - Procedimento de Preparacao Fisica

- Categoria: `PROCEDIMENTOS_ETAPA`
- Etapas: `PREPARACAO`

3. `KB-DIG-001` - Padrao de Digitalizacao

- Categoria: `PROCEDIMENTOS_ETAPA`
- Etapas: `DIGITALIZACAO`

4. `KB-CON-001` - Conferencia Pos-Digitalizacao

- Categoria: `PROCEDIMENTOS_ETAPA`
- Etapas: `CONFERENCIA`

5. `KB-MON-001` - Montagem e Encadeamento de Processos

- Categoria: `PROCEDIMENTOS_ETAPA`
- Etapas: `MONTAGEM`

6. `KB-CQ-001` - Criterios de Controle de Qualidade

- Categoria: `CHECKLISTS_EXPLICADOS`
- Etapas: `CONTROLE_QUALIDADE`

7. `KB-ENT-001` - Protocolo de Entrega e Evidencias

- Categoria: `PROCEDIMENTOS_ETAPA`
- Etapas: `ENTREGA`

8. `KB-ALL-001` - Matriz de Decisao Operacional

- Categoria: `CHECKLISTS_EXPLICADOS`
- Etapas: todas

9. `KB-ALL-002` - Tratativa de Excecoes e Retrabalho

- Categoria: `ATUALIZACOES_PROCESSO`
- Etapas: todas

10. `KB-ALL-003` - Politica de Duplicidade de Repositorio

- Categoria: `NORMAS_LEIS`
- Etapas: `RECEBIMENTO`

### 2.2 Glossario minimo (15 termos)

- Repositorio
- ID GED
- Processo principal
- Apenso
- Avulso
- Lote CQ
- Marcador
- Etapa atual
- Excecao
- Retrabalho
- Idempotencia
- Fonte de importacao
- Checklist
- Protocolo de entrega
- Evidencia

### 2.3 Leis e normas minimas (6 itens)

- Lei Geral de Protecao de Dados (LGPD)
- Politica interna de classificacao documental
- Norma de retencao e descarte documental
- Procedimento de auditoria operacional
- Norma de rastreabilidade de alteracoes
- Guia de seguranca da informacao

## 3) Regra de qualidade editorial

- Todo documento deve ter:
  - Objetivo
  - Escopo
  - Entrada
  - Passo a passo
  - Criterio de aceite
  - Erros comuns
  - Evidencias geradas
  - Ultima revisao

- Revisao:
  - Mensal para `PROCEDIMENTOS_ETAPA`
  - Trimestral para `NORMAS_LEIS`

## 4) Ordem de cadastro sugerida

1. Documentos por etapa (7 itens)
2. Matriz de decisao + Excecoes + Duplicidade (3 itens)
3. Glossario (15 termos)
4. Leis e normas (6 itens)

## 5) Arquivo seed

Use o arquivo [conhecimento-operacional-seed.json](/c:/projects/recorda/docs/conhecimento-operacional-seed.json) para cadastro inicial via API/tela administrativa.

## 6) Aplicacao via API (admin)

1. Criar documentos em lote (iterando `documentos` do JSON):

```bash
curl -X POST "$API_URL/operacional/conhecimento/documentos" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...objeto_documento...}'
```

2. Criar glossario em lote (iterando `glossario`):

```bash
curl -X POST "$API_URL/operacional/conhecimento/glossario" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...objeto_glossario...}'
```

3. Criar leis/normas em lote (iterando `leisNormas`):

```bash
curl -X POST "$API_URL/operacional/conhecimento/leis-normas" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...objeto_lei_norma...}'
```
