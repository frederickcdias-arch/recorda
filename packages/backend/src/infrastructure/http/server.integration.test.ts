import { describe, it, beforeAll, afterAll, expect, vi, type Mock } from 'vitest';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import type { QueryResult, QueryResultRow } from 'pg';

import type { DatabaseConnection } from '../database/connection.js';
import { createServer } from './server.js';
import type { OCRService } from '../../application/ports/ocr-service.js';

const HASHED_PASSWORD = bcrypt.hashSync('SenhaSegura123', 10);

function makeResult<T extends QueryResultRow>(rows: T[], command = 'SELECT'): QueryResult<T> {
  return {
    command,
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

function createMockDatabase(): DatabaseConnection & {
  queryMock: Mock<[string, (unknown[] | undefined)?], Promise<QueryResult<QueryResultRow>>>;
  usuarios: Map<
    string,
    {
      id: string;
      nome: string;
      email: string;
      senha_hash: string;
      perfil: string;
      coordenadoria_id: string | null;
      ativo: boolean;
    }
  >;
  refreshTokens: Array<{
    id: string;
    usuario_id: string;
    token_hash: string;
    expira_em: Date;
    revogado: boolean;
  }>;
  auditoria: Array<{
    id: string;
    tabela: string;
    operacao: string;
    dados: Record<string, unknown>;
    criado_em: string;
  }>;
  colaboradores: Map<
    string,
    {
      id: string;
      nome: string;
      matricula: string;
      email: string | null;
      coordenadoria_id: string;
      ativo: boolean;
    }
  >;
  configuracaoProjetos: Array<{
    id: string;
    nome: string;
    descricao: string;
    ativo: boolean;
    criado_em: string;
    atualizado_em: string;
  }>;
  repositorios: Map<
    string,
    {
      id_repositorio_recorda: string;
      id_repositorio_ged: string;
      orgao: string;
      projeto: string;
      status_atual: string;
      etapa_atual: string;
    }
  >;
  fontesImportacao: Map<string, { id: string; nome: string; url: string; tipo: string }>;
} {
  let configuracaoEmpresa: Record<string, unknown> | null = null;
  const configuracaoProjetos: Array<{
    id: string;
    nome: string;
    descricao: string;
    ativo: boolean;
    criado_em: string;
    atualizado_em: string;
  }> = [];
  const processos = new Map<string, { id: string; numero: string }>();
  const etapasState = new Map<
    string,
    {
      id: string;
      nome: string;
      descricao: string;
      unidade: string;
      ordem: number;
      ativa: boolean;
      criado_em: string;
    }
  >();
  etapasState.set('etapa-1', {
    id: 'etapa-1',
    nome: 'Digitalização',
    descricao: 'Digitalizar docs',
    unidade: 'docs',
    ordem: 1,
    ativa: true,
    criado_em: '2024-01-01',
  });
  etapasState.set('etapa-2', {
    id: 'etapa-2',
    nome: 'Conferência',
    descricao: 'Conferir docs',
    unidade: 'docs',
    ordem: 2,
    ativa: true,
    criado_em: '2024-01-01',
  });
  const usuarios = new Map<
    string,
    {
      id: string;
      nome: string;
      email: string;
      senha_hash: string;
      perfil: string;
      coordenadoria_id: string | null;
      ativo: boolean;
    }
  >();
  const refreshTokens: Array<{
    id: string;
    usuario_id: string;
    token_hash: string;
    expira_em: Date;
    revogado: boolean;
  }> = [];
  const auditoria: Array<{
    id: string;
    tabela: string;
    operacao: string;
    dados: Record<string, unknown>;
    criado_em: string;
  }> = [
    {
      id: 'audit-1',
      tabela: 'colaboradores',
      operacao: 'INSERT',
      dados: { id: 'col-1' },
      criado_em: '2024-01-05T10:00:00Z',
    },
    {
      id: 'audit-2',
      tabela: 'processos',
      operacao: 'UPDATE',
      dados: { id: 'proc-1' },
      criado_em: '2024-01-06T11:00:00Z',
    },
  ];
  const colaboradores = new Map<
    string,
    {
      id: string;
      nome: string;
      matricula: string;
      email: string | null;
      coordenadoria_id: string;
      ativo: boolean;
    }
  >();
  const repositorios = new Map<
    string,
    {
      id_repositorio_recorda: string;
      id_repositorio_ged: string;
      orgao: string;
      projeto: string;
      status_atual: string;
      etapa_atual: string;
    }
  >();
  const fontesImportacao = new Map<
    string,
    { id: string; nome: string; url: string; tipo: string }
  >();
  const importacaoFontesLinhas = new Set<string>();
  const lowerEmail = (value: unknown): string => String(value ?? '').toLowerCase();

  usuarios.set('user-1', {
    id: 'user-1',
    nome: 'Usuário Teste',
    email: lowerEmail('user@test.com'),
    senha_hash: HASHED_PASSWORD,
    perfil: 'administrador',
    coordenadoria_id: null,
    ativo: true,
  });

  colaboradores.set('col-1', {
    id: 'col-1',
    nome: 'Colaborador 1',
    matricula: 'MAT001',
    email: 'col1@recorda.com',
    coordenadoria_id: 'coord-1',
    ativo: true,
  });

  // Collaborator mapped to the test user (used by import endpoints)
  colaboradores.set('col-user', {
    id: 'col-user',
    nome: 'Usuário Teste',
    matricula: 'MATUSER',
    email: 'user@test.com',
    coordenadoria_id: 'coord-1',
    ativo: true,
  });

  const queryMock: Mock<
    [string, (unknown[] | undefined)?],
    Promise<QueryResult<QueryResultRow>>
  > = vi.fn(async (text: string, params?: unknown[]): Promise<QueryResult<QueryResultRow>> => {
    if (text.includes('FROM usuarios WHERE email = $1')) {
      const email = lowerEmail(params?.[0]);
      const usuario = [...usuarios.values()].find((u) => u.email === email);
      return usuario ? makeResult([usuario]) : makeResult([]);
    }

    if (text.includes('SELECT * FROM auditoria WHERE 1=1')) {
      return makeResult(auditoria);
    }

    if (text.includes('SELECT COUNT(*) as total FROM auditoria WHERE 1=1')) {
      return makeResult([{ total: String(auditoria.length) }]);
    }

    if (text.includes('SELECT operacao, COUNT(*) as total FROM auditoria')) {
      const counts = auditoria.reduce<Record<string, number>>(
        (acc, item) => {
          const key = item.operacao;
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      return makeResult(Object.entries(counts).map(([operacao, total]) => ({ operacao, total })));
    }

    if (text.includes('SELECT tabela, COUNT(*) as total FROM auditoria')) {
      const counts = auditoria.reduce<Record<string, number>>(
        (acc, item) => {
          const key = item.tabela;
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      const entries = Object.entries(counts).map(([tabela, total]) => ({ tabela, total }));
      return makeResult(entries);
    }

    if (text.includes('SELECT DATE(criado_em) as data, COUNT(*) as total FROM auditoria')) {
      const counts = auditoria.reduce<Record<string, number>>(
        (acc, item) => {
          const date = String(item.criado_em).split('T')[0] ?? '';
          acc[date] = (acc[date] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      const entries = Object.entries(counts).map(([data, total]) => ({ data, total }));
      return makeResult(entries);
    }

    if (text.includes('SELECT id FROM configuracao_empresa LIMIT 1')) {
      return (
        configuracaoEmpresa ? makeResult([{ id: configuracaoEmpresa.id }]) : makeResult([])
      ) as QueryResult<QueryResultRow>;
    }

    if (text.includes('FROM configuracao_empresa LIMIT 1')) {
      return (
        configuracaoEmpresa ? makeResult([configuracaoEmpresa]) : makeResult([])
      ) as QueryResult<QueryResultRow>;
    }

    if (text.includes('INSERT INTO configuracao_empresa')) {
      configuracaoEmpresa = {
        id: 'config-1',
        nome: params?.[0],
        cnpj: params?.[1],
        endereco: params?.[2],
        telefone: params?.[3],
        email: params?.[4],
        logo_url: params?.[5],
        exibir_logo_relatorio: params?.[6],
        exibir_endereco_relatorio: params?.[7],
        exibir_contato_relatorio: params?.[8],
        logo_largura_relatorio: params?.[9] ?? 120,
        logo_alinhamento_relatorio: params?.[10] ?? 'CENTRO',
        logo_deslocamento_y_relatorio: params?.[11] ?? 0,
      };
      return makeResult([configuracaoEmpresa], 'INSERT');
    }

    if (text.includes('UPDATE configuracao_empresa SET')) {
      configuracaoEmpresa = {
        ...(configuracaoEmpresa ?? { id: params?.[12] ?? 'config-1' }),
        nome: params?.[0],
        cnpj: params?.[1],
        endereco: params?.[2],
        telefone: params?.[3],
        email: params?.[4],
        logo_url: params?.[5],
        exibir_logo_relatorio: params?.[6],
        exibir_endereco_relatorio: params?.[7],
        exibir_contato_relatorio: params?.[8],
        logo_largura_relatorio: params?.[9] ?? 120,
        logo_alinhamento_relatorio: params?.[10] ?? 'CENTRO',
        logo_deslocamento_y_relatorio: params?.[11] ?? 0,
      };
      return makeResult([configuracaoEmpresa], 'UPDATE');
    }

    if (
      text.includes(
        'SELECT id, nome, descricao, ativo, criado_em, atualizado_em\n          FROM configuracao_projetos'
      )
    ) {
      return makeResult(configuracaoProjetos);
    }

    if (text.includes('INSERT INTO configuracao_projetos')) {
      const novoProjeto = {
        id: `proj-${configuracaoProjetos.length + 1}`,
        nome: String(params?.[0]),
        descricao: String(params?.[1] ?? ''),
        ativo: Boolean(params?.[2] ?? true),
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      };
      configuracaoProjetos.unshift(novoProjeto);
      return makeResult([novoProjeto], 'INSERT');
    }

    if (text.includes('SELECT id FROM processos_principais WHERE numero = $1')) {
      const numero = String(params?.[0]);
      const processo = processos.get(numero);
      return (
        processo ? makeResult([{ id: processo.id }]) : makeResult([])
      ) as QueryResult<QueryResultRow>;
    }

    if (text.includes('INSERT INTO processos_principais')) {
      const numero = String(params?.[0]);
      const id = processos.get(numero)?.id ?? `proc-${processos.size + 1}`;
      const registro = {
        id,
        numero,
        interessado: params?.[1],
        assunto: params?.[2],
      };
      processos.set(numero, registro);
      return makeResult([registro], 'INSERT');
    }

    if (text.includes('INSERT INTO volumes')) {
      return makeResult([], 'INSERT');
    }

    if (text.includes('INSERT INTO recebimentos')) {
      return makeResult([], 'INSERT');
    }

    if (text.includes('SELECT COUNT(DISTINCT p.id) as total')) {
      return makeResult([{ total: '1' }]);
    }

    if (text.includes('SELECT DISTINCT ON (p.id)')) {
      return makeResult([
        {
          id: 'proc-1',
          numero: 'PROC-999',
          interessado: 'Fulano',
          assunto: 'Teste',
          status: 'ATIVO',
          data_abertura: '2024-01-01',
          coordenadoria_nome: 'Coordenação X',
          coordenadoria_sigla: 'CX',
          data_recebimento: '2024-01-05',
          status_recebimento: 'RECEBIDO',
        },
      ]);
    }

    if (text.startsWith('UPDATE usuarios SET ultimo_acesso')) {
      return makeResult([], 'UPDATE');
    }

    if (text.startsWith('INSERT INTO refresh_tokens')) {
      const id = `token-${refreshTokens.length + 1}`;
      const usuario_id = String(params?.[0]);
      const token_hash = String(params?.[1]);
      const expira_em =
        params?.[2] instanceof Date
          ? (params[2] as Date)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      refreshTokens.push({ id, usuario_id, token_hash, expira_em, revogado: false });
      return makeResult([{ id }], 'INSERT');
    }

    if (
      text.includes('FROM producao_repositorio WHERE data_producao >= $1 AND data_producao <= $2')
    ) {
      return makeResult([{ total: '60' }]);
    }

    if (text.includes('FROM producao_repositorio WHERE data_producao >= $1')) {
      return makeResult([{ total: '120' }]);
    }

    // Select collaborators for import (id + lower(nome))
    if (
      text.includes('SELECT id, LOWER(nome) as nome_lower FROM colaboradores WHERE ativo = true')
    ) {
      const rows = [...colaboradores.values()].map((c) => ({
        id: c.id,
        nome_lower: String(c.nome).toLowerCase(),
      }));
      return makeResult(rows as QueryResultRow[]);
    }

    // Lookup collaborator by email
    if (text.includes('SELECT id FROM colaboradores WHERE email = $1')) {
      const email = String(params?.[0] ?? '').toLowerCase();
      const found = [...colaboradores.values()].find(
        (c) => String(c.email ?? '').toLowerCase() === email
      );
      return found ? makeResult([{ id: found.id }]) : makeResult([]);
    }

    if (text.includes('FROM colaboradores')) {
      // Count query
      if (text.startsWith('SELECT COUNT(*)')) {
        return makeResult([{ total: String(colaboradores.size) }]);
      }

      // Select list with pagination
      if (text.includes('SELECT c.id, c.nome')) {
        const rows = [...colaboradores.values()].map((c) => ({
          id: c.id,
          nome: c.nome,
          matricula: c.matricula,
          email: c.email,
          ativo: c.ativo,
          coordenadoria_id: c.coordenadoria_id,
          criado_em: new Date().toISOString(),
          coordenadoria_nome: 'Coordenação X',
          coordenadoria_sigla: 'CX',
        }));
        return makeResult(rows as QueryResultRow[]);
      }

      // Select by matricula
      if (text.includes('WHERE matricula = $1') && !text.includes('AND id != $2')) {
        const matricula = String(params?.[0]);
        const found = [...colaboradores.values()].find((c) => c.matricula === matricula);
        return found ? makeResult([{ id: found.id }]) : makeResult([]);
      }

      // Select by matricula excluding id (used on update)
      if (text.includes('WHERE matricula = $1 AND id != $2')) {
        const matricula = String(params?.[0]);
        const id = String(params?.[1]);
        const found = [...colaboradores.values()].find(
          (c) => c.matricula === matricula && c.id !== id
        );
        return found ? makeResult([{ id: found.id }]) : makeResult([]);
      }

      // Select by id (alias with c. or without)
      if (text.includes('WHERE id = $1') || text.includes('WHERE c.id = $1')) {
        const id = String(params?.[0]);
        const found = colaboradores.get(id);
        if (!found) return makeResult([]);
        return makeResult([
          { ...found, coordenadoria_nome: 'Coordenação X', coordenadoria_sigla: 'CX' },
        ]);
      }
    }

    if (text.includes('SELECT id, LOWER(nome) as nome_lower FROM etapas WHERE ativa = true')) {
      return makeResult([{ id: 'etapa-1', nome_lower: 'digitalização' }]);
    }

    if (text.includes('FROM etapas e')) {
      return makeResult([
        { etapa: 'Digitalização', valor: '42' },
        { etapa: 'Qualidade', valor: '18' },
      ]);
    }

    if (text.includes('FROM producao_repositorio p') && text.includes('JOIN usuarios u')) {
      return makeResult([
        {
          id: 'prod-1',
          etapa_sistema: 'DIGITALIZACAO',
          quantidade: 42,
          data_producao: '2024-01-05',
          funcao_marcador: '',
          tipo_marcador: '',
          coord_marcador: '',
          colaborador_id: 'user-1',
          colaborador_nome: 'Usuário Teste',
          colaborador_matricula: '',
          coordenadoria_id: 'coord-1',
          coordenadoria_nome: 'Coordenadoria A',
          coordenadoria_sigla: 'CA',
          observacao: null,
          processo_numero: 'GED-001',
        },
      ]);
    }

    if (text.includes('FROM producao_repositorio p') && text.includes('GROUP BY')) {
      return makeResult([
        { etapa: 'Digitalização', valor: '42' },
        { etapa: 'Qualidade', valor: '18' },
      ]);
    }

    if (text.includes('FROM producao_repositorio rp')) {
      return makeResult([
        {
          id: 'reg-1',
          repositorio_id: 'repo-1',
          etapa: 'DIGITALIZACAO',
          usuario_id: 'user-1',
          quantidade: 10,
          data_producao: '2024-01-05',
          etapa_nome: 'Digitalização',
          etapa_unidade: 'docs',
          etapa_ordem: 1,
          colaborador_nome: 'Maria',
          colaborador_matricula: '123',
          coordenadoria_id: 'coord-1',
          coordenadoria_nome: 'Coordenadoria A',
          coordenadoria_sigla: 'CA',
        },
        {
          id: 'reg-2',
          repositorio_id: 'repo-2',
          etapa: 'CONFERENCIA',
          usuario_id: 'user-2',
          quantidade: 5,
          data_producao: '2024-01-06',
          etapa_nome: 'Qualidade',
          etapa_unidade: 'docs',
          etapa_ordem: 2,
          colaborador_nome: 'João',
          colaborador_matricula: '456',
          coordenadoria_id: 'coord-2',
          coordenadoria_nome: 'Coordenadoria B',
          coordenadoria_sigla: 'CB',
        },
      ]);
    }

    // Handle collaborator insert
    if (text.startsWith('INSERT INTO colaboradores')) {
      const id = `col-${colaboradores.size + 1}`;
      const novo = {
        id,
        nome: String(params?.[0]),
        matricula: String(params?.[1]),
        email: String(params?.[2] ?? null),
        coordenadoria_id: String(params?.[3]),
        ativo: true,
      };
      colaboradores.set(id, novo as any);
      return makeResult([novo as QueryResultRow], 'INSERT');
    }

    // Handle toggle ativo
    if (text.includes('UPDATE colaboradores SET ativo = NOT ativo')) {
      const id = String(params?.[0]);
      const found = colaboradores.get(id);
      if (!found) return makeResult([]);
      found.ativo = !found.ativo;
      colaboradores.set(id, found);
      return makeResult([found as QueryResultRow], 'UPDATE');
    }

    // Handle update collaborator fields
    if (text.includes('UPDATE colaboradores SET nome =')) {
      const id = String(params?.[4]);
      const found = colaboradores.get(id);
      if (!found) return makeResult([]);
      found.nome = String(params?.[0]);
      found.matricula = String(params?.[1]);
      found.email = String(params?.[2] ?? null);
      found.coordenadoria_id = String(params?.[3]);
      colaboradores.set(id, found);
      return makeResult([found as QueryResultRow], 'UPDATE');
    }

    if (text.includes('SELECT * FROM fontes_dados WHERE id = $1 AND ativa = true')) {
      return makeResult([
        {
          id: 'fonte-1',
          nome: 'Fonte API',
          tipo: 'API',
          ativa: true,
          url_api: 'https://api.example.com/dados',
          headers_api: { Authorization: 'Bearer external-token' },
        },
      ]);
    }

    if (text.includes('SELECT id FROM usuarios WHERE email = $1')) {
      const email = lowerEmail(params?.[0]);
      const usuario = [...usuarios.values()].find((u) => u.email === email);
      return usuario ? makeResult([{ id: usuario.id }]) : makeResult([]);
    }

    if (text.includes('INSERT INTO usuarios (nome, email, senha_hash, perfil, coordenadoria_id)')) {
      const id = `user-${usuarios.size + 1}`;
      const novoUsuario = {
        id,
        nome: String(params?.[0]),
        email: lowerEmail(params?.[1]),
        senha_hash: String(params?.[2]),
        perfil: String(params?.[3]),
        coordenadoria_id: (params?.[4] as string | null) ?? null,
        ativo: true,
      };
      usuarios.set(id, novoUsuario);
      return makeResult([novoUsuario], 'INSERT');
    }

    if (
      text.includes('SELECT u.id, u.nome, u.email, u.perfil') &&
      text.includes('FROM usuarios u')
    ) {
      const id = String(params?.[0]);
      const usuario = usuarios.get(id);
      if (!usuario) return makeResult([]);
      return makeResult([
        {
          ...usuario,
          coordenadoria_nome: usuario.coordenadoria_id ? 'Coord' : null,
          coordenadoria_sigla: usuario.coordenadoria_id ? 'C' : null,
          ativo: usuario.ativo,
          ultimo_acesso: new Date().toISOString(),
        },
      ]);
    }

    if (text.includes('SELECT senha_hash FROM usuarios WHERE id = $1')) {
      const id = String(params?.[0]);
      const usuario = usuarios.get(id);
      return usuario ? makeResult([{ senha_hash: usuario.senha_hash }]) : makeResult([]);
    }

    if (
      text.includes(
        'SELECT id, nome, email, perfil, coordenadoria_id, ativo FROM usuarios WHERE id = $1'
      )
    ) {
      const id = String(params?.[0]);
      const usuario = usuarios.get(id);
      return usuario ? makeResult([usuario]) : makeResult([]);
    }

    if (text.includes('SELECT id, nome FROM usuarios WHERE ativo = TRUE')) {
      return makeResult(
        [...usuarios.values()].filter((u) => u.ativo).map((u) => ({ id: u.id, nome: u.nome }))
      );
    }

    if (text.includes('UPDATE usuarios SET senha_hash = $1 WHERE id = $2')) {
      const id = String(params?.[1]);
      const usuario = usuarios.get(id);
      if (usuario) {
        usuario.senha_hash = String(params?.[0]);
      }
      return makeResult([], 'UPDATE');
    }

    if (text.includes('SELECT id, nome, email FROM usuarios WHERE email = $1 AND ativo = true')) {
      const email = lowerEmail(params?.[0]);
      const usuario = [...usuarios.values()].find((u) => u.email === email && u.ativo);
      return usuario
        ? makeResult([{ id: usuario.id, nome: usuario.nome, email: usuario.email }])
        : makeResult([]);
    }

    if (text.includes('INSERT INTO refresh_tokens (usuario_id, token_hash, expira_em)')) {
      const id = `token-${refreshTokens.length + 1}`;
      const usuario_id = String(params?.[0]);
      const token_hash = String(params?.[1]);
      const expira_em =
        params?.[2] instanceof Date
          ? (params?.[2] as Date)
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      refreshTokens.push({ id, usuario_id, token_hash, expira_em, revogado: false });
      return makeResult([{ id }], 'INSERT');
    }

    if (
      text.includes('INSERT INTO refresh_tokens (usuario_id, token_hash') &&
      text.includes("CURRENT_TIMESTAMP + INTERVAL '7 days'")
    ) {
      const id = `token-${refreshTokens.length + 1}`;
      const usuario_id = String(params?.[0]);
      const token_hash = String(params?.[1]);
      const expira_em = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      refreshTokens.push({ id, usuario_id, token_hash, expira_em, revogado: false });
      return makeResult([{ id }], 'INSERT');
    }

    if (text.includes('SELECT id, token_hash FROM refresh_tokens')) {
      const usuario_id = String(params?.[0]);
      const tokens = refreshTokens.filter(
        (t) => t.usuario_id === usuario_id && !t.revogado && t.expira_em > new Date()
      );
      return makeResult(tokens.map((t) => ({ id: t.id, token_hash: t.token_hash })));
    }

    if (text.includes('UPDATE refresh_tokens SET revogado = true WHERE id = $1')) {
      const tokenId = String(params?.[0]);
      const token = refreshTokens.find((t) => t.id === tokenId);
      if (token) token.revogado = true;
      return makeResult([], 'UPDATE');
    }

    if (text.includes('UPDATE refresh_tokens SET revogado = true WHERE usuario_id = $1')) {
      const usuario_id = String(params?.[0]);
      refreshTokens.forEach((t) => {
        if (t.usuario_id === usuario_id) t.revogado = true;
      });
      return makeResult([], 'UPDATE');
    }

    if (text.includes('SELECT rt.usuario_id, rt.id as token_id')) {
      const tokenHash = String(params?.[0]);
      if (!tokenHash.startsWith('reset:')) {
        return makeResult([]);
      }
      const token = refreshTokens.find(
        (t) => t.token_hash === tokenHash && !t.revogado && t.expira_em > new Date()
      );
      return token
        ? makeResult([{ usuario_id: token.usuario_id, token_id: token.id }])
        : makeResult([]);
    }

    // ── Coordenadorias ──
    if (text.includes('FROM coordenadorias') && text.includes('ativa = true')) {
      return makeResult([
        { id: 'coord-1', nome: 'Coordenadoria A', sigla: 'CA' },
        { id: 'coord-2', nome: 'Coordenadoria B', sigla: 'CB' },
      ]);
    }

    // ── Etapas ──
    if (text.includes('COUNT(*)') && text.includes('total') && text.includes('FROM etapas')) {
      return makeResult([{ total: '2' }]);
    }
    if (
      text.includes('SELECT id, nome, descricao, unidade, ordem, ativa, criado_em') &&
      text.includes('FROM etapas')
    ) {
      return makeResult([
        {
          id: 'etapa-1',
          nome: 'Digitalização',
          descricao: 'Digitalizar docs',
          unidade: 'docs',
          ordem: 1,
          ativa: true,
          criado_em: '2024-01-01',
        },
        {
          id: 'etapa-2',
          nome: 'Conferência',
          descricao: 'Conferir docs',
          unidade: 'docs',
          ordem: 2,
          ativa: true,
          criado_em: '2024-01-01',
        },
      ]);
    }
    if (text.includes('SELECT id FROM etapas WHERE LOWER(nome)')) {
      return makeResult([]);
    }
    if (text.includes('INSERT INTO etapas')) {
      return makeResult(
        [
          {
            id: 'etapa-new',
            nome: String(params?.[0]),
            descricao: String(params?.[1] ?? ''),
            unidade: String(params?.[2] ?? 'unidade'),
            ordem: Number(params?.[3] ?? 1),
            ativa: true,
            criado_em: new Date().toISOString(),
          },
        ],
        'INSERT'
      );
    }
    if (text.includes('SELECT id FROM etapas WHERE id = $1')) {
      return makeResult([{ id: String(params?.[0]) }]);
    }
    if (text.includes('SELECT id FROM etapas WHERE LOWER(nome) = LOWER($1) AND id != $2')) {
      return makeResult([]);
    }
    if (text.includes('UPDATE etapas SET nome =')) {
      const id = text.includes('WHERE id = $5') ? String(params?.[4]) : String(params?.[3]);
      const updated = {
        id,
        nome: String(params?.[0]),
        descricao: String(params?.[1] ?? ''),
        unidade: String(params?.[2] ?? 'unidade'),
        ordem: Number(params?.[3] ?? 1),
        ativa: true,
        criado_em: '2024-01-01',
      };
      etapasState.set(id, updated);
      return makeResult([updated], 'UPDATE');
    }
    if (text.includes('UPDATE etapas SET ativa = NOT ativa')) {
      const id = String(params?.[0]);
      const existing = etapasState.get(id);
      if (existing) {
        existing.ativa = !existing.ativa;
        etapasState.set(id, existing);
      }
      return makeResult(
        [{ id, nome: existing?.nome ?? 'Digitalização', ativa: existing?.ativa ?? false }],
        'UPDATE'
      );
    }
    if (text.includes('SELECT * FROM etapas WHERE id = $1')) {
      const id = String(params?.[0]);
      const found = etapasState.get(id);
      return found
        ? makeResult([found])
        : makeResult([
            {
              id,
              nome: 'Digitalização',
              descricao: 'Digitalizar docs',
              unidade: 'docs',
              ordem: 1,
              ativa: true,
            },
          ]);
    }

    // ── Metas ──
    if (text.includes('FROM metas_producao m') && text.includes('JOIN etapas e')) {
      return makeResult([
        {
          id: 'meta-1',
          etapa_id: 'etapa-1',
          meta_diaria: 50,
          meta_mensal: 1000,
          ativa: true,
          etapa_nome: 'Digitalização',
        },
      ]);
    }
    if (text.includes('INSERT INTO metas_producao')) {
      return makeResult(
        [
          {
            id: 'meta-new',
            etapa_id: String(params?.[0]),
            meta_diaria: Number(params?.[1]),
            meta_mensal: Number(params?.[2]),
            ativa: true,
          },
        ],
        'INSERT'
      );
    }
    if (text.includes('SUM(meta_mensal)') && text.includes('FROM metas_producao')) {
      return makeResult([{ total: '1000' }]);
    }
    if (
      text.includes('FROM usuarios u') &&
      text.includes('LEFT JOIN producao_repositorio rp ON rp.usuario_id = u.id')
    ) {
      return makeResult([
        { colaborador_nome: 'Usuário Teste', total_producao: 42, meta: 1000, percentual: 4 },
      ]);
    }
    if (text.includes('FROM mapeamentos_importacao')) {
      return makeResult([
        { id: 'map-1', nome: 'Template A', mapeamento: { col: 'val' }, criado_em: '2024-01-01' },
      ]);
    }
    if (text.includes('INSERT INTO mapeamentos_importacao')) {
      return makeResult(
        [
          {
            id: 'map-new',
            nome: String(params?.[0]),
            mapeamento: params?.[1],
            criado_em: new Date().toISOString(),
          },
        ],
        'INSERT'
      );
    }

    // ── Auth usuarios list ──
    if (
      text.includes('SELECT id, nome, email, perfil, ativo, criado_em') &&
      text.includes('FROM usuarios') &&
      text.includes('ORDER BY criado_em')
    ) {
      return makeResult(
        [...usuarios.values()].map((u) => ({
          id: u.id,
          nome: u.nome,
          email: u.email,
          perfil: u.perfil,
          ativo: u.ativo,
          criado_em: new Date().toISOString(),
        }))
      );
    }

    // ── Armarios ──
    if (text.includes('FROM armarios') && text.includes('ativo = TRUE')) {
      return makeResult([{ id: 'arm-1', codigo: 'ARM-001', descricao: 'Armário 1', ativo: true }]);
    }

    // ── Repositorios ──
    if (
      text.includes('SELECT id_repositorio_recorda FROM repositorios') &&
      text.includes('WHERE id_repositorio_ged = $1')
    ) {
      const idGed = String(params?.[0] ?? '');
      const orgao = String(params?.[1] ?? '');
      const projeto = String(params?.[2] ?? '');
      const rows = [...repositorios.values()]
        .filter((r) => {
          if (r.id_repositorio_ged !== idGed) return false;
          if (orgao && r.orgao !== orgao) return false;
          if (projeto && r.projeto !== projeto) return false;
          return true;
        })
        .map((r) => ({ id_repositorio_recorda: r.id_repositorio_recorda }));
      return makeResult(rows);
    }
    if (text.includes('INSERT INTO repositorios')) {
      const idGed = String(params?.[0] ?? '');
      const orgao = String(params?.[1] ?? '');
      const projeto = String(params?.[2] ?? '');
      const key = `${idGed}::${orgao}::${projeto}`;
      const existing = repositorios.get(key);
      const hasContextConflictTarget = text.includes(
        'ON CONFLICT (id_repositorio_ged, orgao, projeto)'
      );
      if (existing && !hasContextConflictTarget) {
        const err = new Error('duplicate key value violates unique constraint') as Error & {
          code?: string;
          constraint?: string;
        };
        err.code = '23505';
        err.constraint = 'uk_repositorios_ged_orgao_projeto';
        throw err;
      }
      const row = existing ?? {
        id_repositorio_recorda: `repo-${repositorios.size + 1}`,
        id_repositorio_ged: idGed,
        orgao,
        projeto,
        status_atual: 'RECEBIDO',
        etapa_atual: 'RECEBIMENTO',
      };
      repositorios.set(key, row);
      return makeResult(
        [
          {
            ...row,
            localizacao_fisica_armario_id: String(params?.[3] ?? 'arm-1'),
          },
        ],
        'INSERT'
      );
    }
    if (text.includes('COUNT(*)') && text.includes('total') && text.includes('FROM repositorios')) {
      return makeResult([{ total: '1' }]);
    }
    if (text.includes('FROM repositorios r') && text.includes('JOIN armarios a')) {
      return makeResult([
        {
          id_repositorio_recorda: 'repo-1',
          id_repositorio_ged: 'GED-001',
          orgao: 'Orgao A',
          projeto: 'Projeto X',
          status_atual: 'RECEBIDO',
          etapa_atual: 'RECEBIMENTO',
          armario_codigo: 'ARM-001',
          criado_em: '2024-01-01',
        },
      ]);
    }
    if (text.includes('FROM repositorios') && text.includes('WHERE id_repositorio_recorda = $1')) {
      return makeResult([
        {
          id_repositorio_recorda: String(params?.[0]),
          localizacao_fisica_armario_id: 'arm-1',
          etapa_atual: 'RECEBIMENTO',
          status_atual: 'RECEBIDO',
        },
      ]);
    }

    // ── Documentos recebimento ──
    if (text.includes('FROM documentos_recebimento_repositorio')) {
      return makeResult([]);
    }
    if (text.includes('INSERT INTO documentos_recebimento_repositorio')) {
      return makeResult([{ id: 'doc-rec-1', repositorio_id: String(params?.[0]) }], 'INSERT');
    }

    // ── Checklists ──
    if (text.includes('INSERT INTO checklists')) {
      return makeResult(
        [
          {
            id: 'ck-1',
            repositorio_id: String(params?.[0]),
            etapa: String(params?.[1]),
            status: 'ABERTO',
          },
        ],
        'INSERT'
      );
    }
    if (text.includes('FROM checklists') && text.includes('WHERE repositorio_id = $1')) {
      return makeResult([
        {
          id: 'ck-1',
          repositorio_id: String(params?.[0]),
          etapa: 'RECEBIMENTO',
          status: 'ABERTO',
          criado_em: '2024-01-01',
        },
      ]);
    }
    if (text.includes('FROM checklists') && text.includes('WHERE c.id = $1')) {
      return makeResult([
        {
          id: String(params?.[0]),
          repositorio_id: 'repo-1',
          etapa: 'RECEBIMENTO',
          status: 'ABERTO',
        },
      ]);
    }
    if (text.includes('FROM checklist_itens') && text.includes('WHERE checklist_id = $1')) {
      return makeResult([]);
    }
    if (text.includes('INSERT INTO checklist_itens')) {
      return makeResult(
        [
          {
            id: 'item-1',
            checklist_id: String(params?.[0]),
            descricao: String(params?.[1]),
            resultado: String(params?.[2]),
          },
        ],
        'INSERT'
      );
    }
    if (text.includes('UPDATE checklists SET status')) {
      return makeResult(
        [{ id: String(params?.[0] ?? params?.[1]), status: 'CONCLUIDO' }],
        'UPDATE'
      );
    }

    // ── Producao repositorio INSERT ──
    if (text.includes('INSERT INTO producao_repositorio')) {
      return makeResult(
        [
          {
            id: 'prod-1',
            repositorio_id: String(params?.[0]),
            etapa: String(params?.[1]),
            quantidade: Number(params?.[4]),
          },
        ],
        'INSERT'
      );
    }
    if (
      text.includes('SELECT id FROM producao_repositorio') &&
      text.includes('WHERE usuario_id = $1 AND repositorio_id = $2') &&
      text.includes("COALESCE(marcadores->>'colaborador_nome', '') = $9")
    ) {
      return makeResult([]);
    }

    // ── Excecoes ──
    if (text.includes('INSERT INTO excecoes_repositorio')) {
      return makeResult([{ id: 'exc-1', repositorio_id: String(params?.[0]) }], 'INSERT');
    }

    // ── Avancar etapa ──
    if (text.includes('UPDATE repositorios SET etapa_atual')) {
      return makeResult([{ id_repositorio_recorda: String(params?.[2] ?? params?.[0]) }], 'UPDATE');
    }

    // ── Retirar / Devolver ──
    if (text.includes('INSERT INTO movimentacoes_repositorio')) {
      return makeResult([{ id: 'mov-1' }], 'INSERT');
    }

    // ── Importacoes legado ──
    if (text.includes('SELECT id, nome, url FROM fontes_importacao WHERE id = $1')) {
      const id = String(params?.[0] ?? '');
      const fonte = fontesImportacao.get(id);
      return fonte
        ? makeResult([{ id: fonte.id, nome: fonte.nome, url: fonte.url }])
        : makeResult([]);
    }
    if (
      text.includes('SELECT id, nome, url, tipo, criado_em, ultima_importacao_em') &&
      text.includes('FROM fontes_importacao')
    ) {
      return makeResult(
        [...fontesImportacao.values()].map((f) => ({
          id: f.id,
          nome: f.nome,
          url: f.url,
          tipo: f.tipo,
          criado_em: new Date().toISOString(),
          ultima_importacao_em: null,
        }))
      );
    }
    if (text.includes('INSERT INTO fontes_importacao')) {
      const id = `fonte-${fontesImportacao.size + 1}`;
      const fonte = {
        id,
        nome: String(params?.[0] ?? ''),
        url: String(params?.[1] ?? ''),
        tipo: 'sheets',
      };
      fontesImportacao.set(id, fonte);
      return makeResult([{ id }], 'INSERT');
    }
    if (text.includes('DELETE FROM fontes_importacao WHERE id = $1')) {
      const id = String(params?.[0] ?? '');
      fontesImportacao.delete(id);
      return makeResult([], 'DELETE');
    }
    if (text.includes('UPDATE fontes_importacao SET ultima_importacao_em = NOW() WHERE id = $1')) {
      return makeResult([], 'UPDATE');
    }
    if (text.includes('SELECT id FROM importacao_fontes_linhas')) {
      const fonteId = String(params?.[0] ?? '');
      const chaveHash = String(params?.[1] ?? '');
      const key = `${fonteId}::${chaveHash}`;
      return importacaoFontesLinhas.has(key)
        ? makeResult([{ id: `linha-${key}` }])
        : makeResult([]);
    }
    if (text.includes('INSERT INTO importacao_fontes_linhas')) {
      const fonteId = String(params?.[0] ?? '');
      const chaveHash = String(params?.[1] ?? '');
      importacaoFontesLinhas.add(`${fonteId}::${chaveHash}`);
      return makeResult([], 'INSERT');
    }
    if (text.includes('INSERT INTO importacoes_legado_operacional')) {
      return makeResult([{ id: 'imp-1', criado_em: new Date().toISOString() }], 'INSERT');
    }
    if (
      text.includes('COUNT(*)') &&
      text.includes('total') &&
      text.includes('FROM importacoes_legado_operacional')
    ) {
      return makeResult([{ total: '0' }]);
    }
    if (text.includes('FROM importacoes_legado_operacional')) {
      return makeResult([]);
    }

    // ── CQ Lotes ──
    if (text.includes('INSERT INTO lotes_cq')) {
      return makeResult(
        [{ id: 'lote-1', codigo: 'LCQ-001', status: 'ABERTO', criado_em: '2024-01-01' }],
        'INSERT'
      );
    }
    if (text.includes('FROM lotes_cq') && !text.includes('WHERE l.id = $1')) {
      return makeResult([
        {
          id: 'lote-1',
          codigo: 'LCQ-001',
          status: 'ABERTO',
          total_itens: 0,
          criado_em: '2024-01-01',
        },
      ]);
    }
    if (text.includes('FROM lotes_cq') && text.includes('WHERE l.id = $1')) {
      return makeResult([
        { id: String(params?.[0]), codigo: 'LCQ-001', status: 'ABERTO', criado_em: '2024-01-01' },
      ]);
    }
    if (text.includes('FROM itens_cq') && text.includes('WHERE lote_id = $1')) {
      return makeResult([]);
    }
    if (text.includes('UPDATE itens_cq SET resultado')) {
      return makeResult(
        [{ id: String(params?.[3] ?? 'item-cq-1'), resultado: String(params?.[0]) }],
        'UPDATE'
      );
    }
    if (text.includes('UPDATE lotes_cq SET status')) {
      return makeResult([{ id: String(params?.[0] ?? params?.[1]), status: 'FECHADO' }], 'UPDATE');
    }

    // ── Relatorios operacionais ──
    if (text.includes('INSERT INTO relatorios_operacionais')) {
      return makeResult(
        [
          {
            id: 'rel-op-1',
            tipo: 'RECEBIMENTO',
            repositorio_id: null,
            lote_id: null,
            arquivo_path: 'relatorios/test.pdf',
            hash_arquivo: 'abc',
            gerado_em: '2024-01-01',
          },
        ],
        'INSERT'
      );
    }
    if (
      text.includes('FROM relatorios_operacionais') &&
      text.includes('WHERE repositorio_id = $1')
    ) {
      return makeResult([]);
    }
    if (text.includes('FROM relatorios_operacionais') && text.includes('WHERE id = $1')) {
      return makeResult([
        { id: String(params?.[0]), tipo: 'RECEBIMENTO', arquivo_path: 'relatorios/test.pdf' },
      ]);
    }

    // ── Relatorios coordenadorias ──
    if (text.includes('FROM coordenadorias') && text.includes('ORDER BY')) {
      return makeResult([{ id: 'coord-1', nome: 'Coordenadoria A', sigla: 'CA' }]);
    }

    // ── Conhecimento operacional ──
    if (text.includes('FROM kb_documentos d')) {
      if (text.includes('WHERE d.id = $1')) {
        return makeResult([
          {
            id: String(params?.[0]),
            codigo: 'KB-001',
            titulo: 'Manual',
            categoria: 'MANUAIS',
            descricao: 'Desc',
            status: 'ATIVO',
            nivel_acesso: 'OPERADOR_ADMIN',
            versao_atual_id: 'v-1',
            criado_em: '2024-01-01',
            atualizado_em: '2024-01-01',
          },
        ]);
      }
      return makeResult([
        {
          id: 'kb-1',
          codigo: 'KB-001',
          titulo: 'Manual',
          categoria: 'MANUAIS',
          descricao: 'Desc',
          status: 'ATIVO',
          nivel_acesso: 'OPERADOR_ADMIN',
          criado_em: '2024-01-01',
          atualizado_em: '2024-01-01',
          versao_atual: 1,
          etapas: ['RECEBIMENTO'],
        },
      ]);
    }
    if (text.includes('FROM kb_documento_etapas')) {
      return makeResult([{ etapa: 'RECEBIMENTO' }]);
    }
    if (text.includes('FROM kb_documento_versoes v')) {
      return makeResult([
        {
          id: 'v-1',
          versao: 1,
          conteudo: 'Conteudo',
          resumo_alteracao: 'Versao inicial',
          publicado_em: '2024-01-01',
          publicado_por_nome: 'Admin',
        },
      ]);
    }
    if (text.includes('INSERT INTO kb_documentos')) {
      return makeResult([{ id: 'kb-new' }], 'INSERT');
    }
    if (text.includes('INSERT INTO kb_documento_versoes')) {
      return makeResult([{ id: 'v-new' }], 'INSERT');
    }
    if (text.includes('INSERT INTO kb_documento_etapas')) {
      return makeResult([], 'INSERT');
    }
    if (text.includes('UPDATE kb_documentos')) {
      return makeResult(
        [
          {
            id: String(params?.[0]),
            codigo: 'KB-001',
            titulo: String(params?.[1] ?? 'Manual'),
            status: 'ATIVO',
          },
        ],
        'UPDATE'
      );
    }
    if (text.includes('DELETE FROM kb_documento_etapas')) {
      return makeResult([], 'DELETE');
    }
    if (text.includes('SELECT id FROM kb_documentos WHERE id = $1')) {
      return makeResult([{ id: String(params?.[0]) }]);
    }
    if (text.includes('COALESCE(MAX(versao), 0) as ultima_versao')) {
      return makeResult([{ ultima_versao: 1 }]);
    }

    // ── Checklist modelos CRUD ──
    if (text.includes('INSERT INTO checklist_modelos')) {
      return makeResult(
        [
          {
            id: 'cm-new',
            codigo: String(params?.[0]),
            descricao: String(params?.[1]),
            obrigatorio: Boolean(params?.[2]),
            ordem: Number(params?.[3]),
            etapa: String(params?.[4]),
            ativo: true,
            criado_em: new Date().toISOString(),
          },
        ],
        'INSERT'
      );
    }
    if (text.includes('UPDATE checklist_modelos') && text.includes('SET codigo')) {
      return makeResult(
        [
          {
            id: String(params?.[0]),
            codigo: String(params?.[1]),
            descricao: String(params?.[2]),
            obrigatorio: Boolean(params?.[3]),
            ordem: Number(params?.[4]),
            etapa: String(params?.[5]),
            ativo: true,
          },
        ],
        'UPDATE'
      );
    }
    if (text.includes('UPDATE checklist_modelos SET ativo = NOT ativo')) {
      return makeResult(
        [
          {
            id: String(params?.[0]),
            codigo: 'REC-001',
            descricao: 'Teste',
            obrigatorio: true,
            ordem: 1,
            etapa: 'RECEBIMENTO',
            ativo: false,
          },
        ],
        'UPDATE'
      );
    }
    if (text.includes('FROM checklist_modelos') && !text.includes('JOIN checklist_modelos')) {
      return makeResult([
        {
          id: 'cm-1',
          codigo: 'REC-001',
          descricao: 'Verificar integridade',
          obrigatorio: true,
          ordem: 1,
          etapa: 'RECEBIMENTO',
          ativo: true,
          criado_em: '2024-01-01',
        },
      ]);
    }

    // ── Seadesk confirmar ──
    if (text.includes('SET seadesk_confirmado_em')) {
      return makeResult(
        [
          {
            id_repositorio_recorda: String(params?.[0]),
            seadesk_confirmado_em: new Date().toISOString(),
            seadesk_confirmado_por: String(params?.[1]),
          },
        ],
        'UPDATE'
      );
    }
    if (text.includes('seadesk_confirmado_em IS NOT NULL AS confirmado')) {
      return makeResult([{ confirmado: false }]);
    }

    // ── Dashboard extras ──
    if (
      text.includes('armario_codigo') &&
      text.includes('FROM repositorios r') &&
      text.includes('JOIN armarios a')
    ) {
      return makeResult([{ armario_codigo: 'ARM-001', etapa: 'RECEBIMENTO', total: '3' }]);
    }
    if (
      text.includes('etapa_origem') &&
      text.includes('LEAD') &&
      text.includes('historico_etapas')
    ) {
      return makeResult([{ etapa: 'RECEBIMENTO', media_horas: '4.5' }]);
    }
    if (
      text.includes('motivo_codigo') &&
      text.includes('lotes_controle_qualidade_itens') &&
      text.includes('REPROVADO')
    ) {
      return makeResult([
        { motivo_codigo: 'NAO_CONFORME', total: '2', repositorios: 'GED-001, GED-002' },
      ]);
    }

    // ── Transaction control ──
    if (text.includes('SELECT pg_try_advisory_xact_lock')) {
      return makeResult([{ acquired: true }]);
    }
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      return makeResult([]);
    }

    return makeResult([{ total: '0' }]);
  });

  const query: DatabaseConnection['query'] = async <T extends QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> => {
    const result = await queryMock(text, params);
    return result as QueryResult<T>;
  };

  const dbConnection: DatabaseConnection & {
    queryMock: Mock<[string, (unknown[] | undefined)?], Promise<QueryResult<QueryResultRow>>>;
    usuarios: typeof usuarios;
    refreshTokens: typeof refreshTokens;
    colaboradores: typeof colaboradores;
    auditoria: typeof auditoria;
    configuracaoProjetos: typeof configuracaoProjetos;
    repositorios: typeof repositorios;
    fontesImportacao: typeof fontesImportacao;
  } = {
    pool: {} as never,
    query,
    queryMock,
    usuarios,
    refreshTokens,
    auditoria,
    colaboradores,
    configuracaoProjetos,
    repositorios,
    fontesImportacao,
    healthCheck: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return dbConnection;
}

describe('HTTP server integration', () => {
  let server: FastifyInstance;
  const database = createMockDatabase();
  const ocrServiceMock: OCRService = {
    validarImagem: vi.fn().mockResolvedValue({ valida: true }),
    extrairTexto: vi.fn().mockResolvedValue({
      texto: 'PROTOCOLO 123',
      confianca: 0.95,
      idioma: 'pt-BR',
      tempoProcessamento: 1500,
    }),
    extrairTextoLote: vi.fn().mockResolvedValue([]),
  };
  const fetchMock: Mock = vi.fn();
  let originalFetch: typeof fetch;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'integration-secret';
    server = await createServer({
      database,
      config: {
        host: '127.0.0.1',
        port: 0,
      },
      ocrService: ocrServiceMock,
    });
    originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', fetchMock);
  });

  afterAll(async () => {
    await server.close();
    const unstubAllGlobals = (vi as any).unstubAllGlobals;
    if (typeof unstubAllGlobals === 'function') {
      unstubAllGlobals();
    } else {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns tokens for valid login', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'user@test.com',
        senha: 'SenhaSegura123',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      usuario: {
        email: 'user@test.com',
        perfil: 'administrador',
      },
    });
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    expect(database.queryMock).toHaveBeenCalledWith(
      expect.stringContaining('FROM usuarios WHERE email = $1'),
      ['user@test.com']
    );
  });

  async function authenticate(): Promise<string> {
    const loginResponse = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'user@test.com',
        senha: 'SenhaSegura123',
      },
    });

    expect(loginResponse.statusCode).toBe(200);
    return loginResponse.json().accessToken as string;
  }

  async function authenticateWithCredentials(
    email: string,
    senha: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const loginResponse = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, senha },
    });

    expect(loginResponse.statusCode).toBe(200);
    const body = loginResponse.json();
    return {
      accessToken: body.accessToken as string,
      refreshToken: body.refreshToken as string,
    };
  }

  it('returns 400 when login payload is missing fields', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'user@test.com',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 401 for invalid login credentials', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'user@test.com',
        senha: 'SenhaErrada123',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(String(response.json().error)).toContain('Credenciais');
  });

  it('refreshes tokens with a valid refresh token', async () => {
    const login = await authenticateWithCredentials('user@test.com', 'SenhaSegura123');
    const refreshTokensBefore = database.refreshTokens.length;

    const refreshResponse = await server.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: login.refreshToken,
      },
    });

    expect(refreshResponse.statusCode).toBe(200);
    const body = refreshResponse.json();
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    expect(database.refreshTokens.length).toBe(refreshTokensBefore + 1);
    expect(database.refreshTokens.some((token) => token.revogado)).toBe(true);
  });

  it('returns 401 for invalid refresh token', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: 'invalid-token',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(String(response.json().error)).toContain('Refresh token');
  });

  it('returns authenticated user profile on /auth/me', async () => {
    const accessToken = await authenticate();
    const response = await server.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'user-1',
      email: 'user@test.com',
      perfil: 'administrador',
    });
  });

  it('requires authentication on protected routes', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/dashboard',
    });

    expect(response.statusCode).toBe(401);
    expect(String(response.json().error)).toContain('Token');
  });

  it('returns success on logout even without a valid token', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/logout',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ message: 'Logout realizado' });
  });

  it('allows admin register and blocks duplicate e-mail', async () => {
    const accessToken = await authenticate();
    const payload = {
      nome: 'Novo Usuario',
      email: 'novo.usuario@recorda.com',
      senha: 'SenhaNova123',
      perfil: 'operador',
      coordenadoriaId: 'coord-1',
    };

    const createResponse = await server.inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload,
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      email: 'novo.usuario@recorda.com',
      perfil: 'operador',
    });

    const duplicateResponse = await server.inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload,
    });

    expect(duplicateResponse.statusCode).toBe(409);
    expect(String(duplicateResponse.json().error)).toContain('E-mail');
  });

  it('blocks register for non-admin users', async () => {
    database.usuarios.set('user-op', {
      id: 'user-op',
      nome: 'Operador Teste',
      email: 'operador@test.com',
      senha_hash: HASHED_PASSWORD,
      perfil: 'operador',
      coordenadoria_id: 'coord-1',
      ativo: true,
    });

    const login = await authenticateWithCredentials('operador@test.com', 'SenhaSegura123');
    const response = await server.inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        authorization: `Bearer ${login.accessToken}`,
      },
      payload: {
        nome: 'Tentativa sem permissao',
        email: 'nao.permitido@recorda.com',
        senha: 'SenhaNova123',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(String(response.json().error)).toContain('administradores');
  });

  it('validates forgot/reset password payloads and invalid token', async () => {
    const forgotMissingEmail = await server.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: {},
    });
    expect(forgotMissingEmail.statusCode).toBe(400);
    expect(String(forgotMissingEmail.json().error)).toContain('E-mail');

    const forgotUnknownEmail = await server.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'inexistente@recorda.com' },
    });
    expect(forgotUnknownEmail.statusCode).toBe(200);
    expect(forgotUnknownEmail.json()).toHaveProperty('message');

    const resetInvalidToken = await server.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'token-invalido', novaSenha: 'SenhaNova123' },
    });
    expect(resetInvalidToken.statusCode).toBe(400);
    expect(String(resetInvalidToken.json().error)).toContain('Token');
  });

  it('lists auditoria logs and statistics', async () => {
    const accessToken = await authenticate();

    const logsResponse = await server.inject({
      method: 'GET',
      url: '/auditoria?tabela=colaboradores&operacao=INSERT&pagina=1&limite=10',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(logsResponse.statusCode).toBe(200);
    expect(logsResponse.json()).toMatchObject({
      total: 2,
      pagina: 1,
    });

    const statsResponse = await server.inject({
      method: 'GET',
      url: '/auditoria/estatisticas',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(statsResponse.statusCode).toBe(200);
    const statsBody = statsResponse.json();
    expect(Array.isArray(statsBody.porOperacao)).toBe(true);
    expect(Array.isArray(statsBody.porTabela)).toBe(true);
    expect(Array.isArray(statsBody.porDia)).toBe(true);
  });

  it('creates and lists project configuration entries', async () => {
    const accessToken = await authenticate();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/configuracao/projetos',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        nome: 'Projeto Integracao',
        descricao: 'Projeto criado em teste de integracao',
        ativo: true,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created).toMatchObject({ nome: 'Projeto Integracao', ativo: true });

    const listResponse = await server.inject({
      method: 'GET',
      url: '/configuracao/projetos',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(listBody.projetos[0]).toMatchObject({ nome: 'Projeto Integracao' });
  });

  it('retorna unidades de recebimento sem duplicar nomes', async () => {
    const token = await authenticate();

    await server.inject({
      method: 'POST',
      url: '/operacional/repositorios',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idRepositorioGed: '000900/2026',
        orgao: 'CINF',
        projeto: 'SEMA',
        classificacaoId: '550e8400-e29b-41d4-a716-446655440000',
      },
    });

    await server.inject({
      method: 'POST',
      url: '/operacional/repositorios',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idRepositorioGed: '000901/2026',
        orgao: 'cinf',
        projeto: 'SGPA',
        classificacaoId: '550e8400-e29b-41d4-a716-446655440000',
      },
    });

    const response = await server.inject({
      method: 'GET',
      url: '/operacional/orgaos-recebimento',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const itens = response.json().itens;
    const cinfMatches = itens.filter((u: any) => u.nome.trim().toLowerCase() === 'cinf');
    expect(cinfMatches.length).toBe(1);
  });

  it('evita duplicatas no nome de projetos configuracao', async () => {
    const token = await authenticate();

    await server.inject({
      method: 'POST',
      url: '/configuracao/projetos',
      headers: { authorization: `Bearer ${token}` },
      payload: { nome: 'Projeto Duplicado', descricao: 'Duplicado 1', ativo: true },
    });

    await server.inject({
      method: 'POST',
      url: '/configuracao/projetos',
      headers: { authorization: `Bearer ${token}` },
      payload: { nome: 'projeto duplicado', descricao: 'Duplicado 2', ativo: true },
    });

    const listResponse = await server.inject({
      method: 'GET',
      url: '/configuracao/projetos',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(listResponse.statusCode).toBe(200);
    const projetos = listResponse.json().projetos;
    const filtered = projetos.filter(
      (p: any) => p.nome.trim().toLowerCase() === 'projeto duplicado'
    );
    expect(filtered.length).toBe(1);
  });

  it('rejects project creation with empty name', async () => {
    const accessToken = await authenticate();
    const response = await server.inject({
      method: 'POST',
      url: '/configuracao/projetos',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        nome: '   ',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(String(response.json().error)).toContain('Nome do projeto');
  });

  it('handles recebimento edge cases', async () => {
    const emptyBatchResponse = await server.inject({
      method: 'POST',
      url: '/recebimento',
      payload: {
        itens: [],
      },
    });

    expect(emptyBatchResponse.statusCode).toBe(410);
    expect(emptyBatchResponse.json()).toMatchObject({ code: 'LEGACY_ENDPOINT_GONE' });

    const invalidImageResponse = await server.inject({
      method: 'POST',
      url: '/recebimento',
      payload: {
        itens: [
          {
            imagemBase64: 'data:image/png;base64,AAA',
          },
        ],
      },
    });

    expect(invalidImageResponse.statusCode).toBe(410);
    expect(invalidImageResponse.json()).toMatchObject({ code: 'LEGACY_ENDPOINT_GONE' });
  });

  it('validates image payload with recebimento/validar', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/recebimento/validar',
      payload: {
        imagemBase64: 'data:image/png;base64,AAA',
      },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ code: 'LEGACY_ENDPOINT_GONE' });
  });

  it('returns dashboard summary for authenticated requests', async () => {
    const accessToken = await authenticate();

    const dashboardResponse = await server.inject({
      method: 'GET',
      url: '/dashboard',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(dashboardResponse.statusCode).toBe(200);
    const dashboardBody = dashboardResponse.json();
    expect(dashboardBody.stats).toMatchObject({
      producaoTotal: expect.any(Number),
      processosAtivos: expect.any(Number),
      processosNovosHoje: expect.any(Number),
    });
    expect(Array.isArray(dashboardBody.producaoPorEtapa)).toBe(true);
    expect(dashboardBody.producaoPorEtapa[0]).toMatchObject({ etapa: expect.any(String) });
  });

  it('returns relatorio completo no formato json', async () => {
    const accessToken = await authenticate();

    const relatorioResponse = await server.inject({
      method: 'GET',
      url: '/relatorios?dataInicio=2024-01-01&dataFim=2024-01-31&formato=json',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(relatorioResponse.statusCode).toBe(200);
    const body = relatorioResponse.json();
    expect(typeof body.titulo).toBe('string');
    expect(Array.isArray(body.resumoPorEtapa)).toBe(true);
    expect(Array.isArray(body.producaoPorCoordenadoria)).toBe(true);
  });

  it('lists documentos OCR com filtros básicos', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/recebimento/documentos?status=PENDENTE&pagina=1&limite=10',
      headers: {
        authorization: `Bearer ${await authenticate()}`,
      },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ code: 'LEGACY_ENDPOINT_GONE' });
  });

  it('processa lote de recebimento com OCR válido', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/recebimento',
      headers: {
        authorization: `Bearer ${await authenticate()}`,
      },
      payload: {
        itens: [
          {
            imagemBase64: 'data:image/png;base64,AAA',
            processoNumero: 'PROC-001',
            observacao: 'Teste',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ code: 'LEGACY_ENDPOINT_GONE' });
  });

  it('retorna 404 para rota legada importar-api removida', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/producao/importar-api',
      headers: {
        authorization: `Bearer ${await authenticate()}`,
      },
      payload: {
        fonteId: 'fonte-1',
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('retorna 404 para rota legada importar-csv removida', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/producao/importar-csv',
      headers: {
        authorization: `Bearer ${await authenticate()}`,
      },
      payload: {
        fonteId: 'fonte-1',
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('retorna 404 para rota legada importar-csv com HTML', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/producao/importar-csv',
      headers: {
        authorization: `Bearer ${await authenticate()}`,
      },
      payload: {
        fonteId: 'fonte-1',
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('retorna 404 para rota legada processar-importacao removida', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/producao/processar-importacao',
      headers: {
        authorization: `Bearer ${await authenticate()}`,
      },
      payload: {
        fonteId: 'fonte-1',
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('retorna 404 para rota legada processar-importacao sem colaborador', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/producao/processar-importacao',
      headers: {
        authorization: `Bearer ${await authenticate()}`,
      },
      payload: {
        fonteId: 'fonte-1',
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('retorna 404 para rota legada importar-csv com acentos', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/producao/importar-csv',
      headers: { authorization: `Bearer ${await authenticate()}` },
      payload: { fonteId: 'fonte-1' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('retorna 404 para rota legada processar-importacao com colunas faltando', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/producao/processar-importacao',
      headers: { authorization: `Bearer ${await authenticate()}` },
      payload: { fonteId: 'fonte-1' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('retorna configuração padrão quando não existem registros', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/configuracao/empresa',
      headers: {
        authorization: `Bearer ${await authenticate()}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ id: null, nome: '', exibirLogoRelatorio: true });
  });

  it('cria e atualiza configuração de empresa', async () => {
    const createResponse = await server.inject({
      method: 'PUT',
      url: '/configuracao/empresa',
      headers: {
        authorization: `Bearer ${await authenticate()}`,
      },
      payload: {
        nome: 'Recorda Ltda',
        cnpj: '00.000.000/0001-00',
        endereco: 'Rua A, 123',
        telefone: '11999999999',
        email: 'contato@recorda.com',
        logoUrl: 'https://recorda/logo.png',
        exibirLogoRelatorio: true,
        exibirEnderecoRelatorio: true,
        exibirContatoRelatorio: false,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created).toMatchObject({ nome: 'Recorda Ltda', email: 'contato@recorda.com' });

    const updateResponse = await server.inject({
      method: 'PUT',
      url: '/configuracao/empresa',
      headers: {
        authorization: `Bearer ${await authenticate()}`,
      },
      payload: {
        nome: 'Recorda Updated',
        cnpj: '00.000.000/0001-00',
        endereco: 'Rua A, 123',
        telefone: '11999999999',
        email: 'admin@recorda.com',
        logoUrl: 'https://recorda/logo.png',
        exibirLogoRelatorio: false,
        exibirEnderecoRelatorio: true,
        exibirContatoRelatorio: true,
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    const updated = updateResponse.json();
    expect(updated).toMatchObject({
      nome: 'Recorda Updated',
      email: 'admin@recorda.com',
      exibirLogoRelatorio: false,
    });
  });

  it('cria processo de recebimento e bloqueia duplicidade', async () => {
    const payload = {
      numero: 'PROC-999',
      interessado: 'Fulano',
      assunto: 'Teste',
      coordenadoriaId: 'coord-1',
      volumes: 2,
    };

    const token = await authenticate();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/recebimento/processo',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload,
    });

    expect(createResponse.statusCode).toBe(410);
    expect(createResponse.json()).toMatchObject({ code: 'LEGACY_ENDPOINT_GONE' });

    const duplicateResponse = await server.inject({
      method: 'POST',
      url: '/recebimento/processo',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload,
    });

    expect(duplicateResponse.statusCode).toBe(410);
    expect(duplicateResponse.json()).toMatchObject({ code: 'LEGACY_ENDPOINT_GONE' });
  });

  it('lista processos recebidos aplicando filtros e paginação', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/recebimento/processos?status=ATIVO&busca=PROC&pagina=1&limite=10',
      headers: {
        authorization: `Bearer ${await authenticate()}`,
      },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ code: 'LEGACY_ENDPOINT_GONE' });
  });

  it('lista colaboradores com paginação', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/colaboradores?limite=10&pagina=1',
      headers: {
        authorization: `Bearer ${await authenticate()}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.colaboradores[0]).toMatchObject({ nome: 'Colaborador 1', matricula: 'MAT001' });
  });

  it('cria e atualiza colaborador respeitando regras de matrícula', async () => {
    const token = await authenticate();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/colaboradores',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        nome: 'Novo Colaborador',
        matricula: 'MAT999',
        email: 'novo@recorda.com',
        coordenadoriaId: 'coord-1',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const criado = createResponse.json();
    expect(criado).toMatchObject({ nome: 'Novo Colaborador', matricula: 'MAT999' });

    const updateResponse = await server.inject({
      method: 'PUT',
      url: `/colaboradores/${criado.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        nome: 'Colaborador Editado',
        matricula: 'MAT999',
        email: 'editado@recorda.com',
        coordenadoriaId: 'coord-1',
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      nome: 'Colaborador Editado',
      email: 'editado@recorda.com',
    });

    const duplicateResponse = await server.inject({
      method: 'POST',
      url: '/colaboradores',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        nome: 'Outro',
        matricula: 'MAT999',
        email: 'outro@recorda.com',
        coordenadoriaId: 'coord-1',
      },
    });

    expect(duplicateResponse.statusCode).toBe(409);
  });

  it('alternar status de colaborador e busca por ID', async () => {
    const token = await authenticate();

    const toggleResponse = await server.inject({
      method: 'PATCH',
      url: '/colaboradores/col-1/toggle-ativo',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(toggleResponse.statusCode).toBe(200);
    expect(toggleResponse.json()).toMatchObject({ id: 'col-1', ativo: false });

    const detailResponse = await server.inject({
      method: 'GET',
      url: '/colaboradores/col-1',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: 'col-1',
      coordenadoria_nome: 'Coordenação X',
    });
  });

  // ═══════════════════════════════════════════════
  // Health & Metrics
  // ═══════════════════════════════════════════════

  it('returns health status with database check', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ status: 'ok' });
    expect(body.checks).toMatchObject({ database: true });
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('timestamp');
  });

  it('returns system metrics', async () => {
    const response = await server.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('memory');
    expect(body.memory).toHaveProperty('rss');
    expect(body).toHaveProperty('node');
    expect(body).toHaveProperty('pid');
  });

  // ═══════════════════════════════════════════════
  // Coordenadorias
  // ═══════════════════════════════════════════════

  it('lista coordenadorias ativas', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/coordenadorias',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ sigla: expect.any(String) });
  });

  // ═══════════════════════════════════════════════
  // Etapas CRUD
  // ═══════════════════════════════════════════════

  it('lista etapas com paginação', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/etapas?limite=10&pagina=1',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('etapas');
    expect(body).toHaveProperty('total');
    expect(body.etapas[0]).toMatchObject({ nome: expect.any(String) });
  });

  it('cria etapa e busca por ID', async () => {
    const token = await authenticate();
    const createResponse = await server.inject({
      method: 'POST',
      url: '/etapas',
      headers: { authorization: `Bearer ${token}` },
      payload: { nome: 'Nova Etapa', descricao: 'Desc', unidade: 'docs', ordem: 3 },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({ nome: 'Nova Etapa' });

    const detailResponse = await server.inject({
      method: 'GET',
      url: '/etapas/etapa-1',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({ id: 'etapa-1' });
  });

  it('atualiza etapa existente', async () => {
    const response = await server.inject({
      method: 'PUT',
      url: '/etapas/etapa-1',
      headers: { authorization: `Bearer ${await authenticate()}` },
      payload: { nome: 'Etapa Editada', descricao: 'Nova desc', unidade: 'pags', ordem: 1 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ nome: 'Etapa Editada' });
  });

  it('alterna status ativa de etapa', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: '/etapas/etapa-1/toggle-ativa',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ativa: false });
  });

  it('rejeita criação de etapa sem nome', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/etapas',
      headers: { authorization: `Bearer ${await authenticate()}` },
      payload: { descricao: 'Sem nome' },
    });
    expect(response.statusCode).toBe(400);
  });

  // ═══════════════════════════════════════════════
  // Auth - Listar usuários
  // ═══════════════════════════════════════════════

  it('lista usuários para administrador', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/auth/usuarios',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.usuarios)).toBe(true);
  });

  // ═══════════════════════════════════════════════
  // Relatórios - Coordenadorias
  // ═══════════════════════════════════════════════

  it('lista coordenadorias para relatórios', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/relatorios/coordenadorias',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ sigla: expect.any(String) });
  });

  // ═══════════════════════════════════════════════
  // Metas, Desempenho, Mapeamentos
  // ═══════════════════════════════════════════════

  it('lista metas de produção', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/producao/metas',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('metas');
  });

  it('cria meta de produção', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/producao/metas',
      headers: { authorization: `Bearer ${await authenticate()}` },
      payload: { etapaId: 'etapa-1', metaDiaria: 50, metaMensal: 1000 },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ etapa_id: 'etapa-1', meta_mensal: 1000 });
  });

  it('retorna indicadores de desempenho', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/producao/desempenho?periodo=mes',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('desempenho');
    expect(Array.isArray(body.desempenho)).toBe(true);
  });

  it('lista mapeamentos de importação', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/producao/mapeamentos',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('mapeamentos');
  });

  it('cria mapeamento de importação', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/producao/mapeamentos',
      headers: { authorization: `Bearer ${await authenticate()}` },
      payload: { nome: 'Template B', mapeamento: { col: 'val' } },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ nome: 'Template B' });
  });

  // ═══════════════════════════════════════════════
  // Operacional - Armários e Repositórios
  // ═══════════════════════════════════════════════

  it('retorna 404 para rota de armários removida', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/operacional/armarios',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it('cria repositório operacional', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/operacional/repositorios',
      headers: { authorization: `Bearer ${await authenticate()}` },
      payload: {
        idRepositorioGed: 'GED-NEW',
        orgao: 'Orgao X',
        projeto: 'Projeto Y',
        classificacaoId: '550e8400-e29b-41d4-a716-446655440000',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status_atual: 'RECEBIDO' });
    expect(response.json().id_repositorio_ged).toContain('GED-NEW');
  });

  it('permite mesmo ID GED em unidade/projeto diferentes', async () => {
    const token = await authenticate();
    const first = await server.inject({
      method: 'POST',
      url: '/operacional/repositorios',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idRepositorioGed: '000025/2026',
        orgao: 'SGPA',
        projeto: 'SEMA',
        classificacaoId: '550e8400-e29b-41d4-a716-446655440000',
      },
    });
    const second = await server.inject({
      method: 'POST',
      url: '/operacional/repositorios',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idRepositorioGed: '000025/2026',
        orgao: 'SEPLAG',
        projeto: 'SEMA',
        classificacaoId: '550e8400-e29b-41d4-a716-446655440000',
      },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
  });

  it('bloqueia duplicidade no mesmo contexto (ID + unidade + projeto)', async () => {
    const token = await authenticate();
    const first = await server.inject({
      method: 'POST',
      url: '/operacional/repositorios',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idRepositorioGed: '000026/2026',
        orgao: 'SGPA',
        projeto: 'SEMA',
        classificacaoId: '550e8400-e29b-41d4-a716-446655440000',
      },
    });
    const second = await server.inject({
      method: 'POST',
      url: '/operacional/repositorios',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        idRepositorioGed: '000026/2026',
        orgao: 'SGPA',
        projeto: 'SEMA',
        classificacaoId: '550e8400-e29b-41d4-a716-446655440000',
      },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      error: 'repositorio ja cadastrado para esta unidade e projeto',
    });
  });

  it('rejeita repositório sem campos obrigatórios', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/operacional/repositorios',
      headers: { authorization: `Bearer ${await authenticate()}` },
      payload: { orgao: 'Orgao X' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('lista repositórios com paginação', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/operacional/repositorios?pagina=1&limite=10',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('itens');
    expect(body).toHaveProperty('total');
  });

  it('aplica filtros de orgao e projeto na listagem de repositorios', async () => {
    database.queryMock.mockClear();

    const response = await server.inject({
      method: 'GET',
      url: '/operacional/repositorios?orgao=SGPA&projeto=SEMA&pagina=1&limite=10',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });

    expect(response.statusCode).toBe(200);

    const countCall = database.queryMock.mock.calls.find(
      ([sql]) =>
        sql.includes('SELECT COUNT(*)::text as total') && sql.includes('FROM repositorios r')
    );
    expect(countCall).toBeTruthy();
    expect(countCall?.[0]).toContain('LOWER(TRIM(r.orgao)) = LOWER(TRIM($');
    expect(countCall?.[0]).toContain('LOWER(TRIM(r.projeto)) = LOWER(TRIM($');
    expect(countCall?.[1]).toEqual(expect.arrayContaining(['SGPA', 'SEMA']));

    const contadoresCall = database.queryMock.mock.calls.find(
      ([sql]) =>
        sql.includes('SELECT r.status_atual, COUNT(*)::text AS qtd') &&
        sql.includes('FROM repositorios r')
    );
    expect(contadoresCall).toBeTruthy();
    expect(contadoresCall?.[0]).toContain('LOWER(TRIM(r.orgao)) = LOWER(TRIM($');
    expect(contadoresCall?.[0]).toContain('LOWER(TRIM(r.projeto)) = LOWER(TRIM($');
    expect(contadoresCall?.[1]).toEqual(expect.arrayContaining(['SGPA', 'SEMA']));
  });

  it('aplica filtros por data de criação na listagem de repositorios', async () => {
    database.queryMock.mockClear();

    const response = await server.inject({
      method: 'GET',
      url: '/operacional/repositorios?orgao=SGPA&dataInicio=2026-01-01&dataFim=2026-01-31&pagina=1&limite=10',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });

    expect(response.statusCode).toBe(200);

    const countCall = database.queryMock.mock.calls.find(
      ([sql]) =>
        sql.includes('SELECT COUNT(*)::text as total') && sql.includes('FROM repositorios r')
    );
    expect(countCall).toBeTruthy();
    expect(countCall?.[0]).toContain('r.data_criacao >= $');
    expect(countCall?.[0]).toContain('r.data_criacao < ($');
    expect(countCall?.[1]).toEqual(expect.arrayContaining(['SGPA', '2026-01-01', '2026-01-31']));

    const contadoresCall = database.queryMock.mock.calls.find(
      ([sql]) =>
        sql.includes('SELECT r.status_atual, COUNT(*)::text AS qtd') &&
        sql.includes('FROM repositorios r')
    );
    expect(contadoresCall).toBeTruthy();
    expect(contadoresCall?.[0]).toContain('r.data_criacao >= $');
    expect(contadoresCall?.[0]).toContain('r.data_criacao < ($');
    expect(contadoresCall?.[1]).toEqual(
      expect.arrayContaining(['SGPA', '2026-01-01', '2026-01-31'])
    );
  });

  it('aplica busca por processo/apenso na listagem de repositorios', async () => {
    database.queryMock.mockClear();

    const response = await server.inject({
      method: 'GET',
      url: '/operacional/repositorios?etapa=RECEBIMENTO&busca=502824/2021&pagina=1&limite=10',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });

    expect(response.statusCode).toBe(200);

    const countCall = database.queryMock.mock.calls.find(
      ([sql]) =>
        sql.includes('SELECT COUNT(*)::text as total') && sql.includes('FROM repositorios r')
    );
    expect(countCall).toBeTruthy();
    expect(countCall?.[0]).toContain('FROM recebimento_processos rp');
    expect(countCall?.[0]).toContain('FROM recebimento_apensos ra');
    expect(countCall?.[0]).toContain('rp.protocolo ILIKE');
    expect(countCall?.[0]).toContain('ra.protocolo ILIKE');
    expect(countCall?.[1]).toEqual(expect.arrayContaining(['%502824/2021%']));
  });

  // ═══════════════════════════════════════════════
  // Operacional - Checklists
  // ═══════════════════════════════════════════════

  it('lista checklists de repositório', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/operacional/repositorios/repo-1/checklists',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('itens');
  });

  // ═══════════════════════════════════════════════
  // Operacional - Importações legado
  // ═══════════════════════════════════════════════

  it('lista importações legado', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/operacional/importacoes-legado?pagina=1&limite=10',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('itens');
    expect(body).toHaveProperty('total');
  });

  it('valida duplicatas de fonte respeitando contexto de repositorio', async () => {
    const token = await authenticate();
    database.repositorios.set('000025/2026::SEPLAG::LEGADO', {
      id_repositorio_recorda: 'repo-legado-seplag',
      id_repositorio_ged: '000025/2026',
      orgao: 'SEPLAG',
      projeto: 'LEGADO',
      status_atual: 'RECEBIDO',
      etapa_atual: 'RECEBIMENTO',
    });

    const fonteResp = await server.inject({
      method: 'POST',
      url: '/operacional/fontes-importacao',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        nome: 'Fonte Teste',
        url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0',
      },
    });
    expect(fonteResp.statusCode).toBe(201);
    const fonteId = fonteResp.json().id as string;

    fetchMock.mockResolvedValueOnce(
      new Response(
        'data,colaborador,repositorio,coordenadoria,quantidade,tipo,funcao\n05/03/2026,Usuario Teste,000025/2026,SGPA,1,,recebimento',
        { status: 200, headers: { 'content-type': 'text/csv' } }
      )
    );

    const response = await server.inject({
      method: 'POST',
      url: `/operacional/fontes-importacao/${fonteId}/validar-duplicatas`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.novos.quantidade).toBeGreaterThan(0);
    expect(body.duplicados.quantidade).toBe(0);
  });

  it('mantem idempotencia ao reimportar a mesma planilha de fonte', async () => {
    const token = await authenticate();
    fetchMock.mockReset();

    const fonteResp = await server.inject({
      method: 'POST',
      url: '/operacional/fontes-importacao',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        nome: 'Fonte Idempotencia',
        url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0',
      },
    });
    expect(fonteResp.statusCode).toBe(201);
    const fonteId = fonteResp.json().id as string;

    const csv =
      'data,colaborador,repositorio,coordenadoria,quantidade,tipo,funcao\n05/03/2026,Usuario Teste,000027/2026,SGPA,1,,recebimento';
    fetchMock
      .mockResolvedValueOnce(
        new Response(csv, { status: 200, headers: { 'content-type': 'text/csv' } })
      )
      .mockResolvedValueOnce(
        new Response(csv, { status: 200, headers: { 'content-type': 'text/csv' } })
      );

    const primeiraImportacao = await server.inject({
      method: 'POST',
      url: `/operacional/fontes-importacao/${fonteId}/importar`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(primeiraImportacao.statusCode).toBe(200);
    const bodyPrimeira = primeiraImportacao.json();
    expect(bodyPrimeira.importados).toBeGreaterThan(0);

    const segundaImportacao = await server.inject({
      method: 'POST',
      url: `/operacional/fontes-importacao/${fonteId}/importar`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(segundaImportacao.statusCode).toBe(200);
    const bodySegunda = segundaImportacao.json();
    expect(bodySegunda.importados).toBe(0);
    expect(bodySegunda.ignorados).toBeGreaterThan(0);
    expect(bodySegunda.duplicados).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════
  // Operacional - CQ Lotes
  // ═══════════════════════════════════════════════

  it('lista lotes de controle de qualidade', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/operacional/lotes-cq',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('itens');
  });

  // ═══════════════════════════════════════════════
  // Conhecimento Operacional
  // ═══════════════════════════════════════════════

  it('lista documentos da base de conhecimento', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/operacional/conhecimento/documentos',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('itens');
  });

  it('busca documento de conhecimento por ID', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/operacional/conhecimento/documentos/kb-1',
      headers: { authorization: `Bearer ${await authenticate()}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('documento');
    expect(body).toHaveProperty('etapas');
    expect(body).toHaveProperty('versoes');
  });

  it('cria documento de conhecimento operacional', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/operacional/conhecimento/documentos',
      headers: { authorization: `Bearer ${await authenticate()}` },
      payload: {
        codigo: 'KB-002',
        titulo: 'Novo Manual',
        categoria: 'MANUAIS',
        conteudo: 'Conteúdo do manual',
        etapas: ['RECEBIMENTO'],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toHaveProperty('id');
    expect(response.json()).toHaveProperty('versaoAtualId');
  });

  it('rejeita documento de conhecimento sem campos obrigatórios', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/operacional/conhecimento/documentos',
      headers: { authorization: `Bearer ${await authenticate()}` },
      payload: { titulo: 'Sem codigo' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('publica nova versão de documento de conhecimento', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/operacional/conhecimento/documentos/kb-1/versoes',
      headers: { authorization: `Bearer ${await authenticate()}` },
      payload: {
        conteudo: 'Conteúdo atualizado v2',
        resumoAlteracao: 'Atualização de procedimento',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ documentoId: 'kb-1', versao: 2 });
  });

  it('atualiza metadados de documento de conhecimento', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: '/operacional/conhecimento/documentos/kb-1',
      headers: { authorization: `Bearer ${await authenticate()}` },
      payload: {
        titulo: 'Manual Atualizado',
        status: 'ATIVO',
        etapas: ['RECEBIMENTO', 'PREPARACAO'],
      },
    });
    expect(response.statusCode).toBe(200);
  });

  // ═══════════════════════════════════════════════
  // Checklist Modelos CRUD
  // ═══════════════════════════════════════════════

  it('lista modelos de checklist (admin)', async () => {
    const token = await authenticate();
    const response = await server.inject({
      method: 'GET',
      url: '/operacional/checklist-modelos',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('itens');
  });

  it('cria modelo de checklist (admin)', async () => {
    const token = await authenticate();
    const response = await server.inject({
      method: 'POST',
      url: '/operacional/checklist-modelos',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigo: 'PREP-001',
        descricao: 'Verificar higienização',
        obrigatorio: true,
        ordem: 1,
        etapa: 'PREPARACAO',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ codigo: 'PREP-001', etapa: 'PREPARACAO' });
  });

  it('rejeita modelo de checklist sem campos obrigatórios', async () => {
    const token = await authenticate();
    const response = await server.inject({
      method: 'POST',
      url: '/operacional/checklist-modelos',
      headers: { authorization: `Bearer ${token}` },
      payload: { codigo: 'X' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('atualiza modelo de checklist (admin)', async () => {
    const token = await authenticate();
    const response = await server.inject({
      method: 'PUT',
      url: '/operacional/checklist-modelos/cm-1',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        codigo: 'REC-001',
        descricao: 'Verificar integridade atualizado',
        obrigatorio: true,
        ordem: 1,
        etapa: 'RECEBIMENTO',
      },
    });
    expect(response.statusCode).toBe(200);
  });

  it('toggle ativo de modelo de checklist (admin)', async () => {
    const token = await authenticate();
    const response = await server.inject({
      method: 'PATCH',
      url: '/operacional/checklist-modelos/cm-1/toggle-ativo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('ativo');
  });

  it('bloqueia operador em rotas de checklist-modelos', async () => {
    database.usuarios.set('user-op2', {
      id: 'user-op2',
      nome: 'Operador CK',
      email: 'operador.ck@test.com',
      senha_hash: HASHED_PASSWORD,
      perfil: 'operador',
      coordenadoria_id: 'coord-1',
      ativo: true,
    });
    const login = await authenticateWithCredentials('operador.ck@test.com', 'SenhaSegura123');
    const response = await server.inject({
      method: 'GET',
      url: '/operacional/checklist-modelos',
      headers: { authorization: `Bearer ${login.accessToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  // ═══════════════════════════════════════════════
  // Seadesk Confirmation
  // ═══════════════════════════════════════════════

  it('confirma envio Seadesk em repositório na digitalização', async () => {
    const token = await authenticate();
    const response = await server.inject({
      method: 'PATCH',
      url: '/operacional/repositorios/repo-1/seadesk-confirmar',
      headers: { authorization: `Bearer ${token}` },
    });
    // Mock returns etapa_atual = RECEBIMENTO, so it should fail with ETAPA_INVALIDA
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'ETAPA_INVALIDA' });
  });

  // ═══════════════════════════════════════════════
  // CQ Admin-Only Restriction
  // ═══════════════════════════════════════════════

  it('bloqueia operador em rota de fechar lote CQ', async () => {
    database.usuarios.set('user-op3', {
      id: 'user-op3',
      nome: 'Operador CQ',
      email: 'operador.cq@test.com',
      senha_hash: HASHED_PASSWORD,
      perfil: 'operador',
      coordenadoria_id: 'coord-1',
      ativo: true,
    });
    const login = await authenticateWithCredentials('operador.cq@test.com', 'SenhaSegura123');
    const response = await server.inject({
      method: 'POST',
      url: '/operacional/lotes-cq/lote-1/fechar',
      headers: { authorization: `Bearer ${login.accessToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it('bloqueia operador em rota de gerar relatório de entrega CQ', async () => {
    const login = await authenticateWithCredentials('operador.cq@test.com', 'SenhaSegura123');
    const response = await server.inject({
      method: 'POST',
      url: '/operacional/lotes-cq/lote-1/relatorio-entrega',
      headers: { authorization: `Bearer ${login.accessToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  // ═══════════════════════════════════════════════
  // Dashboard with new indicators
  // ═══════════════════════════════════════════════

  it('dashboard inclui backlogPorEtapa, tempoMedioPorEtapa e retrabalhoCQ', async () => {
    const token = await authenticate();
    const response = await server.inject({
      method: 'GET',
      url: '/dashboard',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('backlogPorEtapa');
    expect(body).toHaveProperty('tempoMedioPorEtapa');
    expect(body).toHaveProperty('retrabalhoCQ');
    expect(Array.isArray(body.backlogPorEtapa)).toBe(true);
    expect(Array.isArray(body.tempoMedioPorEtapa)).toBe(true);
    expect(Array.isArray(body.retrabalhoCQ)).toBe(true);
  });
});
