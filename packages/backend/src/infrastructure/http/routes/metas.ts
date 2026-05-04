import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { getCurrentUser } from './operacional-helpers.js';
import { validateBody } from '../middleware/validate.js';
import { lancarProducaoColaboradorSchema } from '../schemas/producao.js';
import type { EtapaFluxo, StatusRepositorio } from '@recorda/shared';
import { normalizeIdRepositorioGed } from './operacional-repositorios.js';
import {
  SYSTEM_TIMEZONE,
  PRODUCAO_CONTABILIZADA_DESCRICAO,
  PRODUCAO_ESCOPOS,
  buildProducaoContabilizadaWhere,
  sqlDateInSystemTimezone,
  sqlLastNDaysStartInSystemTimezone,
  sqlMonthStartInSystemTimezone,
  sqlTodayInSystemTimezone,
} from '../../../domain/producao/producao-metrics.js';

export function createMetasRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    // GET /producao/metas - Listar metas
    server.get(
      '/producao/metas',
      {
        schema: {
          tags: ['metas'],
          summary: 'Listar metas de produção por etapa',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('colaborador', 'operador', 'administrador')],
      },
      async (_request, reply) => {
        try {
          const result = await server.database.query(`
          SELECT m.*, e.nome as etapa_nome
          FROM metas_producao m
          JOIN etapas e ON e.id = m.etapa_id
          ORDER BY e.ordem
        `);
          return reply.send({ metas: result.rows });
        } catch (error) {
          // Tabela pode não existir ainda
          return reply.send({ metas: [] });
        }
      }
    );

    // POST /producao/metas - Criar meta
    server.post(
      '/producao/metas',
      {
        schema: {
          tags: ['metas'],
          summary: 'Criar meta de produção',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            required: ['etapaId', 'metaDiaria', 'metaMensal'],
            properties: {
              etapaId: { type: 'string' },
              metaDiaria: { type: 'number' },
              metaMensal: { type: 'number' },
            },
          },
          response: {
            201: { type: 'object', additionalProperties: true },
            500: { type: 'object', properties: { error: { type: 'string' } } },
          },
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { etapaId, metaDiaria, metaMensal } = request.body as {
            etapaId: string;
            metaDiaria: number;
            metaMensal: number;
          };

          const result = await server.database.query(
            `INSERT INTO metas_producao (etapa_id, meta_diaria, meta_mensal, ativa)
           VALUES ($1, $2, $3, true) RETURNING *`,
            [etapaId, metaDiaria, metaMensal]
          );

          return reply.status(201).send(result.rows[0]);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao criar meta';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /producao/desempenho - Indicadores de desempenho
    server.get(
      '/producao/desempenho',
      {
        schema: {
          tags: ['metas'],
          summary: 'Indicadores de desempenho por colaborador',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              periodo: { type: 'string', enum: ['dia', 'semana', 'mes'], default: 'mes' },
            },
          },
          response: { 500: { type: 'object', properties: { error: { type: 'string' } } } },
        },
        preHandler: [server.authenticate, authorize('colaborador', 'operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const { periodo = 'mes' } = request.query as { periodo?: string };
          const dataProducaoLocal = sqlDateInSystemTimezone('rp');
          const producaoContabilizadaWhere = buildProducaoContabilizadaWhere('rp');

          let dateFilter = '';
          if (periodo === 'dia') {
            dateFilter = `AND ${dataProducaoLocal} = ${sqlTodayInSystemTimezone()}`;
          } else if (periodo === 'semana') {
            dateFilter = `AND ${dataProducaoLocal} >= ${sqlLastNDaysStartInSystemTimezone(7)}`;
          } else {
            dateFilter = `AND ${dataProducaoLocal} >= ${sqlMonthStartInSystemTimezone()}`;
          }

          // Buscar meta configurada (soma de todas as metas por etapa)
          let metaTotal = 0;
          try {
            const metaResult = await server.database.query<{ total: string }>(
              `SELECT COALESCE(SUM(meta_mensal), 0)::text AS total FROM metas_producao`
            );
            const metaFromDb = parseInt(metaResult.rows[0]?.total ?? '0', 10);
            if (metaFromDb > 0) {
              metaTotal = metaFromDb;
            }
          } catch {
            // Tabela pode não existir ainda — usar fallback 0
          }

          const result = await server.database.query(
            `
          SELECT 
            u.nome as colaborador_nome,
            COALESCE(SUM(rp.quantidade), 0) as total_producao,
            $1::integer as meta,
            ROUND(COALESCE(SUM(rp.quantidade), 0) * 100.0 / NULLIF($1::integer, 0)) as percentual
          FROM usuarios u
          LEFT JOIN producao_repositorio rp ON rp.usuario_id = u.id ${dateFilter}
            AND ${producaoContabilizadaWhere}
          WHERE u.ativo = true
          GROUP BY u.id, u.nome
          ORDER BY total_producao DESC
        `,
            [metaTotal]
          );

          return reply.send({ desempenho: result.rows });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar desempenho';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /producao/mapeamentos - Listar templates de mapeamento
    server.get(
      '/producao/mapeamentos',
      {
        schema: {
          tags: ['metas'],
          summary: 'Listar templates de mapeamento de importação',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [server.authenticate, authorize('colaborador', 'operador', 'administrador')],
      },
      async (_request, reply) => {
        try {
          const result = await server.database.query(`
          SELECT * FROM mapeamentos_importacao ORDER BY criado_em DESC
        `);
          return reply.send({ mapeamentos: result.rows });
        } catch (error) {
          return reply.send({ mapeamentos: [] });
        }
      }
    );

    // POST /producao/mapeamentos - Criar template de mapeamento
    server.post(
      '/producao/mapeamentos',
      {
        schema: {
          tags: ['metas'],
          summary: 'Criar template de mapeamento',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            required: ['nome', 'mapeamento'],
            properties: {
              nome: { type: 'string' },
              mapeamento: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
          response: {
            201: { type: 'object', additionalProperties: true },
            500: { type: 'object', properties: { error: { type: 'string' } } },
          },
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { nome, mapeamento } = request.body as {
            nome: string;
            mapeamento: Record<string, string>;
          };

          const result = await server.database.query(
            `INSERT INTO mapeamentos_importacao (nome, mapeamento, criado_em)
           VALUES ($1, $2, NOW()) RETURNING *`,
            [nome, JSON.stringify(mapeamento)]
          );

          return reply.status(201).send(result.rows[0]);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao criar mapeamento';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /producao/meu-historico - Histórico individual do colaborador logado
    server.get(
      '/producao/meu-historico',
      {
        schema: {
          tags: ['metas'],
          summary: 'Visualizar próprio histórico de produção (colaborador)',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              dataInicio: { type: 'string', format: 'date' },
              dataFim: { type: 'string', format: 'date' },
              etapa: { type: 'string' },
              busca: { type: 'string' },
              limite: { type: 'number', default: 50 },
              pagina: { type: 'number', default: 1 },
            },
          },
        },
        preHandler: [server.authenticate, authorize('colaborador', 'operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const {
            dataInicio,
            dataFim,
            etapa,
            busca,
            limite = 50,
            pagina = 1,
          } = request.query as {
            dataInicio?: string;
            dataFim?: string;
            etapa?: string;
            busca?: string;
            limite?: number;
            pagina?: number;
          };

          const offset = (Number(pagina) - 1) * Number(limite);
          const dataProducaoLocal = sqlDateInSystemTimezone('pr');
          const conditions: string[] = [
            'pr.usuario_id = $1',
            buildProducaoContabilizadaWhere('pr'),
          ];
          const params: unknown[] = [user.id];
          let idx = 2;

          if (dataInicio) {
            conditions.push(`${dataProducaoLocal} >= $${idx}::date`);
            params.push(dataInicio);
            idx++;
          }

          if (dataFim) {
            conditions.push(`${dataProducaoLocal} <= $${idx}::date`);
            params.push(dataFim);
            idx++;
          }

          if (etapa) {
            conditions.push(`LOWER(COALESCE(NULLIF(TRIM(pr.marcadores->>'funcao'), ''),
              CASE pr.etapa::text
                WHEN 'RECEBIMENTO' THEN 'Recebimento'
                WHEN 'PREPARACAO' THEN 'Preparação'
                WHEN 'DIGITALIZACAO' THEN 'Digitalização P/B'
                WHEN 'CONFERENCIA' THEN 'Conferência'
                WHEN 'MONTAGEM' THEN 'Montagem'
                WHEN 'CONTROLE_QUALIDADE' THEN 'Reconferência'
                WHEN 'ENTREGA' THEN 'Entrega'
                ELSE pr.etapa::text
              END
            )) = LOWER($${idx})`);
            params.push(etapa);
            idx++;
          }

          if (busca) {
            conditions.push(`r.id_repositorio_ged ILIKE $${idx}`);
            params.push(`%${busca}%`);
            idx++;
          }

          const where = conditions.join(' AND ');

          // Count total + stats agregados
          const [statsResult, porEtapaResult, porTipoResult] = await Promise.all([
            server.database.query<{
              count: string;
              total_quantidade: string;
              registros_7dias: string;
              quantidade_7dias: string;
            }>(
              `SELECT 
                 COUNT(*) as count,
                 COALESCE(SUM(pr.quantidade), 0)::text as total_quantidade,
                 COUNT(*) FILTER (WHERE ${dataProducaoLocal} >= ${sqlLastNDaysStartInSystemTimezone(7)})::text as registros_7dias,
                 COALESCE(SUM(pr.quantidade) FILTER (WHERE ${dataProducaoLocal} >= ${sqlLastNDaysStartInSystemTimezone(7)}), 0)::text as quantidade_7dias
               FROM producao_repositorio pr
               JOIN repositorios r ON r.id_repositorio_recorda = pr.repositorio_id
               WHERE ${where}`,
              params
            ),
            server.database.query<{
              etapa: string;
              registros: string;
              quantidade: string;
            }>(
              `SELECT 
                 COALESCE(NULLIF(TRIM(pr.marcadores->>'funcao'), ''),
                   CASE pr.etapa::text
                     WHEN 'RECEBIMENTO' THEN 'Recebimento'
                     WHEN 'PREPARACAO' THEN 'Preparação'
                     WHEN 'DIGITALIZACAO' THEN 'Digitalização P/B'
                     WHEN 'CONFERENCIA' THEN 'Conferência'
                     WHEN 'MONTAGEM' THEN 'Montagem'
                     WHEN 'CONTROLE_QUALIDADE' THEN 'Reconferência'
                     WHEN 'ENTREGA' THEN 'Entrega'
                     ELSE pr.etapa::text
                   END
                 ) AS etapa,
                 COUNT(*)::text AS registros,
                 COALESCE(SUM(pr.quantidade), 0)::text AS quantidade
               FROM producao_repositorio pr
               JOIN repositorios r ON r.id_repositorio_recorda = pr.repositorio_id
               WHERE ${where}
               GROUP BY 1
               ORDER BY quantidade DESC`,
              params
            ),
            server.database.query<{
              tipo: string;
              registros: string;
              quantidade: string;
            }>(
              `SELECT 
                 CASE 
                   WHEN LOWER(COALESCE(NULLIF(TRIM(pr.marcadores->>'tipo'), ''), 'Não informado')) LIKE '%imag%' THEN 'Imagens'
                   WHEN LOWER(COALESCE(NULLIF(TRIM(pr.marcadores->>'tipo'), ''), 'Não informado')) LIKE '%caix%' THEN 'Caixas'
                   WHEN COALESCE(NULLIF(TRIM(pr.marcadores->>'tipo'), ''), '') = '' THEN 'Não informado'
                   ELSE TRIM(pr.marcadores->>'tipo')
                 END AS tipo,
                 COUNT(*)::text AS registros,
                 COALESCE(SUM(pr.quantidade), 0)::text AS quantidade
               FROM producao_repositorio pr
               JOIN repositorios r ON r.id_repositorio_recorda = pr.repositorio_id
               WHERE ${where}
               GROUP BY 1
               ORDER BY quantidade DESC`,
              params
            ),
          ]);
          const total = Number(statsResult.rows[0]?.count ?? 0);
          const totalQuantidade = Number(statsResult.rows[0]?.total_quantidade ?? 0);
          const registrosUltimos7Dias = Number(statsResult.rows[0]?.registros_7dias ?? 0);
          const quantidadeUltimos7Dias = Number(statsResult.rows[0]?.quantidade_7dias ?? 0);

          const producaoPorEtapa = porEtapaResult.rows.map((r) => ({
            etapa: r.etapa,
            registros: Number(r.registros),
            quantidade: Number(r.quantidade),
          }));

          const producaoPorTipo = porTipoResult.rows.map((r) => ({
            tipo: r.tipo,
            registros: Number(r.registros),
            quantidade: Number(r.quantidade),
          }));

          // Buscar TODAS as etapas disponíveis para o dropdown (sem filtros de data/etapa)
          const etapasDisponiveisResult = await server.database.query<{ etapa: string }>(
            `SELECT DISTINCT
               COALESCE(NULLIF(TRIM(pr.marcadores->>'funcao'), ''),
                 CASE pr.etapa::text
                   WHEN 'RECEBIMENTO' THEN 'Recebimento'
                   WHEN 'PREPARACAO' THEN 'Preparação'
                   WHEN 'DIGITALIZACAO' THEN 'Digitalização P/B'
                   WHEN 'CONFERENCIA' THEN 'Conferência'
                   WHEN 'MONTAGEM' THEN 'Montagem'
                   WHEN 'CONTROLE_QUALIDADE' THEN 'Reconferência'
                   WHEN 'ENTREGA' THEN 'Entrega'
                   ELSE pr.etapa::text
                 END
               ) AS etapa
             FROM producao_repositorio pr
             JOIN repositorios r ON r.id_repositorio_recorda = pr.repositorio_id
             WHERE pr.usuario_id = $1
               AND ${buildProducaoContabilizadaWhere('pr')}
             ORDER BY etapa`,
            [user.id]
          );

          // Get paginated data with repository info
          params.push(Number(limite), offset);
          const result = await server.database.query(
            `SELECT 
               pr.id,
               pr.etapa,
               pr.quantidade,
               pr.data_producao,
               pr.marcadores,
               r.id_repositorio_ged,
               r.orgao,
               r.projeto,
               COALESCE(NULLIF(TRIM(pr.marcadores->>'funcao'), ''),
                 CASE pr.etapa::text
                   WHEN 'RECEBIMENTO' THEN 'Recebimento'
                   WHEN 'PREPARACAO' THEN 'Preparação'
                   WHEN 'DIGITALIZACAO' THEN 'Digitalização P/B'
                   WHEN 'CONFERENCIA' THEN 'Conferência'
                   WHEN 'MONTAGEM' THEN 'Montagem'
                   WHEN 'CONTROLE_QUALIDADE' THEN 'Reconferência'
                   WHEN 'ENTREGA' THEN 'Entrega'
                   ELSE pr.etapa::text
                 END
               ) AS etapa_label,
               CASE 
                 WHEN LOWER(COALESCE(NULLIF(TRIM(pr.marcadores->>'tipo'), ''), '')) LIKE '%imag%' THEN 'Imagens'
                 WHEN LOWER(COALESCE(NULLIF(TRIM(pr.marcadores->>'tipo'), ''), '')) LIKE '%caix%' THEN 'Caixas'
                 WHEN COALESCE(NULLIF(TRIM(pr.marcadores->>'tipo'), ''), '') = '' THEN 'Não informado'
                 ELSE TRIM(pr.marcadores->>'tipo')
               END AS tipo_label,
               UPPER(COALESCE(NULLIF(TRIM(pr.marcadores->>'coordenadoria'), ''), NULLIF(TRIM(r.orgao), ''), 'NAO INFORMADO')) AS coordenadoria_label
             FROM producao_repositorio pr
             JOIN repositorios r ON r.id_repositorio_recorda = pr.repositorio_id
             WHERE ${where}
             ORDER BY pr.data_producao DESC
             LIMIT $${idx} OFFSET $${idx + 1}`,
            params
          );

          return reply.send({
            producoes: result.rows,
            total,
            totalQuantidade,
            registrosUltimos7Dias,
            quantidadeUltimos7Dias,
            producaoPorEtapa,
            producaoPorTipo,
            etapasDisponiveis: etapasDisponiveisResult.rows.map((r) => r.etapa),
            pagina: Number(pagina),
            totalPaginas: Math.ceil(total / Number(limite)),
            escopoProducao: {
              id: PRODUCAO_ESCOPOS.contabilizada,
              timezone: SYSTEM_TIMEZONE,
              descricao: PRODUCAO_CONTABILIZADA_DESCRICAO,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar histórico';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // PATCH /producao/:id/vincular-usuario - Vincular produção a usuário (admin)
    server.patch(
      '/producao/:id/vincular-usuario',
      {
        schema: {
          tags: ['metas'],
          summary: 'Vincular/reatribuir registro de produção a outro usuário (admin)',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
          body: {
            type: 'object',
            required: ['usuarioId'],
            properties: {
              usuarioId: { type: 'string', format: 'uuid' },
            },
          },
        },
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { id } = request.params as { id: string };
          const { usuarioId } = request.body as { usuarioId: string };

          // Verificar se o usuário de destino existe e está ativo
          const userCheck = await server.database.query<{ id: string }>(
            `SELECT id FROM usuarios WHERE id = $1 AND ativo = TRUE`,
            [usuarioId]
          );

          if (userCheck.rows.length === 0) {
            return reply
              .status(404)
              .send({ error: 'Usuário de destino não encontrado ou inativo' });
          }

          // Atualizar a produção
          const result = await server.database.query(
            `UPDATE producao_repositorio 
             SET usuario_id = $1 
             WHERE id = $2 
             RETURNING *`,
            [usuarioId, id]
          );

          if (result.rows.length === 0) {
            return reply.status(404).send({ error: 'Registro de produção não encontrado' });
          }

          return reply.send({
            message: 'Produção vinculada com sucesso',
            producao: result.rows[0],
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao vincular produção';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // POST /producao/lancar-direto - Lançamento direto de produção por colaboradores
    server.post(
      '/producao/lancar-direto',
      {
        schema: {
          tags: ['producao'],
          summary: 'Lançar produção diretamente (colaboradores)',
          security: [{ bearerAuth: [] }],
        },
        preHandler: [
          server.authenticate,
          authorize('colaborador', 'operador', 'administrador'),
          validateBody(lancarProducaoColaboradorSchema),
        ],
      },
      async (request, reply) => {
        try {
          const user = getCurrentUser(request);
          const body = request.body as {
            data?: string;
            repositorio: string;
            etapa: string;
            funcao?: string;
            coordenadoria?: string;
            quantidade?: number | string;
            tipo?: string;
          };

          const PROJETO_IMPORTACAO_PRODUCAO = 'IMPORTACAO_PRODUCAO';
          const quantidade = Number(body.quantidade);
          if (!Number.isInteger(quantidade) || quantidade <= 0) {
            return reply.status(400).send({
              error: 'Quantidade inválida. Informe um número inteiro maior que zero.',
            });
          }

          const anoReferencia = body.data ? new Date(body.data).getFullYear() : undefined;
          const repoId = normalizeIdRepositorioGed(body.repositorio.trim(), anoReferencia);
          const orgaoRepositorio = body.coordenadoria?.trim() || 'SGPA';

          // Mapa de etapa para status (igual importação legada)
          const etapaStatusMap: Record<string, StatusRepositorio> = {
            RECEBIMENTO: 'RECEBIDO',
            PREPARACAO: 'EM_PREPARACAO',
            DIGITALIZACAO: 'EM_DIGITALIZACAO',
            CONFERENCIA: 'EM_CONFERENCIA',
            RECONFERENCIA: 'EM_CONFERENCIA',
            MONTAGEM: 'EM_MONTAGEM',
            ATENDIMENTO: 'EM_ENTREGA',
            CONTROLE_QUALIDADE: 'AGUARDANDO_CQ_LOTE',
            ENTREGA: 'EM_ENTREGA',
          };
          const statusRepositorio = etapaStatusMap[body.etapa as EtapaFluxo] ?? 'RECEBIDO';

          // Buscar ou criar repositório (mesma lógica da importação)
          const repositorioResult = await server.database.query(
            `SELECT id_repositorio_recorda FROM repositorios
             WHERE id_repositorio_ged = $1 AND orgao = $2 AND projeto = $3`,
            [repoId, orgaoRepositorio, PROJETO_IMPORTACAO_PRODUCAO]
          );

          let repositorioId = repositorioResult.rows[0]?.id_repositorio_recorda;

          if (!repositorioId) {
            const createResult = await server.database.query(
              `INSERT INTO repositorios 
               (id_repositorio_ged, orgao, projeto, status_atual, etapa_atual)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (id_repositorio_ged, orgao, projeto) DO UPDATE 
                 SET id_repositorio_ged = EXCLUDED.id_repositorio_ged
               RETURNING id_repositorio_recorda`,
              [repoId, orgaoRepositorio, PROJETO_IMPORTACAO_PRODUCAO, statusRepositorio, body.etapa]
            );
            repositorioId = createResult.rows[0]?.id_repositorio_recorda;
          }

          if (!repositorioId) {
            return reply.status(500).send({ error: 'Erro ao criar/localizar repositório' });
          }

          // Criar ou buscar checklist concluído
          const checklistResult = await server.database.query(
            `SELECT id FROM checklists
             WHERE repositorio_id = $1 AND etapa = $2 AND status = 'CONCLUIDO'
             ORDER BY criado_em DESC LIMIT 1`,
            [repositorioId, body.etapa]
          );

          let checklistId = checklistResult.rows[0]?.id;

          if (!checklistId) {
            const createChecklistResult = await server.database.query(
              `INSERT INTO checklists (repositorio_id, etapa, status, responsavel_id, data_conclusao, ativo)
               VALUES ($1, $2, 'CONCLUIDO', $3, NOW(), FALSE)
               RETURNING id`,
              [repositorioId, body.etapa, user.id]
            );
            checklistId = createChecklistResult.rows[0]?.id;
          }

          const etapaFuncaoFallback: Record<string, string> = {
            RECEBIMENTO: 'Recebimento',
            PREPARACAO: 'Preparação',
            DIGITALIZACAO: 'Digitalização P/B',
            CONFERENCIA: 'Conferência',
            RECONFERENCIA: 'Reconferência',
            MONTAGEM: 'Montagem',
            ATENDIMENTO: 'Atendimento',
            CONTROLE_QUALIDADE: 'Controle de Qualidade',
            ENTREGA: 'Entrega',
          };
          const tipoMarcador = (body.tipo ?? '').trim();
          const funcaoMarcador =
            (body.funcao ?? '').trim() || etapaFuncaoFallback[body.etapa] || body.etapa;
          const coordenadoriaMarcador = (body.coordenadoria ?? '').trim();

          const marcadores = {
            funcao: funcaoMarcador,
            tipo: tipoMarcador,
            coordenadoria: coordenadoriaMarcador,
            origem: 'SISTEMA', // Marca produção lançada diretamente no sistema (vs LEGADO = importada)
          };

          if (!body.data) {
            return reply.status(400).send({
              error: 'Data de produção inválida. Corrija a data antes de lançar.',
            });
          }
          const dataProducao = body.data;

          // Sequência obrigatória de etapas
          const sequenciaEtapas: Record<string, { ordem: number; anterior?: string }> = {
            RECEBIMENTO: { ordem: 1 },
            PREPARACAO: { ordem: 2, anterior: 'RECEBIMENTO' },
            DIGITALIZACAO: { ordem: 3, anterior: 'PREPARACAO' },
            CONFERENCIA: { ordem: 4, anterior: 'DIGITALIZACAO' },
            RECONFERENCIA: { ordem: 5, anterior: 'CONFERENCIA' },
            MONTAGEM: { ordem: 6, anterior: 'RECONFERENCIA' },
            ATENDIMENTO: { ordem: 7, anterior: 'MONTAGEM' },
          };

          // Bloquear quando a mesma etapa já foi importada do legado para o repositório/coordenadoria.
          const legadoExistente = await server.database.query(
            `SELECT id
             FROM producao_repositorio
             WHERE repositorio_id = $1
               AND etapa = $2
               AND COALESCE(marcadores->>'origem', '') = 'LEGADO'
               AND COALESCE(marcadores->>'coordenadoria', '') = $3
             LIMIT 1`,
            [repositorioId, body.etapa, coordenadoriaMarcador]
          );

          if (legadoExistente.rows.length > 0) {
            return reply.status(409).send({
              error: 'Produção já importada do legado',
              message: `O repositório ${repoId} já possui produção legada na etapa ${body.etapa}.`,
              detalhes: {
                repositorio: repoId,
                etapa: body.etapa,
                coordenadoria: body.coordenadoria?.trim() || 'SGPA',
                origemExistente: 'LEGADO',
              },
            });
          }

          // Verificar se já existe registro idêntico NA MESMA ETAPA (previne duplicatas exatas)
          const existente = await server.database.query(
            `SELECT id, quantidade
             FROM producao_repositorio
             WHERE usuario_id = $1
               AND repositorio_id = $2
               AND (data_producao AT TIME ZONE 'America/Cuiaba')::date = $3::date
               AND etapa = $4
               AND COALESCE(marcadores->>'origem', '') = 'SISTEMA'
               AND COALESCE(marcadores->>'tipo', '') = $5
               AND COALESCE(marcadores->>'funcao', '') = $6
               AND COALESCE(marcadores->>'coordenadoria', '') = $7
             LIMIT 1`,
            [
              user.id,
              repositorioId,
              dataProducao,
              body.etapa,
              tipoMarcador,
              funcaoMarcador,
              coordenadoriaMarcador,
            ]
          );

          if (existente.rows.length > 0) {
            const registroExistente = existente.rows[0];
            if (registroExistente && Number(registroExistente.quantidade) === quantidade) {
              return reply.status(409).send({
                error: 'Produção duplicada',
                message: `Você já lançou esta produção: ${body.etapa} - ${repoId} - ${quantidade} unidade(s) na data ${new Date(dataProducao).toLocaleDateString('pt-BR')}`,
                detalhes: {
                  registroExistenteId: registroExistente.id,
                  repositorio: repoId,
                  etapa: body.etapa,
                  quantidade,
                  data: dataProducao,
                },
              });
            }
          }

          // Validar sequência de etapas (não pode pular etapas)
          const etapaAtual = sequenciaEtapas[body.etapa];
          if (etapaAtual && etapaAtual.anterior) {
            // Verificar se a etapa anterior já foi cumprida para este repositório+coordenadoria
            const etapaAnteriorExiste = await server.database.query(
              `SELECT id
               FROM producao_repositorio
               WHERE repositorio_id = $1
                 AND etapa = $2
                 AND COALESCE(marcadores->>'coordenadoria', '') = $3
               LIMIT 1`,
              [repositorioId, etapaAtual.anterior, coordenadoriaMarcador]
            );

            if (etapaAnteriorExiste.rows.length === 0) {
              return reply.status(422).send({
                error: 'Sequência de etapas inválida',
                message: `Não é possível lançar produção na etapa ${body.etapa} sem ter passado pela etapa ${etapaAtual.anterior} primeiro.`,
                detalhes: {
                  repositorio: repoId,
                  coordenadoria: coordenadoriaMarcador || 'SGPA',
                  etapaAtual: body.etapa,
                  etapaAnteriorNecessaria: etapaAtual.anterior,
                  sequenciaCompleta: Object.keys(sequenciaEtapas),
                },
              });
            }
          }

          const producaoResult = await server.database.query(
            `INSERT INTO producao_repositorio 
             (repositorio_id, etapa, checklist_id, usuario_id, quantidade, marcadores, data_producao)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, ($7::date)::timestamp AT TIME ZONE '${SYSTEM_TIMEZONE}')
             RETURNING *`,
            [
              repositorioId,
              body.etapa,
              checklistId,
              user.id,
              quantidade,
              JSON.stringify(marcadores),
              dataProducao,
            ]
          );

          return reply.status(201).send({
            message: 'Produção registrada com sucesso',
            producao: producaoResult.rows[0],
          });
        } catch (error) {
          request.log.error(error);
          const message = error instanceof Error ? error.message : 'Erro ao registrar produção';
          return reply.status(500).send({ error: message });
        }
      }
    );
  };
}
