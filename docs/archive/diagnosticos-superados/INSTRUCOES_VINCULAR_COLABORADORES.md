# 📋 Instruções: Vincular Produções Legadas a Colaboradores

## 🎯 Objetivo

Vincular produções antigas (importadas do sistema legado) aos usuários colaboradores que você criar no novo sistema, para que quando eles fizerem login possam ver todo o histórico deles.

---

## 📝 Processo Passo a Passo

### Passo 1: Identificar Colaboradores no Sistema Legado

Execute esta query para ver quais colaboradores têm produções registradas:

```sql
SELECT
  DISTINCT TRIM(marcadores->>'colaborador_nome') as colaborador_nome,
  COUNT(*) as total_producoes
FROM producao_repositorio
WHERE COALESCE(marcadores->>'origem', '') = 'LEGADO'
  AND TRIM(marcadores->>'colaborador_nome') != ''
GROUP BY TRIM(marcadores->>'colaborador_nome')
ORDER BY total_producoes DESC;
```

**Resultado esperado:**

```
colaborador_nome    | total_producoes
--------------------+----------------
João Silva          | 1250
Maria Santos        | 980
Pedro Oliveira      | 750
...
```

---

### Passo 2: Criar Usuários Colaboradores no Sistema

Para cada colaborador identificado acima, crie um usuário:

**Via Interface (Recomendado):**

1. Acesse: **Configurações → Usuários**
2. Clique em **"Novo Usuário"**
3. Preencha:
   - **Nome:** João Silva (use o nome exato da query acima)
   - **Email:** joao.silva@exemplo.com
   - **Perfil:** Colaborador
   - **Senha:** [senha temporária]
4. Anote o **ID do usuário** criado (aparece na URL ou nos detalhes)

**Via SQL (Alternativa):**

```sql
INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo)
VALUES (
  'João Silva',
  'joao.silva@exemplo.com',
  crypt('senha_temporaria_123', gen_salt('bf')),
  'colaborador',
  true
) RETURNING id, nome, email;
```

---

### Passo 3: Vincular Produções ao Usuário Criado

**⚠️ IMPORTANTE: SEMPRE visualize primeiro antes de atualizar!**

#### 3.1. Visualizar o que será vinculado

```sql
-- Substitua:
-- - 'João Silva' pelo nome do colaborador
-- - '[UUID_DO_USUARIO]' pelo ID do usuário criado (formato: 550e8400-e29b-41d4-a716-446655440001)

SELECT
  pr.id,
  pr.data_producao::date,
  pr.etapa,
  pr.quantidade,
  pr.marcadores->>'colaborador_nome' as colaborador_nome,
  u_atual.nome as usuario_atual,
  u_novo.nome as novo_usuario
FROM producao_repositorio pr
JOIN usuarios u_atual ON u_atual.id = pr.usuario_id
CROSS JOIN usuarios u_novo
WHERE LOWER(TRIM(pr.marcadores->>'colaborador_nome')) = LOWER('João Silva')
  AND COALESCE(pr.marcadores->>'origem', '') = 'LEGADO'
  AND u_novo.id = '[UUID_DO_USUARIO]';
```

**Verifique:**

- O número de registros encontrados bate com o esperado?
- O nome do colaborador está correto?
- O novo usuário é o correto?

#### 3.2. Executar a Vinculação

**Somente após confirmar acima**, execute:

```sql
UPDATE producao_repositorio
SET usuario_id = '[UUID_DO_USUARIO]'
WHERE LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER('João Silva')
  AND COALESCE(marcadores->>'origem', '') = 'LEGADO';
```

**Resultado esperado:**

```
UPDATE 1250
```

---

### Passo 4: Validar a Vinculação

#### 4.1. Verificar total de produções vinculadas

```sql
SELECT
  u.nome as colaborador,
  u.email,
  COUNT(pr.id) as total_producoes,
  SUM(pr.quantidade) as quantidade_total,
  MIN(pr.data_producao)::date as primeira_producao,
  MAX(pr.data_producao)::date as ultima_producao
FROM usuarios u
LEFT JOIN producao_repositorio pr ON pr.usuario_id = u.id
WHERE u.perfil = 'colaborador'
GROUP BY u.id, u.nome, u.email
ORDER BY u.nome;
```

