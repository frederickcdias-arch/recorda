import { describe, it, expect } from 'vitest';
import { extractOCRPreview, getCurrentUser, normalizeText } from './operacional-helpers.js';

describe('normalizeText', () => {
  it('collapses multiple spaces', () => {
    expect(normalizeText('hello   world')).toBe('hello world');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('handles tabs and newlines within text', () => {
    expect(normalizeText('hello\t\nworld')).toBe('hello world');
  });
});

describe('extractOCRPreview', () => {
  it('extracts protocolo from standard format with colon', () => {
    const result = extractOCRPreview('Protocolo: 502824/2021\nInteressado: JBS S/A', 95);
    expect(result.protocolo).toBe('502824/2021');
    expect(result.interessado).toBe('JBS S/A');
    expect(result.confianca).toBe(95);
  });

  it('extracts protocolo with "n." prefix', () => {
    const result = extractOCRPreview('Protocolo n. 502824/2021\nInteressado: JBS S/A', 95);
    expect(result.protocolo).toBe('502824/2021');
  });

  it('extracts protocolo without "nº"', () => {
    const result = extractOCRPreview('Protocolo: 123456/2023\nInteressado: Empresa ABC', 80);
    expect(result.protocolo).toBe('123456/2023');
    expect(result.interessado).toBe('Empresa ABC');
  });

  it('returns empty strings when no match found', () => {
    const result = extractOCRPreview('Texto aleatório sem dados relevantes', 50);
    expect(result.protocolo).toBe('');
    expect(result.interessado).toBe('');
    expect(result.textoExtraido).toBe('Texto aleatório sem dados relevantes');
  });

  it('handles multiline OCR text', () => {
    const text = `GOVERNO DO ESTADO
Protocolo n. 987654/2024
Interessado: Maria Silva
Assunto: Requerimento`;
    const result = extractOCRPreview(text, 88);
    expect(result.protocolo).toBe('987654/2024');
    expect(result.interessado).toBe('Maria Silva');
  });

  it('stops interessado before "assunto" keyword', () => {
    const text = 'Protocolo: 111/2025 Interessado: João Assunto: Teste';
    const result = extractOCRPreview(text, 70);
    expect(result.interessado).toBe('João');
  });

  it('fixes OCR errors: O→0, l→1', () => {
    const result = extractOCRPreview('Protocolo: 5O2824/2O2l\nInteressado: Teste', 80);
    expect(result.protocolo).toBe('502824/2021');
  });

  it('extracts protocolo with dash separator', () => {
    const result = extractOCRPreview('Protocolo: 123456-2024\nInteressado: Teste', 85);
    expect(result.protocolo).toBe('123456-2024');
  });

  it('extracts protocolo with Prot. abbreviation', () => {
    const result = extractOCRPreview('Prot. 654321/2023\nInteressado: Empresa XYZ', 75);
    expect(result.protocolo).toBe('654321/2023');
  });

  it('extracts standalone number/year pattern', () => {
    const result = extractOCRPreview('Documento referente ao 987654/2024 do órgão', 70);
    expect(result.protocolo).toBe('987654/2024');
  });

  it('extracts protocolo with nº symbol', () => {
    const result = extractOCRPreview('Protocolo nº 111222/2025\nInteressado: Maria', 90);
    expect(result.protocolo).toBe('111222/2025');
  });

  it('extracts protocolo with "n.:" format (government standard)', () => {
    const result = extractOCRPreview('Protocolo n.: 13142/2024 Data:09/08/2024\nInteressado(a): MARIA CECILIA BOTINI HANEL', 85);
    expect(result.protocolo).toBe('13142/2024');
    expect(result.interessado).toBe('MARIA CECILIA BOTINI HANEL');
  });

  it('extracts protocolo with OCR artifacts (extra hyphen)', () => {
    const result = extractOCRPreview('Protocolo n.:-13142/2024 Data:09/08/2024 15:19\nInteressado(a): MARIA CECILIA BOTINI HANEL', 85);
    expect(result.protocolo).toBe('13142/2024');
    expect(result.interessado).toBe('MARIA CECILIA BOTINI HANEL');
  });
});

describe('getCurrentUser', () => {
  it('returns user when present', () => {
    const request = { user: { id: '123', perfil: 'administrador' } };
    expect(getCurrentUser(request)).toEqual({ id: '123', perfil: 'administrador' });
  });

  it('throws when user is missing', () => {
    expect(() => getCurrentUser({})).toThrow('Usuário autenticado não encontrado');
  });

  it('throws when user has no id', () => {
    expect(() => getCurrentUser({ user: { perfil: 'operador' } })).toThrow();
  });
});
