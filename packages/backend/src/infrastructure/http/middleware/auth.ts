import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PerfilUsuario } from '@recorda/shared';

/**
 * Verifica o JWT e propaga o usuario autenticado para a sessao do Postgres,
 * permitindo que os triggers de auditoria preencham usuario_id automaticamente.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
    const user = request.user as { id?: string } | undefined;
    if (user?.id) {
      try {
        await (
          request.server as {
            database?: { query: (sql: string, params?: unknown[]) => Promise<unknown> };
          }
        ).database?.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
      } catch {
        // Non-fatal: a auditoria segue com usuario nulo se esta propagacao falhar.
      }
    }
  } catch {
    return reply.status(401).send({ error: 'Token inválido ou expirado', code: 'UNAUTHORIZED' });
  }
}

/**
 * Cria middleware de autorizacao por perfil.
 */
export function authorize(...perfisPermitidos: PerfilUsuario[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user as { perfil: PerfilUsuario } | undefined;

    if (!user) {
      return reply.status(401).send({ error: 'Usuário não autenticado', code: 'UNAUTHORIZED' });
    }

    if (!perfisPermitidos.includes(user.perfil)) {
      return reply.status(403).send({
        error: 'Acesso negado. Permissão insuficiente.',
        code: 'FORBIDDEN',
        requiredProfiles: perfisPermitidos,
        currentProfile: user.perfil,
      });
    }
  };
}
