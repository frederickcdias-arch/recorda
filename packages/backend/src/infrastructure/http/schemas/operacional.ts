import { z } from 'zod';

// --- Params comuns ---
export const idParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

export const processoIdParamSchema = z.object({
  processoId: z.string().uuid('ID do processo inválido'),
});

export const idAndItemIdParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
  itemId: z.string().uuid('ID do item inválido'),
});

// --- Repositórios ---
export const criarRepositorioSchema = z.object({
  idRepositorioGed: z.string().min(1, 'ID GED é obrigatório'),
  orgao: z.string().min(1, 'Órgão é obrigatório'),
  projeto: z.string().min(1, 'Projeto é obrigatório'),
  armarioCodigo: z.string().optional(),
});

export const ocrPreviewSchema = z.object({
  imagemBase64: z.string().min(1, 'Campo obrigatório: imagemBase64'),
});

// --- Setores / Classificações ---
export const nomeObrigatorioSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').transform((v) => v.trim()),
});

// --- Recebimento Processos ---
export const criarProcessoRecebimentoSchema = z.object({
  protocolo: z.string().min(1, 'Protocolo é obrigatório'),
  interessado: z.string().default(''),
  setorId: z.string().uuid().optional().nullable(),
  classificacaoId: z.string().uuid().optional().nullable(),
  volumeAtual: z.number().int().min(1).default(1),
  volumeTotal: z.number().int().min(0).default(0),
  numeroCaixas: z.number().int().min(1).default(1),
  caixaNova: z.boolean().default(false),
  origem: z.enum(['MANUAL', 'OCR', 'LEGADO']).default('MANUAL'),
  ocrConfianca: z.number().min(0).max(100).optional().nullable(),
  ocrImagemPath: z.string().optional().nullable(),
});

// --- Volumes ---
export const criarVolumeSchema = z.object({
  numeroVolume: z.number().int().min(1, 'Número do volume é obrigatório'),
  volumeTotal: z.number().int().min(0).default(0),
  origem: z.string().default('MANUAL'),
});

// --- Apensos ---
export const criarApensoSchema = z.object({
  protocolo: z.string().min(1, 'Protocolo é obrigatório'),
  interessado: z.string().default(''),
  volumeAtual: z.number().int().min(1).default(1),
  volumeTotal: z.number().int().min(0).default(0),
  origem: z.enum(['MANUAL', 'OCR', 'LEGADO']).default('MANUAL'),
});

// --- Checklists ---
export const criarModeloChecklistSchema = z.object({
  codigo: z.string().min(1, 'Código é obrigatório'),
  descricao: z.string().min(1, 'Descrição é obrigatória'),
  obrigatorio: z.boolean().default(true),
  etapa: z.string().min(1, 'Etapa é obrigatória'),
  ordem: z.number().int().min(0).default(0),
});

export const atualizarModeloChecklistSchema = z.object({
  codigo: z.string().min(1).optional(),
  descricao: z.string().min(1).optional(),
  obrigatorio: z.boolean().optional(),
  etapa: z.string().min(1).optional(),
  ordem: z.number().int().min(0).optional(),
  ativo: z.boolean().optional(),
});

export const abrirChecklistSchema = z.object({
  etapa: z.enum([
    'RECEBIMENTO', 'PREPARACAO', 'DIGITALIZACAO',
    'CONFERENCIA', 'MONTAGEM', 'CONTROLE_QUALIDADE', 'ENTREGA',
  ], { message: 'Etapa é obrigatória' }),
});

export const registrarItemChecklistSchema = z.object({
  modeloId: z.string().uuid('ID do modelo inválido'),
  resultado: z.enum(['CONFORME', 'NAO_CONFORME_COM_TRATATIVA'], {
    message: 'Resultado é obrigatório',
  }),
  observacao: z.string().optional().default(''),
});

export const concluirChecklistSchema = z.object({
  observacao: z.string().optional().default(''),
  itens: z.array(z.object({
    modeloId: z.string().uuid('ID do modelo inválido'),
    resultado: z.enum(['CONFORME', 'NAO_CONFORME_COM_TRATATIVA']),
    observacao: z.string().optional().default(''),
  })).optional(),
});

export const registrarProducaoSchema = z.object({
  etapa: z.enum([
    'RECEBIMENTO', 'PREPARACAO', 'DIGITALIZACAO',
    'CONFERENCIA', 'MONTAGEM', 'CONTROLE_QUALIDADE', 'ENTREGA',
  ], { message: 'Etapa é obrigatória' }),
  checklistId: z.string().uuid('ID do checklist inválido'),
  quantidade: z.number().int().min(1).default(1),
  marcadores: z.record(z.string(), z.unknown()).optional().default({}),
});

// --- Relatório Recebimento ---
export const relatorioRecebimentoSchema = z.object({
  repositorioIds: z.array(z.string().uuid()).min(1, 'repositorioIds é obrigatório'),
});

// --- Exceções ---
export const registrarExcecaoSchema = z.object({
  etapa: z.enum([
    'RECEBIMENTO', 'PREPARACAO', 'DIGITALIZACAO',
    'CONFERENCIA', 'MONTAGEM', 'CONTROLE_QUALIDADE', 'ENTREGA',
  ], { message: 'Etapa é obrigatória' }),
  tipoExcecao: z.enum(['MIDIA', 'COLORIDO', 'MAPA', 'FRAGILIDADE'], {
    message: 'Tipo de exceção é obrigatório',
  }),
  statusTratativa: z.enum(['ABERTA', 'EM_TRATATIVA', 'RESOLVIDA']).default('ABERTA'),
  descricao: z.string().optional().default(''),
});

export const resolverExcecaoSchema = z.object({
  observacao: z.string().optional().default(''),
});

