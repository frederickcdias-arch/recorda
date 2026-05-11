import { PDFDocument, PageSizes, rgb } from 'pdf-lib';

const PORTRAIT_A4_WIDTH = PageSizes.A4[0];
const PORTRAIT_A4_HEIGHT = PageSizes.A4[1];
const LABELS_PER_PAGE = 4;
const LABELS_PER_ROW = 2;
const CM_TO_POINTS = 28.3464566929;
const MM_TO_POINTS = 2.8346456693;
const BORDER_WIDTH = 0.5;
const DASH_ON = 4;
const DASH_OFF = 3;

// Área de recorte da etiqueta: 9,5 × 15 cm
// Grade 2×2 em A4 com 1 mm de espaço entre as etiquetas
const LABEL_WIDTH = 9.5 * CM_TO_POINTS; // 269,29 pt
const LABEL_HEIGHT = 15.0 * CM_TO_POINTS; // 425,20 pt
const LABEL_GAP = 1 * MM_TO_POINTS; // 2,83 pt

export class EtiquetaPdfService {
  async compactarTresPorFolha(inputs: Uint8Array[]): Promise<Buffer> {
    const output = await PDFDocument.create();
    const sourcePages: Array<{ source: PDFDocument; index: number }> = [];

    for (const input of inputs) {
      const source = await PDFDocument.load(input);
      const pageIndices = source.getPageIndices();

      if (pageIndices.length === 0) {
        throw new Error('Um dos PDFs enviados nao possui paginas para processar.');
      }

      pageIndices.forEach((index) => {
        sourcePages.push({ source, index });
      });
    }

    // Centraliza a grade na folha (inclui 1 gap interno na grade 2×2)
    const groupLeft = (PORTRAIT_A4_WIDTH - LABEL_WIDTH * LABELS_PER_ROW - LABEL_GAP) / 2;
    const groupBottom = (PORTRAIT_A4_HEIGHT - LABEL_HEIGHT * LABELS_PER_ROW - LABEL_GAP) / 2;

    for (let position = 0; position < sourcePages.length; position += 1) {
      const pageRef = sourcePages[position]!;

      if (position % LABELS_PER_PAGE === 0) {
        output.addPage([PORTRAIT_A4_WIDTH, PORTRAIT_A4_HEIGHT]);
      }

      const targetPage = output.getPage(output.getPageCount() - 1);
      const slotIndex = position % LABELS_PER_PAGE;
      const columnIndex = slotIndex % LABELS_PER_ROW;
      const rowIndex = Math.floor(slotIndex / LABELS_PER_ROW);

      const sourcePage = pageRef.source.getPage(pageRef.index);
      const sourceWidth = sourcePage.getWidth();
      const sourceHeight = sourcePage.getHeight();

      // Recorta a área central de LABEL_WIDTH × LABEL_HEIGHT da página fonte.
      // Se a fonte for menor que o slot, incorpora a página inteira e redimensiona.
      let embeddedPage;
      if (sourceWidth <= LABEL_WIDTH && sourceHeight <= LABEL_HEIGHT) {
        embeddedPage = await output.embedPage(sourcePage);
      } else {
        const cropLeft = Math.max(0, (sourceWidth - LABEL_WIDTH) / 2);
        const cropBottom = Math.max(0, (sourceHeight - LABEL_HEIGHT) / 2);
        embeddedPage = await output.embedPage(sourcePage, {
          left: cropLeft,
          right: Math.min(sourceWidth, cropLeft + LABEL_WIDTH),
          bottom: cropBottom,
          top: Math.min(sourceHeight, cropBottom + LABEL_HEIGHT),
        });
      }

      const x = groupLeft + columnIndex * (LABEL_WIDTH + LABEL_GAP);
      const y = groupBottom + (LABELS_PER_ROW - 1 - rowIndex) * (LABEL_HEIGHT + LABEL_GAP);

      targetPage.drawPage(embeddedPage, {
        x,
        y,
        width: LABEL_WIDTH,
        height: LABEL_HEIGHT,
      });

      // Borda de corte pontilhada (drawRectangle não suporta dashArray — desenha 4 linhas)
      const dashOpts = {
        thickness: BORDER_WIDTH,
        color: rgb(0, 0, 0),
        dashArray: [DASH_ON, DASH_OFF],
      };
      targetPage.drawLine({ start: { x, y }, end: { x: x + LABEL_WIDTH, y }, ...dashOpts });
      targetPage.drawLine({
        start: { x, y: y + LABEL_HEIGHT },
        end: { x: x + LABEL_WIDTH, y: y + LABEL_HEIGHT },
        ...dashOpts,
      });
      targetPage.drawLine({ start: { x, y }, end: { x, y: y + LABEL_HEIGHT }, ...dashOpts });
      targetPage.drawLine({
        start: { x: x + LABEL_WIDTH, y },
        end: { x: x + LABEL_WIDTH, y: y + LABEL_HEIGHT },
        ...dashOpts,
      });
    }

    const bytes = await output.save();
    return Buffer.from(bytes);
  }
}
