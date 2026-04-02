import { useEffect, useMemo, useState } from 'react';
import type { EtapaFluxo } from '@recorda/shared';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageState, ActionFeedback } from '../../components/ui/PageState';
import { MarkdownEditor, MarkdownViewer } from '../../components/ui/MarkdownEditor';
import { useAuth } from '../../contexts/AuthContext';
import {
  useConhecimentoDocs,
  useConhecimentoDetalhe,
  useCriarDocConhecimento,
  useCriarVersaoConhecimento,
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

type KBTab = 'documentos' | 'glossario' | 'leis';

export function ConhecimentoOperacionalPage(): JSX.Element {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'administrador';

  const queryClient = useQueryClient();
  const criarDoc = useCriarDocConhecimento();
  const criarVersao = useCriarVersaoConhecimento();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  const [activeTab, setActiveTab] = useState<KBTab>('documentos');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [etapaFiltro, setEtapaFiltro] = useState('');
  const [selectedId, setSelectedId] = useState('');

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
  const docsQuery = useConhecimentoDocs({ busca, categoria, etapa: etapaFiltro });
  const itens = docsQuery.data?.itens ?? [];
  const loading = docsQuery.isLoading;
  const error = docsQuery.error
    ? {
        message: 'Erro ao Carregar Base de Conhecimento Operacional',
        details: docsQuery.error instanceof Error ? docsQuery.error.message : 'Falha desconhecida',
      }
    : null;

  const detalheQuery = useConhecimentoDetalhe(selectedId || null);
  const detalhe = detalheQuery.data ?? null;

  // React Query — Glossário
  const glossarioQuery = useGlossario();
  const glossarioItens = glossarioQuery.data?.itens ?? [];
  const criarGlossario = useCriarGlossario();
  const atualizarGlossario = useAtualizarGlossario();
  const excluirGlossario = useExcluirGlossario();
  const [novoTermo, setNovoTermo] = useState({ termo: '', definicao: '' });
  const [editandoTermoId, setEditandoTermoId] = useState<string | null>(null);
  const [editTermo, setEditTermo] = useState({ termo: '', definicao: '' });

  // React Query — Leis e Normas
  const leisQuery = useLeisNormas();
  const leisItens = leisQuery.data?.itens ?? [];
  const criarLei = useCriarLeiNorma();
  const atualizarLei = useAtualizarLeiNorma();
  const excluirLei = useExcluirLeiNorma();
  const [novaLei, setNovaLei] = useState({ nome: '', descricao: '', referencia: '', url: '' });
  const [editandoLeiId, setEditandoLeiId] = useState<string | null>(null);
  const [editLei, setEditLei] = useState({ nome: '', descricao: '', referencia: '', url: '' });

  // Auto-select first item
  useEffect(() => {
    if (itens.length > 0 && !selectedId) {
      setSelectedId(itens[0]!.id);
    }
  }, [itens, selectedId]);

  // Sync novaVersao when detalhe changes
  useEffect(() => {
    if (detalhe?.versaoAtual) {
      setNovaVersao({ conteudo: detalhe.versaoAtual.conteudo ?? '', resumoAlteracao: '' });
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

  const handleCriarDocumento = async (): Promise<void> => {
    if (!isAdmin) return;
    if (!novoDoc.codigo || !novoDoc.titulo || !novoDoc.conteudo) {
      setMessage({
        tipo: 'error',
        texto: 'Preencha Código, Título e Conteúdo para criar o Documento.',
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
      setMessage({ tipo: 'error', texto: 'Conteúdo da nova Versão é obrigatório.' });
      return;
    }
    try {
      setSaving(true);
      await criarVersao.mutateAsync({ docId: selectedId, ...novaVersao });
      setMessage({ tipo: 'success', texto: 'Nova Versão publicada.' });
      invalidateDetalhe();
    } catch (err) {
      setMessage({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'Erro ao publicar Versão',
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
      loadingMessage="Carregando Base de Conhecimento..."
      error={activeTab === 'documentos' ? errorWithAction : null}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conhecimento Operacional</h1>
          <p className="text-gray-500 mt-1">Referência operacional, glossário e legislação.</p>
        </div>

        {message ? (
          <ActionFeedback
            type={message.tipo}
            title=""
            message={message.texto}
            onDismiss={() => setMessage(null)}
          />
        ) : null}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}
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
                    label="Buscar (título, descrição ou conteúdo)"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Busca full-text em português..."
                  />
                </div>
                <div className="w-48">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                  <select
                    className="w-full h-9 px-3 border rounded-lg text-sm"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {CATEGORIAS.map((item) => (
                      <option key={item} value={item}>
                        {categoriaLabel(item)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-48">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Etapa</label>
                  <select
                    className="w-full h-9 px-3 border rounded-lg text-sm"
                    value={etapaFiltro}
                    onChange={(e) => setEtapaFiltro(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {ETAPAS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
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
                  <p className="text-sm text-gray-500 p-3">Nenhum documento encontrado.</p>
                ) : (
                  itens.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      className={`w-full text-left rounded-lg border p-3 transition ${selectedId === doc.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-200'}`}
                      onClick={() => setSelectedId(doc.id)}
                    >
                      <div className="font-medium text-sm text-gray-900">
                        {doc.codigo} — {doc.titulo}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {categoriaLabel(doc.categoria)} · v{doc.versao_atual}
                      </div>
                      {Array.isArray(doc.etapas) && doc.etapas.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {doc.etapas.map((e) => (
                            <span
                              key={e}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500"
                            >
                              {e}
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
                  <p className="text-sm text-gray-500">Selecione um documento.</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        {detalhe.documento.codigo} — {detalhe.documento.titulo}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {categoriaLabel(detalhe.documento.categoria)} · Etapas:{' '}
                        {detalhe.etapas.join(', ') || '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-gray-50 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
                        <span className="text-xs font-medium text-gray-600">
                          v{detalhe.versaoAtual?.versao ?? '-'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {detalhe.versaoAtual?.publicado_por_nome ?? '-'} ·{' '}
                          {detalhe.versaoAtual?.publicado_em
                            ? new Date(detalhe.versaoAtual.publicado_em).toLocaleDateString('pt-BR')
                            : '-'}
                        </span>
                      </div>
                      <div className="p-3">
                        <MarkdownViewer content={detalhe.versaoAtual?.conteudo ?? ''} />
                      </div>
                    </div>

                    {detalhe.versoes.length > 1 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-blue-600 text-xs font-medium">
                          Histórico ({detalhe.versoes.length} versões)
                        </summary>
                        <div className="mt-2 space-y-1">
                          {detalhe.versoes.map((v) => (
                            <div
                              key={v.id}
                              className="text-xs text-gray-600 border rounded px-2 py-1"
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
                        <MarkdownEditor
                          label="Conteúdo (Markdown)"
                          value={novaVersao.conteudo}
                          onChange={(v) => setNovaVersao((prev) => ({ ...prev, conteudo: v }))}
                          minHeight="200px"
                        />
                        <Button
                          size="sm"
                          onClick={() => void handlePublicarNovaVersao()}
                          loading={saving}
                        >
                          Publicar Versão
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </Card>
            </div>

            {isAdmin ? (
              <details className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-gray-900">
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Categoria
                      </label>
                      <select
                        className="w-full h-9 px-3 border rounded-lg text-sm"
                        value={novoDoc.categoria}
                        onChange={(e) =>
                          setNovoDoc((p) => ({ ...p, categoria: e.target.value as KBCategoria }))
                        }
                      >
                        {CATEGORIAS.map((item) => (
                          <option key={item} value={item}>
                            {categoriaLabel(item)}
                          </option>
                        ))}
                      </select>
                    </div>
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
                        className={`px-3 py-1 rounded-full border text-xs ${novoDoc.etapas.includes(item) ? 'bg-blue-100 border-blue-500 text-blue-700' : 'bg-white border-gray-300 text-gray-700'}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <MarkdownEditor
                    label="Conteúdo inicial (Markdown)"
                    value={novoDoc.conteudo}
                    onChange={(v) => setNovoDoc((p) => ({ ...p, conteudo: v }))}
                    placeholder="# Título&#10;&#10;Escreva o conteúdo em Markdown..."
                    minHeight="200px"
                  />
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
              <h2 className="text-lg font-semibold text-gray-900">
                Glossário de Gestão Documental
              </h2>
              <span className="text-xs text-gray-400">{glossarioItens.length} termos</span>
            </div>

            {glossarioQuery.isLoading ? (
              <p className="text-sm text-gray-500">Carregando glossário...</p>
            ) : (
              <>
                <div className="divide-y divide-gray-100">
                  {glossarioItens.map((item) => (
                    <div key={item.id} className="py-3 group">
                      {editandoTermoId === item.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editTermo.termo}
                            onChange={(e) => setEditTermo((p) => ({ ...p, termo: e.target.value }))}
                            placeholder="Termo"
                          />
                          <textarea
                            className="w-full p-2 border rounded-lg text-sm"
                            rows={2}
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
                          <div>
                            <dt className="text-sm font-semibold text-gray-900">{item.termo}</dt>
                            <dd className="text-sm text-gray-600 mt-0.5">{item.definicao}</dd>
                          </div>
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
                  {glossarioItens.length === 0 && (
                    <p className="text-sm text-gray-500 py-4">Nenhum termo cadastrado.</p>
                  )}
                </div>

                {isAdmin && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <h3 className="text-sm font-medium text-gray-700">Adicionar Termo</h3>
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
              <h2 className="text-lg font-semibold text-gray-900">
                Legislação e Normas de Gestão Documental
              </h2>
              <span className="text-xs text-gray-400">{leisItens.length} itens</span>
            </div>

            {leisQuery.isLoading ? (
              <p className="text-sm text-gray-500">Carregando leis e normas...</p>
            ) : (
              <>
                <div className="space-y-3">
                  {leisItens.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg border border-gray-100 bg-gray-50 group"
                    >
                      {editandoLeiId === item.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editLei.nome}
                            onChange={(e) => setEditLei((p) => ({ ...p, nome: e.target.value }))}
                            placeholder="Nome"
                          />
                          <textarea
                            className="w-full p-2 border rounded-lg text-sm"
                            rows={2}
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
                            <h3 className="text-sm font-semibold text-gray-900">
                              {item.url ? (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-blue-600 hover:underline"
                                >
                                  {item.nome}
                                </a>
                              ) : (
                                item.nome
                              )}
                            </h3>
                            <p className="text-sm text-gray-600 mt-0.5">{item.descricao}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.referencia && (
                              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
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
                  {leisItens.length === 0 && (
                    <p className="text-sm text-gray-500">Nenhuma lei/norma cadastrada.</p>
                  )}
                </div>

                {isAdmin && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <h3 className="text-sm font-medium text-gray-700">Adicionar Lei/Norma</h3>
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
                      className="w-full p-2 border rounded-lg text-sm"
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
