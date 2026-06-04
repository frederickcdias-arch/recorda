import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type {
  Comunicado,
  ComunicadoAdminDestinatarioItem,
  ComunicadoAdminResumo,
  ComunicadoAdminDetalhe,
  ComunicadoDestinatario,
  ComunicadoUsuarioItem,
  CriarComunicadoDTO,
  AtualizarComunicadoDTO,
  ExcluirComunicadoResponse,
  ListarComunicadosAdminParams,
  ListarComunicadosAdminResponse,
  ListarComunicadosUsuarioResponse,
  MarcarComunicadoLidoResponse,
  ObterComunicadoAdminResponse,
  PublicarComunicadoDTO,
} from '@recorda/shared';
import { authorize } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { getCurrentUser, toIsoDate } from './operacional-helpers.js';

const prioridades = ['BAIXA', 'MEDIA', 'ALTA'] as const;
const escoposDestino = ['TODOS', 'USUARIOS_ESPECIFICOS'] as const;
const tiposComunicado = [
  'COMUNICADO_GERAL',
  'COMUNICADO_IMPORTANTE',
  'DECISAO_OPERACIONAL',
  'PADRONIZACAO',
  'SISTEMA',
  'TREINAMENTO',
  'BLOG_INTERNO',
] as const;
const categoriasComunicado = [
  'PRODUCAO',
  'DIGITALIZACAO',
  'CONFERENCIA',
  'RECONFERENCIA',
  'QUALIDADE',
  'ADMINISTRATIVO',
  'SISTEMA',
  'GERAL',
] as const;
const statusComunicado = ['RASCUNHO', 'PUBLICADO', 'ENCERRADO'] as const;
const ordenacoesAdmin = ['mais-recentes', 'mais-antigos', 'mais-pendentes', 'mais-lidos'] as const;

const criarComunicadoSchema = z.object({
  titulo: z.string().trim().min(3).max(200),
  conteudo: z.string().trim().min(1),
  prioridade: z.enum(prioridades),
  escopoDestino: z.enum(escoposDestino),
  tipo: z.enum(tiposComunicado).optional(),
  categoria: z.enum(categoriasComunicado).optional(),
  resumo: z.string().trim().max(400).optional(),
  fixado: z.boolean().optional(),
  leituraObrigatoria: z.boolean().optional(),
});

const atualizarComunicadoSchema = z.object({
  titulo: z.string().trim().min(3).max(200).optional(),
  conteudo: z.string().trim().min(1).optional(),
  prioridade: z.enum(prioridades).optional(),
  escopoDestino: z.enum(escoposDestino).optional(),
  tipo: z.enum(tiposComunicado).optional(),
  categoria: z.enum(categoriasComunicado).optional(),
  resumo: z.string().trim().max(400).optional(),
  fixado: z.boolean().optional(),
  leituraObrigatoria: z.boolean().optional(),
});

const publicarComunicadoSchema = z.object({
  usuarioIds: z.array(z.string().uuid()).optional(),
});

const comunicadoParamsSchema = z.object({
  id: z.string().uuid(),
});

const listarComunicadosAdminQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(10),
  busca: z.string().trim().optional(),
  status: z.enum(['TODOS', ...statusComunicado]).default('TODOS'),
  escopo: z.enum(['QUALQUER', ...escoposDestino]).default('QUALQUER'),
  prioridade: z.enum(['TODAS', ...prioridades]).default('TODAS'),
  tipo: z.enum(['TODAS', ...tiposComunicado]).default('TODAS'),
  categoria: z.enum(['TODAS', ...categoriasComunicado]).default('TODAS'),
  fixado: z.enum(['TODAS', 'SIM', 'NAO']).default('TODAS'),
  dataInicio: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dataFim: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  publicadoEm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  ordenacao: z.enum(ordenacoesAdmin).default('mais-recentes'),
});

interface ComunicadoRow {
  id: string;
  titulo: string;
  conteudo: string;
  prioridade: 'BAIXA' | 'MEDIA' | 'ALTA';
  escopo_destino: 'TODOS' | 'USUARIOS_ESPECIFICOS';
  tipo:
    | 'COMUNICADO_GERAL'
    | 'COMUNICADO_IMPORTANTE'
    | 'DECISAO_OPERACIONAL'
    | 'PADRONIZACAO'
    | 'SISTEMA'
    | 'TREINAMENTO'
    | 'BLOG_INTERNO';
  categoria:
    | 'PRODUCAO'
    | 'DIGITALIZACAO'
    | 'CONFERENCIA'
    | 'RECONFERENCIA'
    | 'QUALIDADE'
    | 'ADMINISTRATIVO'
    | 'SISTEMA'
    | 'GERAL';
  resumo: string | null;
  fixado: boolean;
  leitura_obrigatoria: boolean;
  status: 'RASCUNHO' | 'PUBLICADO' | 'ENCERRADO';
  criado_por_usuario_id: string;
  criado_em: string | Date;
  publicado_em: string | Date | null;
  encerrado_em: string | Date | null;
  atualizado_em: string | Date;
}

