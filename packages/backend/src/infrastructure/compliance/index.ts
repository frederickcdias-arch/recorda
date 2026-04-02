/**
 * Infrastructure Compliance Index
 * Exporta todos os serviços de compliance
 */

export { ComplianceService, getComplianceService } from './ComplianceService.js';
export type {
  ConsentRecord,
  DataSubject,
  DataProcessingRecord,
  ComplianceAudit,
  ComplianceFinding,
} from './ComplianceService.js';
