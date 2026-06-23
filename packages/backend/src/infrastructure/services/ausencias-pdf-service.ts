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
  grayText: '#4B5563',
  divider: '#E2E8F0',
};

export class AusenciasPdfService {
  async exportar(input: RelatorioAusenciasPdfInput, empresa?: EmpresaConfig | null): Promise<Buffer> {
    const logoBuffer = await this.loadLogoBuffer(empresa);
    const mainPdf = await this.renderMainPdf(input, empresa, logoBuffer);

    const finalDoc = await PdfLibDocument.load(mainPdf);
    const regularFont = await finalDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await finalDoc.embedFont(StandardFonts.HelveticaBold);

    if (input.anexos.length > 0 || (input.anexosIgnorados?.length ?? 0) > 0) {
      const appendixPage = finalDoc.addPage(A4);
      this.renderAttachmentIndex(
        appendixPage,
        regularFont,
        boldFont,
        input.anexos,
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

    await this.stampFooter(finalDoc);
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
      const logoSpaceHeight = 9 * 28.35;
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
      doc.y = imageY + Math.max(imgHeight, 48) + 2;
    }

    if (empresa?.nome) {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.grayText);
      doc.text(empresa.nome, MARGIN, doc.y, { width: w, align: 'center' });
      doc.moveDown(0.05);
    }

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827');
    doc.text('RELATÓRIO DE AUSÊNCIAS', MARGIN, doc.y, { width: w, align: 'center' });
    doc.moveDown(0.25);

    const periodoInicio = input.filtros.dataInicio ? this.formatDateBR(input.filtros.dataInicio) : '';
    const periodoFim = input.filtros.dataFim ? this.formatDateBR(input.filtros.dataFim) : '';
    const periodoTexto = [periodoInicio, periodoFim].filter(Boolean).join(' até ') || 'Todos os períodos';
    const dataGeracao = new Date().toLocaleString('pt-BR');

    const metaY = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151');
    doc.text('Período', MARGIN, metaY, { width: 72 });
    doc.font('Helvetica').fillColor('#111827');
    doc.text(periodoTexto, MARGIN + 72, metaY, { width: w - 72 - 120 });
    doc.font('Helvetica-Bold').fillColor('#374151');
    doc.text('Emitido em', MARGIN + w - 120, metaY, { width: 60, align: 'right' });
    doc.font('Helvetica').fillColor('#111827');
    doc.text(dataGeracao, MARGIN + w - 58, metaY, { width: 58, align: 'right' });

    doc.y = metaY + 16;
    doc.moveTo(MARGIN, doc.y).lineWidth(1.25).strokeColor(COLORS.primary).lineTo(MARGIN + w, doc.y).stroke();
    doc.y += 6;
    doc.fillColor('#000000');
  }

