import { api } from './api';
import type { PushSubscriptionResponse, RegistrarPushSubscriptionDTO } from '@recorda/shared';

export type PushSubscriptionStatus =
  | 'unsupported'
  | 'permission-denied'
  | 'not-configured'
  | 'subscribed'
  | 'error';

function supportsPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
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
  if (!supportsPush()) {
    return 'unsupported';
  }

  if (Notification.permission === 'denied') {
    return 'permission-denied';
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
  if (!vapidPublicKey) {
    return 'not-configured';
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.ready;
  } catch {
    return 'error';
  }

  if (!registration.pushManager) {
    return 'unsupported';
  }

  try {
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      if (Notification.permission !== 'granted') {
        return 'permission-denied';
      }

      const applicationServerKey =
        urlBase64ToUint8Array(vapidPublicKey) as PushSubscriptionOptionsInit['applicationServerKey'];
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    const body = buildSubscriptionDto(subscription);
    await api.post<PushSubscriptionResponse>('/push/subscriptions', body);

    return 'subscribed';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      return 'permission-denied';
    }

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
