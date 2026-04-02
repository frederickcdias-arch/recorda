/**
 * Infrastructure Micro Frontends Index
 * Exporta todos os serviços de micro frontends
 */

export { MicroFrontendsService, getMicroFrontendsService } from './MicroFrontendsService.js';
export type {
  MicroFrontend,
  EntryPoint,
  MicroFrontendDependency,
  SharedModule,
  RoutingConfig,
  Route,
  RouteGuard,
  PreloadConfig,
  BuildConfig,
  BuildOptimization,
  CodeSplittingConfig,
  CachingConfig,
  DeploymentConfig,
  CDNConfig,
  CDNCacheConfig,
  CDNSecurityConfig,
  HostingConfig,
  ScalingConfig,
  MonitoringConfig,
  HealthCheckConfig,
  RollbackConfig,
  MicroFrontendInstance,
  InstanceMetrics,
  MicroFrontendMetrics,
} from './MicroFrontendsService.js';
