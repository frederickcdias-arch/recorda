import { lazy, Suspense, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardFooter, CardHeader, CardSection } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageState } from '../../components/ui/PageState';
import { useToastHelpers } from '../../components/ui/Toast';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '../../components/ui/Table';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { extractErrorMessage } from '../../utils/errors';
import { api } from '../../services/api';
import {
  useImportacoesHistorico,
  useImportarProducaoLegado,
  useLimparImportacoesLegado,
  usePreviewImportacaoProducaoLegado,
  useRollbackImportacaoLegado,
  useFetchSheets,
  useFontesImportacao,
  useCriarFonteImportacao,
  useExcluirFonteImportacao,
  useImportarFonte,
  useImportarTodasFontes,
  useQueryClient,
  queryKeys,
} from '../../hooks/useQueries';

const PreviewImportacaoModal = lazy(() =>
  import('./PreviewImportacaoModal').then((m) => ({ default: m.PreviewImportacaoModal }))
);

interface RegistroProducao {
  data: string;
  colaborador: string;
  funcao: string;
  repositorio: string;
  coordenadoria: string;
  quantidade: string;
  tipo: string;
}

interface PreviewImportacao {
  totalRegistros: number;
  registrosValidos: number;
  duplicadasPlanilha: number[];
  duplicadasBanco: number[];
  linhasInvalidas: { linha: number; erro: string }[];
  amostraDatas: Array<{
    linha: number;
    dataOriginal: string;
    dataNormalizada: string | null;
    status: 'valido' | 'invalido';
    erro?: string;
  }>;
  impacto: {
    inseridosPrevistos: number;
    atualizadosPrevistos: number;
    ignoradosPrevistos: number;
    invalidos: number;
  };
}

interface ValidacaoItem {
  linha: number;
  dados: { colaborador: string; repositorio: string };
}

interface ValidacaoResult {
  fonte: { nome: string };
  total: number;
  novos: { quantidade: number; itens: ValidacaoItem[] };
  duplicados: { quantidade: number; itens: ValidacaoItem[] };
}

interface ResultadoFonte {
  fonte: string;
  importados: number;
  duplicados: number;
  erros: number;
  sucesso: boolean;
}

interface ResultadoImportacaoTodas {
  total: number;
  resumo: { importados: number; duplicados: number; erros: number };
  resultados: ResultadoFonte[];
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function splitCsvLine(line: string, separator: ',' | ';'): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? '';
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === separator && !quoted) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  out.push(current);
  return out.map((item) => item.trim());
}

function parseCsvToProducao(content: string): RegistroProducao[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return [];

  const isTab = (lines[0] ?? '').includes('\t');
  const separator: ',' | ';' = lines[0]?.includes(';') ? ';' : ',';
  const headersRaw = isTab
    ? (lines[0] ?? '').split('\t').map((h) => h.trim())
    : splitCsvLine(lines[0] ?? '', separator);
  const headers = headersRaw.map(normalizeHeader);
  const indexOf = (aliases: string[]): number => headers.findIndex((h) => aliases.includes(h));

  const idxData = indexOf(['data', 'date']);
  const idxColaborador = indexOf(['colaborador', 'nome', 'funcionario']);
  const idxFuncao = indexOf(['funcao', 'cargo']);
  const idxRepositorio = indexOf(['repositorio', 'repo']);
  const idxCoordenadoria = indexOf(['coordenadoria', 'coord', 'unidade']);
  const idxQuantidade = indexOf(['quantidade', 'qtd', 'qtde']);
  const idxTipo = indexOf(['tipo']);

  if (idxRepositorio < 0 || idxColaborador < 0) {
    throw new Error('CSV inválido: colunas obrigatórias Colaborador e Repositório');
  }

  const registros: RegistroProducao[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = isTab
      ? (lines[i] ?? '').split('\t').map((c) => c.trim())
      : splitCsvLine(lines[i] ?? '', separator);
    const colaborador = (cols[idxColaborador] ?? '').trim();
    const repositorio = (cols[idxRepositorio] ?? '').trim();
    if (!colaborador || !repositorio) continue;
    registros.push({
      data: idxData >= 0 ? (cols[idxData] ?? '').trim() : '',
      colaborador,
      funcao: idxFuncao >= 0 ? (cols[idxFuncao] ?? '').trim() : '',
      repositorio,
      coordenadoria: idxCoordenadoria >= 0 ? (cols[idxCoordenadoria] ?? '').trim() : '',
      quantidade: idxQuantidade >= 0 ? (cols[idxQuantidade] ?? '').trim() : '',
      tipo: idxTipo >= 0 ? (cols[idxTipo] ?? '').trim() : '',
    });
  }

  return registros;
}

