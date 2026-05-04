import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { createHash, randomUUID } from 'crypto';
import { authorize } from '../middleware/auth.js';
import { sendDatabaseError } from '../middleware/error-handler.js';
import { validateBody } from '../middleware/validate.js';
import {
  importacaoLegadoSchema,
  importacaoLegadoRecebimentoSchema,
  importacaoLegadoProducaoSchema,
} from '../schemas/operacional.js';
import {
  type EtapaFluxo,
  type StatusRepositorio,
  getCurrentUser,
} from './operacional-helpers.js';
import { normalizeIdRepositorioGed } from './operacional-repositorios.js';
import {
  type ValidationResult,
  parseDataProducaoPlanilha,
  parseQuantidadePlanilha,
} from '../../../domain/producao/importacao-legado.js';
import { SYSTEM_TIMEZONE } from '../../../domain/producao/producao-metrics.js';

const PROJETO_IMPORTACAO_PRODUCAO = 'IMPORTACAO_PRODUCAO';

interface ParsedAndValidatedImportRow {
  repoIdentificadorRaw: string;
  colaboradorNome: string;
  quantidade: number;
  dataProducaoStr: string;
  dataOriginalRaw: string;
  anoRef: number;
  tipoMarcador: string;
  funcaoMarcador: string;
  coordenadoriaMarcador: string;
}

function parseImportRowStrict(
  row: ParsedImportRow | Record<string, unknown> | null | undefined
): { ok: true; value: ParsedAndValidatedImportRow } | { ok: false; error: string } {
  if (!row) return { ok: false, error: 'Registro invalido' };

  const repoIdentificadorRaw = String(row.repositorio ?? '').trim();
  if (!repoIdentificadorRaw) {
    return { ok: false, error: 'Coluna repositorio e obrigatoria' };
  }

  const colaboradorNome = String(row.colaborador ?? '').trim();
  if (!colaboradorNome) {
    return { ok: false, error: 'Coluna colaborador e obrigatoria' };
  }

  const quantidadeResult = parseQuantidadePlanilha(row.quantidade);
  if (!quantidadeResult.ok) {
    return { ok: false, error: quantidadeResult.error };
  }

  const dataResult = parseDataProducaoPlanilha(row.data);
  if (!dataResult.ok) {
    return { ok: false, error: dataResult.error };
  }

  return {
    ok: true,
    value: {
      repoIdentificadorRaw,
      colaboradorNome,
      quantidade: quantidadeResult.value,
      dataProducaoStr: dataResult.value,
      dataOriginalRaw: String(row.data ?? '').trim(),
      anoRef: Number(dataResult.value.slice(0, 4)),
      tipoMarcador: String(row.tipo ?? '').trim(),
      funcaoMarcador: String(row.funcao ?? '').trim(),
      coordenadoriaMarcador: String(row.coordenadoria ?? '').trim(),
    },
  };
}

