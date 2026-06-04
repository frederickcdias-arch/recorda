import webpush from 'web-push';
import type { DatabaseConnection } from '../database/connection.js';

function summarizeEndpoint(endpoint: string): string {
  if (endpoint.length <= 80) {
    return endpoint;
  }
  return `${endpoint.slice(0, 40)}...${endpoint.slice(-40)} (len=${endpoint.length})`;
}

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
  categoria?: string | null;
  resumo?: string | null;
  usuarioIds: string[];
}

export interface WebPushService {
  enabled: boolean;
  sendComunicadoPublicado: (payload: ComunicadoPushPayload) => Promise<void>;
}

interface PushNotificationPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  data: {
    comunicadoId: string;
    prioridade: 'BAIXA' | 'MEDIA' | 'ALTA';
  };
}

const PUSH_TITLE_DEFAULT = 'Recorda | Comunicado';
const PUSH_TITLE_ATENCAO = 'Recorda | Atenção';
const PUSH_BODY_FALLBACK = 'Novo comunicado disponível. Toque para ver os detalhes.';
const PUSH_BODY_SUFFIX = ' Toque para ver os detalhes.';
const PUSH_BODY_MAX_LENGTH = 110;

const categoriaPushLabels: Record<string, string> = {
  ADMINISTRATIVO: 'Administrativo',
  CONFERENCIA: 'Conferência',
  DIGITALIZACAO: 'Digitalização',
  GERAL: 'Comunicado',
  PRODUCAO: 'Produção',
  QUALIDADE: 'Qualidade',
  RECONFERENCIA: 'Reconferência',
  SISTEMA: 'Sistema',
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const slice = value.slice(0, Math.max(0, maxLength - 3)).trimEnd();
  return `${slice}...`;
}

function removeBrandMention(value: string): string {
  return value
    .replace(/\bfrom\s+recorda\b/gi, '')
    .replace(/\brecorda\b[\s:|,-]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingCategoryPrefix(title: string): string {
  const normalizedTitle = normalizeText(title);
  const match = normalizedTitle.match(/^([^|:-]{3,30})\s*[|:-]\s*(.+)$/);

  if (!match) {
    return normalizedTitle;
  }

  const [, possiblePrefix, remainder] = match;
  const prefix = normalizeText(possiblePrefix).toUpperCase();
  const knownPrefixes = new Set([
    'ADMINISTRATIVO',
    'ATENCAO',
    'ATENÇÃO',
    'COMUNICADO',
    'COMUNIDADE',
    'CONFERENCIA',
    'CONFERÊNCIA',
    'DIGITALIZACAO',
    'DIGITALIZAÇÃO',
    'GERAL',
    'PRODUCAO',
    'PRODUÇÃO',
    'QUALIDADE',
    'RECONFERENCIA',
    'RECONFERÊNCIA',
    'SISTEMA',
  ]);

  if (!knownPrefixes.has(prefix)) {
    return normalizedTitle;
  }

  return normalizeText(remainder);
}

function firstSentence(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }

  const match = normalized.match(/^(.+?[.!?])(?:\s|$)/);
  return normalizeText(match?.[1] ?? normalized);
}

function buildPushTitle({
  categoria,
  prioridade,
}: Pick<ComunicadoPushPayload, 'categoria' | 'prioridade'>): string {
  const normalizedCategory = normalizeText(categoria).toUpperCase();

  if (normalizedCategory && normalizedCategory !== 'GERAL') {
    const label = categoriaPushLabels[normalizedCategory];
    if (label) {
      return `Recorda | ${label}`;
    }
  }

  if (prioridade === 'ALTA') {
    return PUSH_TITLE_ATENCAO;
  }

  return PUSH_TITLE_DEFAULT;
}

function buildPushBody({
  titulo,
  conteudo,
  resumo,
}: Pick<ComunicadoPushPayload, 'titulo' | 'conteudo' | 'resumo'>): string {
  const candidates = [
    normalizeText(resumo),
    stripLeadingCategoryPrefix(titulo),
    firstSentence(conteudo),
    normalizeText(titulo),
    normalizeText(conteudo),
  ]
    .map(removeBrandMention)
    .filter(Boolean);

  const availableLength = PUSH_BODY_MAX_LENGTH - PUSH_BODY_SUFFIX.length;
  const mainText = candidates[0] ? truncateText(candidates[0], availableLength) : '';

  if (!mainText) {
    return PUSH_BODY_FALLBACK;
  }

  return `${mainText.replace(/[.!?\s]+$/g, '')}.${PUSH_BODY_SUFFIX}`;
}

export function buildComunicadoPushNotification(
  payload: ComunicadoPushPayload
): PushNotificationPayload {
  return {
    title: buildPushTitle(payload),
    body: buildPushBody(payload),
    tag: `comunicado-${payload.comunicadoId}`,
    url: '/comunicados',
    data: {
      comunicadoId: payload.comunicadoId,
      prioridade: payload.prioridade,
    },
  };
}

export function createWebPushService(database: DatabaseConnection): WebPushService {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) {
    console.debug('[WebPush][diagnostic] disabled', {
      hasPublicKey: Boolean(publicKey),
      hasPrivateKey: Boolean(privateKey),
      hasSubject: Boolean(subject),
    });

    return {
      enabled: false,
      sendComunicadoPublicado: async () => undefined,
    };
  }

  console.debug('[WebPush][diagnostic] enabled', {
    hasPublicKey: Boolean(publicKey),
    hasPrivateKey: Boolean(privateKey),
    hasSubject: Boolean(subject),
  });
  webpush.setVapidDetails(subject, publicKey, privateKey);

  return {
    enabled: true,
    sendComunicadoPublicado: async ({
      comunicadoId,
      titulo,
      conteudo,
      prioridade,
      categoria,
      resumo,
      usuarioIds,
    }: ComunicadoPushPayload): Promise<void> => {
      const destinatarios = Array.from(new Set(usuarioIds));
      const notificationPayload = buildComunicadoPushNotification({
        comunicadoId,
        titulo,
        conteudo,
        prioridade,
        categoria,
        resumo,
        usuarioIds: destinatarios,
      });
      console.debug('[WebPush][diagnostic] sendComunicadoPublicado', {
        comunicadoId,
        destinatariosCount: destinatarios.length,
        pushTitle: notificationPayload.title,
        pushBody: notificationPayload.body,
      });

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

      console.debug('[WebPush][diagnostic] found active subscriptions', {
        count: subscriptionsResult.rows.length,
      });

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
              JSON.stringify(notificationPayload)
            );
            console.debug('[WebPush][diagnostic] sendNotification success', {
              subscriptionId: subscription.id,
              endpoint: summarizeEndpoint(subscription.endpoint),
            });
          } catch (error) {
            const statusCode =
              typeof error === 'object' && error && 'statusCode' in error
                ? Number((error as { statusCode?: number }).statusCode)
                : 0;

            console.error('[WebPush][diagnostic] sendNotification failed', {
              subscriptionId: subscription.id,
              statusCode,
              message: error instanceof Error ? error.message : undefined,
            });

            if (statusCode === 404 || statusCode === 410) {
              await database.query(
                `UPDATE push_subscriptions
                 SET ativo = FALSE,
                     atualizado_em = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [subscription.id]
              );
              console.debug('[WebPush][diagnostic] marked subscription inactive', {
                subscriptionId: subscription.id,
              });
            }
          }
        })
      );
    },
  };
}
