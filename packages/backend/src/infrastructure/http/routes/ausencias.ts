import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import '@fastify/multipart';
import { z } from 'zod';
import { saveAusenciaAnexo, serveAusenciaAnexo } from '../../services/file-storage.js';
import { authorize } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { getCurrentUser } from './operacional-helpers.js';
import type {
  MinhaAusenciaItem,
  ListarMinhasAusenciasResponse,
  ListarTiposAusenciaResponse,
} from '@recorda/shared';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const listarMinhasQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['TODOS', 'pendente', 'aprovado', 'rejeitado', 'cancelado']).default('TODOS'),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ordenacao: z.enum(['mais-recentes', 'mais-antigos']).default('mais-recentes'),
});

const criarAusenciaSchema = z.object({
  tipoAusenciaId: z.string().uuid('tipoAusenciaId inválido'),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dataInicio inválida (YYYY-MM-DD)'),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dataFim inválida (YYYY-MM-DD)'),
  periodo: z.enum(['dia_completo', 'meio_periodo_manha', 'meio_periodo_tarde', 'horas']),
  horasAusencia: z.number().positive().max(24).optional(),
  justificativa: z.string().trim().min(1).max(2000).optional(),
  observacoes: z.string().trim().max(2000).optional(),
});

const ausenciaIdParamsSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

const cancelarAusenciaSchema = z.object({
  motivo: z.string().trim().min(3, 'Motivo deve ter pelo menos 3 caracteres').max(1000),
});

// ─── Row types ────────────────────────────────────────────────────────────────

