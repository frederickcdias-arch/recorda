import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageState } from '../../components/ui/PageState';
import { useToastHelpers } from '../../components/ui/Toast';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { extractErrorMessage } from '../../utils/errors';
import { api } from '../../services/api';
import {
  useImportacoesHistorico,
  useValidarDuplicidadesLegado, useImportarProducaoLegado, useLimparImportacoesLegado,
  useFetchSheets, useFontesImportacao, useCriarFonteImportacao, useExcluirFonteImportacao,
  useImportarFonte, useImportarTodasFontes, useQueryClient, queryKeys,
} from '../../hooks/useQueries';

interface RegistroProducao {
  data: string;
  colaborador: string;
  funcao: string;
  repositorio: string;
  coordenadoria: string;
  quantidade: string;
  tipo: string;
}

interface ValidacaoDuplicidade {
  totalRegistros: number;
  duplicadasPlanilha: number[];
  duplicadasBanco: number[];
  todasDuplicadas: number[];
  registrosValidos: number;
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
    ? (lines[0] ?? '').split('\t').map(h => h.trim())
    : splitCsvLine(lines[0] ?? '', separator);
  const headers = headersRaw.map(normalizeHeader);
  const indexOf = (aliases: string[]): number => headers.findIndex((h) => aliases.includes(h));

  const idxData = indexOf(['data', 'date']);
  const idxColaborador = indexOf(['colaborador', 'nome', 'funcionario']);
  const idxFuncao = indexOf(['funcao', 'função', 'cargo']);
  const idxRepositorio = indexOf(['repositorio', 'repositório', 'repo']);
  const idxCoordenadoria = indexOf(['coordenadoria', 'coord', 'unidade']);
  const idxQuantidade = indexOf(['quantidade', 'qtd', 'qtde']);
  const idxTipo = indexOf(['tipo']);

  if (idxRepositorio < 0 || idxColaborador < 0) {
    throw new Error('CSV inválido: colunas obrigatórias Colaborador e Repositório');
  }

  const registros: RegistroProducao[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = isTab
      ? (lines[i] ?? '').split('\t').map(c => c.trim())
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
      quantidade: idxQuantidade >= 0 ? (cols[idxQuantidade] ?? '1').trim() || '1' : '1',
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

  const [duplicidadeInfo, setDuplicidadeInfo] = useState<ValidacaoDuplicidade | null>(null);
  const [validando, setValidando] = useState(false);

  const isAdmin = usuario?.perfil === 'administrador';
  const previewProducao = useMemo(() => registrosProducao.slice(0, 10), [registrosProducao]);

  // Fontes de importação (saved links)
  const [novaFonteNome, setNovaFonteNome] = useState('');
  const [novaFonteUrl, setNovaFonteUrl] = useState('');
  const [importandoFonteId, setImportandoFonteId] = useState<string | null>(null);
  const [validandoFonteId, setValidandoFonteId] = useState<string | null>(null);
  const [validacaoResult, setValidacaoResult] = useState<any>(null);
  const [importandoTodas, setImportandoTodas] = useState(false);
  const [resultadoImportacaoTodas, setResultadoImportacaoTodas] = useState<any>(null);
  const [ultimoResultado, setUltimoResultado] = useState<{ fonte: string; importados: number; duplicados: number; erros: number } | null>(null);

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
  const erro = (historicoQuery.error || fontesQuery.error)
    ? { message: 'Erro ao Carregar Dados', details: 'Falha desconhecida' }
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
      setUltimoResultado({ fonte: result.fonte, importados: result.importados, duplicados: result.duplicados, erros: result.erros });
      if (result.importados > 0) {
        toast.success(`${result.fonte}: ${result.importados} novos registros importados. ${result.duplicados} duplicados ignorados.`);
      } else if (result.duplicados > 0) {
        toast.success(`${result.fonte}: Nenhum registro novo. ${result.duplicados} duplicados ignorados.`);
      } else {
        toast.success(`${result.fonte}: Nenhum registro para importar.`);
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
      setValidacaoResult(result);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Erro ao validar duplicatas'));
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
        toast.success(`Importação em lote: ${resumo.importados} novos registros importados. ${resumo.duplicados} duplicados ignorados.`);
      } else if (resumo.duplicados > 0) {
        toast.success(`Importação em lote: Nenhum registro novo. ${resumo.duplicados} duplicados ignorados.`);
      } else {
        toast.success('Importação em lote: Nenhum registro para importar.');
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
      title: 'Excluir Fonte de Importação',
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
      toast.success(`${parsed.length} Registros de Produção prontos para importar.`);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Falha ao ler CSV'));
      setRegistrosProducao([]);
      setArquivoNomeProducao('');
    } finally {
      setProcessando(false);
    }
  };