export function ImportarProducaoPage(): JSX.Element {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const [processando, setProcessando] = useState(false);
  const toast = useToastHelpers();
  const confirmDialog = useConfirmDialog();

  const [registrosProducao, setRegistrosProducao] = useState<RegistroProducao[]>([]);
  const [arquivoNomeProducao, setArquivoNomeProducao] = useState('');
  const [fonteProducao, setFonteProducao] = useState<'csv' | 'sheets' | 'colar'>('csv');
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [dadosColados, setDadosColados] = useState('');

  const [previewImportacao, setPreviewImportacao] = useState<PreviewImportacao | null>(null);
  const [validando, setValidando] = useState(false);

  const isAdmin = (usuario?.perfilAtivo ?? usuario?.perfil) === 'administrador';
  const previewProducao = useMemo(() => registrosProducao.slice(0, 10), [registrosProducao]);

  // Fontes de importação (saved links)
  const [novaFonteNome, setNovaFonteNome] = useState('');
  const [novaFonteUrl, setNovaFonteUrl] = useState('');
  const [importandoFonteId, setImportandoFonteId] = useState<string | null>(null);
  const [validandoFonteId, setValidandoFonteId] = useState<string | null>(null);
  const [validacaoResult, setValidacaoResult] = useState<ValidacaoResult | null>(null);
  const [importandoTodas, setImportandoTodas] = useState(false);
  const [resultadoImportacaoTodas, setResultadoImportacaoTodas] =
    useState<ResultadoImportacaoTodas | null>(null);
  const [ultimoResultado, setUltimoResultado] = useState<{
    fonte: string;
    importados: number;
    duplicados: number;
    erros: number;
  } | null>(null);

  const fontesQuery = useFontesImportacao();
  const fontes = fontesQuery.data ?? [];
  const criarFonteMut = useCriarFonteImportacao();
  const excluirFonteMut = useExcluirFonteImportacao();
  const importarFonteMut = useImportarFonte();
  const importarTodasMut = useImportarTodasFontes();

  // React Query
  const historicoQuery = useImportacoesHistorico();
  const historico = historicoQuery.data?.itens ?? [];
  const carregando = historicoQuery.isLoading || fontesQuery.isLoading;
  const erro =
    historicoQuery.error || fontesQuery.error
      ? { message: 'Erro ao carregar dados', details: 'Falha desconhecida' }
      : null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.importacoesHistorico });
  };

  const handleSalvarFonte = async (): Promise<void> => {
    if (!novaFonteNome.trim() || !novaFonteUrl.trim()) {
      toast.error('Preencha o nome e a URL da planilha.');
      return;
    }
    try {
      await criarFonteMut.mutateAsync({ nome: novaFonteNome.trim(), url: novaFonteUrl.trim() });
      setNovaFonteNome('');
      setNovaFonteUrl('');
      toast.success('Fonte de importação salva.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao salvar fonte'));
    }
  };

  const handleImportarFonte = async (id: string): Promise<void> => {
    setImportandoFonteId(id);
    setUltimoResultado(null);
    try {
      const result = await importarFonteMut.mutateAsync(id);
      setUltimoResultado({
        fonte: result.fonte,
        importados: result.importados,
        duplicados: result.duplicados,
        erros: result.erros,
      });
      if (result.importados > 0) {
        toast.success(
          `${result.fonte}: ${result.importados} novos registros importados. ${result.duplicados} duplicados ignorados.`
        );
      } else if (result.duplicados > 0) {
        toast.success(
          `${result.fonte}: Nenhum registro novo. ${result.duplicados} duplicados ignorados.`
        );
      } else {
        toast.success(`${result.fonte}: nenhum novo registro para importar.`);
      }
      await invalidate();
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao importar'));
    } finally {
      setImportandoFonteId(null);
    }
  };

  const handleValidarDuplicatas = async (id: string): Promise<void> => {
    setValidandoFonteId(id);
    setValidacaoResult(null);
    try {
      const result = await queryClient.fetchQuery({
        queryKey: ['importacao-duplicatas', id],
        queryFn: () => api.post(`/operacional/fontes-importacao/${id}/validar-duplicatas`),
      });
      setValidacaoResult(result as ValidacaoResult);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao validar duplicatas.'));
    } finally {
      setValidandoFonteId(null);
    }
  };

  const handleImportarTodas = async (): Promise<void> => {
    if (fontes.length === 0) {
      toast.error('Nenhuma fonte de importação cadastrada.');
      return;
    }

    setImportandoTodas(true);
    setResultadoImportacaoTodas(null);
    try {
      const result = await importarTodasMut.mutateAsync();
      setResultadoImportacaoTodas(result);

      const { resumo } = result;
      if (resumo.importados > 0) {
        toast.success(
          `Importação em lote: ${resumo.importados} novos registros importados. ${resumo.duplicados} duplicados ignorados.`
        );
      } else if (resumo.duplicados > 0) {
        toast.success(
          `Importação em lote: Nenhum registro novo. ${resumo.duplicados} duplicados ignorados.`
        );
      } else {
        toast.success('Importação em lote: nenhum novo registro para importar.');
      }

      await invalidate();
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao importar todas as fontes'));
    } finally {
      setImportandoTodas(false);
    }
  };

  const handleExcluirFonte = (id: string, nome: string): void => {
    confirmDialog.confirm({
      title: 'Excluir fonte de importação',
      message: `Deseja excluir a fonte "${nome}"? Isso não remove dados já importados.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await excluirFonteMut.mutateAsync(id);
          toast.success('Fonte excluída.');
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Erro ao excluir'));
        }
      },
    });
  };

  const handleUploadCsvProducao = async (file: File | null): Promise<void> => {
    if (!file) return;
    try {
      setProcessando(true);
      const text = await file.text();
      const parsed = parseCsvToProducao(text);
      setRegistrosProducao(parsed);
      setArquivoNomeProducao(file.name);
      toast.success(`${parsed.length} registros de produção prontos para importar.`);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Falha ao ler CSV'));
      setRegistrosProducao([]);
      setArquivoNomeProducao('');
    } finally {
      setProcessando(false);
    }
  };

  const importarProdMut = useImportarProducaoLegado();
  const previewImportacaoMut = usePreviewImportacaoProducaoLegado();
  const rollbackImportacaoMut = useRollbackImportacaoLegado();
  const limparMut = useLimparImportacoesLegado();
  const fetchSheetsMut = useFetchSheets();

  const handleFetchSheets = async (): Promise<void> => {
    if (!sheetsUrl.trim()) {
      toast.error('Cole a URL da planilha do Google Sheets.');
      return;
    }
    try {
      setProcessando(true);
      const result = await fetchSheetsMut.mutateAsync(sheetsUrl.trim());
      const parsed = parseCsvToProducao(result.csv);
      setRegistrosProducao(parsed);
      setArquivoNomeProducao('Google Sheets');
      toast.success(`${parsed.length} registros de produção carregados do Sheets.`);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Falha ao buscar dados do Google Sheets'));
      setRegistrosProducao([]);
      setArquivoNomeProducao('');
    } finally {
      setProcessando(false);
    }
  };

  const handleCarregarColados = (): void => {
    if (!dadosColados.trim()) {
      toast.error('Cole os dados copiados da planilha.');
      return;
    }
    try {
      const parsed = parseCsvToProducao(dadosColados);
      if (parsed.length === 0) {
        toast.error('Nenhum registro válido. Verifique o cabeçalho e uma linha.');
        return;
      }
      setRegistrosProducao(parsed);
      setArquivoNomeProducao('Dados Colados');
      toast.success(`${parsed.length} registros de produção carregados.`);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Falha ao processar dados colados'));
      setRegistrosProducao([]);
      setArquivoNomeProducao('');
    }
  };

  const gerarPreviewImportacao = async (regs: object[]): Promise<PreviewImportacao | null> => {
    try {
      setValidando(true);
      return await previewImportacaoMut.mutateAsync({ registros: regs });
    } catch {
      return null;
    } finally {
      setValidando(false);
    }
  };

  const executarImportacaoProducao = async (regs: RegistroProducao[]): Promise<void> => {
    try {
      setProcessando(true);
      const result = await importarProdMut.mutateAsync({ registros: regs });
      toast.success(
        `Importação de produção concluída. Importados: ${result.registrosSucesso}. Com erro: ${result.registrosErro}.`
      );
      setRegistrosProducao([]);
      setArquivoNomeProducao('');
      await invalidate();
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Falha na importação.'));
    } finally {
      setProcessando(false);
    }
  };

  const handleImportarProducao = async (): Promise<void> => {
    if (registrosProducao.length === 0) {
      toast.error('Carregue os dados antes de importar.');
      return;
    }
    const preview = await gerarPreviewImportacao(registrosProducao);
    if (!preview) {
      toast.error('Não foi possível gerar a pré-visualização da importação.');
      return;
    }
    setPreviewImportacao(preview);
  };

  const handleConfirmarImportacao = async (): Promise<void> => {
    if (!previewImportacao) return;
    const validos = previewImportacao.registrosValidos;
    setPreviewImportacao(null);
    if (validos <= 0) {
      toast.error('Nenhum registro válido para importar.');
      return;
    }
    await executarImportacaoProducao(registrosProducao);
  };

  const handleLimparImportacoes = (): void => {
    confirmDialog.confirm({
      title: 'Excluir dados importados',
      message:
        'Esta ação administrativa excluirá dados importados persistidos, incluindo produções importadas, repositórios legados, checklists legados e histórico de importações. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir definitivamente',
      variant: 'danger',
      onConfirm: async () => {
        try {
          setProcessando(true);
          const result = await limparMut.mutateAsync();
          const r = result.removidos;
          toast.success(
            `Dados importados excluídos. Produção: ${r.producao}. Repositórios: ${r.repositorios}. Importações: ${r.importacoes}.`
          );
          setRegistrosProducao([]);
          setArquivoNomeProducao('');
          await invalidate();
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Falha ao limpar dados'));
        } finally {
          setProcessando(false);
        }
      },
    });
  };

  const handleBaixarErrosCsv = async (id: string): Promise<void> => {
    try {
      await api.download(
        `/api/operacional/importacoes-legado/${id}/erros-csv`,
        `importacao-erros-${id}.csv`
      );
      toast.success('CSV de erros baixado.');
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Falha ao baixar CSV de erros'));
    }
  };

  const handleRollbackImportacao = (id: string): void => {
    confirmDialog.confirm({
      title: 'Desfazer importação',
      message:
        'Essa ação desfaz inserções e atualizações desta importação de produção. Deseja continuar?',
      confirmLabel: 'Desfazer',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const r = await rollbackImportacaoMut.mutateAsync(id);
          toast.success(`${r.message} (removidos: ${r.removidos}, restaurados: ${r.restaurados})`);
          await invalidate();
          void queryClient.invalidateQueries({ queryKey: queryKeys.producaoAll });
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        } catch (error) {
          toast.error(extractErrorMessage(error, 'Falha ao executar rollback'));
        }
      },
    });
  };

  const erroComAcao = erro
    ? {
        ...erro,
        action: { label: 'Tentar novamente', onClick: () => void invalidate() },
      }
    : null;

  const [historicoAberto, setHistoricoAberto] = useState(false);

  return (
    <PageState loading={carregando} loadingMessage="Carregando..." error={erroComAcao}>
      {/* Modal de Duplicidades */}
      {previewImportacao && (
        <Suspense fallback={null}>
          <PreviewImportacaoModal
            preview={previewImportacao}
            processando={processando}
            onConfirm={() => void handleConfirmarImportacao()}
            onClose={() => setPreviewImportacao(null)}
          />
        </Suspense>
      )}

      <div className="space-y-6">
        <PageHeader
          title="Importar Produção"
          subtitle="Carregue, revise e importe dados históricos."
          actions={
            isAdmin ? (
              <Button
                variant="danger"
                onClick={() => void handleLimparImportacoes()}
                loading={processando}
              >
                Excluir dados importados
              </Button>
            ) : undefined
          }
        />

        <ConfirmDialog
          state={confirmDialog.state}
          loading={confirmDialog.loading}
          onConfirm={() => void confirmDialog.handleConfirm()}
          onCancel={confirmDialog.close}
        />

        {/* Fontes Cadastradas */}
        <Card>
          <CardHeader
            title="Fontes Cadastradas"
            description="Salve links para importar mais rapido."
          />
          {fontes.length > 0 ? (
            <div className="mb-4 space-y-3">
              {fontes.map((f) => (
                <div
                  key={f.id}
                  className="rounded-xl border border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {f.nome}
                      </p>
                      <p className="mt-1 break-all text-xs text-[var(--color-text-tertiary)]">
                        {f.url}
                      </p>
                      {f.ultima_importacao_em && (
                        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                          Última importação:{' '}
                          {new Date(f.ultima_importacao_em).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                      <Button
                        size="md"
                        variant="secondary"
                        fullWidth
                        onClick={() => void handleValidarDuplicatas(f.id)}
                        loading={validandoFonteId === f.id}
                        disabled={importandoFonteId !== null || validandoFonteId !== null}
                      >
                        Validar duplicatas
                      </Button>
                      <Button
                        size="md"
                        fullWidth
                        onClick={() => void handleImportarFonte(f.id)}
                        loading={importandoFonteId === f.id}
                        disabled={importandoFonteId !== null || validandoFonteId !== null}
                      >
                        Importar
                      </Button>
                      <Button
                        type="button"
                        size="md"
                        variant="ghost"
                        fullWidth
                        onClick={() => handleExcluirFonte(f.id, f.nome)}
                        className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                        title="Excluir fonte"
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
              Nenhuma fonte salva. Adicione um link do Google Sheets abaixo.
            </p>
          )}

          {ultimoResultado && (
            <div className="mb-4 rounded-xl border border-[var(--color-primary-100)] bg-[var(--color-primary-50)] p-4 text-sm">
              <p className="font-medium text-[var(--color-text-primary)]">
                {ultimoResultado.fonte}
              </p>
              <p className="mt-1 text-[var(--color-text-secondary)]">
                <span className="font-semibold text-[var(--color-primary-700)]">
                  {ultimoResultado.importados}
                </span>{' '}
                novos
                {' - '}
                <span className="text-[var(--color-text-tertiary)]">
                  {ultimoResultado.duplicados} duplicados ignorados
                </span>
                {ultimoResultado.erros > 0 && (
                  <>
                    {' - '}
                    <span className="text-[var(--color-text-secondary)]">
                      {ultimoResultado.erros} erros
                    </span>
                  </>
                )}
              </p>
            </div>
          )}

          {validacaoResult && (
            <div className="mb-4 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm dark:border-warning-800 dark:bg-warning-950">
              <p className="font-medium text-[var(--color-text-primary)]">
                {validacaoResult.fonte.nome} - Validação de duplicatas
              </p>
              <p className="mt-1 text-[var(--color-text-secondary)]">
                <span className="font-semibold text-success-700 dark:text-success-300">
                  {validacaoResult.novos.quantidade}
                </span>{' '}
                novos registros
                {' - '}
                <span className="text-warning-700 dark:text-warning-300">
                  {validacaoResult.duplicados.quantidade} duplicados
                </span>
                {' · '}
                <span className="text-[var(--color-text-tertiary)]">
                  {validacaoResult.total} total
                </span>
              </p>
              {validacaoResult.novos.quantidade > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                    Ver novos registros (amostra)
                  </summary>
                  <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {validacaoResult.novos.itens.slice(0, 3).map((item, i) => (
                      <div
                        key={i}
                        className="border-b border-[var(--color-border-primary)] py-1 last:border-0"
                      >
                        Linha {item.linha}: {item.dados.colaborador} - {item.dados.repositorio}
                      </div>
                    ))}
                    {validacaoResult.novos.quantidade > 3 && (
                      <p className="mt-1 text-[var(--color-text-tertiary)]">
                        ... e mais {validacaoResult.novos.quantidade - 3} registros
                      </p>
                    )}
                  </div>
                </details>
              )}
              {validacaoResult.duplicados.quantidade > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                    Ver duplicados (amostra)
                  </summary>
                  <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {validacaoResult.duplicados.itens.slice(0, 3).map((item, i) => (
                      <div
                        key={i}
                        className="border-b border-[var(--color-border-primary)] py-1 last:border-0"
                      >
                        Linha {item.linha}: {item.dados.colaborador} - {item.dados.repositorio}
                      </div>
                    ))}
                    {validacaoResult.duplicados.quantidade > 3 && (
                      <p className="mt-1 text-[var(--color-text-tertiary)]">
                        ... e mais {validacaoResult.duplicados.quantidade - 3} duplicados
                      </p>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}

          {resultadoImportacaoTodas && (
            <div className="mb-4 rounded-xl border border-success-100 bg-success-50 p-4 text-sm dark:border-success-900 dark:bg-success-950">
              <p className="font-medium text-[var(--color-text-primary)]">
                Importação em lote concluída
              </p>
              <p className="mt-1 text-[var(--color-text-secondary)]">
                <span className="font-semibold text-success-700 dark:text-success-300">
                  {resultadoImportacaoTodas.resumo.importados}
                </span>{' '}
                novos
                {' · '}
                <span className="text-warning-700 dark:text-warning-300">
                  {resultadoImportacaoTodas.resumo.duplicados} duplicados
                </span>
                {' · '}
                <span className="text-error-700 dark:text-error-300">
                  {resultadoImportacaoTodas.resumo.erros} erros
                </span>
                {' · '}
                <span className="text-[var(--color-text-tertiary)]">
                  {resultadoImportacaoTodas.total} fontes processadas
                </span>
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
                  Ver detalhes por fonte
                </summary>
                <div className="mt-1 space-y-1">
                  {resultadoImportacaoTodas.resultados.map((resultado, i) => (
                    <div
                      key={i}
                      className={`py-1 px-2 rounded text-xs ${
                        resultado.sucesso
                          ? 'bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-300'
                          : 'bg-error-50 text-error-700 dark:bg-error-950 dark:text-error-300'
                      }`}
                    >
                      {resultado.fonte}: {resultado.importados} novos, {resultado.duplicados}{' '}
                      duplicados
                      {resultado.erros > 0 && `, ${resultado.erros} erros`}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <Input
                placeholder="Nome (ex: Produção Janeiro)"
                value={novaFonteNome}
                onChange={(e) => setNovaFonteNome(e.target.value)}
                inputSize="sm"
              />
            </div>
            <div className="min-w-0">
              <Input
                type="url"
                placeholder="URL do Google Sheets"
                value={novaFonteUrl}
                onChange={(e) => setNovaFonteUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSalvarFonte();
                  }
                }}
                inputSize="sm"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              fullWidth
              onClick={() => void handleSalvarFonte()}
              loading={criarFonteMut.isPending}
            >
              Salvar fonte
            </Button>
          </div>
        </Card>

        {/* Main import card */}
        <Card>
          <CardHeader
            title="Importar Produção"
            description="Escolha a origem, carregue os dados e revise antes de importar."
            action={
              fontes.length > 0 ? (
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  onClick={() => void handleImportarTodas()}
                  loading={importandoTodas}
                  disabled={
                    importandoTodas || importandoFonteId !== null || validandoFonteId !== null
                  }
                >
                  Importar todas ({fontes.length})
                </Button>
              ) : undefined
            }
          />

          {/* Source tabs */}
          <CardSection>
            <div className="mb-4 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
              <div className="mb-3 flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]">
                <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                  1. Carregar origem
                </span>
                <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                  2. Conferir preview
                </span>
                <span className="rounded-full bg-[var(--color-bg-primary)] px-3 py-1">
                  3. Importar
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 rounded-xl bg-[var(--color-bg-primary)] p-1 sm:grid-cols-3">
                {[
                  { key: 'csv' as const, label: 'Arquivo CSV' },
                  { key: 'sheets' as const, label: 'Google Sheets' },
                  { key: 'colar' as const, label: 'Colar Dados' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setFonteProducao(opt.key)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      fonteProducao === opt.key
                        ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] shadow-sm'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {fonteProducao === 'csv' && (
              <div className="space-y-3 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                <input
                  type="file"
                  accept=".csv,text/csv,.tsv,.txt"
                  onChange={(e) => void handleUploadCsvProducao(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-[var(--color-text-primary)]"
                />
                <p className="text-xs text-[var(--color-text-secondary)]">
                  CSV ou TSV. Obrigatório: <strong>Colaborador</strong> e{' '}
                  <strong>Repositório</strong>.
                </p>
              </div>
            )}

            {fonteProducao === 'sheets' && (
              <div className="space-y-3 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <Input
                      type="url"
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetsUrl}
                      onChange={(e) => setSheetsUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleFetchSheets();
                        }
                      }}
                      inputSize="sm"
                    />
                  </div>
                  <Button
                    onClick={() => void handleFetchSheets()}
                    loading={processando}
                    size="md"
                    fullWidth
                  >
                    Buscar
                  </Button>
                </div>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Use uma planilha com acesso por link.
                </p>
              </div>
            )}

            {fonteProducao === 'colar' && (
              <div className="space-y-3 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
                <textarea
                  placeholder={
                    'Data\tColaborador\tFunção\tRepositório\tCoordenadoria\tQuantidade\tTipo\n01/01/2025\tJoão Silva\tPreparação\tREP-001\tCOORD-A\t50\tProcesso'
                  }
                  value={dadosColados}
                  onChange={(e) => setDadosColados(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm font-mono text-[var(--color-text-primary)] focus:border-[var(--color-primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-300)]"
                />
                <Button onClick={handleCarregarColados} size="md" fullWidth className="sm:w-auto">
                  Processar dados
                </Button>
              </div>
            )}
          </CardSection>

          {/* Import action */}
          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              onClick={() => void handleImportarProducao()}
              loading={processando || validando}
              disabled={registrosProducao.length === 0}
              fullWidth
              size="md"
              className="sm:w-auto"
            >
              {validando ? 'Verificando...' : 'Importar Produção'}
            </Button>
            <span className="text-sm text-[var(--color-text-secondary)]">
              {arquivoNomeProducao
                ? `${arquivoNomeProducao} - ${registrosProducao.length} registros`
                : 'Nenhum dado carregado'}
            </span>
          </CardFooter>

          {/* Inline preview (only when data loaded) */}
          {previewProducao.length > 0 && (
            <CardSection
              title="Pré-visualização"
              description={
                registrosProducao.length > 10
                  ? `Mostrando 10 de ${registrosProducao.length} registros.`
                  : `${registrosProducao.length} registros carregados.`
              }
              className="mt-5 border-t border-[var(--color-border-secondary)] pt-4"
            >
              <div className="space-y-3 lg:hidden">
                {previewProducao.map((row, index) => (
                  <div
                    key={`${row.repositorio}-${index}`}
                    className="rounded-xl border border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          {row.colaborador}
                        </p>
                        <p className="mt-1 break-all font-mono text-xs text-[var(--color-text-secondary)]">
                          {row.repositorio}
                        </p>
                      </div>
                      <span className="rounded-full bg-[var(--color-gray-100)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                        {row.quantidade || 'Sem qtd'}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-[var(--color-text-tertiary)]">Data</dt>
                        <dd className="mt-1 text-[var(--color-text-primary)]">{row.data || '-'}</dd>
                      </div>
                      <div>
                        <dt className="text-[var(--color-text-tertiary)]">Função</dt>
                        <dd className="mt-1 text-[var(--color-text-primary)]">
                          {row.funcao || '-'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--color-text-tertiary)]">Coordenadoria</dt>
                        <dd className="mt-1 text-[var(--color-text-primary)]">
                          {row.coordenadoria || '-'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--color-text-tertiary)]">Tipo</dt>
                        <dd className="mt-1 text-[var(--color-text-primary)]">{row.tipo || '-'}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto lg:block">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Data (planilha)</TableHeader>
                      <TableHeader>Colaborador</TableHeader>
                      <TableHeader>Função</TableHeader>
                      <TableHeader>Repositório</TableHeader>
                      <TableHeader>Coord.</TableHeader>
                      <TableHeader>Qtd</TableHeader>
                      <TableHeader>Tipo</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewProducao.map((row, index) => (
                      <TableRow key={`${row.repositorio}-${index}`}>
                        <TableCell>{row.data}</TableCell>
                        <TableCell>{row.colaborador}</TableCell>
                        <TableCell>{row.funcao}</TableCell>
                        <TableCell className="font-mono text-xs">{row.repositorio}</TableCell>
                        <TableCell>{row.coordenadoria}</TableCell>
                        <TableCell>{row.quantidade}</TableCell>
                        <TableCell>{row.tipo}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardSection>
          )}
        </Card>

        {/* Collapsible history */}
        {historico.length > 0 && (
          <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-sm">
            <button
              type="button"
              onClick={() => setHistoricoAberto(!historicoAberto)}
              className="flex w-full items-center justify-between px-5 py-4 text-left"
            >
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                Histórico de Importações ({historico.length})
              </span>
              <span className="text-xs text-[var(--color-text-tertiary)]">
                {historicoAberto ? 'Recolher' : 'Expandir'}
              </span>
            </button>
            {historicoAberto && (
              <div className="px-5 pb-4">
                <div className="space-y-3 lg:hidden">
                  {historico.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--color-text-primary)]">
                            {item.usuario_destino_nome}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                            {new Date(item.criado_em).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <span className="rounded-full bg-[var(--color-gray-100)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
                          {item.tipo}
                        </span>
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-[var(--color-text-tertiary)]">Executado por</dt>
                          <dd className="mt-1 text-[var(--color-text-primary)]">
                            {item.executado_por_nome}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-text-tertiary)]">Total</dt>
                          <dd className="mt-1 text-[var(--color-text-primary)]">
                            {item.total_registros}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-text-tertiary)]">OK</dt>
                          <dd className="mt-1 text-[var(--color-text-primary)]">
                            {item.registros_sucesso}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-text-tertiary)]">Erro</dt>
                          <dd className="mt-1 text-[var(--color-text-primary)]">
                            {item.registros_erro}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <Button
                          size="sm"
                          variant="secondary"
                          fullWidth
                          onClick={() => void handleBaixarErrosCsv(item.id)}
                        >
                          Baixar CSV de erros
                        </Button>
                        {isAdmin && item.tipo === 'PRODUCAO' && (
                          <Button
                            size="sm"
                            variant="danger"
                            fullWidth
                            onClick={() => handleRollbackImportacao(item.id)}
                          >
                            Desfazer
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          fullWidth
                          onClick={() => {
                            const detalhes = {
                              id: item.id,
                              tipo: item.tipo,
                              criado_em: item.criado_em,
                              executado_por: item.executado_por,
                              usuario_destino_id: item.usuario_destino_id,
                              total_registros: item.total_registros,
                              registros_sucesso: item.registros_sucesso,
                              registros_erro: item.registros_erro,
                              detalhes_erros: item.detalhes_erros,
                            };
                            void navigator.clipboard
                              .writeText(JSON.stringify(detalhes, null, 2))
                              .then(() => {
                                toast.success('Detalhes copiados.');
                              });
                          }}
                        >
                          Copiar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden lg:block overflow-x-auto">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeader>Data</TableHeader>
                        <TableHeader>Destino</TableHeader>
                        <TableHeader>Executado por</TableHeader>
                        <TableHeader>Total</TableHeader>
                        <TableHeader>OK</TableHeader>
                        <TableHeader>Erro</TableHeader>
                        <TableHeader align="right"></TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {historico.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{new Date(item.criado_em).toLocaleString('pt-BR')}</TableCell>
                          <TableCell>{item.usuario_destino_nome}</TableCell>
                          <TableCell>{item.executado_por_nome}</TableCell>
                          <TableCell>{item.total_registros}</TableCell>
                          <TableCell>{item.registros_sucesso}</TableCell>
                          <TableCell>{item.registros_erro}</TableCell>
                          <TableCell align="right">
                            <div className="flex justify-end gap-2">
                              <button
                                className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                                onClick={() => void handleBaixarErrosCsv(item.id)}
                              >
                                Baixar CSV de erros
                              </button>
                              {isAdmin && item.tipo === 'PRODUCAO' && (
                                <button
                                  className="text-xs font-medium text-error-600 hover:text-error-700"
                                  onClick={() => handleRollbackImportacao(item.id)}
                                >
                                  Desfazer
                                </button>
                              )}
                              <button
                                className="text-xs font-medium text-[var(--color-primary-600)] hover:text-[var(--color-primary-800)]"
                                onClick={() => {
                                  const detalhes = {
                                    id: item.id,
                                    tipo: item.tipo,
                                    criado_em: item.criado_em,
                                    executado_por: item.executado_por,
                                    usuario_destino_id: item.usuario_destino_id,
                                    total_registros: item.total_registros,
                                    registros_sucesso: item.registros_sucesso,
                                    registros_erro: item.registros_erro,
                                    detalhes_erros: item.detalhes_erros,
                                  };
                                  void navigator.clipboard
                                    .writeText(JSON.stringify(detalhes, null, 2))
                                    .then(() => {
                                      toast.success('Detalhes copiados.');
                                    });
                                }}
                              >
                                Copiar
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PageState>
  );
}
