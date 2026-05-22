import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { usePwaNotifications } from '../../hooks/usePwaNotifications';
import { useToastHelpers } from '../ui/Toast';

export function PwaNotificationPrompt(): JSX.Element | null {
  const { dismiss, permission, requestPermission, visible } = usePwaNotifications();
  const toast = useToastHelpers();

  if (!visible) {
    return null;
  }

  const handleRequestPermission = async (): Promise<void> => {
    const result = await requestPermission();

    if (result === 'granted') {
      toast.success('Notificacoes ativadas', 'O navegador ja pode exibir avisos do Recorda.');
      return;
    }

    if (result === 'denied') {
      toast.warning(
        'Notificacoes bloqueadas',
        'Voce pode reativar essa permissao nas configuracoes do navegador.'
      );
      return;
    }

    if (result === 'default') {
      toast.info('Permissao pendente', 'Voce pode decidir sobre as notificacoes depois.');
    }
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
                Ative as notificacoes
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Receba avisos e comunicados importantes do Recorda.
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">
                A permissao sera solicitada somente apos seu clique.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button size="sm" icon="mail" onClick={() => void handleRequestPermission()}>
            Ativar notificacoes
          </Button>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Agora nao
          </Button>
        </div>
      </div>

      {permission === 'unsupported' ? (
        <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">
          Este navegador nao oferece suporte a notificacoes do app.
        </p>
      ) : null}
    </Card>
  );
}
