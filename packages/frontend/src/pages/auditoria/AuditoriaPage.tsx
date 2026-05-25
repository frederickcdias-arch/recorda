import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageState } from '../../components/ui/PageState';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FilterBar';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
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
    return d.toISOString().split('T')[0] ?? '';
  }, []);
  const dataFimPadrao = useMemo(() => new Date().toISOString().split('T')[0] ?? '', []);
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
        message: 'Erro ao carregar logs de auditoria',
        details:
          auditoriaQuery.error instanceof Error
            ? auditoriaQuery.error.message
            : 'Verifique sua conexão',
      }
    : null;

  const temFiltroAtivo = !!(
    filtroTabela ||
    filtroOperacao ||
    dataInicio !== dataInicioPadrao ||
    dataFim !== dataFimPadrao
  );

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['auditoria'] });

  const handleCopiar = (id: string, content: unknown): void => {
    void navigator.clipboard.writeText(JSON.stringify(content, null, 2)).then((): void => {
      setCopiadoId(id);
      setTimeout((): void => setCopiadoId((prev) => (prev === id ? null : prev)), 1500);
    });
  };

  const formatarData = (data: string): string => {
    return new Date(data).toLocaleString('pt-BR');
  };

  const getOperacaoBadge = (operacao: string): { bg: string; text: string } => {
    const map: Record<string, { bg: string; text: string }> = {
      INSERT: { bg: 'bg-[var(--color-primary-100)]', text: 'text-[var(--color-primary-800)]' },
      UPDATE: { bg: 'bg-[var(--color-primary-50)]', text: 'text-[var(--color-primary-700)]' },
      DELETE: { bg: 'bg-[var(--color-gray-200)]', text: 'text-[var(--color-gray-800)]' },
    };
    return (
      map[operacao] ?? { bg: 'bg-[var(--color-gray-100)]', text: 'text-[var(--color-gray-800)]' }
    );
  };

  const getOperacaoIcon = (operacao: string): string => {
    const icons: Record<string, string> = {
      INSERT: 'plus',
      UPDATE: 'edit',
      DELETE: 'trash',
    };
    return icons[operacao] || 'activity';
  };

  const getTabelaNome = (tabela: string): string => {
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
      loadingMessage="Carregando logs de auditoria..."
      error={erroComAcao}
    >
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title={config?.titulo ?? 'Auditoria'}
          subtitle={config?.descricao ?? 'Histórico de alterações no sistema'}
          actions={
            <Button variant="secondary" icon="refresh-cw" onClick={invalidate}>
              Atualizar
            </Button>
          }
        />

        {/* Filtros */}
        <FilterBar
          actions={
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
          }
        >
          <Input
            label="Data Início"
            type="date"
            value={dataInicio}
            max={dataFim || undefined}
            onChange={(e) => {
              setDataInicio(e.target.value);
              setPagina(1);
            }}
          />
          <Input
            label="Data Final"
            type="date"
            value={dataFim}
            min={dataInicio || undefined}
            onChange={(e) => {
              setDataFim(e.target.value);
              setPagina(1);
            }}
          />
          <Select
            label="Tabela"
            value={filtroTabela}
            onChange={(e) => {
              setFiltroTabela(e.target.value);
              setPagina(1);
            }}
            options={[
              { value: '', label: 'Todas' },
              { value: 'processos_principais', label: 'Processos' },
              { value: 'colaboradores', label: 'Colaboradores' },
              { value: 'etapas', label: 'Etapas' },
              { value: 'producao_repositorio', label: 'Produção' },
              { value: 'documentos_ocr', label: 'Documentos OCR' },
              { value: 'usuarios', label: 'Usuários' },
            ]}
          />
          <Select
            label="Operação"
            value={filtroOperacao}
            onChange={(e) => {
              setFiltroOperacao(e.target.value);
              setPagina(1);
            }}
            options={[
              { value: '', label: 'Todas' },
              { value: 'INSERT', label: 'Criação' },
              { value: 'UPDATE', label: 'Atualização' },
              { value: 'DELETE', label: 'Exclusão' },
            ]}
          />
        </FilterBar>

        {/* Timeline */}
        <Card>
          <div className="p-4">
            {logs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Icon name="shield" className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">
                  {temFiltroAtivo
                    ? 'Nenhum resultado para os filtros aplicados'
                    : 'Nenhum evento de auditoria encontrado.'}
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
                      <div
                        className={`p-2 rounded-lg ${getOperacaoBadge(log.operacao).bg} ${getOperacaoBadge(log.operacao).text}`}
                      >
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
                                <span className="ml-1" title={`Usuário ID: ${log.usuario_id}`}>
                                  {' • '}
                                  <Icon name="user" className="w-3 h-3 inline -mt-0.5" />{' '}
                                  {(log as { usuario_nome?: string }).usuario_nome ??
                                    `${log.usuario_id.substring(0, 8)}...`}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-500">{formatarData(log.criado_em)}</p>
                            <button
                              type="button"
                              aria-expanded={expandido === log.id ? 'true' : 'false'}
                              aria-controls={`detalhes-${log.id}`}
                              onClick={() => setExpandido(expandido === log.id ? null : log.id)}
                              className="text-xs text-primary-600 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
                            >
                              {expandido === log.id ? 'Ocultar detalhes' : 'Ver detalhes'}
                            </button>
                          </div>
                        </div>

                        {expandido === log.id && (
                          <div
                            id={`detalhes-${log.id}`}
                            className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4"
                          >
                            {log.dados_antigos && Object.keys(log.dados_antigos).length > 0 && (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-medium text-gray-500">
                                    Dados Anteriores
                                  </p>
                                  <button
                                    type="button"
                                    className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                                    onClick={() =>
                                      handleCopiar(`${log.id}-antigos`, log.dados_antigos)
                                    }
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
                                    className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                                    onClick={() => handleCopiar(`${log.id}-novos`, log.dados_novos)}
                                  >
                                    {copiadoId === `${log.id}-novos` ? '✓ Copiado' : 'Copiar'}
                                  </button>
                                </div>
                                <pre className="text-xs bg-primary-50 p-3 rounded-lg overflow-auto max-h-64">
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
