/**
 * Infrastructure Backup Index
 * Exporta todos os serviços de backup
 */

export { BackupService, getBackupService } from './BackupService.js';
export type {
  BackupConfig,
  BackupDestination,
  BackupJob,
  BackupFile,
  DisasterRecoveryPlan,
  RecoveryProcedure,
  RecoveryStep,
  EmergencyContact,
} from './BackupService.js';
