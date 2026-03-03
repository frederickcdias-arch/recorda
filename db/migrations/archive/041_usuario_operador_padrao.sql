-- Migration: 041_usuario_operador_padrao
-- Descrição: Criar usuário operador padrão para testes
-- Data: 2026-02-11

-- Inserir usuário operador padrão (senha: operador123)
-- Hash gerado com bcrypt, rounds=10
INSERT INTO usuarios (nome, email, senha_hash, perfil)
SELECT 'Operador', 'operador@recorda.local', '$2b$10$a0sP8XnJR4GYPKeXb0p12O74rruZjL.CKjxXb6d/zWZ3PoJ9zv4tK', 'operador'
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios WHERE email = 'operador@recorda.local'
);

INSERT INTO schema_migrations (version)
SELECT '041_usuario_operador_padrao'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '041_usuario_operador_padrao'
);
