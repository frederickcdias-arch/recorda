import { promises as fs } from 'fs';
import path from 'path';
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

export interface EmpresaConfig {
  nome?: string;
  endereco?: string;
  telefone?: string;
  email?: string;
  logoUrl?: string;
  logoData?: Buffer | null;
  exibirLogoRelatorio?: boolean;
  exibirEnderecoRelatorio?: boolean;
  exibirContatoRelatorio?: boolean;
  logoLarguraRelatorio?: number;
  logoAlinhamentoRelatorio?: 'ESQUERDA' | 'CENTRO' | 'DIREITA' | string;
  logoDeslocamentoYRelatorio?: number;
}

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
  anexosIgnorados?: Array<{ filename: string; motivo: string }>;
}

const COLORS = {
  primary: '#1e40af',
  secondary: '#1d4ed8',
  accent: '#2563eb',
  grayText: '#4B5563',
  headerBg: '#DBEAFE',
  zebraBg: '#F8FAFC',
  divider: '#E2E8F0',
};

export class AusenciasPdfService {
  async exportar(input: RelatorioAusenciasPdfInput, empresa?: EmpresaConfig | null): Promise<Buffer> {
    const logoBuffer = await this.loadLogoBuffer(empresa);
    const mainPdf = await this.renderMainPdf(input, empresa, logoBuffer);

    const finalDoc = await PdfLibDocument.load(mainPdf);
    const regularFont = await finalDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await finalDoc.embedFont(StandardFonts.HelveticaBold);

    if (input.anexos.length > 0) {
      const introPage = finalDoc.addPage(A4);
      this.drawAttachmentIntroPage(
        introPage,
        regularFont,
        boldFont,
        input.anexos.length,
        input.anexosIgnorados ?? []
      );

      for (const anexo of input.anexos) {
        if (anexo.mimeType === 'application/pdf') {
          const source = await PdfLibDocument.load(anexo.buffer);
          const copied = await finalDoc.copyPages(source, source.getPageIndices());
          for (const page of copied) {
            finalDoc.addPage(page);
          }
          continue;
        }

        const attachmentPage = finalDoc.addPage(A4);
        const image =
          anexo.mimeType === 'image/png'
            ? await finalDoc.embedPng(anexo.buffer)
            : await finalDoc.embedJpg(anexo.buffer);
        this.drawAttachmentPage(attachmentPage, regularFont, boldFont, anexo, image);
      }
    }

    await this.stampFooter(finalDoc, empresa);
    return Buffer.from(await finalDoc.save());
  }

