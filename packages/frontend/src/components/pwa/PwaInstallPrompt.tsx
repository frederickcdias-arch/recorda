import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt';
import { useToastHelpers } from '../ui/Toast';

function getInstruction(
  platform: 'android' | 'ios' | 'desktop' | 'unsupported',
  canPromptInstall: boolean
): string {
  if (platform === 'android') {
    return canPromptInstall
      ? 'No Android, toque em Instalar app para adicionar o Recorda a tela inicial.'
      : 'No Android, use o menu do navegador e escolha Instalar app.';
  }

  if (platform === 'ios') {
    return 'No iPhone ou iPad, abra no Safari, toque em Compartilhar e escolha Adicionar a Tela de Inicio.';
  }

  if (platform === 'desktop') {
    return canPromptInstall
      ? 'Instale o Recorda para abrir mais rapido e usar o sistema como aplicativo.'
      : 'Quando o navegador permitir, a opcao de instalar o app aparecera aqui.';
  }

  return '';
}

export function PwaInstallPrompt(): JSX.Element | null {
  const { acknowledge, canPromptInstall, dismiss, install, platform, visible } =
    usePwaInstallPrompt();
  const toast = useToastHelpers();

  if (!visible || platform === 'unsupported') {
    return null;
  }

  const handleInstall = async (): Promise<void> => {
    const accepted = await install();

    if (accepted) {
      toast.success('App instalado', 'O Recorda foi enviado para instalacao no dispositivo.');
      return;
    }

    toast.info('Instalacao nao concluida', 'Voce pode instalar o app mais tarde.');
  };

  return (
    <Card
      variant="default"
      padding="md"
      className="mb-4 overflow-hidden border-[color:color-mix(in_srgb,var(--color-primary-600)_18%,var(--color-border-primary))]"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-2xl bg-[var(--color-primary-50)] p-2 text-[var(--color-primary-700)]">
              <Icon name="download" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                Instale o Recorda no celular
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Acesse o sistema mais rapido pela tela inicial.
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">
                {getInstruction(platform, canPromptInstall)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {canPromptInstall ? (
            <Button size="sm" icon="download" onClick={() => void handleInstall()}>
              Instalar app
            </Button>
          ) : null}
          {platform === 'ios' ? (
            <Button variant="secondary" size="sm" onClick={acknowledge}>
              Entendi
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Nao mostrar agora
          </Button>
        </div>
      </div>
    </Card>
  );
}
