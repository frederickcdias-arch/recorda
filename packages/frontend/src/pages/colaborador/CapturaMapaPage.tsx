import { useCallback, useRef, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToastHelpers } from '../../components/ui/Toast';
import { Icon } from '../../components/ui/Icon';
import { api } from '../../services/api';
import { formatDateBR } from '../../utils/date';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CapturaMapa {
  id: string;
  nome_arquivo: string;
  tamanho_bytes: number;
  criado_em: string;
  expira_em: string;
  thumbnail_path?: string | null;
  processamento_status?: string | null;
  processamento_engine?: string | null;
  processamento_confianca?: number | null;
  processamento_fallback?: boolean | null;
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
  arquivoPath: string;
  arquivoOriginalPath: string | null;
  arquivoCorrigidoPath: string | null;
  thumbnailPath: string | null;
  imagemProcessada: string;
  processamento: {
    status: 'concluido' | 'processado_com_fallback' | 'falhou_processamento' | string;
    engine: string | null;
    confidence: number | null;
    fallback: boolean;
    metadata: {
      documentClass?:
        | 'map_document'
        | 'color_document'
        | 'text_document'
        | 'low_confidence_capture';
      decision?:
        | 'frontend_assisted'
        | 'python_detected'
        | 'backend_manual_corners'
        | 'backend_detected_corners'
        | 'safe_fallback'
        | 'manual_review_recommended';
      analysis?: {
        paperLikeRatio: number;
        colorRatio: number;
        edgeDensity: number;
        dynamicRange: number;
        fillFrameLikelihood: number;
      };
      warnings?: string[];
      [key: string]: unknown;
    } | null;
  };
}

type Point = [number, number];
type ItemStatus = 'corrigindo' | 'revisar' | 'aguardando' | 'processando' | 'concluido' | 'erro';

interface QueueItem {
  localId: string;
  originalSrc: string;
  thumbSrc: string;
  correctedSrc: string | null;
  corners: Point[] | null;
  detectedCorners: Point[] | null;
  edgeMidpoints: Point[] | null;
  cornersSource: 'manual' | 'detected' | 'none';
  confidence: 'high' | 'low' | 'none';
  status: ItemStatus;
  result: ProcessarResponse | null;
  erro: string | null;
}

interface ImageSize {
  width: number;
  height: number;
}

type PerspectiveUtils = typeof import('../../utils/perspectiveCorrection');

let perspectiveUtilsPromise: Promise<PerspectiveUtils> | null = null;

function loadPerspectiveUtils(): Promise<PerspectiveUtils> {
  if (!perspectiveUtilsPromise) {
    perspectiveUtilsPromise = import('../../utils/perspectiveCorrection');
  }
  return perspectiveUtilsPromise;
}

// ── Utilitários ───────────────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let _seq = 0;
function newLocalId(): string {
  return `${Date.now()}-${++_seq}`;
}

function pointsEqual(a: Point[] | null, b: Point[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((point, index) => {
    const other = b[index];
    if (!other) return false;
    return Math.abs(point[0] - other[0]) < 1 && Math.abs(point[1] - other[1]) < 1;
  });
}

function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function isLikelyFullSceneCrop(points: Point[], size: ImageSize): boolean {
  const areaRatio = polygonArea(points) / (size.width * size.height);
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));
  const borderX = size.width * 0.03;
  const borderY = size.height * 0.03;
  const huggingFrame =
    minX <= borderX &&
    minY <= borderY &&
    maxX >= size.width - borderX &&
    maxY >= size.height - borderY;
  return areaRatio > 0.9 || huggingFrame;
}

