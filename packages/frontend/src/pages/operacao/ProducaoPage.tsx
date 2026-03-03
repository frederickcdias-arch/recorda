import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { PageState } from '../../components/ui/PageState';
import { Pagination } from '../../components/ui/Pagination';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToastHelpers } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { extractErrorMessage } from '../../utils/errors';
import { useProducao, useDeleteProducao, useQueryClient, queryKeys } from '../../hooks/useQueries';
import { api } from '../../services/api';

const ETAPA_LABELS: Record<string, string> = {
  RECEBIMENTO: 'Recebimento',
  PREPARACAO: 'Preparação',
  DIGITALIZACAO: 'Digitalização',
  CONFERENCIA: 'Conferência',
  MONTAGEM: 'Montagem',
  CONTROLE_QUALIDADE: 'Controle de Qualidade',
  ENTREGA: 'Entrega',
};

export function ProducaoPage(): JSX.Element {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const deleteProducao = useDeleteProducao();
  const toast = useToastHelpers();
  const confirmDialog = useConfirmDialog();

  // Filtros
  const [pagina, setPagina] = useState(1);
  const [etapa, setEtapa] = useState('');
  const [colaborador, setColaborador] = useState('');
  const [origem, setOrigem] = useState<'' | 'legado' | 'fluxo'>('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');

  // Debounce busca
  useEffect(() => {
    const timer = setTimeout(() => setBuscaDebounced(busca), 400);
    return () => clearTimeout(timer);
  }, [busca]);

  // Reset page when filters change
  useEffect(() => {
    setPagina(1);
  }, [etapa, colaborador, origem, dataInicio, dataFim, buscaDebounced]);

  const producaoQuery = useProducao({
    pagina,
    limite: 25,
    etapa: etapa || undefined,
    colaborador: colaborador || undefined,
    origem: origem || undefined,
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    busca: buscaDebounced || undefined,
  });
  const dados = producaoQuery.data ?? null;
  const carregando = producaoQuery.isLoading;
  const erro = producaoQuery.error
    ? { message: 'Erro ao carregar Registros de Produção', details: producaoQuery.error instanceof Error ? producaoQuery.error.message : 'Falha desconhecida' }
    : null;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.producaoAll });

  const handleExcluir = (id: string): void => {
    confirmDialog.confirm({
      title: 'Excluir Registro',
      message: 'Tem certeza que deseja excluir este registro de produção?',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteProducao.mutateAsync(id);
          toast.success('Registro excluído.');
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao excluir'));
        }
      },
    });
  };

  const isAdmin = usuario?.perfil === 'administrador';
  const [exportando, setExportando] = useState(false);

  const handleExportarExcel = async () => {
    setExportando(true);
    try {
      const params = new URLSearchParams();
      if (dataInicio) params.set('dataInicio', dataInicio);
      if (dataFim) params.set('dataFim', dataFim);
      params.set('formato', 'excel');
      await api.download(`/api/relatorios/operacional/export?${params.toString()}`, `producao_${dataInicio || 'inicio'}_${dataFim || 'fim'}.xlsx`);
      toast.success('Exportação concluída.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao exportar'));
    } finally {
      setExportando(false);
    }
  };

  const totalFormatado = useMemo(() => {
    if (!dados) return '0';
    return dados.total.toLocaleString('pt-BR');
  }, [dados]);

  const erroComAcao = erro
    ? { ...erro, action: { label: 'Tentar novamente', onClick: () => void invalidate() } }
    : null;

  return (
    <PageState loading={carregando && !dados} loadingMessage="Carregando Produção..." error={erroComAcao}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Produção</h1>
            <p className="text-gray-500 mt-1">
              {totalFormatado} Registros de Produção
            </p>
          </div>
          <Button className="w-full sm:w-auto" variant="secondary" icon="download" onClick={() => void handleExportarExcel()} loading={exportando} disabled={exportando || !dataInicio || !dataFim}>
            Exportar Excel
          </Button>
        </div>

        <ConfirmDialog
          state={confirmDialog.state}
          loading={confirmDialog.loading}
          onConfirm={() => void confirmDialog.handleConfirm()}
          onCancel={confirmDialog.close}
        />

        {/* Filtros */}
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Busca</label>
              <input
                type="text"
                placeholder="Nome, repositório, tipo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full h-9 px-3 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Etapa</label>
              <select
                value={etapa}
                onChange={(e) => setEtapa(e.target.value)}
                className="w-full h-9 px-2 text-sm border rounded-lg"
              >
                <option value="">Todas</option>
                {(dados?.filtros.etapas ?? []).map((e) => (
                  <option key={e} value={e}>{ETAPA_LABELS[e] ?? e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Colaborador</label>
              <select
                value={colaborador}
                onChange={(e) => setColaborador(e.target.value)}
                className="w-full h-9 px-2 text-sm border rounded-lg"
              >
                <option value="">Todos</option>
                {(dados?.filtros.colaboradores ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Origem</label>
              <select
                value={origem}
                onChange={(e) => setOrigem(e.target.value as '' | 'legado' | 'fluxo')}
                className="w-full h-9 px-2 text-sm border rounded-lg"
              >
                <option value="">Todas</option>
                <option value="legado">Legado</option>
                <option value="fluxo">Fluxo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full h-9 px-2 text-sm border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full h-9 px-2 text-sm border rounded-lg"
              />
            </div>
          </div>
          {(etapa || colaborador || origem || dataInicio || dataFim || busca) && (
            <button
              onClick={() => {
                setEtapa('');
                setColaborador('');
                setOrigem('');
                setDataInicio('');
                setDataFim('');
                setBusca('');
              }}
              className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Limpar Filtros
            </button>
          )}
        </Card>

        {/* Tabela */}
        <Card>
          <div className="space-y-3 md:hidden">
            {(!dados || dados.registros.length === 0) ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                {carregando ? 'Carregando...' : 'Nenhum registro encontrado.'}
              </div>
            ) : (
              dados.registros.map((reg) => (
                <div key={reg.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{reg.colaborador_nome}</p>
                      <p className="text-xs text-gray-500">{new Date(reg.data_producao).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{reg.quantidade.toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-gray-700 break-all">{reg.repositorio_ged}</p>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-600">{reg.funcao || ETAPA_LABELS[reg.etapa] || reg.etapa}</span>
                    <span className="text-gray-500">{reg.coordenadoria_sigla || '-'}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    {reg.origem === 'LEGADO' ? (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Legado
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        Fluxo
                      </span>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => void handleExcluir(reg.id)}
                        className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        title="Excluir Registro"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Colaborador</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Repositório</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Função</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Unidade</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Qtd</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Coord.</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Origem</th>
                  {isAdmin && (
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {(!dados || dados.registros.length === 0) ? (
                  <tr>
                    <td colSpan={isAdmin ? 9 : 8} className="px-3 py-8 text-center text-sm text-gray-500">
                      {carregando ? 'Carregando...' : 'Nenhum registro encontrado.'}
                    </td>
                  </tr>
                ) : (
                  dados.registros.map((reg) => (
                    <tr key={reg.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-800 whitespace-nowrap">
                        {new Date(reg.data_producao).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-800">
                        {reg.colaborador_nome}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-800 font-mono">
                        {reg.repositorio_ged}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-800">
                        {reg.funcao || ETAPA_LABELS[reg.etapa] || reg.etapa}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">
                        {reg.tipo || '-'}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-800 text-right font-medium tabular-nums">
                        {reg.quantidade.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">
                        {reg.coordenadoria_sigla || '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {reg.origem === 'LEGADO' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Legado
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Fluxo
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => void handleExcluir(reg.id)}
                            className="text-gray-400 hover:text-gray-700 p-1"
                            title="Excluir Registro"
                          >
                            <Icon name="trash" className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {dados && (
            <Pagination
              pagina={dados.pagina}
              totalPaginas={dados.totalPaginas}
              onChange={setPagina}
            />
          )}
        </Card>
      </div>
    </PageState>
  );
}
