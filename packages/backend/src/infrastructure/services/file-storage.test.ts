import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveAusenciaAnexo, serveAusenciaAnexo } from './file-storage.js';

const uploadsFixtures: string[] = [];

afterEach(async () => {
  delete process.env.UPLOADS_DIR;
  await Promise.all(
    uploadsFixtures.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    })
  );
});

describe('file-storage anexo de ausencias', () => {
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

  it('resolve nome de arquivo legado dentro de uploads/ausencias', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recorda-ausencias-'));
    uploadsFixtures.push(root);
    process.env.UPLOADS_DIR = root;

    const targetDir = path.join(root, 'ausencias');
    const targetFile = path.join(targetDir, 'atestado-legado.pdf');
    const buffer = Buffer.from('pdf fixture');
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetFile, buffer);

    const served = await serveAusenciaAnexo('atestado-legado.pdf');
    expect(served.mimeType).toBe('application/pdf');
    expect(served.filename).toBe('atestado-legado.pdf');
    expect(served.buffer.equals(buffer)).toBe(true);
  });

  it('resolve URL absoluta antiga para o arquivo local sem depender de fetch', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recorda-ausencias-'));
    uploadsFixtures.push(root);
    process.env.UPLOADS_DIR = root;

    const targetDir = path.join(root, 'ausencias');
    const targetFile = path.join(targetDir, 'anexo-antigo.png');
    const buffer = Buffer.from('png fixture');
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetFile, buffer);

    const served = await serveAusenciaAnexo(
      'https://recorda.exemplo.com/uploads/ausencias/anexo-antigo.png'
    );
    expect(served.mimeType).toBe('image/png');
    expect(served.filename).toBe('anexo-antigo.png');
    expect(served.buffer.equals(buffer)).toBe(true);
  });
});
