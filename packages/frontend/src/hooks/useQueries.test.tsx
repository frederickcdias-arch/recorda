import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  useDashboard,
  useRepositorios,
  useSetoresRecebimento,
  useClassificacoesRecebimento,
  useEmpresa,
  useUsuarios,
  useCoordenadorias,
  useCreateRepositorio,
  useDeleteRepositorio,
  useSaveEmpresa,
  useRegisterUsuario,
  useDeleteProducao,
  useCriarSetorRecebimento,
  useCriarClassificacaoRecebimento,
  useOcrPreview,
  useCriarProcessoRecebimento,
  useExcluirProcessoRecebimento,
  useCriarApenso,
  useExcluirApenso,
  useVincularProcessos,
  useCriarLoteCQ,
  useAvaliarItemCQ,
  useFecharLoteCQ,
  queryKeys,
} from './useQueries';

// ─── Mock api ────────────────────────────────────────────────
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('../services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

// ─── Query Keys ──────────────────────────────────────────────
describe('queryKeys', () => {
  it('has stable static keys', () => {
    expect(queryKeys.dashboard).toEqual(['dashboard']);
    expect(queryKeys.empresa).toEqual(['empresa']);
    expect(queryKeys.usuarios).toEqual(['usuarios']);
    expect(queryKeys.coordenadorias).toEqual(['coordenadorias']);
    expect(queryKeys.setoresRecebimento).toEqual(['setores-recebimento']);
    expect(queryKeys.classificacoesRecebimento).toEqual(['classificacoes-recebimento']);
  });

  it('generates parameterized keys', () => {
    expect(queryKeys.repositorios({ pagina: 1, limite: 50 })).toEqual(['repositorios', { pagina: 1, limite: 50 }]);
    expect(queryKeys.auditoria({ pagina: 1 })).toEqual(['auditoria', { pagina: 1 }]);
    expect(queryKeys.producao({ pagina: 1 })).toEqual(['producao', { pagina: 1 }]);
    expect(queryKeys.conhecimentoDetalhe('abc')).toEqual(['conhecimento-detalhe', 'abc']);
    expect(queryKeys.recebimentoProcessos('repo1')).toEqual(['recebimento-processos', 'repo1']);
  });
});

// ─── Query Hooks ─────────────────────────────────────────────
describe('useDashboard', () => {
  it('fetches dashboard data', async () => {
    const data = { stats: { producaoTotal: 10 } };
    mockGet.mockResolvedValueOnce(data);

    const { result } = renderHook(() => useDashboard(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith('/dashboard');
    expect(result.current.data).toEqual(data);
  });
});

describe('useRepositorios', () => {
  it('builds query string from params', async () => {
    mockGet.mockResolvedValueOnce({ itens: [], total: 0, pagina: 1, totalPaginas: 1 });

    const { result } = renderHook(
      () => useRepositorios({ etapa: 'RECEBIMENTO', pagina: 1, limite: 50 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('etapa=RECEBIMENTO'));
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('pagina=1'));
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('limite=50'));
  });
});

describe('useSetoresRecebimento', () => {
  it('selects itens from response', async () => {
    mockGet.mockResolvedValueOnce({ itens: [{ id: '1', nome: 'Setor A' }] });

    const { result } = renderHook(() => useSetoresRecebimento(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: '1', nome: 'Setor A' }]);
  });
});

describe('useClassificacoesRecebimento', () => {
  it('selects itens from response', async () => {
    mockGet.mockResolvedValueOnce({ itens: [{ id: '2', nome: 'Classif B' }] });

    const { result } = renderHook(() => useClassificacoesRecebimento(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: '2', nome: 'Classif B' }]);
  });
});

describe('useEmpresa', () => {
  it('fetches empresa config', async () => {
    mockGet.mockResolvedValueOnce({ nome: 'Recorda' });

    const { result } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ nome: 'Recorda' });
  });
});