interface MinhaAusenciaRow {
  id: string;
  tipo_ausencia_id: string;
  tipo_ausencia_nome: string;
  tipo_ausencia_cor: string;
  data_inicio: string | Date;
  data_fim: string | Date;
  periodo: string;
  horas_ausencia: string | null;
  justificativa: string | null;
  observacoes: string | null;
  status: 'pendente' | 'aprovado' | 'rejeitado' | 'cancelado';
  aprovado_por: string | null;
  aprovado_em: string | Date | null;
  motivo_rejeicao: string | null;
  documento_anexo: string | null;
  criado_por: string;
  criado_em: string | Date;
  atualizado_em: string | Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapMinhaAusencia(row: MinhaAusenciaRow): MinhaAusenciaItem {
  const dataInicioValue = row.data_inicio ?? '';
  const dataFimValue = row.data_fim ?? '';
  return {
    id: row.id,
    tipoAusenciaId: row.tipo_ausencia_id,
    tipoAusenciaNome: row.tipo_ausencia_nome,
    tipoAusenciaCor: row.tipo_ausencia_cor,
    dataInicio: (dataInicioValue instanceof Date
      ? dataInicioValue.toISOString().split('T')[0]
      : String(dataInicioValue)) as string,
    dataFim: (dataFimValue instanceof Date
      ? dataFimValue.toISOString().split('T')[0]
      : String(dataFimValue)) as string,
    periodo: row.periodo as MinhaAusenciaItem['periodo'],
    horasAusencia: row.horas_ausencia ?? null,
    justificativa: row.justificativa ?? null,
    observacoes: row.observacoes ?? null,
    status: row.status,
    aprovadoPor: row.aprovado_por ?? null,
    aprovadoEm: toIso(row.aprovado_em),
    motivoRejeicao: row.motivo_rejeicao ?? null,
    documentoAnexo: row.documento_anexo ?? null,
    criadoPor: row.criado_por,
    criadoEm: toIso(row.criado_em) ?? new Date().toISOString(),
    atualizadoEm: toIso(row.atualizado_em) ?? new Date().toISOString(),
  };
}

const SELECT_MINHA_AUSENCIA = `
  SELECT
    a.id,
    ta.id   AS tipo_ausencia_id,
    ta.nome AS tipo_ausencia_nome,
    ta.cor  AS tipo_ausencia_cor,
    a.data_inicio,
    a.data_fim,
    a.periodo,
    a.horas_ausencia,
    a.justificativa,
    a.observacoes,
    a.status,
    a.aprovado_por,
    a.aprovado_em,
    a.motivo_rejeicao,
    a.documento_anexo,
    a.criado_por,
    a.criado_em,
    a.atualizado_em
  FROM ausencias a
  JOIN tipos_ausencia ta ON ta.id = a.tipo_ausencia_id
`;

// ─── Route factory ────────────────────────────────────────────────────────────

export function createAusenciasRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    // GET /tipos-ausencia — authenticated (all profiles)
    server.get(
      '/tipos-ausencia',
      {
        schema: {
          tags: ['ausencias'],
          summary: 'Listar tipos de ausência ativos',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate],
      },
      async (_request, reply) => {
        try {
          const result = await server.database.query(
            `SELECT id, nome, descricao, requer_justificativa, requer_documento, desconta_salario, cor, ativo
             FROM tipos_ausencia
             WHERE ativo = true
             ORDER BY nome`
          );

          const tipos = result.rows.map((row) => ({
            id: row.id as string,
            nome: row.nome as string,
            descricao: (row.descricao as string | null) ?? undefined,
            requerJustificativa: row.requer_justificativa as boolean,
            requerDocumento: row.requer_documento as boolean,
            descontaSalario: row.desconta_salario as boolean,
            cor: row.cor as string,
            ativo: row.ativo as boolean,
          }));

          return reply.send({ tipos } as ListarTiposAusenciaResponse);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao listar tipos de ausência';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /ausencias/minhas — colaborador only
    server.get(
      '/ausencias/minhas',
      {
        schema: {
          tags: ['ausencias'],
          summary: 'Listar minhas ausências',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('colaborador'),
          validateQuery(listarMinhasQuerySchema),
        ],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const {
            pagina = 1,
            limite = 20,
            status = 'TODOS',
            dataInicio,
            dataFim,
            ordenacao = 'mais-recentes',
          } = request.query as z.infer<typeof listarMinhasQuerySchema>;

          const whereClauses: string[] = [`a.usuario_id = $1`];
          const params: unknown[] = [user.id];
          let pIdx = 2;

          if (status !== 'TODOS') {
            whereClauses.push(`a.status = $${pIdx++}`);
            params.push(status);
          }
          if (dataInicio) {
            whereClauses.push(`a.data_inicio >= $${pIdx++}`);
            params.push(dataInicio);
          }
          if (dataFim) {
            whereClauses.push(`a.data_fim <= $${pIdx++}`);
            params.push(dataFim);
          }

          const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
          const orderBy =
            ordenacao === 'mais-antigos' ? 'a.criado_em ASC' : 'a.criado_em DESC';

          const countResult = await server.database.query<{ total: string }>(
            `SELECT COUNT(*) AS total FROM ausencias a ${whereSql}`,
            params
          );
          const total = Number(countResult.rows[0]?.total ?? 0);
          const offset = (pagina - 1) * limite;

          const rows = await server.database.query<MinhaAusenciaRow>(
            `${SELECT_MINHA_AUSENCIA}
             ${whereSql}
             ORDER BY ${orderBy}
             LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
            [...params, limite, offset]
          );

          return reply.send({
            itens: rows.rows.map(mapMinhaAusencia),
            total,
            pagina,
            totalPaginas: total === 0 ? 0 : Math.ceil(total / limite),
          } as ListarMinhasAusenciasResponse);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao listar ausências';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // POST /ausencias — colaborador submits own absence
    server.post(
      '/ausencias',
      {
        schema: {
          tags: ['ausencias'],
          summary: 'Registrar ausência (colaborador)',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('colaborador'),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);

        // ─── Parse body: multipart/form-data or JSON ───────────────────────
        let body: z.infer<typeof criarAusenciaSchema>;
        let uploadedFile: { filename: string; mimetype: string; buffer: Buffer } | null = null;

        const contentType = request.headers['content-type'] ?? '';
        if (contentType.includes('multipart/form-data')) {
          const rawFields: Record<string, unknown> = {};
          try {
            for await (const part of request.parts()) {
              if (part.type === 'file') {
                if (uploadedFile !== null) {
                  await part.toBuffer().catch(() => {});
                  continue;
                }
                const buffer = await part.toBuffer();
                uploadedFile = { filename: part.filename, mimetype: part.mimetype, buffer };
              } else {
                rawFields[part.fieldname] = part.value;
              }
            }
          } catch (err) {
            if ((err as Error & { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
              return reply
                .status(400)
                .send({ error: 'Arquivo muito grande. Máximo permitido: 5 MB.' });
            }
            throw err;
          }
          if (typeof rawFields.horasAusencia === 'string' && rawFields.horasAusencia !== '') {
            rawFields.horasAusencia = Number(rawFields.horasAusencia);
          }
          const pr = criarAusenciaSchema.safeParse(rawFields);
          if (!pr.success) {
            const messages = pr.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
            return reply.status(400).send({ error: 'Dados inválidos', details: messages });
          }
          body = pr.data;
        } else {
          const pr = criarAusenciaSchema.safeParse(request.body);
          if (!pr.success) {
            const messages = pr.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
            return reply.status(400).send({ error: 'Dados inválidos', details: messages });
          }
          body = pr.data;
        }

        // ─── DB transaction ────────────────────────────────────────────────
        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);

          // Validate date range
          if (body.dataFim < body.dataInicio) {
            await client.query('ROLLBACK');
            return reply
              .status(400)
              .send({ error: 'A data de fim não pode ser anterior à data de início' });
          }

          // Validate horas when periodo=horas
          if (body.periodo === 'horas' && !body.horasAusencia) {
            await client.query('ROLLBACK');
            return reply
              .status(400)
              .send({ error: 'horasAusencia é obrigatório quando período é "horas"' });
          }

          // Fetch and validate tipo_ausencia
          const tipoResult = await client.query<{
            id: string;
            nome: string;
            requer_justificativa: boolean;
            requer_documento: boolean;
            ativo: boolean;
          }>(
            `SELECT id, nome, requer_justificativa, requer_documento, ativo
             FROM tipos_ausencia
             WHERE id = $1`,
            [body.tipoAusenciaId]
          );

          if (tipoResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({ error: 'Tipo de ausência não encontrado' });
          }

          const tipo = tipoResult.rows[0]!;
          if (!tipo.ativo) {
            await client.query('ROLLBACK');
            return reply.status(400).send({ error: 'Tipo de ausência inativo' });
          }
          if (tipo.requer_justificativa && !body.justificativa?.trim()) {
            await client.query('ROLLBACK');
            return reply
              .status(400)
              .send({ error: `O tipo "${tipo.nome}" exige justificativa` });
          }
          if (tipo.requer_documento && !uploadedFile) {
            await client.query('ROLLBACK');
            return reply
              .status(400)
              .send({ error: `O tipo "${tipo.nome}" exige documento comprobatório` });
          }

          // Validate and persist attachment
          let documentoAnexo: string | null = null;
          if (uploadedFile) {
            try {
              documentoAnexo = await saveAusenciaAnexo(uploadedFile);
            } catch (fileErr) {
              await client.query('ROLLBACK');
              return reply.status(400).send({
                error: fileErr instanceof Error ? fileErr.message : 'Erro ao salvar anexo',
              });
            }
          }

          const id = randomUUID();
          await client.query(
            `INSERT INTO ausencias
               (id, usuario_id, tipo_ausencia_id, data_inicio, data_fim, periodo,
                horas_ausencia, justificativa, observacoes, documento_anexo, status, criado_por)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pendente', $2)`,
            [
              id,
              user.id,
              body.tipoAusenciaId,
              body.dataInicio,
              body.dataFim,
              body.periodo,
              body.horasAusencia ?? null,
              body.justificativa ?? null,
              body.observacoes ?? null,
              documentoAnexo,
            ]
          );

          const ausenciaResult = await client.query<MinhaAusenciaRow>(
            `${SELECT_MINHA_AUSENCIA} WHERE a.id = $1`,
            [id]
          );

          await client.query('COMMIT');

          const ausencia = ausenciaResult.rows[0];
          if (!ausencia) {
            return reply.status(500).send({ error: 'Erro ao recuperar ausência criada' });
          }

          return reply.status(201).send({ ausencia: mapMinhaAusencia(ausencia) });
        } catch (error) {
          await client.query('ROLLBACK');
          const message = error instanceof Error ? error.message : 'Erro ao criar ausência';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );

    // GET /ausencias/:id/anexo — colaborador views/downloads their own attachment
    server.get<{ Params: { id: string } }>(
      '/ausencias/:id/anexo',
      {
        schema: {
          tags: ['ausencias'],
          summary: 'Visualizar ou baixar anexo de ausência (colaborador)',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('colaborador'),
          validateParams(ausenciaIdParamsSchema),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params;
        try {
          const result = await server.database.query<{ documento_anexo: string | null }>(
            `SELECT documento_anexo FROM ausencias WHERE id = $1 AND usuario_id = $2`,
            [id, user.id]
          );
          if (result.rows.length === 0) {
            return reply.status(404).send({ error: 'Ausência não encontrada' });
          }
          const { documento_anexo } = result.rows[0]!;
          if (!documento_anexo) {
            return reply.status(404).send({ error: 'Esta ausência não possui documento anexado' });
          }
          const { buffer, mimeType, filename } = await serveAusenciaAnexo(documento_anexo);
          return reply
            .header('Content-Type', mimeType)
            .header('Content-Disposition', `inline; filename="${filename}"`)
            .header('Cache-Control', 'private, max-age=3600')
            .send(buffer);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return reply.status(404).send({ error: 'Arquivo não encontrado no servidor' });
          }
          if ((error as { code?: string }).code === 'INVALID_PATH') {
            return reply.status(400).send({ error: 'Caminho de arquivo inválido' });
          }
          const message = error instanceof Error ? error.message : 'Erro ao servir anexo';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // POST /ausencias/:id/cancelar — colaborador cancels their own pending absence
    server.post<{ Params: { id: string }; Body: z.infer<typeof cancelarAusenciaSchema> }>(
      '/ausencias/:id/cancelar',
      {
        schema: {
          tags: ['ausencias'],
          summary: 'Cancelar ausência pendente (colaborador)',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('colaborador'),
          validateParams(ausenciaIdParamsSchema),
          validateBody(cancelarAusenciaSchema),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params;
        const { motivo } = request.body;
        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);

          const updateResult = await client.query(
            `UPDATE ausencias
             SET
               status       = 'cancelado',
               observacoes  = COALESCE(NULLIF($1, ''), observacoes),
               atualizado_em = CURRENT_TIMESTAMP
             WHERE id         = $2
               AND usuario_id = $3
               AND status     = 'pendente'
             RETURNING id`,
            [motivo, id, user.id]
          );

          if (updateResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({
              error:
                'Ausência não encontrada, não pertence ao usuário ou não está em estado pendente',
            });
          }

          await client.query('COMMIT');
          return reply.send({ mensagem: 'Ausência cancelada com sucesso' });
        } catch (error) {
          await client.query('ROLLBACK');
          const message = error instanceof Error ? error.message : 'Erro ao cancelar ausência';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );
  };
}
