import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FilterBar } from '../../components/ui/FilterBar';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageState } from '../../components/ui/PageState';
import { Pagination } from '../../components/ui/Pagination';
import { SkeletonTable } from '../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { useToastHelpers } from '../../components/ui/Toast';
import { useDebounce } from '../../hooks/useDebounce';
import {
  type DevolucaoOperacional,
  type RecebimentoProcessoBusca,
  useBuscarRecebimentoProcessos,
  useCoordenadestinoOpcoes,
  useCriarDevolucao,
  useDevolucoes,
  useExcluirDevolucao,
  useOrgaosRecebimento,
  useResponsaveisRetiradaOpcoes,
} from '../../hooks/useQueries';
import { api } from '../../services/api';

const DevolucaoEditModal = lazy(() =>
  import('./DevolucaoEditModal').then((module) => ({ default: module.DevolucaoEditModal }))
);
const DevolucaoDetalhePanel = lazy(() =>
  import('./DevolucaoDetalhePanel').then((module) => ({ default: module.DevolucaoDetalhePanel }))
);

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

function formatarData(value: string | null | undefined): string {
  if (!value) return '—';
  const parts = String(value).split('T')[0]?.split('-');
  if (!parts || parts.length < 3) return String(value);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

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
    ? opcoes.filter((option) => option.toLowerCase().includes(query.toLowerCase()))
    : opcoes;

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative min-w-0">
      <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
        Coordenadoria destino
        {required ? <span className="ml-0.5 text-[var(--color-error-500)]">*</span> : null}
      </label>
      <input
        type="text"
        className="h-11 w-full min-w-0 rounded-lg border border-[var(--color-gray-300)] bg-[var(--color-bg-primary)] px-3.5 text-sm text-[var(--color-text-primary)] transition-colors duration-150 placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-[3px] focus:ring-[var(--color-primary-100)] sm:h-9"
        placeholder="Digite ou selecione a coordenadoria..."
        value={open ? query : value}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery(value);
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && filtered.length > 0 ? (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-lg">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)] ${
                option === value
                  ? 'bg-[var(--color-primary-50)] font-medium text-[var(--color-primary-700)]'
                  : ''
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option);
                setQuery('');
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface ModalDevolucaoProps {
  onClose: () => void;
  onSaved: () => void;
}

function ModalNovaDevolucao({ onClose, onSaved }: ModalDevolucaoProps): JSX.Element {
  const toast = useToastHelpers();
  const coordOpcoes = useCoordenadestinoOpcoes();
  const respOpcoes = useResponsaveisRetiradaOpcoes();
  const orgaosQuery = useOrgaosRecebimento();
  const criarMut = useCriarDevolucao();
  const buscarProcessosMut = useBuscarRecebimentoProcessos();

  const [dataDevolucao, setDataDevolucao] = useState(new Date().toISOString().split('T')[0] ?? '');
  const [coordenadoriaDestino, setCoordenadoriaDestino] = useState('');
  const [responsavelRetirada, setResponsavelRetirada] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [itens, setItens] = useState<ItemRascunho[]>([]);
  const [mostrarPreview, setMostrarPreview] = useState(false);

  const [buscaProcesso, setBuscaProcesso] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState<RecebimentoProcessoBusca[]>([]);
  const [mostrarBusca, setMostrarBusca] = useState(false);
  const [modoItem, setModoItem] = useState<'busca' | 'manual'>('busca');
  const [itemManual, setItemManual] = useState<Omit<ItemRascunho, 'tempId'>>({
    repositorio: '',
    orgao: '',
    protocolo: '',
    interessado: '',
    volume: '',
    obs: '',
  });

  const debouncedBuscaProcesso = useDebounce(buscaProcesso, 600);
  const { mutateAsync: executarBusca } = buscarProcessosMut;

  const opcoesCoordenadorias = coordOpcoes.data ?? [];
  const opcoesResponsaveis = respOpcoes.data ?? [];
  const orgaosOptions = orgaosQuery.data ?? [];

  const buscarProcessos = useCallback(
    async (query: string) => {
      if (query.trim().length < 2) {
        setResultadosBusca([]);
        setMostrarBusca(false);
        return;
      }

      try {
        const response = await executarBusca(query.trim());
        setResultadosBusca(response.itens ?? []);
        setMostrarBusca(true);
      } catch {
        setResultadosBusca([]);
        setMostrarBusca(false);
      }
    },
    [executarBusca]
  );

  useEffect(() => {
    void buscarProcessos(debouncedBuscaProcesso);
  }, [buscarProcessos, debouncedBuscaProcesso]);

  const adicionarDoRecebimento = (processo: RecebimentoProcessoBusca) => {
    const alreadyAdded = itens.some((item) => item.recebimentoProcessoId === processo.id);
    if (alreadyAdded) {
      toast.warning('Processo já adicionado à devolução');
      return;
    }

    setItens((previous) => [
      ...previous,
      {
        tempId: gerarTempId(),
        repositorio: processo.repositorio,
        orgao: processo.orgao,
        protocolo: processo.protocolo,
        interessado: processo.interessado,
        volume: processo.volume,
        obs: '',
        recebimentoProcessoId: processo.id,
      },
    ]);
    setBuscaProcesso('');
    setResultadosBusca([]);
    setMostrarBusca(false);
  };

  const adicionarManual = () => {
    if (!itemManual.protocolo.trim() && !itemManual.repositorio.trim()) {
      toast.error('Informe ao menos o protocolo ou o repositório');
      return;
    }

    setItens((previous) => [...previous, { ...itemManual, tempId: gerarTempId() }]);
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
    setItens((previous) => previous.filter((item) => item.tempId !== tempId));
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
        itens: itens.map((item) => ({
          repositorio: item.repositorio || undefined,
          orgao: item.orgao || undefined,
          protocolo: item.protocolo || undefined,
          interessado: item.interessado || undefined,
          volume: item.volume || undefined,
          obs: item.obs || undefined,
          recebimentoProcessoId: item.recebimentoProcessoId,
        })),
      });
      toast.success('Devolução registrada com sucesso');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar devolução');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova Devolução Operacional"
      subtitle="Preencha os dados e vincule os itens devolvidos."
      size="xl"
      scrollable
      footer={
        <div className="flex flex-col-reverse gap-3 px-5 py-4 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={onClose} disabled={criarMut.isPending} fullWidth>
            Cancelar
          </Button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setMostrarPreview((value) => !value)}
              disabled={criarMut.isPending}
              fullWidth
            >
              {mostrarPreview ? 'Ocultar prévia' : 'Pré-visualizar'}
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleSalvar()}
              disabled={criarMut.isPending || itens.length === 0}
              title={itens.length === 0 ? 'Adicione ao menos um item' : undefined}
              fullWidth
            >
              {criarMut.isPending
                ? 'Salvando...'
                : `Registrar Devolução (${itens.length} item${itens.length !== 1 ? 's' : ''})`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Data da Devolução"
            type="date"
            value={dataDevolucao}
            max={new Date().toISOString().split('T')[0] ?? ''}
            onChange={(event) => setDataDevolucao(event.target.value)}
            required
          />
          <CoordCombobox
            value={coordenadoriaDestino}
            onChange={setCoordenadoriaDestino}
            opcoes={opcoesCoordenadorias}
            required
          />
          <div>
            <Input
              label="Responsável pela Retirada"
              value={responsavelRetirada}
              onChange={(event) => setResponsavelRetirada(event.target.value)}
              placeholder="Nome de quem retirou os documentos"
              required
              list="devol-responsaveis-list"
            />
            <datalist id="devol-responsaveis-list">
              {opcoesResponsaveis.map((responsavel) => (
                <option key={responsavel} value={responsavel} />
              ))}
            </datalist>
          </div>
          <Input
            label="Observações"
            value={observacoes}
            onChange={(event) => setObservacoes(event.target.value)}
            placeholder="Opcional"
          />
        </div>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                Itens da devolução
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Adicione do recebimento ou manualmente.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setModoItem('busca')}
                className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                  modoItem === 'busca'
                    ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-600)] text-white'
                    : 'border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary-400)] hover:text-[var(--color-primary-700)]'
                }`}
              >
                Buscar no recebimento
              </button>
              <button
                type="button"
                onClick={() => setModoItem('manual')}
                className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                  modoItem === 'manual'
                    ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-600)] text-white'
                    : 'border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary-400)] hover:text-[var(--color-primary-700)]'
                }`}
              >
                Adicionar manualmente
              </button>
            </div>
          </div>

          {modoItem === 'busca' ? (
            <div className="space-y-3 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
              <div className="relative">
                <Input
                  placeholder="Buscar por protocolo, interessado, repositório ou unidade..."
                  value={buscaProcesso}
                  onChange={(event) => setBuscaProcesso(event.target.value)}
                />
                {buscarProcessosMut.isPending ? (
                  <span className="absolute right-3 top-3 text-xs text-[var(--color-primary-600)]">
                    Buscando...
                  </span>
                ) : null}
              </div>
              {mostrarBusca ? (
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {resultadosBusca.length === 0 ? (
                    <p className="py-2 text-center text-sm text-[var(--color-text-secondary)]">
                      Nenhum resultado para os filtros informados.
                    </p>
                  ) : (
                    resultadosBusca.map((processo) => (
                      <button
                        key={processo.id}
                        type="button"
                        onClick={() => adicionarDoRecebimento(processo)}
                        className="w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-3 text-left text-sm transition-colors hover:border-[var(--color-primary-400)] hover:bg-[var(--color-primary-25)]"
                      >
                        <span className="font-medium text-[var(--color-text-primary)]">
                          {processo.protocolo}
                        </span>
                        <span className="text-[var(--color-text-secondary)]">
                          {' '}
                          - {processo.interessado}
                        </span>
                        {processo.orgao ? (
                          <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">
                            {processo.orgao}
                          </span>
                        ) : null}
                        {processo.repositorio ? (
                          <span className="ml-2 text-xs text-[var(--color-text-tertiary)]">
                            [{processo.repositorio}]
                          </span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Repositório"
                  value={itemManual.repositorio}
                  onChange={(event) =>
                    setItemManual((previous) => ({
                      ...previous,
                      repositorio: event.target.value,
                    }))
                  }
                  placeholder="Ex: 000016/2025"
                />
                <div>
                  <Input
                    label="Unidade / Órgão"
                    value={itemManual.orgao}
                    onChange={(event) =>
                      setItemManual((previous) => ({ ...previous, orgao: event.target.value }))
                    }
                    placeholder="Selecione ou digite a unidade"
                    list="devol-orgaos-list"
                  />
                  <datalist id="devol-orgaos-list">
                    {orgaosOptions.map((orgao) => (
                      <option key={orgao.id} value={orgao.nome} />
                    ))}
                  </datalist>
                </div>
                <Input
                  label="Protocolo"
                  value={itemManual.protocolo}
                  onChange={(event) =>
                    setItemManual((previous) => ({ ...previous, protocolo: event.target.value }))
                  }
                  placeholder="Ex: 502824/2021"
                />
                <Input
                  label="Interessado"
                  value={itemManual.interessado}
                  onChange={(event) =>
                    setItemManual((previous) => ({ ...previous, interessado: event.target.value }))
                  }
                  placeholder="Nome do interessado"
                />
                <Input
                  label="Volume"
                  value={itemManual.volume}
                  onChange={(event) =>
                    setItemManual((previous) => ({ ...previous, volume: event.target.value }))
                  }
                  placeholder="Ex: 1 de 3"
                />
                <Input
                  label="Observações"
                  value={itemManual.obs}
                  onChange={(event) =>
                    setItemManual((previous) => ({ ...previous, obs: event.target.value }))
                  }
                  placeholder="Opcional"
                />
              </div>
              <Button variant="outline" size="sm" onClick={adicionarManual}>
                + Adicionar item
              </Button>
            </div>
          )}

          {itens.length > 0 ? (
            <>
              <div className="grid gap-3 lg:hidden">
                {itens.map((item, index) => (
                  <Card key={item.tempId} padding="sm" className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-[var(--color-text-tertiary)]">
                          Item {index + 1}
                        </p>
                        <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
                          {item.protocolo || '—'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => removerItem(item.tempId)}
                        className="text-[var(--color-error-600)] hover:bg-[var(--color-error-50)] hover:text-[var(--color-error-700)]"
                      >
                        Remover
                      </Button>
                    </div>
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-[var(--color-text-tertiary)]">Interessado</dt>
                        <dd className="text-[var(--color-text-primary)]">
                          {item.interessado || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--color-text-tertiary)]">Unidade</dt>
                        <dd className="text-[var(--color-text-primary)]">{item.orgao || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[var(--color-text-tertiary)]">Repositório</dt>
                        <dd className="text-[var(--color-text-primary)]">
                          {item.repositorio || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--color-text-tertiary)]">Volume</dt>
                        <dd className="text-[var(--color-text-primary)]">{item.volume || '—'}</dd>
                      </div>
                    </dl>
                  </Card>
                ))}
              </div>

              <div className="hidden lg:block">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>#</TableHeader>
                      <TableHeader>Protocolo</TableHeader>
                      <TableHeader>Interessado</TableHeader>
                      <TableHeader>Unidade</TableHeader>
                      <TableHeader>Repositório</TableHeader>
                      <TableHeader>Vol.</TableHeader>
                      <TableHeader align="right">Ações</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {itens.map((item, index) => (
                      <TableRow key={item.tempId}>
                        <TableCell className="text-[var(--color-text-tertiary)]">
                          {index + 1}
                        </TableCell>
                        <TableCell>{item.protocolo || '—'}</TableCell>
                        <TableCell>{item.interessado || '—'}</TableCell>
                        <TableCell>{item.orgao || '—'}</TableCell>
                        <TableCell>{item.repositorio || '—'}</TableCell>
                        <TableCell>{item.volume || '—'}</TableCell>
                        <TableCell align="right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => removerItem(item.tempId)}
                            className="text-[var(--color-error-600)] hover:bg-[var(--color-error-50)] hover:text-[var(--color-error-700)]"
                          >
                            Remover
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </section>

        {mostrarPreview ? (
          <div className="overflow-hidden rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-4 py-2">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                Pré-visualização do Termo
              </span>
              <button
                type="button"
                onClick={() => setMostrarPreview(false)}
                className="text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
                aria-label="Fechar pré-visualização"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-[var(--color-text-tertiary)]">Data:</span>{' '}
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {dataDevolucao ? formatarData(dataDevolucao) : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--color-text-tertiary)]">Coordenadoria:</span>{' '}
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {coordenadoriaDestino || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--color-text-tertiary)]">Responsável:</span>{' '}
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {responsavelRetirada || '—'}
                  </span>
                </div>
                {observacoes ? (
                  <div className="sm:col-span-2">
                    <span className="text-[var(--color-text-tertiary)]">Observações:</span>{' '}
                    <span className="text-[var(--color-text-primary)]">{observacoes}</span>
                  </div>
                ) : null}
              </div>
              {itens.length > 0 ? (
                <div className="grid gap-2">
                  {itens.map((item, index) => (
                    <div
                      key={item.tempId}
                      className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-[var(--color-text-primary)]">
                            {index + 1}. {item.protocolo || '—'}
                          </p>
                          <p className="text-[var(--color-text-secondary)]">
                            {item.interessado || '—'}
                          </p>
                        </div>
                        <span className="text-xs text-[var(--color-text-tertiary)]">
                          {item.volume || '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-[var(--color-text-secondary)]">
                  Nenhum item adicionado. Adicione ao menos um item para continuar.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export function DevolucoesPage(): JSX.Element {
  const toast = useToastHelpers();

  const [busca, setBusca] = useState('');
  const [coordenadoriaFiltro, setCoordenadoriaFiltro] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [pagina, setPagina] = useState(1);

  const [modalAberto, setModalAberto] = useState(false);
  const [devolucaoDetalheId, setDevolucaoDetalheId] = useState<string | null>(null);
  const [devolucaoEditando, setDevolucaoEditando] = useState<DevolucaoOperacional | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<DevolucaoOperacional | null>(null);

  const excluirMut = useExcluirDevolucao();
  const debouncedBusca = useDebounce(busca, 600);

  useEffect(() => {
    setPagina(1);
  }, [coordenadoriaFiltro, dataFim, dataInicio, debouncedBusca]);

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
        const response = await api.fetchWithAuth(`/operacional/devolucoes/${id}/pdf`);
        if (!response.ok) throw new Error('Erro ao gerar PDF');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `termo_devolucao_${id.slice(0, 8)}.pdf`;
        link.click();
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

  const handleConfirmarExclusao = async () => {
    if (!confirmandoExclusao) return;

    try {
      await excluirMut.mutateAsync(confirmandoExclusao.id);
      toast.success('Devolução excluída com sucesso.');
      setConfirmandoExclusao(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir devolução');
    }
  };

  return (
    <PageState>
      <div className="space-y-6">
        <PageHeader
          title="Devoluções"
          subtitle="Registros e termos de devolução."
          actions={
            <Button variant="primary" onClick={() => setModalAberto(true)} fullWidth>
              + Nova Devolução
            </Button>
          }
        />

        <FilterBar
          actions={
            busca || coordenadoriaFiltro || dataInicio || dataFim ? (
              <Button type="button" variant="ghost" size="md" onClick={handleLimparFiltros}>
                Limpar filtros
              </Button>
            ) : undefined
          }
        >
          <Input
            label="Buscar"
            placeholder="Protocolo, repositório ou interessado"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
          <Input
            label="Unidade"
            placeholder="Filtrar por coordenadoria..."
            value={coordenadoriaFiltro}
            onChange={(event) => setCoordenadoriaFiltro(event.target.value)}
          />
          <Input
            label="Data Início"
            type="date"
            value={dataInicio}
            onChange={(event) => setDataInicio(event.target.value)}
          />
          <Input
            label="Data Fim"
            type="date"
            value={dataFim}
            onChange={(event) => setDataFim(event.target.value)}
          />
        </FilterBar>

        <Card padding="none">
          {devolucoesQuery.isLoading ? (
            <div className="p-6">
              <SkeletonTable rows={5} cols={5} />
            </div>
          ) : devolucoes.length === 0 ? (
            <div className="p-8 text-center sm:p-12">
              <p className="text-lg font-medium text-[var(--color-text-primary)]">
                Nenhuma devolução encontrada
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Registre a primeira usando o botão acima.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 p-4 lg:hidden">
                {devolucoes.map((devolucao) => (
                  <Card key={devolucao.id} padding="sm" className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-[var(--color-text-tertiary)]">
                          {formatarData(devolucao.data_devolucao)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                          {devolucao.coordenadoria_destino}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                          {devolucao.responsavel_retirada}
                        </p>
                      </div>
                      <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-[var(--color-gray-100)] px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                        {devolucao.total_itens}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm">
                      <p className="text-[var(--color-text-tertiary)]">Observações</p>
                      <p className="text-[var(--color-text-secondary)]">
                        {devolucao.observacoes || '—'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDevolucaoDetalheId(devolucao.id)}
                        fullWidth
                      >
                        Ver itens
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDevolucaoEditando(devolucao)}
                        fullWidth
                      >
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDownloadPdf(devolucao.id)}
                        fullWidth
                      >
                        PDF
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmandoExclusao(devolucao)}
                        className="text-[var(--color-error-600)] hover:bg-[var(--color-error-50)] hover:text-[var(--color-error-700)]"
                        fullWidth
                      >
                        Excluir
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="hidden lg:block">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Data</TableHeader>
                      <TableHeader>Coordenadoria</TableHeader>
                      <TableHeader>Responsável</TableHeader>
                      <TableHeader align="center">Itens</TableHeader>
                      <TableHeader>Observações</TableHeader>
                      <TableHeader align="right">Ações</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {devolucoes.length === 0 ? (
                      <TableEmptyState
                        colSpan={6}
                        title="Nenhuma devolução encontrada"
                        description="Registre a primeira devolução para começar."
                      />
                    ) : (
                      devolucoes.map((devolucao) => (
                        <TableRow key={devolucao.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatarData(devolucao.data_devolucao)}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium text-[var(--color-text-primary)]">
                              {devolucao.coordenadoria_destino}
                            </span>
                          </TableCell>
                          <TableCell>{devolucao.responsavel_retirada}</TableCell>
                          <TableCell align="center">
                            <span className="inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-[var(--color-gray-100)] px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                              {devolucao.total_itens}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[220px] text-[var(--color-text-secondary)]">
                            {devolucao.observacoes || '—'}
                          </TableCell>
                          <TableCell align="right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => setDevolucaoDetalheId(devolucao.id)}
                              >
                                Ver itens
                              </Button>
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => setDevolucaoEditando(devolucao)}
                              >
                                Editar
                              </Button>
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => void handleDownloadPdf(devolucao.id)}
                              >
                                PDF
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => setConfirmandoExclusao(devolucao)}
                                className="text-[var(--color-error-600)] hover:bg-[var(--color-error-50)] hover:text-[var(--color-error-700)]"
                              >
                                Excluir
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {totalPaginas > 1 ? (
            <div className="border-t border-[var(--color-border-primary)] bg-[var(--color-gray-50)] px-4">
              <Pagination
                pagina={pagina}
                totalPaginas={totalPaginas}
                onChange={setPagina}
                disabled={devolucoesQuery.isLoading}
              />
            </div>
          ) : null}
        </Card>
      </div>

      {modalAberto ? (
        <ModalNovaDevolucao
          onClose={() => setModalAberto(false)}
          onSaved={() => void devolucoesQuery.refetch()}
        />
      ) : null}

      {devolucaoDetalheId ? (
        <Suspense fallback={null}>
          <DevolucaoDetalhePanel
            devolucaoId={devolucaoDetalheId}
            onClose={() => setDevolucaoDetalheId(null)}
          />
        </Suspense>
      ) : null}

      {devolucaoEditando ? (
        <Suspense fallback={null}>
          <DevolucaoEditModal
            devolucao={devolucaoEditando}
            onClose={() => setDevolucaoEditando(null)}
            onSaved={() => void devolucoesQuery.refetch()}
          />
        </Suspense>
      ) : null}

      <Modal
        open={!!confirmandoExclusao}
        onClose={() => setConfirmandoExclusao(null)}
        title="Excluir Devolução?"
        subtitle="Esta ação remove o registro e todos os itens vinculados."
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-3 px-5 py-4 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmandoExclusao(null)}
              disabled={excluirMut.isPending}
              fullWidth
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void handleConfirmarExclusao()}
              disabled={excluirMut.isPending}
              fullWidth
            >
              {excluirMut.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 p-5 text-sm text-[var(--color-text-secondary)]">
          {confirmandoExclusao ? (
            <p>
              A devolução de{' '}
              <span className="font-medium text-[var(--color-text-primary)]">
                {formatarData(confirmandoExclusao.data_devolucao)}
              </span>{' '}
              para{' '}
              <span className="font-medium text-[var(--color-text-primary)]">
                {confirmandoExclusao.coordenadoria_destino}
              </span>{' '}
              e todos os seus {confirmandoExclusao.total_itens} item
              {Number(confirmandoExclusao.total_itens) !== 1 ? 's' : ''} serão excluídos.
            </p>
          ) : null}
          <p className="text-[var(--color-error-700)]">Essa ação não pode ser desfeita.</p>
        </div>
      </Modal>
    </PageState>
  );
}
