import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import {
  usePwaInstallPrompt,
  type UsePwaInstallPromptResult,
} from '../../hooks/usePwaInstallPrompt';
import { useToastHelpers } from '../ui/Toast';

function getInstruction(
  platform: 'android' | 'ios' | 'desktop' | 'unsupported',
  canPromptInstall: boolean
): string {
  if (platform === 'android') {
    return canPromptInstall
      ? 'Adicione o Recorda à tela inicial.'
      : 'Use o menu do navegador para instalar.';
  }

  if (platform === 'ios') {
    return 'No Safari, use Compartilhar e depois Adicionar à Tela de Início.';
  }

  if (platform === 'desktop') {
    return canPromptInstall
      ? 'Instale o app para abrir o sistema mais rápido.'
      : 'Quando o navegador permitir, a opção aparece aqui.';
  }

  return '';
}

export function PwaInstallPrompt({
  state,
}: {
  state?: UsePwaInstallPromptResult;
} = {}): JSX.Element | null {
  const internalState = usePwaInstallPrompt();
  const { acknowledge, canPromptInstall, dismiss, install, platform, visible } =
    state ?? internalState;
  const toast = useToastHelpers();

  if (!visible || platform === 'unsupported') {
    return null;
  }

  const handleInstall = async (): Promise<void> => {
    const accepted = await install();

    if (accepted) {
      toast.success('App Instalado', 'O Recorda foi enviado para instalação no dispositivo.');
      return;
    }

    toast.info('Instalação não concluída', 'Você pode instalar o app mais tarde.');
  };

  return (
    <Card
      variant="default"
      padding="md"
      className="mb-4 overflow-hidden border-[color:color-mix(in_srgb,var(--color-primary-600)_18%,var(--color-border-primary))]"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-[var(--color-primary-50)] p-2 text-[var(--color-primary-700)]">
              <Icon name="download" className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                Instale o app
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {getInstruction(platform, canPromptInstall)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {canPromptInstall ? (
            <Button size="sm" icon="download" onClick={() => void handleInstall()}>
              Instalar
            </Button>
          ) : null}
          {platform === 'ios' ? (
            <Button variant="secondary" size="sm" onClick={acknowledge}>
              Entendi
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Agora não
          </Button>
        </div>
      </div>
    </Card>
  );
}
