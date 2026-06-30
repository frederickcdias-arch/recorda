import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { PDFExportService } from '../../services/pdf-export-service.js';
import { AusenciasPdfService } from '../../services/ausencias-pdf-service.js';
import { ExcelExportService } from '../../services/excel-export-service.js';
import { serveAusenciaAnexo } from '../../services/file-storage.js';
import type {
  ProducaoEtapa,
  ProducaoColaborador,
  ProducaoCoordenadoria,
  ResumoEtapa,
  RelatorioCompleto,
} from '../../../application/use-cases/gerar-relatorio-completo.js';
import type {
  RelatorioAusenciasRow,
} from '@recorda/shared';
import {
  buildProducaoContabilizadaWhere,
  buildProducaoOrigemWhere,
  buildLegacyProducaoWhere,
  sqlDateInSystemTimezone,
} from '../../../domain/producao/producao-metrics.js';

function toDateOnlyString(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface RelatorioQuery {
  dataInicio: string;
  dataFim: string;
  coordenadoriaId?: string;
  formato?: 'json' | 'pdf' | 'excel';
  tipo?: string;
}

interface ImportacaoLegadoDetalheRow {
  tipo: string;
  detalhes_erros: Record<string, unknown> | null;
}

interface AusenciaRelatorioQuery {
  dataInicio?: string;
  dataFim?: string;
  colaboradorId?: string;
  tipoAusenciaId?: string;
  status?: string;
}

interface AusenciaRelatorioData {
  registros: RelatorioAusenciasRow[];
  totais: {
    totalRegistros: number;
    totalPorStatus: Record<string, number>;
    totalPorTipo: Array<{ id: string; nome: string; cor: string; quantidade: number }>;
    totalPorColaborador: Array<{ id: string; nome: string; quantidade: number }>;
    diasAprovados: number;
    horasAprovadas: number;
  };
  filtros: {
    colaboradores: Array<{ id: string; nome: string }>;
    tipos: Array<{ id: string; nome: string; cor: string }>;
  };
}

function collectLegacySourceHashes(
  importacoes: ImportacaoLegadoDetalheRow[]
): Map<string, Set<string>> {
  const hashesPorFonte = new Map<string, Set<string>>();

  for (const item of importacoes) {
    if (item.tipo !== 'PRODUCAO') continue;

    const detalhes = item.detalhes_erros ?? {};
    const rollback = (detalhes.rollback as Record<string, unknown> | undefined) ?? {};
    const fonteId = typeof rollback.fonteId === 'string' ? rollback.fonteId : null;
    const hashes = Array.isArray(rollback.importacaoFonteHashes)
      ? rollback.importacaoFonteHashes.filter((value): value is string => typeof value === 'string')
      : [];

    if (!fonteId || hashes.length === 0) continue;

    const bucket = hashesPorFonte.get(fonteId) ?? new Set<string>();
    for (const hash of hashes) bucket.add(hash);
    hashesPorFonte.set(fonteId, bucket);
  }

  return hashesPorFonte;
}

function buildAusenciasWhere(filters: AusenciaRelatorioQuery): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (filters.dataInicio) {
    conditions.push(`a.data_fim >= $${p++}::date`);
    params.push(filters.dataInicio);
  }
  if (filters.dataFim) {
    conditions.push(`a.data_inicio <= $${p++}::date`);
    params.push(filters.dataFim);
  }
  if (filters.colaboradorId) {
    conditions.push(`a.usuario_id = $${p++}`);
    params.push(filters.colaboradorId);
  }
  if (filters.tipoAusenciaId) {
    conditions.push(`a.tipo_ausencia_id = $${p++}`);
    params.push(filters.tipoAusenciaId);
  }
  if (filters.status && filters.status !== 'TODOS') {
    conditions.push(`a.status = $${p++}`);
    params.push(filters.status);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

async function carregarRelatorioAusencias(
  server: FastifyInstance,
  filters: AusenciaRelatorioQuery
): Promise<AusenciaRelatorioData> {
  const { where, params } = buildAusenciasWhere(filters);

  const result = await server.database.query(
    `SELECT
       a.id,
       a.usuario_id,
       u.nome AS colaborador_nome,
       a.tipo_ausencia_id,
       ta.nome AS tipo_ausencia_nome,
       ta.cor AS tipo_ausencia_cor,
       a.data_inicio,
       a.data_fim,
       a.periodo,
       a.horas_ausencia,
       a.status,
       a.justificativa,
       a.observacoes,
       a.documento_anexo,
       a.aprovado_em,
       a.motivo_rejeicao,
       a.criado_em,
       (a.data_fim - a.data_inicio + 1) AS dias_ausencia
     FROM ausencias a
     JOIN usuarios u ON u.id = a.usuario_id
     JOIN tipos_ausencia ta ON ta.id = a.tipo_ausencia_id
     ${where}
     ORDER BY a.data_inicio DESC, u.nome`,
    params
  );

  const rows = result.rows as Array<Record<string, unknown>>;

  const registros = rows.map((r) => ({
    id: r.id as string,
    usuarioId: r.usuario_id as string,
    colaboradorNome: r.colaborador_nome as string,
    tipoAusenciaId: r.tipo_ausencia_id as string,
    tipoAusenciaNome: r.tipo_ausencia_nome as string,
    tipoAusenciaCor: r.tipo_ausencia_cor as string,
    dataInicio: toDateOnlyString(r.data_inicio as string | Date | null | undefined),
    dataFim: toDateOnlyString(r.data_fim as string | Date | null | undefined),
    periodo: r.periodo as RelatorioAusenciasRow['periodo'],
    horasAusencia: r.horas_ausencia != null ? String(r.horas_ausencia) : null,
    status: r.status as RelatorioAusenciasRow['status'],
    justificativa: r.justificativa as string | null,
    observacoes: r.observacoes as string | null,
    documentoAnexo: r.documento_anexo as string | null,
    aprovadoEm:
      r.aprovado_em instanceof Date
        ? (r.aprovado_em as Date).toISOString()
        : (r.aprovado_em as string | null),
    motivoRejeicao: r.motivo_rejeicao as string | null,
    criadoEm:
      r.criado_em instanceof Date ? (r.criado_em as Date).toISOString() : String(r.criado_em ?? ''),
    diasAusencia: Number(r.dias_ausencia ?? 0),
  })) satisfies RelatorioAusenciasRow[];

  const totalPorStatus = registros.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  const totalPorTipoMap = registros.reduce<
    Record<string, { nome: string; cor: string; quantidade: number }>
  >((acc, row) => {
    const existing = acc[row.tipoAusenciaId];
    if (existing) {
      existing.quantidade += 1;
    } else {
      acc[row.tipoAusenciaId] = {
        nome: row.tipoAusenciaNome,
        cor: row.tipoAusenciaCor,
        quantidade: 1,
      };
    }
    return acc;
  }, {});

  const totalPorColaboradorMap = registros.reduce<Record<string, { nome: string; quantidade: number }>>(
    (acc, row) => {
      const existing = acc[row.usuarioId];
      if (existing) {
        existing.quantidade += 1;
      } else {
        acc[row.usuarioId] = { nome: row.colaboradorNome, quantidade: 1 };
      }
      return acc;
    },
    {}
  );

  const diasAprovados = registros.filter((r) => r.status === 'aprovado').reduce((sum, r) => sum + r.diasAusencia, 0);
  const horasAprovadas = registros
    .filter((r) => r.status === 'aprovado' && r.horasAusencia)
    .reduce((sum, r) => sum + Number(r.horasAusencia ?? 0), 0);

  const colaboradoresResult = await server.database.query<{ id: string; nome: string }>(
    `SELECT DISTINCT u.id, u.nome
     FROM ausencias a
     JOIN usuarios u ON u.id = a.usuario_id
     ORDER BY u.nome`
  );

  const tiposResult = await server.database.query<{ id: string; nome: string; cor: string }>(
    `SELECT id, nome, cor FROM tipos_ausencia ORDER BY nome`
  );

  return {
    registros,
    totais: {
      totalRegistros: registros.length,
      totalPorStatus,
      totalPorTipo: Object.entries(totalPorTipoMap).map(([id, v]) => ({ id, ...v })),
      totalPorColaborador: Object.entries(totalPorColaboradorMap).map(([id, v]) => ({ id, ...v })),
      diasAprovados,
      horasAprovadas,
    },
    filtros: {
      colaboradores: colaboradoresResult.rows,
      tipos: tiposResult.rows,
    },
  };
}

export function createRelatorioRoutes(): FastifyPluginAsync {
  const pdfService = new PDFExportService();
  const excelService = new ExcelExportService();

  return async (server: FastifyInstance): Promise<void> => {
    server.get<{ Querystring: RelatorioQuery }>(
      '/relatorios',
      {
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
        schema: {
          querystring: {
            type: 'object',
            required: ['dataInicio', 'dataFim'],
            properties: {
              dataInicio: { type: 'string', format: 'date' },
              dataFim: { type: 'string', format: 'date' },
              coordenadoriaId: { type: 'string' },
              formato: { type: 'string', enum: ['json', 'pdf', 'excel'] },
              tipo: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { dataInicio, dataFim, coordenadoriaId, formato = 'json', tipo } = request.query;

        try {
          const relatorio = await gerarRelatorioCompleto(
            server,
            dataInicio,
            dataFim,
            coordenadoriaId
          );

          const titulosPorTipo: Record<string, string> = {
            producao: 'Relatório de Produção Consolidada',
            colaboradores: 'Relatório de Produtividade por Colaborador',
            etapas: 'Relatório de Produção por Etapa',
            processos: 'Relatório de Processos Recebidos',
            importacoes: 'Relatório de Histórico de Importações',
          };
          if (tipo && titulosPorTipo[tipo]) {
            relatorio.titulo = titulosPorTipo[tipo];
          }

          // Buscar configuração da empresa para PDF/Excel
          const empresaResult = await server.database.query(
            `SELECT nome, cnpj, endereco, telefone, email, logo_url, logo_data,
                    exibir_logo_relatorio, exibir_endereco_relatorio, exibir_contato_relatorio,
                    logo_largura_relatorio, logo_alinhamento_relatorio, logo_deslocamento_y_relatorio
             FROM configuracao_empresa LIMIT 1`
          );
          const empresaRow = empresaResult.rows[0] as Record<string, unknown> | undefined;
          const empresaConfig = empresaRow
            ? {
                nome: (empresaRow.nome as string) || '',
                endereco: (empresaRow.endereco as string) || '',
                telefone: (empresaRow.telefone as string) || '',
                email: (empresaRow.email as string) || '',
                logoUrl: (empresaRow.logo_url as string) || '',
                logoData: (empresaRow.logo_data as Buffer | null) ?? null,
                exibirLogoRelatorio: empresaRow.exibir_logo_relatorio !== false,
                exibirEnderecoRelatorio: empresaRow.exibir_endereco_relatorio !== false,
                exibirContatoRelatorio: empresaRow.exibir_contato_relatorio === true,
                logoLarguraRelatorio: Number(empresaRow.logo_largura_relatorio ?? 120),
                logoAlinhamentoRelatorio:
                  (empresaRow.logo_alinhamento_relatorio as string) || 'CENTRO',
                logoDeslocamentoYRelatorio: Number(empresaRow.logo_deslocamento_y_relatorio ?? 0),
              }
            : null;

          switch (formato) {
            case 'pdf': {
              const pdfBuffer = await pdfService.exportar(relatorio, empresaConfig);
              const dataInicioPt = new Date(dataInicio)
                .toLocaleDateString('pt-BR')
                .replace(/\//g, '-');
              const dataFimPt = new Date(dataFim).toLocaleDateString('pt-BR').replace(/\//g, '-');
              const filename = `relatorio_${tipo ?? 'geral'}_${dataInicioPt}_a_${dataFimPt}.pdf`;

              return reply
                .header('Content-Type', 'application/pdf')
                .header('Content-Disposition', `attachment; filename="${filename}"`)
                .send(pdfBuffer);
            }

            case 'excel': {
              const excelBuffer = await excelService.exportar(relatorio);
              const dataInicioPt = new Date(dataInicio)
                .toLocaleDateString('pt-BR')
                .replace(/\//g, '-');
              const dataFimPt = new Date(dataFim).toLocaleDateString('pt-BR').replace(/\//g, '-');
              const filename = `relatorio_${tipo ?? 'geral'}_${dataInicioPt}_a_${dataFimPt}.xlsx`;

              return reply
                .header(
                  'Content-Type',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
                .header('Content-Disposition', `attachment; filename="${filename}"`)
                .send(excelBuffer);
            }

            default:
              return reply.status(200).send(relatorio);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao gerar relatório';
          return reply.status(500).send({ error: message, code: 'ERRO_RELATORIO' });
        }
      }
    );

    server.get<{ Querystring: { dataInicio: string; dataFim: string; coordenadoriaId?: string } }>(
      '/relatorios/resumo',
      {
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
        schema: {
          querystring: {
            type: 'object',
            required: ['dataInicio', 'dataFim'],
            properties: {
              dataInicio: { type: 'string', format: 'date' },
              dataFim: { type: 'string', format: 'date' },
              coordenadoriaId: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { dataInicio, dataFim, coordenadoriaId } = request.query;

        try {
          const relatorio = await gerarRelatorioCompleto(
            server,
            dataInicio,
            dataFim,
            coordenadoriaId
          );

          return reply.status(200).send({
            periodo: relatorio.periodo,
            totais: relatorio.totais,
            resumoPorEtapa: relatorio.resumoPorEtapa,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao gerar relatório';
          return reply.status(500).send({ error: message, code: 'ERRO_RELATORIO' });
        }
      }
    );

    server.get(
      '/relatorios/coordenadorias',
      {
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (_request, reply) => {
        try {
          const result = await server.database.query(
            `SELECT id, nome, sigla FROM coordenadorias WHERE ativa = true ORDER BY sigla`
          );
          return reply.status(200).send(result.rows);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar coordenadorias';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /relatorios/operacional - Relatório operacional
    server.get<{ Querystring: { dataInicio: string; dataFim: string } }>(
      '/relatorios/operacional',
      {
        schema: {
          tags: ['relatorios'],
          summary: 'Relatório operacional',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            required: ['dataInicio', 'dataFim'],
            properties: {
              dataInicio: { type: 'string', format: 'date' },
              dataFim: { type: 'string', format: 'date' },
            },
          },
        },
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        const { dataInicio, dataFim } = request.query;

        try {
          const producaoContabilizadaWhere = buildProducaoContabilizadaWhere('p');
          const result = await server.database.query(
            `
            SELECT
              p.id,
              p.quantidade,
              p.data_producao,
              p.marcadores::text AS observacao,
              u.nome as colaborador_nome,
              '' as matricula,
              p.etapa::text as etapa_nome,
              r.id_repositorio_ged as processo_numero
            FROM producao_repositorio p
            JOIN usuarios u ON u.id = p.usuario_id
            JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
            WHERE ${sqlDateInSystemTimezone('p')} BETWEEN $1::date AND $2::date
              AND ${producaoContabilizadaWhere}
            ORDER BY p.data_producao DESC, u.nome
          `,
            [dataInicio, dataFim]
          );

          return reply.send({ registros: result.rows });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao gerar relatório';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /relatorios/operacional/export - Export operacional data as Excel
    // Supports ?token= query param for iframe preview (copies token to Authorization header)
    server.get<{
      Querystring: {
        dataInicio: string;
        dataFim: string;
        formato?: string;
        token?: string;
        etapa?: string;
        colaborador?: string;
        origem?: 'legado' | 'sistema' | 'fluxo' | '';
        busca?: string;
      };
    }>(
      '/relatorios/operacional/export',
      {
        schema: {
          tags: ['relatorios'],
          summary: 'Export operacional em Excel',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            required: ['dataInicio', 'dataFim'],
            properties: {
              dataInicio: { type: 'string', format: 'date' },
              dataFim: { type: 'string', format: 'date' },
              formato: { type: 'string' },
              token: { type: 'string' },
              etapa: { type: 'string' },
              colaborador: { type: 'string' },
              origem: { type: 'string', enum: ['legado', 'sistema', 'fluxo', ''] },
              busca: { type: 'string' },
            },
          },
        },
        preHandler: [
          async (request) => {
            const { token } = request.query as { token?: string };
            if (token && !request.headers.authorization) {
              request.headers.authorization = `Bearer ${token}`;
            }
          },
          server.authenticate,
          authorize('operador', 'administrador'),
        ],
      },
      async (request, reply) => {
        const { dataInicio, dataFim, etapa, colaborador, origem, busca } = request.query;

        try {
          const producaoContabilizadaWhere = buildProducaoContabilizadaWhere('p');
          let where = `
            WHERE ${sqlDateInSystemTimezone('p')} BETWEEN $1::date AND $2::date
              AND ${producaoContabilizadaWhere}
          `;
          const params: Array<string | number> = [dataInicio, dataFim];
          let p = 3;

          if (etapa) {
            where += ` AND p.etapa::text = $${p++}`;
            params.push(etapa.toUpperCase());
          }
          if (colaborador) {
            where += ` AND u.id = $${p++}`;
            params.push(colaborador);
          }
          if (origem === 'legado') {
            where += ` AND ${buildLegacyProducaoWhere('p')}`;
          } else if (origem === 'sistema' || origem === 'fluxo') {
            where += ` AND ${buildProducaoOrigemWhere('p', 'SISTEMA')}`;
          }
          if (busca) {
            where += ` AND (
              u.nome ILIKE $${p}
              OR r.id_repositorio_ged ILIKE $${p}
              OR COALESCE(p.marcadores->>'funcao', '') ILIKE $${p}
              OR COALESCE(p.marcadores->>'tipo', '') ILIKE $${p}
              OR COALESCE(p.marcadores->>'colaborador_nome', '') ILIKE $${p}
            )`;
            params.push(`%${busca}%`);
            p++;
          }

          const result = await server.database.query(
            `
            SELECT
              p.data_producao,
              COALESCE(NULLIF(p.marcadores->>'colaborador_nome', ''), u.nome) as colaborador,
              p.etapa::text as etapa,
              COALESCE(NULLIF(TRIM(p.marcadores->>'funcao'), ''), '') as funcao,
              r.id_repositorio_ged as repositorio,
              p.quantidade,
              COALESCE(NULLIF(TRIM(p.marcadores->>'tipo'), ''), '') as tipo,
              COALESCE(co.sigla, COALESCE(NULLIF(TRIM(p.marcadores->>'coordenadoria'), ''), '')) as coordenadoria,
              CASE WHEN ${buildLegacyProducaoWhere('p')} THEN 'Legado' ELSE 'Fluxo' END as origem
            FROM producao_repositorio p
            JOIN usuarios u ON u.id = p.usuario_id
            JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
            LEFT JOIN coordenadorias co ON co.id = u.coordenadoria_id
            ${where}
            ORDER BY p.data_producao DESC, colaborador
            LIMIT 50001
          `,
            params
          );

          const truncated = result.rows.length > 50000;
          const rows = truncated ? result.rows.slice(0, 50000) : result.rows;

          const { formato } = request.query;

          if (formato === 'csv') {
            const csvEscapeProd = (value: unknown): string => {
              const text = String(value ?? '');
              if (
                text.includes('"') ||
                text.includes(';') ||
                text.includes('\n') ||
                text.includes('\r')
              ) {
                return '"' + text.replace(/"/g, '""') + '"';
              }
              return text;
            };

            const formatDatePt = (value: unknown): string => {
              if (!value) return '';
              const d = new Date(String(value));
              return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR');
            };

            const csvHeader = [
              'data',
              'colaborador',
              'funcao',
              'repositorio',
              'coordenadoria',
              'quantidade',
              'tipo',
              'etapa',
              'origem',
            ];
            const csvLines = [
              csvHeader.map(csvEscapeProd).join(';'),
              ...rows.map((row) => {
                const r = row as Record<string, unknown>;
                return [
                  formatDatePt(r.data_producao),
                  r.colaborador ?? '',
                  r.funcao ?? '',
                  r.repositorio ?? '',
                  r.coordenadoria ?? '',
                  String(r.quantidade ?? ''),
                  r.tipo ?? '',
                  r.etapa ?? '',
                  r.origem ?? '',
                ]
                  .map(csvEscapeProd)
                  .join(';');
              }),
            ];

            const dataInicioPtCsv = new Date(dataInicio)
              .toLocaleDateString('pt-BR')
              .replace(/\//g, '-');
            const dataFimPtCsv = new Date(dataFim).toLocaleDateString('pt-BR').replace(/\//g, '-');
            const filenameCsv = `producao_${dataInicioPtCsv}_a_${dataFimPtCsv}.csv`;

            return reply
              .header('Content-Type', 'text/csv; charset=utf-8')
              .header('Content-Disposition', `attachment; filename="${filenameCsv}"`)
              .header('X-Truncated', truncated ? 'true' : 'false')
              .send('\uFEFF' + csvLines.join('\r\n'));
          }

          const ExcelJS = (await import('exceljs')).default;
          const workbook = new ExcelJS.Workbook();
          workbook.creator = 'Recorda';
          workbook.created = new Date();

          const sheet = workbook.addWorksheet('Detalhamento Operacional');
          sheet.columns = [
            { header: 'Data', key: 'data', width: 12 },
            { header: 'Colaborador', key: 'colaborador', width: 30 },
            { header: 'Etapa', key: 'etapa', width: 20 },
            { header: 'Função', key: 'funcao', width: 20 },
            { header: 'Repositório', key: 'repositorio', width: 18 },
            { header: 'Quantidade', key: 'quantidade', width: 12 },
            { header: 'Tipo', key: 'tipo', width: 15 },
            { header: 'Coordenadoria', key: 'coordenadoria', width: 15 },
            { header: 'Origem', key: 'origem', width: 10 },
          ];

          for (const row of rows) {
            const r = row as Record<string, unknown>;
            sheet.addRow({
              data: r.data_producao
                ? new Date(r.data_producao as string).toLocaleDateString('pt-BR')
                : '',
              colaborador: r.colaborador ?? '',
              etapa: r.etapa ?? '',
              funcao: r.funcao ?? '',
              repositorio: r.repositorio ?? '',
              quantidade: Number(r.quantidade ?? 0),
              tipo: r.tipo ?? '',
              coordenadoria: r.coordenadoria ?? '',
              origem: r.origem ?? '',
            });
          }

          // Style header
          const headerRow = sheet.getRow(1);
          headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
          headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

          // Summary row
          const totalRow = sheet.addRow({
            data: '',
            colaborador: `Total: ${rows.length} registros${truncated ? ' (exportação limitada a 50.000 linhas)' : ''}`,
            etapa: '',
            funcao: '',
            repositorio: '',
            quantidade: rows.reduce(
              (sum, r) => sum + Number((r as Record<string, unknown>).quantidade ?? 0),
              0
            ),
            tipo: '',
            coordenadoria: '',
            origem: '',
          });
          totalRow.font = { bold: true };

          const buffer = await workbook.xlsx.writeBuffer();
          const dataInicioPt = new Date(dataInicio).toLocaleDateString('pt-BR').replace(/\//g, '-');
          const dataFimPt = new Date(dataFim).toLocaleDateString('pt-BR').replace(/\//g, '-');
          const filename = `detalhamento_operacional_${dataInicioPt}_a_${dataFimPt}.xlsx`;

          return reply
            .header(
              'Content-Type',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .header('X-Truncated', truncated ? 'true' : 'false')
            .send(Buffer.from(buffer));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao exportar relatório operacional';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /operacional/producao - Listar registros de produção com filtros
    server.get(
      '/operacional/producao',
      {
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        try {
          const query = request.query as {
            pagina?: string;
            limite?: string;
            etapa?: string;
            colaborador?: string;
            repositorio?: string;
            dataInicio?: string;
            dataFim?: string;
            origem?: 'legado' | 'sistema' | 'fluxo' | '';
            busca?: string;
          };

          const pagina = Math.max(Number(query.pagina ?? 1), 1);
          const limite = Math.min(Math.max(Number(query.limite ?? 25), 1), 100);
          const offset = (pagina - 1) * limite;

          let where = `WHERE ${buildProducaoContabilizadaWhere('p')}`;
          const params: (string | number)[] = [];
          let p = 1;

          if (query.etapa) {
            where += ` AND p.etapa::text = $${p++}`;
            params.push(query.etapa.toUpperCase());
          }
          if (query.colaborador) {
            where += ` AND u.id = $${p++}`;
            params.push(query.colaborador);
          }
          if (query.dataInicio) {
            where += ` AND ${sqlDateInSystemTimezone('p')} >= $${p++}::date`;
            params.push(query.dataInicio);
          }
          if (query.dataFim) {
            where += ` AND ${sqlDateInSystemTimezone('p')} <= $${p++}::date`;
            params.push(query.dataFim);
          }
          if (query.origem === 'legado') {
            where += ` AND ${buildLegacyProducaoWhere('p')}`;
          } else if (query.origem === 'sistema' || query.origem === 'fluxo') {
            where += ` AND ${buildProducaoOrigemWhere('p', 'SISTEMA')}`;
          }
          if (query.repositorio) {
            where += ` AND r.id_repositorio_ged ILIKE $${p++}`;
            params.push(`%${query.repositorio}%`);
          }
          if (query.busca) {
            where += ` AND (u.nome ILIKE $${p} OR r.id_repositorio_ged ILIKE $${p} OR COALESCE(p.marcadores->>'funcao', '') ILIKE $${p} OR COALESCE(p.marcadores->>'tipo', '') ILIKE $${p} OR COALESCE(p.marcadores->>'colaborador_nome', '') ILIKE $${p})`;
            params.push(`%${query.busca}%`);
            p++;
          }

          const countResult = await server.database.query<{ total: string }>(
            `SELECT COUNT(*) as total
           FROM producao_repositorio p
           JOIN usuarios u ON u.id = p.usuario_id
           JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
           ${where}`,
            params
          );
          const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

          const dataParams = [...params, limite, offset];
          const result = await server.database.query(
            `SELECT
             p.id,
             p.quantidade,
             p.data_producao,
             p.etapa::text as etapa,
             COALESCE(p.marcadores->>'tipo', '') as tipo,
             COALESCE(p.marcadores->>'origem', '') as origem_marcador,
             COALESCE(p.marcadores->>'coordenadoria', '') as coordenadoria_marcador,
             COALESCE(p.marcadores->>'funcao', '') as funcao,
             u.id as colaborador_id,
             COALESCE(NULLIF(p.marcadores->>'colaborador_nome', ''), u.nome) as colaborador_nome,
             r.id_repositorio_ged as repositorio_ged,
             r.projeto as projeto,
             CASE WHEN ${buildLegacyProducaoWhere('p')} THEN 'LEGADO' ELSE 'FLUXO' END as origem,
             COALESCE(co.sigla, COALESCE(p.marcadores->>'coordenadoria', '')) as coordenadoria_sigla
           FROM producao_repositorio p
           JOIN usuarios u ON u.id = p.usuario_id
           JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
           LEFT JOIN coordenadorias co ON co.id = u.coordenadoria_id
           ${where}
           ORDER BY p.data_producao DESC, u.nome
           LIMIT $${p++} OFFSET $${p++}`,
            dataParams
          );

          // Buscar lista de colaboradores (usar nome da planilha, normalizado com INITCAP para unificar maiúsculas/minúsculas)
          const colaboradoresResult = await server.database.query<{ nome: string; id: string }>(
            `SELECT DISTINCT
             u.id as id,
             INITCAP(LOWER(COALESCE(NULLIF(p.marcadores->>'colaborador_nome', ''), u.nome))) as nome
           FROM producao_repositorio p
           JOIN usuarios u ON u.id = p.usuario_id
           WHERE ${buildProducaoContabilizadaWhere('p')}
           ORDER BY nome`
          );

          const etapasResult = await server.database.query<{ etapa: string }>(
            `SELECT DISTINCT etapa::text as etapa
           FROM producao_repositorio
           WHERE ${buildProducaoContabilizadaWhere('producao_repositorio')}
           ORDER BY etapa`
          );

          return reply.send({
            registros: result.rows,
            total,
            pagina,
            limite,
            totalPaginas: Math.ceil(total / limite),
            filtros: {
              colaboradores: colaboradoresResult.rows,
              etapas: etapasResult.rows.map((e) => e.etapa),
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao listar produção';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // DELETE /producao - Limpar registros de produção importada (admin-only)
    server.delete(
      '/producao',
      {
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (_request, reply) => {
        try {
          const importacoesResult = await server.database.query<ImportacaoLegadoDetalheRow>(
            `SELECT tipo, detalhes_erros
             FROM importacoes_legado_operacional`
          );
          const hashesPorFonte = collectLegacySourceHashes(importacoesResult.rows);
          const countResult = await server.database.query<{ total: string }>(
            `SELECT COUNT(*)::text as total
           FROM producao_repositorio
           WHERE ${buildLegacyProducaoWhere()}`
          );
          const total = Number(countResult.rows[0]?.total ?? '0');

          if (total === 0) {
            let fontesLinhasRemovidas = 0;
            for (const [fonteId, hashes] of hashesPorFonte.entries()) {
              if (hashes.size === 0) continue;
              const result = await server.database.query(
                `DELETE FROM importacao_fontes_linhas
                 WHERE fonte_id = $1
                   AND chave_hash = ANY($2::text[])`,
                [fonteId, [...hashes]]
              );
              fontesLinhasRemovidas += result.rowCount ?? 0;
            }
            return reply.send({
              message: 'Nenhum registro de produção importada para excluir',
              removidos: 0,
              fontesLinhasRemovidas,
            });
          }

          await server.database.query(
            `DELETE FROM producao_repositorio
           WHERE ${buildLegacyProducaoWhere()}`
          );
          let fontesLinhasRemovidas = 0;
          for (const [fonteId, hashes] of hashesPorFonte.entries()) {
            if (hashes.size === 0) continue;
            const result = await server.database.query(
              `DELETE FROM importacao_fontes_linhas
               WHERE fonte_id = $1
                 AND chave_hash = ANY($2::text[])`,
              [fonteId, [...hashes]]
            );
            fontesLinhasRemovidas += result.rowCount ?? 0;
          }
          return reply.send({
            message: 'Registros de produção importada foram excluídos',
            removidos: total,
            fontesLinhasRemovidas,
          });
        } catch (error) {
          server.log.error(error, 'Erro ao limpar registros de produção importada');
          const message =
            error instanceof Error
              ? error.message
              : 'Erro ao limpar registros de produção importada';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // DELETE /producao/:id - Excluir registro de produção (admin-only)
    server.delete(
      '/producao/:id',
      {
        preHandler: [server.authenticate, authorize('administrador')],
      },
      async (request, reply) => {
        try {
          const { id } = request.params as { id: string };

          const check = await server.database.query(
            `SELECT id FROM producao_repositorio WHERE id = $1`,
            [id]
          );
          if (check.rows.length === 0) {
            return reply.status(404).send({ error: 'Registro de produção não encontrado' });
          }

          await server.database.query(`DELETE FROM producao_repositorio WHERE id = $1`, [id]);

          return reply.send({ message: 'Registro de produção excluído com sucesso' });
        } catch (error) {
          server.log.error(error, 'Erro ao excluir registro de produção');
          const message =
            error instanceof Error ? error.message : 'Erro ao excluir registro de produção';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /relatorios/ausencias/exportar - Exportar relatório de ausências como CSV (admin only)
    server.get<{
      Querystring: {
        dataInicio?: string;
        dataFim?: string;
        colaboradorId?: string;
        tipoAusenciaId?: string;
        status?: string;
      };
    }>(
      '/relatorios/ausencias/exportar',
      {
        preHandler: [server.authenticate, authorize('administrador')],
        schema: {
          querystring: {
            type: 'object',
            properties: {
              dataInicio: { type: 'string' },
              dataFim: { type: 'string' },
              colaboradorId: { type: 'string' },
              tipoAusenciaId: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        try {
          const relatorio = await carregarRelatorioAusencias(server, request.query);

          const csvEscape = (value: unknown): string =>
            `"${String(value ?? '').replace(/"/g, '""')}"`;

          const formatDate = (value: unknown): string => {
            if (!value) return '';
            const d = value instanceof Date ? value : new Date(String(value));
            return d.toLocaleDateString('pt-BR');
          };

          const header = [
            'Colaborador',
            'Tipo de Ausência',
            'Data Início',
            'Data Fim',
            'Dias',
            'Período',
            'Horas',
            'Status',
            'Justificativa',
            'Observações',
            'Motivo Rejeição',
            'Solicitado em',
          ];

          const rows = relatorio.registros;

          const lines = [
            header.map(csvEscape).join(';'),
            ...rows.map((r) =>
              [
                r.colaboradorNome,
                r.tipoAusenciaNome,
                formatDate(r.dataInicio),
                formatDate(r.dataFim),
                Number(r.diasAusencia ?? 0),
                r.periodo,
                r.horasAusencia ?? '',
                r.status,
                r.justificativa ?? '',
                r.observacoes ?? '',
                r.motivoRejeicao ?? '',
                formatDate(r.criadoEm),
              ]
                .map(csvEscape)
                .join(';')
            ),
          ];

          const today = new Date().toISOString().slice(0, 10);
          reply.header('Content-Type', 'text/csv; charset=utf-8');
          reply.header('Content-Disposition', `attachment; filename="ausencias-${today}.csv"`);

          return reply.send('\uFEFF' + lines.join('\r\n'));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao exportar relatório de ausências';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /relatorios/ausencias/exportar/pdf - Exportar relatório de ausências como PDF (admin only)
    server.get<{
      Querystring: {
        dataInicio?: string;
        dataFim?: string;
        colaboradorId?: string;
        tipoAusenciaId?: string;
        status?: string;
      };
    }>(
      '/relatorios/ausencias/exportar/pdf',
      {
        preHandler: [server.authenticate, authorize('administrador')],
        schema: {
          querystring: {
            type: 'object',
            properties: {
              dataInicio: { type: 'string' },
              dataFim: { type: 'string' },
              colaboradorId: { type: 'string' },
              tipoAusenciaId: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        try {
          const relatorio = await carregarRelatorioAusencias(server, request.query);
          const empresaResult = await server.database.query(
            `SELECT nome, endereco, telefone, email, logo_url, logo_data,
                    exibir_logo_relatorio, exibir_endereco_relatorio, exibir_contato_relatorio,
                    logo_largura_relatorio, logo_alinhamento_relatorio, logo_deslocamento_y_relatorio
             FROM configuracao_empresa LIMIT 1`
          );
          const empresaRow = empresaResult.rows[0] as Record<string, unknown> | undefined;
          const empresaConfig = empresaRow
            ? {
                nome: (empresaRow.nome as string) || '',
                endereco: (empresaRow.endereco as string) || '',
                telefone: (empresaRow.telefone as string) || '',
                email: (empresaRow.email as string) || '',
                logoUrl: (empresaRow.logo_url as string) || '',
                logoData: (empresaRow.logo_data as Buffer | null) ?? null,
                exibirLogoRelatorio: empresaRow.exibir_logo_relatorio !== false,
                exibirEnderecoRelatorio: empresaRow.exibir_endereco_relatorio !== false,
                exibirContatoRelatorio: empresaRow.exibir_contato_relatorio === true,
                logoLarguraRelatorio: Number(empresaRow.logo_largura_relatorio ?? 120),
                logoAlinhamentoRelatorio:
                  (empresaRow.logo_alinhamento_relatorio as string) || 'CENTRO',
                logoDeslocamentoYRelatorio: Number(empresaRow.logo_deslocamento_y_relatorio ?? 0),
              }
            : null;

          const pdfService = new AusenciasPdfService();
          const anexos: Array<{
            id: string;
            usuarioId: string;
            colaboradorNome: string;
            tipoAusenciaId: string;
            tipoAusenciaNome: string;
            tipoAusenciaCor: string;
            dataInicio: string;
            dataFim: string;
            periodo: RelatorioAusenciasRow['periodo'];
            horasAusencia: string | null;
            status: RelatorioAusenciasRow['status'];
            justificativa?: string | null;
            observacoes?: string | null;
            documentoAnexo?: string | null;
            aprovadoEm?: string | null;
            motivoRejeicao?: string | null;
            criadoEm: string;
            diasAusencia: number;
            filename: string;
            mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
            buffer: Buffer;
          }> = [];
          const anexosIgnorados: Array<{ filename: string; motivo: string }> = [];

          for (const row of relatorio.registros) {
            if (!row.documentoAnexo) continue;
            try {
              const { buffer, mimeType, filename } = await serveAusenciaAnexo(row.documentoAnexo);
              anexos.push({
                ...row,
                buffer,
                mimeType: mimeType as 'application/pdf' | 'image/jpeg' | 'image/png',
                filename,
                horasAusencia: row.horasAusencia ?? null,
              });
            } catch (error) {
              const motivo =
                error instanceof Error ? error.message : 'Arquivo indisponível no servidor';
              anexosIgnorados.push({
                filename: row.documentoAnexo.split('/').pop() ?? row.documentoAnexo,
                motivo,
              });
              server.log.warn(
                {
                  ausenciaId: row.id,
                  documentoAnexo: row.documentoAnexo,
                  motivo,
                },
                'Anexo de ausência ignorado durante exportação do PDF'
              );
            }
          }

          const pdfBuffer = await pdfService.exportar({
            relatorio,
            filtros: request.query,
            anexos,
            anexosIgnorados,
          }, empresaConfig);

          const today = new Date().toISOString().slice(0, 10);
          reply.header('Content-Type', 'application/pdf');
          reply.header(
            'Content-Disposition',
            `attachment; filename="ausencias-${today}.pdf"`
          );
          return reply.send(pdfBuffer);
        } catch (error) {
          if ((error as { code?: string }).code === 'INVALID_PATH') {
            return reply.status(400).send({ error: 'Caminho de arquivo inválido' });
          }
          const message =
            error instanceof Error ? error.message : 'Erro ao exportar relatório de ausências';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /relatorios/ausencias - Relatório mensal de ausências (admin only)
    server.get<{
      Querystring: {
        dataInicio?: string;
        dataFim?: string;
        colaboradorId?: string;
        tipoAusenciaId?: string;
        status?: string;
      };
    }>(
      '/relatorios/ausencias',
      {
        preHandler: [server.authenticate, authorize('administrador')],
        schema: {
          querystring: {
            type: 'object',
            properties: {
              dataInicio: { type: 'string' },
              dataFim: { type: 'string' },
              colaboradorId: { type: 'string' },
              tipoAusenciaId: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { dataInicio, dataFim, colaboradorId, tipoAusenciaId, status } = request.query;

        try {
          const conditions: string[] = [];
          const params: string[] = [];
          let p = 1;

          if (dataInicio) {
            conditions.push(`a.data_inicio >= $${p++}::date`);
            params.push(dataInicio);
          }
          if (dataFim) {
            conditions.push(`a.data_fim <= $${p++}::date`);
            params.push(dataFim);
          }
          if (colaboradorId) {
            conditions.push(`a.usuario_id = $${p++}`);
            params.push(colaboradorId);
          }
          if (tipoAusenciaId) {
            conditions.push(`a.tipo_ausencia_id = $${p++}`);
            params.push(tipoAusenciaId);
          }
          if (status && status !== 'TODOS') {
            conditions.push(`a.status = $${p++}`);
            params.push(status);
          }

          const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

          const result = await server.database.query(
            `SELECT
               a.id,
               a.usuario_id,
               u.nome AS colaborador_nome,
               a.tipo_ausencia_id,
               ta.nome AS tipo_ausencia_nome,
               ta.cor AS tipo_ausencia_cor,
               a.data_inicio,
               a.data_fim,
               a.periodo,
               a.horas_ausencia,
               a.status,
               a.justificativa,
               a.observacoes,
               a.documento_anexo,
               a.aprovado_em,
               a.motivo_rejeicao,
               a.criado_em,
               (a.data_fim - a.data_inicio + 1) AS dias_ausencia
             FROM ausencias a
             JOIN usuarios u ON u.id = a.usuario_id
             JOIN tipos_ausencia ta ON ta.id = a.tipo_ausencia_id
             ${where}
             ORDER BY a.data_inicio DESC, u.nome`,
            params
          );

          const rows = result.rows as Array<Record<string, unknown>>;
          const totalRegistros = rows.length;

          // Map snake_case DB columns to camelCase for the API response
          const registros = rows.map((r) => ({
            id: r.id as string,
            usuarioId: r.usuario_id as string,
            colaboradorNome: r.colaborador_nome as string,
            tipoAusenciaId: r.tipo_ausencia_id as string,
            tipoAusenciaNome: r.tipo_ausencia_nome as string,
            tipoAusenciaCor: r.tipo_ausencia_cor as string,
            dataInicio: toDateOnlyString(r.data_inicio as string | Date | null | undefined),
            dataFim: toDateOnlyString(r.data_fim as string | Date | null | undefined),
            periodo: r.periodo as RelatorioAusenciasRow['periodo'],
            horasAusencia: r.horas_ausencia != null ? String(r.horas_ausencia) : null,
            status: r.status as RelatorioAusenciasRow['status'],
            justificativa: r.justificativa as string | null,
            observacoes: r.observacoes as string | null,
            documentoAnexo: r.documento_anexo as string | null,
            aprovadoEm:
              r.aprovado_em instanceof Date
                ? (r.aprovado_em as Date).toISOString()
                : (r.aprovado_em as string | null),
            motivoRejeicao: r.motivo_rejeicao as string | null,
            criadoEm:
              r.criado_em instanceof Date
                ? (r.criado_em as Date).toISOString()
                : String(r.criado_em ?? ''),
            diasAusencia: Number(r.dias_ausencia ?? 0),
          }));

          const totalPorStatus = registros.reduce<Record<string, number>>((acc, row) => {
            const s = row.status as string;
            acc[s] = (acc[s] ?? 0) + 1;
            return acc;
          }, {});

          const totalPorTipoMap = registros.reduce<
            Record<string, { nome: string; cor: string; quantidade: number }>
          >((acc, row) => {
            const id = row.tipoAusenciaId as string;
            const existing = acc[id];
            if (existing) {
              existing.quantidade += 1;
            } else {
              acc[id] = {
                nome: row.tipoAusenciaNome as string,
                cor: row.tipoAusenciaCor as string,
                quantidade: 1,
              };
            }
            return acc;
          }, {});

          const totalPorColaboradorMap = registros.reduce<
            Record<string, { nome: string; quantidade: number }>
          >((acc, row) => {
            const id = row.usuarioId as string;
            const existing = acc[id];
            if (existing) {
              existing.quantidade += 1;
            } else {
              acc[id] = { nome: row.colaboradorNome as string, quantidade: 1 };
            }
            return acc;
          }, {});

          const diasAprovados = registros
            .filter((r) => r.status === 'aprovado')
            .reduce((sum, r) => sum + r.diasAusencia, 0);

          const horasAprovadas = registros
            .filter((r) => r.status === 'aprovado' && r.horasAusencia)
            .reduce((sum, r) => sum + Number(r.horasAusencia ?? 0), 0);

          // Filter options — always return full list independent of active filters
          const colaboradoresResult = await server.database.query<{ id: string; nome: string }>(
            `SELECT DISTINCT u.id, u.nome
             FROM ausencias a
             JOIN usuarios u ON u.id = a.usuario_id
             ORDER BY u.nome`
          );

          const tiposResult = await server.database.query<{
            id: string;
            nome: string;
            cor: string;
          }>(`SELECT id, nome, cor FROM tipos_ausencia ORDER BY nome`);

          return reply.status(200).send({
            registros,
            totais: {
              totalRegistros,
              totalPorStatus,
              totalPorTipo: Object.entries(totalPorTipoMap).map(([id, v]) => ({ id, ...v })),
              totalPorColaborador: Object.entries(totalPorColaboradorMap).map(([id, v]) => ({
                id,
                ...v,
              })),
              diasAprovados,
              horasAprovadas,
            },
            filtros: {
              colaboradores: colaboradoresResult.rows,
              tipos: tiposResult.rows,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Erro ao gerar relatório de ausências';
          return reply.status(500).send({ error: message });
        }
      }
    );
  };
}

async function gerarRelatorioCompleto(
  server: FastifyInstance,
  dataInicio: string,
  dataFim: string,
  coordenadoriaId?: string
): Promise<RelatorioCompleto> {
  // Mapeamento de funcao para unidade
  // Digitalização = imagens, todo o resto = caixas
  const funcaoUnidadeMap: Record<string, string> = {
    'DIGITALIZAÇÃO P/B': 'IMAGENS',
    'DIGITALIZAÇÃO COLORIDA': 'IMAGENS',
    'DIGITALIZACAO P/B': 'IMAGENS',
    'DIGITALIZACAO COLORIDA': 'IMAGENS',
  };

  // Mapeamento de funcao para ordem de exibição
  // Ordem: Recebimento, Preparação, Digitalização P/B, Digitalização Colorida, Conferência, Montagem, Reconferência
  const funcaoOrdemMap: Record<string, number> = {
    RECEBIMENTO: 1,
    PREPARAÇÃO: 2,
    PREPARACAO: 2,
    'DIGITALIZAÇÃO P/B': 3,
    'DIGITALIZACAO P/B': 3,
    'DIGITALIZAÇÃO COLORIDA': 4,
    'DIGITALIZACAO COLORIDA': 4,
    CONFERÊNCIA: 5,
    CONFERENCIA: 5,
    MONTAGEM: 6,
    RECONFERÊNCIA: 7,
    RECONFERENCIA: 7,
    CONTROLE_QUALIDADE: 7,
    ENTREGA: 8,
  };

  // Mapeamento de etapa do sistema para nome legível (fallback quando funcao não está preenchida)
  const etapaFuncaoFallback: Record<string, string> = {
    RECEBIMENTO: 'RECEBIMENTO',
    PREPARACAO: 'PREPARAÇÃO',
    DIGITALIZACAO: 'DIGITALIZAÇÃO P/B',
    CONFERENCIA: 'CONFERÊNCIA',
    MONTAGEM: 'MONTAGEM',
    CONTROLE_QUALIDADE: 'RECONFERÊNCIA',
    ENTREGA: 'ENTREGA',
  };

  const registrosQuery = `
    SELECT
      p.id,
      p.etapa::text as etapa_sistema,
      p.quantidade,
      p.data_producao,
      COALESCE(NULLIF(TRIM(p.marcadores->>'funcao'), ''), '') as funcao_marcador,
      COALESCE(NULLIF(TRIM(p.marcadores->>'tipo'), ''), '') as tipo_marcador,
      COALESCE(NULLIF(TRIM(p.marcadores->>'coordenadoria'), ''), '') as coord_marcador,
      u.id as colaborador_id,
      COALESCE(NULLIF(p.marcadores->>'colaborador_nome', ''), u.nome) as colaborador_nome,
      ''::text as colaborador_matricula,
      u.coordenadoria_id,
      COALESCE(co.nome, 'Sem coordenadoria') as coordenadoria_nome,
      COALESCE(co.sigla, NULLIF(TRIM(p.marcadores->>'coordenadoria'), ''), 'SEM') as coordenadoria_sigla
    FROM producao_repositorio p
    JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN coordenadorias co ON co.id = u.coordenadoria_id
    ${coordenadoriaId ? 'LEFT JOIN coordenadorias co_filtro ON co_filtro.id = $3' : ''}
    WHERE ${sqlDateInSystemTimezone('p')} >= $1::date
      AND ${sqlDateInSystemTimezone('p')} <= $2::date
      AND ${buildProducaoContabilizadaWhere('p')}
      ${
        coordenadoriaId
          ? `AND (
        u.coordenadoria_id = $3
        OR LOWER(TRIM(p.marcadores->>'coordenadoria')) = LOWER(co_filtro.sigla)
        OR LOWER(TRIM(p.marcadores->>'coordenadoria')) = LOWER(co_filtro.nome)
      )`
          : ''
      }
    ORDER BY p.data_producao
  `;

  const params = coordenadoriaId ? [dataInicio, dataFim, coordenadoriaId] : [dataInicio, dataFim];
  const registrosResult = await server.database.query(registrosQuery, params);

  // Chave composta: colaborador+coordenadoria (um colaborador pode aparecer em várias coordenadorias)
  // producaoMap: chave composta "usuarioId||coordId" -> Map<etapaId, quantidade>
  const producaoMap = new Map<string, Map<string, number>>();
  const chaveInfo = new Map<
    string,
    { nome: string; matricula: string; coordId: string; colaboradorId: string }
  >();
  const etapasInfo = new Map<string, { nome: string; unidade: string; ordem: number }>();
  const coordenadoriasInfo = new Map<string, { nome: string; sigla: string }>();

  for (const row of registrosResult.rows) {
    const colaboradorNome = row.colaborador_nome as string;
    const colaboradorId = row.colaborador_id as string;
    const etapaSistema = row.etapa_sistema as string;
    const funcaoMarcador = row.funcao_marcador as string;
    const quantidade = row.quantidade as number;

    // Usar funcao do marcador se disponível, senão mapear da etapa do sistema
    const funcaoDisplay = funcaoMarcador || etapaFuncaoFallback[etapaSistema] || etapaSistema;
    const etapaId = funcaoDisplay.toUpperCase();
    const unidade = funcaoUnidadeMap[etapaId] ?? 'CAIXAS';
    const ordem = funcaoOrdemMap[etapaId] ?? 99;

    // Coordenadoria: usar marcador quando coordenadoria_id do sistema é null
    const coordSigla = (row.coordenadoria_sigla as string) || 'SEM';
    const coordNome = (row.coordenadoria_nome as string) || 'Sem coordenadoria';
    const coordId = (row.coordenadoria_id as string) || `coord_${coordSigla}`;

    // Chave composta: colaborador + coordenadoria
    const chave = `${colaboradorId}||${coordId}`;

    if (!producaoMap.has(chave)) {
      producaoMap.set(chave, new Map());
    }
    const etapasColaborador = producaoMap.get(chave)!;
    const atual = etapasColaborador.get(etapaId) ?? 0;
    etapasColaborador.set(etapaId, atual + quantidade);

    chaveInfo.set(chave, {
      nome: colaboradorNome,
      matricula: row.colaborador_matricula as string,
      coordId,
      colaboradorId,
    });

    etapasInfo.set(etapaId, {
      nome: funcaoDisplay,
      unidade,
      ordem,
    });

    coordenadoriasInfo.set(coordId, {
      nome: coordNome,
      sigla: coordSigla,
    });
  }

  // Resumo por etapa (agregar todas as chaves compostas)
  const resumoPorEtapa: ResumoEtapa[] = [];
  const producaoPorEtapaTotal = new Map<
    string,
    { quantidade: number; colaboradores: Set<string> }
  >();

  for (const [chave, etapasProducao] of producaoMap) {
    const info = chaveInfo.get(chave)!;
    for (const [etapaId, quantidade] of etapasProducao) {
      if (!producaoPorEtapaTotal.has(etapaId)) {
        producaoPorEtapaTotal.set(etapaId, { quantidade: 0, colaboradores: new Set() });
      }
      const etapaTotal = producaoPorEtapaTotal.get(etapaId)!;
      etapaTotal.quantidade += quantidade;
      etapaTotal.colaboradores.add(info.colaboradorId);
    }
  }

  for (const [etapaId, dados] of producaoPorEtapaTotal) {
    const etapaInfo = etapasInfo.get(etapaId);
    if (!etapaInfo) continue;

    resumoPorEtapa.push({
      etapaId,
      etapaNome: etapaInfo.nome,
      unidade: etapaInfo.unidade,
      ordem: etapaInfo.ordem,
      totalQuantidade: dados.quantidade,
      totalColaboradores: dados.colaboradores.size,
      mediaPorColaborador:
        dados.colaboradores.size > 0 ? Math.round(dados.quantidade / dados.colaboradores.size) : 0,
    });
  }

  resumoPorEtapa.sort((a, b) => a.ordem - b.ordem);

  // Agrupar por coordenadoria -> colaborador -> etapas
  const producaoPorCoordenadoria: ProducaoCoordenadoria[] = [];
  const coordenadoriasComProducao = new Map<string, Map<string, Map<string, number>>>();

  for (const [chave, etapasProducao] of producaoMap) {
    const info = chaveInfo.get(chave);
    if (!info) continue;

    const coordId = info.coordId;
    if (!coordenadoriasComProducao.has(coordId)) {
      coordenadoriasComProducao.set(coordId, new Map());
    }

    const colaboradoresCoordenadoria = coordenadoriasComProducao.get(coordId)!;
    colaboradoresCoordenadoria.set(chave, etapasProducao);
  }

  for (const [coordId, colaboradoresProducao] of coordenadoriasComProducao) {
    const coordInfo = coordenadoriasInfo.get(coordId);
    if (!coordInfo) continue;

    const colaboradoresRelatorio: ProducaoColaborador[] = [];
    const totaisPorEtapa = new Map<string, number>();
    let totalGeralCoordenadoria = 0;
    let totalCaixasCoordenadoria = 0;
    let totalImagensCoordenadoria = 0;

    for (const [colaboradorId, etapasProducao] of colaboradoresProducao) {
      const colaboradorInfo = chaveInfo.get(colaboradorId);
      if (!colaboradorInfo) continue;

      const etapasColaborador: ProducaoEtapa[] = [];
      let totalColaborador = 0;

      for (const [etapaId, quantidade] of etapasProducao) {
        const etapaInfo = etapasInfo.get(etapaId);
        if (!etapaInfo) continue;

        etapasColaborador.push({
          etapaId,
          etapaNome: etapaInfo.nome,
          unidade: etapaInfo.unidade,
          ordem: etapaInfo.ordem,
          quantidade,
        });

        totalColaborador += quantidade;
        totaisPorEtapa.set(etapaId, (totaisPorEtapa.get(etapaId) ?? 0) + quantidade);
        if (etapaInfo.unidade === 'IMAGENS') {
          totalImagensCoordenadoria += quantidade;
        } else {
          totalCaixasCoordenadoria += quantidade;
        }
      }

      etapasColaborador.sort((a, b) => a.ordem - b.ordem);

      colaboradoresRelatorio.push({
        colaboradorId: colaboradorInfo.colaboradorId,
        colaboradorNome: colaboradorInfo.nome,
        matricula: colaboradorInfo.matricula,
        etapas: etapasColaborador,
        total: totalColaborador,
      });

      totalGeralCoordenadoria += totalColaborador;
    }

    colaboradoresRelatorio.sort((a, b) => a.colaboradorNome.localeCompare(b.colaboradorNome));

    const totaisEtapaArray: ProducaoEtapa[] = [];
    for (const [etapaId, quantidade] of totaisPorEtapa) {
      const etapaInfo = etapasInfo.get(etapaId);
      if (!etapaInfo) continue;

      totaisEtapaArray.push({
        etapaId,
        etapaNome: etapaInfo.nome,
        unidade: etapaInfo.unidade,
        ordem: etapaInfo.ordem,
        quantidade,
      });
    }

    totaisEtapaArray.sort((a, b) => a.ordem - b.ordem);

    producaoPorCoordenadoria.push({
      coordenadoriaId: coordId,
      coordenadoriaNome: coordInfo.nome,
      coordenadoriaSigla: coordInfo.sigla,
      colaboradores: colaboradoresRelatorio,
      totaisPorEtapa: totaisEtapaArray,
      totalGeral: totalGeralCoordenadoria,
      totalCaixas: totalCaixasCoordenadoria,
      totalImagens: totalImagensCoordenadoria,
    });
  }

  producaoPorCoordenadoria.sort((a, b) => a.coordenadoriaSigla.localeCompare(b.coordenadoriaSigla));

  const glossario = [
    {
      termo: 'Recebimento',
      definicao: 'entrada dos documentos e organização inicial do material.',
    },
    {
      termo: 'Preparação',
      definicao: 'ordenação, higienização e estabilização dos documentos físicos.',
    },
    {
      termo: 'Digitalização',
      definicao: 'conversão dos documentos físicos em arquivos digitais de alta qualidade.',
    },
    {
      termo: 'Conferência',
      definicao:
        'verificação do material digitalizado, incluindo indexação e validação das informações.',
    },
    {
      termo: 'Reconferência',
      definicao: 'revisão final para garantir o controle de qualidade e conformidade.',
    },
    {
      termo: 'Montagem',
      definicao: 'agrupamento do conteúdo validado e finalização dos volumes para entrega.',
    },
  ];

  const totalGeral = resumoPorEtapa.reduce((acc, e) => acc + e.totalQuantidade, 0);
  const totalCaixas = resumoPorEtapa
    .filter((e) => e.unidade === 'CAIXAS')
    .reduce((acc, e) => acc + e.totalQuantidade, 0);
  const totalImagens = resumoPorEtapa
    .filter((e) => e.unidade === 'IMAGENS')
    .reduce((acc, e) => acc + e.totalQuantidade, 0);
  const colaboradoresUnicos = new Set<string>();
  for (const coord of producaoPorCoordenadoria) {
    for (const colab of coord.colaboradores) {
      colaboradoresUnicos.add(colab.colaboradorNome.trim().toLowerCase());
    }
  }

  return {
    titulo: 'Resumo Gerencial de Produção',
    periodo: {
      inicio: dataInicio,
      fim: dataFim,
    },
    dataGeracao: new Date().toISOString(),
    resumoPorEtapa,
    producaoPorCoordenadoria,
    glossario,
    totais: {
      totalGeral,
      totalCaixas,
      totalImagens,
      totalColaboradores: colaboradoresUnicos.size,
      totalCoordenadorias: producaoPorCoordenadoria.length,
      totalEtapas: resumoPorEtapa.length,
    },
  };
}
