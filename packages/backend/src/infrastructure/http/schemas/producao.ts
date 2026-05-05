import { z } from 'zod';

// Schema para lançamento direto de produção por colaboradores
export const lancarProducaoColaboradorSchema = z.object({
  // Data da produção (formato YYYY-MM-DD) - validação rigorosa de formato
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
    .optional(),

  // ID GED do repositório - tamanho máximo 100 caracteres
  repositorio: z
    .string()
    .min(1, 'ID do repositório é obrigatório')
    .max(100, 'ID do repositório muito longo'),

  // Etapa obrigatória (enum restrito)
  etapa: z.enum(
    [
      'RECEBIMENTO',
      'PREPARACAO',
      'DIGITALIZACAO',
      'DIGITALIZACAO_COLORIDA',
      'CONFERENCIA',
      'RECONFERENCIA',
      'MONTAGEM',
      'ATENDIMENTO',
      'CONTROLE_QUALIDADE',
      'ENTREGA',
    ],
    { message: 'Etapa é obrigatória' }
  ),

  // Função/tipo de trabalho - tamanho máximo 200 caracteres
  funcao: z.string().max(200, 'Função muito longa').optional(),

  // Coordenadoria - tamanho máximo 200 caracteres
  coordenadoria: z.string().max(200, 'Coordenadoria muito longa').optional(),

  // Quantidade de itens - sempre positiva (mínimo 1)
  quantidade: z
    .union([
      z
        .number()
        .int('Quantidade deve ser número inteiro')
        .min(1, 'Quantidade deve ser no mínimo 1'),
      z.string().transform((val, ctx) => {
        const num = parseInt(val, 10);
        if (isNaN(num) || num < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Quantidade deve ser no mínimo 1',
          });
          return z.NEVER;
        }
        return num;
      }),
    ])
    .optional(),

  // Tipo adicional - tamanho máximo 100 caracteres
  tipo: z.string().max(100, 'Tipo muito longo').optional(),
});
