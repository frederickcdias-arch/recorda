import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { getCurrentUser } from './operacional-helpers.js';

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
            WHERE COALESCE(marcadores->>'origem', '') = 'LEGADO'
              AND TRIM(marcadores->>'colaborador_nome') != ''
            GROUP BY TRIM(marcadores->>'colaborador_nome')
            ORDER BY total_producoes DESC
          `);

          return reply.send(result.rows);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar colaboradores do legado';
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
              u.ativo,
              COUNT(pr.id) as total_producoes_vinculadas,
              c.nome as coordenadoria_nome,
              c.sigla as coordenadoria_sigla
            FROM usuarios u
            LEFT JOIN producao_repositorio pr ON pr.usuario_id = u.id
            LEFT JOIN coordenadorias c ON c.id = u.coordenadoria_id
            WHERE u.perfil = 'colaborador'
            GROUP BY u.id, u.nome, u.email, u.ativo, c.nome, c.sigla
            ORDER BY u.nome
          `);

          return reply.send(result.rows);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar usuários colaboradores';
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
               AND COALESCE(marcadores->>'origem', '') = 'LEGADO'`,
            [colaboradorNomeLegado]
          );

          const totalProducoes = Number(countResult.rows[0]?.total ?? 0);

          if (totalProducoes === 0) {
            return reply.status(404).send({ 
              error: 'Nenhuma produção encontrada para este colaborador no sistema legado' 
            });
          }

          // Executar vinculação
          const updateResult = await server.database.query(
            `UPDATE producao_repositorio
             SET usuario_id = $1
             WHERE LOWER(TRIM(marcadores->>'colaborador_nome')) = LOWER($2)
               AND COALESCE(marcadores->>'origem', '') = 'LEGADO'
             RETURNING id`,
            [usuarioId, colaboradorNomeLegado]
          );

          const vinculadas = updateResult.rowCount ?? 0;

          request.log.info({
            admin: adminUser.id,
            colaboradorLegado: colaboradorNomeLegado,
            usuarioId,
            vinculadas,
          }, 'Produções legadas vinculadas a colaborador');

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

          const result = await server.database.query(`
            SELECT 
              pr.data_producao::date as data,
              pr.etapa,
              COUNT(*) as registros,
              SUM(pr.quantidade) as quantidade_total,
              ARRAY_AGG(DISTINCT r.id_repositorio_ged) as repositorios
            FROM producao_repositorio pr
            JOIN repositorios r ON r.id_repositorio_recorda = pr.repositorio_id
            WHERE LOWER(TRIM(pr.marcadores->>'colaborador_nome')) = LOWER($1)
              AND COALESCE(pr.marcadores->>'origem', '') = 'LEGADO'
            GROUP BY pr.data_producao::date, pr.etapa
            ORDER BY pr.data_producao::date DESC, pr.etapa
            LIMIT 100
          `, [decodeURIComponent(colaboradorNome)]);

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
          INSERT INTO auditoria (entidade, entidade_id, acao, usuario_id, ip_address, user_agent)
          VALUES ('sistema', 'otimizacao', 'otimizar_banco', $1, $2, $3)
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