function normalizeImportKeyPart(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildImportRowHash(parts: Record<string, unknown>): string {
  const payload = Object.keys(parts)
    .sort()
    .map((k) => `${k}:${normalizeImportKeyPart(parts[k])}`)
    .join('|');
  return createHash('sha256').update(payload).digest('hex');
}

interface ParsedImportRow {
  data: string;
  colaborador: string;
  funcao: string;
  repositorio: string;
  coordenadoria: string;
  quantidade: string;
  tipo: string;
}

interface CsvFetchResult {
  csvUrl: string;
  csvContent: string;
  contentType: string;
}

function ensureGoogleSheetsUrlHasExplicitGid(rawUrl: string): ValidationResult<string> {
  const trimmed = rawUrl.trim();
  const isPublishedSpreadsheetUrl = trimmed.includes('/spreadsheets/d/e/');
  const isEditSpreadsheetUrl =
    !isPublishedSpreadsheetUrl && /\/spreadsheets\/d\/[a-zA-Z0-9_-]+/.test(trimmed);
  const hasExplicitGid = /[?&#]gid=\d+/.test(trimmed);

  if (isEditSpreadsheetUrl && !hasExplicitGid) {
    return {
      ok: false,
      error:
        'A URL da planilha precisa apontar para uma aba especifica (gid). Abra a aba correta no Google Sheets e copie a URL completa antes de importar.',
    };
  }

  return { ok: true, value: trimmed };
}

function buildCsvUrlFromSourceUrl(rawUrl: string, requireExplicitGid = true): string {
  const trimmed = rawUrl.trim();
  if (requireExplicitGid) {
    const urlValidation = ensureGoogleSheetsUrlHasExplicitGid(rawUrl);
    if (!urlValidation.ok) {
      throw new Error(urlValidation.error);
    }
  }

  let csvUrl = trimmed;
  const spreadsheetIdMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (spreadsheetIdMatch) {
    const spreadsheetId = spreadsheetIdMatch[1];
    const gidMatch = trimmed.match(/[?&#]gid=(\d+)/);
    const gid = gidMatch?.[1] ?? '0';
    csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  } else if (trimmed.includes('/spreadsheets/d/e/') && !trimmed.includes('output=csv')) {
    csvUrl = trimmed.includes('?') ? `${trimmed}&output=csv` : `${trimmed}?output=csv`;
  }
  return csvUrl;
}

async function fetchCsvFromSourceUrl(
  rawUrl: string,
  timeoutMs = 15_000,
  requireExplicitGid = true
): Promise<CsvFetchResult> {
  const csvUrl = buildCsvUrlFromSourceUrl(rawUrl, requireExplicitGid);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(csvUrl, {
      signal: controller.signal,
      headers: { Accept: 'text/csv, text/plain, */*' },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = new Error(`Erro ao acessar planilha (HTTP ${response.status})`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  return {
    csvUrl,
    csvContent: await response.text(),
    contentType: response.headers.get('content-type') ?? '',
  };
}

function sendSpreadsheetFetchError(
  reply: FastifyReply,
  error: unknown,
  fallbackMessage = 'Erro ao acessar planilha.'
): FastifyReply {
  const status = (error as { status?: number }).status;
  if (error instanceof Error && error.name === 'AbortError') {
    return reply.status(408).send({ error: 'Timeout ao acessar a planilha. Tente novamente.' });
  }
  if (status === 404) {
    return reply.status(400).send({
      error: 'Planilha nao encontrada. Verifique se a URL esta correta e a planilha esta publicada.',
    });
  }
  if (status === 403 || status === 401) {
    return reply.status(400).send({
      error:
        'Acesso negado. A planilha precisa estar publicada na web (Arquivo > Compartilhar > Publicar na Web).',
    });
  }
  if (status) {
    return reply.status(400).send({
      error: `Erro ao acessar planilha (HTTP ${status}). Verifique se a URL esta correta.`,
    });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return reply.status(400).send({ error: message });
}

function parseImportRowsFromCsv(csvContent: string): ParsedImportRow[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const isTab = lines[0]!.includes('\t');
  const separator = lines[0]!.includes(';') ? ';' : ',';

  const splitLine = (line: string): string[] => {
    if (isTab) return line.split('\t').map((c) => c.trim());
    const out: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
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
    return out.map((s) => s.trim());
  };

  const normalizeH = (v: string) =>
    v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const headersRaw = splitLine(lines[0]!);
  const headers = headersRaw.map(normalizeH);
  const indexOf = (aliases: string[]) => headers.findIndex((h) => aliases.includes(h));

  const idxData = indexOf(['data', 'date']);
  const idxColaborador = indexOf(['colaborador', 'nome', 'funcionario']);
  const idxFuncao = indexOf(['funcao', 'funcao', 'cargo']);
  const idxRepositorio = indexOf([
    'repositorio',
    'repositorio',
    'repo',
    'protocolo',
    'numero',
    'numero',
    'id',
    'identificacao',
  ]);
  const idxCoordenadoria = indexOf(['coordenadoria', 'coord', 'unidade']);
  const idxQuantidade = indexOf(['quantidade', 'qtd', 'qtde']);
  const idxTipo = indexOf(['tipo']);

  if (idxRepositorio < 0 || idxColaborador < 0) {
    return [];
  }

  const registros: ParsedImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]!);
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

/**
 * Importacao legado routes: validar, importar recebimento, importar producao, listar, limpar.
 */
export function createOperacionalImportacaoLegadoRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    const validEtapas: EtapaFluxo[] = [
      'RECEBIMENTO',
      'PREPARACAO',
      'DIGITALIZACAO',
      'CONFERENCIA',
      'MONTAGEM',
      'CONTROLE_QUALIDADE',
      'ENTREGA',
    ];
    const etapaStatusMap: Record<string, StatusRepositorio> = {
      RECEBIMENTO: 'RECEBIDO',
      PREPARACAO: 'EM_PREPARACAO',
      DIGITALIZACAO: 'EM_DIGITALIZACAO',
      CONFERENCIA: 'EM_CONFERENCIA',
      MONTAGEM: 'EM_MONTAGEM',
      CONTROLE_QUALIDADE: 'EM_CQ',
      ENTREGA: 'EM_ENTREGA',
    };
    const funcaoToEtapa = (funcao: string, fallbackRaw?: string): EtapaFluxo => {
      const f = funcao
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
      if (f.includes('receb')) return 'RECEBIMENTO';
      if (f.includes('prepar')) return 'PREPARACAO';
      if (f.includes('digital')) return 'DIGITALIZACAO';
      if (f.includes('confer')) return 'CONFERENCIA';
      if (f.includes('montag')) return 'MONTAGEM';
      if (f.includes('qualidade') || f.includes('cq')) return 'CONTROLE_QUALIDADE';
      if (f.includes('entreg')) return 'ENTREGA';
      const fallback = (fallbackRaw ?? 'RECEBIMENTO').toUpperCase() as EtapaFluxo;
      return validEtapas.includes(fallback) ? fallback : 'RECEBIMENTO';
    };

    // POST /operacional/importacoes-legado/validar - Validar duplicidades antes de importar
    server.post(
      '/operacional/importacoes-legado/validar',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Validar duplicidades antes de importar legado',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('operador', 'administrador'),
          validateBody(importacaoLegadoSchema),
        ],
      },
      async (request, reply) => {
        try {
          const body = request.body as {
            tipo: 'recebimento' | 'producao';
            etapa?: string;
            registros: Array<Record<string, unknown>>;
          };

          const { tipo, registros } = body;
          if (!registros || registros.length === 0) {
            return reply.status(400).send({ error: 'Nenhum registro para validar' });
          }

          const duplicadasPlanilha: number[] = [];
          const duplicadasBanco: number[] = [];

          if (tipo === 'recebimento') {
            // Detectar duplicatas intra-planilha por (repositorio, processo, interessado)
            const vistos = new Map<string, number>();
            for (let i = 0; i < registros.length; i++) {
              const row = registros[i] as Record<string, string | undefined>;
              const repo = normalizeIdRepositorioGed(
                (row.idRepositorioGed ?? '').trim()
              ).toLowerCase();
              const processo = (row.processo ?? '').trim().toLowerCase();
              const interessado = (row.interessado ?? '').trim().toLowerCase();
              const chave = `${repo}|${processo}|${interessado}`;
              if (vistos.has(chave)) {
                duplicadasPlanilha.push(i + 1);
                const primeiraLinha = vistos.get(chave)!;
                if (!duplicadasPlanilha.includes(primeiraLinha)) {
                  duplicadasPlanilha.push(primeiraLinha);
                }
              } else {
                vistos.set(chave, i + 1);
              }
            }

            // Detectar duplicatas contra o banco (repositorio + processo ja existente)
            const repoIds = [
              ...new Set(
                registros
                  .map((r) => {
                    const raw = ((r as Record<string, string>).idRepositorioGed ?? '').trim();
                    return raw ? normalizeIdRepositorioGed(raw) : '';
                  })
                  .filter(Boolean)
              ),
            ];

            if (repoIds.length > 0) {
              const existentes = await server.database.query<{
                id_repositorio_ged: string;
                processo: string;
              }>(
                `SELECT r.id_repositorio_ged, rd.processo
               FROM recebimento_documentos rd
               JOIN repositorios r ON r.id_repositorio_recorda = rd.repositorio_id
               WHERE r.id_repositorio_ged = ANY($1)`,
                [repoIds]
              );
              const existentesSet = new Set(
                existentes.rows.map(
                  (e) => `${e.id_repositorio_ged.toLowerCase()}|${e.processo.toLowerCase()}`
                )
              );

              for (let i = 0; i < registros.length; i++) {
                const row = registros[i] as Record<string, string | undefined>;
                const repo = normalizeIdRepositorioGed((row.idRepositorioGed ?? '').trim());
                const processo = (row.processo ?? '').trim().toLowerCase();
                const chave = `${repo.toLowerCase()}|${processo}`;
                if (existentesSet.has(chave)) {
                  duplicadasBanco.push(i + 1);
                }
              }
            }
          } else {
            // Producao: duplicata intra-planilha por (data, colaborador, repositorio, quantidade, tipo, funcao)
            const vistos = new Map<string, number>();
            for (let i = 0; i < registros.length; i++) {
              const row = registros[i] as Record<string, string | undefined>;
              const data = (row.data ?? '').trim().toLowerCase();
              const colaborador = (row.colaborador ?? '').trim().toLowerCase();
              const repo = normalizeIdRepositorioGed((row.repositorio ?? '').trim()).toLowerCase();
              const quantidade = (row.quantidade ?? '').toString().trim();
              const tipoVal = (row.tipo ?? '').trim().toLowerCase();
              const funcaoVal = (row.funcao ?? '').trim().toLowerCase();
              const coordenadoriaVal = (row.coordenadoria ?? '').trim().toLowerCase();
              const chave = `${data}|${colaborador}|${repo}|${quantidade}|${tipoVal}|${funcaoVal}|${coordenadoriaVal}`;
              if (vistos.has(chave)) {
                duplicadasPlanilha.push(i + 1);
                const primeiraLinha = vistos.get(chave)!;
                if (!duplicadasPlanilha.includes(primeiraLinha)) {
                  duplicadasPlanilha.push(primeiraLinha);
                }
              } else {
                vistos.set(chave, i + 1);
              }
            }

            // Producao: duplicata contra o banco (inclui etapa derivada da funcao)
            const repoIds = [
              ...new Set(
                registros
                  .map((r) => {
                    const raw = ((r as Record<string, string>).repositorio ?? '').trim();
                    return raw ? normalizeIdRepositorioGed(raw) : '';
                  })
                  .filter(Boolean)
              ),
            ];

            if (repoIds.length > 0) {
              const existentes = await server.database.query<{
                id_repositorio_ged: string;
                quantidade: number;
                data_producao: string;
                tipo_marcador: string;
                funcao_marcador: string;
                coordenadoria_marcador: string;
                colaborador_marcador: string;
                etapa: string;
              }>(
                `SELECT r.id_repositorio_ged,
                      p.quantidade,
                      p.data_producao::text,
                      COALESCE(p.marcadores->>'tipo', '') as tipo_marcador,
                      COALESCE(p.marcadores->>'funcao', '') as funcao_marcador,
                      COALESCE(p.marcadores->>'coordenadoria', '') as coordenadoria_marcador,
                      COALESCE(p.marcadores->>'colaborador_nome', u.nome) as colaborador_marcador,
                      p.etapa::text as etapa
               FROM producao_repositorio p
               JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
               JOIN usuarios u ON u.id = p.usuario_id
               WHERE r.id_repositorio_ged = ANY($1)
                 AND COALESCE(p.marcadores->>'origem', '') = 'LEGADO'`,
                [repoIds]
              );

              const existentesSet = new Set(
                existentes.rows.map((e) => {
                  const dataStr = e.data_producao.substring(0, 10);
                  return `${e.id_repositorio_ged.toLowerCase()}|${e.colaborador_marcador.toLowerCase()}|${e.quantidade}|${dataStr}|${e.tipo_marcador.toLowerCase()}|${e.funcao_marcador.toLowerCase()}|${e.coordenadoria_marcador.toLowerCase()}|${e.etapa}`;
                })
              );

              // Reuse funcaoToEtapa mapping for validation
              const validEtapas: EtapaFluxo[] = [
                'RECEBIMENTO',
                'PREPARACAO',
                'DIGITALIZACAO',
                'CONFERENCIA',
                'MONTAGEM',
                'CONTROLE_QUALIDADE',
                'ENTREGA',
              ];
              const funcaoToEtapaVal = (funcao: string): EtapaFluxo => {
                const f = funcao
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .toLowerCase()
                  .trim();
                if (f.includes('receb')) return 'RECEBIMENTO';
                if (f.includes('prepar')) return 'PREPARACAO';
                if (f.includes('digital')) return 'DIGITALIZACAO';
                if (f.includes('confer')) return 'CONFERENCIA';
                if (f.includes('montag')) return 'MONTAGEM';
                if (f.includes('qualidade') || f.includes('cq')) return 'CONTROLE_QUALIDADE';
                if (f.includes('entreg')) return 'ENTREGA';
                const fallback = (body.etapa ?? 'RECEBIMENTO').toUpperCase() as EtapaFluxo;
                return validEtapas.includes(fallback) ? fallback : 'RECEBIMENTO';
              };

              for (let i = 0; i < registros.length; i++) {
                const row = registros[i] as Record<string, string | undefined>;
                const parsedRow = parseImportRowStrict(row);
                if (!parsedRow.ok) {
                  continue;
                }
                const {
                  repoIdentificadorRaw,
                  colaboradorNome,
                  quantidade,
                  dataProducaoStr,
                  anoRef,
                  tipoMarcador,
                  funcaoMarcador,
                  coordenadoriaMarcador,
                } = parsedRow.value;
                const repo = normalizeIdRepositorioGed(repoIdentificadorRaw, anoRef);
                const colaborador = colaboradorNome.toLowerCase();
                const tipoVal = tipoMarcador.toLowerCase();
                const funcaoVal = funcaoMarcador.toLowerCase();
                const coordenadoriaVal = coordenadoriaMarcador.toLowerCase();
                const etapaVal = funcaoToEtapaVal(funcaoMarcador);

                const chave = `${repo.toLowerCase()}|${colaborador}|${quantidade}|${dataProducaoStr}|${tipoVal}|${funcaoVal}|${coordenadoriaVal}|${etapaVal}`;
                if (existentesSet.has(chave)) {
                  duplicadasBanco.push(i + 1);
                }
              }
            }
          }

          const duplicadasPlanilhaSorted = [...new Set(duplicadasPlanilha)].sort((a, b) => a - b);
          const duplicadasBancoSorted = [...new Set(duplicadasBanco)].sort((a, b) => a - b);
          const todasDuplicadas = [
            ...new Set([...duplicadasPlanilhaSorted, ...duplicadasBancoSorted]),
          ].sort((a, b) => a - b);

          return reply.send({
            totalRegistros: registros.length,
            duplicadasPlanilha: duplicadasPlanilhaSorted,
            duplicadasBanco: duplicadasBancoSorted,
            todasDuplicadas,
            registrosValidos: registros.length - todasDuplicadas.length,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao validar duplicidades';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // POST /operacional/importacoes-legado/recebimento
    server.post(
      '/operacional/importacoes-legado/recebimento',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Importar recebimento legado',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('operador', 'administrador'),
          validateBody(importacaoLegadoRecebimentoSchema),
        ],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const body = request.body as {
            usuarioId?: string;
            registros?: Array<{
              idRepositorioGed?: string;
              orgao?: string;
              projeto?: string;
              processo?: string;
              interessado?: string;
              numeroCaixas?: number;
              volume?: string;
              caixaNova?: boolean;
            }>;
          };

          const registros = body.registros ?? [];
          if (registros.length === 0) {
            return reply.status(400).send({ error: 'Informe ao menos um registro para importar' });
          }

          const usuarioDestinoId = body.usuarioId?.trim() || user.id;
          if (usuarioDestinoId !== user.id && user.perfil !== 'administrador') {
            return reply
              .status(403)
              .send({ error: 'Apenas administradores podem importar para outro usuario' });
          }

          const usuarioDestinoResult = await server.database.query<{ id: string }>(
            `SELECT id FROM usuarios WHERE id = $1 AND ativo = TRUE`,
            [usuarioDestinoId]
          );
          if (usuarioDestinoResult.rows.length === 0) {
            return reply.status(404).send({ error: 'Usuario destino nao encontrado ou inativo' });
          }

          const erros: Array<{ linha: number; idRepositorioGed: string; erro: string }> = [];
          let sucesso = 0;

          for (let idx = 0; idx < registros.length; idx++) {
            const row = registros[idx];
            const linha = idx + 1;
            if (!row) {
              erros.push({ linha, idRepositorioGed: '', erro: 'Registro legado invalido' });
              continue;
            }
            const idRepositorioGedRaw = row.idRepositorioGed?.trim() ?? '';
            const processo = row.processo?.trim() ?? '';
            const interessado = row.interessado?.trim() ?? '';

            if (!idRepositorioGedRaw || !processo || !interessado) {
              erros.push({
                linha,
                idRepositorioGed: idRepositorioGedRaw,
                erro: 'Campos obrigatorios por linha: idRepositorioGed, processo, interessado',
              });
              continue;
            }

            const idRepositorioGed = normalizeIdRepositorioGed(idRepositorioGedRaw);

            try {
              const repoResult = await server.database.query<{ id_repositorio_recorda: string }>(
                `SELECT id_repositorio_recorda FROM repositorios WHERE id_repositorio_ged = $1`,
                [idRepositorioGed]
              );

              let repositorioId = repoResult.rows[0]?.id_repositorio_recorda ?? '';
              if (!repositorioId) {
                const createdRepo = await server.database.query<{ id_repositorio_recorda: string }>(
                  `INSERT INTO repositorios (
                   id_repositorio_ged, orgao, projeto, status_atual, etapa_atual
                 ) VALUES ($1, $2, $3, 'RECEBIDO', 'RECEBIMENTO')
                 RETURNING id_repositorio_recorda`,
                  [
                    idRepositorioGed,
                    row.orgao?.trim() ?? 'NAO INFORMADO',
                    row.projeto?.trim() ?? 'LEGADO',
                  ]
                );
                repositorioId = createdRepo.rows[0]?.id_repositorio_recorda ?? '';
              }

              // Verificar se ja existe recebimento identico (mesmo repositorio, processo, interessado)
              const existenteRec = await server.database.query<{ id: string }>(
                `SELECT id FROM recebimento_documentos
               WHERE repositorio_id = $1 AND processo = $2 AND interessado = $3
               LIMIT 1`,
                [repositorioId, processo, interessado]
              );

              const numCaixas = Math.max(Number(row.numeroCaixas ?? 1), 1);
              const volume = (row.volume ?? '1').trim();
              const caixaNova = Boolean(row.caixaNova);

              if (existenteRec.rows.length > 0) {
                await server.database.query(
                  `UPDATE recebimento_documentos
                 SET numero_caixas = $1, volume = $2, caixa_nova = $3
                 WHERE id = $4`,
                  [numCaixas, volume, caixaNova, existenteRec.rows[0]!.id]
                );
              } else {
                await server.database.query(
                  `INSERT INTO recebimento_documentos (
                   repositorio_id, processo, interessado, numero_caixas, volume, caixa_nova,
                   origem, texto_extraido, criado_por
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, 'LEGADO', '', $7)`,
                  [
                    repositorioId,
                    processo,
                    interessado,
                    numCaixas,
                    volume,
                    caixaNova,
                    usuarioDestinoId,
                  ]
                );
              }
              sucesso++;
            } catch (error) {
              erros.push({
                linha,
                idRepositorioGed,
                erro: error instanceof Error ? error.message : 'Erro ao importar linha',
              });
            }
          }

          const erroCount = erros.length;
          const importacaoResult = await server.database.query<{ id: string; criado_em: string }>(
            `INSERT INTO importacoes_legado_operacional (
             tipo, total_registros, registros_sucesso, registros_erro, detalhes_erros, usuario_destino_id, executado_por
           )
           VALUES ('RECEBIMENTO', $1, $2, $3, $4::jsonb, $5, $6)
           RETURNING id, criado_em`,
            [registros.length, sucesso, erroCount, JSON.stringify(erros), usuarioDestinoId, user.id]
          );

          return reply.status(201).send({
            importacaoId: importacaoResult.rows[0]?.id,
            criadoEm: importacaoResult.rows[0]?.criado_em,
            totalRegistros: registros.length,
            registrosSucesso: sucesso,
            registrosErro: erroCount,
            erros,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao importar legado de recebimento';
          return reply.status(400).send({ error: message });
        }
      }
    );

    // POST /operacional/importacoes-legado/producao - Importar producao legada de colaboradores
    server.post(
      '/operacional/importacoes-legado/producao',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Importar producao legada de colaboradores',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('operador', 'administrador'),
          validateBody(importacaoLegadoProducaoSchema),
        ],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const body = request.body as {
            usuarioId?: string;
            etapa?: string;
            registros?: Array<{
              data?: string;
              colaborador?: string;
              funcao?: string;
              repositorio?: string;
              coordenadoria?: string;
              quantidade?: number;
              tipo?: string;
            }>;
          };

          const registros = body.registros ?? [];
          if (registros.length === 0) {
            return reply.status(400).send({ error: 'Informe ao menos um registro para importar' });
          }

          const usuarioDestinoId = body.usuarioId?.trim() || user.id;
          if (usuarioDestinoId !== user.id && user.perfil !== 'administrador') {
            return reply
              .status(403)
              .send({ error: 'Apenas administradores podem importar para outro usuario' });
          }

          // Buscar mapeamento de colaboradores por nome
          const usuariosResult = await server.database.query<{ id: string; nome: string }>(
            `SELECT id, nome FROM usuarios WHERE ativo = TRUE`
          );
          const usuariosPorNome = new Map<string, string>();
          for (const u of usuariosResult.rows) {
            usuariosPorNome.set(u.nome.toLowerCase().trim(), u.id);
          }

          const erros: Array<{ linha: number; erro: string }> = [];
          let sucesso = 0;
          let inseridos = 0;
          let atualizados = 0;
          let ignorados = 0;
          let duplicados = 0;
          const importacaoExecId = randomUUID();
          const insertedProducaoIds: string[] = [];
          const updatedSnapshots: Array<{
            id: string;
            quantidade: number;
            checklist_id: string | null;
            etapa: string;
            marcadores: Record<string, unknown>;
          }> = [];

          await server.database.query('BEGIN');
          try {
            for (let idx = 0; idx < registros.length; idx++) {
              const row = registros[idx];
              const linha = idx + 1;
              const parsedRow = parseImportRowStrict(row);
              if (!parsedRow.ok) {
                erros.push({ linha, erro: parsedRow.error });
                continue;
              }

              const {
                repoIdentificadorRaw,
                colaboradorNome,
                quantidade,
                dataProducaoStr,
                dataOriginalRaw,
                anoRef,
                tipoMarcador,
                funcaoMarcador,
                coordenadoriaMarcador,
              } = parsedRow.value;
              const etapaImport = funcaoToEtapa(funcaoMarcador, body.etapa);
              const statusImport = etapaStatusMap[etapaImport] ?? 'RECEBIDO';

              // Resolver usuario pelo nome do colaborador
              let colaboradorId = usuariosPorNome.get(colaboradorNome.toLowerCase());
              if (!colaboradorId) {
                // Fallback: busca parcial
                for (const [nome, id] of usuariosPorNome.entries()) {
                  if (
                    nome.includes(colaboradorNome.toLowerCase()) ||
                    colaboradorNome.toLowerCase().includes(nome)
                  ) {
                    colaboradorId = id;
                    break;
                  }
                }
              }
              if (!colaboradorId) {
                colaboradorId = usuarioDestinoId;
              }
              const repoIdentificador = normalizeIdRepositorioGed(repoIdentificadorRaw, anoRef);
              const orgaoRepositorio = coordenadoriaMarcador || 'NAO INFORMADO';

              try {
                // Buscar repositorio existente pelo ID normalizado
                const repoResult = await server.database.query<{ id_repositorio_recorda: string }>(
                  `SELECT id_repositorio_recorda FROM repositorios
                 WHERE id_repositorio_ged = $1
                   AND orgao = $2
                   AND projeto = $3`,
                  [repoIdentificador, orgaoRepositorio, PROJETO_IMPORTACAO_PRODUCAO]
                );

                let repositorioId = repoResult.rows[0]?.id_repositorio_recorda ?? '';
                if (!repositorioId) {
                  // Criar repositorio legado automaticamente
                  const createdRepo = await server.database.query<{
                    id_repositorio_recorda: string;
                  }>(
                    `INSERT INTO repositorios (
                     id_repositorio_ged, orgao, projeto, status_atual, etapa_atual
                   ) VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (id_repositorio_ged, orgao, projeto) DO UPDATE SET id_repositorio_ged = EXCLUDED.id_repositorio_ged
                   RETURNING id_repositorio_recorda`,
                    [
                      repoIdentificador,
                      orgaoRepositorio,
                      PROJETO_IMPORTACAO_PRODUCAO,
                      statusImport,
                      etapaImport,
                    ]
                  );
                  repositorioId = createdRepo.rows[0]?.id_repositorio_recorda ?? '';
                }

                // Buscar ou criar checklist CONCLUIDO para satisfazer o trigger de validacao
                const existingChecklist = await server.database.query<{ id: string }>(
                  `SELECT id FROM checklists
                 WHERE repositorio_id = $1 AND etapa = $2 AND status = 'CONCLUIDO'
                 LIMIT 1`,
                  [repositorioId, etapaImport]
                );
                let checklistId = existingChecklist.rows[0]?.id ?? '';
                if (!checklistId) {
                  const checklistResult = await server.database.query<{ id: string }>(
                    `INSERT INTO checklists (repositorio_id, etapa, status, observacao, responsavel_id, ativo, data_conclusao)
                   VALUES ($1, $2, 'CONCLUIDO', 'Importacao legada', $3, FALSE, CURRENT_TIMESTAMP)
                   RETURNING id`,
                    [repositorioId, etapaImport, colaboradorId]
                  );
                  checklistId = checklistResult.rows[0]?.id ?? '';
                }

                const marcadores = JSON.stringify({
                  origem: 'LEGADO',
                  importacao_exec_id: importacaoExecId,
                  funcao: funcaoMarcador,
                  tipo: tipoMarcador,
                  coordenadoria: coordenadoriaMarcador,
                  colaborador_nome: colaboradorNome,
                  data_original: dataOriginalRaw,
                });

                // Verificar se ja existe registro identico (mesmo colaborador, repositorio, data, tipo, etapa, quantidade, funcao, coordenadoria)
                const colaboradorNomeMarcador = (colaboradorNome ?? '').trim();

                const existente = await server.database.query<{
                  id: string;
                  quantidade: number;
                  checklist_id: string | null;
                  etapa: string;
                  marcadores: Record<string, unknown>;
                }>(
                 `SELECT id, quantidade, checklist_id, etapa::text as etapa, marcadores
                 FROM producao_repositorio
                 WHERE usuario_id = $1
                   AND repositorio_id = $2
                   AND (data_producao AT TIME ZONE '${SYSTEM_TIMEZONE}')::date = $3::date
                   AND etapa = $4
                   AND COALESCE(marcadores->>'origem', '') = 'LEGADO'
                   AND COALESCE(marcadores->>'tipo', '') = $5
                   AND COALESCE(marcadores->>'funcao', '') = $6
                   AND COALESCE(marcadores->>'coordenadoria', '') = $7
                   AND COALESCE(marcadores->>'colaborador_nome', '') = $8
                 LIMIT 1`,
                  [
                    colaboradorId,
                    repositorioId,
                    dataProducaoStr,
                    etapaImport,
                    tipoMarcador,
                    funcaoMarcador,
                    coordenadoriaMarcador,
                    colaboradorNomeMarcador,
                  ]
                );

                if (existente.rows.length > 0) {
                  if (Number(existente.rows[0]!.quantidade) === quantidade) {
                    duplicados++;
                    ignorados++;
                    continue;
                  }
                  updatedSnapshots.push({
                    id: existente.rows[0]!.id,
                    quantidade: Number(existente.rows[0]!.quantidade),
                    checklist_id: existente.rows[0]!.checklist_id,
                    etapa: existente.rows[0]!.etapa,
                    marcadores: existente.rows[0]!.marcadores ?? {},
                  });
                  // Atualizar registro existente (substituir), incluindo etapa
                  await server.database.query(
                    `UPDATE producao_repositorio
                   SET quantidade = $1, marcadores = $2::jsonb, checklist_id = $3, etapa = $5
                  WHERE id = $4`,
                    [quantidade, marcadores, checklistId, existente.rows[0]!.id, etapaImport]
                  );
                  atualizados++;
                } else {
                  const inserted = await server.database.query<{ id: string }>(
                    `INSERT INTO producao_repositorio (
                     repositorio_id, etapa, checklist_id, usuario_id, quantidade, marcadores, data_producao
                   ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
                   RETURNING id`,
                    [
                      repositorioId,
                      etapaImport,
                      checklistId,
                      colaboradorId,
                      quantidade,
                      marcadores,
                      dataProducaoStr,
                    ]
                  );
                  const insertedId = inserted.rows[0]?.id;
                  if (insertedId) insertedProducaoIds.push(insertedId);
                  inseridos++;
                }

                sucesso++;
              } catch (error) {
                erros.push({
                  linha,
                  erro: error instanceof Error ? error.message : 'Erro ao importar linha',
                });
              }
            }

            // Fechar todos os checklists legados abertos criados nesta importacao
            await server.database.query(
              `UPDATE checklists SET status = 'CONCLUIDO', ativo = FALSE, data_conclusao = CURRENT_TIMESTAMP
             WHERE observacao = 'Importacao legada' AND status = 'ABERTO' AND ativo = TRUE`
            );

            await server.database.query('COMMIT');
          } catch (innerError) {
            await server.database.query('ROLLBACK');
            throw innerError;
          }

          const erroCount = erros.length;
          const detalhesImportacao = {
            importacao_exec_id: importacaoExecId,
            rollback: {
              insertedProducaoIds,
              updatedSnapshots,
              fonteId: null as string | null,
              importacaoFonteHashes: [] as string[],
            },
            contadores: {
              total: registros.length,
              sucesso,
              inseridos,
              atualizados,
              ignorados,
              duplicados,
              erros: erroCount,
            },
            erros_amostra: erros.slice(0, 200),
          };
          const importacaoResult = await server.database.query<{ id: string; criado_em: string }>(
            `INSERT INTO importacoes_legado_operacional (
             tipo, total_registros, registros_sucesso, registros_erro, detalhes_erros, usuario_destino_id, executado_por
           )
           VALUES ('PRODUCAO', $1, $2, $3, $4::jsonb, $5, $6)
           RETURNING id, criado_em`,
            [
              registros.length,
              sucesso,
              erroCount,
              JSON.stringify(detalhesImportacao),
              usuarioDestinoId,
              user.id,
            ]
          );

          return reply.status(201).send({
            importacaoId: importacaoResult.rows[0]?.id,
            criadoEm: importacaoResult.rows[0]?.criado_em,
            totalRegistros: registros.length,
            registrosSucesso: sucesso,
            registrosErro: erroCount,
            inseridos,
            atualizados,
            ignorados,
            duplicados,
            erros,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao importar producao legada';
          const stack = error instanceof Error ? error.stack : '';
          request.log.error({ err: error, msg: `Importacao producao falhou: ${message}` });
          return reply.status(400).send({
            error: message,
            stack: process.env.NODE_ENV !== 'production' ? stack : undefined,
          });
        }
      }
    );

    // GET /operacional/importacoes-legado
    server.get(
      '/operacional/importacoes-legado',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Listar importacoes legadas',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const query = request.query as {
            usuarioDestinoId?: string;
            limite?: string | number;
            pagina?: string | number;
          };

          const limite = Math.min(Math.max(Number(query.limite ?? 20), 1), 100);
          const pagina = Math.max(Number(query.pagina ?? 1), 1);
          const offset = (pagina - 1) * limite;
          const params: Array<string | number> = [];
          let where = 'WHERE 1=1';
          let p = 1;

          if (query.usuarioDestinoId?.trim()) {
            if (user.perfil !== 'administrador' && query.usuarioDestinoId !== user.id) {
              return reply
                .status(403)
                .send({ error: 'Apenas administradores podem consultar outro usuario' });
            }
            where += ` AND i.usuario_destino_id = $${p++}`;
            params.push(query.usuarioDestinoId.trim());
          } else if (user.perfil !== 'administrador') {
            where += ` AND i.usuario_destino_id = $${p++}`;
            params.push(user.id);
          }

          const totalResult = await server.database.query<{ total: string }>(
            `SELECT COUNT(*)::text as total
           FROM importacoes_legado_operacional i
           ${where}`,
            params
          );
          const total = parseInt(totalResult.rows[0]?.total ?? '0', 10);

          params.push(limite, offset);
          const result = await server.database.query(
            `SELECT i.id, i.tipo, i.total_registros, i.registros_sucesso, i.registros_erro, i.detalhes_erros, i.criado_em,
                  i.usuario_destino_id, u.nome as usuario_destino_nome,
                  i.executado_por, e.nome as executado_por_nome
           FROM importacoes_legado_operacional i
           JOIN usuarios u ON u.id = i.usuario_destino_id
           JOIN usuarios e ON e.id = i.executado_por
           ${where}
           ORDER BY i.criado_em DESC
           LIMIT $${p++} OFFSET $${p}`,
            params
          );

          return reply.send({
            itens: result.rows,
            total,
            pagina,
            totalPaginas: Math.ceil(total / limite),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao listar importacoes legadas';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // GET /operacional/importacoes-legado/:id/erros-csv - Exporta erros da importacao em CSV
    server.get<{ Params: { id: string } }>(
      '/operacional/importacoes-legado/:id/erros-csv',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Exportar CSV de erros de uma importacao',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const { id } = request.params;
          const result = await server.database.query<{
            id: string;
            usuario_destino_id: string;
            detalhes_erros: unknown;
          }>(
            `SELECT id, usuario_destino_id, detalhes_erros
           FROM importacoes_legado_operacional
           WHERE id = $1`,
            [id]
          );
          const item = result.rows[0];
          if (!item) return reply.status(404).send({ error: 'Importacao nao encontrada' });
          if (user.perfil !== 'administrador' && item.usuario_destino_id !== user.id) {
            return reply.status(403).send({ error: 'Sem permissao para acessar esta importacao' });
          }

          const detalhes = item.detalhes_erros as
            | Record<string, unknown>
            | Array<Record<string, unknown>>
            | null;
          const errosAmostra = Array.isArray(detalhes)
            ? detalhes
            : Array.isArray((detalhes as Record<string, unknown> | null)?.erros_amostra)
              ? ((detalhes as Record<string, unknown>).erros_amostra as Array<
                  Record<string, unknown>
                >)
              : [];

          const escapeCsv = (value: unknown): string => {
            const raw = String(value ?? '');
            if (
              raw.includes('"') ||
              raw.includes(',') ||
              raw.includes('\n') ||
              raw.includes('\r')
            ) {
              return `"${raw.replace(/"/g, '""')}"`;
            }
            return raw;
          };

          const header = [
            'linha',
            'erro',
            'repositorio',
            'colaborador',
            'funcao',
            'tipo',
            'data',
            'quantidade',
          ];
          const lines = [header.join(',')];
          for (const erroItem of errosAmostra) {
            const dados = (erroItem.dados as Record<string, unknown> | undefined) ?? {};
            lines.push(
              [
                escapeCsv(erroItem.linha),
                escapeCsv(erroItem.erro),
                escapeCsv(dados.repositorio),
                escapeCsv(dados.colaborador),
                escapeCsv(dados.funcao),
                escapeCsv(dados.tipo),
                escapeCsv(dados.data),
                escapeCsv(dados.quantidade),
              ].join(',')
            );
          }

          const csv = lines.join('\n');
          return reply
            .header('Content-Type', 'text/csv; charset=utf-8')
            .header('Content-Disposition', `attachment; filename="importacao-erros-${id}.csv"`)
            .send(csv);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao exportar erros em CSV';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // POST /operacional/importacoes-legado/:id/rollback - Desfazer importacao de producao
    server.post<{ Params: { id: string } }>(
      '/operacional/importacoes-legado/:id/rollback',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Desfazer uma importacao de producao',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const { id } = request.params;
          const result = await server.database.query<{
            id: string;
            tipo: string;
            detalhes_erros: Record<string, unknown> | null;
          }>(
            `SELECT id, tipo, detalhes_erros
           FROM importacoes_legado_operacional
           WHERE id = $1`,
            [id]
          );
          const item = result.rows[0];
          if (!item) return reply.status(404).send({ error: 'Importacao nao encontrada' });
          if (item.tipo !== 'PRODUCAO') {
            return reply
              .status(400)
              .send({ error: 'Rollback suportado apenas para importacoes de producao' });
          }

          const detalhes = item.detalhes_erros ?? {};
          const rollback = (detalhes.rollback as Record<string, unknown> | undefined) ?? {};
          const insertedProducaoIds = Array.isArray(rollback.insertedProducaoIds)
            ? rollback.insertedProducaoIds.filter((v): v is string => typeof v === 'string')
            : [];
          const updatedSnapshots = Array.isArray(rollback.updatedSnapshots)
            ? (rollback.updatedSnapshots as Array<{
                id: string;
                quantidade: number;
                checklist_id: string | null;
                etapa: string;
                marcadores: Record<string, unknown>;
              }>)
            : [];
          const fonteId = typeof rollback.fonteId === 'string' ? rollback.fonteId : null;
          const importacaoFonteHashes = Array.isArray(rollback.importacaoFonteHashes)
            ? rollback.importacaoFonteHashes.filter((v): v is string => typeof v === 'string')
            : [];
          const rollbackExecutado = Boolean(
            (detalhes as Record<string, unknown>).rollback_executado
          );
          if (rollbackExecutado) {
            return reply.status(400).send({ error: 'Rollback desta importacao ja foi executado' });
          }

          await server.database.query('BEGIN');
          try {
            let removidos = 0;
            if (insertedProducaoIds.length > 0) {
              const del = await server.database.query(
                `DELETE FROM producao_repositorio WHERE id = ANY($1::uuid[])`,
                [insertedProducaoIds]
              );
              removidos = del.rowCount ?? 0;
            }

            let restaurados = 0;
            for (const snapshot of updatedSnapshots) {
              await server.database.query(
                `UPDATE producao_repositorio
               SET quantidade = $1,
                   checklist_id = $2,
                   etapa = $3,
                   marcadores = $4::jsonb
               WHERE id = $5`,
                [
                  Number(snapshot.quantidade ?? 0),
                  snapshot.checklist_id ?? null,
                  snapshot.etapa,
                  JSON.stringify(snapshot.marcadores ?? {}),
                  snapshot.id,
                ]
              );
              restaurados++;
            }

            let hashesRemovidos = 0;
            if (fonteId && importacaoFonteHashes.length > 0) {
              const delHashes = await server.database.query(
                `DELETE FROM importacao_fontes_linhas
               WHERE fonte_id = $1
                 AND chave_hash = ANY($2::text[])`,
                [fonteId, importacaoFonteHashes]
              );
              hashesRemovidos = delHashes.rowCount ?? 0;
            }

            const detalhesAtualizados = {
              ...(detalhes ?? {}),
              rollback_executado: true,
              rollback_em: new Date().toISOString(),
              rollback_por: user.id,
              rollback_resumo: { removidos, restaurados, hashesRemovidos },
            };
            await server.database.query(
              `UPDATE importacoes_legado_operacional
             SET detalhes_erros = $2::jsonb
             WHERE id = $1`,
              [id, JSON.stringify(detalhesAtualizados)]
            );

            await server.database.query('COMMIT');
            return reply.send({
              message: 'Rollback executado com sucesso',
              removidos,
              restaurados,
              hashesRemovidos,
            });
          } catch (innerError) {
            await server.database.query('ROLLBACK');
            throw innerError;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao executar rollback';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // DELETE /operacional/importacoes-legado/limpar - Limpar todos os dados legados
    server.delete(
      '/operacional/importacoes-legado/limpar',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Limpar todos os dados legados importados',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          await server.database.query('BEGIN');
          const prodResult = await server.database.query('DELETE FROM producao_repositorio');
          const checkResult = await server.database.query(
            "DELETE FROM checklists WHERE observacao = 'Importacao legada'"
          );
          const recebResult = await server.database.query('DELETE FROM recebimento_documentos');
          const repoResult = await server.database.query(
            "DELETE FROM repositorios WHERE projeto IN ('LEGADO', $1)",
            [PROJETO_IMPORTACAO_PRODUCAO]
          );
          const importResult = await server.database.query(
            'DELETE FROM importacoes_legado_operacional'
          );
          const fontesLinhasResult = await server.database.query(
            'DELETE FROM importacao_fontes_linhas'
          );
          await server.database.query('COMMIT');

          request.log.info('Limpeza legada completa');
          return reply.send({
            mensagem: 'Todos os dados legados foram removidos com sucesso.',
            removidos: {
              producao: prodResult.rowCount ?? 0,
              checklists: checkResult.rowCount ?? 0,
              recebimentos: recebResult.rowCount ?? 0,
              repositorios: repoResult.rowCount ?? 0,
              importacoes: importResult.rowCount ?? 0,
              fontes_linhas: fontesLinhasResult.rowCount ?? 0,
            },
          });
        } catch (error) {
          await server.database.query('ROLLBACK');
          const message = error instanceof Error ? error.message : 'Erro ao limpar dados legados';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // POST /operacional/importacoes-legado/fetch-sheets - Fetch CSV from a published Google Sheets URL
    server.post(
      '/operacional/importacoes-legado/fetch-sheets',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Fetch CSV data from a published Google Sheets URL',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const { url } = request.body as { url?: string };
          if (!url || typeof url !== 'string' || !url.trim()) {
            return reply.status(400).send({ error: 'URL e obrigatoria' });
          }
          const urlValidation = ensureGoogleSheetsUrlHasExplicitGid(url);
          if (!urlValidation.ok) {
            return reply.status(400).send({ error: urlValidation.error });
          }

          try {
            const fetched = await fetchCsvFromSourceUrl(url);
            if (fetched.csvContent.length === 0) {
              return reply.status(400).send({ error: 'A planilha retornou conteudo vazio.' });
            }
            if (fetched.contentType.includes('text/html') && fetched.csvContent.includes('<html')) {
              return reply.status(400).send({
                error:
                  'A planilha nao esta publicada. Publique via Arquivo > Compartilhar > Publicar na Web > CSV.',
              });
            }
            return reply.send({ csv: fetched.csvContent, url: fetched.csvUrl });
          } catch (fetchError) {
            return sendSpreadsheetFetchError(reply, fetchError);
          }
        } catch (error) {
          return sendSpreadsheetFetchError(reply, error, 'Erro ao buscar dados da planilha');
        }
      }
    );

    // -- Fontes de Importacao (saved links) --

    // GET /operacional/fontes-importacao - List saved import sources
    server.get(
      '/operacional/fontes-importacao',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Listar fontes de importacao salvas',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (_request, reply) => {
        try {
          const result = await server.database.query<{
            id: string;
            nome: string;
            url: string;
            tipo: string;
            criado_em: string;
            ultima_importacao_em: string | null;
          }>(
            `SELECT id, nome, url, tipo, criado_em, ultima_importacao_em
           FROM fontes_importacao ORDER BY nome`
          );
          return reply.send({ fontes: result.rows });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao listar fontes de importacao';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // POST /operacional/fontes-importacao - Create a saved import source
    server.post(
      '/operacional/fontes-importacao',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Criar fonte de importacao',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const { nome, url } = request.body as { nome?: string; url?: string };
          if (!nome?.trim() || !url?.trim()) {
            return reply.status(400).send({ error: 'Nome e URL sao obrigatorios' });
          }
          const urlValidation = ensureGoogleSheetsUrlHasExplicitGid(url);
          if (!urlValidation.ok) {
            return reply.status(400).send({ error: urlValidation.error });
          }
          const result = await server.database.query<{ id: string }>(
            `INSERT INTO fontes_importacao (nome, url, tipo, criado_por) VALUES ($1, $2, 'sheets', $3) RETURNING id`,
            [nome.trim(), urlValidation.value, user.id]
          );
          return reply.status(201).send({ id: result.rows[0]!.id });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao criar fonte de importacao';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // DELETE /operacional/fontes-importacao/:id - Delete a saved import source
    server.delete<{ Params: { id: string } }>(
      '/operacional/fontes-importacao/:id',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Excluir fonte de importacao',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const { id } = request.params;
          await server.database.query('DELETE FROM fontes_importacao WHERE id = $1', [id]);
          return reply.send({ ok: true });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao excluir fonte de importacao';
          return sendDatabaseError(reply, error, message);
        }
      }
    );
    // POST /operacional/fontes-importacao/:id/validar-duplicatas - Validate duplicates before importing
    server.post<{ Params: { id: string } }>(
      '/operacional/fontes-importacao/:id/validar-duplicatas',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Validar duplicatas antes de importar',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const { id } = request.params;

          const fonteResult = await server.database.query<{
            id: string;
            nome: string;
            url: string;
          }>(`SELECT id, nome, url FROM fontes_importacao WHERE id = $1`, [id]);
          if (fonteResult.rows.length === 0) {
            return reply.status(404).send({ error: 'Fonte de importacao nao encontrada' });
          }
          const fonte = fonteResult.rows[0]!;

          let fetched: CsvFetchResult;
          try {
            fetched = await fetchCsvFromSourceUrl(fonte.url, 15_000, false);
          } catch (error) {
            return sendSpreadsheetFetchError(reply, error);
          }
          if (!fetched.csvContent.trim()) {
            return reply.status(400).send({ error: 'A planilha retornou conteudo vazio.' });
          }

          const registros = parseImportRowsFromCsv(fetched.csvContent);

          if (registros.length === 0) {
            return reply
              .status(400)
              .send({ error: 'Nenhum registro valido encontrado na planilha.' });
          }

          const usuariosResult = await server.database.query<{ id: string; nome: string }>(
            `SELECT id, nome FROM usuarios WHERE ativo = TRUE`
          );
          const usuariosPorNome = new Map<string, string>();
          for (const u of usuariosResult.rows) {
            usuariosPorNome.set(u.nome.toLowerCase().trim(), u.id);
          }

          const funcaoToEtapa = (funcao: string): string => {
            const f = funcao
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .trim();
            if (f.includes('receb')) return 'RECEBIMENTO';
            if (f.includes('prepar')) return 'PREPARACAO';
            if (f.includes('digital')) return 'DIGITALIZACAO';
            if (f.includes('confer')) return 'CONFERENCIA';
            if (f.includes('montag')) return 'MONTAGEM';
            if (f.includes('qualidade') || f.includes('cq')) return 'CONTROLE_QUALIDADE';
            if (f.includes('entreg')) return 'ENTREGA';
            return 'RECEBIMENTO';
          };

          const novos: Array<{ linha: number; dados: ParsedImportRow; motivo: string }> = [];
          const duplicados: Array<{ linha: number; dados: ParsedImportRow; motivo: string }> = [];

          for (let idx = 0; idx < registros.length; idx++) {
            const row = registros[idx]!;
            const linha = idx + 1;
            const parsedRow = parseImportRowStrict(row);
            if (!parsedRow.ok) {
              novos.push({ linha, dados: row, motivo: parsedRow.error });
              continue;
            }

            const {
              anoRef,
              repoIdentificadorRaw,
              colaboradorNome,
              quantidade,
              dataProducaoStr,
              tipoMarcador,
              funcaoMarcador,
              coordenadoriaMarcador,
            } = parsedRow.value;
            const repoId = normalizeIdRepositorioGed(repoIdentificadorRaw, anoRef);
            const orgaoRepositorio = coordenadoriaMarcador || 'NAO INFORMADO';
            if (!repoId) {
              novos.push({ linha, dados: row, motivo: 'Repositorio invalido' });
              continue;
            }

            const repoResult = await server.database.query<{ id_repositorio_recorda: string }>(
              `SELECT id_repositorio_recorda
             FROM repositorios
             WHERE id_repositorio_ged = $1
               AND orgao = $2
               AND projeto = $3`,
              [repoId, orgaoRepositorio, PROJETO_IMPORTACAO_PRODUCAO]
            );
            if (repoResult.rows.length === 0) {
              novos.push({ linha, dados: row, motivo: 'Repositorio nao encontrado' });
              continue;
            }
            const repositorioId = repoResult.rows[0]!.id_repositorio_recorda;
            let colaboradorId = usuariosPorNome.get(colaboradorNome.toLowerCase());
            if (!colaboradorId) {
              for (const [nome, uid] of usuariosPorNome.entries()) {
                if (
                  nome.includes(colaboradorNome.toLowerCase()) ||
                  colaboradorNome.toLowerCase().includes(nome)
                ) {
                  colaboradorId = uid;
                  break;
                }
              }
            }
            if (!colaboradorId) colaboradorId = user.id;
            const etapaImport = funcaoToEtapa(funcaoMarcador);

            const existente = await server.database.query<{ id: string }>(
              `SELECT id FROM producao_repositorio
             WHERE usuario_id = $1 AND repositorio_id = $2 AND (data_producao AT TIME ZONE '${SYSTEM_TIMEZONE}')::date = $3::date
               AND etapa = $4 AND quantidade = $5
               AND COALESCE(marcadores->>'tipo', '') = $6
               AND COALESCE(marcadores->>'funcao', '') = $7
               AND COALESCE(marcadores->>'coordenadoria', '') = $8
               AND COALESCE(marcadores->>'colaborador_nome', '') = $9
             LIMIT 1`,
              [
                colaboradorId,
                repositorioId,
                dataProducaoStr,
                etapaImport,
                quantidade,
                tipoMarcador,
                funcaoMarcador,
                coordenadoriaMarcador,
                colaboradorNome,
              ]
            );

            if (existente.rows.length > 0) {
              duplicados.push({ linha, dados: row, motivo: 'Registro ja existe no sistema' });
            } else {
              novos.push({ linha, dados: row, motivo: 'Novo registro' });
            }
          }

          return reply.send({
            fonte: { id: fonte.id, nome: fonte.nome },
            total: registros.length,
            novos: { quantidade: novos.length, itens: novos.slice(0, 10) },
            duplicados: { quantidade: duplicados.length, itens: duplicados.slice(0, 10) },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao validar duplicatas da fonte';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // POST /operacional/importacoes-legado/producao/preview - Dry-run com impacto
    server.post(
      '/operacional/importacoes-legado/producao/preview',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Preview de impacto da importacao de producao',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('operador', 'administrador'),
          validateBody(importacaoLegadoProducaoSchema),
        ],
      },
      async (request, reply) => {
        try {
          const body = request.body as {
            etapa?: string;
            registros?: Array<{
              data?: string;
              colaborador?: string;
              funcao?: string;
              repositorio?: string;
              coordenadoria?: string;
              quantidade?: number;
              tipo?: string;
            }>;
          };
          const registros = body.registros ?? [];
          if (registros.length === 0) {
            return reply.status(400).send({ error: 'Informe ao menos um registro para validar' });
          }

          const usuariosResult = await server.database.query<{ id: string; nome: string }>(
            `SELECT id, nome FROM usuarios WHERE ativo = TRUE`
          );
          const usuariosPorNome = new Map<string, string>();
          for (const u of usuariosResult.rows) {
            usuariosPorNome.set(u.nome.toLowerCase().trim(), u.id);
          }

          const linhasInvalidas: Array<{ linha: number; erro: string }> = [];
          const duplicadasPlanilha: number[] = [];
          const duplicadasBanco: number[] = [];
          const amostraDatas: Array<{
            linha: number;
            dataOriginal: string;
            dataNormalizada: string | null;
            status: 'valido' | 'invalido';
            erro?: string;
          }> = [];
          const vistos = new Map<string, number>();
          let inseridosPrevistos = 0;
          let atualizadosPrevistos = 0;
          let ignoradosPrevistos = 0;

          for (let idx = 0; idx < registros.length; idx++) {
            const row = registros[idx];
            const linha = idx + 1;
            const parsedRow = parseImportRowStrict(row);
            if (!parsedRow.ok) {
              linhasInvalidas.push({ linha, erro: parsedRow.error });
              if (amostraDatas.length < 20) {
                amostraDatas.push({
                  linha,
                  dataOriginal: String(row?.data ?? '').trim(),
                  dataNormalizada: null,
                  status: 'invalido',
                  erro: parsedRow.error,
                });
              }
              continue;
            }
            const {
              repoIdentificadorRaw: repoRaw,
              colaboradorNome,
              quantidade,
              dataProducaoStr: dataStr,
              dataOriginalRaw,
              anoRef,
              tipoMarcador,
              funcaoMarcador,
              coordenadoriaMarcador,
            } = parsedRow.value;
            if (amostraDatas.length < 20) {
              amostraDatas.push({
                linha,
                dataOriginal: dataOriginalRaw,
                dataNormalizada: dataStr,
                status: 'valido',
              });
            }
            const etapaImport = funcaoToEtapa(funcaoMarcador, body.etapa);

            const chavePlanilha = buildImportRowHash({
              data: dataStr,
              colaborador: colaboradorNome,
              repositorio: repoRaw,
              quantidade,
              tipo: tipoMarcador,
              funcao: funcaoMarcador,
              coordenadoria: coordenadoriaMarcador,
              etapa: etapaImport,
            });
            const firstLine = vistos.get(chavePlanilha);
            if (typeof firstLine === 'number') {
              duplicadasPlanilha.push(linha);
              if (!duplicadasPlanilha.includes(firstLine)) duplicadasPlanilha.push(firstLine);
              ignoradosPrevistos++;
              continue;
            }
            vistos.set(chavePlanilha, linha);

            // Resolver colaborador para checagem contra banco
            let colaboradorId = usuariosPorNome.get(colaboradorNome.toLowerCase());
            if (!colaboradorId) {
              for (const [nome, id] of usuariosPorNome.entries()) {
                if (
                  nome.includes(colaboradorNome.toLowerCase()) ||
                  colaboradorNome.toLowerCase().includes(nome)
                ) {
                  colaboradorId = id;
                  break;
                }
              }
            }
            if (!colaboradorId) {
              // Sem mapeamento, importação usará usuário destino; assume inserção.
              inseridosPrevistos++;
              continue;
            }

            const repoIdentificador = normalizeIdRepositorioGed(repoRaw, anoRef);
            const orgaoRepositorio = coordenadoriaMarcador || 'NAO INFORMADO';

            const repoResult = await server.database.query<{ id_repositorio_recorda: string }>(
              `SELECT id_repositorio_recorda FROM repositorios
             WHERE id_repositorio_ged = $1 AND orgao = $2 AND projeto = $3
             LIMIT 1`,
              [repoIdentificador, orgaoRepositorio, PROJETO_IMPORTACAO_PRODUCAO]
            );
            const repositorioId = repoResult.rows[0]?.id_repositorio_recorda;
            if (!repositorioId) {
              inseridosPrevistos++;
              continue;
            }

            const existente = await server.database.query<{ id: string; quantidade: number }>(
              `SELECT id, quantidade FROM producao_repositorio
             WHERE usuario_id = $1
               AND repositorio_id = $2
               AND (data_producao AT TIME ZONE '${SYSTEM_TIMEZONE}')::date = $3::date
               AND etapa = $4
               AND COALESCE(marcadores->>'origem', '') = 'LEGADO'
               AND COALESCE(marcadores->>'tipo', '') = $5
               AND COALESCE(marcadores->>'funcao', '') = $6
               AND COALESCE(marcadores->>'coordenadoria', '') = $7
               AND COALESCE(marcadores->>'colaborador_nome', '') = $8
             LIMIT 1`,
              [
                colaboradorId,
                repositorioId,
                dataStr,
                etapaImport,
                tipoMarcador,
                funcaoMarcador,
                coordenadoriaMarcador,
                colaboradorNome,
              ]
            );

            if (existente.rows.length === 0) {
              inseridosPrevistos++;
              continue;
            }
            duplicadasBanco.push(linha);
            if (Number(existente.rows[0]!.quantidade) === quantidade) {
              ignoradosPrevistos++;
            } else {
              atualizadosPrevistos++;
            }
          }

          const invalidasSet = new Set(linhasInvalidas.map((e) => e.linha));
          const dupSet = new Set([...duplicadasPlanilha, ...duplicadasBanco]);
          const registrosValidos =
            registros.filter((_, i) => !invalidasSet.has(i + 1) && !dupSet.has(i + 1)).length +
            atualizadosPrevistos;

          return reply.send({
            totalRegistros: registros.length,
            registrosValidos: Math.max(registrosValidos, 0),
            duplicadasPlanilha: [...new Set(duplicadasPlanilha)].sort((a, b) => a - b),
            duplicadasBanco: [...new Set(duplicadasBanco)].sort((a, b) => a - b),
            linhasInvalidas,
            amostraDatas,
            impacto: {
              inseridosPrevistos,
              atualizadosPrevistos,
              ignoradosPrevistos,
              invalidos: linhasInvalidas.length,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro no preview de importacao';
          return reply.status(400).send({ error: message });
        }
      }
    );
    // POST /operacional/fontes-importacao/:id/importar - Fetch & import from a saved source (auto-skip duplicates)
    server.post<{ Params: { id: string } }>(
      '/operacional/fontes-importacao/:id/importar',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Importar dados de uma fonte salva (auto-skip duplicatas)',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const startedAt = new Date();
          const { id } = request.params;

          // 1. Fetch the saved source
          const fonteResult = await server.database.query<{ id: string; nome: string; url: string }>(
            `SELECT id, nome, url FROM fontes_importacao WHERE id = $1`,
            [id]
          );
          if (fonteResult.rows.length === 0) {
            return reply.status(404).send({ error: 'Fonte de importacao nao encontrada' });
          }
          const fonte = fonteResult.rows[0]!;

        // 2. Fetch CSV and parse rows from source
        let registros: ParsedImportRow[] = [];
        try {
          const fetched = await fetchCsvFromSourceUrl(fonte.url, 15_000, false);
          if (!fetched.csvContent.trim()) {
            return reply.status(400).send({ error: 'A planilha retornou conteudo vazio.' });
          }
          registros = parseImportRowsFromCsv(fetched.csvContent);
        } catch (error) {
          return sendSpreadsheetFetchError(reply, error);
        }

        if (registros.length === 0) {
          return reply
            .status(400)
            .send({ error: 'Nenhum registro valido encontrado na planilha.' });
        }

        // 4. Import with auto-skip duplicates - delegate to the existing producao import handler logic
        //    but inline it here to auto-skip instead of prompting
        const user = getCurrentUser(request);

        const etapaStatusMap: Record<string, StatusRepositorio> = {
          RECEBIMENTO: 'RECEBIDO',
          PREPARACAO: 'EM_PREPARACAO',
          DIGITALIZACAO: 'EM_DIGITALIZACAO',
          CONFERENCIA: 'EM_CONFERENCIA',
          MONTAGEM: 'EM_MONTAGEM',
          CONTROLE_QUALIDADE: 'EM_CQ',
          ENTREGA: 'EM_ENTREGA',
        };
        const funcaoToEtapa = (funcao: string): EtapaFluxo => {
          const f = funcao
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
          if (f.includes('receb')) return 'RECEBIMENTO';
          if (f.includes('prepar')) return 'PREPARACAO';
          if (f.includes('digital')) return 'DIGITALIZACAO';
          if (f.includes('confer')) return 'CONFERENCIA';
          if (f.includes('montag')) return 'MONTAGEM';
          if (f.includes('qualidade') || f.includes('cq')) return 'CONTROLE_QUALIDADE';
          if (f.includes('entreg')) return 'ENTREGA';
          return 'RECEBIMENTO';
        };

        const usuariosResult = await server.database.query<{ id: string; nome: string }>(
          `SELECT id, nome FROM usuarios WHERE ativo = TRUE`
        );
        const usuariosPorNome = new Map<string, string>();
        for (const u of usuariosResult.rows) {
          usuariosPorNome.set(u.nome.toLowerCase().trim(), u.id);
        }

        let sucesso = 0;
        let inseridos = 0;
        let atualizados = 0;
        let ignorados = 0;
        let duplicados = 0;
        const importacaoExecId = randomUUID();
        const insertedProducaoIds: string[] = [];
        const updatedSnapshots: Array<{
          id: string;
          quantidade: number;
          checklist_id: string | null;
          etapa: string;
          marcadores: Record<string, unknown>;
        }> = [];
        const importacaoFonteHashes: string[] = [];
        const erros: Array<{ linha: number; erro: string; dados?: Record<string, unknown> }> = [];

        await server.database.query('BEGIN');
        try {
          const lockResult = await server.database.query<{ acquired: boolean }>(
            `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired`,
            [`importacao_fonte:${fonte.id}`]
          );
          if (!lockResult.rows[0]?.acquired) {
            throw new Error('Importacao desta fonte ja esta em execucao. Tente novamente.');
          }

          for (let idx = 0; idx < registros.length; idx++) {
            const row = registros[idx]!;
            const linha = idx + 1;
            const parsedRow = parseImportRowStrict(row);
            if (!parsedRow.ok) {
              erros.push({ linha, erro: parsedRow.error, dados: { ...row } });
              continue;
            }
            const {
              repoIdentificadorRaw,
              colaboradorNome,
              quantidade,
              dataProducaoStr,
              dataOriginalRaw,
              anoRef,
              tipoMarcador,
              funcaoMarcador,
              coordenadoriaMarcador,
            } = parsedRow.value;
            const etapaImport = funcaoToEtapa(funcaoMarcador);
            const statusImport = etapaStatusMap[etapaImport] ?? 'RECEBIDO';

            // Resolve collaborator
            let colaboradorId = usuariosPorNome.get(colaboradorNome.toLowerCase());
            if (!colaboradorId) {
              for (const [nome, uid] of usuariosPorNome.entries()) {
                if (
                  nome.includes(colaboradorNome.toLowerCase()) ||
                  colaboradorNome.toLowerCase().includes(nome)
                ) {
                  colaboradorId = uid;
                  break;
                }
              }
            }
            if (!colaboradorId) colaboradorId = user.id;

            const repoIdentificador = normalizeIdRepositorioGed(repoIdentificadorRaw, anoRef);
            const orgaoRepositorio = coordenadoriaMarcador || 'NAO INFORMADO';

            try {
              // Find or create repo
              const repoResult = await server.database.query<{ id_repositorio_recorda: string }>(
                `SELECT id_repositorio_recorda
               FROM repositorios
               WHERE id_repositorio_ged = $1
                 AND orgao = $2
                 AND projeto = $3`,
                [repoIdentificador, orgaoRepositorio, PROJETO_IMPORTACAO_PRODUCAO]
              );
              let repositorioId = repoResult.rows[0]?.id_repositorio_recorda ?? '';
              if (!repositorioId) {
                const createdRepo = await server.database.query<{ id_repositorio_recorda: string }>(
                  `INSERT INTO repositorios (id_repositorio_ged, orgao, projeto, status_atual, etapa_atual)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (id_repositorio_ged, orgao, projeto) DO UPDATE SET id_repositorio_ged = EXCLUDED.id_repositorio_ged
                 RETURNING id_repositorio_recorda`,
                  [
                    repoIdentificador,
                    orgaoRepositorio,
                    PROJETO_IMPORTACAO_PRODUCAO,
                    statusImport,
                    etapaImport,
                  ]
                );
                repositorioId = createdRepo.rows[0]?.id_repositorio_recorda ?? '';
              }

              // Check for duplicate - auto-skip with comprehensive comparison
              const colaboradorNomeMarcador = (colaboradorNome || '').trim();
              const idempotencyHash = buildImportRowHash({
                fonteId: fonte.id,
                repositorioGed: repoIdentificador,
                repositorioId,
                colaboradorId,
                colaboradorNome: colaboradorNomeMarcador,
                etapa: etapaImport,
                data: dataProducaoStr,
                quantidade,
                tipo: tipoMarcador,
                funcao: funcaoMarcador,
                coordenadoria: coordenadoriaMarcador,
              });
              const idemExistente = await server.database.query<{ id: string }>(
                `SELECT id FROM importacao_fontes_linhas
               WHERE fonte_id = $1 AND chave_hash = $2
               LIMIT 1`,
                [fonte.id, idempotencyHash]
              );
              if (idemExistente.rows.length > 0) {
                duplicados++;
                ignorados++;
                continue;
              }
              const marcadores = JSON.stringify({
                origem: 'LEGADO',
                importacao_exec_id: importacaoExecId,
                funcao: funcaoMarcador,
                tipo: tipoMarcador,
                coordenadoria: coordenadoriaMarcador,
                colaborador_nome: colaboradorNome,
                data_original: dataOriginalRaw,
              });

              const existente = await server.database.query<{
                id: string;
                quantidade: number;
                checklist_id: string | null;
                etapa: string;
                marcadores: Record<string, unknown>;
              }>(
                `SELECT id, quantidade, checklist_id, etapa::text as etapa, marcadores
               FROM producao_repositorio
               WHERE usuario_id = $1 AND repositorio_id = $2 AND (data_producao AT TIME ZONE '${SYSTEM_TIMEZONE}')::date = $3::date
                 AND etapa = $4
                 AND COALESCE(marcadores->>'origem', '') = 'LEGADO'
                 AND COALESCE(marcadores->>'tipo', '') = $5
                 AND COALESCE(marcadores->>'funcao', '') = $6
                 AND COALESCE(marcadores->>'coordenadoria', '') = $7
                 AND COALESCE(marcadores->>'colaborador_nome', '') = $8
               LIMIT 1`,
                [
                  colaboradorId,
                  repositorioId,
                  dataProducaoStr,
                  etapaImport,
                  tipoMarcador,
                  funcaoMarcador,
                  coordenadoriaMarcador,
                  colaboradorNomeMarcador,
                ]
              );

              if (existente.rows.length > 0) {
                if (Number(existente.rows[0]!.quantidade) === quantidade) {
                  duplicados++;
                  ignorados++;
                  continue;
                }
                updatedSnapshots.push({
                  id: existente.rows[0]!.id,
                  quantidade: Number(existente.rows[0]!.quantidade),
                  checklist_id: existente.rows[0]!.checklist_id,
                  etapa: existente.rows[0]!.etapa,
                  marcadores: existente.rows[0]!.marcadores ?? {},
                });
                await server.database.query(
                  `UPDATE producao_repositorio
                 SET quantidade = $1, marcadores = $2::jsonb, etapa = $4
                 WHERE id = $3`,
                  [quantidade, marcadores, existente.rows[0]!.id, etapaImport]
                );
                await server.database.query(
                  `INSERT INTO importacao_fontes_linhas (fonte_id, chave_hash, linha)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (fonte_id, chave_hash) DO NOTHING`,
                  [fonte.id, idempotencyHash, linha]
                );
                importacaoFonteHashes.push(idempotencyHash);
                atualizados++;
                sucesso++;
                continue;
              }

              // Find or create checklist (must be CONCLUIDO to satisfy production trigger)
              const existingChecklist = await server.database.query<{ id: string }>(
                `SELECT id FROM checklists WHERE repositorio_id = $1 AND etapa = $2 AND status = 'CONCLUIDO' LIMIT 1`,
                [repositorioId, etapaImport]
              );
              let checklistId = existingChecklist.rows[0]?.id ?? '';
              if (!checklistId) {
                const checklistResult = await server.database.query<{ id: string }>(
                  `INSERT INTO checklists (repositorio_id, etapa, status, observacao, responsavel_id, ativo, data_conclusao)
                 VALUES ($1, $2, 'CONCLUIDO', 'Importacao legada', $3, FALSE, CURRENT_TIMESTAMP) RETURNING id`,
                  [repositorioId, etapaImport, colaboradorId]
                );
                checklistId = checklistResult.rows[0]?.id ?? '';
              }

              const inserted = await server.database.query<{ id: string }>(
                `INSERT INTO producao_repositorio (
                 repositorio_id, etapa, checklist_id, usuario_id, quantidade, marcadores, data_producao
               ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
               RETURNING id`,
                [
                  repositorioId,
                  etapaImport,
                  checklistId,
                  colaboradorId,
                  quantidade,
                  marcadores,
                  dataProducaoStr,
                ]
              );
              const insertedId = inserted.rows[0]?.id;
              if (insertedId) insertedProducaoIds.push(insertedId);
              await server.database.query(
                `INSERT INTO importacao_fontes_linhas (fonte_id, chave_hash, linha)
               VALUES ($1, $2, $3)
               ON CONFLICT (fonte_id, chave_hash) DO NOTHING`,
                [fonte.id, idempotencyHash, linha]
              );
              importacaoFonteHashes.push(idempotencyHash);
              inseridos++;
              sucesso++;
            } catch (error) {
              erros.push({
                linha,
                erro: error instanceof Error ? error.message : 'Erro desconhecido',
                dados: {
                  repositorio: repoIdentificadorRaw,
                  colaborador: colaboradorNome,
                  funcao: row.funcao,
                  tipo: row.tipo,
                  data_original: dataOriginalRaw,
                  data: dataProducaoStr,
                  quantidade,
                },
              });
            }
          }

          await server.database.query('COMMIT');
        } catch (innerError) {
          await server.database.query('ROLLBACK');
          throw innerError;
        }

        // Update last import timestamp
        await server.database.query(
          `UPDATE fontes_importacao SET ultima_importacao_em = NOW() WHERE id = $1`,
          [id]
        );

        // Log the import
        const finishedAt = new Date();
        const detalhesImportacao = {
          importacao_exec_id: importacaoExecId,
          fonte: { id: fonte.id, nome: fonte.nome, url: fonte.url },
          rollback: {
            insertedProducaoIds,
            updatedSnapshots,
            fonteId: fonte.id,
            importacaoFonteHashes: [...new Set(importacaoFonteHashes)],
          },
          periodo_execucao: {
            iniciado_em: startedAt.toISOString(),
            finalizado_em: finishedAt.toISOString(),
            duracao_ms: finishedAt.getTime() - startedAt.getTime(),
          },
          contadores: {
            total_planilha: registros.length,
            sucesso,
            inseridos,
            atualizados,
            ignorados,
            duplicados,
            erros: erros.length,
          },
          erros_amostra: erros.slice(0, 50),
        };
        await server.database.query(
          `INSERT INTO importacoes_legado_operacional (
           tipo, total_registros, registros_sucesso, registros_erro, detalhes_erros, usuario_destino_id, executado_por
         ) VALUES ('PRODUCAO', $1, $2, $3, $4::jsonb, $5, $6)`,
          [
            registros.length,
            sucesso,
            erros.length,
            JSON.stringify(detalhesImportacao),
            user.id,
            user.id,
          ]
        );

          return reply.send({
            fonte: fonte.nome,
            totalPlanilha: registros.length,
            importados: sucesso,
            inseridos,
            atualizados,
            ignorados,
            duplicados,
            erros: erros.length,
            detalhesErros: erros.slice(0, 20),
          });
        } catch (error) {
          request.log.error({ err: error, fonteId: request.params.id }, 'Erro ao importar fonte');
          const message =
            error instanceof Error ? error.message : 'Erro ao importar fonte de producao';
          return sendDatabaseError(reply, error, message);
        }
      }
    );

    // POST /operacional/fontes-importacao/importar-todas - Import from all saved sources
    server.post(
      '/operacional/fontes-importacao/importar-todas',
      {
        schema: {
          tags: ['operacional'],
          summary: 'Importar de todas as fontes salvas',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const startedAt = new Date();

          // 1. Get all saved sources
          const fontesResult = await server.database.query<{ id: string; nome: string; url: string }>(
            `SELECT id, nome, url FROM fontes_importacao ORDER BY nome`
          );
          if (fontesResult.rows.length === 0) {
            return reply.status(400).send({ error: 'Nenhuma fonte de importacao cadastrada.' });
          }

        const fontes = fontesResult.rows;
        const resultados: Array<{
          fonte: string;
          importados: number;
          duplicados: number;
          erros: number;
          sucesso: boolean;
          erro?: string;
          erros_amostra?: Array<{ linha: number; erro: string }>;
        }> = [];
        let totalImportados = 0;
        let totalDuplicados = 0;
        let totalErros = 0;

        // 2. Import each source usando o mesmo fluxo da rota individual /:id/importar
        for (const fonte of fontes) {
          try {
            const injected = await server.inject({
              method: 'POST',
              url: `/operacional/fontes-importacao/${fonte.id}/importar`,
              headers: {
                authorization: request.headers.authorization ?? '',
              },
            });

            if (injected.statusCode >= 400) {
              let message = `Falha ao importar fonte (HTTP ${injected.statusCode})`;
              try {
                const parsed = injected.json() as { error?: string; code?: string };
                if (parsed?.error) {
                  message = parsed.code ? `${parsed.error} (${parsed.code})` : parsed.error;
                }
              } catch {
                // ignore parsing error
              }
              throw new Error(message);
            }

            const importResult = injected.json() as {
              importados: number;
              duplicados: number;
              erros: number;
              detalhesErros?: Array<{ linha: number; erro: string }>;
            };

            resultados.push({
              fonte: fonte.nome,
              importados: Number(importResult.importados ?? 0),
              duplicados: Number(importResult.duplicados ?? 0),
              erros: Number(importResult.erros ?? 0),
              sucesso: importResult.erros === 0,
              erros_amostra: importResult.detalhesErros ?? [],
            });

            totalImportados += Number(importResult.importados ?? 0);
            totalDuplicados += Number(importResult.duplicados ?? 0);
            totalErros += Number(importResult.erros ?? 0);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            resultados.push({
              fonte: fonte.nome,
              importados: 0,
              duplicados: 0,
              erros: 1,
              sucesso: false,
              erro: errorMessage,
            });
            totalErros++;

            request.log.error({ err: error, fonteId: fonte.id }, 'Erro ao importar fonte no lote');
          }
        }

        // 3. Log the bulk import
        const finishedAt = new Date();
        const detalhesBulk = {
          periodo_execucao: {
            iniciado_em: startedAt.toISOString(),
            finalizado_em: finishedAt.toISOString(),
            duracao_ms: finishedAt.getTime() - startedAt.getTime(),
          },
          resumo: {
            fontes: fontes.length,
            importados: totalImportados,
            duplicados: totalDuplicados,
            erros: totalErros,
          },
          resultados,
        };

        const totalRegistrosLog = totalImportados + totalErros;
        await server.database.query(
          `INSERT INTO importacoes_legado_operacional (
           tipo, total_registros, registros_sucesso, registros_erro, detalhes_erros, usuario_destino_id, executado_por
         )
         VALUES ('PRODUCAO_BULK', $1, $2, $3, $4::jsonb, $5, $6)`,
          [
            totalRegistrosLog,
            totalImportados,
            totalErros,
            JSON.stringify(detalhesBulk),
            user.id,
            user.id,
          ]
        );

          return reply.send({
            total: fontes.length,
            resultados,
            resumo: {
              importados: totalImportados,
              duplicados: totalDuplicados,
              erros: totalErros,
            },
          });
        } catch (error) {
          request.log.error({ err: error }, 'Erro ao importar todas as fontes');
          const message =
            error instanceof Error ? error.message : 'Erro ao importar todas as fontes';
          return sendDatabaseError(reply, error, message);
        }
      }
    );
  };
}
