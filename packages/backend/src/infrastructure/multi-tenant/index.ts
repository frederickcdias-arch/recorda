/**
 * Infrastructure Multi-Tenant Index
 * Exporta todos os serviços de multi-tenancy
 */

export { MultiTenantService, getMultiTenantService } from './MultiTenantService.js';
export type { Tenant, TenantSettings, TenantLimits, TenantContext } from './MultiTenantService.js';
