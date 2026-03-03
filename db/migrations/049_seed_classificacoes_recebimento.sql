-- Migration: 049_seed_classificacoes_recebimento
-- Description: Pré-popula classificacoes_recebimento com os códigos de Tipo Documental do projeto.

INSERT INTO classificacoes_recebimento (nome, criado_por)
SELECT nome, (SELECT id FROM usuarios WHERE email = 'admin@recorda.local' LIMIT 1)
FROM (VALUES
  ('000 - ADMINISTRAÇÃO GERAL'),
  ('030 - MATERIAL'),
  ('200 - POLÍTICAS RURAIS E DE DEFESA DO MEIO AMBIENTE'),
  ('250 - DEFESA AMBIENTAL'),
  ('251 - LICENCIAMENTOS AMBIENTAIS'),
  ('251.1 - Propriedade Rural'),
  ('251.2 - LICENCIAMENTOS AMBIENTAIS DE INFRA-ESTRUTURA, MINERAÇÃO, INDÚSTRIA E SERVIÇOS'),
  ('251.21 - ATIVIDADES INDUSTRIAIS'),
  ('251.22 - ATIVIDADES AGROPECUÁRIAS E DE PISCICULTURA'),
  ('251.23 - ATIVIDADES DE EMPREENDIMENTOS ENERGÉTICOS'),
  ('251.23.1 - Distribuição'),
  ('251.23.2 - Geração'),
  ('251.24 - PRESTADORES DE SERVIÇO'),
  ('251.25 - EMPREENDIMENTOS DE BASE FLORESTAL'),
  ('251.26 - EMPRENDIMENTOS DE MINERAÇÃO'),
  ('251.27 - LICENCIAMENTOS DE INFRAESTRUTURA'),
  ('251.27.1 - ATIVIDADES POTENCIALMENTE POLUIDORAS LIGADAS A RESÍDUOS SÓLIDOS'),
  ('256 - FISCALIZAÇÃO AMBIENTAL')
) AS v(nome)
WHERE NOT EXISTS (
  SELECT 1 FROM classificacoes_recebimento c WHERE LOWER(TRIM(c.nome)) = LOWER(TRIM(v.nome))
);
