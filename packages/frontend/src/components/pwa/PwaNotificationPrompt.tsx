import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { usePwaNotifications } from '../../hooks/usePwaNotifications';
import { useToastHelpers } from '../ui/Toast';

export function PwaNotificationPrompt(): JSX.Element | null {
  const { dismiss, visible, isLoading, activateNotifications } = usePwaNotifications();
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
        'Notificações indisponíveis',
        'O serviço de push ainda não está configurado corretamente.'
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
      className="mb-4 overflow-hidden border-[color:color-mix(in_srgb,var(--color-success-600)_18%,var(--color-border-primary))]"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-2xl bg-[var(--color-success-50)] p-2 text-[var(--color-success-700)]">
              <Icon name="mail" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                Ative as notificações
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Receba avisos e comunicados importantes do Recorda.
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">
                A permissão será solicitada somente após seu clique.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button
            size="sm"
            icon="mail"
            loading={isLoading}
            onClick={() => void handleActivateNotifications()}
          >
            Ativar notificações
          </Button>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Agora não
          </Button>
        </div>
      </div>
    </Card>
  );
}
