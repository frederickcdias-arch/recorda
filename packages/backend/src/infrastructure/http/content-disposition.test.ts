import { describe, expect, it } from 'vitest';
import { buildContentDisposition } from './content-disposition.js';

describe('buildContentDisposition', () => {
  it('preserva nome original com filename e filename*', () => {
    const header = buildContentDisposition('inline', 'Atestado Médico 01.pdf');

    expect(header).toContain('inline;');
    expect(header).toContain('filename="Atestado Medico 01.pdf"');
    expect(header).toContain(`filename*=UTF-8''Atestado%20M%C3%A9dico%2001.pdf`);
  });
});