interface ComunicadoAdminRow extends ComunicadoRow {
  total_destinatarios: string | number;
  total_lidos: string | number;
}

interface ComunicadoDestinatarioRow {
  destinatario_id: string;
  destinatario_comunicado_id: string;
  destinatario_usuario_id: string;
  destinatario_lido_em: string | Date | null;
  destinatario_entregue_em: string | Date;
  destinatario_criado_em: string | Date;
}

interface ComunicadoAdminDestinatarioRow extends ComunicadoDestinatarioRow {
  usuario_nome: string;
  usuario_email: string;
  usuario_ativo: boolean;
}

interface ComunicadoUsuarioRow extends ComunicadoRow, ComunicadoDestinatarioRow {}

interface ComunicadoIdRow {
  comunicado_id: string;
  lido_em: string | Date;
}

interface ComunicadoAdminResumoRow {
  total_filtrados: string | number;
  rascunhos: string | number;
  publicados: string | number;
  encerrados: string | number;
  pendencias_leitura: string | number;
  prioridade_alta: string | number;
  prioridade_media: string | number;
  prioridade_baixa: string | number;
}

function mapComunicado(row: ComunicadoRow): Comunicado {
  return {
    id: row.id,
    titulo: row.titulo,
    conteudo: row.conteudo,
    prioridade: row.prioridade,
    escopoDestino: row.escopo_destino,
    tipo: row.tipo,
    categoria: row.categoria,
    resumo: row.resumo,
    fixado: row.fixado,
    leituraObrigatoria: row.leitura_obrigatoria,
    status: row.status,
    criadoPorUsuarioId: row.criado_por_usuario_id,
    criadoEm: toIsoDate(row.criado_em) ?? new Date().toISOString(),
    publicadoEm: toIsoDate(row.publicado_em),
    encerradoEm: toIsoDate(row.encerrado_em),
    atualizadoEm: toIsoDate(row.atualizado_em) ?? new Date().toISOString(),
  };
}

function mapComunicadoAdmin(row: ComunicadoAdminRow): ComunicadoAdminResumo {
  return {
    ...mapComunicado(row),
    totalDestinatarios: Number(row.total_destinatarios),
    totalLidos: Number(row.total_lidos),
  };
}

function mapDestinatario(row: ComunicadoDestinatarioRow): ComunicadoDestinatario {
  return {
    id: row.destinatario_id,
    comunicadoId: row.destinatario_comunicado_id,
    usuarioId: row.destinatario_usuario_id,
    lidoEm: toIsoDate(row.destinatario_lido_em),
    entregueEm: toIsoDate(row.destinatario_entregue_em) ?? new Date().toISOString(),
    criadoEm: toIsoDate(row.destinatario_criado_em) ?? new Date().toISOString(),
  };
}

function mapAdminDestinatario(
  row: ComunicadoAdminDestinatarioRow
): ComunicadoAdminDestinatarioItem {
  return {
    destinatario: mapDestinatario(row),
    usuarioNome: row.usuario_nome,
    usuarioEmail: row.usuario_email,
    usuarioAtivo: row.usuario_ativo,
  };
}

function mapComunicadoUsuario(row: ComunicadoUsuarioRow): ComunicadoUsuarioItem {
  return {
    ...mapComunicado(row),
    destinatario: mapDestinatario(row),
  };
}

function toNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function buildAdminListFilters(query: z.infer<typeof listarComunicadosAdminQuerySchema>): {
  whereSql: string;
  params: unknown[];
  paramIndex: number;
} {
  const {
    busca,
    status = 'TODOS',
    escopo = 'QUALQUER',
    prioridade = 'TODAS',
    tipo = 'TODAS',
    categoria = 'TODAS',
    fixado = 'TODAS',
    dataInicio,
    dataFim,
    publicadoEm,
  } = query;

  const whereClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (busca) {
    whereClauses.push(`(c.titulo ILIKE $${paramIndex} OR c.conteudo ILIKE $${paramIndex})`);
    params.push(`%${busca}%`);
    paramIndex += 1;
  }

  if (status !== 'TODOS') {
    whereClauses.push(`c.status = $${paramIndex}`);
    params.push(status);
    paramIndex += 1;
  }

  if (escopo !== 'QUALQUER') {
    whereClauses.push(`c.escopo_destino = $${paramIndex}`);
    params.push(escopo);
    paramIndex += 1;
  }

  if (prioridade !== 'TODAS') {
    whereClauses.push(`c.prioridade = $${paramIndex}`);
    params.push(prioridade);
    paramIndex += 1;
  }

  if (tipo !== 'TODAS') {
    whereClauses.push(`c.tipo = $${paramIndex}`);
    params.push(tipo);
    paramIndex += 1;
  }

  if (categoria !== 'TODAS') {
    whereClauses.push(`c.categoria = $${paramIndex}`);
    params.push(categoria);
    paramIndex += 1;
  }

  if (fixado !== 'TODAS') {
    whereClauses.push(`c.fixado = $${paramIndex}`);
    params.push(fixado === 'SIM');
    paramIndex += 1;
  }

  if (dataInicio) {
    whereClauses.push(`DATE(COALESCE(c.publicado_em, c.criado_em)) >= $${paramIndex}`);
    params.push(dataInicio);
    paramIndex += 1;
  }

  if (dataFim) {
    whereClauses.push(`DATE(COALESCE(c.publicado_em, c.criado_em)) <= $${paramIndex}`);
    params.push(dataFim);
    paramIndex += 1;
  }

  if (publicadoEm) {
    whereClauses.push(`DATE(c.publicado_em) = $${paramIndex}`);
    params.push(publicadoEm);
    paramIndex += 1;
  }

  return {
    whereSql: whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '',
    params,
    paramIndex,
  };
}

