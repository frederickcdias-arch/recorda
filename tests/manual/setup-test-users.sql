UPDATE usuarios 
SET senha_hash = '$2b$10$IlzdtJwRyl5cjRnnJ4wLuOsNhhgpWsQsuU8rKi8TqQDcvjESP87k.'
WHERE email = 'teste@recorda.local'
RETURNING id, email;

INSERT INTO usuarios (nome, email, senha_hash, perfil)
VALUES ('Operador Teste', 'operador.teste@recorda.local', '$2b$10$IlzdtJwRyl5cjRnnJ4wLuOsNhhgpWsQsuU8rKi8TqQDcvjESP87k.', 'operador')
ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash
RETURNING id, email, perfil;
