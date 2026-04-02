/**
 * Infrastructure Edge AI Index
 * Exporta todos os serviços de Edge AI
 */

export { EdgeAIService, getEdgeAIService } from './EdgeAIService.js';
export type {
  EdgeModel,
  ModelDeployment,
  DeploymentConfig,
  DeploymentMetrics,
  EdgeInference,
  ModelTraining,
  DatasetInfo,
  TrainingConfig,
  TrainingPrivacy,
  TrainingMetrics,
  FederatedLearning,
  FederatedParticipant,
  FederatedMetrics,
  ModelOptimization,
  OptimizationConfig,
  OptimizationResults,
  EdgeAIMetrics,
} from './EdgeAIService.js';
