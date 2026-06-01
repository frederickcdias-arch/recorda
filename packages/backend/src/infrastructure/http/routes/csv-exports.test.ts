/**
 * Testes de exportação CSV — validam formato padrão BR:
 *   - Separador ponto-e-vírgula (;)
 *   - UTF-8 BOM (\uFEFF) no início
 *   - Terminadores CRLF (\r\n)
 *   - Content-Type: text/csv; charset=utf-8
 *   - Cabeçalhos de coluna corretos
 */

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { QueryResult, QueryResultRow } from 'pg';
import type { DatabaseConnection } from '../../database/connection.js';
import { createServer } from '../server.js';

// Mocks fs/promises para o endpoint de recebimento que lê PDF do disco
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue(Buffer.from('fake-pdf-content')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 100 }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers locais
// ---------------------------------------------------------------------------

function makeResult<T extends QueryResultRow>(rows: T[], command = 'SELECT'): QueryResult<T> {
  return { command, rowCount: rows.length, oid: 0, fields: [], rows };
}

interface CsvTestData {
  relatoriosOperacionais?: Record<string, unknown>[];
  importacoesLegado?: Record<string, unknown>[];
}

function createCsvMockDatabase(data: CsvTestData = {}): DatabaseConnection {
  return {
    pool: {} as never,
    async query<T extends QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> {
      const t = text.trim();
      const mk = (rows: unknown[]) =>
        makeResult(rows as QueryResultRow[]) as unknown as QueryResult<T>;

      // Auth middleware — set_config / SET LOCAL
      if (t.includes('set_config') || /^SET\s+LOCAL/i.test(t)) {
        return mk([{ set_config: '' }]);
      }

      // relatorios_operacionais — usado pelo endpoint de recebimento CSV
      if (t.includes('FROM relatorios_operacionais')) {
        const id = String(params?.[0] ?? '');
        const rows = (data.relatoriosOperacionais ?? []).filter((r) => r['id'] === id);
        if (t.includes('dados_snapshot')) {
          return mk(rows.map((r) => ({ dados_snapshot: r['dados_snapshot'] })));
        }
        return mk(
          rows.map((r) => ({
            id: r['id'],
            tipo: r['tipo'],
            arquivo_path: r['arquivo_path'],
            gerado_em: r['gerado_em'],
          }))
        );
      }

      // importacoes_legado_operacional — usado pelo endpoint de erros CSV
      if (t.includes('FROM importacoes_legado_operacional')) {
        const id = String(params?.[0] ?? '');
        const rows = (data.importacoesLegado ?? []).filter((r) => r['id'] === id);
        return mk(
          rows.map((r) => ({
            id: r['id'],
            usuario_destino_id: r['usuario_destino_id'],
            detalhes_erros: r['detalhes_erros'],
          }))
        );
      }

      // Default: resultado vazio
      const command = t.split(/\s+/)[0]?.toUpperCase() ?? 'SELECT';
      return makeResult([], command) as unknown as QueryResult<T>;
    },
    async healthCheck() {
      return true;
    },
    async close() {},
  };
}

async function buildCsvServer(data: CsvTestData = {}): Promise<FastifyInstance> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-for-unit-tests-32chars!!';
  const database = createCsvMockDatabase(data);
  return createServer({ database, config: { host: '127.0.0.1', port: 0 } });
}

function adminToken(app: FastifyInstance): string {
  return (app as { jwt: { sign: (p: unknown) => string } }).jwt.sign({
    id: 'test-admin-id',
    email: 'admin@test.com',
    nome: 'Admin Teste',
    perfil: 'administrador',
    coordenadoriaId: null,
  });
}

function operadorToken(app: FastifyInstance): string {
  return (app as { jwt: { sign: (p: unknown) => string } }).jwt.sign({
    id: 'test-operador-id',
    email: 'operador@test.com',
    nome: 'Operador Teste',
    perfil: 'operador',
    coordenadoriaId: null,
  });
}

// Faz assertions comuns a todos os CSVs
function assertCsvFormat(body: string, expectedHeader: string, description: string): void {
  expect(body, `${description}: deve começar com BOM UTF-8`).toMatch(/^\uFEFF/);
  const withoutBom = body.slice(1);
  const lines = withoutBom.split('\r\n');
  expect(
    lines.length,
    `${description}: deve ter ao menos 1 linha (cabeçalho)`
  ).toBeGreaterThanOrEqual(1);
  expect(lines[0], `${description}: cabeçalho deve usar separador ponto-e-vírgula`).toBe(
    expectedHeader
  );
}

// ---------------------------------------------------------------------------
// 1. Ausências — GET /relatorios/ausencias/exportar
// ---------------------------------------------------------------------------