  private renderRegistros(doc: PDFKit.PDFDocument, relatorio: RelatorioAusenciasResponse): void {
    this.renderSectionHeader(doc, 'REGISTROS', COLORS.primary);

    const columns = [
      { label: 'Início', width: 72 },
      { label: 'Fim', width: 72 },
      { label: 'Colaborador', width: 142 },
      { label: 'Tipo', width: 150 },
      { label: 'Anexo', width: 68 },
    ];
    const rowHeight = 20;
    const headerHeight = 18;
    const topY = doc.y;

    const drawHeader = (y: number): void => {
      let x = MARGIN;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151');
      for (const column of columns) {
        doc.text(column.label, x, y + 3, { width: column.width - 4 });
        x += column.width;
      }
      doc
        .moveTo(MARGIN, y + headerHeight)
        .lineWidth(0.75)
        .strokeColor(COLORS.divider)
        .lineTo(MARGIN + CONTENT_WIDTH, y + headerHeight)
        .stroke();
    };

    const drawRow = (row: RelatorioAusenciasRow, y: number): void => {
      const values = [
        this.formatDateBR(row.dataInicio),
        this.formatDateBR(row.dataFim),
        row.colaboradorNome,
        row.tipoAusenciaNome,
        row.documentoAnexo ? 'Com anexo' : 'Sem anexo',
      ];

      let x = MARGIN;
      doc.font('Helvetica').fontSize(8.5).fillColor('#111827');
      values.forEach((value, index) => {
        const width = columns[index]!.width;
        const align = index <= 1 || index === 4 ? 'center' : 'left';
        doc.text(value, x, y + 4, { width: width - 4, height: rowHeight - 6, align, ellipsis: true });
        x += width;
      });
      doc
        .moveTo(MARGIN, y + rowHeight)
        .lineWidth(0.5)
        .strokeColor(COLORS.divider)
        .lineTo(MARGIN + CONTENT_WIDTH, y + rowHeight)
        .stroke();
    };

    drawHeader(topY);
    let y = topY + headerHeight + 4;

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
        y = doc.y + headerHeight + 4;
      }
      drawRow(row, y);
      y += rowHeight;
    }

    doc.y = y + 2;
  }

  private renderSectionHeader(doc: PDFKit.PDFDocument, title: string, color: string): void {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(color);
    doc.text(title, MARGIN, y, { width: CONTENT_WIDTH });
    doc
      .moveTo(MARGIN, y + 12)
      .lineWidth(1)
      .strokeColor(COLORS.divider)
      .lineTo(MARGIN + CONTENT_WIDTH, y + 12)
      .stroke();
    doc.y = y + 16;
  }

  private renderAttachmentIndex(
    page: PDFPage,
    regularFont: PDFFont,
    boldFont: PDFFont,
    anexos: AusenciaAnexo[],
    anexosIgnorados: Array<{ filename: string; motivo: string }>
  ): void {
    page.drawText('ANEXOS DO PERÍODO', {
      x: MARGIN,
      y: page.getHeight() - 68,
      size: 14,
      font: boldFont,
      color: rgb(0.07, 0.09, 0.16),
    });
    page.drawText(`Arquivos incluídos: ${anexos.length}`, {
      x: MARGIN,
      y: page.getHeight() - 90,
      size: 10,
      font: regularFont,
      color: rgb(0.3, 0.32, 0.37),
    });
    page.drawText('Os anexos seguem nas páginas seguintes.', {
      x: MARGIN,
      y: page.getHeight() - 106,
      size: 9,
      font: regularFont,
      color: rgb(0.3, 0.32, 0.37),
    });

    const cursorY = page.getHeight() - 136;
    if (anexos.length === 0) {
      page.drawText('Nenhum anexo disponível para este período.', {
        x: MARGIN,
        y: cursorY - 14,
        size: 9,
        font: regularFont,
        color: rgb(0.33, 0.35, 0.39),
      });
    }

    if (anexosIgnorados.length > 0) {
      page.drawText(`Arquivos não localizados no servidor: ${anexosIgnorados.length}`, {
        x: MARGIN,
        y: cursorY - 34,
        size: 9,
        font: regularFont,
        color: rgb(0.33, 0.35, 0.39),
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
    page.drawText('ANEXO DA AUSÊNCIA', {
      x: MARGIN,
      y: page.getHeight() - 58,
      size: 13,
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
    page.drawText(`Período: ${this.formatDateBR(anexo.dataInicio)} a ${this.formatDateBR(anexo.dataFim)}`, {
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

  private async stampFooter(doc: PdfLibDocument): Promise<void> {
    const pages = doc.getPages();

    pages.forEach((page) => {
      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();

      page.drawLine({
        start: { x: MARGIN, y: pageHeight - MARGIN - 8 },
        end: { x: pageWidth - MARGIN, y: pageHeight - MARGIN - 8 },
        thickness: 0.45,
        color: rgb(0.82, 0.83, 0.85),
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

  private formatDateBR(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return date.toLocaleDateString('pt-BR');
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





