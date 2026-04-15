-- =====================================================================
-- SCRIPT: Vincular Produções Legadas a Usuários Colaboradores
-- =====================================================================
-- Descrição: Este script permite vincular produções antigas (importadas
--            do sistema legado) aos usuários colaboradores criados no
--            novo sistema, baseando-se no nome do colaborador.
--
-- Data: 2026-04-15
-- Autor: Sistema Recorda
-- =====================================================================

-- =====================================================================
-- PARTE 1: CONSULTAS DE VERIFICAÇÃO
-- =====================================================================

-- 1.1. Listar colaboradores únicos nas produções legadas
-- Use esta query para ver quais nomes estão registrados
SELECT 
  DISTINCT TRIM(marcadores->>'colaborador_nome') as colaborador_nome,
  COUNT(*) as total_producoes
FROM producao_repositorio
WHERE COALESCE(marcadores->>'origem', '') = 'LEGADO'
  AND TRIM(marcadores->>'colaborador_nome') != ''
GROUP BY TRIM(marcadores->>'colaborador_nome')
ORDER BY total_producoes DESC;

-- 1.2. Verificar usuários colaboradores existentes
SELECT 
  id,
  nome,
  email,
  perfil,
  ativo
FROM usuarios
WHERE perfil = 'colaborador'
ORDER BY nome;

-- 1.3. Verificar produções de um colaborador específico (EXEMPLO)
-- Substitua 'NOME DO COLABORADOR' pelo nome real
SELECT 
  pr.id,
  pr.data_producao::date as data,
  pr.etapa,
  pr.quantidade,
  r.id_repositorio_ged,
  pr.marcadores->>'colaborador_nome' as colaborador,
  u.nome as usuario_atual,
  pr.marcadores->>'origem' as origem
FROM producao_repositorio pr
JOIN repositorios r ON r.id_repositorio_recorda = pr.repositorio_id
JOIN usuarios u ON u.id = pr.usuario_id
WHERE LOWER(TRIM(pr.marcadores->>'colaborador_nome')) = LOWER('NOME DO COLABORADOR')
  AND COALESCE(pr.marcadores->>'origem', '') = 'LEGADO'
ORDER BY pr.data_producao DESC
LIMIT 10;

-- =====================================================================
-- PARTE 2: VINCULAÇÃO DE PRODUÇÕES
-- =====================================================================

-- 2.1. TEMPLATE: Vincular produções de um colaborador específico
-- 
-- INSTRUÇÕES:
-- 1. Substitua '[UUID_DO_USUARIO]' pelo ID do usuário criado (da query 1.2)
-- 2. Substitua 'NOME DO COLABORADOR' pelo nome exato (da query 1.1)
-- 3. Execute a query de visualização (comentada abaixo) primeiro para confirmar
-- 4. Execute o UPDATE somente depois de confirmar

-- PASSO 1: VISUALIZAR o que será atualizado (SEMPRE EXECUTE PRIMEIRO)
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
WHERE LOWER(TRIM(pr.marcadores->>'colaborador_nome')) = LOWER('NOME DO COLABORADOR')
  AND COALESCE(pr.marcadores->>'origem', '') = 'LEGADO'
  AND u_novo.id = '[UUID_DO_USUARIO]';

-- PASSO 2: EXECUTAR o UPDATE (somente após confirmar acima)
/*
UPDATE producao_repositorio
SET usuario_id = '[UUID_DO_USUARIO]'
WHERE LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER('NOME DO COLABORADOR')
  AND COALESCE(marcadores->>'origem', '') = 'LEGADO';
*/

-- =====================================================================
-- PARTE 3: EXEMPLOS PRÁTICOS
-- =====================================================================

-- EXEMPLO 1: Vincular produções de "João Silva" ao usuário criado
-- 
-- Suponha que:
-- - Nome no sistema legado: "João Silva"
-- - ID do usuário criado: '550e8400-e29b-41d4-a716-446655440001'

-- Passo 1: Verificar
/*
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
  AND u_novo.id = '550e8400-e29b-41d4-a716-446655440001';
*/

