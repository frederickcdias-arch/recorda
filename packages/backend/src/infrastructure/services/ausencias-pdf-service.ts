import { promises as fs } from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import {
  PDFDocument as PdfLibDocument,
  PageSizes,
  rgb,
} from 'pdf-lib';
import type { RelatorioAusenciasResponse, RelatorioAusenciasRow } from '@recorda/shared';
import { getUploadsPath } from './uploads-runtime.js';

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

export interface RelatorioAusenciasPdfInput {
  relatorio: RelatorioAusenciasResponse;
  filtros: {
    dataInicio?: string;
    dataFim?: string;
    colaboradorId?: string;
    tipoAusenciaId?: string;
    status?: string;
  };
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

    const registrosOrdenados = [...relatorio.registros].sort((a, b) => {
      const byName = a.colaboradorNome.localeCompare(b.colaboradorNome, 'pt-BR', {
        sensitivity: 'base',
      });
      if (byName !== 0) return byName;

      const byInicio = a.dataInicio.localeCompare(b.dataInicio);
      if (byInicio !== 0) return byInicio;

      const byFim = a.dataFim.localeCompare(b.dataFim);
      if (byFim !== 0) return byFim;

      return a.criadoEm.localeCompare(b.criadoEm);
    });

    const columns = [
      { label: 'Início', width: 60 },
      { label: 'Fim', width: 60 },
      { label: 'Tipo', width: 128 },
      { label: 'Observação', width: 267 },
    ];
    const rowHeight = 20;
    const headerHeight = 18;
    const groupHeight = 18;
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

    const drawGroupHeader = (colaboradorNome: string, y: number): void => {
      doc.rect(MARGIN, y, CONTENT_WIDTH, groupHeight).fill('#EFF6FF');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.primary);
      doc.text(colaboradorNome, MARGIN + 6, y + 4, {
        width: CONTENT_WIDTH - 12,
        ellipsis: true,
      });
      doc
        .moveTo(MARGIN, y + groupHeight)
        .lineWidth(0.5)
        .strokeColor('#BFDBFE')
        .lineTo(MARGIN + CONTENT_WIDTH, y + groupHeight)
        .stroke();
      doc.fillColor('#111827');
    };

    const drawRow = (row: RelatorioAusenciasRow, y: number): void => {
      const observacao = row.observacoes?.trim() || row.justificativa?.trim() || '-';
      const values = [
        this.formatDateBR(row.dataInicio),
        this.formatDateBR(row.dataFim),
        row.tipoAusenciaNome,
        observacao,
      ];

      let x = MARGIN;
      doc.font('Helvetica').fontSize(8.5).fillColor('#111827');
      values.forEach((value, index) => {
        const width = columns[index]!.width;
        const align = index <= 1 ? 'center' : 'left';
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

    if (registrosOrdenados.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.grayText);
      doc.text('Nenhum registro encontrado para os filtros informados.', MARGIN, y + 8, {
        width: CONTENT_WIDTH,
        align: 'center',
      });
      doc.moveDown(1);
      return;
    }

    let colaboradorAtual = '';
    for (const row of registrosOrdenados) {
      const mudouColaborador = row.colaboradorNome !== colaboradorAtual;

      if (mudouColaborador) {
        if (y + groupHeight > PAGE_HEIGHT - MARGIN - FOOTER_SPACE) {
          doc.addPage();
          this.renderSectionHeader(doc, 'REGISTROS (continuação)', COLORS.primary);
          drawHeader(doc.y);
          y = doc.y + headerHeight + 4;
        }
        drawGroupHeader(row.colaboradorNome, y);
        y += groupHeight;
        colaboradorAtual = row.colaboradorNome;
      }

      if (y + rowHeight > PAGE_HEIGHT - MARGIN - FOOTER_SPACE) {
        doc.addPage();
        this.renderSectionHeader(doc, 'REGISTROS (continuação)', COLORS.primary);
        drawHeader(doc.y);
        y = doc.y + headerHeight + 4;
        drawGroupHeader(row.colaboradorNome, y);
        y += groupHeight;
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
      const uploadsDir = getUploadsPath('logos');
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





