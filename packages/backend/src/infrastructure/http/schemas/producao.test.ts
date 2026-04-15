import { describe, it, expect } from 'vitest';
import { lancarProducaoColaboradorSchema } from './producao';

describe('Schema de Validação: lancarProducaoColaboradorSchema', () => {
  describe('✅ Validações que devem PASSAR', () => {
    it('deve aceitar dados mínimos válidos', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(true);
    });

    it('deve aceitar dados completos válidos', () => {
      const dados = {
        data: '2026-04-15',
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const,
        funcao: 'Digitalizador',
        coordenadoria: 'CINF',
        quantidade: 10,
        tipo: 'Imagens'
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(true);
    });

    it('deve aceitar quantidade como string e converter', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const,
        quantidade: '10'
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(true);
      if (resultado.success) {
        expect(resultado.data.quantidade).toBe(10);
      }
    });

    it('deve aceitar todas as etapas válidas', () => {
      const etapasValidas = [
        'RECEBIMENTO',
        'PREPARACAO',
        'DIGITALIZACAO',
        'CONFERENCIA',
        'RECONFERENCIA',
        'MONTAGEM',
        'ATENDIMENTO',
        'CONTROLE_QUALIDADE',
        'ENTREGA'
      ] as const;

      etapasValidas.forEach(etapa => {
        const dados = { repositorio: '150/2026', etapa };
        const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
        expect(resultado.success).toBe(true);
      });
    });

    it('deve aceitar data no formato YYYY-MM-DD', () => {
      const dados = {
        data: '2026-04-15',
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(true);
    });

    it('deve aceitar campos opcionais vazios', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(true);
    });

    it('deve aceitar repositório de tamanho médio', () => {
      const dados = {
        repositorio: '000150/2026',
        etapa: 'DIGITALIZACAO' as const
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(true);
    });
  });

  describe('❌ Validações que devem FALHAR', () => {
    it('deve rejeitar data em formato DD/MM/YYYY', () => {
      const dados = {
        data: '15/04/2026',
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar data em formato YYYY/MM/DD', () => {
      const dados = {
        data: '2026/04/15',
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar data em formato DD-MM-YYYY', () => {
      const dados = {
        data: '15-04-2026',
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar data inválida', () => {
      const dados = {
        data: 'invalido',
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar repositório vazio', () => {
      const dados = {
        repositorio: '',
        etapa: 'DIGITALIZACAO' as const
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar repositório muito longo (>100 chars)', () => {
      const dados = {
        repositorio: 'x'.repeat(101),
        etapa: 'DIGITALIZACAO' as const
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar etapa inválida', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'ETAPA_INVALIDA'
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar quantidade negativa', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const,
        quantidade: -1
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar quantidade zero', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const,
        quantidade: 0
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar quantidade decimal', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const,
        quantidade: 10.5
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar função muito longa (>200 chars)', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const,
        funcao: 'x'.repeat(201)
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar coordenadoria muito longa (>200 chars)', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const,
        coordenadoria: 'x'.repeat(201)
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar tipo muito longo (>100 chars)', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const,
        tipo: 'x'.repeat(101)
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar quantidade como string inválida', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const,
        quantidade: 'abc'
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar sem campo obrigatório repositorio', () => {
      const dados = {
        etapa: 'DIGITALIZACAO' as const
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });

    it('deve rejeitar sem campo obrigatório etapa', () => {
      const dados = {
        repositorio: '150/2026'
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(false);
    });
  });

  describe('🔄 Transformações', () => {
    it('deve converter string "10" para número 10', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const,
        quantidade: '10'
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(true);
      if (resultado.success) {
        expect(typeof resultado.data.quantidade).toBe('number');
        expect(resultado.data.quantidade).toBe(10);
      }
    });

    it('deve manter quantidade como número se já for número', () => {
      const dados = {
        repositorio: '150/2026',
        etapa: 'DIGITALIZACAO' as const,
        quantidade: 10
      };
      const resultado = lancarProducaoColaboradorSchema.safeParse(dados);
      expect(resultado.success).toBe(true);
      if (resultado.success) {
        expect(typeof resultado.data.quantidade).toBe('number');
        expect(resultado.data.quantidade).toBe(10);
      }
    });
  });
});