function getAdminOrderBySql(ordenacao: string): string {
  const orderByMap: Record<string, string> = {
    'mais-recentes': `base.criado_em DESC`,
    'mais-antigos': `base.criado_em ASC`,
    'mais-pendentes': `(base.total_destinatarios - base.total_lidos) DESC, base.criado_em DESC`,
    'mais-lidos': `base.total_lidos DESC, base.criado_em DESC`,
  };

  if (ordenacao in orderByMap) {
    return orderByMap[ordenacao] as string;
  }

  return `base.criado_em DESC`;
}

function csvCell(value: string | number | null): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

async function setAuditUser(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  userId: string
): Promise<void> {
  await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
}

export function createComunicadosRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    server.post<{ Body: CriarComunicadoDTO }>(
      '/admin/comunicados',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Criar comunicado interno em rascunho',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateBody(criarComunicadoSchema),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const body = request.body as CriarComunicadoDTO;
        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await setAuditUser(client, user.id);

          const result = await client.query<ComunicadoRow>(
            `INSERT INTO comunicados (
               titulo,
               conteudo,
               prioridade,
               escopo_destino,
               tipo,
               categoria,
               resumo,
               fixado,
               leitura_obrigatoria,
               status,
               criado_por_usuario_id
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'RASCUNHO', $10)
             RETURNING
               id,
               titulo,
               conteudo,
               prioridade,
               escopo_destino,
               tipo,
               categoria,
               resumo,
               fixado,
               leitura_obrigatoria,
               status,
               criado_por_usuario_id,
               criado_em,
               publicado_em,
               encerrado_em,
               atualizado_em`,
            [
              body.titulo,
              body.conteudo,
              body.prioridade,
              body.escopoDestino,
              body.tipo ?? 'COMUNICADO_GERAL',
              body.categoria ?? 'GERAL',
              body.resumo ?? null,
              body.fixado ?? false,
              body.leituraObrigatoria ?? false,
              user.id,
            ]
          );

          await client.query('COMMIT');

          const comunicado = result.rows[0];
          if (!comunicado) {
            throw new Error('Falha ao criar comunicado');
          }

          return reply.status(201).send({ comunicado: mapComunicado(comunicado) });
        } catch (error) {
          await client.query('ROLLBACK');
          request.log.error(error);
          const message = error instanceof Error ? error.message : 'Erro ao criar comunicado';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );

    server.patch<{ Params: { id: string }; Body: AtualizarComunicadoDTO }>(
      '/admin/comunicados/:id',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Atualizar comunicado em rascunho',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateParams(comunicadoParamsSchema),
          validateBody(atualizarComunicadoSchema),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params;
        const body = request.body as AtualizarComunicadoDTO;
        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await setAuditUser(client, user.id);

          const result = await client.query<ComunicadoRow>(
            `UPDATE comunicados
             SET titulo = COALESCE($1, titulo),
                 conteudo = COALESCE($2, conteudo),
                 prioridade = COALESCE($3, prioridade),
                 escopo_destino = COALESCE($4, escopo_destino),
                 tipo = COALESCE($5, tipo),
                 categoria = COALESCE($6, categoria),
                 resumo = COALESCE($7, resumo),
                 fixado = COALESCE($8, fixado),
                 leitura_obrigatoria = COALESCE($9, leitura_obrigatoria),
                 atualizado_em = CURRENT_TIMESTAMP
             WHERE id = $10
               AND status = 'RASCUNHO'
             RETURNING
               id,
               titulo,
               conteudo,
               prioridade,
               escopo_destino,
               tipo,
               categoria,
               resumo,
               fixado,
               leitura_obrigatoria,
               status,
               criado_por_usuario_id,
               criado_em,
               publicado_em,
               encerrado_em,
               atualizado_em`,
            [
              body.titulo,
              body.conteudo,
              body.prioridade,
              body.escopoDestino,
              body.tipo,
              body.categoria,
              body.resumo,
              body.fixado,
              body.leituraObrigatoria,
              id,
            ]
          );

          const comunicado = result.rows[0];
          if (!comunicado) {
            await client.query('ROLLBACK');
            return reply.status(404).send({
              error: 'Comunicado não encontrado ou não está em rascunho',
            });
          }

          await client.query('COMMIT');

          return reply.send({ comunicado: mapComunicado(comunicado) });
        } catch (error) {
          await client.query('ROLLBACK');
          request.log.error(error);
          const message = error instanceof Error ? error.message : 'Erro ao atualizar comunicado';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );

    server.get<{ Querystring: ListarComunicadosAdminParams }>(
      '/admin/comunicados',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Listar comunicados para acompanhamento administrativo',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateQuery(listarComunicadosAdminQuerySchema),
        ],
      },
      async (request, reply) => {
        try {
          const {
            pagina = 1,
            limite = 10,
            busca,
            status = 'TODOS',
            escopo = 'QUALQUER',
            prioridade = 'TODAS',
            tipo = 'TODAS',
            categoria = 'TODAS',
            fixado = 'TODAS',
            dataInicio,
            dataFim,
            publicadoEm,
            ordenacao = 'mais-recentes',
          } = request.query as z.infer<typeof listarComunicadosAdminQuerySchema>;
          const { whereSql, params, paramIndex } = buildAdminListFilters({
            pagina,
            limite,
            busca,
            status,
            escopo,
            prioridade,
            tipo,
            categoria,
            fixado,
            dataInicio,
            dataFim,
            publicadoEm,
            ordenacao,
          });
          const orderBySql = getAdminOrderBySql(ordenacao);
          const offset = (pagina - 1) * limite;
          const paginationParams = [...params, limite, offset];

          const result = await server.database.query<ComunicadoAdminRow>(
            `WITH base AS (
               SELECT
                 c.id,
                 c.titulo,
                 c.conteudo,
                 c.prioridade,
                 c.escopo_destino,
                 c.tipo,
                 c.categoria,
                 c.resumo,
                 c.fixado,
                 c.leitura_obrigatoria,
                 c.status,
                 c.criado_por_usuario_id,
                 c.criado_em,
                 c.publicado_em,
                 c.encerrado_em,
                 c.atualizado_em,
                 COUNT(cd.id) AS total_destinatarios,
                 COUNT(cd.lido_em) AS total_lidos
               FROM comunicados c
               LEFT JOIN comunicado_destinatarios cd ON cd.comunicado_id = c.id
               ${whereSql}
               GROUP BY c.id
             )
             SELECT
               base.id,
               base.titulo,
               base.conteudo,
               base.prioridade,
               base.escopo_destino,
               base.tipo,
               base.categoria,
               base.resumo,
               base.fixado,
               base.leitura_obrigatoria,
               base.status,
               base.criado_por_usuario_id,
               base.criado_em,
               base.publicado_em,
               base.encerrado_em,
               base.atualizado_em,
               base.total_destinatarios,
               base.total_lidos
             FROM base
             ORDER BY ${orderBySql}
             LIMIT $${paramIndex}
             OFFSET $${paramIndex + 1}`,
            paginationParams
          );

          const summaryResult = await server.database.query<ComunicadoAdminResumoRow>(
            `WITH base AS (
               SELECT
                 c.id,
                 c.prioridade,
                 c.status,
                 COUNT(cd.id) AS total_destinatarios,
                 COUNT(cd.lido_em) AS total_lidos
               FROM comunicados c
               LEFT JOIN comunicado_destinatarios cd ON cd.comunicado_id = c.id
               ${whereSql}
               GROUP BY c.id
             )
             SELECT
               COUNT(*) AS total_filtrados,
               COUNT(*) FILTER (WHERE status = 'RASCUNHO') AS rascunhos,
               COUNT(*) FILTER (WHERE status = 'PUBLICADO') AS publicados,
               COUNT(*) FILTER (WHERE status = 'ENCERRADO') AS encerrados,
               COALESCE(SUM(GREATEST(total_destinatarios - total_lidos, 0)), 0) AS pendencias_leitura,
               COUNT(*) FILTER (WHERE prioridade = 'ALTA') AS prioridade_alta,
               COUNT(*) FILTER (WHERE prioridade = 'MEDIA') AS prioridade_media,
               COUNT(*) FILTER (WHERE prioridade = 'BAIXA') AS prioridade_baixa
             FROM base`,
            params
          );

          const summary = summaryResult.rows[0];
          const total = toNumber(summary?.total_filtrados);
          const response: ListarComunicadosAdminResponse = {
            comunicados: result.rows.map(mapComunicadoAdmin),
            total,
            pagina,
            totalPaginas: Math.max(Math.ceil(total / limite), 1),
            resumo: {
              totalFiltrados: total,
              rascunhos: toNumber(summary?.rascunhos),
              publicados: toNumber(summary?.publicados),
              encerrados: toNumber(summary?.encerrados),
              pendenciasLeitura: toNumber(summary?.pendencias_leitura),
              prioridadeAlta: toNumber(summary?.prioridade_alta),
              prioridadeMedia: toNumber(summary?.prioridade_media),
              prioridadeBaixa: toNumber(summary?.prioridade_baixa),
            },
          };

          return reply.send(response);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao listar comunicados administrativos';
          return reply.status(500).send({ error: message });
        }
      }
    );

    server.get<{ Querystring: ListarComunicadosAdminParams }>(
      '/admin/comunicados/exportar',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Exportar historico de comunicados administrativos em CSV',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateQuery(listarComunicadosAdminQuerySchema),
        ],
      },
      async (request, reply) => {
        try {
          const query = request.query as z.infer<typeof listarComunicadosAdminQuerySchema>;
          const { whereSql, params } = buildAdminListFilters(query);
          const orderBySql = getAdminOrderBySql(query.ordenacao);

          const result = await server.database.query<ComunicadoAdminRow>(
            `WITH base AS (
               SELECT
                 c.id,
                 c.titulo,
                 c.conteudo,
                 c.prioridade,
                 c.escopo_destino,
                 c.tipo,
                 c.categoria,
                 c.resumo,
                 c.fixado,
                 c.leitura_obrigatoria,
                 c.status,
                 c.criado_por_usuario_id,
                 c.criado_em,
                 c.publicado_em,
                 c.encerrado_em,
                 c.atualizado_em,
                 COUNT(cd.id) AS total_destinatarios,
                 COUNT(cd.lido_em) AS total_lidos
               FROM comunicados c
               LEFT JOIN comunicado_destinatarios cd ON cd.comunicado_id = c.id
               ${whereSql}
               GROUP BY c.id
             )
             SELECT
               base.id,
               base.titulo,
               base.conteudo,
               base.prioridade,
               base.escopo_destino,
               base.tipo,
               base.categoria,
               base.resumo,
               base.fixado,
               base.leitura_obrigatoria,
               base.status,
               base.criado_por_usuario_id,
               base.criado_em,
               base.publicado_em,
               base.encerrado_em,
               base.atualizado_em,
               base.total_destinatarios,
               base.total_lidos
             FROM base
             ORDER BY ${orderBySql}`,
            params
          );

          const header = [
            'titulo',
            'tipo',
            'categoria',
            'status',
            'prioridade',
            'escopo',
            'leitura_obrigatoria',
            'criado_em',
            'publicado_em',
            'encerrado_em',
            'destinatarios',
            'lidos',
            'pendentes',
          ];

          const lines = [
            header.map((item) => csvCell(item)).join(';'),
            ...result.rows.map((row) => {
              const pendentes = Math.max(
                Number(row.total_destinatarios) - Number(row.total_lidos),
                0
              );
              return [
                row.titulo,
                row.tipo,
                row.categoria,
                row.status,
                row.prioridade,
                row.escopo_destino,
                row.leitura_obrigatoria ? 'SIM' : 'NAO',
                toIsoDate(row.criado_em) ?? '',
                toIsoDate(row.publicado_em) ?? '',
                toIsoDate(row.encerrado_em) ?? '',
                Number(row.total_destinatarios),
                Number(row.total_lidos),
                pendentes,
              ]
                .map((item) => csvCell(item))
                .join(';');
            }),
          ];

          const today = new Date().toISOString().slice(0, 10);
          reply.header('Content-Type', 'text/csv; charset=utf-8');
          reply.header(
            'Content-Disposition',
            `attachment; filename="historico-comunicados-${today}.csv"`
          );

          return reply.send('\uFEFF' + lines.join('\r\n'));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao exportar historico de comunicados';
          return reply.status(500).send({ error: message });
        }
      }
    );

    server.post<{ Params: { id: string }; Body: PublicarComunicadoDTO }>(
      '/admin/comunicados/:id/publicar',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Publicar comunicado interno',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateParams(comunicadoParamsSchema),
          validateBody(publicarComunicadoSchema),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params;
        const body = request.body as PublicarComunicadoDTO;
        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await setAuditUser(client, user.id);

          const comunicadoResult = await client.query<ComunicadoRow>(
            `SELECT
               id,
               titulo,
               conteudo,
               prioridade,
               escopo_destino,
               categoria,
               resumo,
               status,
               criado_por_usuario_id,
               criado_em,
               publicado_em,
               encerrado_em,
               atualizado_em
             FROM comunicados
             WHERE id = $1
             FOR UPDATE`,
            [id]
          );

          const comunicado = comunicadoResult.rows[0];
          if (!comunicado) {
            await client.query('ROLLBACK');
            return reply.status(404).send({ error: 'Comunicado não encontrado' });
          }

          if (comunicado.status !== 'RASCUNHO') {
            await client.query('ROLLBACK');
            return reply.status(400).send({
              error: 'Apenas comunicados em rascunho podem ser publicados',
            });
          }

          let usuarioIds: string[] = [];

          if (comunicado.escopo_destino === 'TODOS') {
            const usuariosResult = await client.query<{ id: string }>(
              `SELECT id
               FROM usuarios
               WHERE ativo = TRUE
               ORDER BY nome`
            );

            usuarioIds = usuariosResult.rows.map((row) => row.id);
          } else {
            const requestedIds = Array.from(new Set(body.usuarioIds ?? []));

            if (requestedIds.length === 0) {
              await client.query('ROLLBACK');
              return reply.status(400).send({
                error: 'usuarioIds e obrigatorio para comunicados com escopo USUARIOS_ESPECIFICOS',
              });
            }

            const usuariosResult = await client.query<{ id: string }>(
              `SELECT id
               FROM usuarios
               WHERE ativo = TRUE
                 AND id = ANY($1::uuid[])`,
              [requestedIds]
            );

            usuarioIds = usuariosResult.rows.map((row) => row.id);

            if (usuarioIds.length !== requestedIds.length) {
              await client.query('ROLLBACK');
              return reply.status(400).send({
                error: 'Um ou mais usuários informados não existem ou estão inativos',
              });
            }
          }

          if (usuarioIds.length === 0) {
            await client.query('ROLLBACK');
            return reply.status(400).send({
              error: 'Nenhum destinatario ativo encontrado para publicacao',
            });
          }

          const destinatariosResult = await client.query(
            `INSERT INTO comunicado_destinatarios (comunicado_id, usuario_id)
             SELECT $1, destinatario_id
             FROM unnest($2::uuid[]) AS destinatario_id
             ON CONFLICT (comunicado_id, usuario_id) DO NOTHING`,
            [id, usuarioIds]
          );

          await client.query(
            `UPDATE comunicados
             SET status = 'PUBLICADO',
                 publicado_em = CURRENT_TIMESTAMP,
                 atualizado_em = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [id]
          );

          await client.query('COMMIT');

          request.log.info({
            msg: 'Comunicado publicado',
            comunicadoId: id,
            destinatarios: usuarioIds.length,
            webPushEnabled: server.webPushService.enabled,
          });

          if (server.webPushService.enabled) {
            request.log.info({
              msg: 'Calling webPushService.sendComunicadoPublicado',
              comunicadoId: id,
            });
            void server.webPushService
              .sendComunicadoPublicado({
                comunicadoId: id,
                titulo: comunicado.titulo,
                conteudo: comunicado.conteudo,
                prioridade: comunicado.prioridade,
                categoria: comunicado.categoria,
                resumo: comunicado.resumo,
                usuarioIds,
              })
              .catch((error) => {
                request.log.error({ error }, 'WebPush sendComunicadoPublicado failed');
              });
          }

          return reply.send({
            message: 'Comunicado publicado com sucesso',
            comunicadoId: id,
            totalDestinatarios: destinatariosResult.rowCount ?? usuarioIds.length,
          });
        } catch (error) {
          await client.query('ROLLBACK');
          request.log.error(error);
          const message = error instanceof Error ? error.message : 'Erro ao publicar comunicado';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );

    server.post<{ Params: { id: string } }>(
      '/admin/comunicados/:id/encerrar',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Encerrar comunicado interno publicado',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateParams(comunicadoParamsSchema),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params;
        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await setAuditUser(client, user.id);

          const result = await client.query<ComunicadoRow>(
            `UPDATE comunicados
             SET status = 'ENCERRADO',
                 encerrado_em = CURRENT_TIMESTAMP,
                 atualizado_em = CURRENT_TIMESTAMP
             WHERE id = $1
               AND status = 'PUBLICADO'
             RETURNING
               id,
               titulo,
               conteudo,
               prioridade,
               escopo_destino,
               status,
               criado_por_usuario_id,
               criado_em,
               publicado_em,
               encerrado_em,
               atualizado_em`,
            [id]
          );

          const comunicado = result.rows[0];
          if (!comunicado) {
            await client.query('ROLLBACK');
            return reply.status(404).send({
              error: 'Comunicado não encontrado ou não está publicado',
            });
          }

          await client.query('COMMIT');

          return reply.send({
            message: 'Comunicado encerrado com sucesso',
            comunicado: mapComunicado(comunicado),
          });
        } catch (error) {
          await client.query('ROLLBACK');
          request.log.error(error);
          const message = error instanceof Error ? error.message : 'Erro ao encerrar comunicado';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );

    server.delete<{ Params: { id: string } }>(
      '/admin/comunicados/:id',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Excluir comunicado interno',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateParams(comunicadoParamsSchema),
        ],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params;
        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await setAuditUser(client, user.id);

          const comunicadoResult = await client.query<{
            id: string;
            status: 'RASCUNHO' | 'PUBLICADO' | 'ENCERRADO';
          }>(
            `SELECT id, status
             FROM comunicados
             WHERE id = $1
             FOR UPDATE`,
            [id]
          );

          const comunicado = comunicadoResult.rows[0];

          if (!comunicado) {
            await client.query('ROLLBACK');
            return reply.status(404).send({ error: 'Comunicado não encontrado' });
          }

          if (comunicado.status === 'PUBLICADO') {
            await client.query('ROLLBACK');
            return reply.status(400).send({
              error: 'Comunicados publicados devem ser encerrados antes da exclusao',
            });
          }

          const destinatariosResult = await client.query(
            `DELETE FROM comunicado_destinatarios
             WHERE comunicado_id = $1`,
            [id]
          );

          await client.query(
            `DELETE FROM comunicados
             WHERE id = $1`,
            [id]
          );

          await client.query('COMMIT');

          const response: ExcluirComunicadoResponse = {
            message: 'Comunicado excluido com sucesso',
            comunicadoId: id,
            destinatariosRemovidos: destinatariosResult.rowCount ?? 0,
          };

          return reply.send(response);
        } catch (error) {
          await client.query('ROLLBACK');
          request.log.error(error);
          const message = error instanceof Error ? error.message : 'Erro ao excluir comunicado';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );

    server.get(
      '/admin/comunicados/:id',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Obter detalhe administrativo de comunicado interno',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('administrador'),
          validateParams(comunicadoParamsSchema),
        ],
      },
      async (request, reply) => {
        try {
          const { id } = request.params as { id: string };
          const comunicadoResult = await server.database.query<ComunicadoAdminRow>(
            `SELECT
               c.id,
               c.titulo,
               c.conteudo,
               c.prioridade,
               c.escopo_destino,
               c.tipo,
               c.categoria,
               c.resumo,
               c.fixado,
               c.leitura_obrigatoria,
               c.status,
               c.criado_por_usuario_id,
               c.criado_em,
               c.publicado_em,
               c.encerrado_em,
               c.atualizado_em,
               COUNT(cd.id) AS total_destinatarios,
               COUNT(cd.lido_em) AS total_lidos
             FROM comunicados c
             LEFT JOIN comunicado_destinatarios cd ON cd.comunicado_id = c.id
             WHERE c.id = $1
             GROUP BY c.id`,
            [id]
          );

          const comunicado = comunicadoResult.rows[0];
          if (!comunicado) {
            return reply.status(404).send({ error: 'Comunicado não encontrado' });
          }

          const destinatariosResult = await server.database.query<ComunicadoAdminDestinatarioRow>(
            `SELECT
               cd.id AS destinatario_id,
               cd.comunicado_id AS destinatario_comunicado_id,
               cd.usuario_id AS destinatario_usuario_id,
               cd.lido_em AS destinatario_lido_em,
               cd.entregue_em AS destinatario_entregue_em,
               cd.criado_em AS destinatario_criado_em,
               u.nome AS usuario_nome,
               u.email AS usuario_email,
               u.ativo AS usuario_ativo
             FROM comunicado_destinatarios cd
             INNER JOIN usuarios u ON u.id = cd.usuario_id
             WHERE cd.comunicado_id = $1
             ORDER BY
               CASE WHEN cd.lido_em IS NULL THEN 0 ELSE 1 END,
               cd.lido_em DESC NULLS LAST,
               u.nome ASC`,
            [id]
          );

          const response: ObterComunicadoAdminResponse = {
            comunicado: {
              ...(mapComunicadoAdmin(comunicado) as ComunicadoAdminDetalhe),
              destinatarios: destinatariosResult.rows.map(mapAdminDestinatario),
            },
          };

          return reply.send(response);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao obter detalhe do comunicado';
          return reply.status(500).send({ error: message });
        }
      }
    );

    server.get(
      '/comunicados',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Listar comunicados do usuario autenticado',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const result = await server.database.query<ComunicadoUsuarioRow>(
            `SELECT
               c.id,
               c.titulo,
               c.conteudo,
               c.prioridade,
               c.escopo_destino,
               c.tipo,
               c.categoria,
               c.resumo,
               c.fixado,
               c.leitura_obrigatoria,
               c.status,
               c.criado_por_usuario_id,
               c.criado_em,
               c.publicado_em,
               c.encerrado_em,
               c.atualizado_em,
               cd.id AS destinatario_id,
               cd.comunicado_id AS destinatario_comunicado_id,
               cd.usuario_id AS destinatario_usuario_id,
               cd.lido_em AS destinatario_lido_em,
               cd.entregue_em AS destinatario_entregue_em,
               cd.criado_em AS destinatario_criado_em
             FROM comunicado_destinatarios cd
             INNER JOIN comunicados c ON c.id = cd.comunicado_id
             WHERE cd.usuario_id = $1
               AND c.status IN ('PUBLICADO', 'ENCERRADO')
             ORDER BY c.fixado DESC,
               cd.lido_em IS NOT NULL ASC,
               CASE
                 WHEN c.prioridade = 'ALTA' THEN 1
                 WHEN c.prioridade = 'MEDIA' THEN 2
                 ELSE 3
               END ASC,
               c.publicado_em DESC NULLS LAST,
               c.criado_em DESC`,
            [user.id]
          );

          const comunicados = result.rows.map(mapComunicadoUsuario);
          const response: ListarComunicadosUsuarioResponse = {
            comunicados,
            totalNaoLidos: comunicados.filter((item) => item.destinatario.lidoEm === null).length,
          };

          return reply.send(response);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao listar comunicados';
          return reply.status(500).send({ error: message });
        }
      }
    );

    server.get(
      '/comunicados/nao-lidos',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Listar comunicados não lidos do usuário autenticado',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const result = await server.database.query<ComunicadoUsuarioRow>(
            `SELECT
               c.id,
               c.titulo,
               c.conteudo,
               c.prioridade,
               c.escopo_destino,
               c.tipo,
               c.categoria,
               c.resumo,
               c.fixado,
               c.leitura_obrigatoria,
               c.status,
               c.criado_por_usuario_id,
               c.criado_em,
               c.publicado_em,
               c.encerrado_em,
               c.atualizado_em,
               cd.id AS destinatario_id,
               cd.comunicado_id AS destinatario_comunicado_id,
               cd.usuario_id AS destinatario_usuario_id,
               cd.lido_em AS destinatario_lido_em,
               cd.entregue_em AS destinatario_entregue_em,
               cd.criado_em AS destinatario_criado_em
             FROM comunicado_destinatarios cd
             INNER JOIN comunicados c ON c.id = cd.comunicado_id
             WHERE cd.usuario_id = $1
               AND cd.lido_em IS NULL
               AND c.status = 'PUBLICADO'
             ORDER BY c.fixado DESC,
               CASE
                 WHEN c.prioridade = 'ALTA' THEN 1
                 WHEN c.prioridade = 'MEDIA' THEN 2
                 ELSE 3
               END ASC,
               c.publicado_em DESC NULLS LAST,
               c.criado_em DESC`,
            [user.id]
          );

          const comunicados = result.rows.map(mapComunicadoUsuario);
          const response: ListarComunicadosUsuarioResponse = {
            comunicados,
            totalNaoLidos: comunicados.length,
          };

          return reply.send(response);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao listar comunicados não lidos';
          return reply.status(500).send({ error: message });
        }
      }
    );

    server.post<{ Params: { id: string } }>(
      '/comunicados/:id/marcar-lido',
      {
        schema: {
          tags: ['comunicados'],
          summary: 'Marcar comunicado como lido',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, validateParams(comunicadoParamsSchema)],
      },
      async (request, reply) => {
        const user = getCurrentUser(request);
        const { id } = request.params;

        if (user.perfil === 'visualizador') {
          return reply.status(403).send({
            error: 'Perfil visualizador não pode alterar o estado de leitura dos comunicados',
          });
        }

        const client = await server.database.pool.connect();

        try {
          await client.query('BEGIN');
          await setAuditUser(client, user.id);

          const result = await client.query<ComunicadoIdRow>(
            `UPDATE comunicado_destinatarios cd
             SET lido_em = COALESCE(cd.lido_em, CURRENT_TIMESTAMP)
             FROM comunicados c
             WHERE cd.comunicado_id = c.id
               AND cd.comunicado_id = $1
               AND cd.usuario_id = $2
               AND c.status IN ('PUBLICADO', 'ENCERRADO')
             RETURNING cd.comunicado_id, cd.lido_em`,
            [id, user.id]
          );

          const destinatario = result.rows[0];
          if (!destinatario) {
            await client.query('ROLLBACK');
            return reply.status(404).send({
              error: 'Comunicado não encontrado para o usuário autenticado',
            });
          }

          await client.query('COMMIT');

          const response: MarcarComunicadoLidoResponse = {
            message: 'Comunicado marcado como lido',
            comunicadoId: destinatario.comunicado_id,
            lidoEm: toIsoDate(destinatario.lido_em) ?? new Date().toISOString(),
          };

          return reply.send(response);
        } catch (error) {
          await client.query('ROLLBACK');
          request.log.error(error);
          const message =
            error instanceof Error ? error.message : 'Erro ao marcar comunicado como lido';
          return reply.status(500).send({ error: message });
        } finally {
          client.release();
        }
      }
    );
  };
}
