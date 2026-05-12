import { useCallback, useRef, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToastHelpers } from '../../components/ui/Toast';
import { Icon } from '../../components/ui/Icon';
import { api } from '../../services/api';
import { buildApiUrl } from '../../services/api';
import { getToken } from '../../services/tokenStorage';
import { formatDateBR } from '../../utils/date';

interface CapturaMapa {
  id: string;
  nome_arquivo: string;
  tamanho_bytes: number;
  criado_em: string;
  expira_em: string;
}

interface CapturasResponse {
  capturas: CapturaMapa[];
}

interface ProcessarResponse {
  id: string;
  nomeArquivo: string;
  tamanhoBytes: number;
  criadoEm: string;
  expiraEm: string;
  imagemProcessada: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CapturaMapaPage() {
  const toast = useToastHelpers();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [processando, setProcessando] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [capturasRecentes, setCapturasRecentes] = useState<CapturaMapa[] | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [originalSrc, setOriginalSrc] = useState<string | null>(null);
  const [ultimaCaptura, setUltimaCaptura] = useState<ProcessarResponse | null>(null);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [listaExpandida, setListaExpandida] = useState(false);

  // ── Leitura de arquivo / captura de câmera ─────────────────────────────────
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        toast.error('Selecione um arquivo de imagem válido (JPG, PNG, etc.).');
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setOriginalSrc(dataUrl);
        setPreviewSrc(null);
        setUltimaCaptura(null);
      };
      reader.readAsDataURL(file);

