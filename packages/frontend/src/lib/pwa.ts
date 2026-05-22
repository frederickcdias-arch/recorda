export type PwaPlatform = 'android' | 'ios' | 'desktop' | 'unsupported';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWA_INSTALL_DISMISSED_KEY = 'recorda_pwa_install_dismissed_v1';
export const PWA_INSTALL_ACK_KEY = 'recorda_pwa_install_ack_v1';
export const PWA_NOTIFICATIONS_DISMISSED_KEY = 'recorda_pwa_notifications_dismissed_v1';
export const PWA_NOTIFICATIONS_DECISION_KEY = 'recorda_pwa_notifications_decision_v1';

function getUserAgent(): string {
  if (typeof navigator === 'undefined') {
    return '';
  }

  return navigator.userAgent.toLowerCase();
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = 'standalone' in window.navigator && window.navigator.standalone === true;

  return displayModeStandalone || iosStandalone;
}

export function detectPwaPlatform(): PwaPlatform {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'unsupported';
  }

  const ua = getUserAgent();
  const isAndroid = /android/.test(ua);
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|chrome|chromium/.test(ua);
  const isChromeLike = /chrome|chromium/.test(ua) && !/edg|opr|samsungbrowser/.test(ua);
  const isDesktop = !isAndroid && !isIOS;

  if (isAndroid && isChromeLike) {
    return 'android';
  }

  if (isIOS && isSafari) {
    return 'ios';
  }

  if (isDesktop) {
    return 'desktop';
  }

  return 'unsupported';
}

export function getStoredFlag(key: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(key) === '1';
}

export function setStoredFlag(key: string, value = true): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (value) {
    window.localStorage.setItem(key, '1');
    return;
  }

  window.localStorage.removeItem(key);
}

export function supportsNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function supportsServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}