#### 4.2. Testar o login do colaborador

1. Faça login com o usuário colaborador criado
2. Acesse **"Meu Histórico"**
3. Verifique se as produções antigas aparecem

---

## 🔄 Repetir para Outros Colaboradores

Para cada colaborador adicional:

1. **Obtenha o ID** do próximo usuário criado
2. **Execute a visualização** (Passo 3.1) com o novo nome e ID
3. **Confirme** que está correto
4. **Execute o UPDATE** (Passo 3.2)
5. **Valide** (Passo 4)

---

## 📊 Exemplo Completo: João Silva

```sql
-- 1. Criar usuário (via interface ou SQL)
-- Resultado: ID = 550e8400-e29b-41d4-a716-446655440001

-- 2. Visualizar
SELECT COUNT(*) as total
FROM producao_repositorio
WHERE LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER('João Silva')
  AND COALESCE(marcadores->>'origem', '') = 'LEGADO';
-- Resultado: 1250 produções

-- 3. Vincular
UPDATE producao_repositorio
SET usuario_id = '550e8400-e29b-41d4-a716-446655440001'
WHERE LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER('João Silva')
  AND COALESCE(marcadores->>'origem', '') = 'LEGADO';
-- Resultado: UPDATE 1250

-- 4. Validar
SELECT
  u.nome,
  COUNT(pr.id) as producoes
FROM usuarios u
JOIN producao_repositorio pr ON pr.usuario_id = u.id
WHERE u.id = '550e8400-e29b-41d4-a716-446655440001'
GROUP BY u.nome;
-- Resultado: João Silva | 1250
```

---

## ⚠️ Problemas Comuns e Soluções

### Problema 1: Nome com variações

**Sintoma:** O colaborador aparece com nomes diferentes no legado:

- "João Silva"
- "Joao Silva" (sem acento)
- "JOÃO SILVA"

**Solução:** Execute múltiplos UPDATEs ou use OR:

```sql
UPDATE producao_repositorio
SET usuario_id = '[UUID_DO_USUARIO]'
WHERE (
    LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER('João Silva')
    OR LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER('Joao Silva')
  )
  AND COALESCE(marcadores->>'origem', '') = 'LEGADO';
```

### Problema 2: Número de produções não bate

**Sintoma:** A query de validação mostra menos produções que o esperado.

**Solução:** Verifique se há filtros adicionais (data, etapa, etc.) ou se o nome está exatamente correto.

### Problema 3: Vinculação errada

**Sintoma:** Vinculou ao usuário errado.

**Solução:** Desfaça e refaça:

```sql
-- 1. Desfazer (mover para usuário genérico)
UPDATE producao_repositorio
SET usuario_id = '[UUID_USUARIO_GENERICO]'
WHERE usuario_id = '[UUID_ERRADO]'
  AND COALESCE(marcadores->>'origem', '') = 'LEGADO';

-- 2. Refazer com o ID correto
UPDATE producao_repositorio
SET usuario_id = '[UUID_CORRETO]'
WHERE LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER('João Silva')
  AND COALESCE(marcadores->>'origem', '') = 'LEGADO';
```

---

## ✅ Checklist de Conclusão

- [ ] Todos colaboradores identificados no Passo 1
- [ ] Usuários criados para cada colaborador (Passo 2)
- [ ] Produções vinculadas (Passo 3) para cada um
- [ ] Validação executada (Passo 4) para todos
- [ ] Teste de login realizado com pelo menos um colaborador
- [ ] Histórico visível corretamente em "Meu Histórico"

---

## 📁 Arquivos de Referência

- **Script SQL completo:** `db/scripts/vincular_producoes_colaboradores.sql`
- **Este documento:** `INSTRUCOES_VINCULAR_COLABORADORES.md`

---

## 🆘 Suporte

Se encontrar problemas:

1. Verifique os logs do sistema
2. Execute as queries de validação (Passo 4)
3. Consulte a seção "Problemas Comuns"
4. Entre em contato com o suporte técnico

**Data:** 2026-04-15  
**Versão do Sistema:** 1.0.0
