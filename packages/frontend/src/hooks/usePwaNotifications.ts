import { useCallback, useMemo, useState } from 'react';
import {
  getStoredFlag,
  PWA_NOTIFICATIONS_DECISION_KEY,
  PWA_NOTIFICATIONS_DISMISSED_KEY,
  setStoredFlag,
  supportsNotifications,
  supportsServiceWorker,
} from '../lib/pwa';

type NotificationPromptState = NotificationPermission | 'unsupported';

interface UsePwaNotificationsResult {
  permission: NotificationPromptState;
  supported: boolean;
  visible: boolean;
  requestPermission: () => Promise<NotificationPromptState>;
  dismiss: () => void;
}

export function usePwaNotifications(): UsePwaNotificationsResult {
  const supported = useMemo(
    () => supportsNotifications() && supportsServiceWorker(),
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

  const dismiss = useCallback((): void => {
    setDismissed(true);
    setStoredFlag(PWA_NOTIFICATIONS_DISMISSED_KEY);
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPromptState> => {
    if (!supported) {
      setPermission('unsupported');
      return 'unsupported';
    }

    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);

    if (nextPermission === 'granted' || nextPermission === 'denied') {
      setDecisionStored(true);
      setStoredFlag(PWA_NOTIFICATIONS_DECISION_KEY);
    }

    if (nextPermission === 'granted' || nextPermission === 'denied') {
      setDismissed(true);
      setStoredFlag(PWA_NOTIFICATIONS_DISMISSED_KEY);
    }

    return nextPermission;
  }, [supported]);

  return {
    permission,
    supported,
    visible: supported && permission === 'default' && !dismissed && !decisionStored,
    requestPermission,
    dismiss,
  };
}
