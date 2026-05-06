import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageState } from '../../components/ui/PageState';
import { useAuditoria, useQueryClient } from '../../hooks/useQueries';
import { Pagination } from '../../components/ui/Pagination';

type AuditoriaCategoria = 'importacoes' | 'ocr' | 'correcoes' | 'acoes';

interface AuditoriaPageProps {
  categoria?: AuditoriaCategoria;
}

const CATEGORIA_CONFIG: Record<
  AuditoriaCategoria,
  {
    titulo: string;
    descricao: string;
    tabelasFiltro: string[];
  }
> = {
  importacoes: {
    titulo: 'Auditoria de Importações',
    descricao: 'Histórico de importações e registros importados',
    tabelasFiltro: ['importacoes', 'importacoes_legado_operacional', 'registros_importados'],
  },
  ocr: {
    titulo: 'Auditoria de OCR',
    descricao: 'Histórico de processamento OCR e documentos digitalizados',
    tabelasFiltro: ['documentos_ocr', 'recebimento_documentos'],
  },
  correcoes: {
    titulo: 'Auditoria de Correções',
    descricao: 'Histórico de atualizações e correções em registros',
    tabelasFiltro: [
      'repositorios',
      'recebimento_processos',
      'recebimento_apensos',
      'recebimento_volumes',
      'recebimento_apenso_volumes',
      'recebimento_documentos',
      'checklists',
      'checklist_itens',
      'producao_repositorio',
    ],
  },
  acoes: {
    titulo: 'Ações de Usuários',
    descricao: 'Histórico de ações realizadas por usuários no sistema',
    tabelasFiltro: ['usuarios'],
  },
};

