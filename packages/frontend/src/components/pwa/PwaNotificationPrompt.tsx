import {
  usePwaNotifications,
  type UsePwaNotificationsResult,
} from '../../hooks/usePwaNotifications';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { useToastHelpers } from '../ui/Toast';

export function PwaNotificationPrompt({
  state,
}: {
  state?: UsePwaNotificationsResult;
} = {}): JSX.Element | null {
  const internalState = usePwaNotifications();
  const { dismiss, visible, isLoading, activateNotifications } = state ?? internalState;
  const toast = useToastHelpers();

  if (!visible) {
    return null;
  }

  const handleActivateNotifications = async (): Promise<void> => {
    const status = await activateNotifications();

    if (status === 'subscribed') {
      toast.success('Notificações ativadas', 'O navegador já pode exibir avisos do Recorda.');
      return;
    }

    if (status === 'not-configured') {
      toast.warning(
        'Push não configurado no ambiente',
        'Defina VITE_VAPID_PUBLIC_KEY no frontend para habilitar as notificações push.'
      );
      return;
    }

    if (status === 'permission-denied') {
      toast.warning(
        'As notificações foram bloqueadas no navegador.',
        'Reative a permissão nas configurações do navegador para receber avisos.'
      );
      return;
    }

    if (status === 'unsupported') {
      toast.warning(
        'Notificações indisponíveis neste ambiente.',
        'Seu navegador ou dispositivo não oferece suporte a push notifications.'
      );
      return;
    }

    toast.error('Erro ao ativar notificações', 'Tente novamente mais tarde.');
  };

  return (
    <Card
      variant="default"
      padding="md"
      className="mb-4 overflow-hidden border-[color:color-mix(in_srgb,var(--color-success-600)_14%,var(--color-border-primary))]"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-[var(--color-success-50)] p-2 text-[var(--color-success-700)]">
              <Icon name="mail" className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                Ative as notificações
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Receba avisos importantes sem abrir o sistema.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:flex-none md:justify-end">
          <Button
            size="sm"
            icon="mail"
            loading={isLoading}
            onClick={() => void handleActivateNotifications()}
          >
            Ativar
          </Button>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Agora não
          </Button>
        </div>
      </div>
    </Card>
  );
}
