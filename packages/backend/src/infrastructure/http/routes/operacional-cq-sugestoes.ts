import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authorize } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';

// ── Severity ordering (same as operacional-painel) ───────────────────────────
type Severidade = 'alta' | 'media' | 'baixa';
const SEVERIDADE_ORDER: Severidade[] = ['alta', 'media', 'baixa'];

function calcularMaiorSeveridade(
  divergencias: ReadonlyArray<{ severidade: Severidade }>
): Severidade | null {
  if (divergencias.length === 0) return null;
  for (const s of SEVERIDADE_ORDER) {
    if (divergencias.some((d) => d.severidade === s)) return s;
  }
  return 'baixa';
}

// ── Etapa order ───────────────────────────────────────────────────────────────
const ETAPA_ORDER_CQ = [
  'RECEBIMENTO',
  'PREPARACAO',
  'DIGITALIZACAO',
  'CONFERENCIA',
  'RECONFERENCIA',
  'CONTROLE_QUALIDADE',
];

// ── Raw DB row returned by the sugestões data query ───────────────────────────
type SugestaoRawRow = {
  repositorioId: string;
  repositorioCodigo: string;
  entidade: string;
  etapaAtual: string;
  statusAtual: string;
  temPreparacao: boolean;
  temDigitalizacao: boolean;
  temConferencia: boolean;
  temReconferencia: boolean;
  totalImagensDigitalizacao: number;
  ultimaDataReconferencia: string | null;
  ultimaRespReconferencia: string | null;
  origem: 'LANCADA' | 'LEGADA' | 'MISTA';
};

// ── Enrich a raw DB row with CQ readiness logic ───────────────────────────────
function enrichSugestaoRow(row: SugestaoRawRow) {
  const divergencias: Array<{ tipo: string; severidade: Severidade; mensagem: string }> = [];

  // DIGITALIZACAO_SEM_IMAGENS: no digitization quantity registered
  if (row.totalImagensDigitalizacao === 0) {
    divergencias.push({
      tipo: 'DIGITALIZACAO_SEM_IMAGENS',
      severidade: 'alta',
      mensagem: 'Digitalização sem quantidade de imagens registrada.',
    });
  }

  // STATUS_ATRASADO: system etapa hasn't caught up to CONTROLE_QUALIDADE, unless
  // status_atual already indicates it's waiting for a batch (AGUARDANDO_CQ_LOTE)
  const etapaAtualIdx = ETAPA_ORDER_CQ.indexOf(row.etapaAtual);
  const cqIdx = ETAPA_ORDER_CQ.indexOf('CONTROLE_QUALIDADE');
  if (
    etapaAtualIdx >= 0 &&
    etapaAtualIdx < cqIdx &&
    row.statusAtual !== 'AGUARDANDO_CQ_LOTE' &&
    row.statusAtual !== 'EM_CQ'
  ) {
    divergencias.push({
      tipo: 'STATUS_ATRASADO',
      severidade: 'media',
      mensagem: 'Etapa do repositório não foi atualizada para Controle de Qualidade.',
    });
  }

  const prontoParaCQ = !divergencias.some((d) => d.severidade === 'alta');
  const maiorSeveridade = calcularMaiorSeveridade(divergencias);

  const motivos: string[] = ['Reconferência concluída', 'Todas as etapas operacionais registradas'];
  if (divergencias.length === 0) {
    motivos.push('Sem divergências bloqueantes');
  }

  return {
    repositorioId: row.repositorioId,
    repositorioCodigo: row.repositorioCodigo,
    entidade: row.entidade,
    origem: row.origem,
    etapaAtualCalculada: 'CONTROLE_QUALIDADE' as const,
    statusAtual: row.statusAtual,
    prontoParaCQ,
    motivos,
    divergencias,
    maiorSeveridade,
    ultimaEtapaConcluida: {
      etapa: 'RECONFERENCIA' as const,
      responsavelNome: row.ultimaRespReconferencia ?? null,
      data: row.ultimaDataReconferencia
        ? new Date(row.ultimaDataReconferencia).toISOString().slice(0, 10)
        : null,
    },
  };
}

