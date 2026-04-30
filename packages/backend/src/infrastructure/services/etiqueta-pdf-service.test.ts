import { describe, expect, it } from 'vitest';
import { PDFDocument, PageSizes } from 'pdf-lib';
import { EtiquetaPdfService } from './etiqueta-pdf-service.js';

async function createSourcePdf(pageCount: number, width: number, height: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([width, height]);
    page.drawRectangle({ x: 0, y: 0, width: 1, height: 1 });
  }

  return Buffer.from(await pdf.save());
}

describe('EtiquetaPdfService', () => {
  it('agrupa 4 etiquetas GED em 1 pagina A4 retrato', async () => {
    const service = new EtiquetaPdfService();
    const sourceA = await createSourcePdf(2, PageSizes.A4[0], PageSizes.A4[1]);
    const sourceB = await createSourcePdf(2, PageSizes.A4[0], PageSizes.A4[1]);

    const output = await service.compactarTresPorFolha([sourceA, sourceB]);
    const result = await PDFDocument.load(output);

    expect(result.getPageCount()).toBe(1);
    expect(result.getPage(0).getWidth()).toBeCloseTo(PageSizes.A4[0], 5);
    expect(result.getPage(0).getHeight()).toBeCloseTo(PageSizes.A4[1], 5);
  });

  it('tambem processa etiqueta fonte muito grande, normalizando para o tamanho final', async () => {
    const service = new EtiquetaPdfService();
    const source = await createSourcePdf(1, 1200, 842);

    const output = await service.compactarTresPorFolha([source]);
    const result = await PDFDocument.load(output);

    expect(result.getPageCount()).toBe(1);
  });
});
