import PDFDocument from 'pdfkit';
import type { RelatorioCompleto } from '../../application/use-cases/gerar-relatorio-completo.js';
import { promises as fs } from 'fs';
import path from 'path';

export interface EmpresaConfig {
  nome?: string;
  endereco?: string;
  telefone?: string;
  email?: string;
  logoUrl?: string;
  exibirLogoRelatorio?: boolean;
  exibirEnderecoRelatorio?: boolean;
  exibirContatoRelatorio?: boolean;
}

type TableColumn = {
  key: string;
  label: string;
  /** Proporção relativa (será calculada para preencher a largura total) */
  flex: number;
  align?: 'left' | 'right' | 'center';
};

const COLORS = {
  primary: '#1e40af',
  secondary: '#1d4ed8',
  accent: '#2563eb',
  grayText: '#4B5563',
  headerBg: '#DBEAFE',
  zebraBg: '#F8FAFC',
  divider: '#E2E8F0',
};

const MARGIN = 40;
const FOOTER_HEIGHT = 50;
const ROW_HEIGHT = 20;
const HEADER_HEIGHT = 22;

export class PDFExportService {
  async exportar(relatorio: RelatorioCompleto, empresa?: EmpresaConfig | null): Promise<Buffer> {
    const logoBuffer = await this.loadLogoBuffer(empresa);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.renderCabecalho(doc, relatorio, empresa, logoBuffer);
        this.renderResumoEtapas(doc, relatorio);
        this.renderCoordenadoriaEtapa(doc, relatorio);
        this.renderProducaoColaboradores(doc, relatorio);
        this.renderGlossario(doc, relatorio);
        this.renderRodape(doc, empresa);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private get pageContentWidth(): number {
    // A4 width = 595.28
    return 595.28 - MARGIN * 2;
  }

  private get maxY(): number {
    // A4 height = 841.89
    return 841.89 - MARGIN - FOOTER_HEIGHT;
  }

  private async loadLogoBuffer(empresa?: EmpresaConfig | null): Promise<Buffer | null> {
    if (!empresa?.logoUrl || empresa.exibirLogoRelatorio === false) {
      return null;
    }

    try {
      const uploadsDir = path.resolve('uploads', 'logos');
      const files = await fs.readdir(uploadsDir);
      const logoFile = files.find(f => f.startsWith('logo_empresa'));
      if (logoFile) {
        return await fs.readFile(path.join(uploadsDir, logoFile));
      }

      if (empresa.logoUrl.startsWith('http')) {
        const response = await fetch(empresa.logoUrl);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }

      return null;
    } catch {
      return null;
    }
  }

  private renderCabecalho(
    doc: PDFKit.PDFDocument,
    relatorio: RelatorioCompleto,
    empresa?: EmpresaConfig | null,
    logoBuffer?: Buffer | null
  ): void {
    const w = this.pageContentWidth;

    if (logoBuffer) {
      const imageWidth = 120;
      const imageX = MARGIN + (w - imageWidth) / 2;
      const imageY = doc.y;
      let imgHeight = 60;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const img = (doc as any).openImage(logoBuffer);
        if (img && img.width && img.height) {
          imgHeight = (imageWidth / img.width) * img.height;
        }
      } catch { /* fallback */ }
      doc.image(logoBuffer, imageX, imageY, { width: imageWidth });
      doc.y = imageY + imgHeight + 8;
    }

    if (empresa?.nome) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.grayText).text(empresa.nome, MARGIN, doc.y, { width: w, align: 'center' });
      doc.moveDown(0.15);
    }

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827').text(relatorio.titulo.toUpperCase(), MARGIN, doc.y, { width: w, align: 'center' });
    doc.moveDown(0.5);

    // Info box centralizado
    const boxW = 260;
    const boxH = 42;
    const boxX = MARGIN + (w - boxW) / 2;
    const boxY = doc.y;

    doc.roundedRect(boxX, boxY, boxW, boxH, 8).fill(COLORS.headerBg);
    doc.fillColor('#1e3a5f').fontSize(9);

    const dataInicio = new Date(relatorio.periodo.inicio).toLocaleDateString('pt-BR');
    const dataFim = new Date(relatorio.periodo.fim).toLocaleDateString('pt-BR');
    const dataGeracao = new Date(relatorio.dataGeracao).toLocaleString('pt-BR');

    doc.font('Helvetica-Bold').text('Período:', boxX + 14, boxY + 9);
    doc.font('Helvetica').text(`${dataInicio} a ${dataFim}`, boxX + 68, boxY + 9);
    doc.font('Helvetica-Bold').text('Emitido em:', boxX + 14, boxY + 23);
    doc.font('Helvetica').text(dataGeracao, boxX + 82, boxY + 23);

    doc.y = boxY + boxH + 6;

    // Linha separadora
    doc.moveTo(MARGIN, doc.y).lineWidth(1.5).strokeColor(COLORS.primary).lineTo(MARGIN + w, doc.y).stroke();
    doc.y += 10;
    doc.fillColor('#000000');
  }

  private renderResumoEtapas(doc: PDFKit.PDFDocument, relatorio: RelatorioCompleto): void {
    this.renderSectionHeader(doc, 'RESUMO GERAL POR ETAPA', COLORS.primary);

    const columns: TableColumn[] = [
      { key: 'etapa', label: 'ETAPA', flex: 4 },
      { key: 'total', label: 'TOTAL', flex: 2, align: 'right' },
      { key: 'unidade', label: 'UNIDADE', flex: 2 },
    ];

    const rows = relatorio.resumoPorEtapa.map((etapa) => ({
      etapa: etapa.etapaNome,
      total: etapa.totalQuantidade.toLocaleString('pt-BR'),
      unidade: etapa.unidade ?? '-',
    }));

    rows.push({
      etapa: 'TOTAL GERAL',
      total: relatorio.totais.totalGeral.toLocaleString('pt-BR'),
      unidade: 'LANÇAMENTOS',
    });

    this.renderTable(doc, columns, rows, { lastRowBold: true });
  }

  private renderCoordenadoriaEtapa(doc: PDFKit.PDFDocument, relatorio: RelatorioCompleto): void {
    this.ensureSpace(doc, 80);
    this.renderSectionHeader(doc, 'POR COORDENADORIA E ETAPA', COLORS.secondary);

    const columns: TableColumn[] = [
      { key: 'coordenadoria', label: 'COORDENADORIA', flex: 2 },
      { key: 'etapa', label: 'ETAPA', flex: 4 },
      { key: 'total', label: 'TOTAL', flex: 2, align: 'right' },
    ];

    const rows: Record<string, string>[] = [];
    for (const coordenadoria of relatorio.producaoPorCoordenadoria) {
      const label = coordenadoria.coordenadoriaSigla || coordenadoria.coordenadoriaNome;
      for (const etapa of coordenadoria.totaisPorEtapa) {
        rows.push({
          coordenadoria: label,
          etapa: etapa.etapaNome,
          total: etapa.quantidade.toLocaleString('pt-BR'),
        });
      }
    }

    rows.sort((a, b) => (a.coordenadoria ?? '').localeCompare(b.coordenadoria ?? '') || this.ordemEtapa(a.etapa ?? '') - this.ordemEtapa(b.etapa ?? ''));
    this.renderTable(doc, columns, rows);
  }

  private renderProducaoColaboradores(doc: PDFKit.PDFDocument, relatorio: RelatorioCompleto): void {
    this.ensureSpace(doc, 80);
    this.renderSectionHeader(doc, 'PRODUÇÃO POR COLABORADOR', COLORS.accent);

    const columns: TableColumn[] = [
      { key: 'colaborador', label: 'COLABORADOR', flex: 3 },
      { key: 'etapa', label: 'ETAPA', flex: 3 },
      { key: 'producao', label: 'PRODUÇÃO', flex: 2, align: 'right' },
    ];

    const colabMap = new Map<string, { colaborador: string; etapa: string; quantidade: number; unidade: string }>();
    for (const coordenadoria of relatorio.producaoPorCoordenadoria) {
      for (const colaborador of coordenadoria.colaboradores) {
        const nomeNorm = colaborador.colaboradorNome.trim().toLowerCase();
        for (const etapa of colaborador.etapas) {
          const chave = `${nomeNorm}||${etapa.etapaNome.toLowerCase()}`;
          const existing = colabMap.get(chave);
          if (existing) {
            existing.quantidade += etapa.quantidade;
          } else {
            colabMap.set(chave, {
              colaborador: colaborador.colaboradorNome,
              etapa: etapa.etapaNome,
              quantidade: etapa.quantidade,
              unidade: etapa.unidade,
            });
          }
        }
      }
    }

    const rows = Array.from(colabMap.values()).map(item => ({
      colaborador: item.colaborador,
      etapa: item.etapa,
      producao: this.formatQuantidade(item.quantidade, item.unidade),
    }));

    rows.sort((a, b) => a.colaborador.localeCompare(b.colaborador) || this.ordemEtapa(a.etapa) - this.ordemEtapa(b.etapa));
    this.renderTable(doc, columns, rows);
  }

  private renderGlossario(doc: PDFKit.PDFDocument, relatorio: RelatorioCompleto): void {
    // Estimar espaço necessário: header + itens
    const needed = 30 + relatorio.glossario.length * 18;
    this.ensureSpace(doc, Math.min(needed, 200));

    this.renderSectionHeader(doc, 'GLOSSÁRIO DAS ETAPAS', COLORS.grayText);

    for (const item of relatorio.glossario) {
      if (doc.y + 16 > this.maxY) {
        doc.addPage();
      }
      const startX = MARGIN;
      const bulletY = doc.y + 4;
      doc.circle(startX + 3, bulletY, 1.5).fill(COLORS.primary);
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8.5).text(item.termo, startX + 10, doc.y, {
        continued: true,
      });
      doc.font('Helvetica').fillColor(COLORS.grayText).text(`: ${item.definicao}`, {
        width: this.pageContentWidth - 10,
        align: 'left',
      });
      doc.moveDown(0.2);
    }

    doc.fillColor('#000000');
  }

  private renderRodape(doc: PDFKit.PDFDocument, empresa?: EmpresaConfig | null): void {
    const pages = doc.bufferedPageRange();
    const start = pages.start || 0;
    const count = pages.count;
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
    const w = 595.28 - MARGIN * 2;

    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i);
      const footerY = 841.89 - MARGIN - 10;
      // Linha separadora do rodapé
      doc.moveTo(MARGIN, footerY - 8).lineWidth(0.5).strokeColor('#D1D5DB').lineTo(MARGIN + w, footerY - 8).stroke();
      doc.fontSize(7).fillColor('#9CA3AF');
      doc.text(footerText, MARGIN, footerY, { width: w, align: 'left' });
      doc.text(`Página ${i - start + 1} de ${count}`, MARGIN, footerY, { width: w, align: 'right' });
    }
  }

  private ordemEtapa(nome: string): number {
    const n = nome.toUpperCase();
    if (n.includes('RECEBIMENTO')) return 1;
    if (n.includes('PREPARAÇ') || n.includes('PREPARAC')) return 2;
    if (n.includes('P/B')) return 3;
    if (n.includes('COLORIDA')) return 4;
    if (n.includes('CONFERÊNC') || n.includes('CONFERENC')) return 5;
    if (n.includes('MONTAGEM')) return 6;
    if (n.includes('RECONFERÊNC') || n.includes('RECONFERENC') || n.includes('CONTROLE')) return 7;
    if (n.includes('ENTREGA')) return 8;
    return 99;
  }

  private renderSectionHeader(doc: PDFKit.PDFDocument, title: string, color: string): void {
    const w = this.pageContentWidth;
    const height = 24;
    const startY = doc.y;

    doc.save();
    doc.fillColor(color).rect(MARGIN, startY, w, height).fill();
    doc.restore();

    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text(title, MARGIN + 12, startY + 7, { width: w - 24 });
    doc.y = startY + height + 2;
  }

  private resolveColumnWidths(columns: TableColumn[]): number[] {
    const totalFlex = columns.reduce((sum, col) => sum + col.flex, 0);
    const w = this.pageContentWidth;
    return columns.map(col => (col.flex / totalFlex) * w);
  }

  private renderTable(
    doc: PDFKit.PDFDocument,
    columns: TableColumn[],
    rows: Record<string, string>[],
    options?: { lastRowBold?: boolean }
  ): void {
    const widths = this.resolveColumnWidths(columns);
    const w = this.pageContentWidth;

    // Table header
    let y = doc.y;
    doc.save();
    doc.fillColor(COLORS.headerBg).rect(MARGIN, y, w, HEADER_HEIGHT).fill();
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e3a5f');
    let x = MARGIN;
    for (let c = 0; c < columns.length; c++) {
      doc.text(columns[c]!.label, x + 6, y + 7, { width: widths[c]! - 12, align: columns[c]!.align ?? 'left' });
      x += widths[c]!;
    }

    y += HEADER_HEIGHT;
    doc.moveTo(MARGIN, y).lineWidth(0.5).strokeColor(COLORS.divider).lineTo(MARGIN + w, y).stroke();

    // Rows
    for (let i = 0; i < rows.length; i++) {
      if (y + ROW_HEIGHT > this.maxY) {
        doc.addPage();
        y = MARGIN;
        // Re-render header on new page
        doc.save();
        doc.fillColor(COLORS.headerBg).rect(MARGIN, y, w, HEADER_HEIGHT).fill();
        doc.restore();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e3a5f');
        x = MARGIN;
        for (let c = 0; c < columns.length; c++) {
          doc.text(columns[c]!.label, x + 6, y + 7, { width: widths[c]! - 12, align: columns[c]!.align ?? 'left' });
          x += widths[c]!;
        }
        y += HEADER_HEIGHT;
        doc.moveTo(MARGIN, y).lineWidth(0.5).strokeColor(COLORS.divider).lineTo(MARGIN + w, y).stroke();
      }

      const row = rows[i]!;
      const isLast = i === rows.length - 1 && options?.lastRowBold;

      // Zebra striping
      if (i % 2 === 1 && !isLast) {
        doc.save();
        doc.fillColor(COLORS.zebraBg).rect(MARGIN, y, w, ROW_HEIGHT).fill();
        doc.restore();
      }

      // Bold last row (total)
      if (isLast) {
        doc.save();
        doc.fillColor(COLORS.headerBg).rect(MARGIN, y, w, ROW_HEIGHT).fill();
        doc.restore();
      }

      doc.font(isLast ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor('#111827');
      x = MARGIN;
      for (let c = 0; c < columns.length; c++) {
        const value = row[columns[c]!.key] ?? '';
        doc.text(value, x + 6, y + 6, { width: widths[c]! - 12, align: columns[c]!.align ?? 'left' });
        x += widths[c]!;
      }

      y += ROW_HEIGHT;
      doc.moveTo(MARGIN, y).lineWidth(0.3).strokeColor(COLORS.divider).lineTo(MARGIN + w, y).stroke();
    }

    doc.y = y + 8;
  }

  private ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
    if (doc.y + needed > this.maxY) {
      doc.addPage();
    }
  }

  private formatQuantidade(valor: number, unidade?: string): string {
    const quantidade = valor.toLocaleString('pt-BR');
    if (!unidade) return quantidade;
    return `${quantidade} ${unidade.toUpperCase()}`;
  }
}
