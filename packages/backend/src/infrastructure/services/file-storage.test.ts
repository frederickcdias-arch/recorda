import { describe, expect, it } from 'vitest';
import { saveAusenciaAnexo, serveAusenciaAnexo } from './file-storage.js';

describe('file-storage anexo de ausências', () => {
  it('persiste anexo como data URL e resolve sem filesystem', async () => {
    const buffer = Buffer.from('hello world');

    const stored = await saveAusenciaAnexo({
      filename: 'comprovante.pdf',
      mimetype: 'application/pdf',
      buffer,
    });

    expect(stored.startsWith('data:application/pdf;name=comprovante.pdf;base64,')).toBe(true);

    const served = await serveAusenciaAnexo(stored);
    expect(served.mimeType).toBe('application/pdf');
    expect(served.filename).toBe('comprovante.pdf');
    expect(served.buffer.equals(buffer)).toBe(true);
  });
});
