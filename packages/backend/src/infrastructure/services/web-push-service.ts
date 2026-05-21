import webpush from 'web-push';
import type { DatabaseConnection } from '../database/connection.js';

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface ComunicadoPushPayload {
  comunicadoId: string;
  titulo: string;
  conteudo: string;
  prioridade: 'BAIXA' | 'MEDIA' | 'ALTA';
  usuarioIds: string[];
}

export interface WebPushService {
  enabled: boolean;
  sendComunicadoPublicado: (payload: ComunicadoPushPayload) => Promise<void>;
}

function truncateBody(conteudo: string): string {
  const normalized = conteudo.trim().replace(/\s+/g, ' ');
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 137)}...`;
}

export function createWebPushService(database: DatabaseConnection): WebPushService {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) {
    return {
      enabled: false,
      sendComunicadoPublicado: async () => undefined,
    };
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  return {
    enabled: true,
    sendComunicadoPublicado: async ({
      comunicadoId,
      titulo,
      conteudo,
      prioridade,
      usuarioIds,
    }: ComunicadoPushPayload): Promise<void> => {
      const destinatarios = Array.from(new Set(usuarioIds));
      if (destinatarios.length === 0) {
        return;
      }

      const subscriptionsResult = await database.query<PushSubscriptionRow>(
        `SELECT id, endpoint, p256dh, auth
         FROM push_subscriptions
         WHERE ativo = TRUE
           AND usuario_id = ANY($1::uuid[])`,
        [destinatarios]
      );

      await Promise.all(
        subscriptionsResult.rows.map(async (subscription) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: {
                  p256dh: subscription.p256dh,
                  auth: subscription.auth,
                },
              },
              JSON.stringify({
                title: titulo,
                body: truncateBody(conteudo),
                tag: `comunicado-${comunicadoId}`,
                url: '/comunicados',
                data: {
                  comunicadoId,
                  prioridade,
                },
              })
            );
          } catch (error) {
            const statusCode =
              typeof error === 'object' && error && 'statusCode' in error
                ? Number((error as { statusCode?: number }).statusCode)
                : 0;

            if (statusCode === 404 || statusCode === 410) {
              await database.query(
                `UPDATE push_subscriptions
                 SET ativo = FALSE,
                     atualizado_em = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [subscription.id]
              );
            }
          }
        })
      );
    },
  };
}
