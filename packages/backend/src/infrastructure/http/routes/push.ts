import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type {
  PushSubscriptionResponse,
  RegistrarPushSubscriptionDTO,
  RemoverPushSubscriptionDTO,
} from '@recorda/shared';
import { validateBody } from '../middleware/validate.js';
import { getCurrentUser } from './operacional-helpers.js';

const registrarPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(500).optional(),
  deviceLabel: z.string().trim().max(120).optional(),
});

const removerPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
});

async function setAuditUser(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  userId: string
): Promise<void> {
  await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
}

export function createPushRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    server.post<{ Body: RegistrarPushSubscriptionDTO }>(
      '/push/subscriptions',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Registrar subscription de push do usuario autenticado',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, validateBody(registrarPushSubscriptionSchema)],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const body = request.body as RegistrarPushSubscriptionDTO;
        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await setAuditUser(client, user.id);

          await client.query(
            `INSERT INTO push_subscriptions (
               usuario_id,
               endpoint,
               p256dh,
               auth,
               expiration_time,
               user_agent,
               device_label,
               ativo
             )
             VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6, $7, TRUE)
             ON CONFLICT (endpoint)
             DO UPDATE SET
               usuario_id = EXCLUDED.usuario_id,
               p256dh = EXCLUDED.p256dh,
               auth = EXCLUDED.auth,
               expiration_time = EXCLUDED.expiration_time,
               user_agent = EXCLUDED.user_agent,
               device_label = EXCLUDED.device_label,
               ativo = TRUE,
               atualizado_em = CURRENT_TIMESTAMP`,
            [
              user.id,
              body.endpoint,
              body.keys.p256dh,
              body.keys.auth,
              body.expirationTime,
              body.userAgent ?? null,
              body.deviceLabel ?? null,
            ]
          );

          await client.query('COMMIT');

          const response: PushSubscriptionResponse = {
            message: 'Subscription registrada com sucesso',
          };
          return reply.send(response);
        } catch (error) {
          await client.query('ROLLBACK');
          request.log.error(error);
          const message =
            error instanceof Error ? error.message : 'Erro ao registrar subscription push';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );

    server.post<{ Body: RemoverPushSubscriptionDTO }>(
      '/push/subscriptions/remover',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Remover subscription de push do usuario autenticado',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, validateBody(removerPushSubscriptionSchema)],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const body = request.body as RemoverPushSubscriptionDTO;
        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await setAuditUser(client, user.id);

          await client.query(
            `UPDATE push_subscriptions
             SET ativo = FALSE,
                 atualizado_em = CURRENT_TIMESTAMP
             WHERE usuario_id = $1
               AND endpoint = $2`,
            [user.id, body.endpoint]
          );

          await client.query('COMMIT');

          const response: PushSubscriptionResponse = {
            message: 'Subscription removida com sucesso',
          };
          return reply.send(response);
        } catch (error) {
          await client.query('ROLLBACK');
          request.log.error(error);
          const message =
            error instanceof Error ? error.message : 'Erro ao remover subscription push';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );
  };
}
