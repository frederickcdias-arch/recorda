import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import '@fastify/multipart';
import { saveAusenciaAnexo, serveAusenciaAnexo } from '../../services/file-storage.js';
import type {
  ListarAusenciasAdminParams,
  ListarAusenciasAdminResponse,
  AusenciaAdminItem,
  AprovarAusenciaDTO,
  RejeitarAusenciaDTO,
  CancelarAusenciaAdminDTO,
} from '@recorda/shared';
import { authorize } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { getCurrentUser, toIsoDate } from './operacional-helpers.js';
import { buildLegacyProducaoWhere } from '../../../domain/producao/producao-metrics.js';
import { z } from 'zod';

const ausenciaStatuses = ['TODOS', 'pendente', 'aprovado', 'rejeitado', 'cancelado'] as const;
const ausenciaOrdenacoes = ['mais-recentes', 'mais-antigos'] as const;

const listarAusenciasAdminQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  busca: z.string().trim().optional(),
  status: z.enum(ausenciaStatuses).default('TODOS'),
  tipoAusenciaId: z.string().uuid().optional(),
  usuarioId: z.string().uuid().optional(),
  dataInicio: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dataFim: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  ordenacao: z.enum(ausenciaOrdenacoes).default('mais-recentes'),
});

const aprovarAusenciaSchema = z.object({
  justificativa: z.string().trim().optional(),
});

const rejeitarAusenciaSchema = z.object({
  motivoRejeicao: z.string().trim().min(3).max(1000),
});

const criarAusenciaAdminSchema = z.object({
  usuarioId: z.string().uuid('usuarioId inválido'),
  tipoAusenciaId: z.string().uuid('tipoAusenciaId inválido'),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dataInicio inválida (YYYY-MM-DD)'),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dataFim inválida (YYYY-MM-DD)'),
  periodo: z.enum(['dia_completo', 'meio_periodo_manha', 'meio_periodo_tarde', 'horas']),
  horasAusencia: z.number().positive().max(24).optional(),
  justificativa: z.string().trim().min(1).max(2000).optional(),
  observacoes: z.string().trim().max(2000).optional(),
  status: z.enum(['pendente', 'aprovado']).default('pendente'),
});

const editarAusenciaAdminSchema = criarAusenciaAdminSchema;

const cancelarAusenciaAdminSchema = z.object({
  observacoes: z.string().trim().min(3, 'Observações deve ter pelo menos 3 caracteres').max(1000),
});

function toDateOnlyString(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mapAusenciaAdmin(row: AusenciaAdminRow): AusenciaAdminItem {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    usuarioNome: row.usuario_nome,
    usuarioEmail: row.usuario_email,
    tipoAusenciaId: row.tipo_ausencia_id,
    tipoAusenciaNome: row.tipo_ausencia_nome,
    tipoAusenciaCor: row.tipo_ausencia_cor,
    dataInicio: toDateOnlyString(row.data_inicio),
    dataFim: toDateOnlyString(row.data_fim),
    periodo: row.periodo as unknown as
      | 'dia_completo'
      | 'meio_periodo_manha'
      | 'meio_periodo_tarde'
      | 'horas',
    horasAusencia: row.horas_ausencia ?? null,
    justificativa: row.justificativa ?? null,
    observacoes: row.observacoes ?? null,
    status: row.status,
    aprovadoPor: row.aprovado_por ?? null,
    aprovadoEm: toIsoDate(row.aprovado_em),
    motivoRejeicao: row.motivo_rejeicao ?? null,
    documentoAnexo: row.documento_anexo ?? null,
    criadoPor: row.criado_por,
    criadoEm: toIsoDate(row.criado_em) ?? new Date().toISOString(),
    atualizadoEm: toIsoDate(row.atualizado_em) ?? new Date().toISOString(),
  };
}

