import { useState, lazy, Suspense } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToastHelpers } from '../../components/ui/Toast';
import { api } from '../../services/api';
import { extractErrorMessage } from '../../utils/errors';

const PdfPreviewModal = lazy(() =>
  import('./PdfPreviewModal').then((module) => ({ default: module.PdfPreviewModal }))
);

export function EtiquetasLocalizacaoPage(): JSX.Element {
  const toast = useToastHelpers();

  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [pdfInputKey, setPdfInputKey] = useState(0);
  const [processando, setProcessando] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);

  const handleFecharPreview = (): void => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFilename(null);
  };

  const handleDownloadPreview = (): void => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = previewFilename ?? 'etiquetas-4-por-folha.pdf';
    link.click();
  };

  const handleCompactar = async (): Promise<void> => {
    if (pdfFiles.length === 0) {
      toast.error('Selecione um ou mais PDFs de etiquetas para processar.');
      return;
    }

    try {
      setProcessando(true);
      const formData = new FormData();
      pdfFiles.forEach((file) => formData.append('arquivo', file));

      const response = await api.fetchWithAuth('/operacional/etiquetas/compactar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorData?.error ?? 'Erro ao processar PDF de etiquetas.');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const baseName = pdfFiles[0]!.name.toLowerCase().endsWith('.pdf')
        ? pdfFiles[0]!.name.slice(0, -4)
        : pdfFiles[0]!.name;
      const filename = `${baseName || 'etiquetas'}-4-por-folha.pdf`;

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(downloadUrl);
      setPreviewFilename(filename);
      setPdfFiles([]);
      setPdfInputKey((k) => k + 1);
      toast.success('PDF processado. Confira a visualização antes de imprimir.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao processar PDF de etiquetas'));
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Etiquetas de Localização"
        subtitle="Agrupa PDFs de etiquetas em 4 por folha A4."
      />

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Compactar etiquetas
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Selecione um ou mais PDFs de etiquetas. O resultado será um único PDF com 4
              etiquetas por folha, prontas para impressão e recorte.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label
                htmlFor="etiquetaPdfFiles"
                className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
              >
                PDFs de etiquetas
              </label>
              <input
                id="etiquetaPdfFiles"
                key={pdfInputKey}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="block w-full text-sm text-[var(--color-text-secondary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-bg-secondary)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--color-text-secondary)] hover:file:bg-[var(--color-border-primary)]"
                onChange={(e) => setPdfFiles(Array.from(e.target.files ?? []))}
              />
              {pdfFiles.length > 0 ? (
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  {pdfFiles.length} arquivo(s) selecionado(s).
                </p>
              ) : null}
            </div>
            <Button
              fullWidth
              className="sm:w-auto"
              onClick={() => void handleCompactar()}
              loading={processando}
              disabled={pdfFiles.length === 0 || processando}
            >
              Gerar PDF 4 por folha
            </Button>
          </div>
        </div>
      </Card>

      <Suspense fallback={null}>
        <PdfPreviewModal
          open={!!previewUrl}
          title="Pré-visualização das Etiquetas"
          iframeId="etiquetas-localizacao-preview-iframe"
          src={previewUrl}
          onDownload={handleDownloadPreview}
          onClose={handleFecharPreview}
        />
      </Suspense>
    </div>
  );
}
