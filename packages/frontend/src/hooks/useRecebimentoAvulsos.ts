import { useState } from 'react';
import type { OrigemDocumentoRecebimento } from '@recorda/shared';
import { useToastHelpers } from '../components/ui/Toast';
import { extractErrorMessage } from '../utils/errors';
import { useConfirmDialog } from './useConfirmDialog';
import {
  useAvulsos,
  useSetoresRecebimento,
  useClassificacoesRecebimento,
  useCriarProcessoAvulso,
  useExcluirProcessoRecebimento,
  useVincularProcessos,
  useCriarApenso,
  useExcluirApenso,
  useCriarSetorRecebimento,
  useCriarClassificacaoRecebimento,
  useQueryClient,
  queryKeys,
} from './useQueries';

export interface ApensoAvulso {
  id: string;
  protocolo: string;
  interessado: string | null;
  volume_atual: number;
  volume_total: number;
  origem: string;
  criado_em: string;
}

export interface ProcessoAvulso {
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
  observacao: string;
  criado_em: string;
  apensos: ApensoAvulso[];
}

export interface SelectOption {
  id: string;
  nome: string;
}

export interface AvulsoForm {
  protocolo: string;
  interessado: string;
  setorId: string;
  classificacaoId: string;
  volumeAtual: number;
  volumeTotal: number;
  numeroCaixas: number;
  caixaNova: boolean;
  observacao: string;
}

const EMPTY_FORM: AvulsoForm = {
  protocolo: '',
  interessado: '',
  setorId: '',
  classificacaoId: '',
  volumeAtual: 1,
  volumeTotal: 0,
  numeroCaixas: 1,
  caixaNova: false,
  observacao: '',
};