export function AuditoriaPage({ categoria }: AuditoriaPageProps): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const config = categoria ? CATEGORIA_CONFIG[categoria] : null;
  const queryClient = useQueryClient();

  // Filtros
  const dataInicioPadrao = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }, []);
  const dataFimPadrao = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [filtroTabela, setFiltroTabela] = useState('');
  const [filtroOperacao, setFiltroOperacao] = useState('');
  const [dataInicio, setDataInicio] = useState(dataInicioPadrao);
  const [dataFim, setDataFim] = useState(dataFimPadrao);
  const [pagina, setPagina] = useState(1);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const filtrosUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      pagina: Math.max(Number(params.get('pagina') ?? '1'), 1),
      tabela: params.get('tabela') ?? '',
      operacao: params.get('operacao') ?? '',
      dataInicio: params.get('dataInicio') ?? dataInicioPadrao,
      dataFim: params.get('dataFim') ?? dataFimPadrao,
    };
  }, [dataFimPadrao, dataInicioPadrao, location.search]);

  useEffect(() => {
    setPagina(filtrosUrl.pagina);
    setFiltroTabela(filtrosUrl.tabela);
    setFiltroOperacao(filtrosUrl.operacao);
    setDataInicio(filtrosUrl.dataInicio);
    setDataFim(filtrosUrl.dataFim);
  }, [
    filtrosUrl.dataFim,
    filtrosUrl.dataInicio,
    filtrosUrl.operacao,
    filtrosUrl.pagina,
    filtrosUrl.tabela,
  ]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (pagina > 1) params.set('pagina', String(pagina));
    if (filtroTabela) params.set('tabela', filtroTabela);
    if (filtroOperacao) params.set('operacao', filtroOperacao);
    if (dataInicio) params.set('dataInicio', dataInicio);
    if (dataFim) params.set('dataFim', dataFim);

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
  }, [
    dataFim,
    dataInicio,
    filtroOperacao,
    filtroTabela,
    location.pathname,
    location.search,
    navigate,
    pagina,
  ]);

  const tabelaEfetiva =
    filtroTabela ||
    (config && config.tabelasFiltro.length > 0 ? config.tabelasFiltro.join(',') : '') ||
    undefined;
  const operacaoEfetiva =
    filtroOperacao || (categoria === 'correcoes' && !filtroTabela ? 'UPDATE' : '') || undefined;

  const auditoriaQuery = useAuditoria({
    pagina,
    limite: 50,
    tabela: tabelaEfetiva,
    operacao: operacaoEfetiva,
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
  });
  const logs = auditoriaQuery.data?.logs ?? [];
  const totalPaginas = auditoriaQuery.data?.totalPaginas ?? 1;
  const carregando = auditoriaQuery.isLoading;
  const erro = auditoriaQuery.error
    ? {
        message: 'Erro ao Carregar Logs de Auditoria',
        details:
          auditoriaQuery.error instanceof Error
            ? auditoriaQuery.error.message
            : 'Verifique sua conexão',
      }
    : null;

  const temFiltroAtivo = !!(filtroTabela || filtroOperacao ||
    dataInicio !== dataInicioPadrao || dataFim !== dataFimPadrao);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['auditoria'] });

  const handleCopiar = (id: string, content: unknown) => {
    void navigator.clipboard.writeText(JSON.stringify(content, null, 2)).then(() => {
      setCopiadoId(id);
      setTimeout(() => setCopiadoId((prev) => (prev === id ? null : prev)), 1500);
    });
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString('pt-BR');
  };

  const getOperacaoBadge = (operacao: string) => {
    const cores: Record<string, string> = {
      INSERT: 'bg-blue-100 text-blue-800',
      UPDATE: 'bg-blue-50 text-blue-700',
      DELETE: 'bg-gray-200 text-gray-800',
    };
    return cores[operacao] || 'bg-gray-100 text-gray-800';
  };

  const getOperacaoIcon = (operacao: string) => {
    const icons: Record<string, string> = {
      INSERT: 'plus',
      UPDATE: 'edit',
      DELETE: 'trash',
    };
    return icons[operacao] || 'activity';
  };

  const getTabelaNome = (tabela: string) => {
    const nomes: Record<string, string> = {
      processos_principais: 'Processos',
      volumes: 'Volumes',
      apensos: 'Apensos',
      colaboradores: 'Colaboradores',
      etapas: 'Etapas',
      producao_repositorio: 'Produção',
      documentos_ocr: 'Documentos OCR',
      importacoes: 'Importações',
      usuarios: 'Usuários',
      repositorios: 'Repositórios',
      recebimento_processos: 'Processos de Recebimento',
      recebimento_apensos: 'Apensos de Recebimento',
      recebimento_volumes: 'Volumes de Recebimento',
      recebimento_apenso_volumes: 'Volumes de Apenso',
      recebimento_documentos: 'Documentos de Recebimento',
      checklists: 'Checklists',
      checklist_itens: 'Itens de Checklist',
      importacoes_legado_operacional: 'Importações Legado',
      registros_importados: 'Registros Importados',
      registros_producao: 'Registros de Produção',
      configuracao_empresa: 'Configuração da Empresa',
      fontes_dados: 'Fontes de Dados',
      fontes_dados_api: 'Fontes de Dados API',
      recebimentos: 'Recebimentos',
      glossario: 'Glossário',
      artigos: 'Artigos',
      artigos_tags: 'Tags de Artigos',
    };
    return nomes[tabela] || tabela;
  };

  const erroComAcao = erro
    ? { ...erro, action: { label: 'Tentar novamente', onClick: invalidate } }
    : null;

  return (
    <PageState
      loading={carregando}
      loadingMessage="Carregando Logs de Auditoria..."
      error={erroComAcao}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{config?.titulo ?? 'Auditoria'}</h1>
            <p className="text-gray-500 mt-1">
              {config?.descricao ?? 'Histórico de Alterações no sistema'}
            </p>
          </div>
          <Button variant="secondary" icon="refresh-cw" onClick={invalidate}>
            Atualizar
          </Button>
        </div>

        {/* Filtros */}
        <Card>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label>
                <input
                  type="date"
                  value={dataInicio}
                  max={dataFim || undefined}
                  onChange={(e) => {
                    setDataInicio(e.target.value);
                    setPagina(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label>
                <input
                  type="date"
                  value={dataFim}
                  min={dataInicio || undefined}
                  onChange={(e) => {
                    setDataFim(e.target.value);
                    setPagina(1);
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    dataInicio && dataFim && dataFim < dataInicio
                      ? 'border-red-400 focus:ring-red-200'
                      : 'border-gray-300'
                  }`}
                />
                {dataInicio && dataFim && dataFim < dataInicio && (
                  <p className="text-xs text-red-600 mt-1">Data fim deve ser após a data início</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tabela</label>
                <select
                  value={filtroTabela}
                  onChange={(e) => {
                    setFiltroTabela(e.target.value);
                    setPagina(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todas</option>
                  <option value="processos_principais">Processos</option>
                  <option value="colaboradores">Colaboradores</option>
                  <option value="etapas">Etapas</option>
                  <option value="producao_repositorio">Produção</option>
                  <option value="documentos_ocr">Documentos OCR</option>
                  <option value="usuarios">Usuários</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Operação</label>
                <select
                  value={filtroOperacao}
                  onChange={(e) => {
                    setFiltroOperacao(e.target.value);
                    setPagina(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todas</option>
                  <option value="INSERT">Criação</option>
                  <option value="UPDATE">Atualização</option>
                  <option value="DELETE">Exclusão</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  variant="primary"
                  icon="search"
                  onClick={() => {
                    setPagina(1);
                    invalidate();
                  }}
                >
                  Filtrar
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Timeline */}
        <Card>
          <div className="p-4">
            {logs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Icon name="shield" className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">
                  {temFiltroAtivo
                    ? 'Nenhum resultado para os filtros aplicados'
                    : 'Nenhum log registrado'}
                </p>
                <p className="text-sm">
                  {temFiltroAtivo
                    ? 'Tente ampliar o intervalo de datas ou remover filtros'
                    : 'As ações do sistema aparecerão aqui conforme forem realizadas'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${getOperacaoBadge(log.operacao)}`}>
                        <Icon name={getOperacaoIcon(log.operacao)} className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-medium text-gray-900">{getTabelaNome(log.tabela)}</p>
                            <p className="text-sm text-gray-500">
                              {log.operacao === 'INSERT' && 'Registro criado'}
                              {log.operacao === 'UPDATE' && 'Registro atualizado'}
                              {log.operacao === 'DELETE' && 'Registro excluído'}
                              {' • '}
                              ID: {log.registro_id.substring(0, 8)}...
                              {log.usuario_id && (
                                <span
                                  className="ml-1"
                                  title={`Usuário ID: ${log.usuario_id}`}
                                >
                                  {' • '}
                                  <Icon name="user" className="w-3 h-3 inline -mt-0.5" />
                                  {' '}{log.usuario_id.substring(0, 8)}...
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-500">{formatarData(log.criado_em)}</p>
                            <button
                              type="button"
                              aria-expanded={expandido === log.id}
                              aria-controls={`detalhes-${log.id}`}
                              onClick={() => setExpandido(expandido === log.id ? null : log.id)}
                              className="text-xs text-blue-600 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                            >
                              {expandido === log.id ? 'Ocultar detalhes' : 'Ver detalhes'}
                            </button>
                          </div>
                        </div>

                        {expandido === log.id && (
                          <div id={`detalhes-${log.id}`} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {log.dados_antigos && Object.keys(log.dados_antigos).length > 0 && (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-medium text-gray-500">
                                    Dados Anteriores
                                  </p>
                                  <button
                                    type="button"
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    onClick={() => handleCopiar(`${log.id}-antigos`, log.dados_antigos)}
                                  >
                                    {copiadoId === `${log.id}-antigos` ? '✓ Copiado' : 'Copiar'}
                                  </button>
                                </div>
                                <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-auto max-h-64">
                                  {JSON.stringify(log.dados_antigos, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.dados_novos && Object.keys(log.dados_novos).length > 0 && (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-medium text-gray-500">Dados Novos</p>
                                  <button
                                    type="button"
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    onClick={() => handleCopiar(`${log.id}-novos`, log.dados_novos)}
                                  >
                                    {copiadoId === `${log.id}-novos` ? '✓ Copiado' : 'Copiar'}
                                  </button>
                                </div>
                                <pre className="text-xs bg-blue-50 p-3 rounded-lg overflow-auto max-h-64">
                                  {JSON.stringify(log.dados_novos, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="px-6 py-4 border-t border-gray-200">
              <Pagination
                pagina={pagina}
                totalPaginas={totalPaginas}
                onChange={setPagina}
                disabled={carregando}
              />
            </div>
          )}
        </Card>
      </div>
    </PageState>
  );
}
