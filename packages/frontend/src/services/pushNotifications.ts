import { api } from './api';
import type { PushSubscriptionResponse, RegistrarPushSubscriptionDTO } from '@recorda/shared';

export type PushSubscriptionStatus =
  | 'unsupported'
  | 'permission-denied'
  | 'not-configured'
  | 'subscribed'
  | 'error';

const PUSH_DIAGNOSTIC_PREFIX = '[PWA Push][diagnostic]';

function supportsPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function summarizeEndpoint(endpoint: string): string {
  if (endpoint.length <= 80) {
    return endpoint;
  }

  return `${endpoint.slice(0, 40)}...${endpoint.slice(-40)} (len=${endpoint.length})`;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) {
    return '';
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let i = 0; i < bytes.byteLength; i += 1) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }

  return btoa(binary);
}

function buildSubscriptionDto(subscription: PushSubscription): RegistrarPushSubscriptionDTO {
  const p256dh = arrayBufferToBase64(subscription.getKey('p256dh'));
  const auth = arrayBufferToBase64(subscription.getKey('auth'));

  if (!p256dh || !auth) {
    throw new Error('Push subscription keys are unavailable');
  }

  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: {
      p256dh,
      auth,
    },
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    deviceLabel: typeof navigator !== 'undefined' ? navigator.platform : undefined,
  };
}

export async function ensurePushSubscription(): Promise<PushSubscriptionStatus> {
  const supported = supportsPush();
  console.debug(PUSH_DIAGNOSTIC_PREFIX, 'start', {
    supported,
    permission: Notification.permission,
    hasVapid: Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim()),
  });

  if (!supported) {
    console.debug(PUSH_DIAGNOSTIC_PREFIX, 'unsupported environment');
    return 'unsupported';
  }

  if (Notification.permission === 'denied') {
    console.debug(PUSH_DIAGNOSTIC_PREFIX, 'permission denied');
    return 'permission-denied';
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
  if (!vapidPublicKey) {
    console.debug(PUSH_DIAGNOSTIC_PREFIX, 'vapid not configured');
    return 'not-configured';
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.ready;
    console.debug(PUSH_DIAGNOSTIC_PREFIX, 'service worker ready', {
      scope: registration.scope,
      hasPushManager: Boolean(registration.pushManager),
    });
  } catch (error) {
    console.error(PUSH_DIAGNOSTIC_PREFIX, 'service worker ready failed', { error });
    return 'error';
  }

  if (!registration.pushManager) {
    console.debug(PUSH_DIAGNOSTIC_PREFIX, 'pushManager unavailable');
    return 'unsupported';
  }

  try {
    let subscription = await registration.pushManager.getSubscription();
    console.debug(PUSH_DIAGNOSTIC_PREFIX, 'getSubscription result', {
      hasSubscription: Boolean(subscription),
    });

    if (!subscription) {
      if (Notification.permission !== 'granted') {
        console.debug(PUSH_DIAGNOSTIC_PREFIX, 'permission not granted before subscribe');
        return 'permission-denied';
      }

      console.debug(PUSH_DIAGNOSTIC_PREFIX, 'subscribing to push');
      const applicationServerKey =
        urlBase64ToUint8Array(vapidPublicKey) as PushSubscriptionOptionsInit['applicationServerKey'];
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      console.debug(PUSH_DIAGNOSTIC_PREFIX, 'subscription created', {
        endpoint: summarizeEndpoint(subscription.endpoint),
        p256dhLength: subscription.getKey('p256dh')?.byteLength ?? 0,
        authLength: subscription.getKey('auth')?.byteLength ?? 0,
      });
    } else {
      console.debug(PUSH_DIAGNOSTIC_PREFIX, 'existing subscription found', {
        endpoint: summarizeEndpoint(subscription.endpoint),
      });
    }

    const body = buildSubscriptionDto(subscription);
    console.debug(PUSH_DIAGNOSTIC_PREFIX, 'sending subscription to backend', {
      endpoint: summarizeEndpoint(body.endpoint),
      p256dhLength: body.keys.p256dh.length,
      authLength: body.keys.auth.length,
    });

    const response = await api.post<PushSubscriptionResponse>('/push/subscriptions', body);
    console.debug(PUSH_DIAGNOSTIC_PREFIX, 'backend subscription response', { response });

    return 'subscribed';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      console.debug(PUSH_DIAGNOSTIC_PREFIX, 'subscribe DOMException NotAllowedError');
      return 'permission-denied';
    }

    console.error(PUSH_DIAGNOSTIC_PREFIX, 'subscription flow failed', { error });
    return 'error';
  }
}

export async function deactivateCurrentPushSubscription(): Promise<void> {
  if (!supportsPush()) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }
  } catch {
    // Ignore failures when deactivating locally.
  }
}
