import { useState } from 'react';
import type { OrigemDocumentoRecebimento } from '@recorda/shared';
import { useToastHelpers } from '../components/ui/Toast';
import { extractErrorMessage } from '../utils/errors';
import { useConfirmDialog } from './useConfirmDialog';
import {
  useRecebimentoProcessos,
  useSetoresRecebimento,
  useClassificacoesRecebimento,
  useCriarSetorRecebimento,
  useCriarClassificacaoRecebimento,
  useOcrPreview,
  useCriarProcessoRecebimento,
  useExcluirProcessoRecebimento,
  useCriarApenso,
  useExcluirApenso,
} from './useQueries';

export interface SelectOption {
  id: string;
  nome: string;
}

export interface RecebimentoApenso {
  id: string;
  protocolo: string;
  interessado: string | null;
  volume_atual: number;
  volume_total: number;
  origem: string;
  criado_em: string;
}

export interface RecebimentoProcesso {
  id: string;
  protocolo: string;
  interessado: string;
  setor_id: string | null;
  setor_nome: string | null;
  classificacao_id: string | null;
  classificacao_nome: string | null;
  volume_atual: number;
  volume_total: number;
  numero_caixas: number;
  caixa_nova: boolean;
  origem: OrigemDocumentoRecebimento;
  ocr_confianca?: number | null;
  criado_em: string;
  apensos: RecebimentoApenso[];
}

export interface OCRPreviewResponse {
  protocolo: string;
  interessado: string;
  textoExtraido: string;
  confianca: number;
}

export interface DocForm {
  protocolo: string;
  interessado: string;
  setorId: string;
  classificacaoId: string;
  volumeAtual: number;
  volumeTotal: number;
  numeroCaixas: number;
  caixaNova: boolean;
  origem: OrigemDocumentoRecebimento;
}

export interface RepositorioRef {
  id_repositorio_recorda: string;
  id_repositorio_ged: string;
  orgao: string;
  projeto: string;
}

const EMPTY_DOC_FORM: DocForm = {
  protocolo: '',
  interessado: '',
  setorId: '',
  classificacaoId: '',
  volumeAtual: 1,
  volumeTotal: 0,
  numeroCaixas: 1,
  caixaNova: false,
  origem: 'MANUAL',
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('Falha ao ler arquivo'));
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

