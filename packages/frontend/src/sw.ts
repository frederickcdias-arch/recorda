/// <reference lib="WebWorker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly());

registerRoute(
  ({ request, sameOrigin }) => sameOrigin && request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'recorda-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 120,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

self.addEventListener('push', (event) => {
  if (!event.data) {
    console.debug('[SW][diagnostic] push event received without data');
    return;
  }

  const payload = event.data.json() as {
    title?: string;
    body?: string;
    tag?: string;
    url?: string;
    data?: Record<string, unknown>;
  };

  console.debug('[SW][diagnostic] push event payload', {
    title: payload.title,
    body: payload.body,
    tag: payload.tag,
    url: payload.url,
  });

  event.waitUntil(
    self.registration
      .showNotification(payload.title ?? 'Recorda', {
        body: payload.body ?? 'Voce recebeu um novo comunicado interno.',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: payload.tag ?? 'recorda-comunicados',
        data: {
          url: payload.url ?? '/comunicados',
          ...(payload.data ?? {}),
        },
      })
      .then(() => {
        console.debug('[SW][diagnostic] notification shown', { tag: payload.tag });
      })
      .catch((error) => {
        console.error('[SW][diagnostic] failed to show notification', { error });
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = String(event.notification.data?.url ?? '/comunicados');
  console.debug('[SW][diagnostic] notification click', { url });

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          const windowClient = client as WindowClient;
          if ('navigate' in windowClient) {
            void windowClient.navigate(url);
          }
          return windowClient.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }

      return undefined;
    })
  );
});

export {};
