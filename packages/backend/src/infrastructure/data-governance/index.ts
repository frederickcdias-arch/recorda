/**
 * Infrastructure Data Governance Index
 * Exporta todos os serviços de governança de dados
 */

export { DataGovernanceService, getDataGovernanceService } from './DataGovernanceService.js';
export type {
  DataQualityRule,
  DataQualityIssue,
  DataLineage,
  DataCatalog,
  DataCatalogColumn,
  DataValidationResult,
} from './DataGovernanceService.js';
