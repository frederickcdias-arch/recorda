import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDebounce } from '../../hooks/useDebounce';
import type { EtapaFluxo } from '@recorda/shared';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { PageState, ActionFeedback } from '../../components/ui/PageState';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import {
  useConhecimentoDocs,
  useConhecimentoDetalhe,
  useCriarDocConhecimento,
  useCriarVersaoConhecimento,
  useAtualizarDocConhecimento,
  useGlossario,
  useCriarGlossario,
  useAtualizarGlossario,
  useExcluirGlossario,
  useLeisNormas,
  useCriarLeiNorma,
  useAtualizarLeiNorma,
  useExcluirLeiNorma,
  useQueryClient,
  queryKeys,
} from '../../hooks/useQueries';
import type { GlossarioItem, LeiNormaItem } from '../../hooks/useQueries';

const MarkdownEditor = lazy(() =>
  import('../../components/ui/MarkdownEditor').then((module) => ({
    default: module.MarkdownEditor,
  }))
);

const MarkdownViewer = lazy(() =>
  import('../../components/ui/MarkdownEditor').then((module) => ({
    default: module.MarkdownViewer,
  }))
);

type KBCategoria =
  | 'MANUAIS'
  | 'PROCEDIMENTOS_ETAPA'
  | 'CHECKLISTS_EXPLICADOS'
  | 'GLOSSARIO'
  | 'NORMAS_LEIS'
  | 'ATUALIZACOES_PROCESSO';

const CATEGORIAS: KBCategoria[] = [
  'MANUAIS',
  'PROCEDIMENTOS_ETAPA',
  'CHECKLISTS_EXPLICADOS',
  'GLOSSARIO',
  'NORMAS_LEIS',
  'ATUALIZACOES_PROCESSO',
];

const ETAPAS: EtapaFluxo[] = [
  'RECEBIMENTO',
  'PREPARACAO',
  'DIGITALIZACAO',
  'CONFERENCIA',
  'MONTAGEM',
  'CONTROLE_QUALIDADE',
  'ENTREGA',
];

const ETAPA_LABELS: Record<string, string> = {
  RECEBIMENTO: 'Recebimento',
  PREPARACAO: 'Preparação',
  DIGITALIZACAO: 'Digitalização',
  DIGITALIZACAO_COLORIDA: 'Digital. Colorida',
  CONFERENCIA: 'Conferência',
  MONTAGEM: 'Montagem',
  CONTROLE_QUALIDADE: 'Controle de Qualidade',
  ENTREGA: 'Entrega',
  RECONFERENCIA: 'Reconferência',
  ATENDIMENTO: 'Atendimento',
};

function etapaLabel(etapa: EtapaFluxo): string {
  return ETAPA_LABELS[etapa] ?? etapa;
}
type KBTab = 'documentos' | 'glossario' | 'leis';

function isKBTab(value: string | null): value is KBTab {
  return value === 'documentos' || value === 'glossario' || value === 'leis';
}

function MarkdownFallback({ label }: { label: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4 text-sm text-[var(--color-text-tertiary)]">
      {label}
    </div>
  );
}

export function ConhecimentoOperacionalPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'administrador';

  const queryClient = useQueryClient();
  const criarDoc = useCriarDocConhecimento();
  const criarVersao = useCriarVersaoConhecimento();
  const atualizarDoc = useAtualizarDocConhecimento();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  const [activeTab, setActiveTab] = useState<KBTab>('documentos');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [etapaFiltro, setEtapaFiltro] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [buscaGlossario, setBuscaGlossario] = useState('');
  const [buscaLeis, setBuscaLeis] = useState('');
  const debouncedBusca = useDebounce(busca, 600);
  const debouncedBuscaGlossario = useDebounce(buscaGlossario, 600);
  const debouncedBuscaLeis = useDebounce(buscaLeis, 600);
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [editMeta, setEditMeta] = useState({
    titulo: '',
    descricao: '',
    status: 'ATIVO' as 'ATIVO' | 'INATIVO',
    etapas: [] as EtapaFluxo[],
  });

  const filtrosUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    return {
      tab: isKBTab(tab) ? tab : 'documentos',
      categoria: params.get('categoria') ?? '',
      etapa: params.get('etapa') ?? '',
      documento: params.get('documento') ?? '',
    };
  }, [location.search]);

  useEffect(() => {
    setActiveTab(filtrosUrl.tab);
    setCategoria(filtrosUrl.categoria);
    setEtapaFiltro(filtrosUrl.etapa);
    setSelectedId(filtrosUrl.documento);
  }, [filtrosUrl.categoria, filtrosUrl.documento, filtrosUrl.etapa, filtrosUrl.tab]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('tab', activeTab);
    if (categoria) params.set('categoria', categoria);
    if (etapaFiltro) params.set('etapa', etapaFiltro);
    if (selectedId) params.set('documento', selectedId);

    const nextSearch = params.toString();
    const currentSearch = location.search.startsWith('?')
      ? location.search.slice(1)
      : location.search;

    if (nextSearch !== currentSearch) {
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
        },
        { replace: true }
      );
    }
  }, [activeTab, categoria, etapaFiltro, location.pathname, location.search, navigate, selectedId]);

  const [novoDoc, setNovoDoc] = useState({
    codigo: '',
    titulo: '',
    categoria: 'MANUAIS' as KBCategoria,
    descricao: '',
    nivelAcesso: 'OPERADOR_ADMIN' as 'OPERADOR_ADMIN' | 'ADMIN',
    conteudo: '',
    resumoAlteracao: 'Versão inicial',
    etapas: [] as EtapaFluxo[],
  });

  const [novaVersao, setNovaVersao] = useState({
    conteudo: '',
    resumoAlteracao: '',
  });

  // React Query — Documentos
  const docsQuery = useConhecimentoDocs({ busca: debouncedBusca, categoria, etapa: etapaFiltro });
  const itens = useMemo(() => docsQuery.data?.itens ?? [], [docsQuery.data]);
  const loading = docsQuery.isLoading;
  const error = docsQuery.error
    ? {
        message: 'Erro ao carregar a base de Conhecimento Operacional',
        details: docsQuery.error instanceof Error ? docsQuery.error.message : 'Falha desconhecida',
      }
    : null;

  const detalheQuery = useConhecimentoDetalhe(selectedId || null);
  const detalhe = detalheQuery.data ?? null;

  // React Query — Glossário
  const glossarioQuery = useGlossario();
  const glossarioItens = useMemo(() => glossarioQuery.data?.itens ?? [], [glossarioQuery.data]);
  const criarGlossario = useCriarGlossario();
  const atualizarGlossario = useAtualizarGlossario();
  const excluirGlossario = useExcluirGlossario();
  const [novoTermo, setNovoTermo] = useState({ termo: '', definicao: '' });
  const [editandoTermoId, setEditandoTermoId] = useState<string | null>(null);
  const [editTermo, setEditTermo] = useState({ termo: '', definicao: '' });

  // React Query — Leis e Normas
  const leisQuery = useLeisNormas();
  const leisItens = useMemo(() => leisQuery.data?.itens ?? [], [leisQuery.data]);

  const glossarioFiltrado = useMemo(() => {
    if (!debouncedBuscaGlossario.trim()) return glossarioItens;
    const q = debouncedBuscaGlossario.toLowerCase();
    return glossarioItens.filter(
      (item) => item.termo.toLowerCase().includes(q) || item.definicao.toLowerCase().includes(q)
    );
  }, [glossarioItens, debouncedBuscaGlossario]);

  const leisFiltradas = useMemo(() => {
    if (!debouncedBuscaLeis.trim()) return leisItens;
    const q = debouncedBuscaLeis.toLowerCase();
    return leisItens.filter(
      (item) =>
        item.nome.toLowerCase().includes(q) ||
        item.descricao.toLowerCase().includes(q) ||
        item.referencia.toLowerCase().includes(q)
    );
  }, [leisItens, debouncedBuscaLeis]);

  const criarLei = useCriarLeiNorma();
  const atualizarLei = useAtualizarLeiNorma();
  const excluirLei = useExcluirLeiNorma();
  const [novaLei, setNovaLei] = useState({ nome: '', descricao: '', referencia: '', url: '' });
  const [editandoLeiId, setEditandoLeiId] = useState<string | null>(null);
  const [editLei, setEditLei] = useState({ nome: '', descricao: '', referencia: '', url: '' });

  // Auto-select first item
  useEffect(() => {
    if (itens.length === 0) {
      if (selectedId) setSelectedId('');
      return;
    }

    const selecionadoAindaExiste = itens.some((item) => item.id === selectedId);
    if (!selectedId || !selecionadoAindaExiste) {
      setSelectedId(itens[0]!.id);
    }
  }, [itens, selectedId]);

  // Sync novaVersao when detalhe changes
  useEffect(() => {
    if (detalhe?.versaoAtual) {
      setNovaVersao({ conteudo: detalhe.versaoAtual.conteudo ?? '', resumoAlteracao: '' });
    }
  }, [detalhe]);

  useEffect(() => {
    if (detalhe?.documento) {
      setEditMeta({
        titulo: detalhe.documento.titulo,
        descricao: detalhe.documento.descricao,
        status: detalhe.documento.status,
        etapas: detalhe.etapas,
      });
      setEditandoMeta(false);
    }
  }, [detalhe]);

  const invalidateDocs = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.conhecimentoDocsAll });
  const invalidateDetalhe = () => {
    if (selectedId)
      void queryClient.invalidateQueries({ queryKey: queryKeys.conhecimentoDetalhe(selectedId) });
  };

  const errorWithAction = error
    ? {
        ...error,
        action: { label: 'Tentar novamente', onClick: invalidateDocs },
      }
    : null;

  const categoriaLabel = useMemo(
    () =>
      (value: KBCategoria): string =>
        value
          .replace('PROCEDIMENTOS_ETAPA', 'Procedimentos por Etapa')
          .replace('CHECKLISTS_EXPLICADOS', 'Checklists Explicados')
          .replace('NORMAS_LEIS', 'Normas e Leis')
          .replace('ATUALIZACOES_PROCESSO', 'Atualizações de Processo')
          .replace('MANUAIS', 'Manuais')
          .replace('GLOSSARIO', 'Glossário'),
    []
  );

  const toggleEtapa = (value: EtapaFluxo): void => {
    setNovoDoc((prev) => ({
      ...prev,
      etapas: prev.etapas.includes(value)
        ? prev.etapas.filter((item) => item !== value)
        : [...prev.etapas, value],
    }));
  };

  const toggleMetaEtapa = (value: EtapaFluxo): void => {
    setEditMeta((prev) => ({
      ...prev,
      etapas: prev.etapas.includes(value)
        ? prev.etapas.filter((item) => item !== value)
        : [...prev.etapas, value],
    }));
  };

  const handleCriarDocumento = async (): Promise<void> => {
    if (!isAdmin) return;
    if (!novoDoc.codigo || !novoDoc.titulo || !novoDoc.conteudo) {
      setMessage({
        tipo: 'error',
        texto: 'Preencha Código, Título e Conteúdo para criar o documento.',
      });
      return;
    }
    try {
      setSaving(true);
      await criarDoc.mutateAsync(novoDoc);
      setMessage({ tipo: 'success', texto: 'Documento criado com sucesso!' });
      setNovoDoc({
        codigo: '',
        titulo: '',
        categoria: 'MANUAIS',
        descricao: '',
        nivelAcesso: 'OPERADOR_ADMIN',
        conteudo: '',
        resumoAlteracao: 'Versão inicial',
        etapas: [],
      });
    } catch (err) {
      setMessage({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'Erro ao criar documento',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePublicarNovaVersao = async (): Promise<void> => {
    if (!isAdmin || !selectedId) return;
    if (!novaVersao.conteudo.trim()) {
      setMessage({ tipo: 'error', texto: 'Conteúdo da nova versão é obrigatório.' });
      return;
    }
    try {
      setSaving(true);
      await criarVersao.mutateAsync({ docId: selectedId, ...novaVersao });
      setMessage({ tipo: 'success', texto: 'Nova versão publicada.' });
      invalidateDetalhe();
    } catch (err) {
      setMessage({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'Erro ao publicar versão',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSalvarMeta = async (): Promise<void> => {
    if (!isAdmin || !selectedId) return;
    try {
      setSaving(true);
      await atualizarDoc.mutateAsync({
        id: selectedId,
        titulo: editMeta.titulo,
        descricao: editMeta.descricao,
        status: editMeta.status,
        etapas: editMeta.etapas,
      });
      setEditandoMeta(false);
      setMessage({ tipo: 'success', texto: 'Metadados atualizados.' });
      invalidateDetalhe();
      invalidateDocs();
    } catch (err) {
      setMessage({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'Erro ao atualizar metadados',
      });
    } finally {
      setSaving(false);
    }
  };

  // Glossário handlers
  const handleCriarTermo = async (): Promise<void> => {
    if (!novoTermo.termo.trim() || !novoTermo.definicao.trim()) {
      setMessage({ tipo: 'error', texto: 'Termo e definição são obrigatórios.' });
      return;
    }
    try {
      await criarGlossario.mutateAsync(novoTermo);
      setNovoTermo({ termo: '', definicao: '' });
      setMessage({ tipo: 'success', texto: 'Termo adicionado ao glossário.' });
    } catch (err) {
      setMessage({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'Erro ao criar termo',
      });
    }
  };

  const handleSalvarTermo = async (item: GlossarioItem): Promise<void> => {
    try {
      await atualizarGlossario.mutateAsync({
        id: item.id,
        termo: editTermo.termo,
        definicao: editTermo.definicao,
      });
      setEditandoTermoId(null);
      setMessage({ tipo: 'success', texto: 'Termo atualizado.' });
    } catch (err) {
      setMessage({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'Erro ao atualizar termo',
      });
    }
  };

  const handleExcluirTermo = async (id: string): Promise<void> => {
    if (!confirm('Excluir este termo do glossário?')) return;
    try {
      await excluirGlossario.mutateAsync(id);
      setMessage({ tipo: 'success', texto: 'Termo excluído.' });
    } catch (err) {
      setMessage({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'Erro ao excluir termo',
      });
    }
  };

  // Leis handlers
  const handleCriarLei = async (): Promise<void> => {
    if (!novaLei.nome.trim() || !novaLei.descricao.trim()) {
      setMessage({ tipo: 'error', texto: 'Nome e descrição são obrigatórios.' });
      return;
    }
    try {
      await criarLei.mutateAsync({ ...novaLei, url: novaLei.url || undefined });
      setNovaLei({ nome: '', descricao: '', referencia: '', url: '' });
      setMessage({ tipo: 'success', texto: 'Lei/norma adicionada.' });
    } catch (err) {
      setMessage({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'Erro ao criar lei/norma',
      });
    }
  };

  const handleSalvarLei = async (item: LeiNormaItem): Promise<void> => {
    try {
      await atualizarLei.mutateAsync({ id: item.id, ...editLei, url: editLei.url || undefined });
      setEditandoLeiId(null);
      setMessage({ tipo: 'success', texto: 'Lei/norma atualizada.' });
    } catch (err) {
      setMessage({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'Erro ao atualizar lei/norma',
      });
    }
  };

  const handleExcluirLei = async (id: string): Promise<void> => {
    if (!confirm('Excluir esta lei/norma?')) return;
    try {
      await excluirLei.mutateAsync(id);
      setMessage({ tipo: 'success', texto: 'Lei/norma excluída.' });
    } catch (err) {
      setMessage({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'Erro ao excluir lei/norma',
      });
    }
  };

  const TAB_OPTIONS: { key: KBTab; label: string; count?: number }[] = [
    { key: 'documentos', label: 'Documentos', count: itens.length },
    { key: 'glossario', label: 'Glossário', count: glossarioItens.length },
    { key: 'leis', label: 'Leis e Normas', count: leisItens.length },
  ];

  return (
    <PageState
      loading={loading && activeTab === 'documentos'}
      loadingMessage="Carregando base..."
      error={activeTab === 'documentos' ? errorWithAction : null}
    >
      <div className="space-y-6">
        <PageHeader title="Conhecimento Operacional" subtitle="Documentos, glossário e normas." />

        {message ? (
          <ActionFeedback
            type={message.tipo}
            title=""
            message={message.texto}
            onDismiss={() => setMessage(null)}
          />
        ) : null}

        {/* Tabs */}
        <div className="flex gap-1 bg-[var(--color-gray-100)] p-1 rounded-lg w-fit">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-[var(--color-primary-100)] text-[var(--color-primary-700)]' : 'bg-[var(--color-gray-200)] text-[var(--color-text-tertiary)]'}`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab: Documentos */}
        {activeTab === 'documentos' && (
          <>
            <Card>
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    label="Buscar"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Título, descrição ou conteúdo"
                  />
                </div>
                <div className="w-48">
                  <Select
                    label="Categoria"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    options={[
                      { value: '', label: 'Todas' },
                      ...CATEGORIAS.map((item) => ({ value: item, label: categoriaLabel(item) })),
                    ]}
                  />
                </div>
                <div className="w-48">
                  <Select
                    label="Etapa"
                    value={etapaFiltro}
                    onChange={(e) => setEtapaFiltro(e.target.value)}
                    options={[
                      { value: '', label: 'Todas' },
                      ...ETAPAS.map((item) => ({ value: item, label: etapaLabel(item) })),
                    ]}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => invalidateDocs()}
                  loading={saving}
                >
                  Atualizar
                </Button>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-2 max-h-[65vh] overflow-auto pr-1">
                {itens.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-tertiary)] p-3">Nenhum documento.</p>
                ) : (
                  itens.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      className={`w-full text-left rounded-lg border p-3 transition ${selectedId === doc.id ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]' : 'border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:border-[var(--color-primary-200)]'}`}
                      onClick={() => setSelectedId(doc.id)}
                    >
                      <div className="font-medium text-sm text-[var(--color-text-primary)]">
                        {doc.codigo} — {doc.titulo}
                      </div>
                      <div className="text-xs text-[var(--color-text-tertiary)] mt-1">
                        {categoriaLabel(doc.categoria)} · v{doc.versao_atual}
                      </div>
                      {Array.isArray(doc.etapas) && doc.etapas.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {doc.etapas.map((e) => (
                            <span
                              key={e}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-gray-100)] text-[var(--color-text-tertiary)]"
                            >
                              {etapaLabel(e)}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>

              <Card className="lg:col-span-2">
                {!detalhe ? (
                  <p className="text-sm text-[var(--color-text-tertiary)]">
                    Selecione um documento.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                          {detalhe.documento.codigo} — {detalhe.documento.titulo}
                        </h3>
                        {isAdmin && !editandoMeta && (
                          <Button size="xs" variant="ghost" onClick={() => setEditandoMeta(true)}>
                            Editar
                          </Button>
                        )}
                      </div>
                      {editandoMeta ? (
                        <div className="mt-2 space-y-2 p-3 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]">
                          <Input
                            label="Título"
                            value={editMeta.titulo}
                            onChange={(e) => setEditMeta((p) => ({ ...p, titulo: e.target.value }))}
                          />
                          <Input
                            label="Descrição"
                            value={editMeta.descricao}
                            onChange={(e) =>
                              setEditMeta((p) => ({ ...p, descricao: e.target.value }))
                            }
                          />
                          <Select
                            label="Status"
                            value={editMeta.status}
                            onChange={(e) =>
                              setEditMeta((p) => ({
                                ...p,
                                status: e.target.value as 'ATIVO' | 'INATIVO',
                              }))
                            }
                            options={[
                              { value: 'ATIVO', label: 'Ativo' },
                              { value: 'INATIVO', label: 'Inativo' },
                            ]}
                          />
                          <div>
                            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                              Etapas
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {ETAPAS.map((etapa) => (
                                <button
                                  key={etapa}
                                  type="button"
                                  onClick={() => toggleMetaEtapa(etapa)}
                                  className={`px-2.5 py-1 rounded-full border text-xs ${editMeta.etapas.includes(etapa) ? 'bg-[var(--color-primary-100)] border-[var(--color-primary-500)] text-[var(--color-primary-700)]' : 'bg-[var(--color-bg-primary)] border-[var(--color-border-primary)] text-[var(--color-text-secondary)]'}`}
                                >
                                  {etapaLabel(etapa)}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="xs"
                              onClick={() => void handleSalvarMeta()}
                              loading={saving}
                            >
                              Salvar
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => setEditandoMeta(false)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                          {categoriaLabel(detalhe.documento.categoria)} · Etapas:{' '}
                          {detalhe.etapas.map(etapaLabel).join(', ') || '—'}
                          {detalhe.documento.status === 'INATIVO' && (
                            <span className="ml-2 text-orange-500 font-medium">Inativo</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 border-b bg-[var(--color-bg-secondary)]">
                        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                          v{detalhe.versaoAtual?.versao ?? '-'}
                        </span>
                        <span className="text-xs text-[var(--color-text-tertiary)]">
                          {detalhe.versaoAtual?.publicado_por_nome ?? '-'} ·{' '}
                          {detalhe.versaoAtual?.publicado_em
                            ? new Date(detalhe.versaoAtual.publicado_em).toLocaleDateString('pt-BR')
                            : '-'}
                        </span>
                      </div>
                      <div className="p-3">
                        <Suspense fallback={<MarkdownFallback label="Carregando..." />}>
                          <MarkdownViewer content={detalhe.versaoAtual?.conteudo ?? ''} />
                        </Suspense>
                      </div>
                    </div>

                    {detalhe.versoes.length > 1 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-[var(--color-primary-600)] text-xs font-medium">
                          Histórico ({detalhe.versoes.length} versões)
                        </summary>
                        <div className="mt-2 space-y-1">
                          {detalhe.versoes.map((v) => (
                            <div
                              key={v.id}
                              className="text-xs text-[var(--color-text-secondary)] border border-[var(--color-border-primary)] rounded px-2 py-1"
                            >
                              v{v.versao} — {v.resumo_alteracao} ({v.publicado_por_nome},{' '}
                              {new Date(v.publicado_em).toLocaleDateString('pt-BR')})
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {isAdmin ? (
                      <div className="pt-3 border-t space-y-2">
                        <Input
                          label="Resumo da Alteração"
                          value={novaVersao.resumoAlteracao}
                          onChange={(e) =>
                            setNovaVersao((prev) => ({ ...prev, resumoAlteracao: e.target.value }))
                          }
                        />
                        <Suspense fallback={<MarkdownFallback label="Carregando..." />}>
                          <MarkdownEditor
                            label="Conteúdo (Markdown)"
                            value={novaVersao.conteudo}
                            onChange={(v) => setNovaVersao((prev) => ({ ...prev, conteudo: v }))}
                            minHeight="200px"
                          />
                        </Suspense>
                        <Button
                          size="sm"
                          onClick={() => void handlePublicarNovaVersao()}
                          loading={saving}
                        >
                          Publicar versão
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </Card>
            </div>

            {isAdmin ? (
              <details className="bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border-primary)] shadow-sm">
                <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-[var(--color-text-primary)]">
                  Novo Documento
                </summary>
                <div className="px-5 pb-5 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      label="Código"
                      value={novoDoc.codigo}
                      onChange={(e) => setNovoDoc((p) => ({ ...p, codigo: e.target.value }))}
                    />
                    <Input
                      label="Título"
                      value={novoDoc.titulo}
                      onChange={(e) => setNovoDoc((p) => ({ ...p, titulo: e.target.value }))}
                    />
                    <Select
                      label="Categoria"
                      value={novoDoc.categoria}
                      onChange={(e) =>
                        setNovoDoc((p) => ({ ...p, categoria: e.target.value as KBCategoria }))
                      }
                      options={CATEGORIAS.map((item) => ({
                        value: item,
                        label: categoriaLabel(item),
                      }))}
                    />
                  </div>
                  <Input
                    label="Descrição"
                    value={novoDoc.descricao}
                    onChange={(e) => setNovoDoc((p) => ({ ...p, descricao: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    {ETAPAS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleEtapa(item)}
                        className={`px-3 py-1 rounded-full border text-xs ${novoDoc.etapas.includes(item) ? 'bg-[var(--color-primary-100)] border-[var(--color-primary-500)] text-[var(--color-primary-700)]' : 'bg-[var(--color-bg-primary)] border-[var(--color-border-primary)] text-[var(--color-text-secondary)]'}`}
                      >
                        {etapaLabel(item)}
                      </button>
                    ))}
                  </div>
                  <Suspense fallback={<MarkdownFallback label="Carregando..." />}>
                    <MarkdownEditor
                      label="Conteúdo Inicial (Markdown)"
                      value={novoDoc.conteudo}
                      onChange={(v) => setNovoDoc((p) => ({ ...p, conteudo: v }))}
                      placeholder="# Título&#10;&#10;Escreva o conteúdo em Markdown..."
                      minHeight="200px"
                    />
                  </Suspense>
                  <Button size="sm" onClick={() => void handleCriarDocumento()} loading={saving}>
                    Criar Documento
                  </Button>
                </div>
              </details>
            ) : null}
          </>
        )}

        {/* Tab: Glossário (dinâmico) */}
        {activeTab === 'glossario' && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Glossário</h2>
              <span className="text-xs text-[var(--color-text-tertiary)]">
                {glossarioItens.length} termos
              </span>
            </div>
            <div className="mb-4">
              <Input
                placeholder="Buscar termo ou definição..."
                value={buscaGlossario}
                onChange={(e) => setBuscaGlossario(e.target.value)}
              />
            </div>

            {glossarioQuery.isLoading ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">Carregando...</p>
            ) : (
              <>
                <div className="divide-y divide-[var(--color-border-primary)]">
                  {glossarioFiltrado.map((item) => (
                    <div key={item.id} className="py-3 group">
                      {editandoTermoId === item.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editTermo.termo}
                            onChange={(e) => setEditTermo((p) => ({ ...p, termo: e.target.value }))}
                            placeholder="Termo"
                          />
                          <textarea
                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            rows={2}
                            aria-label="Definição do termo"
                            value={editTermo.definicao}
                            onChange={(e) =>
                              setEditTermo((p) => ({ ...p, definicao: e.target.value }))
                            }
                          />
                          <div className="flex gap-2">
                            <Button size="xs" onClick={() => void handleSalvarTermo(item)}>
                              Salvar
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => setEditandoTermoId(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between">
                          <dl className="m-0">
                            <dt className="text-sm font-semibold text-[var(--color-text-primary)]">
                              {item.termo}
                            </dt>
                            <dd className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                              {item.definicao}
                            </dd>
                          </dl>
                          {isAdmin && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-3">
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => {
                                  setEditandoTermoId(item.id);
                                  setEditTermo({ termo: item.termo, definicao: item.definicao });
                                }}
                              >
                                Editar
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => void handleExcluirTermo(item.id)}
                              >
                                Excluir
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {glossarioFiltrado.length === 0 && (
                    <p className="text-sm text-[var(--color-text-tertiary)] py-4">
                      {buscaGlossario.trim() ? 'Nenhum termo.' : 'Nenhum termo.'}
                    </p>
                  )}
                </div>

                {isAdmin && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <h3 className="text-sm font-medium text-[var(--color-text-secondary)]">
                      Adicionar Termo
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input
                        value={novoTermo.termo}
                        onChange={(e) => setNovoTermo((p) => ({ ...p, termo: e.target.value }))}
                        placeholder="Termo"
                      />
                      <Input
                        value={novoTermo.definicao}
                        onChange={(e) => setNovoTermo((p) => ({ ...p, definicao: e.target.value }))}
                        placeholder="Definição"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void handleCriarTermo()}
                      loading={criarGlossario.isPending}
                    >
                      Adicionar
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        )}

        {/* Tab: Leis e Normas (dinâmico) */}
        {activeTab === 'leis' && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Leis e Normas
              </h2>
              <span className="text-xs text-[var(--color-text-tertiary)]">
                {leisItens.length} itens
              </span>
            </div>
            <div className="mb-4">
              <Input
                placeholder="Buscar lei, norma ou referência..."
                value={buscaLeis}
                onChange={(e) => setBuscaLeis(e.target.value)}
              />
            </div>

            {leisQuery.isLoading ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">Carregando...</p>
            ) : (
              <>
                <div className="space-y-3">
                  {leisFiltradas.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] group"
                    >
                      {editandoLeiId === item.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editLei.nome}
                            onChange={(e) => setEditLei((p) => ({ ...p, nome: e.target.value }))}
                            placeholder="Nome"
                          />
                          <textarea
                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            rows={2}
                            aria-label="Descrição da lei"
                            value={editLei.descricao}
                            onChange={(e) =>
                              setEditLei((p) => ({ ...p, descricao: e.target.value }))
                            }
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              value={editLei.referencia}
                              onChange={(e) =>
                                setEditLei((p) => ({ ...p, referencia: e.target.value }))
                              }
                              placeholder="Referência"
                            />
                            <Input
                              value={editLei.url}
                              onChange={(e) => setEditLei((p) => ({ ...p, url: e.target.value }))}
                              placeholder="URL (opcional)"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="xs" onClick={() => void handleSalvarLei(item)}>
                              Salvar
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => setEditandoLeiId(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                              {item.url ? (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-[var(--color-primary-600)] hover:underline"
                                >
                                  {item.nome}
                                </a>
                              ) : (
                                item.nome
                              )}
                            </h3>
                            <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                              {item.descricao}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.referencia && (
                              <span className="text-xs text-[var(--color-primary-700)] bg-[var(--color-primary-50)] px-2 py-0.5 rounded">
                                {item.referencia}
                              </span>
                            )}
                            {isAdmin && (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditandoLeiId(item.id);
                                    setEditLei({
                                      nome: item.nome,
                                      descricao: item.descricao,
                                      referencia: item.referencia,
                                      url: item.url ?? '',
                                    });
                                  }}
                                >
                                  Editar
                                </Button>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => void handleExcluirLei(item.id)}
                                >
                                  Excluir
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {leisFiltradas.length === 0 && (
                    <p className="text-sm text-[var(--color-text-tertiary)]">
                      {buscaLeis.trim()
                        ? 'Nenhuma lei/norma encontrada.'
                        : 'Nenhuma lei/norma cadastrada.'}
                    </p>
                  )}
                </div>

                {isAdmin && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <h3 className="text-sm font-medium text-[var(--color-text-secondary)]">
                      Adicionar Lei/Norma
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input
                        value={novaLei.nome}
                        onChange={(e) => setNovaLei((p) => ({ ...p, nome: e.target.value }))}
                        placeholder="Nome (ex: Lei nº 8.159/1991)"
                      />
                      <Input
                        value={novaLei.referencia}
                        onChange={(e) => setNovaLei((p) => ({ ...p, referencia: e.target.value }))}
                        placeholder="Referência (ex: CONARQ)"
                      />
                    </div>
                    <textarea
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={2}
                      value={novaLei.descricao}
                      onChange={(e) => setNovaLei((p) => ({ ...p, descricao: e.target.value }))}
                      placeholder="Descrição"
                    />
                    <Input
                      value={novaLei.url}
                      onChange={(e) => setNovaLei((p) => ({ ...p, url: e.target.value }))}
                      placeholder="URL do texto legal (opcional)"
                    />
                    <Button
                      size="sm"
                      onClick={() => void handleCriarLei()}
                      loading={criarLei.isPending}
                    >
                      Adicionar
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        )}
      </div>
    </PageState>
  );
}