describe('CSV — /relatorios/ausencias/exportar', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildCsvServer();
    token = adminToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('retorna 200 com Content-Type text/csv', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/relatorios/ausencias/exportar',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('retorna CSV com BOM, CRLF e cabeçalho correto usando ponto-e-vírgula', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/relatorios/ausencias/exportar',
      headers: { authorization: `Bearer ${token}` },
    });

    const expectedHeader =
      '"Colaborador";"Tipo de Ausência";"Data Início";"Data Fim";"Dias";"Período";"Horas";"Status";"Justificativa";"Observações";"Motivo Rejeição";"Solicitado em"';

    assertCsvFormat(res.body, expectedHeader, 'ausencias');
  });

  it('rejeita requisições sem token (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/relatorios/ausencias/exportar',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejeita token de operador sem perfil admin (403)', async () => {
    const opToken = operadorToken(app);
    const res = await app.inject({
      method: 'GET',
      url: '/relatorios/ausencias/exportar',
      headers: { authorization: `Bearer ${opToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 2. Histórico de Comunicados — GET /admin/comunicados/exportar
// ---------------------------------------------------------------------------

describe('CSV — /admin/comunicados/exportar', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildCsvServer();
    token = adminToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('retorna 200 com Content-Type text/csv', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/comunicados/exportar',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('retorna CSV com BOM, CRLF e cabeçalho correto usando ponto-e-vírgula', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/comunicados/exportar',
      headers: { authorization: `Bearer ${token}` },
    });

    const expectedHeader =
      '"titulo";"tipo";"categoria";"status";"prioridade";"escopo";"leitura_obrigatoria";"criado_em";"publicado_em";"encerrado_em";"destinatarios";"lidos";"pendentes"';

    assertCsvFormat(res.body, expectedHeader, 'historico-comunicados');
  });

  it('rejeita token de operador sem perfil admin (403)', async () => {
    const opToken = operadorToken(app);
    const res = await app.inject({
      method: 'GET',
      url: '/admin/comunicados/exportar',
      headers: { authorization: `Bearer ${opToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 3. Relatório de Recebimento CSV — GET /operacional/relatorios/:id/download?formato=csv
// ---------------------------------------------------------------------------

describe('CSV — /operacional/relatorios/:id/download?formato=csv', () => {
  const REL_ID = 'rel-csv-1';

  const testRelatorio = {
    id: REL_ID,
    tipo: 'RECEBIMENTO',
    arquivo_path: 'relatorios/test.pdf',
    gerado_em: new Date().toISOString(),
    dados_snapshot: {
      processos: [
        {
          repositorio: '000001/2024',
          orgao: 'SEPLAG',
          protocolo: 'PROTO-001',
          interessado: 'João Silva',
          setor: 'Arquivo Geral',
          classificacao: 'SIGILOSO',
          volume: 2,
          numeroCaixas: 1,
          isApenso: false,
          obs: 'Observação teste',
        },
        {
          repositorio: '000002/2024',
          orgao: 'SEGOV',
          protocolo: 'PROTO-002',
          interessado: 'Maria; Souza', // ponto-e-vírgula no nome — deve ser escapado
          setor: 'TI',
          classificacao: 'PUBLICO',
          volume: 3,
          numeroCaixas: 2,
          isApenso: true,
          obs: '',
        },
      ],
    },
  };

  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildCsvServer({ relatoriosOperacionais: [testRelatorio] });
    token = operadorToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('retorna 404 quando relatório não encontrado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/operacional/relatorios/inexistente/download?formato=csv',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('retorna 200 com Content-Type text/csv quando relatório existe', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/operacional/relatorios/${REL_ID}/download?formato=csv`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('retorna CSV com BOM, CRLF e cabeçalho correto usando ponto-e-vírgula', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/operacional/relatorios/${REL_ID}/download?formato=csv`,
      headers: { authorization: `Bearer ${token}` },
    });

    const expectedHeader =
      '#;REPOSITORIO;UNIDADE;SETOR;PROTOCOLO;INTERESSADO;CLASSIFICACAO;VOLUME;CAIXAS;APENSO;OBS';
    assertCsvFormat(res.body, expectedHeader, 'relatorio-recebimento');
  });

  it('escapa corretamente campos com ponto-e-vírgula', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/operacional/relatorios/${REL_ID}/download?formato=csv`,
      headers: { authorization: `Bearer ${token}` },
    });

    // "Maria; Souza" contém ponto-e-vírgula, deve ser escapado com aspas
    expect(res.body).toContain('"Maria; Souza"');
  });

  it('usa SIM/NAO para coluna APENSO', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/operacional/relatorios/${REL_ID}/download?formato=csv`,
      headers: { authorization: `Bearer ${token}` },
    });

    const lines = res.body.slice(1).split('\r\n'); // remove BOM
    // linha 1 = cabeçalho, linha 2 = primeiro processo (NAO), linha 3 = segundo processo (SIM)
    expect(lines[1]).toContain(';NAO;');
    expect(lines[2]).toContain(';SIM;');
  });
});

