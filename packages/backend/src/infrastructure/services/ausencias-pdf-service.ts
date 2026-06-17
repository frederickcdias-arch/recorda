import PDFDocument from 'pdfkit';
import {
  PDFDocument as PdfLibDocument,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import type { RelatorioAusenciasResponse, RelatorioAusenciasRow } from '@recorda/shared';

const A4 = PageSizes.A4;
const MARGIN = 40;
const PAGE_WIDTH = A4[0];
const PAGE_HEIGHT = A4[1];
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_SPACE = 44;

type AusenciaAnexo = RelatorioAusenciasRow & {
  filename: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  buffer: Buffer;
};

export interface RelatorioAusenciasPdfInput {
  relatorio: RelatorioAusenciasResponse;
  filtros: {
    dataInicio?: string;
    dataFim?: string;
    colaboradorId?: string;
    tipoAusenciaId?: string;
    status?: string;
  };
  anexos: AusenciaAnexo[];
}

export class AusenciasPdfService {
  async exportar(input: RelatorioAusenciasPdfInput): Promise<Buffer> {
    const resumo = await this.renderResumo(input);
    const documento = await PdfLibDocument.load(resumo);

    const regularFont = await documento.embedFont(StandardFonts.Helvetica);
    const boldFont = await documento.embedFont(StandardFonts.HelveticaBold);

    if (input.anexos.length > 0) {
      const introPage = documento.addPage(A4);
      this.drawAnexoIntroPage(introPage, regularFont, boldFont, input.anexos.length);

      for (const anexo of input.anexos) {
        if (anexo.mimeType === 'application/pdf') {
          const titlePage = documento.addPage(A4);
          this.drawAttachmentTitle(titlePage, regularFont, boldFont, anexo);
          const source = await PdfLibDocument.load(anexo.buffer);
          const copied = await documento.copyPages(source, source.getPageIndices());
          for (const page of copied) {
            documento.addPage(page);
          }
          continue;
        }

        const image =
          anexo.mimeType === 'image/png'
            ? await documento.embedPng(anexo.buffer)
            : await documento.embedJpg(anexo.buffer);
        const page = documento.addPage(A4);
        this.drawImageAttachment(page, image, regularFont, boldFont, anexo);
      }
    }

    return Buffer.from(await documento.save());
  }

  private async renderResumo(input: RelatorioAusenciasPdfInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGIN,
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.drawHeader(doc, input);
        this.drawResumoCards(doc, input.relatorio);
        this.drawFiltros(doc, input);
        this.drawRegistros(doc, input);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private drawHeader(doc: PDFKit.PDFDocument, input: RelatorioAusenciasPdfInput): void {
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827');
    doc.text('RELATÓRIO DE AUSÊNCIAS', MARGIN, MARGIN, { align: 'center', width: CONTENT_WIDTH });
    doc.moveDown(0.4);

    doc.font('Helvetica').fontSize(9).fillColor('#4B5563');
    const periodoTexto = this.formatPeriodo(input.filtros);
    doc.text(`Período: ${periodoTexto}`, { align: 'center' });
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
    doc.moveDown(0.6);

    doc.moveTo(MARGIN, doc.y).lineWidth(1.4).strokeColor('#1e40af').lineTo(
      MARGIN + CONTENT_WIDTH,
      doc.y
    ).stroke();
    doc.moveDown(0.8);
  }

  private drawResumoCards(doc: PDFKit.PDFDocument, relatorio: RelatorioAusenciasResponse): void {
    const cards = [
      { label: 'Total de registros', value: relatorio.totais.totalRegistros },
      { label: 'Aprovados', value: relatorio.totais.totalPorStatus['aprovado'] ?? 0 },
      { label: 'Pendentes', value: relatorio.totais.totalPorStatus['pendente'] ?? 0 },
      { label: 'Rejeitados', value: relatorio.totais.totalPorStatus['rejeitado'] ?? 0 },
      { label: 'Cancelados', value: relatorio.totais.totalPorStatus['cancelado'] ?? 0 },
      { label: 'Dias aprovados', value: relatorio.totais.diasAprovados },
    ];

    const cardGap = 10;
    const cardWidth = (CONTENT_WIDTH - cardGap * 2) / 3;
    const cardHeight = 52;

    cards.forEach((card, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = MARGIN + col * (cardWidth + cardGap);
      const y = doc.y + row * (cardHeight + 10);

      doc.roundedRect(x, y, cardWidth, cardHeight, 10).fillAndStroke('#EFF6FF', '#BFDBFE');
      doc.fillColor('#1E3A8A').font('Helvetica').fontSize(9);
      doc.text(card.label, x + 10, y + 10, { width: cardWidth - 20 });
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(18);
      doc.text(String(card.value), x + 10, y + 24, { width: cardWidth - 20, align: 'right' });
    });

    doc.y += 2 * (cardHeight + 10) + 8;
  }

  private drawFiltros(doc: PDFKit.PDFDocument, input: RelatorioAusenciasPdfInput): void {
    const relatorio = input.relatorio;
    const filtrosTexto = this.buildFiltrosText(input);

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827');
    doc.text('Filtros aplicados', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#4B5563');
    doc.text(filtrosTexto, { width: CONTENT_WIDTH });
    doc.moveDown(0.4);

    if (relatorio.totais.totalPorTipo.length > 0) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827');
      doc.text('Totais por tipo', { width: CONTENT_WIDTH });
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      const tipos = relatorio.totais.totalPorTipo
        .slice()
        .sort((a, b) => b.quantidade - a.quantidade)
        .map((item) => `${item.nome}: ${item.quantidade}`)
        .join(' | ');
      doc.text(tipos, { width: CONTENT_WIDTH });
      doc.moveDown(0.4);
    }
  }

  private drawRegistros(doc: PDFKit.PDFDocument, input: RelatorioAusenciasPdfInput): void {
    const relatorio = input.relatorio;
    const columns = [
      { label: 'Data', width: 70 },
      { label: 'Colaborador', width: 148 },
      { label: 'Tipo', width: 118 },
      { label: 'Status', width: 60 },
      { label: 'Anexo', width: 44 },
    ];
    const rowHeight = 22;
    const tableTop = doc.y + 4;
    const headerHeight = 20;

    const drawHeader = (y: number) => {
      let x = MARGIN;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1F2937');
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, headerHeight, 6).fillAndStroke('#DBEAFE', '#BFDBFE');
      for (const column of columns) {
        doc.text(column.label, x + 6, y + 6, { width: column.width - 12 });
        x += column.width;
      }
    };

    const drawRow = (row: RelatorioAusenciasRow, y: number) => {
      const hasAttachment = Boolean(row.documentoAnexo);
      const values = [
        this.formatRange(row.dataInicio, row.dataFim),
        row.colaboradorNome,
        row.tipoAusenciaNome,
        this.statusLabel(row.status),
        hasAttachment ? 'Sim' : 'Não',
      ];

      const bg = relatorio.registros.indexOf(row) % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, rowHeight, 6).fillAndStroke(bg, '#E2E8F0');
      let x = MARGIN;
      doc.font('Helvetica').fontSize(8.5).fillColor('#111827');
      values.forEach((value, index) => {
        const width = columns[index]!.width;
        const align = index === 3 || index === 4 ? 'center' : 'left';
        doc.text(value, x + 6, y + 5, {
          width: width - 12,
          height: rowHeight - 8,
          align,
          ellipsis: true,
        });
        x += width;
      });
    };

    this.ensureTableTitle(doc, 'Registros', tableTop);
    let y = doc.y + 4;
    drawHeader(y);
    y += headerHeight + 2;

    if (relatorio.registros.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#6B7280');
      doc.text('Nenhum registro encontrado para os filtros informados.', MARGIN, y + 8, {
        width: CONTENT_WIDTH,
        align: 'center',
      });
      return;
    }

    for (const row of relatorio.registros) {
      if (y + rowHeight > PAGE_HEIGHT - MARGIN - FOOTER_SPACE) {
        doc.addPage();
        this.drawHeader(doc, input);
        this.ensureTableTitle(doc, 'Registros', doc.y);
        y = doc.y + 4;
        drawHeader(y);
        y += headerHeight + 2;
      }
      drawRow(row, y);
      y += rowHeight + 2;
    }

    doc.y = y + 2;
  }

  private ensureTableTitle(doc: PDFKit.PDFDocument, title: string, y: number): void {
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827');
    doc.text(title, MARGIN, y, { width: CONTENT_WIDTH });
  }

  private drawAnexoIntroPage(
    page: PDFPage,
    regularFont: PDFFont,
    boldFont: PDFFont,
    total: number
  ): void {
    const title = 'ANEXOS DAS AUSÊNCIAS';
    page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: rgb(1, 1, 1) });
    page.drawText(title, {
      x: MARGIN,
      y: page.getHeight() - 70,
      size: 20,
      font: boldFont,
      color: rgb(0.07, 0.09, 0.16),
    });
    page.drawText(`Quantidade de anexos: ${total}`, {
      x: MARGIN,
      y: page.getHeight() - 98,
      size: 11,
      font: regularFont,
      color: rgb(0.3, 0.32, 0.37),
    });
    page.drawText('Os arquivos anexados no período seguem nas páginas seguintes.', {
      x: MARGIN,
      y: page.getHeight() - 118,
      size: 10,
      font: regularFont,
      color: rgb(0.3, 0.32, 0.37),
    });
  }

  private drawAttachmentTitle(
    page: PDFPage,
    regularFont: PDFFont,
    boldFont: PDFFont,
    anexo: AusenciaAnexo
  ): void {
    page.drawText('Anexo da ausência', {
      x: MARGIN,
      y: page.getHeight() - 58,
      size: 18,
      font: boldFont,
      color: rgb(0.07, 0.09, 0.16),
    });
    page.drawText(`Colaborador: ${anexo.colaboradorNome}`, {
      x: MARGIN,
      y: page.getHeight() - 84,
      size: 10,
      font: regularFont,
      color: rgb(0.25, 0.28, 0.32),
    });
    page.drawText(`Tipo: ${anexo.tipoAusenciaNome}`, {
      x: MARGIN,
      y: page.getHeight() - 100,
      size: 10,
      font: regularFont,
      color: rgb(0.25, 0.28, 0.32),
    });
    page.drawText(`Período: ${this.formatRange(anexo.dataInicio, anexo.dataFim)}`, {
      x: MARGIN,
      y: page.getHeight() - 116,
      size: 10,
      font: regularFont,
      color: rgb(0.25, 0.28, 0.32),
    });
    page.drawText(`Arquivo: ${anexo.filename}`, {
      x: MARGIN,
      y: page.getHeight() - 132,
      size: 10,
      font: regularFont,
      color: rgb(0.25, 0.28, 0.32),
    });
  }

  private drawImageAttachment(
    page: PDFPage,
    image: PDFImage,
    regularFont: PDFFont,
    boldFont: PDFFont,
    anexo: AusenciaAnexo
  ): void {
    this.drawAttachmentTitle(page, regularFont, boldFont, anexo);

    const maxWidth = page.getWidth() - MARGIN * 2;
    const maxHeight = page.getHeight() - 170 - MARGIN;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const x = MARGIN + (maxWidth - drawWidth) / 2;
    const y = MARGIN + (maxHeight - drawHeight) / 2;

    page.drawImage(image, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
    });
  }

  private buildFiltrosText(input: RelatorioAusenciasPdfInput): string {
    const relatorio = input.relatorio;
    const partes: string[] = [];

    if (input.filtros.dataInicio || input.filtros.dataFim) {
      const inicio = input.filtros.dataInicio ? this.formatDateBR(input.filtros.dataInicio) : '';
      const fim = input.filtros.dataFim ? this.formatDateBR(input.filtros.dataFim) : '';
      partes.push(`Período: ${[inicio, fim].filter(Boolean).join(' até ')}`);
    } else {
      partes.push('Período: todos os registros');
    }

    const colaborador = input.filtros.colaboradorId
      ? relatorio.filtros.colaboradores.find((c) => c.id === input.filtros.colaboradorId)?.nome
      : '';
    if (colaborador) partes.push(`Colaborador: ${colaborador}`);

    const tipo = input.filtros.tipoAusenciaId
      ? relatorio.filtros.tipos.find((t) => t.id === input.filtros.tipoAusenciaId)?.nome
      : '';
    if (tipo) partes.push(`Tipo: ${tipo}`);

    if (input.filtros.status && input.filtros.status !== 'TODOS') {
      partes.push(`Status: ${this.statusLabel(String(input.filtros.status))}`);
    }

    return partes.join(' | ');
  }

  private formatPeriodo(filtros: RelatorioAusenciasPdfInput['filtros']): string {
    if (!filtros.dataInicio && !filtros.dataFim) {
      return 'Todos os períodos';
    }
    const inicio = filtros.dataInicio ? this.formatDateBR(filtros.dataInicio) : '';
    const fim = filtros.dataFim ? this.formatDateBR(filtros.dataFim) : '';
    return [inicio, fim].filter(Boolean).join(' até ');
  }

  private statusLabel(status: string): string {
    switch (status) {
      case 'pendente':
        return 'Pendente';
      case 'aprovado':
        return 'Aprovado';
      case 'rejeitado':
        return 'Rejeitado';
      case 'cancelado':
        return 'Cancelado';
      default:
        return status;
    }
  }

  private formatRange(inicio: string, fim: string): string {
    return `${this.formatDateBR(inicio)} a ${this.formatDateBR(fim)}`;
  }

  private formatDateBR(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return date.toLocaleDateString('pt-BR');
  }
}
