import type { FastifyRequest, FastifyReply } from 'fastify';

export type PerfilUsuario = 'operador' | 'administrador';

/**
 * Middleware de autenticação - verifica se o token JWT é válido e
 * propaga o ID do usuário autenticado para a sessão PostgreSQL via
 * SET LOCAL app.current_user_id, permitindo que audit_trigger_function()
 * preencha usuario_id automaticamente sem parâmetros explícitos.
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
        // Non-fatal: audit trigger will use NULL if this fails
      }
    }
  } catch (err) {
    return reply.status(401).send({ error: 'Token inválido ou expirado', code: 'UNAUTHORIZED' });
  }
}

/**
 * Factory para criar middleware de autorização por perfil
 * @param perfisPermitidos - Lista de perfis que podem acessar a rota
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

/**
 * Middleware combinado: autenticação + autorização
 */
export function requireAuth(...perfisPermitidos: PerfilUsuario[]) {
  if (perfisPermitidos.length === 0) {
    return [authenticate];
  }
  return [authenticate, authorize(...perfisPermitidos)];
}

/**
 * Permissões por funcionalidade
 */
export const PERMISSIONS = {
  // Qualquer usuário autenticado
  VIEW_DASHBOARD: [] as PerfilUsuario[],
  VIEW_CONHECIMENTO: [] as PerfilUsuario[],

  // Operador ou superior
  CAPTURE_DOCUMENTS: ['operador', 'administrador'] as PerfilUsuario[],
  VIEW_PROCESSOS: ['operador', 'administrador'] as PerfilUsuario[],

  // Operador ou superior
  IMPORT_PRODUCAO: ['operador', 'administrador'] as PerfilUsuario[],
  GENERATE_REPORTS: ['operador', 'administrador'] as PerfilUsuario[],
  VIEW_AUDITORIA: ['operador', 'administrador'] as PerfilUsuario[],

  // Apenas administrador
  MANAGE_USERS: ['administrador'] as PerfilUsuario[],
  MANAGE_CONFIG: ['administrador'] as PerfilUsuario[],
  MANAGE_COLABORADORES: ['administrador'] as PerfilUsuario[],
  MANAGE_ETAPAS: ['administrador'] as PerfilUsuario[],
};
