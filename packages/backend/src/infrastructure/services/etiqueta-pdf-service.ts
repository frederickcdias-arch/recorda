import { PDFDocument, PageSizes, rgb } from 'pdf-lib';

const PORTRAIT_A4_WIDTH = PageSizes.A4[0];
const PORTRAIT_A4_HEIGHT = PageSizes.A4[1];
const LABELS_PER_PAGE = 4;
const LABELS_PER_ROW = 2;
const CM_TO_POINTS = 28.3464566929;
const LABEL_GAP = 0.1 * CM_TO_POINTS; // 1 mm
const BORDER_WIDTH = 0.8;

// Recorte calibrado para preservar a moldura preta inteira sem encolher demais a etiqueta.
const GED_CROP = {
  left: 0.266,
  right: 0.734,
  bottom: 0.232,
  top: 0.768,
};

export class EtiquetaPdfService {
  async compactarTresPorFolha(inputs: Uint8Array[]): Promise<Buffer> {
    const output = await PDFDocument.create();
    const sourcePages: Array<{ source: PDFDocument; index: number }> = [];
    let cropAspectRatio: number | null = null;

    for (const input of inputs) {
      const source = await PDFDocument.load(input);
      const pageIndices = source.getPageIndices();

      if (pageIndices.length === 0) {
        throw new Error('Um dos PDFs enviados nao possui paginas para processar.');
      }

      pageIndices.forEach((index) => {
        sourcePages.push({ source, index });
      });

      if (cropAspectRatio === null && pageIndices.length > 0) {
        const firstPage = source.getPage(pageIndices[0]!);
        const pageWidth = firstPage.getWidth();
        const pageHeight = firstPage.getHeight();
        const cropLeft = pageWidth * GED_CROP.left;
        const cropRight = pageWidth * GED_CROP.right;
        const cropBottom = pageHeight * GED_CROP.bottom;
        const cropTop = pageHeight * GED_CROP.top;
        const croppedWidth = cropRight - cropLeft;
        const croppedHeight = cropTop - cropBottom;
        cropAspectRatio = croppedWidth / croppedHeight;
      }
    }

    if (!cropAspectRatio) {
      throw new Error('Nao foi possivel determinar o tamanho da etiqueta.');
    }

    const maxLabelWidth = (PORTRAIT_A4_WIDTH - LABEL_GAP) / LABELS_PER_ROW;
    const maxLabelHeight = (PORTRAIT_A4_HEIGHT - LABEL_GAP) / LABELS_PER_ROW;
    const drawWidth = Math.min(maxLabelWidth, maxLabelHeight * cropAspectRatio);
    const drawHeight = drawWidth / cropAspectRatio;
    const groupWidth = drawWidth * LABELS_PER_ROW + LABEL_GAP;
    const groupHeight = drawHeight * LABELS_PER_ROW + LABEL_GAP;
    const groupLeft = (PORTRAIT_A4_WIDTH - groupWidth) / 2;
    const groupBottom = (PORTRAIT_A4_HEIGHT - groupHeight) / 2;

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
      const pageWidth = sourcePage.getWidth();
      const pageHeight = sourcePage.getHeight();
      const cropLeft = pageWidth * GED_CROP.left;
      const cropRight = pageWidth * GED_CROP.right;
      const cropBottom = pageHeight * GED_CROP.bottom;
      const cropTop = pageHeight * GED_CROP.top;
      const embeddedPage = await output.embedPage(sourcePage, {
        left: cropLeft,
        right: cropRight,
        bottom: cropBottom,
        top: cropTop,
      });
      const x = groupLeft + columnIndex * (drawWidth + LABEL_GAP);
      const y = groupBottom + (LABELS_PER_ROW - 1 - rowIndex) * (drawHeight + LABEL_GAP);

      targetPage.drawPage(embeddedPage, {
        x,
        y,
        width: drawWidth,
        height: drawHeight,
      });

      targetPage.drawRectangle({
        x,
        y,
        width: drawWidth,
        height: drawHeight,
        borderColor: rgb(0, 0, 0),
        borderWidth: BORDER_WIDTH,
      });
    }

    const bytes = await output.save();
    return Buffer.from(bytes);
  }
}
