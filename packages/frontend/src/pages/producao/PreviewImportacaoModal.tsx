import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { formatDateBR } from '../../utils/date';

interface PreviewImportacao {
  totalRegistros: number;
  registrosValidos: number;
  duplicadasPlanilha: number[];
  duplicadasBanco: number[];
  linhasInvalidas: { linha: number; erro: string }[];
  amostraDatas: Array<{
    linha: number;
    dataOriginal: string;
    dataNormalizada: string | null;
    status: 'valido' | 'invalido';
    erro?: string;
  }>;
  impacto: {
    inseridosPrevistos: number;
    atualizadosPrevistos: number;
    ignoradosPrevistos: number;
    invalidos: number;
  };
}

interface PreviewImportacaoModalProps {
  preview: PreviewImportacao;
  processando: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function SummaryBadge({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'warning' | 'error';
}): JSX.Element {
  const toneClass =
    tone === 'success'
      ? 'bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-300'
      : tone === 'warning'
        ? 'bg-warning-50 text-warning-700 dark:bg-warning-950 dark:text-warning-300'
        : tone === 'error'
          ? 'bg-error-50 text-error-700 dark:bg-error-950 dark:text-error-300'
          : 'bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${toneClass}`}>
      {label}: {value}
    </span>
  );
}

export function PreviewImportacaoModal({
  preview,
  processando,
  onConfirm,
  onClose,
}: PreviewImportacaoModalProps): JSX.Element {
  return (
    <Modal
      open
      onClose={onClose}
      title="Pré-visualização da importação"
      subtitle="Confira os impactos antes de confirmar."
      size="lg"
      scrollable
      footer={
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          {preview.registrosValidos > 0 && (
            <Button variant="primary" size="sm" onClick={onConfirm} loading={processando}>
              Confirmar importação ({preview.registrosValidos})
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            <span className="font-medium text-[var(--color-text-primary)]">
              {preview.totalRegistros}
            </span>{' '}
            registros na planilha.
            <span className="font-medium text-[var(--color-text-primary)]">
              {' '}
              {preview.registrosValidos}
            </span>{' '}
            válidos para importar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <SummaryBadge
              label="Inserções"
              value={preview.impacto.inseridosPrevistos}
              tone="success"
            />
            <SummaryBadge label="Atualizações" value={preview.impacto.atualizadosPrevistos} />
            <SummaryBadge
              label="Ignorados"
              value={preview.impacto.ignoradosPrevistos}
              tone="warning"
            />
            <SummaryBadge label="Inválidos" value={preview.impacto.invalidos} tone="error" />
          </div>
        </div>

        {preview.duplicadasPlanilha.length > 0 && (
          <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              Duplicadas na planilha
            </p>
            <p className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-[var(--color-bg-primary)] p-3 font-mono text-xs text-[var(--color-text-secondary)]">
              Linhas: {preview.duplicadasPlanilha.join(', ')}
            </p>
          </div>
        )}

        {preview.duplicadasBanco.length > 0 && (
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-800 dark:bg-warning-950">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              Já existentes no sistema
            </p>
            <p className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-[var(--color-bg-primary)] p-3 font-mono text-xs text-[var(--color-text-secondary)]">
              Linhas: {preview.duplicadasBanco.join(', ')}
            </p>
          </div>
        )}

        {preview.linhasInvalidas.length > 0 && (
          <div className="rounded-xl border border-error-200 bg-error-50 p-4 dark:border-error-800 dark:bg-error-950">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Linhas inválidas</p>
            <div className="mt-2 max-h-32 space-y-2 overflow-y-auto rounded-lg bg-[var(--color-bg-primary)] p-3 text-xs text-[var(--color-text-secondary)]">
              {preview.linhasInvalidas.slice(0, 10).map((item) => (
                <p key={`${item.linha}-${item.erro}`}>
                  Linha {item.linha}: {item.erro}
                </p>
              ))}
            </div>
          </div>
        )}

        {preview.amostraDatas.length > 0 && (
          <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              Amostra das datas
            </p>
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg bg-[var(--color-bg-primary)] p-3 text-xs">
              {preview.amostraDatas.slice(0, 8).map((item) => (
                <div
                  key={`${item.status}-${item.linha}`}
                  className="border-b border-[var(--color-border-primary)] pb-2 last:border-0 last:pb-0"
                >
                  <p className="font-mono text-[var(--color-text-secondary)]">Linha {item.linha}</p>
                  <p className="mt-1 text-[var(--color-text-secondary)]">
                    Planilha: <strong>{item.dataOriginal || '-'}</strong>
                  </p>
                  <p
                    className={
                      item.status === 'valido'
                        ? 'mt-1 text-success-700 dark:text-success-300'
                        : 'mt-1 text-error-700 dark:text-error-300'
                    }
                  >
                    Sistema:{' '}
                    <strong>
                      {item.dataNormalizada ? formatDateBR(item.dataNormalizada) : '-'}
                    </strong>
                    {item.erro ? ` | ${item.erro}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
