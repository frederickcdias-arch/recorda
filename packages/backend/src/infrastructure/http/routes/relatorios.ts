import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authorize } from '../middleware/auth.js';
import { PDFExportService } from '../../services/pdf-export-service.js';
import { ExcelExportService } from '../../services/excel-export-service.js';
import type {
  ProducaoEtapa,
  ProducaoColaborador,
  ProducaoCoordenadoria,
  ResumoEtapa,
  RelatorioCompleto,
} from '../../../application/use-cases/gerar-relatorio-completo.js';

interface RelatorioQuery {
  dataInicio: string;
  dataFim: string;
  coordenadoriaId?: string;
  formato?: 'json' | 'pdf' | 'excel';
  tipo?: string;
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
          const relatorio = await gerarRelatorioCompleto(server, dataInicio, dataFim, coordenadoriaId);

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
            `SELECT nome, cnpj, endereco, telefone, email, logo_url,
                    exibir_logo_relatorio, exibir_endereco_relatorio, exibir_contato_relatorio
             FROM configuracao_empresa LIMIT 1`
          );
          const empresaRow = empresaResult.rows[0] as Record<string, unknown> | undefined;
          const empresaConfig = empresaRow ? {
            nome: (empresaRow.nome as string) || '',
            endereco: (empresaRow.endereco as string) || '',
            telefone: (empresaRow.telefone as string) || '',
            email: (empresaRow.email as string) || '',
            logoUrl: (empresaRow.logo_url as string) || '',
            exibirLogoRelatorio: empresaRow.exibir_logo_relatorio !== false,
            exibirEnderecoRelatorio: empresaRow.exibir_endereco_relatorio !== false,
            exibirContatoRelatorio: empresaRow.exibir_contato_relatorio === true,
          } : null;

          switch (formato) {
            case 'pdf': {
              const pdfBuffer = await pdfService.exportar(relatorio, empresaConfig);
              const dataInicioPt = new Date(dataInicio).toLocaleDateString('pt-BR').replace(/\//g, '-');
              const dataFimPt = new Date(dataFim).toLocaleDateString('pt-BR').replace(/\//g, '-');
              const filename = `relatorio_${tipo ?? 'geral'}_${dataInicioPt}_a_${dataFimPt}.pdf`;

              return reply
                .header('Content-Type', 'application/pdf')
                .header('Content-Disposition', `attachment; filename="${filename}"`)
                .send(pdfBuffer);
            }

            case 'excel': {
              const excelBuffer = await excelService.exportar(relatorio);
              const dataInicioPt = new Date(dataInicio).toLocaleDateString('pt-BR').replace(/\//g, '-');
              const dataFimPt = new Date(dataFim).toLocaleDateString('pt-BR').replace(/\//g, '-');
              const filename = `relatorio_${tipo ?? 'geral'}_${dataInicioPt}_a_${dataFimPt}.xlsx`;

              return reply
                .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
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
          const relatorio = await gerarRelatorioCompleto(server, dataInicio, dataFim, coordenadoriaId);

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

    server.get('/relatorios/coordenadorias', {
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (_request, reply) => {
      try {
        const result = await server.database.query(
          `SELECT id, nome, sigla FROM coordenadorias WHERE ativa = true ORDER BY sigla`
        );
        return reply.status(200).send(result.rows);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao buscar coordenadorias';
        return reply.status(500).send({ error: message });
      }
    });

    // GET /relatorios/operacional - Relatório operacional
    server.get<{ Querystring: { dataInicio: string; dataFim: string } }>(
      '/relatorios/operacional',
      {
        preHandler: [server.authenticate, authorize('operador', 'administrador')],
      },
      async (request, reply) => {
        const { dataInicio, dataFim } = request.query;

        try {
          const result = await server.database.query(`
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
            WHERE (p.data_producao AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date
              AND COALESCE(p.marcadores->>'origem', '') = 'LEGADO'
              AND p.etapa::text NOT IN ('RECEBIMENTO', 'CONTROLE_QUALIDADE')
            ORDER BY p.data_producao DESC, u.nome
          `, [dataInicio, dataFim]);

          return reply.send({ registros: result.rows });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao gerar relatório';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /relatorios/operacional/export - Export operacional data as Excel
    // Supports ?token= query param for iframe preview (copies token to Authorization header)
    server.get<{ Querystring: { dataInicio: string; dataFim: string; formato?: string; token?: string } }>(
      '/relatorios/operacional/export',
      {
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
        const { dataInicio, dataFim } = request.query;

        try {
          const result = await server.database.query(`
            SELECT
              p.data_producao,
              COALESCE(NULLIF(p.marcadores->>'colaborador_nome', ''), u.nome) as colaborador,
              p.etapa::text as etapa,
              COALESCE(NULLIF(TRIM(p.marcadores->>'funcao'), ''), '') as funcao,
              r.id_repositorio_ged as repositorio,
              p.quantidade,
              COALESCE(NULLIF(TRIM(p.marcadores->>'tipo'), ''), '') as tipo,
              COALESCE(co.sigla, COALESCE(NULLIF(TRIM(p.marcadores->>'coordenadoria'), ''), '')) as coordenadoria,
              CASE WHEN r.projeto = 'LEGADO' THEN 'Legado' ELSE 'Fluxo' END as origem
            FROM producao_repositorio p
            JOIN usuarios u ON u.id = p.usuario_id
            JOIN repositorios r ON r.id_repositorio_recorda = p.repositorio_id
            LEFT JOIN coordenadorias co ON co.id = u.coordenadoria_id
            WHERE (p.data_producao AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date
              AND COALESCE(p.marcadores->>'origem', '') = 'LEGADO'
              AND p.etapa::text NOT IN ('RECEBIMENTO', 'CONTROLE_QUALIDADE')
            ORDER BY p.data_producao DESC, colaborador
          `, [dataInicio, dataFim]);

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

          for (const row of result.rows) {
            const r = row as Record<string, unknown>;
            sheet.addRow({
              data: r.data_producao ? new Date(r.data_producao as string).toLocaleDateString('pt-BR') : '',
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
            colaborador: `Total: ${result.rows.length} registros`,
            etapa: '',
            funcao: '',
            repositorio: '',
            quantidade: result.rows.reduce((sum, r) => sum + Number((r as Record<string, unknown>).quantidade ?? 0), 0),
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
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(Buffer.from(buffer));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao exportar relatório operacional';
          return reply.status(500).send({ error: message });
        }
      }
    );

    // GET /operacional/producao - Listar registros de produção com filtros
    server.get('/operacional/producao', {
      preHandler: [server.authenticate, authorize('operador', 'administrador')],
    }, async (request, reply) => {
      try {
        const query = request.query as {
          pagina?: string;
          limite?: string;
          etapa?: string;
          colaborador?: string;
          repositorio?: string;
          dataInicio?: string;
          dataFim?: string;
          origem?: 'legado' | 'fluxo' | '';
          busca?: string;
        };

        const pagina = Math.max(Number(query.pagina ?? 1), 1);
        const limite = Math.min(Math.max(Number(query.limite ?? 25), 1), 100);
        const offset = (pagina - 1) * limite;

        let where = `WHERE COALESCE(p.marcadores->>'origem', '') = 'LEGADO'
          AND p.etapa::text NOT IN ('RECEBIMENTO', 'CONTROLE_QUALIDADE')`;
        const params: (string | number)[] = [];
        let p = 1;

        if (query.etapa) {
          where += ` AND p.etapa::text = $${p++}`;
          params.push(query.etapa.toUpperCase());
        }
        if (query.colaborador) {
          where += ` AND LOWER(COALESCE(NULLIF(p.marcadores->>'colaborador_nome', ''), u.nome)) = LOWER($${p++})`;
          params.push(query.colaborador);
        }
        if (query.dataInicio) {
          where += ` AND (p.data_producao AT TIME ZONE 'America/Sao_Paulo')::date >= $${p++}::date`;
          params.push(query.dataInicio);
        }
        if (query.dataFim) {
          where += ` AND (p.data_producao AT TIME ZONE 'America/Sao_Paulo')::date <= $${p++}::date`;
          params.push(query.dataFim);
        }
        if (query.origem === 'legado') {
          where += ` AND r.projeto = 'LEGADO'`;
        } else if (query.origem === 'fluxo') {
          // Produção desta tela é apenas importada; origem fluxo deve retornar vazio.
          where += ` AND 1 = 0`;
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
             CASE WHEN r.projeto = 'LEGADO' THEN 'LEGADO' ELSE 'FLUXO' END as origem,
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
        const colaboradoresResult = await server.database.query<{ id: string; nome: string }>(
          `SELECT DISTINCT
             INITCAP(LOWER(COALESCE(NULLIF(p.marcadores->>'colaborador_nome', ''), u.nome))) as nome,
             INITCAP(LOWER(COALESCE(NULLIF(p.marcadores->>'colaborador_nome', ''), u.nome))) as id
           FROM producao_repositorio p
           JOIN usuarios u ON u.id = p.usuario_id
           WHERE COALESCE(p.marcadores->>'origem', '') = 'LEGADO'
             AND p.etapa::text NOT IN ('RECEBIMENTO', 'CONTROLE_QUALIDADE')
           ORDER BY nome`
        );

        const etapasResult = await server.database.query<{ etapa: string }>(
          `SELECT DISTINCT etapa::text as etapa
           FROM producao_repositorio
           WHERE COALESCE(marcadores->>'origem', '') = 'LEGADO'
             AND etapa::text NOT IN ('RECEBIMENTO', 'CONTROLE_QUALIDADE')
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
            etapas: etapasResult.rows.map(e => e.etapa),
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao listar produção';
        return reply.status(500).send({ error: message });
      }
    });

    // DELETE /producao - Limpar registros de produção importada (admin-only)
    server.delete('/producao', {
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (_request, reply) => {
      try {
        const countResult = await server.database.query<{ total: string }>(
          `SELECT COUNT(*)::text as total
           FROM producao_repositorio
           WHERE COALESCE(marcadores->>'origem', '') = 'LEGADO'`
        );
        const total = Number(countResult.rows[0]?.total ?? '0');

        if (total === 0) {
          return reply.send({ message: 'Nenhum registro de produção importada para excluir', removidos: 0 });
        }

        await server.database.query(
          `DELETE FROM producao_repositorio
           WHERE COALESCE(marcadores->>'origem', '') = 'LEGADO'`
        );
        return reply.send({ message: 'Registros de produção importada foram excluídos', removidos: total });
      } catch (error) {
        server.log.error(error, 'Erro ao limpar registros de produção importada');
        const message = error instanceof Error ? error.message : 'Erro ao limpar registros de produção importada';
        return reply.status(500).send({ error: message });
      }
    });

    // DELETE /producao/:id - Excluir registro de produção (admin-only)
    server.delete('/producao/:id', {
      preHandler: [server.authenticate, authorize('administrador')],
    }, async (request, reply) => {
      try {
        const { id } = request.params as { id: string };

        const check = await server.database.query(
          `SELECT id FROM producao_repositorio WHERE id = $1`,
          [id]
        );
        if (check.rows.length === 0) {
          return reply.status(404).send({ error: 'Registro de produção não encontrado' });
        }

        await server.database.query(
          `DELETE FROM producao_repositorio WHERE id = $1`,
          [id]
        );

        return reply.send({ message: 'Registro de produção excluído com sucesso' });
      } catch (error) {
        server.log.error(error, 'Erro ao excluir registro de produção');
        const message = error instanceof Error ? error.message : 'Erro ao excluir registro de produção';
        return reply.status(500).send({ error: message });
      }
    });
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
    'RECEBIMENTO': 1,
    'PREPARAÇÃO': 2,
    'PREPARACAO': 2,
    'DIGITALIZAÇÃO P/B': 3,
    'DIGITALIZACAO P/B': 3,
    'DIGITALIZAÇÃO COLORIDA': 4,
    'DIGITALIZACAO COLORIDA': 4,
    'CONFERÊNCIA': 5,
    'CONFERENCIA': 5,
    'MONTAGEM': 6,
    'RECONFERÊNCIA': 7,
    'RECONFERENCIA': 7,
    'CONTROLE_QUALIDADE': 7,
    'ENTREGA': 8,
  };

  // Mapeamento de etapa do sistema para nome legível (fallback quando funcao não está preenchida)
  const etapaFuncaoFallback: Record<string, string> = {
    'RECEBIMENTO': 'RECEBIMENTO',
    'PREPARACAO': 'PREPARAÇÃO',
    'DIGITALIZACAO': 'DIGITALIZAÇÃO P/B',
    'CONFERENCIA': 'CONFERÊNCIA',
    'MONTAGEM': 'MONTAGEM',
    'CONTROLE_QUALIDADE': 'RECONFERÊNCIA',
    'ENTREGA': 'ENTREGA',
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
    WHERE (p.data_producao AT TIME ZONE 'America/Sao_Paulo')::date >= $1::date
      AND (p.data_producao AT TIME ZONE 'America/Sao_Paulo')::date <= $2::date
      AND COALESCE(p.marcadores->>'origem', '') = 'LEGADO'
      AND p.etapa::text NOT IN ('RECEBIMENTO', 'CONTROLE_QUALIDADE')
      ${coordenadoriaId ? 'AND u.coordenadoria_id = $3' : ''}
    ORDER BY p.data_producao
  `;

  const params = coordenadoriaId ? [dataInicio, dataFim, coordenadoriaId] : [dataInicio, dataFim];
  const registrosResult = await server.database.query(registrosQuery, params);

  // Chave composta: colaborador+coordenadoria (um colaborador pode aparecer em várias coordenadorias)
  // producaoMap: chave composta "nomeNorm||coordId" -> Map<etapaId, quantidade>
  const producaoMap = new Map<string, Map<string, number>>();
  const chaveInfo = new Map<string, { nome: string; matricula: string; coordId: string }>();
  const etapasInfo = new Map<string, { nome: string; unidade: string; ordem: number }>();
  const coordenadoriasInfo = new Map<string, { nome: string; sigla: string }>();

  for (const row of registrosResult.rows) {
    const colaboradorNome = row.colaborador_nome as string;
    const nomeNorm = colaboradorNome.trim().toLowerCase();
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
    const chave = `${nomeNorm}||${coordId}`;

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
  const producaoPorEtapaTotal = new Map<string, { quantidade: number; colaboradores: Set<string> }>();

  for (const [chave, etapasProducao] of producaoMap) {
    const info = chaveInfo.get(chave)!;
    const nomeNorm = info.nome.trim().toLowerCase();
    for (const [etapaId, quantidade] of etapasProducao) {
      if (!producaoPorEtapaTotal.has(etapaId)) {
        producaoPorEtapaTotal.set(etapaId, { quantidade: 0, colaboradores: new Set() });
      }
      const etapaTotal = producaoPorEtapaTotal.get(etapaId)!;
      etapaTotal.quantidade += quantidade;
      etapaTotal.colaboradores.add(nomeNorm); // contar colaboradores únicos por nome
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
      mediaPorColaborador: dados.colaboradores.size > 0 ? Math.round(dados.quantidade / dados.colaboradores.size) : 0,
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
      }

      etapasColaborador.sort((a, b) => a.ordem - b.ordem);

      colaboradoresRelatorio.push({
        colaboradorId,
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
    });
  }

  producaoPorCoordenadoria.sort((a, b) => a.coordenadoriaSigla.localeCompare(b.coordenadoriaSigla));

  const glossario = [
    { termo: 'Recebimento', definicao: 'entrada dos documentos e organização inicial do material.' },
    { termo: 'Preparação', definicao: 'ordenação, higienização e estabilização dos documentos físicos.' },
    { termo: 'Digitalização', definicao: 'conversão dos documentos físicos em arquivos digitais de alta qualidade.' },
    { termo: 'Conferência', definicao: 'verificação do material digitalizado, incluindo indexação e validação das informações.' },
    { termo: 'Reconferência', definicao: 'revisão final para garantir o controle de qualidade e conformidade.' },
    { termo: 'Montagem', definicao: 'agrupamento do conteúdo validado e finalização dos volumes para entrega.' },
  ];

  const totalGeral = resumoPorEtapa.reduce((acc, e) => acc + e.totalQuantidade, 0);
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
      totalColaboradores: colaboradoresUnicos.size,
      totalCoordenadorias: producaoPorCoordenadoria.length,
      totalEtapas: resumoPorEtapa.length,
    },
  };
}
