import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { APP_VERSION, APP_VERSION_LABEL } from '../lib/app-version';

const PWA_UPDATE_SNOOZE_KEY = 'recorda_pwa_update_snoozed_until_v1';
const PWA_UPDATE_SNOOZE_MS = 2 * 60 * 60 * 1000;
const PWA_UPDATE_CHECK_INTERVAL_MS = 3 * 60 * 1000;

type Listener = () => void;

interface PwaUpdateStoreState {
  updateAvailable: boolean;
  isUpdating: boolean;
  snoozedUntil: number | null;
}

export interface UsePwaUpdateResult {
  visible: boolean;
  isUpdating: boolean;
  currentVersion: string;
  currentVersionLabel: string;
  applyUpdate: () => Promise<void>;
  remindLater: () => void;
}

const listeners = new Set<Listener>();

let initialized = false;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
let updateCheckIntervalId: number | null = null;

function readSnoozedUntil(): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(PWA_UPDATE_SNOOZE_KEY);
  if (!rawValue) {
    return null;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function writeSnoozedUntil(value: number | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (value === null) {
    window.sessionStorage.removeItem(PWA_UPDATE_SNOOZE_KEY);
    return;
  }

  window.sessionStorage.setItem(PWA_UPDATE_SNOOZE_KEY, String(value));
}

let storeState: PwaUpdateStoreState = {
  updateAvailable: false,
  isUpdating: false,
  snoozedUntil: readSnoozedUntil(),
};

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

function setStoreState(nextState: Partial<PwaUpdateStoreState>): void {
  storeState = { ...storeState, ...nextState };
  emitChange();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PwaUpdateStoreState {
  return storeState;
}

function isSnoozed(snoozedUntil: number | null): boolean {
  return snoozedUntil !== null && Date.now() < snoozedUntil;
}

function setupRegistrationUpdatePolling(registration: ServiceWorkerRegistration): void {
  const requestUpdateCheck = (): void => {
    void registration.update().catch(() => undefined);
  };

  if (registration.waiting) {
    setStoreState({ updateAvailable: true, snoozedUntil: readSnoozedUntil() });
  }

  window.setTimeout(requestUpdateCheck, 15_000);

  if (updateCheckIntervalId === null) {
    updateCheckIntervalId = window.setInterval(requestUpdateCheck, PWA_UPDATE_CHECK_INTERVAL_MS);
  }

  window.addEventListener('focus', requestUpdateCheck);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      requestUpdateCheck();
    }
  });
}

export function setupPwaUpdateRegistration(): void {
  if (initialized || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  initialized = true;

  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      setStoreState({
        updateAvailable: true,
        isUpdating: false,
        snoozedUntil: readSnoozedUntil(),
      });
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) {
        return;
      }

      setupRegistrationUpdatePolling(registration);
    },
  });
}

export function usePwaUpdate(): UsePwaUpdateResult {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const visible = state.updateAvailable && !isSnoozed(state.snoozedUntil);

  const applyUpdate = async (): Promise<void> => {
    if (!updateServiceWorker) {
      return;
    }

    writeSnoozedUntil(null);
    setStoreState({
      isUpdating: true,
      updateAvailable: true,
      snoozedUntil: null,
    });

    try {
      await updateServiceWorker(true);
    } catch (error) {
      setStoreState({ isUpdating: false });
      throw error;
    }
  };

  const remindLater = (): void => {
    const snoozedUntil = Date.now() + PWA_UPDATE_SNOOZE_MS;
    writeSnoozedUntil(snoozedUntil);
    setStoreState({ snoozedUntil });
  };

  return {
    visible,
    isUpdating: state.isUpdating,
    currentVersion: APP_VERSION,
    currentVersionLabel: APP_VERSION_LABEL,
    applyUpdate,
    remindLater,
  };
}
