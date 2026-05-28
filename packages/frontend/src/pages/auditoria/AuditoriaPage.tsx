import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { FilterBar } from '../../components/ui/FilterBar';
import { Icon } from '../../components/ui/Icon';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageState } from '../../components/ui/PageState';
import { Pagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { useAuditoria, useQueryClient } from '../../hooks/useQueries';

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
    titulo: 'Auditoria de importações',
    descricao: 'Histórico de importações.',
    tabelasFiltro: ['importacoes', 'importacoes_legado_operacional', 'registros_importados'],
  },
  ocr: {
    titulo: 'Auditoria de OCR',
    descricao: 'Histórico de processamento OCR.',
    tabelasFiltro: ['documentos_ocr', 'recebimento_documentos'],
  },
  correcoes: {
    titulo: 'Auditoria de correções',
    descricao: 'Histórico de correções em registros.',
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
    titulo: 'Ações de usuários',
    descricao: 'Histórico de ações no sistema.',
    tabelasFiltro: ['usuarios'],
  },
};

export function AuditoriaPage({ categoria }: AuditoriaPageProps): JSX.Element {
  const location = useLocation();
  const config = categoria ? CATEGORIA_CONFIG[categoria] : null;
  const queryClient = useQueryClient();

  const dataInicioPadrao = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0] ?? '';
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
            : 'Verifique sua conexão.',
      }
    : null;

  const temFiltroAtivo = Boolean(
    filtroTabela || filtroOperacao || dataInicio !== dataInicioPadrao || dataFim !== dataFimPadrao
  );

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['auditoria'] });

  const handleCopiar = (id: string, content: unknown): void => {
    void navigator.clipboard.writeText(JSON.stringify(content, null, 2)).then(() => {
      setCopiadoId(id);
      setTimeout(() => setCopiadoId((previous) => (previous === id ? null : previous)), 1500);
    });
  };

  const formatarData = (data: string): string => new Date(data).toLocaleString('pt-BR');

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
      recebimento_processos: 'Processos de recebimento',
      recebimento_apensos: 'Apensos de recebimento',
      recebimento_volumes: 'Volumes de recebimento',
      recebimento_apenso_volumes: 'Volumes de apenso',
      recebimento_documentos: 'Documentos de recebimento',
      checklists: 'Checklists',
      checklist_itens: 'Itens de checklist',
      importacoes_legado_operacional: 'Importações legado',
      registros_importados: 'Registros importados',
      registros_producao: 'Registros de produção',
      configuracao_empresa: 'Configuração da empresa',
      fontes_dados: 'Fontes de dados',
      fontes_dados_api: 'Fontes de dados API',
      recebimentos: 'Recebimentos',
      glossario: 'Glossário',
      artigos: 'Artigos',
      artigos_tags: 'Tags de artigos',
    };
    return nomes[tabela] || tabela;
  };

  const erroComAcao = erro
    ? { ...erro, action: { label: 'Tentar novamente', onClick: invalidate } }
    : null;

  return (
    <PageState
      loading={carregando}
      loadingMessage="Carregando auditoria..."
      error={erroComAcao}
    >
      <div className="space-y-6">
        <PageHeader
          title={config?.titulo ?? 'Auditoria'}
          subtitle={config?.descricao ?? 'Histórico de alterações no sistema.'}
          actions={
            <Button variant="secondary" icon="refresh-cw" onClick={invalidate} fullWidth>
              Atualizar
            </Button>
          }
        />

        <FilterBar
          actions={
            <Button
              variant="primary"
              icon="search"
              onClick={() => {
                setPagina(1);
                invalidate();
              }}
              fullWidth
            >
              Atualizar lista
            </Button>
          }
        >
          <div className="sm:col-span-2 xl:col-span-2">
            <DateRangePicker
              startDate={dataInicio}
              endDate={dataFim}
              onStartDateChange={(value) => {
                setDataInicio(value);
                setPagina(1);
              }}
              onEndDateChange={(value) => {
                setDataFim(value);
                setPagina(1);
              }}
            />
          </div>
          <Select
            label="Tabela"
            value={filtroTabela}
            onChange={(event) => {
              setFiltroTabela(event.target.value);
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
            onChange={(event) => {
              setFiltroOperacao(event.target.value);
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

        <Card>
          <div className="p-4">
            {logs.length === 0 ? (
              <div className="py-10 text-center text-[var(--color-text-secondary)]">
                <Icon
                  name="shield"
                  className="mx-auto mb-3 h-8 w-8 text-[var(--color-text-tertiary)]"
                />
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {temFiltroAtivo
                    ? 'Nenhum resultado para os filtros aplicados'
                    : 'Nenhum evento.'}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  {temFiltroAtivo
                    ? 'Tente ampliar o período ou remover filtros.'
                    : 'Os eventos aparecerão aqui conforme ocorrem.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-[var(--color-border-primary)] p-4 transition-colors hover:bg-[var(--color-bg-secondary)]"
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`rounded-lg p-2 ${getOperacaoBadge(log.operacao).bg} ${getOperacaoBadge(log.operacao).text}`}
                      >
                        <Icon name={getOperacaoIcon(log.operacao)} className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--color-text-primary)]">
                              {getTabelaNome(log.tabela)}
                            </p>
                            <p className="text-sm text-[var(--color-text-secondary)]">
                              {log.operacao === 'INSERT' && 'Registro criado'}
                              {log.operacao === 'UPDATE' && 'Registro atualizado'}
                              {log.operacao === 'DELETE' && 'Registro excluído'}
                              {' • '}ID: {log.registro_id.substring(0, 8)}...
                              {log.usuario_id ? (
                                <span className="ml-1" title={`Usuário ID: ${log.usuario_id}`}>
                                  {' • '}
                                  <Icon name="user" className="-mt-0.5 inline h-3 w-3" />{' '}
                                  {(log as { usuario_nome?: string }).usuario_nome ??
                                    `${log.usuario_id.substring(0, 8)}...`}
                                </span>
                              ) : null}
                            </p>
                          </div>

                          <div className="text-left sm:text-right">
                            <p className="text-sm text-[var(--color-text-tertiary)]">
                              {formatarData(log.criado_em)}
                            </p>
                            {expandido === log.id ? (
                              <button
                                type="button"
                                aria-expanded="true"
                                aria-controls={`detalhes-${log.id}`}
                                onClick={() => setExpandido(null)}
                                className="rounded text-xs text-primary-600 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                              >
                                Ocultar
                              </button>
                            ) : (
                              <button
                                type="button"
                                aria-expanded="false"
                                aria-controls={`detalhes-${log.id}`}
                                onClick={() => setExpandido(log.id)}
                                className="rounded text-xs text-primary-600 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                              >
                                Detalhes
                              </button>
                            )}
                          </div>
                        </div>

                        {expandido === log.id ? (
                          <div
                            id={`detalhes-${log.id}`}
                            className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"
                          >
                            {log.dados_antigos && Object.keys(log.dados_antigos).length > 0 ? (
                              <div>
                                <div className="mb-2 flex items-center justify-between">
                                  <p className="text-xs font-medium text-[var(--color-text-tertiary)]">
                                    Dados anteriores
                                  </p>
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-primary-600 hover:text-primary-800"
                                    onClick={() =>
                                      handleCopiar(`${log.id}-antigos`, log.dados_antigos)
                                    }
                                  >
                                    {copiadoId === `${log.id}-antigos` ? '✓ Copiado' : 'Copiar'}
                                  </button>
                                </div>
                                <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--color-bg-secondary)] p-3 text-xs">
                                  {JSON.stringify(log.dados_antigos, null, 2)}
                                </pre>
                              </div>
                            ) : null}

                            {log.dados_novos && Object.keys(log.dados_novos).length > 0 ? (
                              <div>
                                <div className="mb-2 flex items-center justify-between">
                                  <p className="text-xs font-medium text-[var(--color-text-tertiary)]">
                                    Dados novos
                                  </p>
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-primary-600 hover:text-primary-800"
                                    onClick={() => handleCopiar(`${log.id}-novos`, log.dados_novos)}
                                  >
                                    {copiadoId === `${log.id}-novos` ? '✓ Copiado' : 'Copiar'}
                                  </button>
                                </div>
                                <pre className="max-h-64 overflow-auto rounded-lg bg-primary-50 p-3 text-xs">
                                  {JSON.stringify(log.dados_novos, null, 2)}
                                </pre>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {totalPaginas > 1 ? (
            <div className="border-t border-[var(--color-border-primary)] px-6 py-4">
              <Pagination
                pagina={pagina}
                totalPaginas={totalPaginas}
                onChange={setPagina}
                disabled={carregando}
              />
            </div>
          ) : null}
        </Card>
      </div>
    </PageState>
  );
}