export function useRecebimento() {
  const toast = useToastHelpers();
  const confirmDialog = useConfirmDialog();

  // Mutation hooks
  const criarSetorMut = useCriarSetorRecebimento();
  const criarClassifMut = useCriarClassificacaoRecebimento();
  const ocrPreviewMut = useOcrPreview();
  const criarProcessoMut = useCriarProcessoRecebimento();
  const excluirProcessoMut = useExcluirProcessoRecebimento();
  const criarApensoMut = useCriarApenso();
  const excluirApensoMut = useExcluirApenso();

  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrRepo, setOcrRepo] = useState<RepositorioRef | null>(null);
  const [ocrImagemBase64, setOcrImagemBase64] = useState('');
  const [ocrPreview, setOcrPreview] = useState<OCRPreviewResponse | null>(null);
  const [ocrProcessando, setOcrProcessando] = useState(false);
  const [recebTab, setRecebTab] = useState<'ocr' | 'processos'>('ocr');
  const [apensoModalOpen, setApensoModalOpen] = useState(false);
  const [apensoProcessoId, setApensoProcessoId] = useState('');
  const [novoSetorInput, setNovoSetorInput] = useState('');
  const [novaClassifInput, setNovaClassifInput] = useState('');
  const [docForm, setDocForm] = useState<DocForm>({ ...EMPTY_DOC_FORM });

  // React Query for data fetching
  const processosQuery = useRecebimentoProcessos(ocrRepo?.id_repositorio_recorda ?? null);
  const recebProcessos = processosQuery.data ?? [];

  const setoresQuery = useSetoresRecebimento();
  const setoresOptions = setoresQuery.data ?? [];

  const classificacoesQuery = useClassificacoesRecebimento();
  const classificacoesOptions = classificacoesQuery.data ?? [];

  const handleCriarSetor = async (): Promise<void> => {
    const nome = novoSetorInput.trim();
    if (!nome) return;
    try {
      const created = await criarSetorMut.mutateAsync(nome);
      setDocForm((p) => ({ ...p, setorId: created.id }));
      setNovoSetorInput('');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Criar Setor'));
    }
  };

  const handleCriarClassificacao = async (): Promise<void> => {
    const nome = novaClassifInput.trim();
    if (!nome) return;
    try {
      const created = await criarClassifMut.mutateAsync(nome);
      setDocForm((p) => ({ ...p, classificacaoId: created.id }));
      setNovaClassifInput('');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Criar Classificação'));
    }
  };

  const handleOpenOCRModal = (item: RepositorioRef): void => {
    setOcrRepo(item);
    setOcrImagemBase64('');
    setOcrPreview(null);
    setDocForm({ ...EMPTY_DOC_FORM });
    setRecebTab('processos');
    setOcrModalOpen(true);
  };

  const handleUploadImagemOCR = async (file: File | null): Promise<void> => {
    if (!file) return;
    try {
      setOcrProcessando(true);
      const base64 = await fileToBase64(file);
      setOcrImagemBase64(base64);
      toast.success('Imagem carregada.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Carregar Imagem'));
    } finally {
      setOcrProcessando(false);
    }
  };

  const handleProcessarOCR = async (): Promise<void> => {
    if (!ocrRepo?.id_repositorio_recorda) return;
    if (!ocrImagemBase64) {
      toast.error('Selecione uma imagem antes de processar OCR.');
      return;
    }

    try {
      setOcrProcessando(true);
      const preview = await ocrPreviewMut.mutateAsync({ repoId: ocrRepo.id_repositorio_recorda, imagemBase64: ocrImagemBase64 });
      setOcrPreview(preview);
      setDocForm((prev) => ({
        ...prev,
        protocolo: preview.protocolo || '',
        interessado: preview.interessado || '',
        origem: 'OCR',
      }));
      setRecebTab('ocr');
      toast.success('OCR processado. Revise os campos e salve.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Processar OCR'));
    } finally {
      setOcrProcessando(false);
    }
  };

  const handleSalvarProcessoRecebimento = async (): Promise<void> => {
    if (!ocrRepo?.id_repositorio_recorda) return;
    if (!docForm.protocolo.trim() || !docForm.interessado.trim()) {
      toast.error('Protocolo e interessado são obrigatórios.');
      return;
    }

    try {
      setOcrProcessando(true);
      await criarProcessoMut.mutateAsync({
        repoId: ocrRepo.id_repositorio_recorda,
        protocolo: docForm.protocolo.trim(),
        interessado: docForm.interessado.trim(),
        setorId: docForm.setorId || undefined,
        classificacaoId: docForm.classificacaoId || undefined,
        volumeAtual: docForm.volumeAtual,
        volumeTotal: docForm.volumeTotal,
        numeroCaixas: docForm.numeroCaixas,
        caixaNova: docForm.caixaNova,
        origem: docForm.origem,
        ocrConfianca: ocrPreview?.confianca ?? null,
        textoExtraido: ocrPreview?.textoExtraido ?? '',
        imagemBase64: docForm.origem === 'OCR' ? ocrImagemBase64 : undefined,
      });
      setDocForm({ ...EMPTY_DOC_FORM });
      setOcrPreview(null);
      setOcrImagemBase64('');
      setRecebTab('processos');
      toast.success('Processo registrado no Recebimento.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Salvar Processo'));
    } finally {
      setOcrProcessando(false);
    }
  };

  const handleExcluirProcessoRecebimento = (processoId: string): void => {
    if (!ocrRepo?.id_repositorio_recorda) return;
    confirmDialog.confirm({
      title: 'Excluir Processo',
      message: 'Tem certeza que deseja excluir este processo? Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        try {
          setOcrProcessando(true);
          await excluirProcessoMut.mutateAsync(processoId);
          toast.success('Processo excluído.');
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao Excluir Processo'));
        } finally {
          setOcrProcessando(false);
        }
      },
    });
  };

  const handleAdicionarApenso = async (): Promise<void> => {
    if (!apensoProcessoId || !ocrRepo?.id_repositorio_recorda) return;
    if (!docForm.protocolo.trim()) {
      toast.error('Protocolo do apenso é obrigatório.');
      return;
    }

    try {
      setOcrProcessando(true);
      await criarApensoMut.mutateAsync({
        processoId: apensoProcessoId,
        protocolo: docForm.protocolo.trim(),
        interessado: docForm.interessado.trim() || undefined,
        volumeAtual: docForm.volumeAtual,
        volumeTotal: docForm.volumeTotal,
        origem: docForm.origem,
        ocrConfianca: ocrPreview?.confianca ?? null,
        textoExtraido: ocrPreview?.textoExtraido ?? '',
        imagemBase64: docForm.origem === 'OCR' ? ocrImagemBase64 : undefined,
      });
      setDocForm({ ...EMPTY_DOC_FORM });
      setOcrPreview(null);
      setOcrImagemBase64('');
      setApensoModalOpen(false);
      setApensoProcessoId('');
      toast.success('Apenso registrado.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Salvar Apenso'));
    } finally {
      setOcrProcessando(false);
    }
  };

  const handleExcluirApenso = (apensoId: string): void => {
    if (!ocrRepo?.id_repositorio_recorda) return;
    confirmDialog.confirm({
      title: 'Excluir Apenso',
      message: 'Tem certeza que deseja excluir este apenso?',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        try {
          setOcrProcessando(true);
          await excluirApensoMut.mutateAsync(apensoId);
          toast.success('Apenso excluído.');
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao Excluir Apenso'));
        } finally {
          setOcrProcessando(false);
        }
      },
    });
  };

  const clearOcrData = (): void => {
    setOcrImagemBase64('');
    setOcrPreview(null);
  };

  const resetDocForm = (): void => {
    setDocForm({ ...EMPTY_DOC_FORM });
  };

  return {
    // State
    ocrModalOpen,
    setOcrModalOpen,
    ocrRepo,
    ocrImagemBase64,
    setOcrImagemBase64,
    ocrPreview,
    setOcrPreview,
    ocrProcessando,
    recebProcessos,
    recebTab,
    setRecebTab,
    apensoModalOpen,
    setApensoModalOpen,
    apensoProcessoId,
    setApensoProcessoId,
    setoresOptions,
    classificacoesOptions,
    novoSetorInput,
    setNovoSetorInput,
    novaClassifInput,
    setNovaClassifInput,
    docForm,
    setDocForm,

    // Helpers
    clearOcrData,
    resetDocForm,
    EMPTY_DOC_FORM,

    // Actions
    handleOpenOCRModal,
    handleUploadImagemOCR,
    handleProcessarOCR,
    handleSalvarProcessoRecebimento,
    handleExcluirProcessoRecebimento,
    handleAdicionarApenso,
    handleExcluirApenso,
    handleCriarSetor,
    handleCriarClassificacao,

    // Confirm dialog (for rendering ConfirmDialog component)
    confirmDialog,
  };
}