interface AusenciaAdminRow {
  id: string;
  usuario_id: string;
  usuario_nome: string;
  usuario_email: string;
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

function buildAusenciasAdminFilters(query: z.infer<typeof listarAusenciasAdminQuerySchema>): {
  whereSql: string;
  params: unknown[];
  paramIndex: number;
} {
  const whereClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (query.busca) {
    whereClauses.push(
      `(u.nome ILIKE $${paramIndex} OR a.justificativa ILIKE $${paramIndex} OR a.observacoes ILIKE $${paramIndex})`
    );
    params.push(`%${query.busca}%`);
    paramIndex += 1;
  }

  if (query.status && query.status !== 'TODOS') {
    whereClauses.push(`a.status = $${paramIndex}`);
    params.push(query.status);
    paramIndex += 1;
  }

  if (query.tipoAusenciaId) {
    whereClauses.push(`a.tipo_ausencia_id = $${paramIndex}`);
    params.push(query.tipoAusenciaId);
    paramIndex += 1;
  }

  if (query.usuarioId) {
    whereClauses.push(`a.usuario_id = $${paramIndex}`);
    params.push(query.usuarioId);
    paramIndex += 1;
  }

  if (query.dataInicio) {
    whereClauses.push(`a.data_inicio >= $${paramIndex}`);
    params.push(query.dataInicio);
    paramIndex += 1;
  }

  if (query.dataFim) {
    whereClauses.push(`a.data_fim <= $${paramIndex}`);
    params.push(query.dataFim);
    paramIndex += 1;
  }

  return {
    whereSql: whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '',
    params,
    paramIndex,
  };
}

function getAusenciasAdminOrderBySql(orderacao: string): string {
  switch (orderacao) {
    case 'mais-antigos':
      return 'a.criado_em ASC';
    default:
      return 'a.criado_em DESC';
  }
}

async function setAuditUser(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  userId: string
): Promise<void> {
  await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
}

async function enviarNotificacaoAusencia(
  server: FastifyInstance,
  adminId: string,
  usuarioId: string,
  titulo: string,
  conteudo: string
): Promise<void> {
  try {
    await server.database.query(
      `WITH ins AS (
         INSERT INTO comunicados (titulo, conteudo, prioridade, escopo_destino, status, criado_por_usuario_id, publicado_em)
         VALUES ($1, $2, 'MEDIA', 'USUARIOS_ESPECIFICOS', 'PUBLICADO', $3, CURRENT_TIMESTAMP)
         RETURNING id
       )
       INSERT INTO comunicado_destinatarios (comunicado_id, usuario_id)
       SELECT ins.id, $4 FROM ins`,
      [titulo, conteudo, adminId, usuarioId]
    );
  } catch {
    // best-effort — do not fail the main action if notification fails
  }
}

interface VincularProducoesBody {
  colaboradorNomeLegado: string;
  usuarioId: string;
}

export function createAdminRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    // GET /admin/colaboradores-legado - Listar colaboradores do sistema legado
    server.get(
      '/admin/colaboradores-legado',
      {
        schema: {
          tags: ['admin'],
          summary: 'Listar colaboradores do sistema legado',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (_request, reply) => {
        try {
          const result = await server.database.query(`
            SELECT
              DISTINCT TRIM(marcadores->>'colaborador_nome') as nome,
              COUNT(*) as total_producoes,
              MIN(data_producao)::date as primeira_producao,
              MAX(data_producao)::date as ultima_producao,
              COUNT(DISTINCT repositorio_id) as total_repositorios,
              ARRAY_AGG(DISTINCT etapa::text) as etapas
            FROM producao_repositorio
            WHERE ${buildLegacyProducaoWhere('producao_repositorio')}
              AND TRIM(marcadores->>'colaborador_nome') != ''
            GROUP BY TRIM(marcadores->>'colaborador_nome')
            ORDER BY total_producoes DESC
          `);

          return reply.send(result.rows);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao buscar colaboradores do legado';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /admin/usuarios-colaboradores - Listar usuários com perfil colaborador
    server.get(
      '/admin/usuarios-colaboradores',
      {
        schema: {
          tags: ['admin'],
          summary: 'Listar usuários colaboradores',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (_request, reply) => {
        try {
          const result = await server.database.query(`
            SELECT
              u.id,
              u.nome,
              u.email,
              u.perfil,
              u.ativo,
              COUNT(pr.id) as total_producoes_vinculadas,
              c.nome as coordenadoria_nome,
              c.sigla as coordenadoria_sigla
            FROM usuarios u
            LEFT JOIN producao_repositorio pr ON pr.usuario_id = u.id
            LEFT JOIN coordenadorias c ON c.id = u.coordenadoria_id
            WHERE u.perfil IN ('colaborador', 'operador', 'administrador')
            GROUP BY u.id, u.nome, u.email, u.perfil, u.ativo, c.nome, c.sigla
            ORDER BY u.nome
          `);

          return reply.send(result.rows);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao buscar usuários colaboradores';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // POST /admin/vincular-producoes - Vincular produções legadas a usuário colaborador
    server.post<{ Body: VincularProducoesBody }>(
      '/admin/vincular-producoes',
      {
        schema: {
          tags: ['admin'],
          summary: 'Vincular produções legadas a um usuário colaborador',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            required: ['colaboradorNomeLegado', 'usuarioId'],
            properties: {
              colaboradorNomeLegado: { type: 'string' },
              usuarioId: { type: 'string' },
            },
          },
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { colaboradorNomeLegado, usuarioId } = request.body;
          const adminUser = getCurrentUser(request);

          // Validar que o usuário existe e é colaborador
          const userCheck = await server.database.query(
            `SELECT id, nome, perfil FROM usuarios WHERE id = $1`,
            [usuarioId]
          );

          if (userCheck.rows.length === 0) {
            return reply.status(404).send({ error: 'Usuário não encontrado' });
          }

          const usuario = userCheck.rows[0];
          if (!usuario || usuario.perfil !== 'colaborador') {
            return reply.status(400).send({ error: 'O usuário selecionado não é um colaborador' });
          }

          // Contar produções que serão vinculadas
          const countResult = await server.database.query(
            `SELECT COUNT(*) as total
             FROM producao_repositorio
             WHERE LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER($1)
               AND ${buildLegacyProducaoWhere('pr')}`,
            [colaboradorNomeLegado]
          );

          const totalProducoes = Number(countResult.rows[0]?.total ?? 0);

          if (totalProducoes === 0) {
            return reply.status(404).send({
              error: 'Nenhuma produção encontrada para este colaborador no sistema legado',
            });
          }

          // Executar vinculação
          const updateResult = await server.database.query(
            `UPDATE producao_repositorio
             SET usuario_id = $1
             WHERE LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER($2)
               AND ${buildLegacyProducaoWhere('pr')}
             RETURNING id`,
            [usuarioId, colaboradorNomeLegado]
          );

          const vinculadas = updateResult.rowCount ?? 0;

          request.log.info(
            {
              admin: adminUser.id,
              colaboradorLegado: colaboradorNomeLegado,
              usuarioId,
              vinculadas,
            },
            'Produções legadas vinculadas a colaborador'
          );

          return reply.send({
            sucesso: true,
            colaboradorLegado: colaboradorNomeLegado,
            usuarioNome: usuario.nome,
            producoesVinculadas: vinculadas,
            mensagem: `${vinculadas} produções vinculadas com sucesso ao colaborador ${usuario.nome}`,
          });
        } catch (error) {
          request.log.error(error);
          const message = error instanceof Error ? error.message : 'Erro ao vincular produções';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /admin/preview-vinculacao/:colaboradorNome/:usuarioId - Preview da vinculação
    server.get<{ Params: { colaboradorNome: string; usuarioId: string } }>(
      '/admin/preview-vinculacao/:colaboradorNome/:usuarioId',
      {
        schema: {
          tags: ['admin'],
          summary: 'Preview de vinculação de produções',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { colaboradorNome, usuarioId } = request.params;

          const result = await server.database.query(
            `
            SELECT
              pr.data_producao::date as data,
              pr.etapa,
              COUNT(*) as registros,
              SUM(pr.quantidade) as quantidade_total,
              ARRAY_AGG(DISTINCT r.id_repositorio_ged) as repositorios
            FROM producao_repositorio pr
            JOIN repositorios r ON r.id_repositorio_recorda = pr.repositorio_id
            WHERE LOWER(TRIM(pr.marcadores->>'colaborador_nome')) = LOWER($1)
              AND ${buildLegacyProducaoWhere('pr')}
            GROUP BY pr.data_producao::date, pr.etapa
            ORDER BY pr.data_producao::date DESC, pr.etapa
            LIMIT 100
          `,
            [decodeURIComponent(colaboradorNome)]
          );

          const userResult = await server.database.query(
            `SELECT nome, email FROM usuarios WHERE id = $1`,
            [usuarioId]
          );

          return reply.send({
            colaboradorLegado: decodeURIComponent(colaboradorNome),
            usuario: userResult.rows[0] || null,
            preview: result.rows,
            totalRegistros: result.rows.reduce((acc, r) => acc + Number(r.registros), 0),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao gerar preview';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // POST /admin/limpar-duplicatas-producao - Remove duplicate production records
    server.post(
      '/admin/limpar-duplicatas-producao',
      {
        schema: {
          tags: ['admin'],
          summary: 'Remover duplicatas de produção',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (_request, reply) => {
        try {
          // Find and remove duplicates based on comprehensive criteria
          const duplicatesResult = await server.database.query(`
          WITH duplicates AS (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY
                usuario_id,
                repositorio_id,
                DATE(data_producao AT TIME ZONE 'America/Cuiaba'),
                etapa,
                quantidade,
                COALESCE(marcadores->>'tipo', ''),
                COALESCE(marcadores->>'funcao', ''),
                COALESCE(marcadores->>'coordenadoria', ''),
                COALESCE(marcadores->>'colaborador_nome', '')
              ORDER BY criado_em DESC
            ) as rn
            FROM producao_repositorio
          )
          DELETE FROM producao_repositorio
          WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)
          RETURNING id
        `);

          const removidos = duplicatesResult.rowCount;

          return reply.send({
            removidos,
            mensagem: `${removidos} duplicatas removidas com sucesso.`,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao limpar duplicatas de produção';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // POST /admin/limpar-duplicatas-recebimento - Remove duplicate receiving records
    server.post(
      '/admin/limpar-duplicatas-recebimento',
      {
        schema: {
          tags: ['admin'],
          summary: 'Remover duplicatas de recebimento',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (_request, reply) => {
        try {
          // Remove duplicate processos
          const processosResult = await server.database.query(`
          WITH duplicates AS (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY protocolo, repositorio_id
              ORDER BY criado_em DESC
            ) as rn
            FROM recebimento_processos
          )
          DELETE FROM recebimento_processos
          WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)
          RETURNING id
        `);

          // Remove duplicate volumes
          const volumesResult = await server.database.query(`
          WITH duplicates AS (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY processo_id, numero
              ORDER BY criado_em DESC
            ) as rn
            FROM recebimento_volumes
          )
          DELETE FROM recebimento_volumes
          WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)
          RETURNING id
        `);

          // Remove duplicate apensos
          const apensosResult = await server.database.query(`
          WITH duplicates AS (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY processo_principal_id, protocolo_apenso
              ORDER BY criado_em DESC
            ) as rn
            FROM recebimento_apensos
          )
          DELETE FROM recebimento_apensos
          WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)
          RETURNING id
        `);

          const removidos =
            (processosResult.rowCount || 0) +
            (volumesResult.rowCount || 0) +
            (apensosResult.rowCount || 0);

          return reply.send({
            removidos,
            detalhes: {
              processos: processosResult.rowCount || 0,
              volumes: volumesResult.rowCount || 0,
              apensos: apensosResult.rowCount || 0,
            },
            mensagem: `${removidos} duplicatas removidas com sucesso.`,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao limpar duplicatas de recebimento';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // POST /admin/recontar-producao - Recount production statistics
    server.post(
      '/admin/recontar-producao',
      {
        schema: {
          tags: ['admin'],
          summary: 'Recontar estatísticas de produção',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (_request, reply) => {
        try {
          // Update materialized views or refresh statistics
          await server.database.query('ANALYZE producao_repositorio');
          await server.database.query('ANALYZE repositorios');
          await server.database.query('ANALYZE usuarios');

          // Get current statistics
          const statsResult = await server.database.query(`
          SELECT
            COUNT(*) as total_registros,
            COUNT(DISTINCT usuario_id) as usuarios_unicos,
            COUNT(DISTINCT repositorio_id) as repositorios_unicos,
            COUNT(DISTINCT DATE(data_producao AT TIME ZONE 'America/Cuiaba')) as dias_unicos,
            MIN(data_producao) as data_primeira,
            MAX(data_producao) as data_ultima
          FROM producao_repositorio
        `);

          const stats = statsResult.rows[0]!;

          return reply.send({
            total: stats.total_registros,
            usuarios: stats.usuarios_unicos,
            repositorios: stats.repositorios_unicos,
            dias: stats.dias_unicos,
            periodo: {
              inicio: stats.data_primeira,
              fim: stats.data_ultima,
            },
            mensagem: 'Recontagem concluída com sucesso.',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao recontar produção';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // POST /admin/otimizar-banco - Optimize database performance
    server.post(
      '/admin/otimizar-banco',
      {
        schema: {
          tags: ['admin'],
          summary: 'Otimizar banco de dados',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);

          // Analyze all tables to update statistics
          const tables = [
            'usuarios',
            'repositorios',
            'producao_repositorio',
            'recebimento_processos',
            'recebimento_volumes',
            'recebimento_apensos',
            'checklists',
            'checklist_itens',
            'lotes_cq',
            'lotes_cq_itens',
            'importacoes_legado_operacional',
            'fontes_importacao',
          ];

          const results: Array<{ table: string; status: string; error?: string }> = [];

          for (const table of tables) {
            try {
              await server.database.query(`ANALYZE ${table}`);
              results.push({ table, status: 'ok' });
            } catch (error) {
              results.push({
                table,
                status: 'error',
                error: error instanceof Error ? error.message : 'Erro desconhecido',
              });
            }
          }

          // Reindex if needed (optional, can be expensive)
          // await server.database.query('REINDEX DATABASE');

          // Log the optimization
          await server.database.query(
            `
          INSERT INTO auditoria (
            tabela,
            registro_id,
            operacao,
            usuario_id,
            ip_origem,
            user_agent,
            dados_anteriores,
            dados_novos
          )
          VALUES (
            'sistema',
            $1,
            'UPDATE',
            $1,
            $2,
            $3,
            NULL,
            jsonb_build_object('acao', 'otimizar_banco')
          )
        `,
            [user.id, request.ip, request.headers['user-agent'] || '']
          );

          return reply.send({
            tabelas: results,
            sucesso: results.filter((r) => r.status === 'ok').length,
            erros: results.filter((r) => r.status === 'error').length,
            mensagem: 'Otimização concluída.',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao otimizar banco';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /admin/ausencias - Listar ausências pendentes e históricas
    server.get<{ Querystring: ListarAusenciasAdminParams }>(
      '/admin/ausencias',
      {
        schema: {
          tags: ['admin'],
          summary: 'Listar ausências para acompanhamento e decisão administrativa',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateQuery(listarAusenciasAdminQuerySchema),
        ],
      },
      async (request, reply) => {
        try {
          const {
            pagina = 1,
            limite = 20,
            ordenacao = 'mais-recentes',
          } = request.query as z.infer<typeof listarAusenciasAdminQuerySchema>;
          const { whereSql, params, paramIndex } = buildAusenciasAdminFilters(
            request.query as z.infer<typeof listarAusenciasAdminQuerySchema>
          );

          const countResult = await server.database.query<{ total: string }>(
            `SELECT COUNT(*) as total
             FROM ausencias a
             JOIN usuarios u ON u.id = a.usuario_id
             JOIN tipos_ausencia ta ON ta.id = a.tipo_ausencia_id
             ${whereSql}`,
            params
          );

          const total = Number(countResult.rows[0]?.total ?? 0);
          const offset = (pagina - 1) * limite;
          const orderBySql = getAusenciasAdminOrderBySql(ordenacao);
          const rows = await server.database.query<AusenciaAdminRow>(
            `SELECT
               a.id,
               a.usuario_id,
               u.nome as usuario_nome,
               u.email as usuario_email,
               ta.id as tipo_ausencia_id,
               ta.nome as tipo_ausencia_nome,
               ta.cor as tipo_ausencia_cor,
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
             JOIN usuarios u ON u.id = a.usuario_id
             JOIN tipos_ausencia ta ON ta.id = a.tipo_ausencia_id
             ${whereSql}
             ORDER BY ${orderBySql}
             LIMIT $${paramIndex}
             OFFSET $${paramIndex + 1}`,
            [...params, limite, offset]
          );

          return reply.send({
            itens: rows.rows.map(mapAusenciaAdmin),
            total,
            pagina,
            totalPaginas: total === 0 ? 0 : Math.ceil(total / limite),
          } as ListarAusenciasAdminResponse);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao listar ausências';
          return reply.status(500).send({ error: message });
        }
      }
    );

    server.post<{ Params: { id: string }; Body: AprovarAusenciaDTO }>(
      '/admin/ausencias/:id/aprovar',
      {
        schema: {
          tags: ['admin'],
          summary: 'Aprovar uma ausência pendente com justificativa administrativa',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateParams(z.object({ id: z.string().uuid() })),
          validateBody(aprovarAusenciaSchema),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params;
        const { justificativa } = request.body as AprovarAusenciaDTO;
        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await setAuditUser(client, user.id);

          const updateResult = await client.query(
            `UPDATE ausencias
             SET
               status = 'aprovado',
               aprovado_por = $1,
               aprovado_em = CURRENT_TIMESTAMP,
               justificativa = COALESCE(NULLIF($2, ''), justificativa),
               motivo_rejeicao = NULL,
               atualizado_em = CURRENT_TIMESTAMP
             WHERE id = $3
               AND status = 'pendente'
             RETURNING id`,
            [user.id, justificativa ?? null, id]
          );

          if (updateResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply
              .status(404)
              .send({ error: 'Ausência não encontrada ou não está em estado pendente' });
          }

          const result = await client.query<AusenciaAdminRow>(
            `SELECT
               a.id,
               a.usuario_id,
               u.nome as usuario_nome,
               u.email as usuario_email,
               ta.id as tipo_ausencia_id,
               ta.nome as tipo_ausencia_nome,
               ta.cor as tipo_ausencia_cor,
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
             JOIN usuarios u ON u.id = a.usuario_id
             JOIN tipos_ausencia ta ON ta.id = a.tipo_ausencia_id
             WHERE a.id = $1`,
            [id]
          );

          if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({ error: 'Ausência não encontrada após a atualização' });
          }

          const updatedAusencia = result.rows[0];
          if (!updatedAusencia) {
            await client.query('ROLLBACK');
            return reply.status(404).send({ error: 'Ausência não encontrada após a atualização' });
          }

          await client.query('COMMIT');

          void enviarNotificacaoAusencia(
            server,
            user.id,
            updatedAusencia.usuario_id,
            'Ausência aprovada',
            `Sua solicitação de ausência (${updatedAusencia.tipo_ausencia_nome}) foi aprovada.`
          );

          return reply.send({ ausencia: mapAusenciaAdmin(updatedAusencia) });
        } catch (error) {
          await client.query('ROLLBACK');
          const message = error instanceof Error ? error.message : 'Erro ao aprovar ausência';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );

    server.post<{ Params: { id: string }; Body: RejeitarAusenciaDTO }>(
      '/admin/ausencias/:id/rejeitar',
      {
        schema: {
          tags: ['admin'],
          summary: 'Rejeitar uma ausência pendente com motivo de rejeição',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateParams(z.object({ id: z.string().uuid() })),
          validateBody(rejeitarAusenciaSchema),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params;
        const { motivoRejeicao } = request.body as RejeitarAusenciaDTO;
        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await setAuditUser(client, user.id);

          const updateResult = await client.query(
            `UPDATE ausencias
             SET
               status = 'rejeitado',
               aprovado_por = $1,
               aprovado_em = CURRENT_TIMESTAMP,
               motivo_rejeicao = $2,
               atualizado_em = CURRENT_TIMESTAMP
             WHERE id = $3
               AND status = 'pendente'
             RETURNING id`,
            [user.id, motivoRejeicao, id]
          );

          if (updateResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply
              .status(404)
              .send({ error: 'Ausência não encontrada ou não está em estado pendente' });
          }

          const result = await client.query<AusenciaAdminRow>(
            `SELECT
               a.id,
               a.usuario_id,
               u.nome as usuario_nome,
               u.email as usuario_email,
               ta.id as tipo_ausencia_id,
               ta.nome as tipo_ausencia_nome,
               ta.cor as tipo_ausencia_cor,
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
             JOIN usuarios u ON u.id = a.usuario_id
             JOIN tipos_ausencia ta ON ta.id = a.tipo_ausencia_id
             WHERE a.id = $1`,
            [id]
          );

          if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({ error: 'Ausência não encontrada após a atualização' });
          }

          const updatedAusencia = result.rows[0];
          if (!updatedAusencia) {
            await client.query('ROLLBACK');
            return reply.status(404).send({ error: 'Ausência não encontrada após a atualização' });
          }

          await client.query('COMMIT');

          void enviarNotificacaoAusencia(
            server,
            user.id,
            updatedAusencia.usuario_id,
            'Ausência rejeitada',
            `Sua solicitação de ausência (${updatedAusencia.tipo_ausencia_nome}) foi rejeitada. Motivo: ${motivoRejeicao}`
          );

          return reply.send({ ausencia: mapAusenciaAdmin(updatedAusencia) });
        } catch (error) {
          await client.query('ROLLBACK');
          const message = error instanceof Error ? error.message : 'Erro ao rejeitar ausência';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );

    // POST /admin/ausencias — admin creates an absence for a collaborator
    server.post(
      '/admin/ausencias',
      {
        schema: {
          tags: ['admin'],
          summary: 'Criar ausência para um colaborador (administrador)',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        const adminUser = getCurrentUser(request);

        // ─── Parse body: multipart/form-data or JSON ───────────────────────
        let body: z.infer<typeof criarAusenciaAdminSchema>;
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
          const pr = criarAusenciaAdminSchema.safeParse(rawFields);
          if (!pr.success) {
            const messages = pr.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
            return reply.status(400).send({ error: 'Dados inválidos', details: messages });
          }
          body = pr.data;
        } else {
          const pr = criarAusenciaAdminSchema.safeParse(request.body);
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
          await setAuditUser(client, adminUser.id);

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

          // Verify target user exists and is colaborador
          const userCheck = await client.query<{ id: string; perfil: string; nome: string }>(
            `SELECT id, perfil, nome FROM usuarios WHERE id = $1`,
            [body.usuarioId]
          );
          if (userCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({ error: 'Usuário não encontrado' });
          }
          const targetUser = userCheck.rows[0]!;
          if (targetUser.perfil === 'visualizador') {
            await client.query('ROLLBACK');
            return reply
              .status(400)
              .send({ error: 'O usuário selecionado não possui perfil de colaborador' });
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
            return reply.status(400).send({ error: `O tipo "${tipo.nome}" exige justificativa` });
          }
          // Admin exception: requer_documento waived only when observacoes is provided
          if (tipo.requer_documento && !uploadedFile && !body.observacoes?.trim()) {
            await client.query('ROLLBACK');
            return reply.status(400).send({
              error: `O tipo "${tipo.nome}" exige documento comprobatório ou observação justificando a ausência do anexo`,
            });
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

          const status = body.status ?? 'pendente';
          const id = randomUUID();

          await client.query(
            `INSERT INTO ausencias
               (id, usuario_id, tipo_ausencia_id, data_inicio, data_fim, periodo,
                horas_ausencia, justificativa, observacoes, documento_anexo, status,
                aprovado_por, aprovado_em, criado_por)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               $12, $13, $14)`,
            [
              id,
              body.usuarioId,
              body.tipoAusenciaId,
              body.dataInicio,
              body.dataFim,
              body.periodo,
              body.horasAusencia ?? null,
              body.justificativa ?? null,
              body.observacoes ?? null,
              documentoAnexo,
              status,
              status === 'aprovado' ? adminUser.id : null,
              status === 'aprovado' ? new Date() : null,
              adminUser.id,
            ]
          );

          const ausenciaResult = await client.query<AusenciaAdminRow>(
            `SELECT
               a.id,
               a.usuario_id,
               u.nome  AS usuario_nome,
               u.email AS usuario_email,
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
             JOIN usuarios u        ON u.id  = a.usuario_id
             JOIN tipos_ausencia ta ON ta.id = a.tipo_ausencia_id
             WHERE a.id = $1`,
            [id]
          );

          await client.query('COMMIT');

          const ausencia = ausenciaResult.rows[0];
          if (!ausencia) {
            return reply.status(500).send({ error: 'Erro ao recuperar ausência criada' });
          }

          return reply.status(201).send({ ausencia: mapAusenciaAdmin(ausencia) });
        } catch (error) {
          await client.query('ROLLBACK');
          const message = error instanceof Error ? error.message : 'Erro ao criar ausência';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );

    // POST /admin/ausencias/:id/cancelar — admin cancels an absence (pendente or aprovado)
    server.put(
      '/admin/ausencias/:id',
      {
        schema: {
          tags: ['admin'],
          summary: 'Editar ausencia de um colaborador (administrador)',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        const adminUser = getCurrentUser(request);
        const { id } = request.params as { id: string };

        let body: z.infer<typeof editarAusenciaAdminSchema>;
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
              return reply.status(400).send({ error: 'Arquivo muito grande. Maximo permitido: 5 MB.' });
            }
            throw err;
          }
          if (typeof rawFields.horasAusencia === 'string' && rawFields.horasAusencia !== '') {
            rawFields.horasAusencia = Number(rawFields.horasAusencia);
          }
          const pr = editarAusenciaAdminSchema.safeParse(rawFields);
          if (!pr.success) {
            const messages = pr.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
            return reply.status(400).send({ error: 'Dados invalidos', details: messages });
          }
          body = pr.data;
        } else {
          const pr = editarAusenciaAdminSchema.safeParse(request.body);
          if (!pr.success) {
            const messages = pr.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
            return reply.status(400).send({ error: 'Dados invalidos', details: messages });
          }
          body = pr.data;
        }

        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await setAuditUser(client, adminUser.id);

          const atualResult = await client.query<{ id: string; status: string; documento_anexo: string | null }>(
            `SELECT id, status, documento_anexo FROM ausencias WHERE id = $1`,
            [id]
          );
          if (atualResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({ error: 'Ausencia nao encontrada' });
          }

          const atual = atualResult.rows[0]!;
          if (atual.status === 'cancelado') {
            await client.query('ROLLBACK');
            return reply.status(400).send({ error: 'Ausencia cancelada nao pode ser editada' });
          }

          if (body.dataFim < body.dataInicio) {
            await client.query('ROLLBACK');
            return reply.status(400).send({ error: 'A data de fim nao pode ser anterior a data de inicio' });
          }
          if (body.periodo === 'horas' && !body.horasAusencia) {
            await client.query('ROLLBACK');
            return reply.status(400).send({ error: 'horasAusencia e obrigatorio quando periodo e "horas"' });
          }

          const userCheck = await client.query<{ id: string; perfil: string }>(
            `SELECT id, perfil FROM usuarios WHERE id = $1`,
            [body.usuarioId]
          );
          if (userCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({ error: 'Usuario nao encontrado' });
          }
          const targetUser = userCheck.rows[0]!;
          if (targetUser.perfil === 'visualizador') {
            await client.query('ROLLBACK');
            return reply.status(400).send({ error: 'O usuario selecionado nao pode receber lancamento de ausencia' });
          }

          const tipoResult = await client.query<{
            id: string;
            nome: string;
            requer_justificativa: boolean;
            requer_documento: boolean;
            ativo: boolean;
          }>(
            `SELECT id, nome, requer_justificativa, requer_documento, ativo FROM tipos_ausencia WHERE id = $1`,
            [body.tipoAusenciaId]
          );
          if (tipoResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({ error: 'Tipo de ausencia nao encontrado' });
          }
          const tipo = tipoResult.rows[0]!;
          if (!tipo.ativo) {
            await client.query('ROLLBACK');
            return reply.status(400).send({ error: 'Tipo de ausencia inativo' });
          }
          if (tipo.requer_justificativa && !body.justificativa?.trim()) {
            await client.query('ROLLBACK');
            return reply.status(400).send({ error: `O tipo "${tipo.nome}" exige justificativa` });
          }
          if (tipo.requer_documento && !uploadedFile && !atual.documento_anexo && !body.observacoes?.trim()) {
            await client.query('ROLLBACK');
            return reply.status(400).send({
              error: `O tipo "${tipo.nome}" exige documento comprobatorio ou observacao justificando a ausencia do anexo`,
            });
          }

          let documentoAnexo = atual.documento_anexo;
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

          await client.query(
            `UPDATE ausencias
             SET usuario_id = $1::uuid,
                 tipo_ausencia_id = $2::uuid,
                 data_inicio = $3::date,
                 data_fim = $4::date,
                 periodo = $5::text,
                 horas_ausencia = $6::numeric,
                 justificativa = $7::text,
                 observacoes = $8::text,
                 documento_anexo = $9::text,
                 status = $10::text,
                 aprovado_por = CASE WHEN $10::text = 'aprovado' THEN COALESCE(aprovado_por, $11::uuid) ELSE NULL::uuid END,
                 aprovado_em = CASE WHEN $10::text = 'aprovado' THEN COALESCE(aprovado_em, CURRENT_TIMESTAMP) ELSE NULL::timestamptz END,
                 motivo_rejeicao = CASE WHEN $10::text = 'pendente' THEN NULL::text ELSE motivo_rejeicao END,
                 atualizado_em = CURRENT_TIMESTAMP
             WHERE id = $12::uuid`,
            [
              body.usuarioId,
              body.tipoAusenciaId,
              body.dataInicio,
              body.dataFim,
              body.periodo,
              body.periodo === 'horas' ? body.horasAusencia ?? null : null,
              body.justificativa ?? null,
              body.observacoes ?? null,
              documentoAnexo,
              body.status ?? 'pendente',
              adminUser.id,
              id,
            ]
          );

          const ausenciaResult = await client.query<AusenciaAdminRow>(
            `SELECT
               a.id, a.usuario_id, u.nome AS usuario_nome, u.email AS usuario_email,
               ta.id AS tipo_ausencia_id, ta.nome AS tipo_ausencia_nome, ta.cor AS tipo_ausencia_cor,
               a.data_inicio, a.data_fim, a.periodo, a.horas_ausencia, a.justificativa,
               a.observacoes, a.status, a.aprovado_por, a.aprovado_em, a.motivo_rejeicao,
               a.documento_anexo, a.criado_por, a.criado_em, a.atualizado_em
             FROM ausencias a
             JOIN usuarios u ON u.id = a.usuario_id
             JOIN tipos_ausencia ta ON ta.id = a.tipo_ausencia_id
             WHERE a.id = $1`,
            [id]
          );

          await client.query('COMMIT');
          const ausencia = ausenciaResult.rows[0];
          if (!ausencia) {
            return reply.status(500).send({ error: 'Erro ao recuperar ausencia atualizada' });
          }

          return reply.send({ ausencia: mapAusenciaAdmin(ausencia) });
        } catch (error) {
          await client.query('ROLLBACK');
          const message = error instanceof Error ? error.message : 'Erro ao editar ausencia';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );

    server.post<{ Params: { id: string }; Body: CancelarAusenciaAdminDTO }>(
      '/admin/ausencias/:id/cancelar',
      {
        schema: {
          tags: ['admin'],
          summary: 'Cancelar ausência (administrador)',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateParams(z.object({ id: z.string().uuid() })),
          validateBody(cancelarAusenciaAdminSchema),
        ],
      },
      async (request, reply) => {
        const adminUser = getCurrentUser(request);
        const { id } = request.params;
        const { observacoes } = request.body as CancelarAusenciaAdminDTO;
        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await setAuditUser(client, adminUser.id);

          const updateResult = await client.query(
            `UPDATE ausencias
             SET
               status        = 'cancelado',
               observacoes   = COALESCE(NULLIF($1, ''), observacoes),
               atualizado_em = CURRENT_TIMESTAMP
             WHERE id     = $2
               AND status IN ('pendente', 'aprovado')
             RETURNING id`,
            [observacoes, id]
          );

          if (updateResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(404).send({
              error:
                'Ausência não encontrada ou não pode ser cancelada neste estado (apenas pendente ou aprovada)',
            });
          }

          const ausenciaResult = await client.query<AusenciaAdminRow>(
            `SELECT
               a.id,
               a.usuario_id,
               u.nome  AS usuario_nome,
               u.email AS usuario_email,
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
             JOIN usuarios u        ON u.id  = a.usuario_id
             JOIN tipos_ausencia ta ON ta.id = a.tipo_ausencia_id
             WHERE a.id = $1`,
            [id]
          );

          await client.query('COMMIT');

          const ausencia = ausenciaResult.rows[0];
          if (!ausencia) {
            return reply.status(500).send({ error: 'Erro ao recuperar ausência atualizada' });
          }

          void enviarNotificacaoAusencia(
            server,
            adminUser.id,
            ausencia.usuario_id,
            'Ausência cancelada',
            `Sua solicitação de ausência (${ausencia.tipo_ausencia_nome}) foi cancelada pela administração.`
          );

          return reply.send({ ausencia: mapAusenciaAdmin(ausencia) });
        } catch (error) {
          await client.query('ROLLBACK');
          const message = error instanceof Error ? error.message : 'Erro ao cancelar ausência';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );

    // GET /admin/ausencias/:id/anexo — admin views/downloads any absence attachment
    server.get<{ Params: { id: string } }>(
      '/admin/ausencias/:id/anexo',
      {
        schema: {
          tags: ['admin'],
          summary: 'Visualizar ou baixar anexo de ausência (administrador)',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateParams(z.object({ id: z.string().uuid() })),
        ],
      },
      async (request, reply) => {
        const { id } = request.params;
        try {
          const result = await server.database.query<{ documento_anexo: string | null }>(
            `SELECT documento_anexo FROM ausencias WHERE id = $1`,
            [id]
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

    // GET /admin/health-check - Comprehensive system health check
    server.get(
      '/admin/health-check',
      {
        schema: {
          tags: ['admin'],
          summary: 'Verificação de saúde do sistema',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (_request, reply) => {
        try {
          const health = {
            database: 'ok',
            tables: {} as Record<string, any>,
            timestamp: new Date().toISOString(),
          };

          // Check table counts and recent activity
          const tables = [
            { name: 'usuarios', critical: true },
            { name: 'repositorios', critical: true },
            { name: 'producao_repositorio', critical: false },
            { name: 'recebimento_processos', critical: false },
          ];

          for (const table of tables) {
            try {
              const countResult = await server.database.query(`
              SELECT COUNT(*) as count, MAX(criado_em) as last_activity
              FROM ${table.name}
            `);

              const stats = countResult.rows[0]!;
              health.tables[table.name] = {
                count: parseInt(stats.count),
                last_activity: stats.last_activity,
                status: 'ok',
              };
            } catch (error) {
              health.tables[table.name] = {
                status: 'error',
                error: error instanceof Error ? error.message : 'Erro desconhecido',
              };
              if (table.critical) {
                health.database = 'error';
              }
            }
          }

          return reply.send(health);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro na verificação de saúde';
          return reply.status(500).send({ error: message });
        }
      }
    );
  };
}