// ---------------------------------------------------------------------------
// 4. Erros de Importação CSV — GET /operacional/importacoes-legado/:id/erros-csv
// ---------------------------------------------------------------------------

describe('CSV — /operacional/importacoes-legado/:id/erros-csv', () => {
  const IMP_ID = 'imp-csv-1';

  const testImportacao = {
    id: IMP_ID,
    usuario_destino_id: 'test-operador-id', // mesmo id do token
    detalhes_erros: {
      erros_amostra: [
        {
          linha: 2,
          erro: 'Data inválida',
          dados: {
            repositorio: '000001/2024',
            colaborador: 'João Silva',
            funcao: 'Digitalizador',
            tipo: 'Imagens',
            data: '32/13/2024',
            quantidade: 100,
          },
        },
        {
          linha: 5,
          erro: 'Colaborador; não encontrado', // ponto-e-vírgula — deve ser escapado
          dados: {
            repositorio: '000002/2024',
            colaborador: 'Maria',
            funcao: 'Conferente',
            tipo: 'Imagens',
            data: '2024-01-15',
            quantidade: 50,
          },
        },
      ],
    },
  };

  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildCsvServer({ importacoesLegado: [testImportacao] });
    token = operadorToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('retorna 404 quando importação não encontrada', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/operacional/importacoes-legado/inexistente/erros-csv',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('retorna 200 com Content-Type text/csv quando importação existe', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/operacional/importacoes-legado/${IMP_ID}/erros-csv`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('retorna CSV com BOM, CRLF e cabeçalho correto usando ponto-e-vírgula', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/operacional/importacoes-legado/${IMP_ID}/erros-csv`,
      headers: { authorization: `Bearer ${token}` },
    });

    const expectedHeader = 'linha;erro;repositorio;colaborador;funcao;tipo;data;quantidade';
    assertCsvFormat(res.body, expectedHeader, 'importacao-erros');
  });

  it('escapa corretamente campos com ponto-e-vírgula', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/operacional/importacoes-legado/${IMP_ID}/erros-csv`,
      headers: { authorization: `Bearer ${token}` },
    });

    // "Colaborador; não encontrado" contém ponto-e-vírgula
    expect(res.body).toContain('"Colaborador; não encontrado"');
  });

  it('inclui dados das linhas com erro', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/operacional/importacoes-legado/${IMP_ID}/erros-csv`,
      headers: { authorization: `Bearer ${token}` },
    });

    const lines = res.body.slice(1).split('\r\n'); // remove BOM
    expect(lines.length).toBe(3); // cabeçalho + 2 erros
    expect(lines[1]).toContain('Data inválida');
    expect(lines[1]).toContain('João Silva');
  });
});

// ---------------------------------------------------------------------------
// 5. Produção CSV — GET /relatorios/operacional/export?formato=csv
// ---------------------------------------------------------------------------

describe('CSV — /relatorios/operacional/export?formato=csv', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildCsvServer();
    token = operadorToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const baseUrl =
    '/relatorios/operacional/export?dataInicio=2024-01-01&dataFim=2024-12-31&formato=csv';

  it('retorna 200 com Content-Type text/csv', async () => {
    const res = await app.inject({
      method: 'GET',
      url: baseUrl,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('retorna CSV com BOM, CRLF e cabeçalho compatível com formato de importação', async () => {
    const res = await app.inject({
      method: 'GET',
      url: baseUrl,
      headers: { authorization: `Bearer ${token}` },
    });

    // Colunas devem incluir as 7 colunas do formato de importação legado
    // (data, colaborador, funcao, repositorio, coordenadoria, quantidade, tipo)
    // mais etapa e origem para contexto operacional
    const expectedHeader =
      'data;colaborador;funcao;repositorio;coordenadoria;quantidade;tipo;etapa;origem';
    assertCsvFormat(res.body, expectedHeader, 'producao-csv');
  });

  it('inclui cabeçalho X-Truncated na resposta', async () => {
    const res = await app.inject({
      method: 'GET',
      url: baseUrl,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.headers['x-truncated']).toBeDefined();
    expect(res.headers['x-truncated']).toBe('false');
  });

  it('nome do arquivo reflete o período solicitado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: baseUrl,
      headers: { authorization: `Bearer ${token}` },
    });

    const disposition = res.headers['content-disposition'] as string;
    expect(disposition).toContain('producao_');
    expect(disposition).toContain('.csv');
  });

  it('rejeita requisições sem token (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: baseUrl,
    });
    expect(res.statusCode).toBe(401);
  });
});
