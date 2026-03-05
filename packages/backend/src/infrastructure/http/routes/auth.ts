import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import { createHash } from 'crypto';
import { authenticate } from '../middleware/auth.js';

interface LoginBody {
  email: string;
  senha: string;
}

interface RegisterBody {
  nome: string;
  email: string;
  senha: string;
  perfil?: 'operador' | 'administrador';
  coordenadoriaId?: string;
}

interface JWTPayload {
  id: string;
  email: string;
  nome: string;
  perfil: string;
  coordenadoriaId?: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

function perfilToPapel(perfil: string): 'ADMIN' | 'OPERADOR' {
  if (perfil === 'administrador') return 'ADMIN';
  if (perfil === 'supervisor') return 'OPERADOR';
  return 'OPERADOR';
}

export const authRoutes = fp(async (server: FastifyInstance): Promise<void> => {
    // Validar JWT_SECRET obrigatório e forte em produção
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required. Please set it in your .env file.');
    }
    if (process.env.NODE_ENV === 'production' && jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production. Generate with: openssl rand -base64 48');
    }

    // Registrar plugin JWT
    await server.register(jwt, {
      secret: jwtSecret,
      sign: {
        expiresIn: '8h',
      },
    });

    server.decorate('authenticate', authenticate);

    // POST /auth/login
    server.post<{ Body: LoginBody }>('/auth/login', {
      schema: {
        tags: ['auth'],
        summary: 'Login de usuário',
        description: 'Autentica um usuário e retorna tokens JWT (access + refresh).',
        body: {
          type: 'object',
          required: ['email', 'senha'],
          properties: {
            email: { type: 'string', format: 'email' },
            senha: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              usuario: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  nome: { type: 'string' },
                  email: { type: 'string' },
                  perfil: { type: 'string' },
                },
              },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    }, async (request, reply) => {
      const { email, senha } = request.body;

      if (!email || !senha) {
        return reply.status(400).send({ error: 'E-mail e senha são obrigatórios' });
      }

      try {
        const result = await server.database.query(
          `SELECT id, nome, email, senha_hash, perfil, coordenadoria_id, ativo 
           FROM usuarios WHERE email = $1`,
          [email.toLowerCase()]
        );

        const usuario = result.rows[0];

        if (!usuario) {
          return reply.status(401).send({ error: 'Credenciais inválidas' });
        }

        if (!usuario.ativo) {
          return reply.status(401).send({ error: 'Usuário desativado. Entre em contato com o administrador.' });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);

        if (!senhaValida) {
          return reply.status(401).send({ error: 'Credenciais inválidas' });
        }

        // Atualizar último acesso
        await server.database.query(
          `UPDATE usuarios SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = $1`,
          [usuario.id]
        );

        const payload: JWTPayload = {
          id: usuario.id,
          email: usuario.email,
          nome: usuario.nome,
          perfil: usuario.perfil,
          coordenadoriaId: usuario.coordenadoria_id,
        };

        const accessToken = server.jwt.sign(payload);
        
        // Gerar refresh token
        const refreshToken = server.jwt.sign(payload, { expiresIn: '7d' });
        const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
        
        await server.database.query(
          `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_em) 
           VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
          [usuario.id, refreshTokenHash]
        );

        return reply.send({
          accessToken,
          refreshToken,
          usuario: {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            perfil: usuario.perfil,
            coordenadoriaId: usuario.coordenadoria_id,
          },
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Erro interno ao processar login' });
      }
    });

    // POST /auth/refresh
    server.post<{ Body: { refreshToken: string } }>('/auth/refresh', {
      schema: {
        tags: ['auth'],
        summary: 'Renovar token de acesso',
        description: 'Usa um refresh token válido para obter um novo access token.',
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    }, async (request, reply) => {
      const { refreshToken } = request.body;

      if (!refreshToken) {
        return reply.status(400).send({ error: 'Refresh token é obrigatório' });
      }

      try {
        // Verificar se o token é válido
        const decoded = server.jwt.verify<JWTPayload>(refreshToken);

        // Buscar tokens válidos do usuário
        const tokensResult = await server.database.query(
          `SELECT id, token_hash FROM refresh_tokens 
           WHERE usuario_id = $1 AND revogado = false AND expira_em > CURRENT_TIMESTAMP`,
          [decoded.id]
        );

        let tokenValido = false;
        let tokenId = '';

        for (const row of tokensResult.rows) {
          const match = await bcrypt.compare(refreshToken, row.token_hash);
          if (match) {
            tokenValido = true;
            tokenId = row.id;
            break;
          }
        }

        if (!tokenValido) {
          return reply.status(401).send({ error: 'Refresh token inválido ou expirado' });
        }

        // Buscar dados atualizados do usuário
        const userResult = await server.database.query(
          `SELECT id, nome, email, perfil, coordenadoria_id, ativo FROM usuarios WHERE id = $1`,
          [decoded.id]
        );

        const usuario = userResult.rows[0];

        if (!usuario || !usuario.ativo) {
          return reply.status(401).send({ error: 'Usuário não encontrado ou desativado' });
        }

        // Revogar token antigo
        await server.database.query(
          `UPDATE refresh_tokens SET revogado = true WHERE id = $1`,
          [tokenId]
        );

        const payload: JWTPayload = {
          id: usuario.id,
          email: usuario.email,
          nome: usuario.nome,
          perfil: usuario.perfil,
          coordenadoriaId: usuario.coordenadoria_id,
        };

        const newAccessToken = server.jwt.sign(payload);
        const newRefreshToken = server.jwt.sign(payload, { expiresIn: '7d' });
        const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);

        await server.database.query(
          `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_em) 
           VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '7 days')`,
          [usuario.id, newRefreshTokenHash]
        );

        return reply.send({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(401).send({ error: 'Refresh token inválido' });
      }
    });

    // POST /auth/logout
    server.post('/auth/logout', async (request, reply) => {
      try {
        await request.jwtVerify();
        const user = request.user;

        // Revogar todos os refresh tokens do usuário
        await server.database.query(
          `UPDATE refresh_tokens SET revogado = true WHERE usuario_id = $1`,
          [user.id]
        );

        return reply.send({ message: 'Logout realizado com sucesso' });
      } catch {
        // Mesmo sem token válido, retorna sucesso
        return reply.send({ message: 'Logout realizado' });
      }
    });

    // GET /auth/me - Retorna dados do usuário autenticado
    server.get('/auth/me', {
      preHandler: [server.authenticate],
    }, async (request, reply) => {
      try {
        const user = request.user;

        const result = await server.database.query(
          `SELECT u.id, u.nome, u.email, u.perfil, u.coordenadoria_id, u.ativo, u.ultimo_acesso,
                  c.nome as coordenadoria_nome, c.sigla as coordenadoria_sigla
           FROM usuarios u
           LEFT JOIN coordenadorias c ON u.coordenadoria_id = c.id
           WHERE u.id = $1`,
          [user.id]
        );

        const usuario = result.rows[0];

        if (!usuario) {
          return reply.status(404).send({ error: 'Usuário não encontrado' });
        }

        return reply.send({
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          perfil: usuario.perfil,
          ativo: usuario.ativo,
          ultimoAcesso: usuario.ultimo_acesso,
          coordenadoria: usuario.coordenadoria_id ? {
            id: usuario.coordenadoria_id,
            nome: usuario.coordenadoria_nome,
            sigla: usuario.coordenadoria_sigla,
          } : null,
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Erro ao buscar dados do usuário' });
      }
    });

    // POST /auth/register (apenas para administradores)
    server.post<{ Body: RegisterBody }>('/auth/register', {
      preHandler: [server.authenticate],
    }, async (request, reply) => {
      const user = request.user;

      if (user.perfil !== 'administrador') {
        return reply.status(403).send({ error: 'Apenas administradores podem criar usuários' });
      }

      const { nome, email, senha, perfil = 'operador', coordenadoriaId } = request.body;

      if (!nome || !email || !senha) {
        return reply.status(400).send({ error: 'Nome, e-mail e senha são obrigatórios' });
      }

      if (senha.length < 8) {
        return reply.status(400).send({ error: 'Senha deve ter no mínimo 8 caracteres' });
      }

      if (!['operador', 'administrador'].includes(perfil)) {
        return reply.status(400).send({ error: 'Perfil inválido. Use operador ou administrador.' });
      }

      try {
        // Verificar se e-mail já existe
        const existeResult = await server.database.query(
          `SELECT id FROM usuarios WHERE email = $1`,
          [email.toLowerCase()]
        );

        if (existeResult.rows.length > 0) {
          return reply.status(409).send({ error: 'E-mail já cadastrado' });
        }

        const senhaHash = await bcrypt.hash(senha, 10);

        const result = await server.database.query(
          `INSERT INTO usuarios (nome, email, senha_hash, perfil, coordenadoria_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, nome, email, perfil, coordenadoria_id`,
          [nome, email.toLowerCase(), senhaHash, perfil, coordenadoriaId || null]
        );

        const novoUsuario = result.rows[0] as { id: string; nome: string; email: string; perfil: string; coordenadoria_id: string | null } | undefined;

        if (!novoUsuario) {
          return reply.status(500).send({ error: 'Erro ao criar usuário' });
        }

        return reply.status(201).send({
          id: novoUsuario.id,
          nome: novoUsuario.nome,
          email: novoUsuario.email,
          perfil: novoUsuario.perfil,
          coordenadoriaId: novoUsuario.coordenadoria_id,
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Erro ao criar usuário' });
      }
    });

    // GET /auth/usuarios - Listar usuários (apenas administrador)
    server.get('/auth/usuarios', {
      preHandler: [server.authenticate],
    }, async (request, reply) => {
      const user = request.user;

      if (user.perfil !== 'administrador') {
        return reply.status(403).send({ error: 'Apenas administradores podem listar usuários' });
      }

      try {
        const result = await server.database.query(
          `SELECT id, nome, email, perfil, ativo, criado_em
           FROM usuarios
           ORDER BY criado_em DESC`
        );

        const usuarios = result.rows.map((row: Record<string, unknown>) => ({
          id: row.id as string,
          nome: row.nome as string,
          email: row.email as string,
          perfil: row.perfil as string,
          papel: perfilToPapel(row.perfil as string),
          ativo: row.ativo as boolean,
          criado_em: row.criado_em as string,
        }));

        return reply.send({ usuarios });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Erro ao listar usuários' });
      }
    });

    // PATCH /auth/usuarios/:id/toggle-ativo - Ativar/desativar usuário (apenas administrador)
    server.patch<{ Params: { id: string } }>('/auth/usuarios/:id/toggle-ativo', {
      preHandler: [server.authenticate],
    }, async (request, reply) => {
      const user = request.user;

      if (user.perfil !== 'administrador') {
        return reply.status(403).send({ error: 'Apenas administradores podem alterar usuários' });
      }

      const { id } = request.params;
      if (id === user.id) {
        return reply.status(400).send({ error: 'Não é permitido desativar seu próprio usuário' });
      }

      try {
        const result = await server.database.query(
          `UPDATE usuarios
           SET ativo = NOT ativo, atualizado_em = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING id, nome, email, perfil, ativo, criado_em`,
          [id]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Usuário não encontrado' });
        }

        const row = result.rows[0] as Record<string, unknown>;
        return reply.send({
          id: row.id as string,
          nome: row.nome as string,
          email: row.email as string,
          perfil: row.perfil as string,
          papel: perfilToPapel(row.perfil as string),
          ativo: row.ativo as boolean,
          criado_em: row.criado_em as string,
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Erro ao alterar status do usuário' });
      }
    });

    // PUT /auth/change-password
    server.put<{ Body: { senhaAtual: string; novaSenha: string } }>('/auth/change-password', {
      preHandler: [server.authenticate],
    }, async (request, reply) => {
      const user = request.user;
      const { senhaAtual, novaSenha } = request.body;

      if (!senhaAtual || !novaSenha) {
        return reply.status(400).send({ error: 'Senha atual e nova senha são obrigatórias' });
      }

      if (novaSenha.length < 8) {
        return reply.status(400).send({ error: 'Nova senha deve ter no mínimo 8 caracteres' });
      }

      try {
        const result = await server.database.query(
          `SELECT senha_hash FROM usuarios WHERE id = $1`,
          [user.id]
        );

        const usuario = result.rows[0];

        if (!usuario) {
          return reply.status(404).send({ error: 'Usuário não encontrado' });
        }

        const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha_hash);

        if (!senhaValida) {
          return reply.status(401).send({ error: 'Senha atual incorreta' });
        }

        const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

        await server.database.query(
          `UPDATE usuarios SET senha_hash = $1 WHERE id = $2`,
          [novaSenhaHash, user.id]
        );

        // Revogar todos os refresh tokens
        await server.database.query(
          `UPDATE refresh_tokens SET revogado = true WHERE usuario_id = $1`,
          [user.id]
        );

        return reply.send({ message: 'Senha alterada com sucesso. Faça login novamente.' });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Erro ao alterar senha' });
      }
    });

    // POST /auth/forgot-password - Solicitar redefinição de senha
    server.post<{ Body: { email: string } }>('/auth/forgot-password', async (request, reply) => {
      const { email } = request.body;

      if (!email) {
        return reply.status(400).send({ error: 'E-mail é obrigatório' });
      }

      try {
        // Verificar se usuário existe
        const result = await server.database.query(
          `SELECT id, nome, email FROM usuarios WHERE email = $1 AND ativo = true`,
          [email.toLowerCase()]
        );

        // Sempre retornar sucesso para não revelar se o e-mail existe
        if (result.rows.length === 0) {
          return reply.send({ 
            message: 'Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.' 
          });
        }

        const usuario = result.rows[0] as { id: string; nome: string; email: string };

        // Gerar token de reset (válido por 1 hora)
        const resetToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

        // Hash do token antes de salvar no banco
        const tokenHash = createHash('sha256').update(resetToken).digest('hex');
        await server.database.query(
          `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_em) 
           VALUES ($1, $2, $3)`,
          [usuario.id, `reset:${tokenHash}`, expiresAt]
        );

        // Enviar e-mail com link de reset
        const configuredAppUrl = process.env.APP_URL?.trim();
        if (process.env.NODE_ENV === 'production' && !configuredAppUrl) {
          request.log.error('APP_URL is required in production for password reset links');
          return reply.status(500).send({ error: 'Configuração de ambiente incompleta para recuperação de senha' });
        }

        const originHeader = typeof request.headers.origin === 'string' ? request.headers.origin.trim() : '';
        const hostHeader = typeof request.headers.host === 'string' ? request.headers.host.trim() : '';
        const inferredAppUrl = hostHeader ? `${request.protocol}://${hostHeader}` : '';
        const appUrl = configuredAppUrl || originHeader || inferredAppUrl;

        if (!appUrl) {
          request.log.error('Unable to resolve app URL for password reset link');
          return reply.status(500).send({ error: 'Não foi possível gerar link de recuperação de senha' });
        }

        const resetLink = `${appUrl}/reset-password?token=${resetToken}`;

        try {
          await server.emailService.send({
            to: usuario.email,
            subject: 'Recorda - Redefinição de Senha',
            html: [
              `<p>Olá ${usuario.nome},</p>`,
              `<p>Recebemos uma solicitação para redefinir sua senha.</p>`,
              `<p><a href="${resetLink}">Clique aqui para redefinir sua senha</a></p>`,
              `<p>Ou copie e cole o link: ${resetLink}</p>`,
              `<p>Este link expira em 1 hora.</p>`,
              `<p>Se você não solicitou esta alteração, ignore este e-mail.</p>`,
            ].join('\n'),
            text: `Olá ${usuario.nome},\n\nAcesse o link para redefinir sua senha: ${resetLink}\n\nEste link expira em 1 hora.`,
          });
        } catch (emailError) {
          request.log.error(emailError, 'Failed to send password reset email');
        }

        return reply.send({ 
          message: 'Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.',
          // Em desenvolvimento, retornar o token para facilitar testes
          ...(process.env.NODE_ENV !== 'production' && { resetToken })
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Erro ao processar solicitação' });
      }
    });

    // POST /auth/reset-password - Redefinir senha com token
    server.post<{ Body: { token: string; novaSenha: string } }>('/auth/reset-password', async (request, reply) => {
      const { token, novaSenha } = request.body;

      if (!token || !novaSenha) {
        return reply.status(400).send({ error: 'Token e nova senha são obrigatórios' });
      }

      if (novaSenha.length < 8) {
        return reply.status(400).send({ error: 'A senha deve ter pelo menos 8 caracteres' });
      }

      try {
        // Hash do token recebido para comparar com o banco
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const tokenResult = await server.database.query(
          `SELECT rt.usuario_id, rt.id as token_id
           FROM refresh_tokens rt
           WHERE rt.token_hash = $1 
             AND rt.expira_em > NOW() 
             AND rt.revogado = false`,
          [`reset:${tokenHash}`]
        );

        if (tokenResult.rows.length === 0) {
          return reply.status(400).send({ error: 'Token inválido ou expirado' });
        }

        const { usuario_id, token_id } = tokenResult.rows[0] as { usuario_id: string; token_id: string };

        // Atualizar senha
        const novaSenhaHash = await bcrypt.hash(novaSenha, 10);
        await server.database.query(
          `UPDATE usuarios SET senha_hash = $1 WHERE id = $2`,
          [novaSenhaHash, usuario_id]
        );

        // Revogar token de reset
        await server.database.query(
          `UPDATE refresh_tokens SET revogado = true WHERE id = $1`,
          [token_id]
        );

        // Revogar todos os outros refresh tokens do usuário
        await server.database.query(
          `UPDATE refresh_tokens SET revogado = true WHERE usuario_id = $1`,
          [usuario_id]
        );

        return reply.send({ message: 'Senha redefinida com sucesso. Faça login com sua nova senha.' });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Erro ao redefinir senha' });
      }
    });
});

// Exportar decorator type
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
