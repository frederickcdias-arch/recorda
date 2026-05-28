import { useCallback, useMemo, useState } from 'react';
import {
  getStoredFlag,
  PWA_NOTIFICATIONS_DECISION_KEY,
  PWA_NOTIFICATIONS_DISMISSED_KEY,
  setStoredFlag,
  supportsNotifications,
  supportsServiceWorker,
} from '../lib/pwa';
import { ensurePushSubscription, type PushSubscriptionStatus } from '../services/pushNotifications';

type NotificationPromptState = NotificationPermission | 'unsupported';

type PwaNotificationError = 'unsupported' | 'denied' | 'not-configured' | 'error' | null;

export interface UsePwaNotificationsResult {
  permission: NotificationPromptState;
  supported: boolean;
  visible: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  error: PwaNotificationError;
  activateNotifications: () => Promise<PushSubscriptionStatus>;
  dismiss: () => void;
}

export function usePwaNotifications(): UsePwaNotificationsResult {
  const supported = useMemo(
    () =>
      typeof window !== 'undefined' &&
      supportsNotifications() &&
      supportsServiceWorker() &&
      'PushManager' in window,
    []
  );
  const [dismissed, setDismissed] = useState(() => getStoredFlag(PWA_NOTIFICATIONS_DISMISSED_KEY));
  const [decisionStored, setDecisionStored] = useState(() =>
    getStoredFlag(PWA_NOTIFICATIONS_DECISION_KEY)
  );
  const [permission, setPermission] = useState<NotificationPromptState>(() => {
    if (!supported) {
      return 'unsupported';
    }

    return Notification.permission;
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<PwaNotificationError>(null);

  const dismiss = useCallback((): void => {
    setDismissed(true);
    setStoredFlag(PWA_NOTIFICATIONS_DISMISSED_KEY);
  }, []);

  const activateNotifications = useCallback(async (): Promise<PushSubscriptionStatus> => {
    if (!supported) {
      setPermission('unsupported');
      setError('unsupported');
      return 'unsupported';
    }

    let nextPermission: NotificationPromptState = Notification.permission;
    if (nextPermission === 'default') {
      nextPermission = await Notification.requestPermission();
      console.debug('[PWA Push][diagnostic]', 'requestPermission result', { nextPermission });
      setPermission(nextPermission);
    }

    if (nextPermission === 'denied') {
      console.debug('[PWA Push][diagnostic]', 'permission denied after request');
      setError('denied');
      setDecisionStored(true);
      setStoredFlag(PWA_NOTIFICATIONS_DECISION_KEY);
      setDismissed(true);
      return 'permission-denied';
    }

    if (nextPermission !== 'granted') {
      console.debug('[PWA Push][diagnostic]', 'permission not granted');
      setError('unsupported');
      return 'unsupported';
    }

    setDecisionStored(true);
    setStoredFlag(PWA_NOTIFICATIONS_DECISION_KEY);
    setDismissed(true);
    setError(null);
    setIsLoading(true);

    try {
      const status = await ensurePushSubscription();
      if (status === 'subscribed') {
        setIsSubscribed(true);
        setError(null);
        return status;
      }

      if (status === 'not-configured') {
        setError('not-configured');
      } else if (status === 'permission-denied') {
        setError('denied');
      } else if (status === 'unsupported') {
        setError('unsupported');
      } else {
        setError('error');
      }

      return status;
    } finally {
      setIsLoading(false);
    }
  }, [supported, setDismissed]);

  return {
    permission,
    supported,
    visible: supported && permission === 'default' && !dismissed && !decisionStored,
    isSubscribed,
    isLoading,
    error,
    activateNotifications,
    dismiss,
  };
}
