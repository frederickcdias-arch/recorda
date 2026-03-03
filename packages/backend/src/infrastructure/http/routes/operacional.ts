import type { FastifyPluginAsync } from 'fastify';
import { createOperacionalRepositoriosRoutes } from './operacional-repositorios.js';
import { createOperacionalRecebimentoRoutes } from './operacional-recebimento.js';
import { createOperacionalAvulsosRoutes } from './operacional-avulsos.js';
import { createOperacionalImportacaoLegadoRoutes } from './operacional-importacao-legado.js';
import { createOperacionalChecklistsRoutes } from './operacional-checklists.js';
import { createOperacionalCQRoutes } from './operacional-cq.js';

/**
 * Orchestrator that registers all operational sub-route modules.
 *   - operacional-helpers.ts            — shared types, utility functions
 *   - operacional-repositorios.ts       — repositórios CRUD, OCR, seadesk (~290 lines)
 *   - operacional-recebimento.ts        — setores, classificações, processos, volumes, apensos
 *   - operacional-avulsos.ts            — avulsos OCR, CRUD, batch, vincular/desvincular
 *   - operacional-importacao-legado.ts  — validar, importar recebimento/produção, listar, limpar
 *   - operacional-checklists.ts         — checklists, produção, relatórios, exceções, avanço de etapa
 *   - operacional-cq.ts                 — lotes CQ, itens, fechar, relatório entrega, download PDF
 */
export function createOperacionalRoutes(): FastifyPluginAsync {
  return async (server): Promise<void> => {
    await server.register(createOperacionalRepositoriosRoutes());
    await server.register(createOperacionalRecebimentoRoutes());
    await server.register(createOperacionalAvulsosRoutes());
    await server.register(createOperacionalImportacaoLegadoRoutes());
    await server.register(createOperacionalChecklistsRoutes());
    await server.register(createOperacionalCQRoutes());
  };
}
