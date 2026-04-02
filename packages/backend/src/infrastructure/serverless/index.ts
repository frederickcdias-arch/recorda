/**
 * Infrastructure Serverless Index
 * Exporta todos os serviços serverless
 */

export { ServerlessService, getServerlessService } from './ServerlessService.js';
export type {
  ServerlessFunction,
  ServerlessTrigger,
  ServerlessExecution,
  EdgeFunction,
  EdgeTrigger,
  ServerlessMetrics,
} from './ServerlessService.js';
