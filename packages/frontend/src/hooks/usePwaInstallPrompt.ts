import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  detectPwaPlatform,
  getStoredFlag,
  isStandaloneMode,
  PWA_INSTALL_ACK_KEY,
  PWA_INSTALL_DISMISSED_KEY,
  type BeforeInstallPromptEvent,
} from '../lib/pwa';

interface UsePwaInstallPromptResult {
  canPromptInstall: boolean;
  installed: boolean;
  platform: 'android' | 'ios' | 'desktop' | 'unsupported';
  visible: boolean;
  install: () => Promise<boolean>;
  dismiss: () => void;
  acknowledge: () => void;
}

export function usePwaInstallPrompt(): UsePwaInstallPromptResult {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandaloneMode());
  const [dismissed, setDismissed] = useState(() => getStoredFlag(PWA_INSTALL_DISMISSED_KEY));
  const [acknowledged, setAcknowledged] = useState(() => getStoredFlag(PWA_INSTALL_ACK_KEY));
  const platform = useMemo(() => detectPwaPlatform(), []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event): void => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      setDeferredPrompt(promptEvent);
    };

    const handleInstalled = (): void => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return (): void => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }

    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    const accepted = result.outcome === 'accepted';

    if (accepted) {
      setInstalled(true);
    }

    setDeferredPrompt(null);
    return accepted;
  }, [deferredPrompt]);

  const dismiss = useCallback((): void => {
    setDismissed(true);
    window.localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, '1');
  }, []);

  const acknowledge = useCallback((): void => {
    setAcknowledged(true);
    window.localStorage.setItem(PWA_INSTALL_ACK_KEY, '1');
  }, []);

  const canPromptInstall = deferredPrompt !== null;
  const shouldShowByPlatform =
    platform === 'android'
      ? canPromptInstall || !acknowledged
      : platform === 'ios' || canPromptInstall;

  return {
    canPromptInstall,
    installed,
    platform,
    visible: !installed && !dismissed && shouldShowByPlatform,
    install,
    dismiss,
    acknowledge,
  };
}
