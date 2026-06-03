import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import {
  buildProducaoContabilizadaWhere,
  sqlDateInSystemTimezone,
  sqlMonthStartInSystemTimezone,
  sqlTodayInSystemTimezone,
} from '../../../domain/producao/producao-metrics.js';

interface ProducaoPorEtapa {
  etapa: string;
  valor: number;
}

interface StatusRecebimento {
  status: string;
  valor: number;
  icon: string;
}

interface Alerta {
  tipo: 'info' | 'warning' | 'error';
  titulo: string;
  descricao: string;
}

export function createDashboardRoutes(): FastifyPluginAsync {
  return async (server: FastifyInstance): Promise<void> => {
    server.get(
      '/dashboard',
      {
        schema: {
          tags: ['dashboard'],
          summary: 'Dados do dashboard operacional',
          description:
            'Retorna estatísticas de produção, status de recebimento, alertas, backlog por etapa, tempo médio e retrabalho CQ.',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'object',
              properties: {
                stats: {
                  type: 'object',
                  properties: {
                    producaoTotal: { type: 'number' },
                    producaoTrend: { type: 'string' },
                    processosAtivos: { type: 'number' },
                    processosNovosHoje: { type: 'number' },
                    colaboradoresAtivos: { type: 'number' },
                  },
                },
                producaoPorEtapa: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      etapa: { type: 'string' },
                      valor: { type: 'number' },
                      cor: { type: 'string' },
                    },
                  },
                },
                statusRecebimento: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      valor: { type: 'number' },
                      icon: { type: 'string' },
                      cor: { type: 'string' },
                    },
                  },
                },
                alertas: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      tipo: { type: 'string' },
                      titulo: { type: 'string' },
                      descricao: { type: 'string' },
                    },
                  },
                },
                backlogPorEtapa: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { etapa: { type: 'string' }, total: { type: 'number' } },
                  },
                },
                tempoMedioPorEtapa: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { etapa: { type: 'string' }, mediaHoras: { type: 'number' } },
                  },
                },
                retrabalhoCQ: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      motivo: { type: 'string' },
                      total: { type: 'number' },
                      repositorios: { type: 'string' },
                    },
                  },
                },
              },
            },
            500: { type: 'object', properties: { error: { type: 'string' } } },
          },
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador', 'visualizador')],
      },
      async (_request, reply) => {
        try {
          const producaoContabilizadaWhere = buildProducaoContabilizadaWhere('p');
          const dataProducaoLocal = sqlDateInSystemTimezone('p');
          const inicioMes = sqlMonthStartInSystemTimezone();
          const inicioHoje = sqlTodayInSystemTimezone();

          const [
            producaoMesAtualResult,
            producaoMesAnteriorResult,
            processosAtivosResult,
            processosHojeResult,
            colaboradoresAtivosResult,
            producaoPorEtapaResult,
            paradosResult,
            divergenciasResult,
            checklistPendenteResult,
            importacoesLegadoComErroResult,
            backlogPorEtapaResult,
            tempoMedioPorEtapaResult,
            retrabalhoCQResult,
          ] = await Promise.all([
            server.database.query<{ total: string }>(
              `SELECT COALESCE(SUM(p.quantidade), 0)::text AS total
             FROM producao_repositorio p
             JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
             WHERE ${dataProducaoLocal} >= ${inicioMes}
               AND ${producaoContabilizadaWhere}`
            ),
            server.database.query<{ total: string }>(
              `SELECT COALESCE(SUM(p.quantidade), 0)::text AS total
             FROM producao_repositorio p
             JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
             WHERE ${dataProducaoLocal} >= (${inicioMes} - INTERVAL '1 month')::date
               AND ${dataProducaoLocal} < ${inicioMes}
               AND ${producaoContabilizadaWhere}`
            ),
            server.database.query<{ total: string }>(
              `SELECT COUNT(DISTINCT p.repositorio_id)::text AS total
             FROM producao_repositorio p
             JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
             WHERE ${producaoContabilizadaWhere}`
            ),
            server.database.query<{ total: string }>(
              `SELECT COUNT(DISTINCT p.repositorio_id)::text AS total
             FROM producao_repositorio p
             JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
             WHERE ${dataProducaoLocal} = ${inicioHoje}
               AND ${producaoContabilizadaWhere}`
            ),
            server.database.query<{ total: string }>(
              `SELECT COUNT(*)::text AS total
             FROM usuarios
             WHERE ativo = TRUE`
            ),
            server.database.query<{ etapa: string; valor: string }>(
              `SELECT
               COALESCE(NULLIF(TRIM(p.marcadores->>'funcao'), ''),
                 CASE p.etapa::text
                   WHEN 'RECEBIMENTO' THEN 'Recebimento'
                   WHEN 'PREPARACAO' THEN 'Preparação'
                   WHEN 'DIGITALIZACAO' THEN 'Digitalização P/B'
                   WHEN 'CONFERENCIA' THEN 'Conferência'
                   WHEN 'MONTAGEM' THEN 'Montagem'
                   WHEN 'CONTROLE_QUALIDADE' THEN 'Reconferência'
                   WHEN 'ENTREGA' THEN 'Entrega'
                   ELSE p.etapa::text
                 END
               ) AS etapa,
               COALESCE(SUM(p.quantidade), 0)::text AS valor
             FROM producao_repositorio p
             JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
             WHERE ${dataProducaoLocal} >= ${inicioMes}
               AND ${producaoContabilizadaWhere}
             GROUP BY 1
             ORDER BY
               CASE UPPER(COALESCE(NULLIF(TRIM(p.marcadores->>'funcao'), ''),
                 CASE p.etapa::text
                   WHEN 'RECEBIMENTO' THEN 'Recebimento'
                   WHEN 'PREPARACAO' THEN 'Preparação'
                   WHEN 'DIGITALIZACAO' THEN 'Digitalização P/B'
                   WHEN 'CONFERENCIA' THEN 'Conferência'
                   WHEN 'MONTAGEM' THEN 'Montagem'
                   WHEN 'CONTROLE_QUALIDADE' THEN 'Reconferência'
                   WHEN 'ENTREGA' THEN 'Entrega'
                   ELSE p.etapa::text
                 END))
                 WHEN 'RECEBIMENTO' THEN 1
                 WHEN 'PREPARAÇÃO' THEN 2
                 WHEN 'PREPARACAO' THEN 2
                 WHEN 'DIGITALIZAÇÃO P/B' THEN 3
                 WHEN 'DIGITALIZACAO P/B' THEN 3
                 WHEN 'DIGITALIZAÇÃO COLORIDA' THEN 4
                 WHEN 'DIGITALIZACAO COLORIDA' THEN 4
                 WHEN 'CONFERÊNCIA' THEN 5
                 WHEN 'CONFERENCIA' THEN 5
                 WHEN 'MONTAGEM' THEN 6
                 WHEN 'RECONFERÊNCIA' THEN 7
                 WHEN 'RECONFERENCIA' THEN 7
                 WHEN 'ENTREGA' THEN 8
                 ELSE 99
               END`
            ),
            server.database.query<{ total: string }>(
              `SELECT COUNT(*)::text AS total
             FROM repositorios
             WHERE status_atual NOT IN ('ENTREGUE', 'CQ_APROVADO')
               AND atualizado_em < (CURRENT_TIMESTAMP - INTERVAL '48 hours')`
            ),
            server.database.query<{ total: string }>(
              `SELECT COUNT(*)::text AS total
             FROM excecoes_repositorio
             WHERE status_tratativa IN ('ABERTA', 'EM_TRATATIVA')`
            ),
            server.database.query<{ total: string }>(
              `SELECT COUNT(*)::text AS total
             FROM repositorios r
             WHERE r.status_atual <> 'ENTREGUE'
               AND NOT EXISTS (
                 SELECT 1
                 FROM checklists c
                 WHERE c.repositorio_id = r.id_repositorio_recorda
                   AND c.etapa = r.etapa_atual
                   AND c.ativo = TRUE
               )`
            ),
            server.database.query<{ total: string }>(
              `SELECT COUNT(*)::text AS total
             FROM importacoes_legado_operacional
             WHERE criado_em >= (CURRENT_TIMESTAMP - INTERVAL '24 hours')
               AND registros_erro > 0`
            ),
            // Backlog por etapa
            server.database.query<{ etapa: string; total: string }>(
              `SELECT r.etapa_atual AS etapa, COUNT(*)::text AS total
             FROM repositorios r
             WHERE r.status_atual NOT IN ('ENTREGUE', 'CQ_REPROVADO', 'CQ_APROVADO')
             GROUP BY r.etapa_atual
             ORDER BY r.etapa_atual`
            ),
            // Tempo médio por etapa (horas entre entrada e saída de cada etapa)
            server.database.query<{ etapa: string; media_horas: string }>(
              `SELECT etapa_origem AS etapa,
                    ROUND(AVG(EXTRACT(EPOCH FROM (prox_evento - data_evento)) / 3600.0), 1)::text AS media_horas
             FROM (
               SELECT h.etapa_origem,
                      h.data_evento,
                      LEAD(h.data_evento) OVER (
                        PARTITION BY h.repositorio_id ORDER BY h.data_evento
                      ) AS prox_evento
               FROM historico_etapas h
               WHERE h.etapa_origem IS NOT NULL
             ) sub
             WHERE prox_evento IS NOT NULL
             GROUP BY etapa_origem
             ORDER BY etapa_origem`
            ),
            // Retrabalho CQ detalhado
            server.database.query<{ motivo_codigo: string; total: string; repositorios: string }>(
              `SELECT i.motivo_codigo,
                    COUNT(*)::text AS total,
                    STRING_AGG(DISTINCT r.id_repositorio_ged, ', ' ORDER BY r.id_repositorio_ged) AS repositorios
             FROM lotes_controle_qualidade_itens i
             JOIN repositorios r ON r.id_repositorio_recorda = i.repositorio_id
             WHERE i.resultado = 'REPROVADO'
             GROUP BY i.motivo_codigo
             ORDER BY COUNT(*) DESC`
            ),
          ]);

          const producaoMesAtual = parseInt(producaoMesAtualResult.rows[0]?.total ?? '0', 10);
          const producaoMesAnterior = parseInt(producaoMesAnteriorResult.rows[0]?.total ?? '0', 10);
          const processosAtivos = parseInt(processosAtivosResult.rows[0]?.total ?? '0', 10);
          const processosNovosHoje = parseInt(processosHojeResult.rows[0]?.total ?? '0', 10);
          const colaboradoresAtivos = parseInt(colaboradoresAtivosResult.rows[0]?.total ?? '0', 10);

          let producaoTrend = '0%';
          if (producaoMesAnterior > 0) {
            const diff = ((producaoMesAtual - producaoMesAnterior) / producaoMesAnterior) * 100;
            producaoTrend = `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}% vs. mês anterior`;
          }

          const producaoPorEtapa: ProducaoPorEtapa[] = producaoPorEtapaResult.rows.map((row) => ({
            etapa: row.etapa,
            valor: parseInt(row.valor ?? '0', 10),
          }));

          const recebidosHoje = processosNovosHoje;
          const importacoesComErro = parseInt(
            importacoesLegadoComErroResult.rows[0]?.total ?? '0',
            10
          );

          const statusRecebimento: StatusRecebimento[] = [
            { status: 'Importados Hoje', valor: recebidosHoje, icon: 'inbox' },
            { status: 'Registros no Mês', valor: producaoMesAtual, icon: 'bar-chart' },
            {
              status: 'Importações com Erro (24h)',
              valor: importacoesComErro,
              icon: 'alert-triangle',
            },
          ];

          const alertas: Alerta[] = [];

          const parados = parseInt(paradosResult.rows[0]?.total ?? '0', 10);
          if (parados > 0) {
            alertas.push({
              tipo: 'warning',
              titulo: 'Repositórios Parados',
              descricao: `${parados} repositório(s) sem movimentação há mais de 48h.`,
            });
          }

          const divergencias = parseInt(divergenciasResult.rows[0]?.total ?? '0', 10);
          if (divergencias > 0) {
            alertas.push({
              tipo: 'error',
              titulo: 'Divergências Operacionais',
              descricao: `${divergencias} exceção(ões) em aberto ou em tratativa.`,
            });
          }

          const checklistPendentes = parseInt(checklistPendenteResult.rows[0]?.total ?? '0', 10);
          if (checklistPendentes > 0) {
            alertas.push({
              tipo: 'info',
              titulo: 'Checklist Ausente',
              descricao: `${checklistPendentes} repositório(s) sem checklist ativo da etapa atual.`,
            });
          }

          if (importacoesComErro > 0) {
            alertas.push({
              tipo: 'warning',
              titulo: 'Importação Legada com Erro',
              descricao: `${importacoesComErro} importação(ões) legadas com erro nas últimas 24h.`,
            });
          }

          const backlogPorEtapa = backlogPorEtapaResult.rows.map((row) => ({
            etapa: row.etapa,
            total: parseInt(row.total ?? '0', 10),
          }));

          const tempoMedioPorEtapa = tempoMedioPorEtapaResult.rows
            .filter((row) => row.media_horas !== null)
            .map((row) => ({
              etapa: row.etapa,
              mediaHoras: parseFloat(row.media_horas ?? '0'),
            }));

          const retrabalhoCQ = retrabalhoCQResult.rows.map((row) => ({
            motivo: row.motivo_codigo ?? 'SEM_MOTIVO',
            total: parseInt(row.total ?? '0', 10),
            repositorios: row.repositorios ?? '',
          }));

          const responseData = {
            stats: {
              producaoTotal: producaoMesAtual,
              producaoTrend,
              processosAtivos,
              processosNovosHoje,
              colaboradoresAtivos,
            },
            producaoPorEtapa,
            statusRecebimento,
            alertas,
            backlogPorEtapa,
            tempoMedioPorEtapa,
            retrabalhoCQ,
          };

          return reply.status(200).send(responseData);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao carregar dashboard';
          return reply.status(500).send({ error: message });
        }
      }
    );
  };
}
