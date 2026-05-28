import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { usePwaUpdate, type UsePwaUpdateResult } from '../../hooks/usePwaUpdate';
import { useToastHelpers } from '../ui/Toast';
import { extractErrorMessage } from '../../utils/errors';

export function PwaUpdatePrompt({
  state,
}: {
  state?: UsePwaUpdateResult;
} = {}): JSX.Element | null {
  const internalState = usePwaUpdate();
  const { applyUpdate, currentVersionLabel, isUpdating, remindLater, visible } =
    state ?? internalState;
  const toast = useToastHelpers();

  if (!visible) {
    return null;
  }

  const handleApplyUpdate = async (): Promise<void> => {
    try {
      await applyUpdate();
    } catch (error) {
      toast.error(
        'Não foi possível atualizar agora',
        extractErrorMessage(error, 'Tente novamente em alguns instantes.')
      );
    }
  };

  return (
    <Card
      variant="default"
      padding="md"
      className="mb-4 overflow-hidden border-[color:color-mix(in_srgb,var(--color-warning-600)_18%,var(--color-border-primary))]"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-[var(--color-warning-50)] p-2 text-[var(--color-warning-700)]">
              <Icon name="refresh-cw" className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                Nova versão disponível
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Atualize quando puder. Versão atual: {currentVersionLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button
            size="sm"
            icon="refresh-cw"
            loading={isUpdating}
            onClick={() => void handleApplyUpdate()}
          >
            Atualizar
          </Button>
          <Button variant="ghost" size="sm" onClick={remindLater} disabled={isUpdating}>
            Depois
          </Button>
        </div>
      </div>
    </Card>
  );
}
