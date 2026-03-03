import { describe, it, expect } from 'vitest';
import {
  criarRepositorioSchema,
  nomeObrigatorioSchema,
  abrirChecklistSchema,
  registrarItemChecklistSchema,
  relatorioRecebimentoSchema,
  criarLoteCQSchema,
  importacaoLegadoSchema,
} from './operacional.js';

describe('criarRepositorioSchema', () => {
  it('accepts valid input', () => {
    const result = criarRepositorioSchema.safeParse({
      idRepositorioGed: '000016/2025',
      orgao: 'SEFAZ',
      projeto: 'DIGITALIZAÇÃO',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty idRepositorioGed', () => {
    const result = criarRepositorioSchema.safeParse({
      idRepositorioGed: '',
      orgao: 'SEFAZ',
      projeto: 'DIGITALIZAÇÃO',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = criarRepositorioSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('nomeObrigatorioSchema', () => {
  it('accepts valid name and trims', () => {
    const result = nomeObrigatorioSchema.safeParse({ nome: '  Setor A  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nome).toBe('Setor A');
    }
  });

  it('rejects empty name', () => {
    const result = nomeObrigatorioSchema.safeParse({ nome: '' });
    expect(result.success).toBe(false);
  });
});

describe('abrirChecklistSchema', () => {
  it('accepts valid etapa', () => {
    const result = abrirChecklistSchema.safeParse({ etapa: 'RECEBIMENTO' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid etapa', () => {
    const result = abrirChecklistSchema.safeParse({ etapa: 'INVALIDA' });
    expect(result.success).toBe(false);
  });
});

describe('registrarItemChecklistSchema', () => {
  it('accepts valid input', () => {
    const result = registrarItemChecklistSchema.safeParse({
      modeloId: '550e8400-e29b-41d4-a716-446655440000',
      resultado: 'CONFORME',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid resultado', () => {
    const result = registrarItemChecklistSchema.safeParse({
      modeloId: '550e8400-e29b-41d4-a716-446655440000',
      resultado: 'INVALIDO',
    });
    expect(result.success).toBe(false);
  });

  it('defaults observacao to empty string', () => {
    const result = registrarItemChecklistSchema.safeParse({
      modeloId: '550e8400-e29b-41d4-a716-446655440000',
      resultado: 'CONFORME',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.observacao).toBe('');
    }
  });
});

describe('relatorioRecebimentoSchema', () => {
  it('accepts array of UUIDs', () => {
    const result = relatorioRecebimentoSchema.safeParse({
      repositorioIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty array', () => {
    const result = relatorioRecebimentoSchema.safeParse({
      repositorioIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID strings', () => {
    const result = relatorioRecebimentoSchema.safeParse({
      repositorioIds: ['not-a-uuid'],
    });
    expect(result.success).toBe(false);
  });
});

describe('criarLoteCQSchema', () => {
  it('accepts valid input', () => {
    const result = criarLoteCQSchema.safeParse({
      codigo: 'LOTE-001',
      repositorioIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty codigo', () => {
    const result = criarLoteCQSchema.safeParse({
      codigo: '',
      repositorioIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(result.success).toBe(false);
  });
});

describe('importacaoLegadoSchema', () => {
  it('accepts valid recebimento import', () => {
    const result = importacaoLegadoSchema.safeParse({
      tipo: 'recebimento',
      registros: [{ idRepositorioGed: '000016/2025', processo: '123', interessado: 'Test' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid tipo', () => {
    const result = importacaoLegadoSchema.safeParse({
      tipo: 'invalido',
      registros: [{}],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty registros', () => {
    const result = importacaoLegadoSchema.safeParse({
      tipo: 'recebimento',
      registros: [],
    });
    expect(result.success).toBe(false);
  });
});
