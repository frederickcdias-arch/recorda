import ExcelJS from 'exceljs';
import type { RelatorioCompleto } from '../../application/use-cases/gerar-relatorio-completo.js';

export class ExcelExportService {
  async exportar(relatorio: RelatorioCompleto): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Recorda';
    workbook.created = new Date();

    this.criarAbaResumo(workbook, relatorio);
    this.criarAbaEtapas(workbook, relatorio);
    this.criarAbaCoordenadorias(workbook, relatorio);
    this.criarAbaColaboradores(workbook, relatorio);
    this.criarAbaGlossario(workbook, relatorio);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private criarAbaResumo(workbook: ExcelJS.Workbook, relatorio: RelatorioCompleto): void {
    const sheet = workbook.addWorksheet('Resumo');

    sheet.columns = [
      { header: 'Campo', key: 'campo', width: 25 },
      { header: 'Valor', key: 'valor', width: 40 },
    ];

    const dataInicio = new Date(relatorio.periodo.inicio).toLocaleDateString('pt-BR');
    const dataFim = new Date(relatorio.periodo.fim).toLocaleDateString('pt-BR');
    const dataGeracao = new Date(relatorio.dataGeracao).toLocaleString('pt-BR');

    sheet.addRow({ campo: 'Título', valor: relatorio.titulo });
    sheet.addRow({ campo: 'Período', valor: `${dataInicio} a ${dataFim}` });
    sheet.addRow({ campo: 'Data de Geração', valor: dataGeracao });
    sheet.addRow({ campo: '', valor: '' });
    sheet.addRow({ campo: 'Total Caixas', valor: relatorio.totais.totalCaixas });
    sheet.addRow({ campo: 'Total Imagens', valor: relatorio.totais.totalImagens });
    sheet.addRow({ campo: 'Total Geral', valor: relatorio.totais.totalGeral });
    sheet.addRow({ campo: 'Total de Colaboradores', valor: relatorio.totais.totalColaboradores });
    sheet.addRow({ campo: 'Total de Coordenadorias', valor: relatorio.totais.totalCoordenadorias });
    sheet.addRow({ campo: 'Total de Etapas', valor: relatorio.totais.totalEtapas });

    this.estilizarCabecalho(sheet);
  }

  private criarAbaEtapas(workbook: ExcelJS.Workbook, relatorio: RelatorioCompleto): void {
    const sheet = workbook.addWorksheet('Por Etapa');

    sheet.columns = [
      { header: 'Ordem', key: 'ordem', width: 10 },
      { header: 'Etapa', key: 'etapa', width: 30 },
      { header: 'Unidade', key: 'unidade', width: 15 },
      { header: 'Quantidade', key: 'quantidade', width: 15 },
      { header: 'Colaboradores', key: 'colaboradores', width: 15 },
      { header: 'Média', key: 'media', width: 15 },
    ];

    for (const etapa of relatorio.resumoPorEtapa) {
      sheet.addRow({
        ordem: etapa.ordem,
        etapa: etapa.etapaNome,
        unidade: etapa.unidade,
        quantidade: etapa.totalQuantidade,
        colaboradores: etapa.totalColaboradores,
        media: etapa.mediaPorColaborador,
      });
    }

    const totalCaixasRow = sheet.addRow({
      ordem: '',
      etapa: 'TOTAL CAIXAS',
      unidade: 'CAIXAS',
      quantidade: relatorio.totais.totalCaixas,
      colaboradores: relatorio.totais.totalColaboradores,
      media: '',
    });
    totalCaixasRow.font = { bold: true };
    const totalImagensRow = sheet.addRow({
      ordem: '',
      etapa: 'TOTAL IMAGENS',
      unidade: 'IMAGENS',
      quantidade: relatorio.totais.totalImagens,
      colaboradores: '',
      media: '',
    });
    totalImagensRow.font = { bold: true };

    this.estilizarCabecalho(sheet);
  }

  private criarAbaCoordenadorias(workbook: ExcelJS.Workbook, relatorio: RelatorioCompleto): void {
    const sheet = workbook.addWorksheet('Por Coordenadoria');

    sheet.columns = [
      { header: 'Sigla', key: 'sigla', width: 15 },
      { header: 'Coordenadoria', key: 'nome', width: 35 },
      { header: 'Colaboradores', key: 'colaboradores', width: 15 },
      { header: 'Caixas', key: 'caixas', width: 15 },
      { header: 'Imagens', key: 'imagens', width: 15 },
      { header: 'Total', key: 'total', width: 15 },
    ];

    for (const coord of relatorio.producaoPorCoordenadoria) {
      sheet.addRow({
        sigla: coord.coordenadoriaSigla,
        nome: coord.coordenadoriaNome,
        colaboradores: coord.colaboradores.length,
        caixas: coord.totalCaixas,
        imagens: coord.totalImagens,
        total: coord.totalGeral,
      });
    }

    const totalRow = sheet.addRow({
      sigla: '',
      nome: 'TOTAL',
      colaboradores: relatorio.totais.totalColaboradores,
      caixas: relatorio.totais.totalCaixas,
      imagens: relatorio.totais.totalImagens,
      total: relatorio.totais.totalGeral,
    });
    totalRow.font = { bold: true };

    this.estilizarCabecalho(sheet);
  }

  private criarAbaColaboradores(workbook: ExcelJS.Workbook, relatorio: RelatorioCompleto): void {
    const sheet = workbook.addWorksheet('Por Colaborador');

    const etapasUnicas = new Set<string>();
    for (const coord of relatorio.producaoPorCoordenadoria) {
      for (const colab of coord.colaboradores) {
        for (const etapa of colab.etapas) {
          etapasUnicas.add(etapa.etapaNome);
        }
      }
    }
    const etapasArray = Array.from(etapasUnicas).sort();

    const columns: Partial<ExcelJS.Column>[] = [
      { header: 'Coordenadoria', key: 'coordenadoria', width: 15 },
      { header: 'Matrícula', key: 'matricula', width: 12 },
      { header: 'Colaborador', key: 'colaborador', width: 30 },
    ];

    for (const etapa of etapasArray) {
      columns.push({ header: etapa, key: etapa, width: 12 });
    }
    columns.push({ header: 'Total', key: 'total', width: 12 });

    sheet.columns = columns;

    for (const coord of relatorio.producaoPorCoordenadoria) {
      for (const colab of coord.colaboradores) {
        const row: Record<string, string | number> = {
          coordenadoria: coord.coordenadoriaSigla,
          matricula: colab.matricula,
          colaborador: colab.colaboradorNome,
        };

        for (const etapa of etapasArray) {
          const producaoEtapa = colab.etapas.find((e) => e.etapaNome === etapa);
          row[etapa] = producaoEtapa?.quantidade ?? 0;
        }
        row['total'] = colab.total;

        sheet.addRow(row);
      }
    }

    this.estilizarCabecalho(sheet);
  }

  private criarAbaGlossario(workbook: ExcelJS.Workbook, relatorio: RelatorioCompleto): void {
    const sheet = workbook.addWorksheet('Glossário');

    sheet.columns = [
      { header: 'Termo', key: 'termo', width: 20 },
      { header: 'Definição', key: 'definicao', width: 80 },
    ];

    for (const item of relatorio.glossario) {
      sheet.addRow({ termo: item.termo, definicao: item.definicao });
    }

    this.estilizarCabecalho(sheet);
  }

  private estilizarCabecalho(sheet: ExcelJS.Worksheet): void {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3B82F6' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  }
}
