import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authorize } from '../middleware/auth.js';
import { validateParams, validateQuery } from '../middleware/validate.js';
import { SYSTEM_TIMEZONE } from '../../../domain/producao/producao-metrics.js';

export const PAINEL_ETAPAS = [
  'PREPARACAO',
  'DIGITALIZACAO',
  'CONFERENCIA',
  'RECONFERENCIA',
] as const;
export type PainelEtapa = (typeof PAINEL_ETAPAS)[number];

// Ordem lógica de progressão de etapas
const ETAPA_ORDER: ReadonlyArray<string> = [
  'RECEBIMENTO',
  'PREPARACAO',
  'DIGITALIZACAO',
  'CONFERENCIA',
  'RECONFERENCIA',
  'CONTROLE_QUALIDADE',
];

function isPainelEtapa(value: string): value is PainelEtapa {
  return (PAINEL_ETAPAS as readonly string[]).includes(value);
}

function getUnidade(etapa: PainelEtapa): string {
  return etapa === 'DIGITALIZACAO' ? 'IMAGENS' : 'REPOSITORIO';
}

/**
 * Calcula etapa atual com base nas etapas com produção concluída.
 * Retorna a próxima etapa ainda sem produção.
 */
function calcularEtapaAtual(etapasConcluidas: Set<string>): string {
  const progressao = ['PREPARACAO', 'DIGITALIZACAO', 'CONFERENCIA', 'RECONFERENCIA'];
  for (const e of progressao) {
    if (!etapasConcluidas.has(e)) return e;
  }
  return 'CONTROLE_QUALIDADE';
}

function calcularProximaEtapa(etapaAtualCalculada: string): string | null {
  const idx = ETAPA_ORDER.indexOf(etapaAtualCalculada);
  if (idx < 0 || idx >= ETAPA_ORDER.length - 1) return null;
  return ETAPA_ORDER[idx + 1] ?? null;
}

// ── Raw DB row returned by the data query (before JS enrichment) ─────────────
type PainelRawRow = {
  producaoId: string;
  repositorioId: string;
  repositorioCodigo: string;
  entidade: string;
  etapa: string;
  responsavelId: string | null;
  responsavelNome: string | null;
  dataExecucao: string | null;
  quantidade: number;
  unidade: string;
  origem: 'LANCADA' | 'LEGADA';
  etapaAtualRepositorio: string;
  statusAtualRepositorio: string;
  temPreparacao: boolean;
  temDigitalizacao: boolean;
  temConferencia: boolean;
  temReconferencia: boolean;
  totalMesmaEtapa: number;
};

/** Calcula divergências e statusEtapa a partir dos campos brutos do DB. */
function enrichPainelRow(row: PainelRawRow) {
  const etapasConcluidas = new Set<string>();
  if (row.temPreparacao) etapasConcluidas.add('PREPARACAO');
  if (row.temDigitalizacao) etapasConcluidas.add('DIGITALIZACAO');
  if (row.temConferencia) etapasConcluidas.add('CONFERENCIA');
  if (row.temReconferencia) etapasConcluidas.add('RECONFERENCIA');

  const etapaAtualCalculada = calcularEtapaAtual(etapasConcluidas);
  const proximaEtapaSugerida = calcularProximaEtapa(etapaAtualCalculada);

  const divergencias: Array<{ tipo: string; mensagem: string }> = [];

  const repoEtapaIdx = ETAPA_ORDER.indexOf(row.etapaAtualRepositorio);
  const calcIdx = ETAPA_ORDER.indexOf(etapaAtualCalculada);
  if (repoEtapaIdx >= 0 && calcIdx >= 0 && repoEtapaIdx < calcIdx) {
    divergencias.push({
      tipo: 'STATUS_ATRASADO',
      mensagem: `Repositório indica etapa ${row.etapaAtualRepositorio}, mas produção aponta para ${etapaAtualCalculada}`,
    });
  }

  const etapaAtual = row.etapa;
  const etapaAtualIdx = ETAPA_ORDER.indexOf(etapaAtual);
  if (etapaAtualIdx > 1) {
    const etapaAnterior = ETAPA_ORDER[etapaAtualIdx - 1];
    if (etapaAnterior && !etapasConcluidas.has(etapaAnterior) && etapaAnterior !== 'RECEBIMENTO') {
      divergencias.push({
        tipo: 'ETAPA_PULADA',
        mensagem: `Existe produção de ${etapaAtual} mas não foi encontrada produção de ${etapaAnterior}`,
      });
    }
  }

  if (row.totalMesmaEtapa > 1) {
    divergencias.push({
      tipo: 'DUPLICIDADE',
      mensagem: `${row.totalMesmaEtapa} registros de ${etapaAtual} encontrados para este repositório (legada + lançada)`,
    });
  }

  if (!row.responsavelNome) {
    divergencias.push({
      tipo: 'RESPONSAVEL_AUSENTE',
      mensagem: 'Responsável não identificado para esta produção',
    });
  }

  if (etapaAtual === 'DIGITALIZACAO' && (!row.quantidade || row.quantidade === 0)) {
    divergencias.push({
      tipo: 'QUANTIDADE_AUSENTE',
      mensagem: 'Digitalização sem quantidade de imagens registrada',
    });
  }

  const statusEtapa = divergencias.length > 0 ? 'DIVERGENTE' : 'CONCLUIDA';

  const {
    temPreparacao: _tp,
    temDigitalizacao: _td,
    temConferencia: _tc,
    temReconferencia: _tr,
    totalMesmaEtapa: _tm,
    ...cleanRow
  } = row;

  return {
    ...cleanRow,
    statusEtapa,
    etapaAtualCalculada,
    proximaEtapaSugerida,
    divergencias,
    producaoRelacionada: [] as unknown[],
  };
}