-- Passo 2: Executar (após confirmar)
/*
UPDATE producao_repositorio
SET usuario_id = '550e8400-e29b-41d4-a716-446655440001'
WHERE LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER('João Silva')
  AND COALESCE(marcadores->>'origem', '') = 'LEGADO';
*/

-- EXEMPLO 2: Vincular produções de "Maria Santos" ao usuário criado
/*
-- ID do usuário: '550e8400-e29b-41d4-a716-446655440002'

-- Verificar:
SELECT COUNT(*) as total_producoes
FROM producao_repositorio
WHERE LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER('Maria Santos')
  AND COALESCE(marcadores->>'origem', '') = 'LEGADO';

-- Executar:
UPDATE producao_repositorio
SET usuario_id = '550e8400-e29b-41d4-a716-446655440002'
WHERE LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER('Maria Santos')
  AND COALESCE(marcadores->>'origem', '') = 'LEGADO';
*/

-- =====================================================================
-- PARTE 4: VALIDAÇÃO PÓS-VINCULAÇÃO
-- =====================================================================

-- 4.1. Verificar produções vinculadas por usuário colaborador
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

-- 4.2. Verificar se ainda há produções legadas não vinculadas a colaboradores
SELECT 
  TRIM(marcadores->>'colaborador_nome') as colaborador_sem_usuario,
  COUNT(*) as producoes_nao_vinculadas,
  MIN(data_producao)::date as primeira,
  MAX(data_producao)::date as ultima
FROM producao_repositorio pr
JOIN usuarios u ON u.id = pr.usuario_id
WHERE COALESCE(pr.marcadores->>'origem', '') = 'LEGADO'
  AND u.perfil != 'colaborador'
  AND TRIM(pr.marcadores->>'colaborador_nome') != ''
GROUP BY TRIM(pr.marcadores->>'colaborador_nome')
ORDER BY producoes_nao_vinculadas DESC;

-- 4.3. Verificar histórico de um colaborador específico após vinculação
-- Substitua '[UUID_DO_USUARIO]' pelo ID do usuário
/*
SELECT 
  pr.data_producao::date as data,
  pr.etapa,
  r.id_repositorio_ged as repositorio,
  pr.quantidade,
  pr.marcadores->>'origem' as origem,
  pr.marcadores->>'coordenadoria' as coordenadoria
FROM producao_repositorio pr
JOIN repositorios r ON r.id_repositorio_recorda = pr.repositorio_id
WHERE pr.usuario_id = '[UUID_DO_USUARIO]'
ORDER BY pr.data_producao DESC;
*/

-- =====================================================================
-- PARTE 5: ROLLBACK (EM CASO DE ERRO)
-- =====================================================================

-- 5.1. DESFAZER vinculação de um colaborador específico
-- Use SOMENTE se precisar reverter uma vinculação incorreta
-- 
-- CUIDADO: Isso vai DESVINCULAR as produções do usuário colaborador
-- Você precisará fornecer o ID de um usuário "padrão" para onde mover
/*
UPDATE producao_repositorio
SET usuario_id = '[UUID_USUARIO_PADRAO_SISTEMA]'
WHERE usuario_id = '[UUID_DO_COLABORADOR_PARA_DESFAZER]'
  AND COALESCE(marcadores->>'origem', '') = 'LEGADO';
*/

-- =====================================================================
-- NOTAS IMPORTANTES
-- =====================================================================
-- 
-- 1. SEMPRE execute as queries de VERIFICAÇÃO antes de fazer UPDATE
-- 
-- 2. A vinculação é feita por NOME (case-insensitive e trim)
--    Se um colaborador tem variações de nome no legado,
--    você precisará fazer múltiplos UPDATEs ou ajustar a condição
-- 
-- 3. Apenas produções com origem='LEGADO' serão vinculadas
--    Produções lançadas diretamente (origem='SISTEMA') já estão corretas
-- 
-- 4. Após vincular, o colaborador verá TODAS suas produções antigas
--    ao fazer login em "Meu Histórico"
-- 
-- 5. A vinculação NÃO afeta os relatórios gerenciais, que continuam
--    funcionando normalmente
--
-- 6. Recomenda-se fazer backup antes de executar UPDATEs em massa
--
-- =====================================================================
