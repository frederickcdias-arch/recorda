import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { getCurrentUser } from './operacional-helpers.js';

export function createAdminRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    
    // POST /admin/limpar-duplicatas-producao - Remove duplicate production records
    server.post('/admin/limpar-duplicatas-producao', {
      schema: { 
        tags: ['admin'], 
        summary: 'Remover duplicatas de produção', 
        security: [{ bearerAuth: [] }] 
      },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (_request, reply) => {
      try {
        // Find and remove duplicates based on comprehensive criteria
        const duplicatesResult = await server.database.query(`
          WITH duplicates AS (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY 
                usuario_id, 
                repositorio_id, 
                DATE(data_producao AT TIME ZONE 'America/Sao_Paulo'),
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
          mensagem: `${removidos} duplicatas removidas com sucesso.`
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao limpar duplicatas de produção';
        return reply.status(500).send({ error: message });
      }
    });

    // POST /admin/limpar-duplicatas-recebimento - Remove duplicate receiving records
    server.post('/admin/limpar-duplicatas-recebimento', {
      schema: { 
        tags: ['admin'], 
        summary: 'Remover duplicatas de recebimento', 
        security: [{ bearerAuth: [] }] 
      },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (_request, reply) => {
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
        
        const removidos = (processosResult.rowCount || 0) + (volumesResult.rowCount || 0) + (apensosResult.rowCount || 0);
        
        return reply.send({
          removidos,
          detalhes: {
            processos: processosResult.rowCount || 0,
            volumes: volumesResult.rowCount || 0,
            apensos: apensosResult.rowCount || 0
          },
          mensagem: `${removidos} duplicatas removidas com sucesso.`
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao limpar duplicatas de recebimento';
        return reply.status(500).send({ error: message });
      }
    });

    // POST /admin/recontar-producao - Recount production statistics
    server.post('/admin/recontar-producao', {
      schema: { 
        tags: ['admin'], 
        summary: 'Recontar estatísticas de produção', 
        security: [{ bearerAuth: [] }] 
      },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (_request, reply) => {
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
            COUNT(DISTINCT DATE(data_producao AT TIME ZONE 'America/Sao_Paulo')) as dias_unicos,
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
            fim: stats.data_ultima
          },
          mensagem: 'Recontagem concluída com sucesso.'
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao recontar produção';
        return reply.status(500).send({ error: message });
      }
    });

    // POST /admin/otimizar-banco - Optimize database performance
    server.post('/admin/otimizar-banco', {
      schema: { 
        tags: ['admin'], 
        summary: 'Otimizar banco de dados', 
        security: [{ bearerAuth: [] }] 
      },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const user = getCurrentUser(request);
        
        // Analyze all tables to update statistics
        const tables = [
          'usuarios', 'repositorios', 'producao_repositorio',
          'recebimento_processos', 'recebimento_volumes', 'recebimento_apensos',
          'checklists', 'checklist_itens', 'lotes_cq', 'lotes_cq_itens',
          'importacoes_legado_operacional', 'fontes_importacao'
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
              error: error instanceof Error ? error.message : 'Erro desconhecido' 
            });
          }
        }
        
        // Reindex if needed (optional, can be expensive)
        // await server.database.query('REINDEX DATABASE');
        
        // Log the optimization
        await server.database.query(`
          INSERT INTO auditoria (entidade, entidade_id, acao, usuario_id, ip_address, user_agent)
          VALUES ('sistema', 'otimizacao', 'otimizar_banco', $1, $2, $3)
        `, [user.id, request.ip, request.headers['user-agent'] || '']);
        
        return reply.send({
          tabelas: results,
          sucesso: results.filter(r => r.status === 'ok').length,
          erros: results.filter(r => r.status === 'error').length,
          mensagem: 'Otimização concluída.'
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao otimizar banco';
        return reply.status(500).send({ error: message });
      }
    });

    // GET /admin/health-check - Comprehensive system health check
    server.get('/admin/health-check', {
      schema: { 
        tags: ['admin'], 
        summary: 'Verificação de saúde do sistema', 
        security: [{ bearerAuth: [] }] 
      },
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (_request, reply) => {
      try {
        const health = {
          database: 'ok',
          tables: {} as Record<string, any>,
          timestamp: new Date().toISOString()
        };
        
        // Check table counts and recent activity
        const tables = [
          { name: 'usuarios', critical: true },
          { name: 'repositorios', critical: true },
          { name: 'producao_repositorio', critical: false },
          { name: 'recebimento_processos', critical: false }
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
              status: 'ok'
            };
          } catch (error) {
            health.tables[table.name] = {
              status: 'error',
              error: error instanceof Error ? error.message : 'Erro desconhecido'
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
    });
  };
}