  private async renderMainPdf(
    input: RelatorioAusenciasPdfInput,
    empresa?: EmpresaConfig | null,
    logoBuffer?: Buffer | null
  ): Promise<Buffer> {
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
        this.drawHeader(doc, input, empresa, logoBuffer);
        this.renderResumoGeral(doc, input.relatorio);
        this.renderFiltros(doc, input);
        this.renderRegistros(doc, input.relatorio);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private drawHeader(
    doc: PDFKit.PDFDocument,
    input: RelatorioAusenciasPdfInput,
    empresa?: EmpresaConfig | null,
    logoBuffer?: Buffer | null
  ): void {
    const w = CONTENT_WIDTH;

    if (logoBuffer) {
      const logoSpaceWidth = 4 * 28.35;
      const logoSpaceHeight = 10 * 28.35;
      const imageWidth = Math.min(
        logoSpaceWidth - 10,
        this.normalizeLogoWidth(empresa?.logoLarguraRelatorio)
      );
      const imageY = doc.y + this.normalizeLogoOffsetY(empresa?.logoDeslocamentoYRelatorio);
      const imageX = this.resolveLogoX(empresa?.logoAlinhamentoRelatorio, MARGIN, w, imageWidth);
      let imgHeight = Math.min(logoSpaceHeight - 20, 60);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const img = (doc as any).openImage(logoBuffer);
        if (img && img.width && img.height) {
          imgHeight = (imageWidth / img.width) * img.height;
          imgHeight = Math.min(imgHeight, logoSpaceHeight - 20);
        }
      } catch {
        // fallback
      }
      doc.image(logoBuffer, imageX, imageY, { width: imageWidth });
      doc.y = imageY + Math.max(imgHeight, 60) + 8;
    }

    if (empresa?.nome) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.grayText);
      doc.text(empresa.nome, MARGIN, doc.y, { width: w, align: 'center' });
      doc.moveDown(0.15);
    }

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827');
    doc.text('RELATÓRIO DE AUSÊNCIAS', MARGIN, doc.y, { width: w, align: 'center' });
    doc.moveDown(0.5);

    const boxW = 260;
    const boxH = 42;
    const boxX = MARGIN + (w - boxW) / 2;
    const boxY = doc.y;

    doc.roundedRect(boxX, boxY, boxW, boxH, 8).fill(COLORS.headerBg);
    doc.fillColor('#1e3a5f').fontSize(9);

    const periodoInicio = input.filtros.dataInicio ? this.formatDateBR(input.filtros.dataInicio) : '';
    const periodoFim = input.filtros.dataFim ? this.formatDateBR(input.filtros.dataFim) : '';
    const periodoTexto = [periodoInicio, periodoFim].filter(Boolean).join(' até ') || 'Todos os períodos';
    const dataGeracao = new Date().toLocaleString('pt-BR');

    doc.font('Helvetica-Bold').text('Período:', boxX + 14, boxY + 9);
    doc.font('Helvetica').text(periodoTexto, boxX + 68, boxY + 9);
    doc.font('Helvetica-Bold').text('Emitido em:', boxX + 14, boxY + 23);
    doc.font('Helvetica').text(dataGeracao, boxX + 82, boxY + 23);

    doc.y = boxY + boxH + 6;
    doc.moveTo(MARGIN, doc.y).lineWidth(1.5).strokeColor(COLORS.primary).lineTo(MARGIN + w, doc.y).stroke();
    doc.y += 10;
    doc.fillColor('#000000');
  }

  private renderResumoGeral(doc: PDFKit.PDFDocument, relatorio: RelatorioAusenciasResponse): void {
    this.renderSectionHeader(doc, 'RESUMO GERAL', COLORS.primary);
    this.renderKeyValueTable(doc, [
      ['Total de registros', String(relatorio.totais.totalRegistros)],
      ['Aprovados', String(relatorio.totais.totalPorStatus['aprovado'] ?? 0)],
      ['Pendentes', String(relatorio.totais.totalPorStatus['pendente'] ?? 0)],
      ['Rejeitados', String(relatorio.totais.totalPorStatus['rejeitado'] ?? 0)],
      ['Cancelados', String(relatorio.totais.totalPorStatus['cancelado'] ?? 0)],
      ['Dias aprovados', String(relatorio.totais.diasAprovados)],
      ['Horas aprovadas', String(relatorio.totais.horasAprovadas)],
    ]);

    if (relatorio.totais.totalPorTipo.length > 0) {
      this.renderSectionHeader(doc, 'TOTAL POR TIPO', COLORS.secondary);
      this.renderTypeTable(doc, relatorio);
    }
  }

  private renderFiltros(doc: PDFKit.PDFDocument, input: RelatorioAusenciasPdfInput): void {
    this.renderSectionHeader(doc, 'FILTROS APLICADOS', COLORS.accent);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.grayText);
    doc.text(this.buildFiltrosText(input), { width: CONTENT_WIDTH });
    doc.moveDown(0.5);
  }

  private renderRegistros(doc: PDFKit.PDFDocument, relatorio: RelatorioAusenciasResponse): void {
    this.renderSectionHeader(doc, 'REGISTROS', COLORS.primary);

    const columns = [
      { label: 'Data', width: 78 },
      { label: 'Colaborador', width: 150 },
      { label: 'Tipo', width: 128 },
      { label: 'Status', width: 60 },
      { label: 'Anexo', width: 44 },
    ];
    const rowHeight = 22;
    const headerHeight = 20;
    const topY = doc.y;

    const drawHeader = (y: number): void => {
      let x = MARGIN;
      doc.save();
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, headerHeight, 6).fill(COLORS.headerBg);
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1F2937');
      for (const column of columns) {
        doc.text(column.label, x + 6, y + 6, { width: column.width - 12 });
        x += column.width;
      }
    };

    const drawRow = (row: RelatorioAusenciasRow, y: number): void => {
      const values = [
        this.formatRange(row.dataInicio, row.dataFim),
        row.colaboradorNome,
        row.tipoAusenciaNome,
        this.statusLabel(row.status),
        row.documentoAnexo ? 'Sim' : 'Não',
      ];

      const bg = relatorio.registros.indexOf(row) % 2 === 0 ? '#FFFFFF' : COLORS.zebraBg;
      doc.save();
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, rowHeight, 6).fillAndStroke(bg, COLORS.divider);
      doc.restore();

      let x = MARGIN;
      doc.font('Helvetica').fontSize(8.5).fillColor('#111827');
      values.forEach((value, index) => {
        const width = columns[index]!.width;
        const align = index >= 3 ? 'center' : 'left';
        doc.text(value, x + 6, y + 5, { width: width - 12, height: rowHeight - 8, align, ellipsis: true });
        x += width;
      });
    };

    drawHeader(topY);
    let y = topY + headerHeight + 2;

    if (relatorio.registros.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.grayText);
      doc.text('Nenhum registro encontrado para os filtros informados.', MARGIN, y + 8, {
        width: CONTENT_WIDTH,
        align: 'center',
      });
      doc.moveDown(1);
      return;
    }

    for (const row of relatorio.registros) {
      if (y + rowHeight > PAGE_HEIGHT - MARGIN - FOOTER_SPACE) {
        doc.addPage();
        this.renderSectionHeader(doc, 'REGISTROS (continuação)', COLORS.primary);
        drawHeader(doc.y);
        y = doc.y + headerHeight + 2;
      }
      drawRow(row, y);
      y += rowHeight + 2;
    }

    doc.y = y + 2;
  }

  private renderSectionHeader(doc: PDFKit.PDFDocument, title: string, color: string): void {
    const y = doc.y;
    doc.save();
    doc.rect(MARGIN, y, CONTENT_WIDTH, 22).fill(color);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF');
    doc.text(title, MARGIN + 12, y + 6, { width: CONTENT_WIDTH - 24 });
    doc.y = y + 26;
  }

  private renderKeyValueTable(doc: PDFKit.PDFDocument, rows: Array<[string, string]>): void {
    const rowHeight = 18;
    const labelWidth = Math.floor(CONTENT_WIDTH * 0.65);
    const valueWidth = CONTENT_WIDTH - labelWidth;

    rows.forEach(([label, value], index) => {
      const y = doc.y + (index > 0 ? 2 : 0);
      const bg = index % 2 === 0 ? COLORS.zebraBg : '#FFFFFF';
      doc.save();
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, rowHeight, 4).fillAndStroke(bg, COLORS.divider);
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1F2937');
      doc.text(label, MARGIN + 10, y + 5, { width: labelWidth - 16 });
      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      doc.text(value, MARGIN + labelWidth, y + 5, { width: valueWidth - 12, align: 'right' });
      doc.y = y + rowHeight;
    });

    doc.moveDown(0.5);
  }

  private renderTypeTable(doc: PDFKit.PDFDocument, relatorio: RelatorioAusenciasResponse): void {
    const items = relatorio.totais.totalPorTipo.slice().sort((a, b) => b.quantidade - a.quantidade);
    const headerY = doc.y;

    doc.save();
    doc.rect(MARGIN, headerY, CONTENT_WIDTH, 22).fill(COLORS.headerBg);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1E3A8A');
    doc.text('Tipo', MARGIN + 10, headerY + 6, { width: CONTENT_WIDTH - 120 });
    doc.text('Qtd.', MARGIN + CONTENT_WIDTH - 70, headerY + 6, { width: 60, align: 'right' });
    doc.y = headerY + 24;

    items.forEach((item, index) => {
      const y = doc.y + (index > 0 ? 2 : 0);
      const bg = index % 2 === 0 ? '#FFFFFF' : COLORS.zebraBg;
      doc.save();
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 18, 4).fillAndStroke(bg, COLORS.divider);
      doc.restore();
      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      doc.text(item.nome, MARGIN + 10, y + 5, { width: CONTENT_WIDTH - 120 });
      doc.text(String(item.quantidade), MARGIN + CONTENT_WIDTH - 70, y + 5, { width: 60, align: 'right' });
      doc.y = y + 18;
    });

    doc.moveDown(0.5);
  }

  private drawAttachmentIntroPage(
    page: PDFPage,
    regularFont: PDFFont,
    boldFont: PDFFont,
    total: number,
    anexosIgnorados: Array<{ filename: string; motivo: string }>
  ): void {
    page.drawText('ANEXOS DAS AUSÊNCIAS', {
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

    if (anexosIgnorados.length > 0) {
      page.drawText('Alguns anexos não foram incluídos porque não estavam disponíveis no servidor.', {
        x: MARGIN,
        y: page.getHeight() - 138,
        size: 9,
        font: regularFont,
        color: rgb(0.55, 0.09, 0.09),
      });

      const lista = anexosIgnorados
        .slice(0, 5)
        .map((item) => `- ${item.filename}: ${item.motivo}`)
        .join('\n');
      page.drawText(lista, {
        x: MARGIN,
        y: page.getHeight() - 154,
        size: 8,
        font: regularFont,
        color: rgb(0.43, 0.09, 0.09),
      });
    }
  }

  private drawAttachmentPage(
    page: PDFPage,
    regularFont: PDFFont,
    boldFont: PDFFont,
    anexo: AusenciaAnexo,
    image: PDFImage
  ): void {
    this.drawAttachmentTitle(page, regularFont, boldFont, anexo);

    const maxWidth = page.getWidth() - MARGIN * 2;
    const maxHeight = page.getHeight() - 170 - MARGIN;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const x = MARGIN + (maxWidth - drawWidth) / 2;
    const y = MARGIN + (maxHeight - drawHeight) / 2;

    page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
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

  private async stampFooter(doc: PdfLibDocument, empresa?: EmpresaConfig | null): Promise<void> {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const footerParts: string[] = [];

    const nome = empresa?.nome || 'Recorda';
    footerParts.push(nome);

    if (empresa?.exibirEnderecoRelatorio && empresa.endereco) {
      footerParts.push(empresa.endereco);
    }
    if (empresa?.exibirContatoRelatorio) {
      const contato: string[] = [];
      if (empresa.telefone) contato.push(empresa.telefone);
      if (empresa.email) contato.push(empresa.email);
      if (contato.length > 0) footerParts.push(contato.join(' | '));
    }

    const footerText = footerParts.join('  •  ');
    const footerColor = rgb(0.61, 0.64, 0.68);

    pages.forEach((page, index) => {
      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();
      const pageNumber = `Página ${index + 1} de ${pages.length}`;

      page.drawLine({
        start: { x: MARGIN, y: pageHeight - MARGIN - 8 },
        end: { x: pageWidth - MARGIN, y: pageHeight - MARGIN - 8 },
        thickness: 0.5,
        color: rgb(0.82, 0.83, 0.85),
      });
      page.drawText(footerText, {
        x: MARGIN,
        y: pageHeight - MARGIN - 24,
        size: 7,
        font,
        color: footerColor,
        maxWidth: pageWidth - MARGIN * 2,
      });
      page.drawText(pageNumber, {
        x: pageWidth - MARGIN - 90,
        y: pageHeight - MARGIN - 24,
        size: 7,
        font,
        color: footerColor,
        maxWidth: 90,
      });
    });
  }

  private normalizeLogoWidth(value?: number): number {
    return Math.min(Math.max(Number(value ?? 120), 60), 260);
  }

  private normalizeLogoOffsetY(value?: number): number {
    return Math.min(Math.max(Number(value ?? 0), -20), 40);
  }

  private resolveLogoX(
    alinhamento: string | undefined,
    left: number,
    totalWidth: number,
    imageWidth: number
  ): number {
    if (alinhamento === 'ESQUERDA') return left;
    if (alinhamento === 'DIREITA') return left + totalWidth - imageWidth;
    return left + (totalWidth - imageWidth) / 2;
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

  private formatRange(inicio: string, fim: string): string {
    return `${this.formatDateBR(inicio)} a ${this.formatDateBR(fim)}`;
  }

  private formatDateBR(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return date.toLocaleDateString('pt-BR');
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

  private async loadLogoBuffer(empresa?: EmpresaConfig | null): Promise<Buffer | null> {
    if (empresa?.exibirLogoRelatorio === false) {
      return null;
    }

    if (empresa?.logoData) {
      return empresa.logoData;
    }

    if (!empresa?.logoUrl) {
      return null;
    }

    try {
      const uploadsDir = path.resolve('uploads', 'logos');
      try {
        const files = await fs.readdir(uploadsDir);
        const logoFile = files.find((f) => f.startsWith('logo_empresa'));
        if (logoFile) {
          return await fs.readFile(path.join(uploadsDir, logoFile));
        }
      } catch {
        // ignore and fallback
      }

      if (empresa.logoUrl.startsWith('http')) {
        const response = await fetch(empresa.logoUrl);
        if (!response.ok) return null;
        return Buffer.from(await response.arrayBuffer());
      }

      if (empresa.logoUrl.startsWith('/')) {
        const baseUrl = process.env.SERVER_URL?.replace(/\/+$/, '') || 'http://localhost:80';
        try {
          const response = await fetch(`${baseUrl}${empresa.logoUrl}`);
          if (response.ok) {
            return Buffer.from(await response.arrayBuffer());
          }
        } catch {
          // ignore
        }
      }
    } catch {
      return null;
    }

    return null;
  }
}
