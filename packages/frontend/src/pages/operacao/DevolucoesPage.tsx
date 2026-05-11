import { useState, useCallback, useEffect, useRef } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Pagination } from '../../components/ui/Pagination';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageState } from '../../components/ui/PageState';
import { useToastHelpers } from '../../components/ui/Toast';
import { buildApiUrl } from '../../services/api';
import { getToken } from '../../services/tokenStorage';
import { useDebounce } from '../../hooks/useDebounce';
import {
  useDevolucoes,
  useDevolucaoDetalhe,
  useCriarDevolucao,
  useCoordenadestinoOpcoes,
  useOrgaosRecebimento,
  useBuscarRecebimentoProcessos,
  type DevolucaoOperacional,
  type RecebimentoProcessoBusca,
} from '../../hooks/useQueries';

interface ItemRascunho {
  tempId: string;
  repositorio: string;
  orgao: string;
  protocolo: string;
  interessado: string;
  volume: string;
  obs: string;
  recebimentoProcessoId?: string;
}

function gerarTempId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatarData(isoDate: string): string {
  const parts = isoDate.split('T')[0]?.split('-');
  if (!parts || parts.length < 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ─── Combobox de Coordenadoria (texto livre + sugestões) ─────

interface CoordComboboxProps {
  value: string;
  onChange: (value: string) => void;
  opcoes: string[];
  required?: boolean;
}

function CoordCombobox({ value, onChange, opcoes, required }: CoordComboboxProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? opcoes.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : opcoes;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Coordenadoria Destino{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        placeholder="Digite ou selecione a coordenadoria…"
        value={open ? query : value}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery(value);
          setOpen(true);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors ${
                opt === value ? 'bg-blue-50 text-blue-700 font-medium' : ''
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setQuery('');
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal Nova Devolução ─────────────────────────────────────

interface ModalDevolucaoProps {
  onClose: () => void;
  onSaved: () => void;
}

function ModalNovaDevolucao({ onClose, onSaved }: ModalDevolucaoProps): JSX.Element {
  const toast = useToastHelpers();
  const coordOpcoes = useCoordenadestinoOpcoes();
  const orgaosQuery = useOrgaosRecebimento();
  const criarMut = useCriarDevolucao();
  const buscarProcessosMut = useBuscarRecebimentoProcessos();

  const [dataDevolucao, setDataDevolucao] = useState(new Date().toISOString().split('T')[0]);
  const [coordenadoriaDestino, setCoordenadoriaDestino] = useState('');
  const [responsavelRetirada, setResponsavelRetirada] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [itens, setItens] = useState<ItemRascunho[]>([]);

  // Busca de processos de recebimento
  const [buscaProcesso, setBuscaProcesso] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState<RecebimentoProcessoBusca[]>([]);
  const [mostrarBusca, setMostrarBusca] = useState(false);
  const debouncedBuscaProcesso = useDebounce(buscaProcesso, 350);

  // Item manual
  const [modoItem, setModoItem] = useState<'busca' | 'manual'>('busca');
  const [itemManual, setItemManual] = useState<Omit<ItemRascunho, 'tempId'>>({
    repositorio: '',
    orgao: '',
    protocolo: '',
    interessado: '',
    volume: '',
    obs: '',
  });

  const opcoesCoordenadorias = coordOpcoes.data ?? [];
  const orgaosOptions = orgaosQuery.data ?? [];

  // Destructure mutateAsync so the callback only depends on the stable function
  // reference, not the entire mutation object (which changes on every state update
  // and would re-trigger the useEffect in a loop).
  const { mutateAsync: executarBusca } = buscarProcessosMut;

  const buscarProcessos = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResultadosBusca([]);
        setMostrarBusca(false);
        return;
      }
      try {
        const res = await executarBusca(q.trim());
        setResultadosBusca(res.itens ?? []);
        setMostrarBusca(true);
      } catch {
        setResultadosBusca([]);
        setMostrarBusca(false);
      }
    },
    [executarBusca]
  );

  // Live search: auto-dispara quando o debounced query muda
  useEffect(() => {
    void buscarProcessos(debouncedBuscaProcesso);
  }, [debouncedBuscaProcesso, buscarProcessos]);

  const adicionarDoRecebimento = (proc: RecebimentoProcessoBusca) => {
    const jaAdicionado = itens.some((i) => i.recebimentoProcessoId === proc.id);
    if (jaAdicionado) {
      toast.warning('Processo já adicionado à devolução');
      return;
    }
    setItens((prev) => [
      ...prev,
      {
        tempId: gerarTempId(),
        repositorio: proc.repositorio,
        orgao: proc.orgao,
        protocolo: proc.protocolo,
        interessado: proc.interessado,
        volume: proc.volume,
        obs: '',
        recebimentoProcessoId: proc.id,
      },
    ]);
    setBuscaProcesso('');
    setResultadosBusca([]);
    setMostrarBusca(false);
  };

  const adicionarManual = () => {
    if (!itemManual.protocolo.trim() && !itemManual.repositorio.trim()) {
      toast.error('Informe ao menos o Protocolo ou o Repositório');
      return;
    }
    setItens((prev) => [...prev, { ...itemManual, tempId: gerarTempId() }]);
    setItemManual({
      repositorio: '',
      orgao: '',
      protocolo: '',
      interessado: '',
      volume: '',
      obs: '',
    });
  };

  const removerItem = (tempId: string) => {
    setItens((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  const handleSalvar = async () => {
    if (!dataDevolucao) {
      toast.error('Data é obrigatória');
      return;
    }
    if (!coordenadoriaDestino.trim()) {
      toast.error('Coordenadoria destino é obrigatória');
      return;
    }
    if (!responsavelRetirada.trim()) {
      toast.error('Responsável pela retirada é obrigatório');
      return;
    }
    if (itens.length === 0) {
      toast.error('Adicione ao menos um item');
      return;
    }

    try {
      await criarMut.mutateAsync({
        dataDevolucao,
        coordenadoriaDestino: coordenadoriaDestino.trim(),
        responsavelRetirada: responsavelRetirada.trim(),
        observacoes: observacoes.trim() || undefined,
        itens: itens.map(({ tempId: _t, ...rest }) => ({
          repositorio: rest.repositorio || undefined,
          orgao: rest.orgao || undefined,
          protocolo: rest.protocolo || undefined,
          interessado: rest.interessado || undefined,
          volume: rest.volume || undefined,
          obs: rest.obs || undefined,
          recebimentoProcessoId: rest.recebimentoProcessoId,
        })),
      });
      toast.success('Devolução registrada com sucesso!');
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao registrar devolução';
      toast.error(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Nova Devolução Operacional</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Dados do cabeçalho */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Data da Devolução"
              type="date"
              value={dataDevolucao}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setDataDevolucao(e.target.value)}
              required
            />
            <CoordCombobox
              value={coordenadoriaDestino}
              onChange={setCoordenadoriaDestino}
              opcoes={opcoesCoordenadorias}
              required
            />
            <Input
              label="Responsável pela Retirada"
              value={responsavelRetirada}
              onChange={(e) => setResponsavelRetirada(e.target.value)}
              placeholder="Nome de quem retirou os documentos"
              required
            />
            <Input
              label="Observações"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          {/* Seção de itens */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-800">Itens da Devolução</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModoItem('busca')}
                  className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                    modoItem === 'busca'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-600 hover:border-blue-400'
                  }`}
                >
                  Buscar no Recebimento
                </button>
                <button
                  type="button"
                  onClick={() => setModoItem('manual')}
                  className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                    modoItem === 'manual'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-600 hover:border-blue-400'
                  }`}
                >
                  Adicionar Manualmente
                </button>
              </div>
            </div>

            {/* Busca no recebimento */}
            {modoItem === 'busca' && (
              <div className="border rounded-lg p-4 bg-blue-50 space-y-3">
                <div className="relative">
                  <Input
                    placeholder="Buscar por protocolo, interessado, repositório ou unidade…"
                    value={buscaProcesso}
                    onChange={(e) => setBuscaProcesso(e.target.value)}
                  />
                  {buscarProcessosMut.isPending && (
                    <span className="absolute right-3 top-3 text-xs text-blue-500 animate-pulse">
                      Buscando…
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Digite ao menos 2 caracteres para buscar automaticamente.
                </p>
                {mostrarBusca && (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {resultadosBusca.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-2">Nenhum resultado</p>
                    ) : (
                      resultadosBusca.map((proc) => (
                        <button
                          key={proc.id}
                          type="button"
                          onClick={() => adicionarDoRecebimento(proc)}
                          className="w-full text-left px-3 py-2 bg-white rounded border hover:border-blue-400 hover:bg-blue-50 text-sm transition-colors"
                        >
                          <span className="font-medium">{proc.protocolo}</span>
                          {' — '}
                          <span className="text-gray-600">{proc.interessado}</span>
                          {proc.orgao && (
                            <span className="ml-2 text-xs text-gray-500">{proc.orgao}</span>
                          )}
                          {proc.repositorio && (
                            <span className="ml-2 text-xs text-gray-400">[{proc.repositorio}]</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Adição manual */}
            {modoItem === 'manual' && (
              <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Repositório"
                    value={itemManual.repositorio}
                    onChange={(e) => setItemManual((p) => ({ ...p, repositorio: e.target.value }))}
                    placeholder="Ex: 000016/2025"
                  />
                  <div>
                    <Input
                      label="Unidade / Órgão"
                      value={itemManual.orgao}
                      onChange={(e) => setItemManual((p) => ({ ...p, orgao: e.target.value }))}
                      placeholder="Selecione ou digite a unidade"
                      list="devol-orgaos-list"
                    />
                    <datalist id="devol-orgaos-list">
                      {orgaosOptions.map((o) => (
                        <option key={o.id} value={o.nome} />
                      ))}
                    </datalist>
                  </div>
                  <Input
                    label="Protocolo"
                    value={itemManual.protocolo}
                    onChange={(e) => setItemManual((p) => ({ ...p, protocolo: e.target.value }))}
                    placeholder="Ex: 502824/2021"
                  />
                  <Input
                    label="Interessado"
                    value={itemManual.interessado}
                    onChange={(e) => setItemManual((p) => ({ ...p, interessado: e.target.value }))}
                    placeholder="Nome do interessado"
                  />
                  <Input
                    label="Volume"
                    value={itemManual.volume}
                    onChange={(e) => setItemManual((p) => ({ ...p, volume: e.target.value }))}
                    placeholder="Ex: 1 de 3"
                  />
                  <Input
                    label="Observações"
                    value={itemManual.obs}
                    onChange={(e) => setItemManual((p) => ({ ...p, obs: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={adicionarManual}>
                  + Adicionar Item
                </Button>
              </div>
            )}

            {/* Lista de itens adicionados */}
            {itens.length > 0 && (
              <div className="mt-3 border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">#</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Protocolo</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Interessado</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Unidade</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Repositório</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">Vol.</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item, idx) => (
                      <tr key={item.tempId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-2">{item.protocolo || '—'}</td>
                        <td className="px-3 py-2 truncate max-w-[140px]">
                          {item.interessado || '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500 truncate max-w-[100px]">
                          {item.orgao || '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{item.repositorio || '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{item.volume || '—'}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removerItem(item.tempId)}
                            className="text-red-400 hover:text-red-600 text-xs"
                          >
                            remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <Button variant="outline" onClick={onClose} disabled={criarMut.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSalvar()}
            disabled={criarMut.isPending || itens.length === 0}
            title={itens.length === 0 ? 'Adicione ao menos um item' : undefined}
          >
            {criarMut.isPending
              ? 'Salvando…'
              : `Registrar Devolução (${itens.length} iten${itens.length !== 1 ? 's' : ''})`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Detalhe de Devolução (lista de itens inline) ─────────────

interface DetalheDevolucaoProps {
  devolucaoId: string;
  onClose: () => void;
}

function PainelDetalheDevolucao({ devolucaoId, onClose }: DetalheDevolucaoProps): JSX.Element {
  const detalheQuery = useDevolucaoDetalhe(devolucaoId);
  const toast = useToastHelpers();
  const [baixandoPdf, setBaixandoPdf] = useState(false);

  const handleDownloadPdf = async () => {
    try {
      setBaixandoPdf(true);
      const token = getToken();
      const response = await fetch(buildApiUrl(`/operacional/devolucoes/${devolucaoId}/pdf`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Erro ao gerar PDF');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `termo_devolucao_${devolucaoId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Não foi possível baixar o PDF');
    } finally {
      setBaixandoPdf(false);
    }
  };

  if (detalheQuery.isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl p-8 text-gray-600">Carregando…</div>
      </div>
    );
  }

  const { devolucao, itens } = detalheQuery.data ?? { devolucao: null, itens: [] };
  if (!devolucao) return <></>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Devolução — {devolucao.coordenadoria_destino}
            </h2>
            <p className="text-sm text-gray-500">
              {formatarData(devolucao.data_devolucao)} · {devolucao.responsavel_retirada}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">
          {devolucao.observacoes && (
            <p className="text-sm text-gray-600 mb-4 italic">{devolucao.observacoes}</p>
          )}
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">#</th>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">Protocolo</th>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">Interessado</th>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">Repositório</th>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">Vol.</th>
                <th className="text-left px-3 py-2 text-gray-600 font-medium">Obs.</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, idx) => (
                <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                  <td className="px-3 py-2">{item.protocolo || '—'}</td>
                  <td className="px-3 py-2 truncate max-w-[140px]">{item.interessado || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{item.repositorio || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{item.volume || '—'}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs">{item.obs || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center gap-3 p-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleDownloadPdf()}
            disabled={baixandoPdf}
          >
            {baixandoPdf ? 'Gerando PDF…' : 'Baixar PDF'}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────

export function DevolucoesPage(): JSX.Element {
  const toast = useToastHelpers();

  const [busca, setBusca] = useState('');
  const [coordenadoriaFiltro, setCoordenadoriaFiltro] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [pagina, setPagina] = useState(1);

  const [modalAberto, setModalAberto] = useState(false);
  const [devolucaoDetalhId, setDevolucaoDetalhId] = useState<string | null>(null);

  const debouncedBusca = useDebounce(busca, 400);

  // Auto-reset pagina quando filtros mudam
  useEffect(() => {
    setPagina(1);
  }, [debouncedBusca, coordenadoriaFiltro, dataInicio, dataFim]);

  const devolucoesQuery = useDevolucoes({
    q: debouncedBusca || undefined,
    coordenadoria: coordenadoriaFiltro || undefined,
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    pagina,
    limite: 20,
  });

  const { devolucoes = [], totalPaginas = 1 } = devolucoesQuery.data ?? {};

  const handleDownloadPdf = useCallback(
    async (id: string) => {
      try {
        const token = getToken();
        const response = await fetch(buildApiUrl(`/operacional/devolucoes/${id}/pdf`), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error('Erro ao gerar PDF');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `termo_devolucao_${id.slice(0, 8)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        toast.error('Não foi possível baixar o PDF');
      }
    },
    [toast]
  );

  const handleLimparFiltros = () => {
    setBusca('');
    setCoordenadoriaFiltro('');
    setDataInicio('');
    setDataFim('');
    setPagina(1);
  };

  return (
    <PageState>
      <div className="space-y-6">
        <PageHeader
          title="Devoluções Operacionais"
          subtitle="Registro de processos e documentos devolvidos a coordenadorias"
          actions={
            <Button variant="primary" onClick={() => setModalAberto(true)}>
              + Nova Devolução
            </Button>
          }
        />

        {/* Filtros */}
        <Card padding="sm">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <Input
                label="Busca"
                placeholder="Protocolo, repositório ou interessado…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="min-w-[180px]">
              <Input
                label="Coordenadoria"
                placeholder="Filtrar por coordenadoria…"
                value={coordenadoriaFiltro}
                onChange={(e) => setCoordenadoriaFiltro(e.target.value)}
              />
            </div>
            <div>
              <Input
                label="Data início"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div>
              <Input
                label="Data fim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            {(busca || coordenadoriaFiltro || dataInicio || dataFim) && (
              <Button type="button" variant="ghost" size="md" onClick={handleLimparFiltros}>
                Limpar
              </Button>
            )}
          </div>
        </Card>

        {/* Tabela */}
        <Card padding="none">
          {devolucoesQuery.isLoading ? (
            <div className="p-12 text-center text-gray-500">Carregando…</div>
          ) : devolucoes.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p className="text-lg font-medium">Nenhuma devolução encontrada</p>
              <p className="text-sm mt-1">
                Registre a primeira clicando em &quot;Nova Devolução&quot;
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Data</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Coordenadoria</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Responsável</th>
                    <th className="text-center px-4 py-3 text-gray-600 font-medium">Itens</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Observações</th>
                    <th className="text-right px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {devolucoes.map((dev: DevolucaoOperacional, idx: number) => (
                    <tr
                      key={dev.id}
                      className={`border-b last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatarData(dev.data_devolucao)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-blue-700">
                          {dev.coordenadoria_destino}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{dev.responsavel_retirada}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-800 font-semibold text-xs">
                          {dev.total_itens}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate">
                        {dev.observacoes || '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setDevolucaoDetalhId(dev.id)}
                          >
                            Ver itens
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => void handleDownloadPdf(dev.id)}
                          >
                            PDF
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="px-4 border-t bg-gray-50">
              <Pagination
                pagina={pagina}
                totalPaginas={totalPaginas}
                onChange={setPagina}
                disabled={devolucoesQuery.isLoading}
              />
            </div>
          )}
        </Card>
      </div>

      {/* Modais */}
      {modalAberto && (
        <ModalNovaDevolucao
          onClose={() => setModalAberto(false)}
          onSaved={() => void devolucoesQuery.refetch()}
        />
      )}
      {devolucaoDetalhId && (
        <PainelDetalheDevolucao
          devolucaoId={devolucaoDetalhId}
          onClose={() => setDevolucaoDetalhId(null)}
        />
      )}
    </PageState>
  );
}