/** Miniatura 200 px JPEG 75% para exibicao na grade. */
async function makeThumbnail(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 200;
      const scale = MAX / Math.max(img.width, img.height);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function getImageSize(dataUrl: string): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function defaultCorners(size: ImageSize): Point[] {
  const portrait = size.height >= size.width;
  const targetHeight = portrait ? size.height * 0.82 : size.height * 0.72;
  const targetWidth = portrait ? targetHeight / Math.SQRT2 : targetHeight * Math.SQRT2;
  const fittedWidth = Math.min(targetWidth, size.width * 0.86);
  const fittedHeight = portrait ? fittedWidth * Math.SQRT2 : fittedWidth / Math.SQRT2;
  const mx = (size.width - fittedWidth) / 2;
  const my = (size.height - fittedHeight) / 2;
  return [
    [mx, my],
    [mx + fittedWidth, my],
    [mx + fittedWidth, my + fittedHeight],
    [mx, my + fittedHeight],
  ];
}

function defaultEdgeMidpoints(corners: Point[]): Point[] {
  const tl = corners[0]!;
  const tr = corners[1]!;
  const br = corners[2]!;
  const bl = corners[3]!;
  return [
    [(tl[0] + tr[0]) / 2, (tl[1] + tr[1]) / 2],
    [(tr[0] + br[0]) / 2, (tr[1] + br[1]) / 2],
    [(bl[0] + br[0]) / 2, (bl[1] + br[1]) / 2],
    [(tl[0] + bl[0]) / 2, (tl[1] + bl[1]) / 2],
  ];
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function toManualCorners(points: Point[] | null): Array<{ x: number; y: number }> | undefined {
  if (!points || points.length !== 4) return undefined;
  return points.map(([x, y]) => ({ x, y }));
}

function getProcessingBadge(result: ProcessarResponse | null): string {
  if (!result) return '';
  if (result.processamento.status === 'falhou_processamento') {
    return 'Não foi possível corrigir automaticamente';
  }
  if (result.processamento.fallback) {
    return 'Correcao parcial';
  }
  return 'Imagem corrigida';
}

function formatConfidence(confidence: number | null): string | null {
  if (confidence === null || Number.isNaN(confidence)) return null;
  return `${Math.round(confidence * 100)}%`;
}

function formatDocumentClass(result: ProcessarResponse | null): string | null {
  const kind = result?.processamento.metadata?.documentClass;
  if (!kind) return null;
  switch (kind) {
    case 'map_document':
      return 'Mapa colorido';
    case 'color_document':
      return 'Documento colorido';
    case 'text_document':
      return 'Documento de texto';
    case 'low_confidence_capture':
      return 'Captura de baixa confianca';
    default:
      return null;
  }
}

function getDecisionHint(result: ProcessarResponse | null): string | null {
  const decision = result?.processamento.metadata?.decision;
  if (!decision) return null;
  switch (decision) {
    case 'frontend_assisted':
      return 'Fallback da imagem assistida';
    case 'backend_manual_corners':
      return 'Warp final com cantos manuais';
    case 'backend_detected_corners':
      return 'Warp final com cantos detectados';
    case 'python_detected':
      return 'Folha detectada automaticamente';
    case 'manual_review_recommended':
      return 'Revisao manual recomendada';
    case 'safe_fallback':
      return 'Fallback seguro aplicado';
    default:
      return null;
  }
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  corrigindo: 'Corrigindo...',
  revisar: 'Revisar bordas',
  aguardando: 'Aguardando',
  processando: 'Processando...',
  concluido: 'Concluido',
  erro: 'Erro',
};

const STATUS_COLOR: Record<ItemStatus, string> = {
  corrigindo: 'text-primary-600 dark:text-primary-400',
  revisar: 'text-warning-700 dark:text-warning-300',
  aguardando: 'text-[var(--color-text-tertiary)]',
  processando: 'text-primary-600 dark:text-primary-400',
  concluido: 'text-success-600 dark:text-success-400',
  erro: 'text-error-600 dark:text-error-400',
};

// ── Componente ────────────────────────────────────────────────────────────────

export function CapturaMapaPage() {
  const toast = useToastHelpers();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);

  const queueRef = useRef<QueueItem[]>([]);
  const [queue, setQueueState] = useState<QueueItem[]>([]);

  const [processandoLote, setProcessandoLote] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [capturasRecentes, setCapturasRecentes] = useState<CapturaMapa[] | null>(null);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [listaExpandida, setListaExpandida] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [editorItemId, setEditorItemId] = useState<string | null>(null);
  const [editorCorners, setEditorCorners] = useState<Point[]>([]);
  const [editorEdgeMidpoints, setEditorEdgeMidpoints] = useState<Point[]>([]);
  const [editorImageSize, setEditorImageSize] = useState<ImageSize | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);

  const setQueue = useCallback((updater: (prev: QueueItem[]) => QueueItem[]) => {
    setQueueState((prev) => {
      const next = updater(prev);
      queueRef.current = next;
      return next;
    });
  }, []);

  function validateFile(file: File): string | null {
    if (!file.type.startsWith('image/')) {
      return 'Apenas arquivos de imagem sao aceitos.';
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return 'Apenas imagens JPEG, PNG ou WEBP sao permitidas.';
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return 'O arquivo excede o limite de 10 MB.';
    }
    return null;
  }

  // ── Adicionar arquivos a fila ─────────────────────────────────────────────

  const addFiles = useCallback(
    (files: FileList) => {
      Array.from(files).forEach((file) => {
        const error = validateFile(file);
        if (error) {
          toast.error(error);
          return;
        }

        const localId = newLocalId();

        const reader = new FileReader();
        reader.onload = async (ev) => {
          const dataUrl = ev.target?.result as string;
          const thumbSrc = await makeThumbnail(dataUrl);

          setQueue((prev) => [
            ...prev,
            {
              localId,
              originalSrc: dataUrl,
              thumbSrc,
              correctedSrc: null,
              corners: null,
              detectedCorners: null,
              edgeMidpoints: null,
              cornersSource: 'none',
              confidence: 'none',
              status: 'corrigindo',
              result: null,
              erro: null,
            },
          ]);

          try {
            const {
              detectPerspective,
              correctPerspective,
              correctPerspectiveWithCorners,
              validateCorrectedDocument,
            } = await loadPerspectiveUtils();
            const detection = await detectPerspective(dataUrl);
            const corrected = detection.corners
              ? await correctPerspectiveWithCorners(dataUrl, detection.corners)
              : await correctPerspective(dataUrl);
            const correctedConfidence =
              detection.confidence === 'high' ? await validateCorrectedDocument(corrected) : 'low';
            setQueue((prev) =>
              prev.map((it) =>
                it.localId === localId
                  ? {
                      ...it,
                      correctedSrc:
                        detection.confidence === 'high' && correctedConfidence === 'high'
                          ? corrected
                          : null,
                      corners: detection.corners,
                      detectedCorners: detection.corners,
                      edgeMidpoints: null,
                      cornersSource:
                        detection.confidence === 'high' && correctedConfidence === 'high'
                          ? 'detected'
                          : detection.corners
                            ? 'detected'
                            : 'none',
                      confidence:
                        detection.confidence === 'high' && correctedConfidence === 'high'
                          ? 'high'
                          : 'low',
                      status:
                        detection.confidence === 'high' && correctedConfidence === 'high'
                          ? 'aguardando'
                          : 'revisar',
                    }
                  : it
              )
            );
          } catch {
            setQueue((prev) =>
              prev.map((it) =>
                it.localId === localId
                  ? {
                      ...it,
                      correctedSrc: null,
                      corners: null,
                      detectedCorners: null,
                      edgeMidpoints: null,
                      cornersSource: 'none',
                      confidence: 'none',
                      status: 'revisar',
                    }
                  : it
              )
            );
          }
        };
        reader.readAsDataURL(file);
      });
    },
    [setQueue]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragActive(false);
      if (event.dataTransfer.files?.length) {
        addFiles(event.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleCameraChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) addFiles(e.target.files);
      e.target.value = '';
    },
    [addFiles]
  );

  const handleBatchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) addFiles(e.target.files);
      e.target.value = '';
    },
    [addFiles]
  );

  const editorAspectClass = editorImageSize
    ? editorImageSize.width >= editorImageSize.height
      ? 'aspect-[4/3]'
      : 'aspect-[3/4]'
    : 'aspect-square';

  const editorPositionStyles = editorImageSize
    ? [
        ...editorCorners.map(
          ([x, y], index) =>
            `.editor-corner-${index}{left:${(x / editorImageSize.width) * 100}%;top:${(y / editorImageSize.height) * 100}%;}`
        ),
        ...editorEdgeMidpoints.map(
          ([x, y], index) =>
            `.editor-edge-${index}{left:${(x / editorImageSize.width) * 100}%;top:${(y / editorImageSize.height) * 100}%;}`
        ),
      ].join('\n')
    : '';

  // ── Acoes sobre itens ─────────────────────────────────────────────────────

  const handleRemover = useCallback(
    (localId: string) => {
      setQueue((prev) => prev.filter((it) => it.localId !== localId));
    },
    [setQueue]
  );

  const handleRetry = useCallback(
    (localId: string) => {
      setQueue((prev) =>
        prev.map((it) =>
          it.localId === localId
            ? { ...it, status: it.correctedSrc ? 'aguardando' : 'revisar', erro: null }
            : it
        )
      );
    },
    [setQueue]
  );

  const handleOpenEditor = useCallback(async (item: QueueItem) => {
    const size = await getImageSize(item.originalSrc);
    const corners =
      item.corners && !isLikelyFullSceneCrop(item.corners, size)
        ? item.corners
        : defaultCorners(size);
    setEditorImageSize(size);
    setEditorCorners(corners);
    setEditorEdgeMidpoints(item.edgeMidpoints ?? defaultEdgeMidpoints(corners));
    setEditorItemId(item.localId);
  }, []);

  const handleCloseEditor = useCallback(() => {
    if (editorSaving) return;
    setEditorItemId(null);
    setEditorCorners([]);
    setEditorEdgeMidpoints([]);
    setEditorImageSize(null);
  }, [editorSaving]);

  const handleSaveEditor = useCallback(async () => {
    const item = queueRef.current.find((it) => it.localId === editorItemId);
    if (!item || editorCorners.length !== 4 || editorEdgeMidpoints.length !== 4 || !editorImageSize)
      return;

    const suggestedCorners = item.corners ?? defaultCorners(editorImageSize);
    if (!item.corners && pointsEqual(editorCorners, suggestedCorners)) {
      toast.error('Posicione as bordas sobre a folha antes de aplicar a correcao.');
      return;
    }
    if (isLikelyFullSceneCrop(editorCorners, editorImageSize)) {
      toast.error('As bordas ainda estao pegando a cena inteira. Ajuste somente a folha.');
      return;
    }

    setEditorSaving(true);
    try {
      const { correctPerspectiveWithEdgePoints, validateCorrectedDocument } =
        await loadPerspectiveUtils();
      const corrected = await correctPerspectiveWithEdgePoints(
        item.originalSrc,
        editorCorners,
        editorEdgeMidpoints
      );
      const correctedConfidence = await validateCorrectedDocument(corrected);
      if (correctedConfidence !== 'high') {
        toast.error(
          'A imagem corrigida ainda manteve contexto externo demais. Ajuste os cantos no limite da folha.'
        );
        return;
      }
      const thumbSrc = await makeThumbnail(corrected);
      setQueue((prev) =>
        prev.map((it) =>
          it.localId === item.localId
            ? {
                ...it,
                thumbSrc,
                correctedSrc: corrected,
                corners: editorCorners,
                detectedCorners: it.detectedCorners ?? it.corners,
                edgeMidpoints: editorEdgeMidpoints,
                cornersSource: 'manual',
                confidence: 'high',
                status: 'aguardando',
                erro: null,
              }
            : it
        )
      );
      handleCloseEditor();
    } catch {
      toast.error('Não foi possível aplicar as bordas ajustadas.');
    } finally {
      setEditorSaving(false);
    }
  }, [
    editorCorners,
    editorEdgeMidpoints,
    editorImageSize,
    editorItemId,
    handleCloseEditor,
    setQueue,
    toast,
  ]);

  const handleCornerPointerMove = useCallback(
    (index: number, e: React.PointerEvent<HTMLButtonElement>) => {
      if (!(e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) return;
      const board = e.currentTarget.parentElement;
      if (!board || !editorImageSize) return;
      const rect = board.getBoundingClientRect();
      const x = Math.max(
        0,
        Math.min(
          editorImageSize.width,
          ((e.clientX - rect.left) / rect.width) * editorImageSize.width
        )
      );
      const y = Math.max(
        0,
        Math.min(
          editorImageSize.height,
          ((e.clientY - rect.top) / rect.height) * editorImageSize.height
        )
      );
      setEditorCorners((prev) => prev.map((point, i) => (i === index ? [x, y] : point)));
    },
    [editorImageSize]
  );

  const handleEdgePointerMove = useCallback(
    (index: number, e: React.PointerEvent<HTMLButtonElement>) => {
      if (!(e.currentTarget as HTMLButtonElement).hasPointerCapture(e.pointerId)) return;
      const board = e.currentTarget.parentElement;
      if (!board || !editorImageSize) return;
      const rect = board.getBoundingClientRect();
      const x = Math.max(
        0,
        Math.min(
          editorImageSize.width,
          ((e.clientX - rect.left) / rect.width) * editorImageSize.width
        )
      );
      const y = Math.max(
        0,
        Math.min(
          editorImageSize.height,
          ((e.clientY - rect.top) / rect.height) * editorImageSize.height
        )
      );
      setEditorEdgeMidpoints((prev) => prev.map((point, i) => (i === index ? [x, y] : point)));
    },
    [editorImageSize]
  );

  // ── Processar lote (paralelo com concorrência limitada) ──────────────────

  const handleProcessarLote = useCallback(async () => {
    if (processandoLote) return;
    const bloqueadas = queueRef.current.some(
      (it) => it.status === 'corrigindo' || it.status === 'revisar'
    );
    if (bloqueadas) {
      toast.error('Revise as bordas pendentes antes de processar o lote.');
      return;
    }
    setProcessandoLote(true);

    const pending = queueRef.current
      .filter((it) => it.status === 'aguardando')
      .map((it) => it.localId);

    let ok = 0;
    let fail = 0;

    // Pool: até 3 uploads simultâneos para maximizar throughput sem sobrecarregar
    const processOne = async (localId: string) => {
      setQueue((prev) =>
        prev.map((it) => (it.localId === localId ? { ...it, status: 'processando' } : it))
      );
      const item = queueRef.current.find((it) => it.localId === localId);
      if (!item?.originalSrc) return;
      try {
        const result = await api.post<ProcessarResponse>('/colaborador/capturas-mapa', {
          imagemBase64: item.originalSrc,
          imagemCorrigidaBase64: item.correctedSrc ?? undefined,
          manualCorners:
            item.cornersSource === 'manual' ? toManualCorners(item.corners) : undefined,
          detectedCorners:
            item.detectedCorners && item.detectedCorners.length === 4
              ? toManualCorners(item.detectedCorners)
              : item.cornersSource === 'detected'
                ? toManualCorners(item.corners)
                : undefined,
        });
        setQueue((prev) =>
          prev.map((it) => (it.localId === localId ? { ...it, status: 'concluido', result } : it))
        );
        ok++;
      } catch {
        setQueue((prev) =>
          prev.map((it) =>
            it.localId === localId ? { ...it, status: 'erro', erro: 'Falha ao processar' } : it
          )
        );
        fail++;
      }
    };

    const queue = [...pending];
    const workers = Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (queue.length > 0) {
        const localId = queue.shift();
        if (localId) await processOne(localId);
      }
    });
    await Promise.all(workers);

    if (ok > 0)
      toast.success(`${plural(ok, 'imagem processada', 'imagens processadas')} com sucesso.`);
    if (fail > 0) toast.error(`${plural(fail, 'imagem com erro', 'imagens com erro')}.`);
    setProcessandoLote(false);
  }, [processandoLote, setQueue, toast]);

  // ── Downloads de itens ────────────────────────────────────────────────────

  const handleDownloadItem = useCallback((item: QueueItem) => {
    if (!item.result) return;
    const link = document.createElement('a');
    link.href = item.result.imagemProcessada;
    link.download = item.result.nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleBaixarTodos = useCallback(() => {
    queueRef.current
      .filter((it) => it.status === 'concluido' && it.result)
      .forEach((item, i) => {
        setTimeout(() => {
          if (!item.result) return;
          const link = document.createElement('a');
          link.href = item.result.imagemProcessada;
          link.download = item.result.nomeArquivo;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }, i * 150);
      });
  }, []);

  const handleLimparFila = useCallback(() => {
    setQueue(() => []);
  }, [setQueue]);

  // ── Capturas recentes (servidor) ──────────────────────────────────────────

  const handleDownload = useCallback(
    async (id: string, nomeArquivo: string) => {
      setBaixandoId(id);
      try {
        const response = await api.fetchWithAuth(`/colaborador/capturas-mapa/${id}/download`);
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

  const handleExcluir = useCallback(
    async (id: string) => {
      setExcluindoId(id);
      try {
        await api.delete(`/colaborador/capturas-mapa/${id}`);
        setCapturasRecentes((prev) => prev?.filter((c) => c.id !== id) ?? null);
        toast.success('Captura excluida.');
      } catch {
        toast.error('Erro ao excluir captura.');
      } finally {
        setExcluindoId(null);
      }
    },
    [toast]
  );

  // ── Dados derivados ───────────────────────────────────────────────────────

  const aguardando = queue.filter((it) => it.status === 'aguardando').length;
  const revisar = queue.filter((it) => it.status === 'revisar').length;
  const corrigindo = queue.filter((it) => it.status === 'corrigindo').length;
  const concluidos = queue.filter((it) => it.status === 'concluido').length;
  const temErro = queue.some((it) => it.status === 'erro');
  const processandoAlgum = queue.some((it) => it.status === 'processando');
  const podeProcessarLote = aguardando > 0 && revisar === 0 && corrigindo === 0;
  const editorItem = queue.find((it) => it.localId === editorItemId) ?? null;
  const previewItem = queue.find((it) => it.localId === previewItemId) ?? null;

  // ── Renderizacao ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="Captura de Mapas"
        subtitle="Capture, revise as bordas e processe em lote."
      />

      {/* Banner de aviso sobre retencao */}
      <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        <Icon
          name="history"
          className="mt-0.5 h-4 w-4 flex-none text-[var(--color-text-tertiary)]"
        />
        <span>
          As capturas ficam disponiveis por <strong>30 dias</strong>. Baixe antes do vencimento.
        </span>
      </div>

      {/* Area de captura em lote */}
      <Card>
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-[var(--color-text-primary)]">
                Envie as imagens e revise apenas o que precisar.
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                A correção roda sozinha. Ajuste manualmente quando a folha não for detectada.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]">
              <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                1. Capturar ou enviar
              </span>
              <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                2. Revisar bordas
              </span>
              <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                3. Processar lote
              </span>
            </div>
          </div>

          {/* Zona de drop / botoes de adicao */}
          <div
            className={
              `mb-5 flex flex-col items-center gap-4 rounded-xl border px-4 py-6 text-center text-[var(--color-text-secondary)] transition-colors duration-200 sm:px-6 sm:py-8 ` +
              (dragActive
                ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-50)]'
                : 'border-dashed border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]')
            }
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-bg-primary)] text-[var(--color-primary-600)] shadow-sm">
              <Icon name="layers" className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                Arraste imagens aqui ou use a camera.
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                JPEG, PNG ou WEBP com ate 10 MB por arquivo.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                Sem envio imediato
              </span>
              <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                Revisao antes do lote
              </span>
              <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                Preview da imagem final
              </span>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
              <Button
                variant="primary"
                size="md"
                icon="camera"
                fullWidth
                className="sm:min-w-[11rem]"
                onClick={() => {
                  cameraInputRef.current?.setAttribute('capture', 'environment');
                  cameraInputRef.current?.click();
                }}
              >
                Usar camera
              </Button>
              <Button
                variant="secondary"
                size="md"
                icon="image"
                fullWidth
                className="sm:min-w-[11rem]"
                onClick={() => batchInputRef.current?.click()}
              >
                Escolher arquivos
              </Button>
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              No celular, prefira enquadrar a folha inteira antes de capturar.
            </p>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              aria-label="Capturar imagem pela câmera"
              title="Capturar imagem pela câmera"
              aria-hidden="true"
              tabIndex={-1}
              className="hidden"
              onChange={handleCameraChange}
            />
            <input
              ref={batchInputRef}
              type="file"
              accept="image/*"
              multiple
              aria-label="Selecionar várias imagens"
              title="Selecionar várias imagens"
              aria-hidden="true"
              tabIndex={-1}
              className="hidden"
              onChange={handleBatchChange}
            />
          </div>

          {/* Grade de itens da fila */}
          {queue.length > 0 && (
            <>
              {/* Barra de acoes do lote */}
              <div className="mb-4 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {plural(queue.length, 'imagem na fila', 'imagens na fila')}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]">
                      {corrigindo > 0 && (
                        <span className="rounded-full bg-[var(--color-primary-50)] px-3 py-1 text-[var(--color-primary-700)]">
                          Corrigindo {corrigindo}
                        </span>
                      )}
                      {aguardando > 0 && (
                        <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                          {aguardando} prontas
                        </span>
                      )}
                      {revisar > 0 && (
                        <span className="rounded-full bg-warning-50 px-3 py-1 text-warning-700 dark:bg-warning-950 dark:text-warning-300">
                          {revisar} para revisar
                        </span>
                      )}
                      {concluidos > 0 && (
                        <span className="rounded-full bg-success-50 px-3 py-1 text-success-700 dark:bg-success-950 dark:text-success-300">
                          {concluidos} concluidas
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:flex">
                    {concluidos > 0 && (
                      <Button
                        variant="secondary"
                        size="md"
                        icon="download"
                        fullWidth
                        className="xl:w-auto"
                        onClick={handleBaixarTodos}
                      >
                        Baixar todas
                      </Button>
                    )}
                    {podeProcessarLote && (
                      <Button
                        variant="primary"
                        size="md"
                        icon="zap"
                        fullWidth
                        className="xl:w-auto"
                        loading={processandoLote || processandoAlgum}
                        onClick={handleProcessarLote}
                      >
                        {processandoLote || processandoAlgum
                          ? 'Processando...'
                          : `Processar ${plural(aguardando, 'imagem', 'imagens')}`}
                      </Button>
                    )}
                    {!podeProcessarLote && aguardando > 0 && (
                      <Button
                        variant="secondary"
                        size="md"
                        icon="alert-triangle"
                        fullWidth
                        className="xl:w-auto"
                        disabled
                      >
                        {revisar > 0 ? 'Revise as bordas pendentes' : 'Aguarde a correcao'}
                      </Button>
                    )}
                    {temErro && (
                      <Button
                        variant="secondary"
                        size="md"
                        icon="refresh-cw"
                        fullWidth
                        className="xl:w-auto"
                        onClick={() => {
                          queue
                            .filter((it) => it.status === 'erro')
                            .forEach((it) => handleRetry(it.localId));
                        }}
                      >
                        Tentar de novo
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="md"
                      icon="trash-2"
                      fullWidth
                      className="xl:w-auto"
                      onClick={handleLimparFila}
                    >
                      Limpar fila
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
                  O lote so e liberado quando todas as imagens estiverem prontas ou revisadas.
                </p>
              </div>

              {/* Grade de miniaturas */}
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {queue.map((item) => (
                  <div
                    key={item.localId}
                    className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-sm"
                  >
                    {/* Miniatura */}
                    <div className="relative aspect-[3/4] overflow-hidden bg-[var(--color-bg-secondary)]">
                      <img
                        src={item.thumbSrc}
                        alt="Miniatura"
                        className="h-full w-full object-cover"
                      />

                      {/* Overlay de estado */}
                      {(item.status === 'corrigindo' || item.status === 'processando') && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-overlay-backdrop)]">
                          <div className="h-6 w-6 motion-safe:animate-spin [animation-duration:1.2s] rounded-full border-4 border-white/30 border-t-white" />
                        </div>
                      )}

                      {item.status === 'concluido' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-success-900/30">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success-500 text-white">
                            <Icon name="check" className="h-4 w-4" />
                          </div>
                        </div>
                      )}

                      {item.status === 'erro' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-error-900/30">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-error-500 text-white">
                            <Icon name="x" className="h-4 w-4" />
                          </div>
                        </div>
                      )}

                      {item.status === 'revisar' && (
                        <button
                          className="absolute inset-x-2 bottom-2 rounded-lg bg-warning-500 px-3 py-2 text-xs font-medium text-white shadow-sm"
                          onClick={() => void handleOpenEditor(item)}
                        >
                          Ajustar Bordas
                        </button>
                      )}

                      {/* Botao remover */}
                      {item.status !== 'processando' && (
                        <button
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--color-bg-primary)_72%,transparent)] text-[var(--color-text-primary)] opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                          onClick={() => handleRemover(item.localId)}
                          aria-label="Remover"
                        >
                          <Icon name="x" className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Rodape do card */}
                    <div className="space-y-2 px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`min-w-0 text-xs font-medium ${STATUS_COLOR[item.status]}`}
                        >
                          {item.status === 'concluido' && item.result
                            ? getProcessingBadge(item.result)
                            : STATUS_LABEL[item.status]}
                          {item.status === 'concluido' && item.result && (
                            <span className="ml-1 font-normal text-[var(--color-text-tertiary)]">
                              {' '}
                              {formatBytes(item.result.tamanhoBytes)}
                            </span>
                          )}
                        </span>

                        {item.status === 'concluido' && item.result && (
                          <div className="flex flex-none gap-1">
                            <button
                              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-primary-600)] transition-colors hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)]"
                              onClick={() => setPreviewItemId(item.localId)}
                              aria-label="Visualizar"
                            >
                              <Icon name="eye" className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-primary-600)] transition-colors hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)]"
                              onClick={() => handleDownloadItem(item)}
                              aria-label="Baixar"
                            >
                              <Icon name="download" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        {item.status === 'revisar' && (
                          <div className="flex flex-none gap-1">
                            <button
                              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-primary-600)] transition-colors hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)]"
                              onClick={() => void handleOpenEditor(item)}
                              aria-label="Ajustar Bordas"
                            >
                              <Icon name="edit" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        {item.status === 'erro' && (
                          <button
                            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-error-600 transition-colors hover:bg-error-50 hover:text-error-700 dark:hover:bg-error-950"
                            onClick={() => handleRetry(item.localId)}
                            aria-label="Tentar novamente"
                          >
                            <Icon name="refresh-cw" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {item.status === 'concluido' && item.result && (
                        <div className="space-y-1 text-[11px] leading-4 text-[var(--color-text-secondary)]">
                          <div className="flex flex-wrap gap-x-2">
                            {formatConfidence(item.result.processamento.confidence) && (
                              <span>
                                Confianca {formatConfidence(item.result.processamento.confidence)}
                              </span>
                            )}
                            {item.result.processamento.engine && (
                              <span>{item.result.processamento.engine}</span>
                            )}
                            {formatDocumentClass(item.result) && (
                              <span>{formatDocumentClass(item.result)}</span>
                            )}
                            {getDecisionHint(item.result) && (
                              <span>{getDecisionHint(item.result)}</span>
                            )}
                          </div>
                          {item.result.processamento.fallback && (
                            <p className="text-warning-700 dark:text-warning-300">
                              Não conseguimos detectar a folha com seguranca. Salvamos a imagem
                              original com melhoria leve.
                            </p>
                          )}
                          {item.result.processamento.metadata?.warnings?.[0] && (
                            <p>{item.result.processamento.metadata.warnings[0]}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

      <Modal
        open={!!editorItem && !!editorImageSize}
        onClose={handleCloseEditor}
        title="Ajustar Bordas"
        subtitle="Enquadre apenas a folha."
        size="xl"
        scrollable
        footer={
          <div className="flex flex-col gap-2 p-4 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button variant="ghost" size="sm" onClick={handleCloseEditor} disabled={editorSaving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="check"
              loading={editorSaving}
              onClick={handleSaveEditor}
            >
              Aplicar bordas
            </Button>
          </div>
        }
      >
        {editorItem && editorImageSize && (
          <div className="space-y-3 p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Arraste os cantos e os pontos centrais ate remover mesa, fundo e sombras externas.
            </p>
            <div
              className={`relative mx-auto w-full max-w-[760px] overflow-hidden rounded-xl bg-[var(--color-gray-900)] ${editorAspectClass}`}
            >
              <style>{editorPositionStyles}</style>
              <img
                src={editorItem.originalSrc}
                alt="Imagem para ajuste"
                className="h-full w-full select-none object-contain"
                draggable={false}
              />
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox={`0 0 ${editorImageSize.width} ${editorImageSize.height}`}
                preserveAspectRatio="none"
              >
                <polygon
                  points={
                    editorCorners.length === 4 && editorEdgeMidpoints.length === 4
                      ? [
                          editorCorners[0]!,
                          editorEdgeMidpoints[0]!,
                          editorCorners[1]!,
                          editorEdgeMidpoints[1]!,
                          editorCorners[2]!,
                          editorEdgeMidpoints[2]!,
                          editorCorners[3]!,
                          editorEdgeMidpoints[3]!,
                        ]
                          .map(([x, y]) => `${x},${y}`)
                          .join(' ')
                      : editorCorners.map(([x, y]) => `${x},${y}`).join(' ')
                  }
                  fill="rgba(68, 76, 231, 0.12)"
                  stroke="rgb(68, 76, 231)"
                  strokeWidth={2}
                />
              </svg>
              {editorCorners.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-white bg-primary-600 text-xs font-bold text-white shadow-lg editor-corner-${index}`}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    handleCornerPointerMove(index, e);
                  }}
                  onPointerMove={(e) => handleCornerPointerMove(index, e)}
                  aria-label={`Canto ${index + 1}`}
                >
                  {index + 1}
                </button>
              ))}
              {editorEdgeMidpoints.map((_, index) => (
                <button
                  key={`edge-${index}`}
                  type="button"
                  className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-white bg-warning-500 text-[10px] font-bold text-white shadow-lg editor-edge-${index}`}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    handleEdgePointerMove(index, e);
                  }}
                  onPointerMove={(e) => handleEdgePointerMove(index, e)}
                  aria-label={`Curva da borda ${index + 1}`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!previewItem?.result}
        onClose={() => setPreviewItemId(null)}
        title="Imagem Processada"
        subtitle={previewItem?.result?.nomeArquivo}
        size="xl"
        scrollable
        footer={
          <div className="flex flex-col gap-2 p-4 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button variant="ghost" size="sm" onClick={() => setPreviewItemId(null)}>
              Fechar
            </Button>
            {previewItem?.result && (
              <Button
                variant="primary"
                size="sm"
                icon="download"
                onClick={() => handleDownloadItem(previewItem)}
              >
                Baixar imagem
              </Button>
            )}
          </div>
        }
      >
        {previewItem?.result && (
          <div className="space-y-4 p-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
                <div className="border-b border-[var(--color-border-primary)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]">
                  Original
                </div>
                <img
                  src={previewItem.originalSrc}
                  alt="Imagem original"
                  className="max-h-[65vh] w-full object-contain"
                />
              </div>
              <div className="overflow-hidden rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
                <div className="border-b border-[var(--color-border-primary)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)]">
                  Corrigida
                </div>
                <img
                  src={previewItem.result.imagemProcessada}
                  alt="Preview da imagem processada"
                  className="max-h-[65vh] w-full object-contain"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]">
              <span>{previewItem.result.nomeArquivo}</span>
              <span>{formatBytes(previewItem.result.tamanhoBytes)}</span>
              {formatConfidence(previewItem.result.processamento.confidence) && (
                <span>
                  Confianca {formatConfidence(previewItem.result.processamento.confidence)}
                </span>
              )}
              {formatDocumentClass(previewItem.result) && (
                <span>{formatDocumentClass(previewItem.result)}</span>
              )}
              {getDecisionHint(previewItem.result) && (
                <span>{getDecisionHint(previewItem.result)}</span>
              )}
              <span>{getProcessingBadge(previewItem.result)}</span>
            </div>
            {previewItem.result.processamento.fallback && (
              <p className="mt-2 text-xs text-warning-700 dark:text-warning-300">
                Não conseguimos detectar a folha com seguranca. Salvamos a imagem original com
                melhoria leve.
              </p>
            )}
            {previewItem.result.processamento.metadata?.warnings?.map((warning) => (
              <p key={warning} className="text-xs text-[var(--color-text-secondary)]">
                {warning}
              </p>
            ))}
          </div>
        )}
      </Modal>

      {/* Capturas recentes (servidor) */}
      <Card>
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                Capturas recentes
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Arquivos salvos nos ultimos 30 dias.
              </p>
            </div>
            <Button
              variant="secondary"
              size="md"
              icon="refresh-cw"
              loading={carregandoLista}
              fullWidth
              className="sm:w-auto"
              onClick={handleCarregarCapturas}
            >
              {listaExpandida ? 'Atualizar lista' : 'Carregar lista'}
            </Button>
          </div>

          {!listaExpandida && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Carregue a lista para ver imagens salvas.
            </p>
          )}

          {listaExpandida && capturasRecentes !== null && capturasRecentes.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] py-8 text-sm text-[var(--color-text-secondary)]">
              <Icon name="image" className="h-8 w-8 opacity-40" />
              <p className="font-medium text-[var(--color-text-primary)]">Nenhuma captura salva</p>
            </div>
          )}

          {listaExpandida && capturasRecentes && capturasRecentes.length > 0 && (
            <div className="space-y-3">
              {capturasRecentes.map((c) => {
                const expirada = new Date(c.expira_em) < new Date();
                const confidence = formatConfidence(c.processamento_confianca ?? null);
                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                          {c.nome_arquivo}
                        </p>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {formatDateBR(c.criado_em)} - {formatBytes(c.tamanho_bytes)}
                        </p>
                        <p className="text-xs text-[var(--color-text-secondary)]">
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
                      <div className="flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]">
                        {c.processamento_status && (
                          <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                            {c.processamento_status}
                          </span>
                        )}
                        {c.processamento_engine && (
                          <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                            {c.processamento_engine}
                          </span>
                        )}
                        {confidence && (
                          <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                            {confidence}
                          </span>
                        )}
                        {c.processamento_fallback && (
                          <span className="rounded-full bg-warning-50 px-3 py-1 text-warning-700 dark:bg-warning-950 dark:text-warning-300">
                            Fallback
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                      {!expirada && (
                        <Button
                          variant="secondary"
                          size="md"
                          icon="download"
                          loading={baixandoId === c.id}
                          fullWidth
                          className="sm:w-auto"
                          onClick={() => handleDownload(c.id, c.nome_arquivo)}
                          aria-label="Baixar"
                        >
                          Baixar
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="md"
                        icon="trash-2"
                        loading={excluindoId === c.id}
                        fullWidth
                        className="sm:w-auto"
                        onClick={() => handleExcluir(c.id)}
                        aria-label="Excluir"
                      >
                        Excluir
                      </Button>
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
