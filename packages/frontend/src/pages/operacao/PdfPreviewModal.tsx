import { Button } from '../../components/ui/Button';

interface PdfPreviewModalProps {
  open: boolean;
  title: string;
  iframeId: string;
  src: string | null;
  onDownload?: () => void | Promise<void>;
  downloadLabel?: string;
  onClose: () => void;
}

export function PdfPreviewModal({
  open,
  title,
  iframeId,
  src,
  onDownload,
  downloadLabel = 'Baixar PDF',
  onClose,
}: PdfPreviewModalProps): JSX.Element | null {
  if (!open || !src) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay-backdrop)] p-4">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] px-6 py-4 shrink-0">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
                if (iframe?.contentWindow) iframe.contentWindow.print();
              }}
            >
              Imprimir
            </Button>
            {onDownload ? (
              <Button size="sm" onClick={() => void onDownload()}>
                {downloadLabel}
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <iframe id={iframeId} src={src} className="h-full w-full border-0" title={title} />
        </div>
      </div>
    </div>
  );
}
