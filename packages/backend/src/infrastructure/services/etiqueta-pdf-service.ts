import { PDFDocument, PageSizes, rgb } from 'pdf-lib';

const PORTRAIT_A4_WIDTH = PageSizes.A4[0];
const PORTRAIT_A4_HEIGHT = PageSizes.A4[1];
const LABELS_PER_PAGE = 4;
const LABELS_PER_ROW = 2;
const CM_TO_POINTS = 28.3464566929;
const BORDER_WIDTH = 0.8;

// Área de recorte da etiqueta: 9,5 × 15 cm
// Grade 2×2 em A4: margem lateral ≈ 1 cm; sangria vertical ≈ ±1,5 mm (bordas justas)
const LABEL_WIDTH = 9.5 * CM_TO_POINTS; // 269,29 pt
const LABEL_HEIGHT = 15.0 * CM_TO_POINTS; // 425,20 pt

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

    // Centraliza a grade na folha; a altura total (30 cm) excede A4 (29,7 cm) em ~1,5 mm por borda
    const groupLeft = (PORTRAIT_A4_WIDTH - LABEL_WIDTH * LABELS_PER_ROW) / 2;
    const groupBottom = (PORTRAIT_A4_HEIGHT - LABEL_HEIGHT * LABELS_PER_ROW) / 2;

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

      const x = groupLeft + columnIndex * LABEL_WIDTH;
      const y = groupBottom + (LABELS_PER_ROW - 1 - rowIndex) * LABEL_HEIGHT;

      targetPage.drawPage(embeddedPage, {
        x,
        y,
        width: LABEL_WIDTH,
        height: LABEL_HEIGHT,
      });

      targetPage.drawRectangle({
        x,
        y,
        width: LABEL_WIDTH,
        height: LABEL_HEIGHT,
        borderColor: rgb(0, 0, 0),
        borderWidth: BORDER_WIDTH,
      });
    }

    const bytes = await output.save();
    return Buffer.from(bytes);
  }
}
