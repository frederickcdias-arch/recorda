/**
 * @recorda/shared - Tipos e constantes compartilhados entre frontend e backend
 */

// Constantes
export * from './constants/index.js';

// Entidades principais
export * from './entities/usuario.js';
export * from './entities/colaborador.js';
export * from './entities/etapa.js';
export * from './entities/processo.js';
export * from './entities/producao.js';
export * from './entities/operacional.js';
export * from './entities/comunicado.js';
export * from './entities/ausencia.js';

// DTOs de API
export * from './api/auth.js';
export * from './api/pagination.js';
export * from './api/responses.js';
export * from './api/comunicados.js';
export * from './api/ausencias.js';
export * from './api/push.js';

// Utilitários
export * from './utils/repositorio.js';