const painelParamSchema = z.object({
  etapa: z.string().refine(isPainelEtapa, {
    message:
      'Etapa inválida para painel. Use: PREPARACAO, DIGITALIZACAO, CONFERENCIA ou RECONFERENCIA',
  }),
});

const painelQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  repositorio: z.string().optional(),
  colaboradorId: z.string().uuid('colaboradorId inválido').optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  origem: z.enum(['LANCADA', 'LEGADA']).optional(),
  statusEtapa: z.enum(['CONCLUIDA', 'PENDENTE', 'DIVERGENTE']).optional(),
  somentePendentes: z
    .union([z.boolean(), z.string().transform((v) => v === 'true')])
    .optional()
    .default(false),
});

export function createOperacionalPainelRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    /**
     * GET /operacional/etapas/:etapa/painel
     *
     * Painel de acompanhamento operacional por etapa.
     * Etapas suportadas: PREPARACAO, DIGITALIZACAO, CONFERENCIA, RECONFERENCIA.
     *
     * Modo padrão (somentePendentes=false):
     *   Retorna registros de produção para a etapa (um por registro), com dados do
     *   repositório, responsável, data, quantidade e origem (LANCADA|LEGADA).
     *
     * Modo pendentes (somentePendentes=true):
     *   Retorna repositórios cuja etapa_atual é esta etapa mas não têm produção registrada.
     */
    server.get(
      '/operacional/etapas/:etapa/painel',
      {
        schema: {
          tags: ['operacional-painel'],
          summary: 'Painel de acompanhamento por etapa',
          description:
            'Lista registros de produção por etapa para rastreabilidade operacional. ' +
            'Suporta PREPARACAO, DIGITALIZACAO, CONFERENCIA e RECONFERENCIA.',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            required: ['etapa'],
            properties: { etapa: { type: 'string' } },
          },
          querystring: {
            type: 'object',
            properties: {
              page: { type: 'integer', default: 1 },
              limit: { type: 'integer', default: 20 },
              repositorio: { type: 'string' },
              colaboradorId: { type: 'string' },
              dataInicio: { type: 'string', format: 'date' },
              dataFim: { type: 'string', format: 'date' },
              origem: { type: 'string', enum: ['LANCADA', 'LEGADA'] },
              somentePendentes: { type: 'boolean', default: false },
              statusEtapa: { type: 'string', enum: ['CONCLUIDA', 'PENDENTE', 'DIVERGENTE'] },
            },
          },
          response: {
            200: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } } },
            500: { type: 'object', properties: { error: { type: 'string' } } },
          },
        },
        preHandler: [
          server.authenticate,
          authorize('operador', 'administrador'),
          validateParams(painelParamSchema),
          validateQuery(painelQuerySchema),
        ],
      },
      async (request, reply) => {
        try {
          const { etapa } = request.params as { etapa: PainelEtapa };
          const q = request.query as z.infer<typeof painelQuerySchema>;
          const unidade = getUnidade(etapa);
          const page = q.page;
          const limit = q.limit;
          const offset = (page - 1) * limit;

          // ──────────────────────────────────────────────────────────
          // MODO PENDENTES
          // Repositórios na etapa sem produção registrada.
          // ──────────────────────────────────────────────────────────
          if (q.somentePendentes) {
            const params: unknown[] = [etapa];
            let p = 2;
            let extraWhere = '';

            if (q.repositorio) {
              extraWhere += ` AND (r.id_repositorio_ged ILIKE $${p} OR r.orgao ILIKE $${p})`;
              params.push(`%${q.repositorio}%`);
              p++;
            }
            if (q.dataInicio) {
              extraWhere += ` AND r.data_criacao >= $${p++}::date`;
              params.push(q.dataInicio);
            }
            if (q.dataFim) {
              extraWhere += ` AND r.data_criacao < ($${p++}::date + INTERVAL '1 day')`;
              params.push(q.dataFim);
            }

            const pendentesWhere = `r.etapa_atual = $1::etapa_fluxo
              AND r.projeto NOT IN ('LEGADO', 'IMPORTACAO_PRODUCAO')
              AND NOT EXISTS (
                SELECT 1 FROM producao_repositorio pr2
                WHERE pr2.repositorio_id = r.id_repositorio_recorda
                  AND pr2.etapa = $1::etapa_fluxo
              )${extraWhere}`;

            const totalResult = await server.database.query<{ total: string }>(
              `SELECT -- @painel-pendentes-count
               COUNT(*)::text AS total FROM repositorios r WHERE ${pendentesWhere}`,
              params
            );
            const total = parseInt(totalResult.rows[0]?.total ?? '0', 10);

            params.push(limit, offset);
            const dataResult = await server.database.query(
              `SELECT -- @painel-pendentes-data
                 r.id_repositorio_recorda AS "repositorioId",
                 r.id_repositorio_ged    AS "repositorioCodigo",
                 r.orgao                 AS entidade,
                 $1::text                AS etapa,
                 'PENDENTE'              AS "statusEtapa",
                 NULL::uuid              AS "responsavelId",
                 NULL::text              AS "responsavelNome",
                 NULL::timestamptz       AS "dataExecucao",
                 0                       AS quantidade,
                 '${unidade}'            AS unidade,
                 NULL::text              AS origem,
                 r.etapa_atual::text     AS "etapaAtualRepositorio",
                 r.status_atual::text    AS "statusAtualRepositorio",
                 -- etapa calculada por produção existente (pendentes = ainda nesta etapa)
                 $1::text                AS "etapaAtualCalculada",
                 -- próxima etapa
                 NULL::text              AS "proximaEtapaSugerida",
                 '[]'::jsonb             AS divergencias,
                 '[]'::jsonb             AS "producaoRelacionada"
               FROM repositorios r
               WHERE ${pendentesWhere}
               ORDER BY r.data_criacao ASC
               LIMIT $${p++} OFFSET $${p}`,
              params
            );

            return reply.send({
              data: dataResult.rows,
              meta: { page, limit, total },
            });
          }

          // ──────────────────────────────────────────────────────────
          // MODO PADRÃO — produção registrada (CONCLUIDAS / DIVERGENTE)
          // Um row por registro de produção.
          // ──────────────────────────────────────────────────────────
          const params: unknown[] = [etapa];
          let p = 2;
          let extraWhere = '';

          if (q.colaboradorId) {
            extraWhere += ` AND pr.usuario_id = $${p++}`;
            params.push(q.colaboradorId);
          }
          if (q.repositorio) {
            extraWhere += ` AND (r.id_repositorio_ged ILIKE $${p} OR r.orgao ILIKE $${p})`;
            params.push(`%${q.repositorio}%`);
            p++;
          }
          if (q.dataInicio) {
            extraWhere += ` AND (pr.data_producao AT TIME ZONE '${SYSTEM_TIMEZONE}')::date >= $${p++}::date`;
            params.push(q.dataInicio);
          }
          if (q.dataFim) {
            extraWhere += ` AND (pr.data_producao AT TIME ZONE '${SYSTEM_TIMEZONE}')::date <= $${p++}::date`;
            params.push(q.dataFim);
          }
          if (q.origem) {
            if (q.origem === 'LEGADA') {
              extraWhere += ` AND COALESCE(pr.marcadores->>'origem', 'SISTEMA') = 'LEGADO'`;
            } else {
              extraWhere += ` AND COALESCE(pr.marcadores->>'origem', 'SISTEMA') != 'LEGADO'`;
            }
          }

          const etapaWhere = `pr.etapa = $1::etapa_fluxo${extraWhere}`;

          // ── SQL SELECT fields shared between both data query paths ──────────────
          // unidade is a literal value computed from the route param (safe, not user input)
          const selectFields = `
               pr.id                                                    AS "producaoId",
               r.id_repositorio_recorda                                 AS "repositorioId",
               r.id_repositorio_ged                                     AS "repositorioCodigo",
               r.orgao                                                  AS entidade,
               pr.etapa::text                                           AS etapa,
               pr.usuario_id                                            AS "responsavelId",
               COALESCE(u.nome, pr.marcadores->>'colaborador_nome')     AS "responsavelNome",
               pr.data_producao                                         AS "dataExecucao",
               pr.quantidade,
               '${unidade}'                                             AS unidade,
               CASE
                 WHEN COALESCE(pr.marcadores->>'origem', 'SISTEMA') = 'LEGADO' THEN 'LEGADA'
                 ELSE 'LANCADA'
               END                                                      AS origem,
               r.etapa_atual::text                                      AS "etapaAtualRepositorio",
               r.status_atual::text                                     AS "statusAtualRepositorio",
               EXISTS(
                 SELECT 1 FROM producao_repositorio px
                 WHERE px.repositorio_id = r.id_repositorio_recorda AND px.etapa = 'PREPARACAO'
               )                                                         AS "temPreparacao",
               EXISTS(
                 SELECT 1 FROM producao_repositorio px
                 WHERE px.repositorio_id = r.id_repositorio_recorda AND px.etapa = 'DIGITALIZACAO'
               )                                                         AS "temDigitalizacao",
               EXISTS(
                 SELECT 1 FROM producao_repositorio px
                 WHERE px.repositorio_id = r.id_repositorio_recorda AND px.etapa = 'CONFERENCIA'
               )                                                         AS "temConferencia",
               EXISTS(
                 SELECT 1 FROM producao_repositorio px
                 WHERE px.repositorio_id = r.id_repositorio_recorda AND px.etapa = 'RECONFERENCIA'
               )                                                         AS "temReconferencia",
               (
                 SELECT COUNT(*) FROM producao_repositorio px
                 WHERE px.repositorio_id = r.id_repositorio_recorda AND px.etapa = $1::etapa_fluxo
               )::integer                                                AS "totalMesmaEtapa"`;

          const fromClause = `
             FROM producao_repositorio pr
             JOIN repositorios r ON r.id_repositorio_recorda = pr.repositorio_id
             LEFT JOIN usuarios u ON u.id = pr.usuario_id
             WHERE ${etapaWhere}
             ORDER BY pr.data_producao DESC`;

          if (q.statusEtapa) {
            // ── Slow path: statusEtapa filter needs JS-level enrichment ────────────
            // Divergências cannot be computed in SQL, so we must fetch ALL rows,
            // enrich in JS, filter by statusEtapa, then paginate in JS.
            // This guarantees meta.total = count of filtered rows (consistent with pages).
            const allResult = await server.database.query<PainelRawRow>(
              `SELECT -- @painel-etapa-data-all
               ${selectFields}
               ${fromClause}`,
              params
            );
            const allEnriched = allResult.rows.map(enrichPainelRow);
            const filtered = allEnriched.filter((r) => r.statusEtapa === q.statusEtapa);
            const total = filtered.length;
            const pageData = filtered.slice(offset, offset + limit);
            return reply.send({ data: pageData, meta: { page, limit, total } });
          }

          // ── Fast path: SQL COUNT + SQL LIMIT/OFFSET (no statusEtapa filter) ──────
          const totalResult = await server.database.query<{ total: string }>(
            `SELECT -- @painel-etapa-count
             COUNT(*)::text AS total
             FROM producao_repositorio pr
             JOIN repositorios r ON r.id_repositorio_recorda = pr.repositorio_id
             WHERE ${etapaWhere}`,
            params
          );
          const total = parseInt(totalResult.rows[0]?.total ?? '0', 10);

          params.push(limit, offset);
          const dataResult = await server.database.query<PainelRawRow>(
            `SELECT -- @painel-etapa-data
               ${selectFields}
               ${fromClause}
             LIMIT $${p++} OFFSET $${p}`,
            params
          );
          const rows = dataResult.rows.map(enrichPainelRow);
          return reply.send({ data: rows, meta: { page, limit, total } });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar painel';
          return reply.status(500).send({ error: message });
        }
      }
    );
  };
}