export function useRecebimentoAvulsos() {
  const toast = useToastHelpers();
  const confirmDialog = useConfirmDialog();

  // Mutation hooks
  const criarAvulsoMut = useCriarProcessoAvulso();
  const excluirProcessoMut = useExcluirProcessoRecebimento();
  const vincularMut = useVincularProcessos();
  const criarApensoMut = useCriarApenso();
  const excluirApensoMut = useExcluirApenso();
  const criarSetorMut = useCriarSetorRecebimento();
  const criarClassifMut = useCriarClassificacaoRecebimento();
  const queryClient = useQueryClient();

  const invalidateAvulsos = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.avulsosAll });

  const [processando, setProcessando] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState<string | undefined>(undefined);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<AvulsoForm>({ ...EMPTY_FORM });
  const [formAberto, setFormAberto] = useState(false);
  const [vincularModalOpen, setVincularModalOpen] = useState(false);

  const [novoSetorInput, setNovoSetorInput] = useState('');
  const [novaClassifInput, setNovaClassifInput] = useState('');
  const [apensoProcessoId, setApensoProcessoId] = useState('');
  const [apensoFormAberto, setApensoFormAberto] = useState(false);
  const [apensoForm, setApensoForm] = useState({
    protocolo: '',
    interessado: '',
    volumeAtual: 1,
    volumeTotal: 0,
  });

  // React Query for data fetching
  const avulsosQuery = useAvulsos({ busca, pagina, limite: 50 });
  const avulsos = avulsosQuery.data?.processos ?? [];
  const totalPaginas = avulsosQuery.data?.totalPaginas ?? 1;
  const carregando = avulsosQuery.isLoading;

  const setoresQuery = useSetoresRecebimento();
  const setoresOptions = setoresQuery.data ?? [];

  const classificacoesQuery = useClassificacoesRecebimento();
  const classificacoesOptions = classificacoesQuery.data ?? [];

  const handleCriarAvulso = async (): Promise<void> => {
    if (!form.protocolo.trim() || !form.interessado.trim()) {
      toast.error('Protocolo e interessado são obrigatórios.');
      return;
    }

    try {
      setProcessando(true);
      await criarAvulsoMut.mutateAsync({
        protocolo: form.protocolo.trim(),
        interessado: form.interessado.trim(),
        setorId: form.setorId || undefined,
        classificacaoId: form.classificacaoId || undefined,
        volumeAtual: form.volumeAtual,
        volumeTotal: form.volumeTotal,
        numeroCaixas: form.numeroCaixas,
        caixaNova: form.caixaNova,
        observacao: form.observacao.trim(),
        origem: 'MANUAL',
      });
      toast.success('Processo Avulso cadastrado.');
      setForm({ ...EMPTY_FORM });
      setFormAberto(false);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Cadastrar Processo Avulso'));
    } finally {
      setProcessando(false);
    }
  };

  const handleExcluirAvulso = (processoId: string): void => {
    confirmDialog.confirm({
      title: 'Excluir Processo',
      message: 'Tem certeza que deseja excluir este processo? Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        try {
          setProcessando(true);
          await excluirProcessoMut.mutateAsync(processoId);
          setSelecionados((prev) => {
            const next = new Set(prev);
            next.delete(processoId);
            return next;
          });
          toast.success('Processo excluído.');
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao Excluir Processo'));
        } finally {
          setProcessando(false);
        }
      },
    });
  };

  const handleVincular = async (repositorioId: string): Promise<void> => {
    const ids = Array.from(selecionados);
    if (ids.length === 0) {
      toast.error('Selecione pelo menos um processo para vincular.');
      return;
    }

    try {
      setProcessando(true);
      const result = await vincularMut.mutateAsync({ processoIds: ids, repositorioId });
      toast.success(`${result.vinculados} processo(s) vinculado(s) ao repositório.`);
      setSelecionados(new Set());
      setVincularModalOpen(false);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Vincular Processos'));
    } finally {
      setProcessando(false);
    }
  };

  const handleAdicionarApenso = async (): Promise<void> => {
    if (!apensoProcessoId) return;
    if (!apensoForm.protocolo.trim()) {
      toast.error('Protocolo do apenso é obrigatório.');
      return;
    }
    try {
      setProcessando(true);
      await criarApensoMut.mutateAsync({
        processoId: apensoProcessoId,
        protocolo: apensoForm.protocolo.trim(),
        interessado: apensoForm.interessado.trim() || undefined,
        volumeAtual: apensoForm.volumeAtual,
        volumeTotal: apensoForm.volumeTotal,
        origem: 'MANUAL',
      });
      toast.success('Apenso registrado.');
      setApensoForm({ protocolo: '', interessado: '', volumeAtual: 1, volumeTotal: 0 });
      setApensoFormAberto(false);
      setApensoProcessoId('');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Salvar Apenso'));
    } finally {
      setProcessando(false);
    }
  };

  const handleExcluirApenso = (apensoId: string): void => {
    confirmDialog.confirm({
      title: 'Excluir Apenso',
      message: 'Tem certeza que deseja excluir este apenso?',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        try {
          setProcessando(true);
          await excluirApensoMut.mutateAsync(apensoId);
          toast.success('Apenso excluído.');
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao Excluir Apenso'));
        } finally {
          setProcessando(false);
        }
      },
    });
  };

  const handleCriarSetor = async (): Promise<void> => {
    const nome = novoSetorInput.trim();
    if (!nome) return;
    try {
      const created = await criarSetorMut.mutateAsync(nome);
      setForm((p) => ({ ...p, setorId: created.id }));
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
      setForm((p) => ({ ...p, classificacaoId: created.id }));
      setNovaClassifInput('');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao Criar Classificação'));
    }
  };

  const toggleSelecionado = (id: string): void => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTodos = (): void => {
    if (selecionados.size === avulsos.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(avulsos.map((a) => a.id)));
    }
  };

  return {
    avulsos,
    carregando,
    processando,
    pagina,
    setPagina,
    totalPaginas,
    selecionados,
    form,
    setForm,
    formAberto,
    setFormAberto,
    vincularModalOpen,
    setVincularModalOpen,
    setoresOptions,
    classificacoesOptions,
    novoSetorInput,
    setNovoSetorInput,
    novaClassifInput,
    setNovaClassifInput,
    EMPTY_FORM,
    apensoProcessoId,
    setApensoProcessoId,
    apensoFormAberto,
    setApensoFormAberto,
    apensoForm,
    setApensoForm,
    invalidateAvulsos,
    busca,
    setBusca,
    handleCriarAvulso,
    handleExcluirAvulso,
    handleAdicionarApenso,
    handleExcluirApenso,
    handleVincular,
    handleCriarSetor,
    handleCriarClassificacao,
    toggleSelecionado,
    toggleTodos,
    confirmDialog,
  };
}