      // Reseta o input para permitir selecionar o mesmo arquivo novamente
      e.target.value = '';
    },
    [toast]
  );

  // ── Processar imagem no servidor ───────────────────────────────────────────
  const handleProcessar = useCallback(async () => {
    if (!originalSrc) return;
    setProcessando(true);
    try {
      const result = await api.post<ProcessarResponse>('/colaborador/capturas-mapa', {
        imagemBase64: originalSrc,
      });

      setPreviewSrc(result.imagemProcessada);
      setUltimaCaptura(result);
      toast.success('Imagem processada e salva com sucesso!');
    } catch {
      toast.error('Erro ao processar imagem. Tente novamente.');
    } finally {
      setProcessando(false);
    }
  }, [originalSrc, toast]);

  // ── Download via URL do endpoint ───────────────────────────────────────────
  const handleDownload = useCallback(
    async (id: string, nomeArquivo: string) => {
      setBaixandoId(id);
      try {
        const token = getToken();
        const url = buildApiUrl(`/colaborador/capturas-mapa/${id}/download`);
        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error('Falha no download');
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = nomeArquivo;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      } catch {
        toast.error('Erro ao baixar imagem. Tente novamente.');
      } finally {
        setBaixandoId(null);
      }
    },
    [toast]
  );

  // ── Download inline (da imagem processada em memória) ─────────────────────
  const handleDownloadInline = useCallback(() => {
    if (!previewSrc || !ultimaCaptura) return;
    const link = document.createElement('a');
    link.href = previewSrc;
    link.download = ultimaCaptura.nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [previewSrc, ultimaCaptura]);

  // ── Carregar capturas recentes ─────────────────────────────────────────────
  const handleCarregarCapturas = useCallback(async () => {
    setCarregandoLista(true);
    try {
      const result = await api.get<CapturasResponse>('/colaborador/capturas-mapa');
      setCapturasRecentes(result.capturas);
      setListaExpandida(true);
    } catch {
      toast.error('Erro ao carregar capturas recentes.');
    } finally {
      setCarregandoLista(false);
    }
  }, [toast]);

  // ── Excluir captura ────────────────────────────────────────────────────────
  const handleExcluir = useCallback(
    async (id: string) => {
      setExcluindoId(id);
      try {
        await api.delete(`/colaborador/capturas-mapa/${id}`);
        setCapturasRecentes((prev) => prev?.filter((c) => c.id !== id) ?? null);
        if (ultimaCaptura?.id === id) {
          setUltimaCaptura(null);
          setPreviewSrc(null);
        }
        toast.success('Captura excluída.');
      } catch {
        toast.error('Erro ao excluir captura.');
      } finally {
        setExcluindoId(null);
      }
    },
    [ultimaCaptura, toast]
  );

  // ── Reset para nova captura ────────────────────────────────────────────────
  const handleNovaCaptura = useCallback(() => {
    setOriginalSrc(null);
    setPreviewSrc(null);
    setUltimaCaptura(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── Renderização ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="Captura de Mapas"
        subtitle="Fotografe um mapa, processe a imagem e baixe o resultado em alta qualidade."
      />

      {/* Banner de aviso sobre retenção */}
      <div className="flex items-start gap-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
        <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 flex-none text-warning-600" />
        <span>
          <strong>Atenção:</strong> As imagens são armazenadas por <strong>30 dias</strong> e
          excluídas automaticamente após esse prazo. Faça o download antes do vencimento.
        </span>
      </div>

      {/* Área de captura / preview */}
      <Card>
        <div className="p-6">
          {/* Sem imagem selecionada */}
          {!originalSrc && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-40 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
                <Icon name="camera" className="h-10 w-10 opacity-50" />
                <p className="text-sm">Selecione ou fotografe um mapa para começar</p>
              </div>

              <div className="flex flex-col items-center gap-2 sm:flex-row">
                {/* Câmera (mobile) */}
                <Button
                  variant="primary"
                  size="md"
                  icon="camera"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.setAttribute('capture', 'environment');
                      fileInputRef.current.click();
                    }
                  }}
                >
                  Usar Câmera
                </Button>

                {/* Galeria / picker (desktop/mobile) */}
                <Button
                  variant="secondary"
                  size="md"
                  icon="image"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.removeAttribute('capture');
                      fileInputRef.current.click();
                    }
                  }}
                >
                  Escolher Arquivo
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* Imagem selecionada, aguardando processamento */}
          {originalSrc && !previewSrc && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Prévia da imagem original:
              </p>
              <img
                src={originalSrc}
                alt="Prévia original"
                className="max-h-96 w-full rounded-lg object-contain shadow"
              />
              <div className="flex gap-3">
                <Button variant="secondary" size="sm" icon="x" onClick={handleNovaCaptura}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon="zap"
                  loading={processando}
                  onClick={handleProcessar}
                >
                  {processando ? 'Processando…' : 'Processar Imagem'}
                </Button>
              </div>
            </div>
          )}

          {/* Imagem processada */}
          {previewSrc && ultimaCaptura && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex w-full items-center justify-between">
                <p className="text-sm font-semibold text-success-700 dark:text-success-400">
                  ✓ Imagem processada e salva
                </p>
                <span className="text-xs text-neutral-500">
                  Expira em {formatDateBR(ultimaCaptura.expiraEm)} ·{' '}
                  {formatBytes(ultimaCaptura.tamanhoBytes)}
                </span>
              </div>
              <img
                src={previewSrc}
                alt="Imagem processada"
                className="max-h-96 w-full rounded-lg object-contain shadow"
              />
              <div className="flex gap-3">
                <Button variant="secondary" size="sm" icon="plus" onClick={handleNovaCaptura}>
                  Nova Captura
                </Button>
                <Button variant="primary" size="sm" icon="download" onClick={handleDownloadInline}>
                  Baixar Imagem
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Capturas recentes */}
      <Card>
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
              Capturas Recentes
            </h3>
            <Button
              variant="secondary"
              size="sm"
              icon="refresh-cw"
              loading={carregandoLista}
              onClick={handleCarregarCapturas}
            >
              {listaExpandida ? 'Atualizar' : 'Carregar'}
            </Button>
          </div>

          {!listaExpandida && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Clique em &ldquo;Carregar&rdquo; para ver as imagens salvas nos últimos 30 dias.
            </p>
          )}

          {listaExpandida && capturasRecentes !== null && capturasRecentes.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-neutral-500 dark:text-neutral-400">
              <Icon name="image" className="h-8 w-8 opacity-40" />
              <p className="font-medium">Nenhuma captura encontrada</p>
              <p>Você não possui imagens salvas no momento.</p>
            </div>
          )}

          {listaExpandida && capturasRecentes && capturasRecentes.length > 0 && (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {capturasRecentes.map((c) => {
                const expirada = new Date(c.expira_em) < new Date();
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">
                        {c.nome_arquivo}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {formatDateBR(c.criado_em)} · {formatBytes(c.tamanho_bytes)} ·{' '}
                        {expirada ? (
                          <span className="text-error-600 dark:text-error-400">Expirada</span>
                        ) : (
                          <span>
                            Expira em{' '}
                            <span className="font-medium">{formatDateBR(c.expira_em)}</span>
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-none gap-2">
                      {!expirada && (
                        <Button
                          variant="secondary"
                          size="xs"
                          icon="download"
                          loading={baixandoId === c.id}
                          onClick={() => handleDownload(c.id, c.nome_arquivo)}
                          aria-label="Baixar"
                        />
                      )}
                      <Button
                        variant="danger"
                        size="xs"
                        icon="trash-2"
                        loading={excluindoId === c.id}
                        onClick={() => handleExcluir(c.id)}
                        aria-label="Excluir"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
