-- Migration: 097_tipos_ausencia_seed
-- Adiciona o tipo "Outro" na tabela tipos_ausencia, caso ainda não exista

INSERT INTO tipos_ausencia (nome, descricao, requer_justificativa, requer_documento, desconta_salario, cor)
VALUES ('Outro', 'Motivo não listado nas categorias padrão', true, false, false, '#6B7280')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('097_tipos_ausencia_seed')
ON CONFLICT (version) DO NOTHING;
