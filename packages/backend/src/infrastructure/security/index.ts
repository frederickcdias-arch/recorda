/**
 * Infrastructure Security Index
 * Exporta todos os serviços de segurança
 */

export { ZeroTrustService, getZeroTrustService } from './ZeroTrustService.js';
export { AdvancedSecurityService, getAdvancedSecurityService } from './AdvancedSecurityService.js';
export type {
  DeviceTrust,
  SecurityContext,
  SecurityPolicy,
  SecurityRule,
  ThreatDetection,
} from './ZeroTrustService.js';
export type {
  SecurityPolicy as AdvancedSecurityPolicy,
  SecurityRule as AdvancedSecurityRule,
  ThreatDetection as AdvancedThreatDetection,
  ThreatIndicator,
  BehavioralAnalysis,
  ZeroTrustContext,
  TrustScore,
  SecurityMetrics,
} from './AdvancedSecurityService.js';