export const avancarEtapaSchema = z.object({
  etapaDestino: z.enum([
    'RECEBIMENTO', 'PREPARACAO', 'DIGITALIZACAO',
    'CONFERENCIA', 'MONTAGEM', 'CONTROLE_QUALIDADE', 'ENTREGA',
  ], { message: 'Etapa destino é obrigatória' }),
  statusDestino: z.string().min(1, 'Status destino é obrigatório'),
});

// --- CQ ---
export const criarLoteCQSchema = z.object({
  codigo: z.string().min(1, 'Código não pode ser vazio').optional(),
  repositorioIds: z.array(z.string().uuid()).min(1, 'Pelo menos um repositório é obrigatório'),
});

export const auditarItemCQSchema = z.object({
  resultado: z.enum(['PENDENTE', 'APROVADO', 'REPROVADO'], {
    message: 'Resultado é obrigatório',
  }),
  motivoCodigo: z.string().optional().nullable(),
});

// --- Metas ---
export const criarMetaSchema = z.object({
  etapaId: z.string().uuid('ID da etapa inválido'),
  metaDiaria: z.number().int().min(0, 'Meta diária deve ser >= 0'),
  metaMensal: z.number().int().min(0, 'Meta mensal deve ser >= 0'),
});

export const criarMapeamentoSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  mapeamento: z.record(z.string(), z.string()),
});

// --- Conhecimento Operacional ---
export const criarDocumentoKBSchema = z.object({
  codigo: z.string().min(1, 'Código é obrigatório'),
  titulo: z.string().min(1, 'Título é obrigatório'),
  categoria: z.string().min(1, 'Categoria é obrigatória'),
  descricao: z.string().optional().default(''),
  conteudo: z.string().optional().default(''),
  nivelAcesso: z.enum(['OPERADOR_ADMIN', 'ADMIN']).default('OPERADOR_ADMIN'),
  etapasRelacionadas: z.array(z.string()).optional().default([]),
});

export const criarVersaoKBSchema = z.object({
  conteudo: z.string().min(1, 'Conteúdo é obrigatório'),
  resumoAlteracao: z.string().optional().default(''),
});

export const atualizarDocumentoKBSchema = z.object({
  titulo: z.string().min(1).optional(),
  descricao: z.string().optional(),
  status: z.enum(['ATIVO', 'INATIVO', 'RASCUNHO']).optional(),
  nivelAcesso: z.enum(['OPERADOR_ADMIN', 'ADMIN']).optional(),
  etapasRelacionadas: z.array(z.string()).optional(),
});

// --- Recebimento Avulsos ---
export const criarProcessoAvulsoSchema = z.object({
  protocolo: z.string().min(1, 'Protocolo é obrigatório'),
  interessado: z.string().min(1, 'Interessado é obrigatório'),
  setorId: z.string().uuid().optional().nullable(),
  classificacaoId: z.string().uuid().optional().nullable(),
  volumeAtual: z.number().int().min(1).default(1),
  volumeTotal: z.number().int().min(0).default(0),
  numeroCaixas: z.number().int().min(1).default(1),
  caixaNova: z.boolean().default(false),
  observacao: z.string().optional().default(''),
  origem: z.enum(['MANUAL', 'OCR', 'LEGADO']).default('MANUAL'),
  ocrConfianca: z.number().min(0).max(100).optional().nullable(),
});

export const criarProcessosBatchSchema = z.object({
  processos: z.array(z.object({
    protocolo: z.string().min(1, 'Protocolo é obrigatório'),
    interessado: z.string().min(1, 'Interessado é obrigatório'),
    setorId: z.string().uuid().optional().nullable(),
    classificacaoId: z.string().uuid().optional().nullable(),
    volumeAtual: z.number().int().min(1).default(1),
    volumeTotal: z.number().int().min(0).default(0),
    numeroCaixas: z.number().int().min(1).default(1),
    caixaNova: z.boolean().default(false),
    origem: z.enum(['MANUAL', 'OCR', 'LEGADO']).default('MANUAL'),
    ocrConfianca: z.number().min(0).max(100).optional().nullable(),
  })).min(1, 'Pelo menos um processo é obrigatório'),
});

export const vincularProcessosSchema = z.object({
  processoIds: z.array(z.string().uuid()).min(1, 'Pelo menos um processo é obrigatório'),
  repositorioId: z.string().uuid('ID do repositório inválido'),
});

// --- Importação Legado ---
export const importacaoLegadoSchema = z.object({
  tipo: z.enum(['recebimento', 'producao'], { message: 'Tipo é obrigatório' }),
  etapa: z.string().optional(),
  registros: z.array(z.record(z.string(), z.unknown())).min(1, 'Pelo menos um registro é obrigatório'),
});

export const importacaoLegadoRecebimentoSchema = z.object({
  usuarioId: z.string().uuid().optional(),
  registros: z.array(z.object({
    idRepositorioGed: z.string().min(1),
    orgao: z.string().optional(),
    projeto: z.string().optional(),
    processo: z.string().min(1),
    interessado: z.string().min(1),
    numeroCaixas: z.number().int().min(1).optional(),
    volume: z.string().optional(),
    caixaNova: z.boolean().optional(),
  })).min(1, 'Pelo menos um registro é obrigatório'),
});

export const importacaoLegadoProducaoSchema = z.object({
  usuarioId: z.string().uuid().optional(),
  etapa: z.string().optional(),
  registros: z.array(z.object({
    data: z.string().optional(),
    colaborador: z.string().min(1),
    funcao: z.string().optional(),
    repositorio: z.string().min(1),
    coordenadoria: z.string().optional(),
    quantidade: z.union([z.number(), z.string()]).optional(),
    tipo: z.string().optional(),
  })).min(1, 'Pelo menos um registro é obrigatório'),
});