// ── Query schema ──────────────────────────────────────────────────────────────
const sugestoesCQQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  entidade: z.string().optional(),
  repositorio: z.string().optional(),
  origem: z.enum(['LANCADA', 'LEGADA', 'MISTA']).optional(),
  incluirComAlertas: z
    .union([z.boolean(), z.string().transform((v) => v !== 'false')])
    .optional()
    .default(true),
  somenteProntos: z
    .union([z.boolean(), z.string().transform((v) => v === 'true')])
    .optional()
    .default(false),
});

export function createCQSugestoesRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    /**
     * GET /controle-qualidade/sugestoes
     *
     * Returns repositories ready (or nearly ready) to enter Controle de Qualidade.
     * Criteria: production records exist for PREPARACAO + DIGITALIZACAO + CONFERENCIA + RECONFERENCIA.
     * Excludes: repos already in an ABERTO CQ batch, and repos with status
     * CQ_APROVADO, CQ_REPROVADO, EM_ENTREGA or ENTREGUE.
     *
     * Response includes a `prontoParaCQ` flag and a `resumo` with aggregate counts.
     * The system suggests, but never creates a batch automatically.
     */
    server.get(
      '/operacional/controle-qualidade/sugestoes',
      {
        schema: {
          tags: ['controle-qualidade'],
          summary: 'Sugestões automáticas de repositórios para Controle de Qualidade',
          description:
            'Lista repositórios que completaram todas as etapas operacionais e são candidatos ao CQ. ' +
            'Não cria lotes automaticamente — apenas sugere.',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              page: { type: 'integer', default: 1 },
              limit: { type: 'integer', default: 20 },
              entidade: { type: 'string' },
              repositorio: { type: 'string' },
              origem: { type: 'string', enum: ['LANCADA', 'LEGADA', 'MISTA'] },
              incluirComAlertas: { type: 'boolean', default: true },
              somenteProntos: { type: 'boolean', default: false },
            },
          },
        },
        preHandler: [
          server.authenticate,
          authorize('colaborador', 'operador', 'administrador'),
          validateQuery(sugestoesCQQuerySchema),
        ],
      },
      async (request, reply) => {
        const { page, limit, entidade, repositorio, origem, incluirComAlertas, somenteProntos } =
          request.query as z.infer<typeof sugestoesCQQuerySchema>;

        const db = request.server.database;

        // Build optional WHERE clauses for SQL-level filters (entidade, repositorio, origem)
        const sqlFilters: string[] = [];
        const sqlParams: unknown[] = [];
        let paramIdx = 1;

        if (entidade) {
          sqlFilters.push(`r.orgao ILIKE $${paramIdx++}`);
          sqlParams.push(`%${entidade}%`);
        }
        if (repositorio) {
          sqlFilters.push(`r.id_repositorio_ged ILIKE $${paramIdx++}`);
          sqlParams.push(`%${repositorio}%`);
        }
        if (origem) {
          sqlFilters.push(`rce.origem = $${paramIdx++}`);
          sqlParams.push(origem);
        }

        const whereClause = sqlFilters.length > 0 ? `AND ${sqlFilters.join(' AND ')}` : '';

        // When JS-level filters are needed (incluirComAlertas / somenteProntos), we
        // fetch all matching rows first, enrich and filter in JS, then slice for pagination.
        const needsJsFilter = somenteProntos || !incluirComAlertas;

        if (needsJsFilter) {
          // ── Slow path: fetch ALL, enrich in JS, filter, paginate ──────────────
          const dataQuery = `
            -- @sugestoes-cq-data
            WITH repos_com_etapas AS (
              SELECT
                pr.repositorio_id,
                BOOL_OR(pr.etapa = 'PREPARACAO')    AS tem_preparacao,
                BOOL_OR(pr.etapa = 'DIGITALIZACAO') AS tem_digitalizacao,
                BOOL_OR(pr.etapa = 'CONFERENCIA')   AS tem_conferencia,
                BOOL_OR(pr.etapa = 'RECONFERENCIA') AS tem_reconferencia,
                COALESCE(SUM(CASE WHEN pr.etapa = 'DIGITALIZACAO' THEN pr.quantidade ELSE 0 END), 0)::int
                  AS total_imagens_digitalizacao,
                MAX(CASE WHEN pr.etapa = 'RECONFERENCIA' THEN pr.data_producao END)
                  AS ultima_data_reconferencia,
                CASE
                  WHEN COUNT(*) FILTER (WHERE pr.marcadores->>'origem' != 'LEGADO') = 0 THEN 'LEGADA'
                  WHEN COUNT(*) FILTER (WHERE pr.marcadores->>'origem' = 'LEGADO')  = 0 THEN 'LANCADA'
                  ELSE 'MISTA'
                END AS origem
              FROM producao_repositorio pr
              GROUP BY pr.repositorio_id
              HAVING BOOL_OR(pr.etapa = 'PREPARACAO')
                 AND BOOL_OR(pr.etapa = 'DIGITALIZACAO')
                 AND BOOL_OR(pr.etapa = 'CONFERENCIA')
                 AND BOOL_OR(pr.etapa = 'RECONFERENCIA')
            ),
            em_lote_ativo AS (
              SELECT DISTINCT lcqi.repositorio_id
              FROM lotes_controle_qualidade_itens lcqi
              JOIN lotes_controle_qualidade l ON l.id = lcqi.lote_id
              WHERE l.status = 'ABERTO'
            )
            SELECT
              r.id_repositorio_recorda                AS "repositorioId",
              r.id_repositorio_ged                    AS "repositorioCodigo",
              r.orgao                                 AS "entidade",
              r.etapa_atual                           AS "etapaAtual",
              r.status_atual                          AS "statusAtual",
              rce.tem_preparacao                      AS "temPreparacao",
              rce.tem_digitalizacao                   AS "temDigitalizacao",
              rce.tem_conferencia                     AS "temConferencia",
              rce.tem_reconferencia                   AS "temReconferencia",
              rce.total_imagens_digitalizacao         AS "totalImagensDigitalizacao",
              rce.ultima_data_reconferencia           AS "ultimaDataReconferencia",
              rce.origem                              AS "origem",
              (
                SELECT COALESCE(u.nome, pr2.marcadores->>'colaborador_nome')
                FROM producao_repositorio pr2
                LEFT JOIN usuarios u ON u.id = pr2.usuario_id
                WHERE pr2.repositorio_id = r.id_repositorio_recorda
                  AND pr2.etapa = 'RECONFERENCIA'
                ORDER BY pr2.data_producao DESC NULLS LAST
                LIMIT 1
              ) AS "ultimaRespReconferencia"
            FROM repositorios r
            JOIN repos_com_etapas rce ON rce.repositorio_id = r.id_repositorio_recorda
            WHERE r.status_atual NOT IN ('CQ_APROVADO', 'CQ_REPROVADO', 'EM_ENTREGA', 'ENTREGUE')
              AND r.id_repositorio_recorda NOT IN (SELECT repositorio_id FROM em_lote_ativo)
              ${whereClause}
            ORDER BY rce.ultima_data_reconferencia DESC NULLS LAST, r.id_repositorio_ged ASC
          `;

          const allRows = await db.query<SugestaoRawRow>(dataQuery, sqlParams);
          const enriched = allRows.rows.map(enrichSugestaoRow);

          const filtered = enriched.filter((row) => {
            if (somenteProntos && !row.prontoParaCQ) return false;
            if (!incluirComAlertas && row.maiorSeveridade === 'alta') return false;
            return true;
          });

          const total = filtered.length;
          const offset = (page - 1) * limit;
          const data = filtered
            .slice(offset, offset + limit)
            .map(({ maiorSeveridade: _, ...r }) => r);

          const prontos = filtered.filter((r) => r.prontoParaCQ).length;
          const comAlertas = filtered.filter((r) => !r.prontoParaCQ).length;

          return reply.send({
            data,
            meta: { page, limit, total },
            resumo: { prontos, comAlertas },
          });
        }

        // ── Fast path: SQL count + paginated data ──────────────────────────────
        const countQuery = `
          -- @sugestoes-cq-count
          WITH repos_com_etapas AS (
            SELECT
              pr.repositorio_id,
              CASE
                WHEN COUNT(*) FILTER (WHERE pr.marcadores->>'origem' != 'LEGADO') = 0 THEN 'LEGADA'
                WHEN COUNT(*) FILTER (WHERE pr.marcadores->>'origem' = 'LEGADO')  = 0 THEN 'LANCADA'
                ELSE 'MISTA'
              END AS origem
            FROM producao_repositorio pr
            GROUP BY pr.repositorio_id
            HAVING BOOL_OR(pr.etapa = 'PREPARACAO')
               AND BOOL_OR(pr.etapa = 'DIGITALIZACAO')
               AND BOOL_OR(pr.etapa = 'CONFERENCIA')
               AND BOOL_OR(pr.etapa = 'RECONFERENCIA')
          ),
          em_lote_ativo AS (
            SELECT DISTINCT lcqi.repositorio_id
            FROM lotes_controle_qualidade_itens lcqi
            JOIN lotes_controle_qualidade l ON l.id = lcqi.lote_id
            WHERE l.status = 'ABERTO'
          )
          SELECT COUNT(*)::text AS total
          FROM repositorios r
          JOIN repos_com_etapas rce ON rce.repositorio_id = r.id_repositorio_recorda
          WHERE r.status_atual NOT IN ('CQ_APROVADO', 'CQ_REPROVADO', 'EM_ENTREGA', 'ENTREGUE')
            AND r.id_repositorio_recorda NOT IN (SELECT repositorio_id FROM em_lote_ativo)
            ${whereClause}
        `;

        const countResult = await db.query<{ total: string }>(countQuery, sqlParams);
        const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

        const dataParams = [...sqlParams, limit, (page - 1) * limit];
        const dataQuery = `
          -- @sugestoes-cq-data
          WITH repos_com_etapas AS (
            SELECT
              pr.repositorio_id,
              BOOL_OR(pr.etapa = 'PREPARACAO')    AS tem_preparacao,
              BOOL_OR(pr.etapa = 'DIGITALIZACAO') AS tem_digitalizacao,
              BOOL_OR(pr.etapa = 'CONFERENCIA')   AS tem_conferencia,
              BOOL_OR(pr.etapa = 'RECONFERENCIA') AS tem_reconferencia,
              COALESCE(SUM(CASE WHEN pr.etapa = 'DIGITALIZACAO' THEN pr.quantidade ELSE 0 END), 0)::int
                AS total_imagens_digitalizacao,
              MAX(CASE WHEN pr.etapa = 'RECONFERENCIA' THEN pr.data_producao END)
                AS ultima_data_reconferencia,
              CASE
                WHEN COUNT(*) FILTER (WHERE pr.marcadores->>'origem' != 'LEGADO') = 0 THEN 'LEGADA'
                WHEN COUNT(*) FILTER (WHERE pr.marcadores->>'origem' = 'LEGADO')  = 0 THEN 'LANCADA'
                ELSE 'MISTA'
              END AS origem
            FROM producao_repositorio pr
            GROUP BY pr.repositorio_id
            HAVING BOOL_OR(pr.etapa = 'PREPARACAO')
               AND BOOL_OR(pr.etapa = 'DIGITALIZACAO')
               AND BOOL_OR(pr.etapa = 'CONFERENCIA')
               AND BOOL_OR(pr.etapa = 'RECONFERENCIA')
          ),
          em_lote_ativo AS (
            SELECT DISTINCT lcqi.repositorio_id
            FROM lotes_controle_qualidade_itens lcqi
            JOIN lotes_controle_qualidade l ON l.id = lcqi.lote_id
            WHERE l.status = 'ABERTO'
          )
          SELECT
            r.id_repositorio_recorda                AS "repositorioId",
            r.id_repositorio_ged                    AS "repositorioCodigo",
            r.orgao                                 AS "entidade",
            r.etapa_atual                           AS "etapaAtual",
            r.status_atual                          AS "statusAtual",
            rce.tem_preparacao                      AS "temPreparacao",
            rce.tem_digitalizacao                   AS "temDigitalizacao",
            rce.tem_conferencia                     AS "temConferencia",
            rce.tem_reconferencia                   AS "temReconferencia",
            rce.total_imagens_digitalizacao         AS "totalImagensDigitalizacao",
            rce.ultima_data_reconferencia           AS "ultimaDataReconferencia",
            rce.origem                              AS "origem",
            (
              SELECT COALESCE(u.nome, pr2.marcadores->>'colaborador_nome')
              FROM producao_repositorio pr2
              LEFT JOIN usuarios u ON u.id = pr2.usuario_id
              WHERE pr2.repositorio_id = r.id_repositorio_recorda
                AND pr2.etapa = 'RECONFERENCIA'
              ORDER BY pr2.data_producao DESC NULLS LAST
              LIMIT 1
            ) AS "ultimaRespReconferencia"
          FROM repositorios r
          JOIN repos_com_etapas rce ON rce.repositorio_id = r.id_repositorio_recorda
          WHERE r.status_atual NOT IN ('CQ_APROVADO', 'CQ_REPROVADO', 'EM_ENTREGA', 'ENTREGUE')
            AND r.id_repositorio_recorda NOT IN (SELECT repositorio_id FROM em_lote_ativo)
            ${whereClause}
          ORDER BY rce.ultima_data_reconferencia DESC NULLS LAST, r.id_repositorio_ged ASC
          LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `;

        const dataResult = await db.query<SugestaoRawRow>(dataQuery, dataParams);
        const enriched = dataResult.rows.map(enrichSugestaoRow);
        const data = enriched.map(({ maiorSeveridade: _, ...r }) => r);

        // resumo is computed from the full (non-paginated) enriched fast-path dataset;
        // since we are not filtering in JS we must do a secondary aggregation query.
        const resumoQuery = `
          -- @sugestoes-cq-count
          WITH repos_com_etapas AS (
            SELECT
              pr.repositorio_id,
              COALESCE(SUM(CASE WHEN pr.etapa = 'DIGITALIZACAO' THEN pr.quantidade ELSE 0 END), 0)::int
                AS total_imagens_digitalizacao,
              r2.etapa_atual,
              r2.status_atual,
              CASE
                WHEN COUNT(*) FILTER (WHERE pr.marcadores->>'origem' != 'LEGADO') = 0 THEN 'LEGADA'
                WHEN COUNT(*) FILTER (WHERE pr.marcadores->>'origem' = 'LEGADO')  = 0 THEN 'LANCADA'
                ELSE 'MISTA'
              END AS origem
            FROM producao_repositorio pr
            JOIN repositorios r2 ON r2.id_repositorio_recorda = pr.repositorio_id
            GROUP BY pr.repositorio_id, r2.etapa_atual, r2.status_atual
            HAVING BOOL_OR(pr.etapa = 'PREPARACAO')
               AND BOOL_OR(pr.etapa = 'DIGITALIZACAO')
               AND BOOL_OR(pr.etapa = 'CONFERENCIA')
               AND BOOL_OR(pr.etapa = 'RECONFERENCIA')
          ),
          em_lote_ativo AS (
            SELECT DISTINCT lcqi.repositorio_id
            FROM lotes_controle_qualidade_itens lcqi
            JOIN lotes_controle_qualidade l ON l.id = lcqi.lote_id
            WHERE l.status = 'ABERTO'
          )
          SELECT
            COUNT(*) FILTER (WHERE total_imagens_digitalizacao > 0) AS prontos,
            COUNT(*) FILTER (WHERE total_imagens_digitalizacao = 0) AS "comAlertas"
          FROM repos_com_etapas rce
          JOIN repositorios r ON r.id_repositorio_recorda = rce.repositorio_id
          WHERE r.status_atual NOT IN ('CQ_APROVADO', 'CQ_REPROVADO', 'EM_ENTREGA', 'ENTREGUE')
            AND r.id_repositorio_recorda NOT IN (SELECT repositorio_id FROM em_lote_ativo)
            ${whereClause}
        `;

        // Instead of an extra DB round-trip for resumo in the fast path, derive it from
        // a second in-memory pass over the already-enriched current page. For a more
        // accurate resumo we re-use the count query result and run the enriched data page.
        // A simpler and accurate approach: after enrichment, compute resumo from the
        // enriched slice and accept that for large datasets the resumo reflects the
        // full total from DB while prontos/comAlertas are approximated from the enriched page.
        //
        // For correctness across pages we fetch the full resumo row from DB separately.
        const resumoResult = await db.query<{ prontos: string; comAlertas: string }>(
          resumoQuery,
          sqlParams
        );
        const resumoRow = resumoResult.rows[0];
        const prontos = parseInt(resumoRow?.prontos ?? '0', 10);
        const comAlertas = parseInt(resumoRow?.comAlertas ?? '0', 10);

        return reply.send({
          data,
          meta: { page, limit, total },
          resumo: { prontos, comAlertas },
        });
      }
    );
  };
}