  const validarMut = useValidarDuplicidadesLegado();
  const importarProdMut = useImportarProducaoLegado();
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
      toast.success(`${parsed.length} Registros de Produção carregados do Sheets.`);
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
        toast.error('Nenhum registro válido encontrado nos dados colados. Verifique se copiou o cabeçalho e os dados.');
        return;
      }
      setRegistrosProducao(parsed);
      setArquivoNomeProducao('Dados Colados');
      toast.success(`${parsed.length} Registros de Produção carregados.`);
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Falha ao processar dados colados'));
      setRegistrosProducao([]);
      setArquivoNomeProducao('');
    }
  };

  const validarDuplicidades = async (regs: object[]): Promise<ValidacaoDuplicidade | null> => {
    try {
      setValidando(true);
      return await validarMut.mutateAsync({ tipo: 'producao', registros: regs });
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
      toast.success(`Importação de Produção concluída. Sucesso: ${result.registrosSucesso} | Erros: ${result.registrosErro}`);
      setRegistrosProducao([]);
      setArquivoNomeProducao('');
      await invalidate();
    } catch (error) {
      toast.error(extractErrorMessage(error, 'Falha na importação'));
    } finally {
      setProcessando(false);
    }
  };

  const handleImportarProducao = async (): Promise<void> => {
    if (registrosProducao.length === 0) {
      toast.error('Carregue os dados antes de importar.');
      return;
    }
    const validacao = await validarDuplicidades(registrosProducao);
    if (validacao && validacao.todasDuplicadas.length > 0) {
      setDuplicidadeInfo(validacao);
      return;
    }

    await executarImportacaoProducao(registrosProducao);
  };

  const handleImportarApenasValidas = async (): Promise<void> => {
    if (!duplicidadeInfo) return;
    const linhasExcluir = new Set(duplicidadeInfo.todasDuplicadas);
    setDuplicidadeInfo(null);

    const validos = registrosProducao.filter((_, i) => !linhasExcluir.has(i + 1));
    if (validos.length === 0) {
      toast.error('Nenhum registro válido restante após remover duplicidades.');
      return;
    }
    await executarImportacaoProducao(validos);
  };

  const handleLimparImportacoes = (): void => {
    confirmDialog.confirm({
      title: 'Limpar Todos os Dados Importados',
      message: 'Isso removerá todas as produções importadas, repositórios legados, checklists legados e histórico de importações. Essa ação não pode ser desfeita.',
      confirmLabel: 'Limpar Tudo',
      variant: 'danger',
      onConfirm: async () => {
        try {
          setProcessando(true);
          const result = await limparMut.mutateAsync();
          const r = result.removidos;
          toast.success(`${result.mensagem} (Produção: ${r.producao}, Repositórios: ${r.repositorios}, Importações: ${r.importacoes})`);
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
      {duplicidadeInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 animate-scale-in">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Duplicidades Detectadas</h3>
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                <strong>{duplicidadeInfo.totalRegistros}</strong> registros na planilha.
                <strong className="text-blue-700"> {duplicidadeInfo.todasDuplicadas.length}</strong> duplicados.
                <strong className="text-gray-900"> {duplicidadeInfo.registrosValidos}</strong> válidos.
              </p>

              {duplicidadeInfo.duplicadasPlanilha.length > 0 && (
                <div>
                  <p className="font-semibold text-gray-700">Duplicadas na planilha:</p>
                  <p className="text-xs bg-gray-50 rounded p-2 max-h-24 overflow-y-auto font-mono">
                    Linhas: {duplicidadeInfo.duplicadasPlanilha.join(', ')}
                  </p>
                </div>
              )}

              {duplicidadeInfo.duplicadasBanco.length > 0 && (
                <div>
                  <p className="font-semibold text-gray-700">Já existentes no sistema:</p>
                  <p className="text-xs bg-blue-50 rounded p-2 max-h-24 overflow-y-auto font-mono">
                    Linhas: {duplicidadeInfo.duplicadasBanco.join(', ')}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              {duplicidadeInfo.registrosValidos > 0 && (
                <Button
                  onClick={() => void handleImportarApenasValidas()}
                  loading={processando}
                >
                  Importar apenas válidos ({duplicidadeInfo.registrosValidos})
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => setDuplicidadeInfo(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Importar Produção</h1>
            <p className="text-gray-500 mt-1">Carregue dados de produção via CSV, Google Sheets ou colando da planilha.</p>
          </div>
          {isAdmin && (
            <Button
              variant="secondary"
              onClick={() => void handleLimparImportacoes()}
              loading={processando}
              className="shrink-0"
            >
              Limpar Tudo
            </Button>
          )}
        </div>

        <ConfirmDialog
          state={confirmDialog.state}
          loading={confirmDialog.loading}
          onConfirm={() => void confirmDialog.handleConfirm()}
          onCancel={confirmDialog.close}
        />

        {/* Fontes Cadastradas */}
        <Card>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Fontes Cadastradas</h2>
          {fontes.length > 0 ? (
            <div className="space-y-2 mb-4">
              {fontes.map((f) => (
                <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{f.nome}</p>
                    <p className="text-xs text-gray-400 truncate">{f.url}</p>
                    {f.ultima_importacao_em && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Última importação: {new Date(f.ultima_importacao_em).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleValidarDuplicatas(f.id)}
                      loading={validandoFonteId === f.id}
                      disabled={importandoFonteId !== null || validandoFonteId !== null}
                    >
                      Validar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void handleImportarFonte(f.id)}
                      loading={importandoFonteId === f.id}
                      disabled={importandoFonteId !== null || validandoFonteId !== null}
                    >
                      Importar
                    </Button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExcluirFonte(f.id, f.nome)}
                    className="text-xs text-gray-400 hover:text-gray-700 transition"
                    title="Excluir fonte"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 mb-4">Nenhuma fonte cadastrada. Adicione um link do Google Sheets abaixo.</p>
          )}

          {ultimoResultado && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm">
              <p className="font-medium text-gray-900">{ultimoResultado.fonte}</p>
              <p className="text-gray-600 mt-1">
                <span className="font-semibold text-blue-700">{ultimoResultado.importados}</span> novos
                {' · '}<span className="text-gray-500">{ultimoResultado.duplicados} duplicados ignorados</span>
                {ultimoResultado.erros > 0 && <>{' · '}<span className="text-gray-600">{ultimoResultado.erros} erros</span></>}
              </p>
            </div>
          )}

          {validacaoResult && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-100 rounded-lg text-sm">
              <p className="font-medium text-gray-900">{validacaoResult.fonte.nome} - Validação de Duplicatas</p>
              <p className="text-gray-600 mt-1">
                <span className="font-semibold text-green-700">{validacaoResult.novos.quantidade}</span> novos registros
                {' · '}<span className="text-orange-600">{validacaoResult.duplicados.quantidade} duplicados</span>
                {' · '}<span className="text-gray-500">{validacaoResult.total} total</span>
              </p>
              {validacaoResult.novos.quantidade > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-800">Ver novos registros (amostra)</summary>
                  <div className="mt-1 text-xs text-gray-600">
                    {validacaoResult.novos.itens.slice(0, 3).map((item: any, i: number) => (
                      <div key={i} className="py-1 border-b border-gray-100 last:border-0">
                        Linha {item.linha}: {item.dados.colaborador} - {item.dados.repositorio}
                      </div>
                    ))}
                    {validacaoResult.novos.quantidade > 3 && (
                      <p className="text-gray-400 mt-1">... e mais {validacaoResult.novos.quantidade - 3} registros</p>
                    )}
                  </div>
                </details>
              )}
              {validacaoResult.duplicados.quantidade > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-800">Ver duplicados (amostra)</summary>
                  <div className="mt-1 text-xs text-gray-600">
                    {validacaoResult.duplicados.itens.slice(0, 3).map((item: any, i: number) => (
                      <div key={i} className="py-1 border-b border-gray-100 last:border-0">
                        Linha {item.linha}: {item.dados.colaborador} - {item.dados.repositorio}
                      </div>
                    ))}
                    {validacaoResult.duplicados.quantidade > 3 && (
                      <p className="text-gray-400 mt-1">... e mais {validacaoResult.duplicados.quantidade - 3} duplicados</p>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}

          {resultadoImportacaoTodas && (
            <div className="mb-4 p-3 bg-green-50 border border-green-100 rounded-lg text-sm">
              <p className="font-medium text-gray-900">Importação em Lote Concluída</p>
              <p className="text-gray-600 mt-1">
                <span className="font-semibold text-green-700">{resultadoImportacaoTodas.resumo.importados}</span> novos
                {' · '}<span className="text-orange-600">{resultadoImportacaoTodas.resumo.duplicados} duplicados</span>
                {' · '}<span className="text-red-600">{resultadoImportacaoTodas.resumo.erros} erros</span>
                {' · '}<span className="text-gray-500">{resultadoImportacaoTodas.total} fontes processadas</span>
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-800">Ver detalhes por fonte</summary>
                <div className="mt-1 space-y-1">
                  {resultadoImportacaoTodas.resultados.map((resultado: any, i: number) => (
                    <div key={i} className={`py-1 px-2 rounded text-xs ${
                      resultado.sucesso ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {resultado.fonte}: {resultado.importados} novos, {resultado.duplicados} duplicados
                      {resultado.erros > 0 && `, ${resultado.erros} erros`}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <input
              type="text"
              placeholder="Nome (ex: Produção Janeiro)"
              value={novaFonteNome}
              onChange={(e) => setNovaFonteNome(e.target.value)}
              className="w-48 h-9 px-3 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="url"
              placeholder="URL do Google Sheets"
              value={novaFonteUrl}
              onChange={(e) => setNovaFonteUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSalvarFonte(); } }}
              className="flex-1 h-9 px-3 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <Button size="sm" variant="secondary" onClick={() => void handleSalvarFonte()} loading={criarFonteMut.isPending}>
              Salvar
            </Button>
          </div>
        </Card>

        {/* Main import card */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Importar Produção</h2>
            {fontes.length > 0 && (
              <Button
                variant="primary"
                onClick={() => void handleImportarTodas()}
                loading={importandoTodas}
                disabled={importandoTodas || importandoFonteId !== null || validandoFonteId !== null}
              >
                Importar Todas ({fontes.length})
              </Button>
            )}
          </div>
          
          {/* Source tabs */}
          <div>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
              {([
                { key: 'csv' as const, label: 'Arquivo CSV' },
                { key: 'sheets' as const, label: 'Google Sheets' },
                { key: 'colar' as const, label: 'Colar Dados' },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setFonteProducao(opt.key)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    fonteProducao === opt.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {fonteProducao === 'csv' && (
              <div className="space-y-2">
                <input
                  type="file"
                  accept=".csv,text/csv,.tsv,.txt"
                  onChange={(e) => void handleUploadCsvProducao(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-700"
                />
                <p className="text-xs text-gray-400">
                  CSV ou TSV. Colunas obrigatórias: <strong>Colaborador</strong> e <strong>Repositório</strong>.
                </p>
              </div>
            )}

            {fonteProducao === 'sheets' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={sheetsUrl}
                    onChange={(e) => setSheetsUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleFetchSheets(); } }}
                    className="flex-1 h-9 px-3 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <Button onClick={() => void handleFetchSheets()} loading={processando} size="sm">
                    Buscar
                  </Button>
                </div>
                <p className="text-xs text-gray-400">
                  A planilha precisa estar com compartilhamento &quot;Qualquer pessoa com o link&quot;.
                </p>
              </div>
            )}

            {fonteProducao === 'colar' && (
              <div className="space-y-2">
                <textarea
                  placeholder={"Data\tColaborador\tFunção\tRepositório\tCoordenadoria\tQuantidade\tTipo\n01/01/2025\tJoão Silva\tPreparação\tREP-001\tCOORD-A\t50\tProcesso"}
                  value={dadosColados}
                  onChange={(e) => setDadosColados(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 text-sm border rounded-lg font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <Button onClick={handleCarregarColados} size="sm">
                  Processar Dados
                </Button>
              </div>
            )}
          </div>

          {/* Import action */}
          <div className="mt-4 pt-4 border-t flex items-center gap-3">
            <Button onClick={() => void handleImportarProducao()} loading={processando || validando} disabled={registrosProducao.length === 0}>
              {validando ? 'Verificando...' : 'Importar Produção'}
            </Button>
            <span className="text-sm text-gray-500">
              {arquivoNomeProducao ? `${arquivoNomeProducao} — ${registrosProducao.length} registros` : 'Nenhum dado carregado'}
            </span>
          </div>

          {/* Inline preview (only when data loaded) */}
          {previewProducao.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Preview ({registrosProducao.length > 10 ? `10 de ${registrosProducao.length}` : registrosProducao.length})</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Data</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Colaborador</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Função</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Repositório</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Coord.</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Qtd</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewProducao.map((row, index) => (
                      <tr key={`${row.repositorio}-${index}`} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-700">{row.data}</td>
                        <td className="px-3 py-1.5 text-gray-700">{row.colaborador}</td>
                        <td className="px-3 py-1.5 text-gray-700">{row.funcao}</td>
                        <td className="px-3 py-1.5 text-gray-700 font-mono text-xs">{row.repositorio}</td>
                        <td className="px-3 py-1.5 text-gray-700">{row.coordenadoria}</td>
                        <td className="px-3 py-1.5 text-gray-700">{row.quantidade}</td>
                        <td className="px-3 py-1.5 text-gray-700">{row.tipo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>

        {/* Collapsible history */}
        {historico.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <button
              type="button"
              onClick={() => setHistoricoAberto(!historicoAberto)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="text-sm font-semibold text-gray-900">Histórico de Importações ({historico.length})</span>
              <span className="text-xs text-gray-400">{historicoAberto ? 'Recolher' : 'Expandir'}</span>
            </button>
            {historicoAberto && (
              <div className="px-5 pb-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Data</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Destino</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Executado por</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Total</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">OK</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Erro</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historico.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700">{new Date(item.criado_em).toLocaleString('pt-BR')}</td>
                        <td className="px-3 py-2 text-gray-700">{item.usuario_destino_nome}</td>
                        <td className="px-3 py-2 text-gray-700">{item.executado_por_nome}</td>
                        <td className="px-3 py-2 text-gray-700">{item.total_registros}</td>
                        <td className="px-3 py-2 text-gray-700">{item.registros_sucesso}</td>
                        <td className="px-3 py-2 text-gray-700">{item.registros_erro}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
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
                              void navigator.clipboard.writeText(JSON.stringify(detalhes, null, 2)).then(() => {
                                toast.success('Detalhes copiados.');
                              });
                            }}
                          >
                            Copiar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </PageState>
  );
}