describe('useUsuarios', () => {
  it('fetches usuarios', async () => {
    mockGet.mockResolvedValueOnce({ usuarios: [{ id: '1', nome: 'Admin' }] });

    const { result } = renderHook(() => useUsuarios(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.usuarios).toHaveLength(1);
  });
});

describe('useCoordenadorias', () => {
  it('fetches coordenadorias', async () => {
    mockGet.mockResolvedValueOnce([{ id: '1', nome: 'Coord A', sigla: 'CA' }]);

    const { result } = renderHook(() => useCoordenadorias(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });
});

// ─── Mutation Hooks ──────────────────────────────────────────
describe('useCreateRepositorio', () => {
  it('posts and invalidates repositorios', async () => {
    mockPost.mockResolvedValueOnce({ id: 'new-repo' });

    const { result } = renderHook(() => useCreateRepositorio(), { wrapper });
    await result.current.mutateAsync({
      idRepositorioGed: 'GED-1',
      orgao: 'Org',
      projeto: 'Proj',
      classificacaoId: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(mockPost).toHaveBeenCalledWith('/operacional/repositorios', {
      idRepositorioGed: 'GED-1',
      orgao: 'Org',
      projeto: 'Proj',
      classificacaoId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });
});

describe('useDeleteRepositorio', () => {
  it('deletes by id', async () => {
    mockDelete.mockResolvedValueOnce({});

    const { result } = renderHook(() => useDeleteRepositorio(), { wrapper });
    await result.current.mutateAsync('repo-123');

    expect(mockDelete).toHaveBeenCalledWith('/operacional/repositorios/repo-123');
  });
});

describe('useSaveEmpresa', () => {
  it('puts config', async () => {
    mockPut.mockResolvedValueOnce({});

    const { result } = renderHook(() => useSaveEmpresa(), { wrapper });
    await result.current.mutateAsync({ nome: 'Empresa X' });

    expect(mockPut).toHaveBeenCalledWith('/configuracao/empresa', { nome: 'Empresa X' });
  });
});

describe('useRegisterUsuario', () => {
  it('posts register', async () => {
    mockPost.mockResolvedValueOnce({});

    const { result } = renderHook(() => useRegisterUsuario(), { wrapper });
    await result.current.mutateAsync({ email: 'a@b.com', nome: 'A', senha: '123', perfil: 'operador' });

    expect(mockPost).toHaveBeenCalledWith('/auth/register', { email: 'a@b.com', nome: 'A', senha: '123', perfil: 'operador' });
  });
});

describe('useDeleteProducao', () => {
  it('deletes by id', async () => {
    mockDelete.mockResolvedValueOnce({});

    const { result } = renderHook(() => useDeleteProducao(), { wrapper });
    await result.current.mutateAsync('prod-1');

    expect(mockDelete).toHaveBeenCalledWith('/producao/prod-1');
  });
});

// ─── Recebimento Mutation Hooks ─────────────────────────────
describe('useCriarSetorRecebimento', () => {
  it('posts setor name', async () => {
    mockPost.mockResolvedValueOnce({ id: 's1', nome: 'Setor X' });

    const { result } = renderHook(() => useCriarSetorRecebimento(), { wrapper });
    const created = await result.current.mutateAsync('Setor X');

    expect(mockPost).toHaveBeenCalledWith('/operacional/setores-recebimento', { nome: 'Setor X' });
    expect(created).toEqual({ id: 's1', nome: 'Setor X' });
  });
});

describe('useCriarClassificacaoRecebimento', () => {
  it('posts classificacao name', async () => {
    mockPost.mockResolvedValueOnce({ id: 'c1', nome: 'Classif Y' });

    const { result } = renderHook(() => useCriarClassificacaoRecebimento(), { wrapper });
    const created = await result.current.mutateAsync('Classif Y');

    expect(mockPost).toHaveBeenCalledWith('/operacional/classificacoes-recebimento', { nome: 'Classif Y' });
    expect(created).toEqual({ id: 'c1', nome: 'Classif Y' });
  });
});

describe('useOcrPreview', () => {
  it('posts OCR preview request', async () => {
    const preview = { protocolo: '123', interessado: 'João', textoExtraido: 'text', confianca: 0.95 };
    mockPost.mockResolvedValueOnce(preview);

    const { result } = renderHook(() => useOcrPreview(), { wrapper });
    const data = await result.current.mutateAsync({ repoId: 'repo-1', imagemBase64: 'base64data' });

    expect(mockPost).toHaveBeenCalledWith(
      '/operacional/repositorios/repo-1/ocr-preview',
      { imagemBase64: 'base64data' },
    );
    expect(data.protocolo).toBe('123');
  });
});

describe('useCriarProcessoRecebimento', () => {
  it('posts processo to repo endpoint', async () => {
    mockPost.mockResolvedValueOnce({ id: 'p1' });

    const { result } = renderHook(() => useCriarProcessoRecebimento(), { wrapper });
    await result.current.mutateAsync({
      repoId: 'repo-1',
      protocolo: 'PROT-1',
      interessado: 'Maria',
      volumeAtual: 1,
      volumeTotal: 2,
      origem: 'MANUAL',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/operacional/repositorios/repo-1/recebimento-processos',
      expect.objectContaining({ protocolo: 'PROT-1', interessado: 'Maria' }),
    );
  });
});

describe('useExcluirProcessoRecebimento', () => {
  it('deletes processo by id', async () => {
    mockDelete.mockResolvedValueOnce({});

    const { result } = renderHook(() => useExcluirProcessoRecebimento(), { wrapper });
    await result.current.mutateAsync('proc-1');

    expect(mockDelete).toHaveBeenCalledWith('/operacional/recebimento-processos/proc-1');
  });
});

describe('useCriarApenso', () => {
  it('posts apenso to processo endpoint', async () => {
    mockPost.mockResolvedValueOnce({ id: 'a1' });

    const { result } = renderHook(() => useCriarApenso(), { wrapper });
    await result.current.mutateAsync({
      processoId: 'proc-1',
      protocolo: 'AP-1',
      volumeAtual: 1,
      volumeTotal: 1,
      origem: 'MANUAL',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/operacional/recebimento-processos/proc-1/apensos',
      expect.objectContaining({ protocolo: 'AP-1' }),
    );
  });
});

describe('useExcluirApenso', () => {
  it('deletes apenso by id', async () => {
    mockDelete.mockResolvedValueOnce({});

    const { result } = renderHook(() => useExcluirApenso(), { wrapper });
    await result.current.mutateAsync('apenso-1');

    expect(mockDelete).toHaveBeenCalledWith('/operacional/recebimento-apensos/apenso-1');
  });
});

describe('useVincularProcessos', () => {
  it('patches vincular endpoint', async () => {
    mockPatch.mockResolvedValueOnce({ vinculados: 3 });

    const { result } = renderHook(() => useVincularProcessos(), { wrapper });
    const data = await result.current.mutateAsync({ processoIds: ['a', 'b', 'c'], repositorioId: 'repo-1' });

    expect(mockPatch).toHaveBeenCalledWith('/operacional/recebimento-processos/vincular', {
      processoIds: ['a', 'b', 'c'],
      repositorioId: 'repo-1',
    });
    expect(data.vinculados).toBe(3);
  });
});

// ─── CQ Mutation Hooks ──────────────────────────────────────
describe('useCriarLoteCQ', () => {
  it('posts lote CQ', async () => {
    mockPost.mockResolvedValueOnce({ id: 'lote-1', codigo: 'CQ-001' });

    const { result } = renderHook(() => useCriarLoteCQ(), { wrapper });
    await result.current.mutateAsync({ codigo: 'CQ-001', repositorioIds: ['r1', 'r2'] });

    expect(mockPost).toHaveBeenCalledWith('/operacional/lotes-cq', {
      codigo: 'CQ-001',
      repositorioIds: ['r1', 'r2'],
    });
  });
});

describe('useAvaliarItemCQ', () => {
  it('patches item resultado', async () => {
    mockPatch.mockResolvedValueOnce({});

    const { result } = renderHook(() => useAvaliarItemCQ(), { wrapper });
    await result.current.mutateAsync({ loteId: 'l1', itemId: 'i1', resultado: 'APROVADO' });

    expect(mockPatch).toHaveBeenCalledWith('/operacional/lotes-cq/l1/itens/i1', {
      resultado: 'APROVADO',
    });
  });

  it('includes motivoCodigo when REPROVADO', async () => {
    mockPatch.mockResolvedValueOnce({});

    const { result } = renderHook(() => useAvaliarItemCQ(), { wrapper });
    await result.current.mutateAsync({ loteId: 'l1', itemId: 'i1', resultado: 'REPROVADO', motivoCodigo: 'NAO_CONFORME' });

    expect(mockPatch).toHaveBeenCalledWith('/operacional/lotes-cq/l1/itens/i1', {
      resultado: 'REPROVADO',
      motivoCodigo: 'NAO_CONFORME',
    });
  });
});

describe('useFecharLoteCQ', () => {
  it('posts fechar endpoint', async () => {
    mockPost.mockResolvedValueOnce({});

    const { result } = renderHook(() => useFecharLoteCQ(), { wrapper });
    await result.current.mutateAsync('lote-1');

    expect(mockPost).toHaveBeenCalledWith('/operacional/lotes-cq/lote-1/fechar');
  });
});

// ─── New Query Keys ─────────────────────────────────────────
describe('queryKeys (new)', () => {
  it('generates checklist keys', () => {
    expect(queryKeys.checklistsRepo('r1', 'RECEBIMENTO')).toEqual(['checklists-repo', 'r1', 'RECEBIMENTO', 'all']);
    expect(queryKeys.checklistsRepo('r1', 'RECEBIMENTO', true)).toEqual(['checklists-repo', 'r1', 'RECEBIMENTO', true]);
    expect(queryKeys.checklistDetalhe('ck1')).toEqual(['checklist-detalhe', 'ck1']);
  });

  it('generates documentos-recebimento key', () => {
    expect(queryKeys.documentosRecebimento('r1')).toEqual(['documentos-recebimento', 'r1']);
  });

  it('generates lotes-cq keys', () => {
    expect(queryKeys.lotesCQ).toEqual(['lotes-cq']);
    expect(queryKeys.loteCQDetalhe('l1')).toEqual(['lote-cq-detalhe', 'l1']);
  });
});
