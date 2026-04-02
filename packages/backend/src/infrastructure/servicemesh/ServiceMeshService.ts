/**
 * Service Mesh Service
 * Implementa service mesh com Istio, Linkerd ou Consul Connect
 */

import type { FastifyInstance } from 'fastify';
import { logger } from '../logging/logger.js';
import { getEventService } from '../events/index.js';

export interface ServiceMesh {
  id: string;
  name: string;
  description: string;
  provider: 'istio' | 'linkerd' | 'consul' | 'aws-app-mesh' | 'custom';
  version: string;
  namespace: string;
  controlPlane: ControlPlaneConfig;
  dataPlane: DataPlaneConfig;
  security: MeshSecurityConfig;
  observability: MeshObservabilityConfig;
  traffic: TrafficManagementConfig;
  policies: MeshPolicy[];
  status: 'active' | 'inactive' | 'error' | 'upgrading';
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

export interface ControlPlaneConfig {
  replicas: number;
  resources: ResourceConfig;
  autoscaling: AutoscalingConfig;
  highAvailability: boolean;
  backup: BackupConfig;
  monitoring: ControlPlaneMonitoringConfig;
}

export interface ResourceConfig {
  cpu: ResourceLimit;
  memory: ResourceLimit;
  storage?: ResourceLimit;
}

export interface ResourceLimit {
  request: string;
  limit: string;
}

export interface AutoscalingConfig {
  enabled: boolean;
  minReplicas: number;
  maxReplicas: number;
  targetCPU: number;
  targetMemory: number;
  scaleDownDelay: number;
}

export interface BackupConfig {
  enabled: boolean;
  schedule: string;
  retention: number;
  storage: string;
  encryption: boolean;
}

export interface ControlPlaneMonitoringConfig {
  enabled: boolean;
  metrics: string[];
  alerts: boolean;
  logging: boolean;
  tracing: boolean;
}

export interface DataPlaneConfig {
  sidecar: SidecarConfig;
  injection: InjectionConfig;
  networking: NetworkingConfig;
  performance: PerformanceConfig;
}

export interface SidecarConfig {
  image: string;
  version: string;
  resources: ResourceConfig;
  proxy: ProxyConfig;
}

export interface ProxyConfig {
  type: 'envoy' | 'linkerd-proxy' | 'nginx' | 'haproxy';
  config: Record<string, any>;
  listeners: ListenerConfig[];
  clusters: ClusterConfig[];
}

export interface ListenerConfig {
  name: string;
  address: string;
  port: number;
  protocol: 'HTTP' | 'HTTPS' | 'TCP' | 'GRPC';
  filters: FilterConfig[];
}

export interface FilterConfig {
  name: string;
  type: string;
  config: Record<string, any>;
  order: number;
}

export interface ClusterConfig {
  name: string;
  type: 'STRICT_DNS' | 'LOGICAL_DNS' | 'STATIC' | 'EDS';
  endpoints: EndpointConfig[];
  loadBalancing: LoadBalancingConfig;
}

export interface EndpointConfig {
  address: string;
  port: number;
  weight: number;
  healthCheck: HealthCheckConfig;
}

export interface LoadBalancingConfig {
  type: 'ROUND_ROBIN' | 'LEAST_CONN' | 'RANDOM' | 'RING_HASH' | 'MAGLEV';
  healthyThreshold: number;
  unhealthyThreshold: number;
}

export interface HealthCheckConfig {
  enabled: boolean;
  path: string;
  interval: number;
  timeout: number;
  unhealthyThreshold: number;
  healthyThreshold: number;
}

export interface InjectionConfig {
  enabled: boolean;
  automatic: boolean;
  labelSelector: LabelSelector;
  excludedNamespaces: string[];
  template: InjectionTemplate;
}

export interface LabelSelector {
  matchLabels: Record<string, string>;
  matchExpressions: LabelExpression[];
}

export interface LabelExpression {
  key: string;
  operator: 'Exists' | 'DoesNotExist' | 'In' | 'NotIn';
  values?: string[];
}

export interface InjectionTemplate {
  name: string;
  type: 'sidecar' | 'initContainer';
  image: string;
  resources: ResourceConfig;
  env: EnvironmentVariable[];
  volumeMounts: VolumeMount[];
}

export interface EnvironmentVariable {
  name: string;
  value: string;
  valueFrom?: ValueFrom;
}

export interface ValueFrom {
  fieldRef?: FieldRef;
  configMapKeyRef?: ConfigMapRef;
  secretKeyRef?: SecretRef;
}

export interface FieldRef {
  fieldPath: string;
  apiVersion: string;
}

export interface ConfigMapRef {
  name: string;
  key: string;
}

export interface SecretRef {
  name: string;
  key: string;
}

export interface VolumeMount {
  name: string;
  mountPath: string;
  readOnly: boolean;
}

export interface NetworkingConfig {
  mtls: TLSConfig;
  trafficPolicy: TrafficPolicyConfig;
  serviceEntries: ServiceEntryConfig[];
  gateways: GatewayConfig[];
}

export interface TLSConfig {
  mode: 'DISABLE' | 'ISTIO_MUTUAL' | 'STRICT' | 'PERMISSIVE';
  credentialName: string;
  destinationRule: string;
  minProtocolVersion: string;
  maxProtocolVersion: string;
}

export interface TrafficPolicyConfig {
  connectionPool: ConnectionPoolConfig;
  loadBalancer: LoadBalancerConfig;
  circuitBreaker: CircuitBreakerConfig;
  timeout: TimeoutConfig;
  retry: RetryConfig;
}

export interface ConnectionPoolConfig {
  tcp: TCPConnectionPool;
  http: HTTPConnectionPool;
}

export interface TCPConnectionPool {
  maxConnections: number;
  connectTimeout: string;
  keepAlive: KeepAliveConfig;
}

export interface KeepAliveConfig {
  interval: string;
  timeout: string;
  probes: number;
}

export interface HTTPConnectionPool {
  http1MaxPendingRequests: number;
  http2MaxRequests: number;
  maxRequestsPerConnection: number;
  maxRetries: number;
  idleTimeout: string;
  h2UpgradePolicy: string;
}

export interface LoadBalancerConfig {
  simple: SimpleLB;
  consistentHash: ConsistentHashLB;
  localityLb: LocalityLB;
}

export interface SimpleLB {
  algorithm: 'ROUND_ROBIN' | 'LEAST_CONN' | 'RANDOM';
}

export interface ConsistentHashLB {
  httpCookie: HTTPCookieHash;
  useSourceIp: boolean;
  httpHeaderName: string;
  httpQueryParameterName: string;
  minimumRingSize: number;
}

export interface HTTPCookieHash {
  name: string;
  path: string;
  ttl: string;
}

export interface LocalityLB {
  failover: FailoverConfig;
  distribute: DistributeConfig;
}

export interface FailoverConfig {
  from: string;
  to: string;
}

export interface DistributeConfig {
  from: string;
  to: string;
  weight: number;
}

export interface CircuitBreakerConfig {
  consecutiveErrors: number;
  interval: string;
  baseEjectionTime: string;
  maxEjectionPercent: number;
  minHealthPercent: number;
}

export interface TimeoutConfig {
  http: string;
  tcp: string;
}

export interface RetryConfig {
  attempts: number;
  perTryTimeout: string;
  retryOn: string[];
}

export interface ServiceEntryConfig {
  hosts: string[];
  location: string;
  ports: PortConfig[];
  resolution: 'DNS' | 'STATIC';
  endpoints: EndpointConfig[];
}

export interface PortConfig {
  number: number;
  protocol: 'HTTP' | 'HTTPS' | 'TCP' | 'GRPC';
  name: string;
}

export interface GatewayConfig {
  name: string;
  selector: LabelSelector;
  servers: ServerConfig[];
  tls: GatewayTLSConfig;
}

export interface ServerConfig {
  hosts: string[];
  port: PortConfig;
  tls: GatewayTLSConfig;
}

export interface GatewayTLSConfig {
  mode: 'SIMPLE' | 'MUTUAL' | 'DISABLE';
  credentialName: string;
  minProtocolVersion: string;
  maxProtocolVersion: string;
}

export interface PerformanceConfig {
  proxy: ProxyPerformanceConfig;
  networking: NetworkingPerformanceConfig;
  resources: ResourcePerformanceConfig;
}

export interface ProxyPerformanceConfig {
  concurrency: number;
  bufferLimit: number;
  stackSize: string;
  drainDuration: string;
  parentShutdownGracePeriod: string;
}

export interface NetworkingPerformanceConfig {
  connectionTimeout: string;
  connectTimeout: string;
  maxRequestsPerConnection: number;
  http2MaxRequests: number;
  idleTimeout: string;
}

export interface ResourcePerformanceConfig {
  cpu: ResourceLimit;
  memory: ResourceLimit;
  disk?: ResourceLimit;
}

export interface MeshSecurityConfig {
  authentication: MeshAuthConfig;
  authorization: MeshAuthzConfig;
  rbac: RBACConfig;
  jwt: JWTConfig;
  certificates: CertificateConfig;
}

export interface MeshAuthConfig {
  enabled: boolean;
  providers: AuthProvider[];
  policies: AuthPolicy[];
}

export interface AuthProvider {
  name: string;
  type: 'JWT' | 'OIDC' | 'MTLS' | 'API_KEY' | 'CUSTOM';
  config: Record<string, any>;
}

export interface AuthPolicy {
  name: string;
  selector: LabelSelector;
  providers: string[];
  action: 'ALLOW' | 'DENY';
  rules: AuthRule[];
}

export interface AuthRule {
  match: MatchCondition;
  requires: Principal[];
}

export interface MatchCondition {
  headers: HeaderMatch[];
  queryParams: QueryMatch[];
  withoutHeaders: HeaderMatch[];
  sourceLabels: Record<string, string>;
}

export interface HeaderMatch {
  name: string;
  exact?: string;
  prefix?: string;
  suffix?: string;
  regex?: string;
}

export interface QueryMatch {
  name: string;
  exact?: string;
  regex?: string;
}

export interface Principal {
  issuer: string;
  audiences: string[];
  any: boolean;
}

export interface MeshAuthzConfig {
  enabled: boolean;
  mode: 'ALLOW_ANY' | 'DENY_ANY' | 'RBAC';
  policies: AuthorizationPolicy[];
}

export interface AuthorizationPolicy {
  name: string;
  selector: LabelSelector;
  action: 'ALLOW' | 'DENY';
  rules: AuthorizationRule[];
}

export interface AuthorizationRule {
  from: SourcePrincipal[];
  to: OperationPrincipal[];
  when: Condition[];
}

export interface SourcePrincipal {
  principals: string[];
  requestPrincipals: string[];
}

export interface OperationPrincipal {
  notPrincipals: string[];
  namespaces: string[];
  methods: string[];
  paths: string[];
}

export interface Condition {
  key: string;
  values: string[];
}

export interface RBACConfig {
  enabled: boolean;
  serviceRoles: ServiceRole[];
  clusterRoles: ClusterRole[];
  bindings: RoleBinding[];
}

export interface ServiceRole {
  name: string;
  namespace: string;
  rules: AccessRule[];
}

export interface ClusterRole {
  name: string;
  rules: AccessRule[];
}

export interface AccessRule {
  verbs: string[];
  resources: string[];
  apiGroups: string[];
}

export interface RoleBinding {
  name: string;
  namespace?: string;
  roleRef: RoleRef;
  subjects: Subject[];
}

export interface RoleRef {
  kind: 'Role' | 'ClusterRole';
  name: string;
}

export interface Subject {
  kind: 'User' | 'Group' | 'ServiceAccount';
  name: string;
  namespace?: string;
}

export interface JWTConfig {
  enabled: boolean;
  providers: JWTProvider[];
  policies: JWTPolicy[];
}

export interface JWTProvider {
  name: string;
  issuer: string;
  audiences: string[];
  jwksUri: string;
  cacheDuration: string;
}

export interface JWTPolicy {
  name: string;
  selector: LabelSelector;
  origins: string[];
  principal: string;
  audiences: string[];
}

export interface CertificateConfig {
  enabled: boolean;
  providers: CertificateProvider[];
  rotation: RotationConfig;
  validation: ValidationConfig;
}

export interface CertificateProvider {
  name: string;
  type: 'FILE' | 'K8S' | 'VAULT' | 'AWS' | 'CUSTOM';
  config: Record<string, any>;
}

export interface RotationConfig {
  enabled: boolean;
  interval: string;
  gracePeriod: string;
  retryCount: number;
}

export interface ValidationConfig {
  enabled: boolean;
  trustDomain: string;
  caBundle: string;
  verifySubject: boolean;
}

export interface MeshObservabilityConfig {
  tracing: TracingConfig;
  metrics: MetricsConfig;
  logging: LoggingConfig;
  monitoring: MonitoringConfig;
}

export interface TracingConfig {
  enabled: boolean;
  provider: 'jaeger' | 'zipkin' | 'tempo' | 'lightstep' | 'custom';
  sampling: SamplingConfig;
  propagation: PropagationConfig;
}

export interface SamplingConfig {
  type: 'PROBABILISTIC' | 'RATE_LIMITING' | 'OFF';
  percentage: number;
  rateLimit: RateLimitConfig;
}

export interface RateLimitConfig {
  serverMin: number;
  serverMax: number;
  clientMin: number;
  clientMax: number;
}

export interface PropagationConfig {
  b3: boolean;
  w3c: boolean;
  zipkin: boolean;
  jaeger: boolean;
  custom: CustomPropagation[];
}

export interface CustomPropagation {
  name: string;
  header: string;
}

export interface MetricsConfig {
  enabled: boolean;
  providers: MetricsProvider[];
  prometheus: PrometheusConfig;
  statsd: StatsdConfig;
}

export interface MetricsProvider {
  name: string;
  type: 'PROMETHEUS' | 'STATSD' | 'DATADOG' | 'NEW_RELIC' | 'CUSTOM';
  config: Record<string, any>;
}

export interface PrometheusConfig {
  enabled: boolean;
  endpoint: string;
  port: number;
  path: string;
  metrics: string[];
}

export interface StatsdConfig {
  enabled: boolean;
  address: string;
  port: number;
  prefix: string;
}

export interface LoggingConfig {
  enabled: boolean;
  level: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  format: 'JSON' | 'TEXT';
  providers: LogProvider[];
  filters: LogFilter[];
}

export interface LogProvider {
  name: string;
  type: 'FILE' | 'STDOUT' | 'ELASTICSEARCH' | 'FLUENTD' | 'CUSTOM';
  config: Record<string, any>;
}

export interface LogFilter {
  name: string;
  type: 'LEVEL' | 'COMPONENT' | 'HEADER' | 'CUSTOM';
  config: Record<string, any>;
}

export interface MonitoringConfig {
  enabled: boolean;
  dashboards: DashboardConfig[];
  alerts: AlertConfig[];
  healthChecks: HealthCheckConfig[];
}

export interface DashboardConfig {
  name: string;
  type: 'GRAFANA' | 'KIBANA' | 'CUSTOM';
  url: string;
  refresh: string;
}

export interface AlertConfig {
  name: string;
  type: 'PROMETHEUS' | 'ALERTMANAGER' | 'CUSTOM';
  condition: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  channels: AlertChannel[];
}

export interface AlertChannel {
  type: 'EMAIL' | 'SLACK' | 'WEBHOOK' | 'PAGERDUTY' | 'CUSTOM';
  config: Record<string, any>;
}

export interface TrafficManagementConfig {
  virtualServices: VirtualServiceConfig[];
  destinationRules: DestinationRuleConfig[];
  gateways: GatewayConfig[];
  serviceEntries: ServiceEntryConfig[];
  envoyFilters: EnvoyFilterConfig[];
}

export interface VirtualServiceConfig {
  name: string;
  namespace: string;
  hosts: string[];
  gateways: string[];
  http: HTTPRoute[];
  tcp: TCPRoute[];
  tls: TLSRoute[];
}

export interface HTTPRoute {
  match: HTTPMatch[];
  route: HTTPRouteDestination[];
  redirect?: HTTPRedirect;
  rewrite?: HTTPRewrite;
  timeout?: string;
  retries?: RetryConfig;
  fault?: FaultConfig;
  mirror?: MirrorConfig;
  cors?: CorsPolicy;
  headers?: HeaderOperations;
}

export interface HTTPMatch {
  name: string;
  uri: StringMatch;
  scheme: string;
  method: string;
  authority: StringMatch;
  headers: HeaderMatch[];
  queryParams: QueryMatch[];
  ignoreUriCase: boolean;
}

export interface StringMatch {
  exact?: string;
  prefix?: string;
  regex?: string;
}

export interface HTTPRouteDestination {
  destination: Destination;
  weight: number;
  headers?: HeaderOperations;
}

export interface Destination {
  host: string;
  subset?: string;
  port: PortConfig;
}

export interface HTTPRedirect {
  uri: string;
  authority: string;
  redirectCode: number;
}

export interface HTTPRewrite {
  uri: string;
  authority: string;
}

export interface FaultConfig {
  delay?: DelayFault;
  abort?: AbortFault;
}

export interface DelayFault {
  percentage: number;
  fixedDelay: string;
  exponentialDelay: string;
}

export interface AbortFault {
  percentage: number;
  httpStatus: number;
  grpcStatus: number;
}

export interface MirrorConfig {
  host: string;
  subset?: string;
  port: PortConfig;
  percentage: number;
}

export interface CorsPolicy {
  allowOrigins: string[];
  allowMethods: string[];
  allowHeaders: string[];
  exposeHeaders: string[];
  maxAge: string;
  allowCredentials: boolean;
}

export interface HeaderOperations {
  request: HeaderManipulation;
  response: HeaderManipulation;
}

export interface HeaderManipulation {
  add: HeaderValue[];
  remove: string[];
  append: HeaderValue[];
  set: HeaderValue[];
}

export interface HeaderValue {
  name: string;
  value: string;
}

export interface TCPRoute {
  match: TCPMatch[];
  route: TCPRouteDestination[];
}

export interface TCPMatch {
  port: number;
  destinationSubnet: string;
  sourceSubnet: string;
  sourceLabels: Record<string, string>;
  gateways: string[];
}

export interface TCPRouteDestination {
  destination: Destination;
  weight: number;
}

export interface TLSRoute {
  match: TLSMatch[];
  route: TCPRouteDestination[];
}

export interface TLSMatch {
  port: number;
  sniHosts: string[];
  destinationSubnet: string;
  sourceSubnet: string[];
  sourceLabels: Record<string, string>;
  gateways: string[];
}

export interface DestinationRuleConfig {
  name: string;
  namespace: string;
  host: string;
  trafficPolicy: TrafficPolicyConfig;
  subsets: SubsetConfig[];
  exportTo: ExportToConfig;
}

export interface SubsetConfig {
  name: string;
  labels: Record<string, string>;
  trafficPolicy: TrafficPolicyConfig;
}

export interface ExportToConfig {
  to: string[];
  toNamespace: string[];
}

export interface EnvoyFilterConfig {
  name: string;
  namespace: string;
  configPatches: ConfigPatch[];
  workloadSelector: LabelSelector;
}

export interface ConfigPatch {
  applyTo: 'HTTP_FILTER' | 'NETWORK_FILTER' | 'CLUSTER' | 'LISTENER';
  match: MatchCondition;
  patch: Record<string, any>;
}

export interface MeshPolicy {
  id: string;
  name: string;
  type: 'AUTHENTICATION' | 'AUTHORIZATION' | 'TRAFFIC' | 'SECURITY' | 'OBSERVABILITY';
  config: Record<string, any>;
  status: 'active' | 'inactive' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceMeshMetrics {
  mesh: {
    totalServices: number;
    totalGateways: number;
    totalVirtualServices: number;
    totalDestinationRules: number;
    totalPolicies: number;
  };
  traffic: {
    totalRequests: number;
    successRate: number;
    averageLatency: number;
    errorRate: number;
    throughput: number;
  };
  security: {
    authenticationAttempts: number;
    authenticationSuccess: number;
    authorizationAttempts: number;
    authorizationSuccess: number;
    tlsConnections: number;
    securityViolations: number;
  };
  performance: {
    cpuUsage: number;
    memoryUsage: number;
    networkLatency: number;
    proxyLatency: number;
    connectionPool: ConnectionPoolMetrics;
  };
  observability: {
    traceSamples: number;
    metricsPoints: number;
    logEntries: number;
    alertCount: number;
  };
}

export interface ConnectionPoolMetrics {
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  averageConnectionTime: number;
}

export class ServiceMeshService {
  private serviceMeshes: Map<string, ServiceMesh> = new Map();
  private policies: Map<string, MeshPolicy> = new Map();
  private eventService = getEventService();

  constructor(private server: FastifyInstance) {
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeServiceMesh();
    this.startMeshMonitoring();
  }

  /**
   * Configurar middleware de service mesh
   */
  private setupMiddleware(): void {
    // Middleware para injeção de sidecar
    this.server.addHook('preHandler', async (request, reply) => {
      if (this.isMeshRequest(request)) {
        await this.handleSidecarInjection(request, reply);
      }
    });

    // Middleware para routing de tráfego
    this.server.addHook('preHandler', async (request, reply) => {
      if (this.isMeshRequest(request)) {
        await this.handleTrafficRouting(request, reply);
      }
    });

    // Middleware para segurança
    this.server.addHook('preValidation', async (request, reply) => {
      if (this.isMeshRequest(request)) {
        await this.handleMeshSecurity(request, reply);
      }
    });

    // Middleware para observabilidade
    this.server.addHook('onResponse', async (request, reply) => {
      if (this.isMeshRequest(request)) {
        await this.handleMeshObservability(request, reply);
      }
    });
  }

  /**
   * Configurar rotas de service mesh
   */
  private setupRoutes(): void {
    // Gerenciar Service Mesh
    this.server.post(
      '/admin/service-mesh',
      {
        schema: {
          description: 'Criar service mesh',
          tags: ['admin', 'service-mesh'],
          body: {
            type: 'object',
            required: ['name', 'provider', 'namespace'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              provider: {
                type: 'string',
                enum: ['istio', 'linkerd', 'consul', 'aws-app-mesh', 'custom'],
              },
              version: { type: 'string' },
              namespace: { type: 'string' },
              controlPlane: {
                type: 'object',
                properties: {
                  replicas: { type: 'number', minimum: 1 },
                  resources: {
                    type: 'object',
                    properties: {
                      cpu: {
                        type: 'object',
                        properties: {
                          request: { type: 'string' },
                          limit: { type: 'string' },
                        },
                      },
                      memory: {
                        type: 'object',
                        properties: {
                          request: { type: 'string' },
                          limit: { type: 'string' },
                        },
                      },
                    },
                  },
                  autoscaling: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      minReplicas: { type: 'number', minimum: 1 },
                      maxReplicas: { type: 'number', minimum: 1 },
                      targetCPU: { type: 'number', minimum: 1, maximum: 100 },
                      targetMemory: { type: 'number', minimum: 1, maximum: 100 },
                      scaleDownDelay: { type: 'number', minimum: 0 },
                    },
                  },
                  highAvailability: { type: 'boolean' },
                  backup: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      schedule: { type: 'string' },
                      retention: { type: 'number', minimum: 1 },
                      storage: { type: 'string' },
                      encryption: { type: 'boolean' },
                    },
                  },
                  monitoring: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      metrics: { type: 'array', items: { type: 'string' } },
                      alerts: { type: 'boolean' },
                      logging: { type: 'boolean' },
                      tracing: { type: 'boolean' },
                    },
                  },
                },
              },
              dataPlane: {
                type: 'object',
                properties: {
                  sidecar: {
                    type: 'object',
                    properties: {
                      image: { type: 'string' },
                      version: { type: 'string' },
                      resources: {
                        type: 'object',
                        properties: {
                          cpu: {
                            type: 'object',
                            properties: {
                              request: { type: 'string' },
                              limit: { type: 'string' },
                            },
                          },
                          memory: {
                            type: 'object',
                            properties: {
                              request: { type: 'string' },
                              limit: { type: 'string' },
                            },
                          },
                        },
                      },
                      proxy: {
                        type: 'object',
                        properties: {
                          type: {
                            type: 'string',
                            enum: ['envoy', 'linkerd-proxy', 'nginx', 'haproxy'],
                          },
                          config: { type: 'object' },
                          listeners: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                name: { type: 'string' },
                                address: { type: 'string' },
                                port: { type: 'number' },
                                protocol: {
                                  type: 'string',
                                  enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'],
                                },
                                filters: {
                                  type: 'array',
                                  items: {
                                    type: 'object',
                                    properties: {
                                      name: { type: 'string' },
                                      type: { type: 'string' },
                                      config: { type: 'object' },
                                      order: { type: 'number' },
                                    },
                                  },
                                },
                              },
                            },
                          },
                          clusters: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                name: { type: 'string' },
                                type: {
                                  type: 'string',
                                  enum: ['STRICT_DNS', 'LOGICAL_DNS', 'STATIC', 'EDS'],
                                },
                                endpoints: {
                                  type: 'array',
                                  items: {
                                    type: 'object',
                                    properties: {
                                      address: { type: 'string' },
                                      port: { type: 'number' },
                                      weight: { type: 'number', minimum: 1 },
                                      healthCheck: {
                                        type: 'object',
                                        properties: {
                                          enabled: { type: 'boolean' },
                                          path: { type: 'string' },
                                          interval: { type: 'number' },
                                          timeout: { type: 'number' },
                                          unhealthyThreshold: { type: 'number' },
                                          healthyThreshold: { type: 'number' },
                                        },
                                      },
                                    },
                                  },
                                },
                                loadBalancing: {
                                  type: 'object',
                                  properties: {
                                    type: {
                                      type: 'string',
                                      enum: [
                                        'ROUND_ROBIN',
                                        'LEAST_CONN',
                                        'RANDOM',
                                        'RING_HASH',
                                        'MAGLEV',
                                      ],
                                    },
                                    healthyThreshold: { type: 'number', minimum: 1 },
                                    unhealthyThreshold: { type: 'number', minimum: 1 },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  injection: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      automatic: { type: 'boolean' },
                      labelSelector: {
                        type: 'object',
                        properties: {
                          matchLabels: { type: 'object' },
                          matchExpressions: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                key: { type: 'string' },
                                operator: {
                                  type: 'string',
                                  enum: ['Exists', 'DoesNotExist', 'In', 'NotIn'],
                                },
                                values: { type: 'array', items: { type: 'string' } },
                              },
                            },
                          },
                        },
                      },
                      excludedNamespaces: { type: 'array', items: { type: 'string' } },
                      template: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          type: { type: 'string', enum: ['sidecar', 'initContainer'] },
                          image: { type: 'string' },
                          resources: {
                            type: 'object',
                            properties: {
                              cpu: {
                                type: 'object',
                                properties: {
                                  request: { type: 'string' },
                                  limit: { type: 'string' },
                                },
                              },
                              memory: {
                                type: 'object',
                                properties: {
                                  request: { type: 'string' },
                                  limit: { type: 'string' },
                                },
                              },
                            },
                          },
                          env: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                name: { type: 'string' },
                                value: { type: 'string' },
                                valueFrom: {
                                  type: 'object',
                                  properties: {
                                    fieldRef: {
                                      type: 'object',
                                      properties: {
                                        fieldPath: { type: 'string' },
                                        apiVersion: { type: 'string' },
                                      },
                                    },
                                    configMapKeyRef: {
                                      type: 'object',
                                      properties: {
                                        name: { type: 'string' },
                                        key: { type: 'string' },
                                      },
                                    },
                                    secretKeyRef: {
                                      type: 'object',
                                      properties: {
                                        name: { type: 'string' },
                                        key: { type: 'string' },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                          volumeMounts: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                name: { type: 'string' },
                                mountPath: { type: 'string' },
                                readOnly: { type: 'boolean' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  networking: {
                    type: 'object',
                    properties: {
                      mtls: {
                        type: 'object',
                        properties: {
                          mode: {
                            type: 'string',
                            enum: ['DISABLE', 'ISTIO_MUTUAL', 'STRICT', 'PERMISSIVE'],
                          },
                          credentialName: { type: 'string' },
                          destinationRule: { type: 'string' },
                          minProtocolVersion: { type: 'string' },
                          maxProtocolVersion: { type: 'string' },
                        },
                      },
                      trafficPolicy: {
                        type: 'object',
                        properties: {
                          connectionPool: {
                            type: 'object',
                            properties: {
                              tcp: {
                                type: 'object',
                                properties: {
                                  maxConnections: { type: 'number', minimum: 1 },
                                  connectTimeout: { type: 'string' },
                                  keepAlive: {
                                    type: 'object',
                                    properties: {
                                      interval: { type: 'string' },
                                      timeout: { type: 'string' },
                                      probes: { type: 'number', minimum: 1 },
                                    },
                                  },
                                },
                              },
                              http: {
                                type: 'object',
                                properties: {
                                  http1MaxPendingRequests: { type: 'number', minimum: 1 },
                                  http2MaxRequests: { type: 'number', minimum: 1 },
                                  maxRequestsPerConnection: { type: 'number', minimum: 1 },
                                  maxRetries: { type: 'number', minimum: 0 },
                                  idleTimeout: { type: 'string' },
                                  h2UpgradePolicy: { type: 'string' },
                                },
                              },
                            },
                          },
                          loadBalancer: {
                            type: 'object',
                            properties: {
                              simple: {
                                type: 'object',
                                properties: {
                                  algorithm: {
                                    type: 'string',
                                    enum: ['ROUND_ROBIN', 'LEAST_CONN', 'RANDOM'],
                                  },
                                },
                              },
                              consistentHash: {
                                type: 'object',
                                properties: {
                                  httpCookie: {
                                    type: 'object',
                                    properties: {
                                      name: { type: 'string' },
                                      path: { type: 'string' },
                                      ttl: { type: 'string' },
                                    },
                                  },
                                  useSourceIp: { type: 'boolean' },
                                  httpHeaderName: { type: 'string' },
                                  httpQueryParameterName: { type: 'string' },
                                  minimumRingSize: { type: 'number', minimum: 1 },
                                },
                              },
                              localityLb: {
                                type: 'object',
                                properties: {
                                  failover: {
                                    type: 'array',
                                    items: {
                                      type: 'object',
                                      properties: {
                                        from: { type: 'string' },
                                        to: { type: 'string' },
                                      },
                                    },
                                  },
                                  distribute: {
                                    type: 'array',
                                    items: {
                                      type: 'object',
                                      properties: {
                                        from: { type: 'string' },
                                        to: { type: 'string' },
                                        weight: { type: 'number', minimum: 1 },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                          circuitBreaker: {
                            type: 'object',
                            properties: {
                              consecutiveErrors: { type: 'number', minimum: 1 },
                              interval: { type: 'string' },
                              baseEjectionTime: { type: 'string' },
                              maxEjectionPercent: { type: 'number', minimum: 0, maximum: 100 },
                              minHealthPercent: { type: 'number', minimum: 0, maximum: 100 },
                            },
                          },
                          timeout: {
                            type: 'object',
                            properties: {
                              http: { type: 'string' },
                              tcp: { type: 'string' },
                            },
                          },
                          retry: {
                            type: 'object',
                            properties: {
                              attempts: { type: 'number', minimum: 1 },
                              perTryTimeout: { type: 'string' },
                              retryOn: { type: 'array', items: { type: 'string' } },
                            },
                          },
                        },
                      },
                      serviceEntries: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            hosts: { type: 'array', items: { type: 'string' } },
                            location: { type: 'string' },
                            ports: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  number: { type: 'number' },
                                  protocol: {
                                    type: 'string',
                                    enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'],
                                  },
                                  name: { type: 'string' },
                                },
                              },
                            },
                            resolution: { type: 'string', enum: ['DNS', 'STATIC'] },
                            endpoints: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  address: { type: 'string' },
                                  port: { type: 'number' },
                                  weight: { type: 'number', minimum: 1 },
                                  healthCheck: {
                                    type: 'object',
                                    properties: {
                                      enabled: { type: 'boolean' },
                                      path: { type: 'string' },
                                      interval: { type: 'number' },
                                      timeout: { type: 'number' },
                                      unhealthyThreshold: { type: 'number' },
                                      healthyThreshold: { type: 'number' },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                      gateways: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            selector: {
                              type: 'object',
                              properties: {
                                matchLabels: { type: 'object' },
                                matchExpressions: {
                                  type: 'array',
                                  items: {
                                    type: 'object',
                                    properties: {
                                      key: { type: 'string' },
                                      operator: {
                                        type: 'string',
                                        enum: ['Exists', 'DoesNotExist', 'In', 'NotIn'],
                                      },
                                      values: { type: 'array', items: { type: 'string' } },
                                    },
                                  },
                                },
                              },
                            },
                            servers: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  hosts: { type: 'array', items: { type: 'string' } },
                                  port: {
                                    type: 'object',
                                    properties: {
                                      number: { type: 'number' },
                                      protocol: {
                                        type: 'string',
                                        enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'],
                                      },
                                      name: { type: 'string' },
                                    },
                                  },
                                  tls: {
                                    type: 'object',
                                    properties: {
                                      mode: {
                                        type: 'string',
                                        enum: ['SIMPLE', 'MUTUAL', 'DISABLE'],
                                      },
                                      credentialName: { type: 'string' },
                                      minProtocolVersion: { type: 'string' },
                                      maxProtocolVersion: { type: 'string' },
                                    },
                                  },
                                },
                              },
                            },
                            tls: {
                              type: 'object',
                              properties: {
                                mode: { type: 'string', enum: ['SIMPLE', 'MUTUAL', 'DISABLE'] },
                                credentialName: { type: 'string' },
                                minProtocolVersion: { type: 'string' },
                                maxProtocolVersion: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  performance: {
                    type: 'object',
                    properties: {
                      proxy: {
                        type: 'object',
                        properties: {
                          concurrency: { type: 'number', minimum: 1 },
                          bufferLimit: { type: 'number', minimum: 1 },
                          stackSize: { type: 'string' },
                          drainDuration: { type: 'string' },
                          parentShutdownGracePeriod: { type: 'string' },
                        },
                      },
                      networking: {
                        type: 'object',
                        properties: {
                          connectionTimeout: { type: 'string' },
                          connectTimeout: { type: 'string' },
                          maxRequestsPerConnection: { type: 'number', minimum: 1 },
                          http2MaxRequests: { type: 'number', minimum: 1 },
                          idleTimeout: { type: 'string' },
                        },
                      },
                      resources: {
                        type: 'object',
                        properties: {
                          cpu: {
                            type: 'object',
                            properties: {
                              request: { type: 'string' },
                              limit: { type: 'string' },
                            },
                          },
                          memory: {
                            type: 'object',
                            properties: {
                              request: { type: 'string' },
                              limit: { type: 'string' },
                            },
                          },
                          disk: {
                            type: 'object',
                            properties: {
                              request: { type: 'string' },
                              limit: { type: 'string' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              security: {
                type: 'object',
                properties: {
                  authentication: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      providers: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            type: {
                              type: 'string',
                              enum: ['JWT', 'OIDC', 'MTLS', 'API_KEY', 'CUSTOM'],
                            },
                            config: { type: 'object' },
                          },
                        },
                      },
                      policies: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            selector: {
                              type: 'object',
                              properties: {
                                matchLabels: { type: 'object' },
                                matchExpressions: {
                                  type: 'array',
                                  items: {
                                    type: 'object',
                                    properties: {
                                      key: { type: 'string' },
                                      operator: {
                                        type: 'string',
                                        enum: ['Exists', 'DoesNotExist', 'In', 'NotIn'],
                                      },
                                      values: { type: 'array', items: { type: 'string' } },
                                    },
                                  },
                                },
                              },
                            },
                            providers: { type: 'array', items: { type: 'string' } },
                            action: { type: 'string', enum: ['ALLOW', 'DENY'] },
                            rules: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  match: {
                                    type: 'object',
                                    properties: {
                                      headers: {
                                        type: 'array',
                                        items: {
                                          type: 'object',
                                          properties: {
                                            name: { type: 'string' },
                                            exact: { type: 'string' },
                                            prefix: { type: 'string' },
                                            suffix: { type: 'string' },
                                            regex: { type: 'string' },
                                          },
                                        },
                                      },
                                      queryParams: {
                                        type: 'array',
                                        items: {
                                          type: 'object',
                                          properties: {
                                            name: { type: 'string' },
                                            exact: { type: 'string' },
                                            regex: { type: 'string' },
                                          },
                                        },
                                      },
                                      withoutHeaders: {
                                        type: 'array',
                                        items: {
                                          type: 'object',
                                          properties: {
                                            name: { type: 'string' },
                                            exact: { type: 'string' },
                                            prefix: { type: 'string' },
                                            suffix: { type: 'string' },
                                            regex: { type: 'string' },
                                          },
                                        },
                                      },
                                      sourceLabels: { type: 'object' },
                                    },
                                  },
                                  requires: {
                                    type: 'array',
                                    items: {
                                      type: 'object',
                                      properties: {
                                        issuer: { type: 'string' },
                                        audiences: { type: 'array', items: { type: 'string' } },
                                        any: { type: 'boolean' },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  authorization: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      mode: { type: 'string', enum: ['ALLOW_ANY', 'DENY_ANY', 'RBAC'] },
                      policies: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            selector: {
                              type: 'object',
                              properties: {
                                matchLabels: { type: 'object' },
                                matchExpressions: {
                                  type: 'array',
                                  items: {
                                    type: 'object',
                                    properties: {
                                      key: { type: 'string' },
                                      operator: {
                                        type: 'string',
                                        enum: ['Exists', 'DoesNotExist', 'In', 'NotIn'],
                                      },
                                      values: { type: 'array', items: { type: 'string' } },
                                    },
                                  },
                                },
                              },
                            },
                            action: { type: 'string', enum: ['ALLOW', 'DENY'] },
                            rules: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  from: {
                                    type: 'array',
                                    items: {
                                      type: 'object',
                                      properties: {
                                        principals: { type: 'array', items: { type: 'string' } },
                                        requestPrincipals: {
                                          type: 'array',
                                          items: { type: 'string' },
                                        },
                                      },
                                    },
                                  },
                                  to: {
                                    type: 'array',
                                    items: {
                                      type: 'object',
                                      properties: {
                                        notPrincipals: { type: 'array', items: { type: 'string' } },
                                        namespaces: { type: 'array', items: { type: 'string' } },
                                        methods: { type: 'array', items: { type: 'string' } },
                                        paths: { type: 'array', items: { type: 'string' } },
                                      },
                                    },
                                  },
                                  when: {
                                    type: 'array',
                                    items: {
                                      type: 'object',
                                      properties: {
                                        key: { type: 'string' },
                                        values: { type: 'array', items: { type: 'string' } },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  rbac: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      serviceRoles: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            namespace: { type: 'string' },
                            rules: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  verbs: { type: 'array', items: { type: 'string' } },
                                  resources: { type: 'array', items: { type: 'string' } },
                                  apiGroups: { type: 'array', items: { type: 'string' } },
                                },
                              },
                            },
                          },
                        },
                      },
                      clusterRoles: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            rules: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  verbs: { type: 'array', items: { type: 'string' } },
                                  resources: { type: 'array', items: { type: 'string' } },
                                  apiGroups: { type: 'array', items: { type: 'string' } },
                                },
                              },
                            },
                          },
                        },
                      },
                      bindings: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            namespace: { type: 'string' },
                            roleRef: {
                              type: 'object',
                              properties: {
                                kind: { type: 'string', enum: ['Role', 'ClusterRole'] },
                                name: { type: 'string' },
                              },
                            },
                            subjects: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  kind: {
                                    type: 'string',
                                    enum: ['User', 'Group', 'ServiceAccount'],
                                  },
                                  name: { type: 'string' },
                                  namespace: { type: 'string' },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  jwt: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      providers: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            issuer: { type: 'string' },
                            audiences: { type: 'array', items: { type: 'string' } },
                            jwksUri: { type: 'string' },
                            cacheDuration: { type: 'string' },
                          },
                        },
                      },
                      policies: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            selector: {
                              type: 'object',
                              properties: {
                                matchLabels: { type: 'object' },
                                matchExpressions: {
                                  type: 'array',
                                  items: {
                                    type: 'object',
                                    properties: {
                                      key: { type: 'string' },
                                      operator: {
                                        type: 'string',
                                        enum: ['Exists', 'DoesNotExist', 'In', 'NotIn'],
                                      },
                                      values: { type: 'array', items: { type: 'string' } },
                                    },
                                  },
                                },
                              },
                            },
                            origins: { type: 'array', items: { type: 'string' } },
                            principal: { type: 'string' },
                            audiences: { type: 'array', items: { type: 'string' } },
                          },
                        },
                      },
                    },
                  },
                  certificates: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      providers: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            type: {
                              type: 'string',
                              enum: ['FILE', 'K8S', 'VAULT', 'AWS', 'CUSTOM'],
                            },
                            config: { type: 'object' },
                          },
                        },
                      },
                      rotation: {
                        type: 'object',
                        properties: {
                          enabled: { type: 'boolean' },
                          interval: { type: 'string' },
                          gracePeriod: { type: 'string' },
                          retryCount: { type: 'number', minimum: 1 },
                        },
                      },
                      validation: {
                        type: 'object',
                        properties: {
                          enabled: { type: 'boolean' },
                          trustDomain: { type: 'string' },
                          caBundle: { type: 'string' },
                          verifySubject: { type: 'boolean' },
                        },
                      },
                    },
                  },
                },
              },
              observability: {
                type: 'object',
                properties: {
                  tracing: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      provider: {
                        type: 'string',
                        enum: ['jaeger', 'zipkin', 'tempo', 'lightstep', 'custom'],
                      },
                      sampling: {
                        type: 'object',
                        properties: {
                          type: { type: 'string', enum: ['PROBABILISTIC', 'RATE_LIMITING', 'OFF'] },
                          percentage: { type: 'number', minimum: 0, maximum: 100 },
                          rateLimit: {
                            type: 'object',
                            properties: {
                              serverMin: { type: 'number', minimum: 1 },
                              serverMax: { type: 'number', minimum: 1 },
                              clientMin: { type: 'number', minimum: 1 },
                              clientMax: { type: 'number', minimum: 1 },
                            },
                          },
                        },
                      },
                      propagation: {
                        type: 'object',
                        properties: {
                          b3: { type: 'boolean' },
                          w3c: { type: 'boolean' },
                          zipkin: { type: 'boolean' },
                          jaeger: { type: 'boolean' },
                          custom: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                name: { type: 'string' },
                                header: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  metrics: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      providers: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            type: {
                              type: 'string',
                              enum: ['PROMETHEUS', 'STATSD', 'DATADOG', 'NEW_RELIC', 'CUSTOM'],
                            },
                            config: { type: 'object' },
                          },
                        },
                      },
                      prometheus: {
                        type: 'object',
                        properties: {
                          enabled: { type: 'boolean' },
                          endpoint: { type: 'string' },
                          port: { type: 'number' },
                          path: { type: 'string' },
                          metrics: { type: 'array', items: { type: 'string' } },
                        },
                      },
                      statsd: {
                        type: 'object',
                        properties: {
                          enabled: { type: 'boolean' },
                          address: { type: 'string' },
                          port: { type: 'number' },
                          prefix: { type: 'string' },
                        },
                      },
                    },
                  },
                  logging: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      level: { type: 'string', enum: ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'] },
                      format: { type: 'string', enum: ['JSON', 'TEXT'] },
                      providers: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            type: {
                              type: 'string',
                              enum: ['FILE', 'STDOUT', 'ELASTICSEARCH', 'FLUENTD', 'CUSTOM'],
                            },
                            config: { type: 'object' },
                          },
                        },
                      },
                      filters: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            type: {
                              type: 'string',
                              enum: ['LEVEL', 'COMPONENT', 'HEADER', 'CUSTOM'],
                            },
                            config: { type: 'object' },
                          },
                        },
                      },
                    },
                  },
                  monitoring: {
                    type: 'object',
                    properties: {
                      enabled: { type: 'boolean' },
                      dashboards: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            type: { type: 'string', enum: ['GRAFANA', 'KIBANA', 'CUSTOM'] },
                            url: { type: 'string' },
                            refresh: { type: 'string' },
                          },
                        },
                      },
                      alerts: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            type: {
                              type: 'string',
                              enum: ['PROMETHEUS', 'ALERTMANAGER', 'CUSTOM'],
                            },
                            condition: { type: 'string' },
                            severity: {
                              type: 'string',
                              enum: ['INFO', 'WARNING', 'ERROR', 'CRITICAL'],
                            },
                            channels: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  type: {
                                    type: 'string',
                                    enum: ['EMAIL', 'SLACK', 'WEBHOOK', 'PAGERDUTY', 'CUSTOM'],
                                  },
                                  config: { type: 'object' },
                                },
                              },
                            },
                          },
                        },
                      },
                      healthChecks: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            type: {
                              type: 'string',
                              enum: ['storage', 'processing', 'network', 'security', 'performance'],
                            },
                            config: { type: 'object' },
                          },
                        },
                      },
                    },
                  },
                },
              },
              traffic: {
                type: 'object',
                properties: {
                  virtualServices: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        namespace: { type: 'string' },
                        hosts: { type: 'array', items: { type: 'string' } },
                        gateways: { type: 'array', items: { type: 'string' } },
                        http: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              match: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    name: { type: 'string' },
                                    uri: {
                                      type: 'object',
                                      properties: {
                                        exact: { type: 'string' },
                                        prefix: { type: 'string' },
                                        regex: { type: 'string' },
                                      },
                                    },
                                    scheme: { type: 'string' },
                                    method: { type: 'string' },
                                    authority: {
                                      type: 'object',
                                      properties: {
                                        exact: { type: 'string' },
                                        prefix: { type: 'string' },
                                        regex: { type: 'string' },
                                      },
                                    },
                                    headers: {
                                      type: 'array',
                                      items: {
                                        type: 'object',
                                        properties: {
                                          name: { type: 'string' },
                                          exact: { type: 'string' },
                                          prefix: { type: 'string' },
                                          suffix: { type: 'string' },
                                          regex: { type: 'string' },
                                        },
                                      },
                                    },
                                    queryParams: {
                                      type: 'array',
                                      items: {
                                        type: 'object',
                                        properties: {
                                          name: { type: 'string' },
                                          exact: { type: 'string' },
                                          regex: { type: 'string' },
                                        },
                                      },
                                    },
                                    ignoreUriCase: { type: 'boolean' },
                                  },
                                },
                              },
                              route: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    destination: {
                                      type: 'object',
                                      properties: {
                                        host: { type: 'string' },
                                        subset: { type: 'string' },
                                        port: {
                                          type: 'object',
                                          properties: {
                                            number: { type: 'number' },
                                            protocol: {
                                              type: 'string',
                                              enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'],
                                            },
                                            name: { type: 'string' },
                                          },
                                        },
                                      },
                                    },
                                    weight: { type: 'number', minimum: 1 },
                                    headers: {
                                      type: 'object',
                                      properties: {
                                        request: {
                                          type: 'object',
                                          properties: {
                                            add: {
                                              type: 'array',
                                              items: {
                                                type: 'object',
                                                properties: {
                                                  name: { type: 'string' },
                                                  value: { type: 'string' },
                                                },
                                              },
                                            },
                                            remove: { type: 'array', items: { type: 'string' } },
                                            append: {
                                              type: 'array',
                                              items: {
                                                type: 'object',
                                                properties: {
                                                  name: { type: 'string' },
                                                  value: { type: 'string' },
                                                },
                                              },
                                            },
                                            set: {
                                              type: 'array',
                                              items: {
                                                type: 'object',
                                                properties: {
                                                  name: { type: 'string' },
                                                  value: { type: 'string' },
                                                },
                                              },
                                            },
                                          },
                                        },
                                        response: {
                                          type: 'object',
                                          properties: {
                                            add: {
                                              type: 'array',
                                              items: {
                                                type: 'object',
                                                properties: {
                                                  name: { type: 'string' },
                                                  value: { type: 'string' },
                                                },
                                              },
                                            },
                                            remove: { type: 'array', items: { type: 'string' } },
                                            append: {
                                              type: 'array',
                                              items: {
                                                type: 'object',
                                                properties: {
                                                  name: { type: 'string' },
                                                  value: { type: 'string' },
                                                },
                                              },
                                            },
                                            set: {
                                              type: 'array',
                                              items: {
                                                type: 'object',
                                                properties: {
                                                  name: { type: 'string' },
                                                  value: { type: 'string' },
                                                },
                                              },
                                            },
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                              redirect: {
                                type: 'object',
                                properties: {
                                  uri: { type: 'string' },
                                  authority: { type: 'string' },
                                  redirectCode: { type: 'number' },
                                },
                              },
                              rewrite: {
                                type: 'object',
                                properties: {
                                  uri: { type: 'string' },
                                  authority: { type: 'string' },
                                },
                              },
                              timeout: { type: 'string' },
                              retries: {
                                type: 'object',
                                properties: {
                                  attempts: { type: 'number', minimum: 1 },
                                  perTryTimeout: { type: 'string' },
                                  retryOn: { type: 'array', items: { type: 'string' } },
                                },
                              },
                              fault: {
                                type: 'object',
                                properties: {
                                  delay: {
                                    type: 'object',
                                    properties: {
                                      percentage: { type: 'number', minimum: 0, maximum: 100 },
                                      fixedDelay: { type: 'string' },
                                      exponentialDelay: { type: 'string' },
                                    },
                                  },
                                  abort: {
                                    type: 'object',
                                    properties: {
                                      percentage: { type: 'number', minimum: 0, maximum: 100 },
                                      httpStatus: { type: 'number' },
                                      grpcStatus: { type: 'number' },
                                    },
                                  },
                                },
                              },
                              mirror: {
                                type: 'object',
                                properties: {
                                  host: { type: 'string' },
                                  subset: { type: 'string' },
                                  port: {
                                    type: 'object',
                                    properties: {
                                      number: { type: 'number' },
                                      protocol: {
                                        type: 'string',
                                        enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'],
                                      },
                                      name: { type: 'string' },
                                    },
                                  },
                                  percentage: { type: 'number', minimum: 0, maximum: 100 },
                                },
                              },
                              cors: {
                                type: 'object',
                                properties: {
                                  allowOrigins: { type: 'array', items: { type: 'string' } },
                                  allowMethods: { type: 'array', items: { type: 'string' } },
                                  allowHeaders: { type: 'array', items: { type: 'string' } },
                                  exposeHeaders: { type: 'array', items: { type: 'string' } },
                                  maxAge: { type: 'string' },
                                  allowCredentials: { type: 'boolean' },
                                },
                              },
                            },
                          },
                        },
                      },
                      tcp: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            match: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  port: { type: 'number' },
                                  destinationSubnet: { type: 'string' },
                                  sourceSubnet: { type: 'string' },
                                  sourceLabels: { type: 'object' },
                                  gateways: { type: 'array', items: { type: 'string' } },
                                },
                              },
                            },
                            route: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  destination: {
                                    type: 'object',
                                    properties: {
                                      host: { type: 'string' },
                                      subset: { type: 'string' },
                                      port: {
                                        type: 'object',
                                        properties: {
                                          number: { type: 'number' },
                                          protocol: {
                                            type: 'string',
                                            enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'],
                                          },
                                          name: { type: 'string' },
                                        },
                                      },
                                    },
                                  },
                                  weight: { type: 'number', minimum: 1 },
                                },
                              },
                            },
                          },
                        },
                      },
                      tls: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            match: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  port: { type: 'number' },
                                  sniHosts: { type: 'array', items: { type: 'string' } },
                                  destinationSubnet: { type: 'string' },
                                  sourceSubnet: { type: 'string' },
                                  sourceLabels: { type: 'object' },
                                  gateways: { type: 'array', items: { type: 'string' } },
                                },
                              },
                            },
                            route: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  destination: {
                                    type: 'object',
                                    properties: {
                                      host: { type: 'string' },
                                      subset: { type: 'string' },
                                      port: {
                                        type: 'object',
                                        properties: {
                                          number: { type: 'number' },
                                          protocol: {
                                            type: 'string',
                                            enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'],
                                          },
                                          name: { type: 'string' },
                                        },
                                      },
                                    },
                                  },
                                  weight: { type: 'number', minimum: 1 },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  destinationRules: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        namespace: { type: 'string' },
                        host: { type: 'string' },
                        trafficPolicy: { $ref: '#/definitions/TrafficPolicyConfig' },
                        subsets: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              name: { type: 'string' },
                              labels: { type: 'object' },
                              trafficPolicy: { $ref: '#/definitions/TrafficPolicyConfig' },
                            },
                          },
                        },
                        exportTo: {
                          type: 'object',
                          properties: {
                            to: { type: 'array', items: { type: 'string' } },
                            toNamespace: { type: 'array', items: { type: 'string' } },
                          },
                        },
                      },
                    },
                  },
                  gateways: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        selector: {
                          type: 'object',
                          properties: {
                            matchLabels: { type: 'object' },
                            matchExpressions: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  key: { type: 'string' },
                                  operator: {
                                    type: 'string',
                                    enum: ['Exists', 'DoesNotExist', 'In', 'NotIn'],
                                  },
                                  values: { type: 'array', items: { type: 'string' } },
                                },
                              },
                            },
                          },
                        },
                        servers: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              hosts: { type: 'array', items: { type: 'string' } },
                              port: {
                                type: 'object',
                                properties: {
                                  number: { type: 'number' },
                                  protocol: {
                                    type: 'string',
                                    enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'],
                                  },
                                  name: { type: 'string' },
                                },
                              },
                              tls: {
                                type: 'object',
                                properties: {
                                  mode: { type: 'string', enum: ['SIMPLE', 'MUTUAL', 'DISABLE'] },
                                  credentialName: { type: 'string' },
                                  minProtocolVersion: { type: 'string' },
                                  maxProtocolVersion: { type: 'string' },
                                },
                              },
                            },
                          },
                        },
                        tls: {
                          type: 'object',
                          properties: {
                            mode: { type: 'string', enum: ['SIMPLE', 'MUTUAL', 'DISABLE'] },
                            credentialName: { type: 'string' },
                            minProtocolVersion: { type: 'string' },
                            maxProtocolVersion: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                  serviceEntries: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        hosts: { type: 'array', items: { type: 'string' } },
                        location: { type: 'string' },
                        ports: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              number: { type: 'number' },
                              protocol: { type: 'string', enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'] },
                              name: { type: 'string' },
                            },
                          },
                        },
                        resolution: { type: 'string', enum: ['DNS', 'STATIC'] },
                        endpoints: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              address: { type: 'string' },
                              port: { type: 'number' },
                              weight: { type: 'number', minimum: 1 },
                              healthCheck: {
                                type: 'object',
                                properties: {
                                  enabled: { type: 'boolean' },
                                  path: { type: 'string' },
                                  interval: { type: 'number' },
                                  timeout: { type: 'number' },
                                  unhealthyThreshold: { type: 'number' },
                                  healthyThreshold: { type: 'number' },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  envoyFilters: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        namespace: { type: 'string' },
                        configPatches: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              applyTo: {
                                type: 'string',
                                enum: ['HTTP_FILTER', 'NETWORK_FILTER', 'CLUSTER', 'LISTENER'],
                              },
                              match: { $ref: '#/definitions/MatchCondition' },
                              patch: { type: 'object' },
                            },
                          },
                        },
                        workloadSelector: {
                          type: 'object',
                          properties: {
                            matchLabels: { type: 'object' },
                            matchExpressions: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  key: { type: 'string' },
                                  operator: {
                                    type: 'string',
                                    enum: ['Exists', 'DoesNotExist', 'In', 'NotIn'],
                                  },
                                  values: { type: 'array', items: { type: 'string' } },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              policies: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    type: {
                      type: 'string',
                      enum: [
                        'AUTHENTICATION',
                        'AUTHORIZATION',
                        'TRAFFIC',
                        'SECURITY',
                        'OBSERVABILITY',
                      ],
                    },
                    config: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const meshData = request.body as any;

        try {
          const serviceMesh = await this.createServiceMesh(meshData);
          reply.status(201).send(serviceMesh);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create service mesh' });
        }
      }
    );

    // Listar Service Meshes
    this.server.get(
      '/admin/service-mesh',
      {
        schema: {
          description: 'Listar service meshes',
          tags: ['admin', 'service-mesh'],
          querystring: {
            type: 'object',
            properties: {
              provider: {
                type: 'string',
                enum: ['istio', 'linkerd', 'consul', 'aws-app-mesh', 'custom'],
              },
              status: { type: 'string', enum: ['active', 'inactive', 'error', 'upgrading'] },
            },
          },
        },
      },
      async (request, reply) => {
        const { provider, status } = request.query as any;
        const meshes = await this.listServiceMeshes({ provider, status });
        reply.send({ meshes });
      }
    );

    // Gerenciar Políticas
    this.server.post(
      '/admin/service-mesh/:meshId/policies',
      {
        schema: {
          description: 'Criar política do service mesh',
          tags: ['admin', 'service-mesh'],
          params: {
            type: 'object',
            properties: {
              meshId: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['name', 'type', 'config'],
            properties: {
              name: { type: 'string' },
              type: {
                type: 'string',
                enum: ['AUTHENTICATION', 'AUTHORIZATION', 'TRAFFIC', 'SECURITY', 'OBSERVABILITY'],
              },
              config: { type: 'object' },
            },
          },
        },
      },
      async (request, reply) => {
        const { meshId } = request.params as { meshId: string };
        const policyData = request.body as any;

        try {
          const policy = await this.createMeshPolicy(meshId, policyData);
          reply.status(201).send(policy);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create mesh policy' });
        }
      }
    );

    // Configurar Virtual Services
    this.server.post(
      '/admin/service-mesh/:meshId/virtual-services',
      {
        schema: {
          description: 'Configurar virtual services',
          tags: ['admin', 'service-mesh'],
          params: {
            type: 'object',
            properties: {
              meshId: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['name', 'hosts'],
            properties: {
              name: { type: 'string' },
              namespace: { type: 'string' },
              hosts: { type: 'array', items: { type: 'string' } },
              gateways: { type: 'array', items: { type: 'string' } },
              http: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    match: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          uri: {
                            type: 'object',
                            properties: {
                              exact: { type: 'string' },
                              prefix: { type: 'string' },
                              regex: { type: 'string' },
                            },
                          },
                          scheme: { type: 'string' },
                          method: { type: 'string' },
                          authority: {
                            type: 'object',
                            properties: {
                              exact: { type: 'string' },
                              prefix: { type: 'string' },
                              regex: { type: 'string' },
                            },
                          },
                          headers: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                name: { type: 'string' },
                                exact: { type: 'string' },
                                prefix: { type: 'string' },
                                suffix: { type: 'string' },
                                regex: { type: 'string' },
                              },
                            },
                          },
                          queryParams: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                name: { type: 'string' },
                                exact: { type: 'string' },
                                regex: { type: 'string' },
                              },
                            },
                          },
                          ignoreUriCase: { type: 'boolean' },
                        },
                      },
                    },
                    route: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          destination: {
                            type: 'object',
                            properties: {
                              host: { type: 'string' },
                              subset: { type: 'string' },
                              port: {
                                type: 'object',
                                properties: {
                                  number: { type: 'number' },
                                  protocol: {
                                    type: 'string',
                                    enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'],
                                  },
                                  name: { type: 'string' },
                                },
                              },
                            },
                          },
                          weight: { type: 'number', minimum: 1 },
                          headers: {
                            type: 'object',
                            properties: {
                              request: {
                                type: 'object',
                                properties: {
                                  add: {
                                    type: 'array',
                                    items: {
                                      type: 'object',
                                      properties: {
                                        name: { type: 'string' },
                                        value: { type: 'string' },
                                      },
                                    },
                                  },
                                  remove: { type: 'array', items: { type: 'string' } },
                                  append: {
                                    type: 'array',
                                    items: {
                                      type: 'object',
                                      properties: {
                                        name: { type: 'string' },
                                        value: { type: 'string' },
                                      },
                                    },
                                  },
                                  set: {
                                    type: 'array',
                                    items: {
                                      type: 'object',
                                      properties: {
                                        name: { type: 'string' },
                                        value: { type: 'string' },
                                      },
                                    },
                                  },
                                },
                              },
                              response: {
                                type: 'object',
                                properties: {
                                  add: {
                                    type: 'array',
                                    items: {
                                      type: 'object',
                                      properties: {
                                        name: { type: 'string' },
                                        value: { type: 'string' },
                                      },
                                    },
                                  },
                                  remove: { type: 'array', items: { type: 'string' } },
                                  append: {
                                    type: 'array',
                                    items: {
                                      type: 'object',
                                      properties: {
                                        name: { type: 'string' },
                                        value: { type: 'string' },
                                      },
                                    },
                                  },
                                  set: {
                                    type: 'array',
                                    items: {
                                      type: 'object',
                                      properties: {
                                        name: { type: 'string' },
                                        value: { type: 'string' },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                    timeout: { type: 'string' },
                    retries: {
                      type: 'object',
                      properties: {
                        attempts: { type: 'number', minimum: 1 },
                        perTryTimeout: { type: 'string' },
                        retryOn: { type: 'array', items: { type: 'string' } },
                      },
                    },
                    cors: {
                      type: 'object',
                      properties: {
                        allowOrigins: { type: 'array', items: { type: 'string' } },
                        allowMethods: { type: 'array', items: { type: 'string' } },
                        allowHeaders: { type: 'array', items: { type: 'string' } },
                        exposeHeaders: { type: 'array', items: { type: 'string' } },
                        maxAge: { type: 'string' },
                        allowCredentials: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
              tcp: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    match: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          port: { type: 'number' },
                          destinationSubnet: { type: 'string' },
                          sourceSubnet: { type: 'string' },
                          sourceLabels: { type: 'object' },
                          gateways: { type: 'array', items: { type: 'string' } },
                        },
                      },
                    },
                    route: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          destination: {
                            type: 'object',
                            properties: {
                              host: { type: 'string' },
                              subset: { type: 'string' },
                              port: {
                                type: 'object',
                                properties: {
                                  number: { type: 'number' },
                                  protocol: {
                                    type: 'string',
                                    enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'],
                                  },
                                  name: { type: 'string' },
                                },
                              },
                            },
                          },
                          weight: { type: 'number', minimum: 1 },
                        },
                      },
                    },
                  },
                },
              },
              tls: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    match: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          port: { type: 'number' },
                          sniHosts: { type: 'array', items: { type: 'string' } },
                          destinationSubnet: { type: 'string' },
                          sourceSubnet: { type: 'string' },
                          sourceLabels: { type: 'object' },
                          gateways: { type: 'array', items: { type: 'string' } },
                        },
                      },
                    },
                    route: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          destination: {
                            type: 'object',
                            properties: {
                              host: { type: 'string' },
                              subset: { type: 'string' },
                              port: {
                                type: 'object',
                                properties: {
                                  number: { type: 'number' },
                                  protocol: {
                                    type: 'string',
                                    enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'],
                                  },
                                  name: { type: 'string' },
                                },
                              },
                            },
                          },
                          weight: { type: 'number', minimum: 1 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const { meshId } = request.params as { meshId: string };
        const vsData = request.body as any;

        try {
          const virtualService = await this.createVirtualService(meshId, vsData);
          reply.status(201).send(virtualService);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create virtual service' });
        }
      }
    );

    // Configurar Destination Rules
    this.server.post(
      '/admin/service-mesh/:meshId/destination-rules',
      {
        schema: {
          description: 'Configurar destination rules',
          tags: ['admin', 'service-mesh'],
          params: {
            type: 'object',
            properties: {
              meshId: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['name', 'host'],
            properties: {
              name: { type: 'string' },
              namespace: { type: 'string' },
              host: { type: 'string' },
              trafficPolicy: { $ref: '#/definitions/TrafficPolicyConfig' },
              subsets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    labels: { type: 'object' },
                    trafficPolicy: { $ref: '#/definitions/TrafficPolicyConfig' },
                  },
                },
              },
              exportTo: {
                type: 'object',
                properties: {
                  to: { type: 'array', items: { type: 'string' } },
                  toNamespace: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const { meshId } = request.params as { meshId: string };
        const drData = request.body as any;

        try {
          const destinationRule = await this.createDestinationRule(meshId, drData);
          reply.status(201).send(destinationRule);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create destination rule' });
        }
      }
    );

    // Configurar Gateways
    this.server.post(
      '/admin/service-mesh/:meshId/gateways',
      {
        schema: {
          description: 'Configurar gateways',
          tags: ['admin', 'service-mesh'],
          params: {
            type: 'object',
            properties: {
              meshId: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            required: ['name', 'servers'],
            properties: {
              name: { type: 'string' },
              selector: {
                type: 'object',
                properties: {
                  matchLabels: { type: 'object' },
                  matchExpressions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        key: { type: 'string' },
                        operator: {
                          type: 'string',
                          enum: ['Exists', 'DoesNotExist', 'In', 'NotIn'],
                        },
                        values: { type: 'array', items: { type: 'string' } },
                      },
                    },
                  },
                },
              },
              servers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    hosts: { type: 'array', items: { type: 'string' } },
                    port: {
                      type: 'object',
                      properties: {
                        number: { type: 'number' },
                        protocol: { type: 'string', enum: ['HTTP', 'HTTPS', 'TCP', 'GRPC'] },
                        name: { type: 'string' },
                      },
                    },
                    tls: {
                      type: 'object',
                      properties: {
                        mode: { type: 'string', enum: ['SIMPLE', 'MUTUAL', 'DISABLE'] },
                        credentialName: { type: 'string' },
                        minProtocolVersion: { type: 'string' },
                        maxProtocolVersion: { type: 'string' },
                      },
                    },
                  },
                },
              },
              tls: {
                type: 'object',
                properties: {
                  mode: { type: 'string', enum: ['SIMPLE', 'MUTUAL', 'DISABLE'] },
                  credentialName: { type: 'string' },
                  minProtocolVersion: { type: 'string' },
                  maxProtocolVersion: { type: 'string' },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const { meshId } = request.params as { meshId: string };
        const gwData = request.body as any;

        try {
          const gateway = await this.createGateway(meshId, gwData);
          reply.status(201).send(gateway);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to create gateway' });
        }
      }
    );

    // Métricas do Service Mesh
    this.server.get(
      '/admin/service-mesh/:id/metrics',
      {
        schema: {
          description: 'Obter métricas do service mesh',
          tags: ['admin', 'service-mesh'],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };

        try {
          const metrics = await this.getServiceMeshMetrics(id);
          reply.send(metrics);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to get service mesh metrics' });
        }
      }
    );

    // Health Check do Service Mesh
    this.server.get(
      '/admin/service-mesh/:id/health',
      {
        schema: {
          description: 'Health check do service mesh',
          tags: ['admin', 'service-mesh'],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };

        try {
          const health = await this.getServiceMeshHealth(id);
          reply.send(health);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to get service mesh health' });
        }
      }
    );

    // Upgrade do Service Mesh
    this.server.post(
      '/admin/service-mesh/:id/upgrade',
      {
        schema: {
          description: 'Upgrade service mesh',
          tags: ['admin', 'service-mesh'],
          params: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          body: {
            type: 'object',
            properties: {
              version: { type: 'string' },
              strategy: { type: 'string', enum: ['rolling', 'canary', 'blue-green'] },
              backup: { type: 'boolean' },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const upgradeData = request.body as any;

        try {
          const upgrade = await this.upgradeServiceMesh(id, upgradeData);
          reply.send(upgrade);
        } catch (error) {
          reply.status(500).send({ error: 'Failed to upgrade service mesh' });
        }
      }
    );
  }

  /**
   * Criar Service Mesh
   */
  private async createServiceMesh(meshData: any): Promise<ServiceMesh> {
    const id = `mesh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const serviceMesh: ServiceMesh = {
      id,
      name: meshData.name,
      description: meshData.description || '',
      provider: meshData.provider,
      version: meshData.version || '1.0.0',
      namespace: meshData.namespace,
      controlPlane: meshData.controlPlane || {
        replicas: 1,
        resources: {
          cpu: { request: '100m', limit: '500m' },
          memory: { request: '128Mi', limit: '512Mi' },
        },
        autoscaling: {
          enabled: false,
          minReplicas: 1,
          maxReplicas: 3,
          targetCPU: 70,
          targetMemory: 80,
          scaleDownDelay: 30,
        },
        highAvailability: false,
        backup: {
          enabled: false,
          schedule: '0 2 * * * *',
          retention: 7,
          storage: 's3://mesh-backup',
          encryption: true,
        },
        monitoring: {
          enabled: true,
          metrics: ['cpu', 'memory', 'requests', 'errors'],
          alerts: true,
          logging: true,
          tracing: true,
        },
      },
      dataPlane: meshData.dataPlane || {
        sidecar: {
          image: 'envoy/proxy',
          version: 'v1.18.0',
          resources: {
            cpu: { request: '100m', limit: '500m' },
            memory: { request: '128Mi', limit: '512Mi' },
          },
          proxy: {
            type: 'envoy',
            config: {},
            listeners: [
              {
                name: 'listener_0',
                address: '0.0.0.0',
                port: 8080,
                protocol: 'HTTP',
                filters: [],
              },
            ],
            clusters: [],
          },
        },
        injection: {
          enabled: true,
          automatic: true,
          labelSelector: {
            matchLabels: {},
            matchExpressions: [],
          },
          excludedNamespaces: ['kube-system', 'kube-public'],
          template: {
            name: 'istio-proxy',
            type: 'sidecar',
            image: 'istio/proxyv2',
            resources: {
              cpu: { request: '100m', limit: '500m' },
              memory: { request: '128Mi', limit: '512Mi' },
            },
            env: [],
            volumeMounts: [],
          },
        },
        networking: {
          mtls: {
            mode: 'PERMISSIVE',
            credentialName: '',
            destinationRule: '',
            minProtocolVersion: 'TLSV1_2',
            maxProtocolVersion: 'TLSV1_3',
          },
          trafficPolicy: {
            connectionPool: {
              tcp: {
                maxConnections: 100,
                connectTimeout: '10s',
                keepAlive: {
                  interval: '30s',
                  timeout: '1s',
                  probes: 3,
                },
              },
              http: {
                http1MaxPendingRequests: 1024,
                http2MaxRequests: 1000,
                maxRequestsPerConnection: 100,
                maxRetries: 3,
                idleTimeout: '1h',
                h2UpgradePolicy: 'UPGRADE',
              },
            },
            loadBalancer: {
              simple: {
                algorithm: 'ROUND_ROBIN',
              },
            },
            circuitBreaker: {
              consecutiveErrors: 5,
              interval: '30s',
              baseEjectionTime: '30s',
              maxEjectionPercent: 10,
              minHealthPercent: 50,
            },
            timeout: {
              http: '15s',
              tcp: '10s',
            },
            retry: {
              attempts: 3,
              perTryTimeout: '2s',
              retryOn: ['5xx', 'gateway-error', 'connect-failure', 'refused-stream'],
            },
          },
        },
        serviceEntries: [],
        gateways: [],
      },
      performance: meshData.performance || {
        proxy: {
          concurrency: 2,
          bufferLimit: 32768,
          stackSize: '1Mb',
          drainDuration: '45s',
          parentShutdownGracePeriod: '1m',
        },
        networking: {
          connectionTimeout: '5s',
          connectTimeout: '5s',
          maxRequestsPerConnection: 1000,
          http2MaxRequests: 1000,
          idleTimeout: '1h',
        },
        resources: {
          cpu: { request: '100m', limit: '500m' },
          memory: { request: '128Mi', limit: '512Mi' },
        },
      },
      security: meshData.security || {
        authentication: {
          enabled: true,
          methods: [{ type: 'JWT', config: {}, enabled: true }],
          mfa: {
            enabled: false,
            methods: ['totp'],
            required: false,
            fallback: true,
          },
          session: {
            timeout: 3600,
            renewal: true,
            concurrent: 3,
            tracking: true,
          },
        },
        authorization: {
          enabled: true,
          mode: 'RBAC',
          policies: [],
          roles: [],
          permissions: [],
        },
        encryption: {
          atRest: true,
          inTransit: true,
          algorithms: ['TLSv1_2', 'TLSv1_3'],
          keyManagement: {
            provider: 'istio',
            rotation: true,
            rotationDays: 90,
          },
        },
        access: {
          control: {
            enabled: true,
            level: 'table',
            dynamic: false,
            caching: true,
          },
          logging: {
            enabled: true,
            level: 'basic',
            storage: 'database',
            retention: 2555,
          },
          quarantine: {
            enabled: false,
            automatic: false,
            review: true,
            notification: true,
          },
        },
        monitoring: {
          enabled: true,
          alerts: {
            enabled: true,
            rules: [],
            channels: [{ type: 'email', config: {}, enabled: true }],
          },
        },
      },
      observability: meshData.observability || {
        tracing: {
          enabled: true,
          provider: 'jaeger',
          sampling: {
            type: 'PROBABILISTIC',
            percentage: 1,
            rateLimit: {
              serverMin: 100,
              serverMax: 500,
              clientMin: 100,
              clientMax: 500,
            },
          },
          propagation: {
            b3: true,
            w3c: true,
            zipkin: false,
            jaeger: true,
            custom: [],
          },
        },
        metrics: {
          enabled: true,
          providers: [],
          prometheus: {
            enabled: true,
            endpoint: 'http://prometheus:9090',
            port: 9090,
            path: '/metrics',
            metrics: ['istio_requests_total', 'istio_request_duration_milliseconds_bucket'],
          },
          statsd: {
            enabled: false,
            address: 'localhost',
            port: 8125,
            prefix: 'istio',
          },
        },
        logging: {
          enabled: true,
          level: 'INFO',
          format: 'JSON',
          providers: [
            {
              name: 'stdout',
              type: 'STDOUT',
              config: {},
            },
          ],
          filters: [],
        },
        monitoring: {
          enabled: true,
          dashboards: [
            {
              name: 'Istio Dashboard',
              type: 'GRAFANA',
              url: 'http://grafana:3000/d/istio',
              refresh: '5m',
            },
          ],
          alerts: [],
          healthChecks: [
            {
              name: 'Control Plane',
              type: 'processing',
              config: {},
            },
            {
              name: 'Data Plane',
              type: 'network',
              config: {},
            },
          ],
        },
      },
      traffic: meshData.traffic || {
        virtualServices: [],
        destinationRules: [],
        gateways: [],
        serviceEntries: [],
        envoyFilters: [],
      },
      policies: meshData.policies || [],
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: meshData.metadata || {},
    };

    this.serviceMeshes.set(id, serviceMesh);

    // Inicializar configuração do service mesh
    await this.initializeServiceMeshConfig(serviceMesh);

    logger.info('Service mesh created', { id, name: meshData.name });
    return serviceMesh;
  }

  /**
   * Listar Service Meshes
   */
  private async listServiceMeshes(filters: any): Promise<ServiceMesh[]> {
    let meshes = Array.from(this.serviceMeshes.values());

    if (filters.provider) {
      meshes = meshes.filter((m) => m.provider === filters.provider);
    }

    if (filters.status) {
      meshes = meshes.filter((m) => m.status === filters.status);
    }

    return meshes;
  }

  /**
   * Criar Política do Mesh
   */
  private async createMeshPolicy(meshId: string, policyData: any): Promise<MeshPolicy> {
    const id = `policy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const policy: MeshPolicy = {
      id,
      name: policyData.name,
      type: policyData.type,
      config: policyData.config,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.policies.set(id, policy);

    logger.info('Mesh policy created', { id, meshId, name: policyData.name });
    return policy;
  }

  /**
   * Criar Virtual Service
   */
  private async createVirtualService(meshId: string, vsData: any): Promise<any> {
    const serviceMesh = this.serviceMeshes.get(meshId);

    if (!serviceMesh) {
      throw new Error(`Service mesh not found: ${meshId}`);
    }

    // Simular criação de virtual service
    const virtualService = {
      name: vsData.name,
      namespace: vsData.namespace || serviceMesh.namespace,
      hosts: vsData.hosts,
      gateways: vsData.gateways || [],
      http: vsData.http || [],
      tcp: vsData.tcp || [],
      tls: vsData.tls || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Adicionar ao traffic management
    serviceMesh.traffic.virtualServices.push(virtualService);

    logger.info('Virtual service created', { meshId, name: vsData.name });
    return virtualService;
  }

  /**
   * Criar Destination Rule
   */
  private async createDestinationRule(meshId: string, drData: any): Promise<any> {
    const serviceMesh = this.serviceMeshes.get(meshId);

    if (!serviceMesh) {
      throw new Error(`Service mesh not found: ${meshId}`);
    }

    // Simular criação de destination rule
    const destinationRule = {
      name: drData.name,
      namespace: drData.namespace || serviceMesh.namespace,
      host: drData.host,
      trafficPolicy: drData.trafficPolicy,
      subsets: drData.subsets || [],
      exportTo: drData.exportTo || { to: [], toNamespace: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Adicionar ao traffic management
    serviceMesh.traffic.destinationRules.push(destinationRule);

    logger.info('Destination rule created', { meshId, name: drData.name });
    return destinationRule;
  }

  /**
   * Criar Gateway
   */
  private async createGateway(meshId: string, gwData: any): Promise<any> {
    const serviceMesh = this.serviceMeshes.get(meshId);

    if (!serviceMesh) {
      throw new Error(`Service mesh not found: {meshId}`);
    }

    // Simular criação de gateway
    const gateway = {
      name: gwData.name,
      selector: gwData.selector,
      servers: gwData.servers,
      tls: gwData.tls,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Adicionar ao traffic management
    serviceMesh.traffic.gateways.push(gateway);

    logger.info('Gateway created', { meshId, name: gwData.name });
    return gateway;
  }

  /**
   * Obter Métricas do Service Mesh
   */
  private async getServiceMeshMetrics(meshId: string): Promise<ServiceMeshMetrics> {
    const serviceMesh = this.serviceMeshes.get(meshId);

    if (!serviceMesh) {
      throw new Error(`Service mesh not found: ${meshId}`);
    }

    // Simular métricas
    return {
      mesh: {
        totalServices: Math.floor(Math.random() * 50) + 10,
        totalGateways: serviceMesh.traffic.gateways.length,
        totalVirtualServices: serviceMesh.traffic.virtualServices.length,
        totalDestinationRules: serviceMesh.traffic.destinationRules.length,
        totalPolicies: serviceMesh.policies.length,
      },
      traffic: {
        totalRequests: Math.floor(Math.random() * 100000) + 50000,
        successRate: Math.random() * 0.05 + 0.94, // 94-99%
        averageLatency: Math.random() * 100 + 50, // 50-150ms
        errorRate: Math.random() * 0.05, // 0-5%
        throughput: Math.random() * 10000 + 5000, // 5K-15K req/sec
      },
      security: {
        authenticationAttempts: Math.floor(Math.random() * 1000) + 500,
        authenticationSuccess: Math.floor(Math.random() * 950) + 475,
        authorizationAttempts: Math.floor(Math.random() * 800) + 400,
        authorizationSuccess: Math.floor(Math.random() * 760) + 380,
        tlsConnections: Math.floor(Math.random() * 1000) + 500,
        securityViolations: Math.floor(Math.random() * 10) + 1,
      },
      performance: {
        cpuUsage: Math.random() * 80 + 20, // 20-100%
        memoryUsage: Math.random() * 70 + 30, // 30-100%
        networkLatency: Math.random() * 50 + 10, // 10-60ms
        proxyLatency: Math.random() * 20 + 5, // 5-25ms
        connectionPool: {
          totalConnections: Math.floor(Math.random() * 1000) + 500,
          activeConnections: Math.floor(Math.random() * 800) + 400,
          failedConnections: Math.floor(Math.random() * 20) + 5,
          averageConnectionTime: Math.random() * 100 + 50, // 50-150ms
        },
      },
      observability: {
        traceSamples: Math.floor(Math.random() * 1000) + 500,
        metricsPoints: Math.floor(Math.random() * 10000) + 5000,
        logEntries: Math.floor(Math.random() * 5000) + 1000,
        alertCount: Math.floor(Math.random() * 10) + 1,
      },
    };
  }

  /**
   * Obter Health do Service Mesh
   */
  private async getServiceMeshHealth(meshId: string): Promise<any> {
    const serviceMesh = this.serviceMeshes.get(meshId);

    if (!serviceMesh) {
      throw new Error(`Service mesh not found: ${meshId}`);
    }

    // Simular health check
    const health = {
      meshId,
      status: 'healthy',
      components: {
        controlPlane: {
          status: 'healthy',
          replicas: serviceMesh.controlPlane.replicas,
          ready: serviceMesh.controlPlane.replicas,
          cpu: Math.random() * 80 + 20,
          memory: Math.random() * 70 + 30,
        },
        dataPlane: {
          status: 'healthy',
          sidecars: Math.floor(Math.random() * 100) + 50,
          connections: Math.floor(Math.random() * 1000) + 500,
          latency: Math.random() * 50 + 10,
        },
        networking: {
          status: 'healthy',
          mtls: serviceMesh.dataPlane.networking.mtls.mode !== 'DISABLE',
          trafficPolicy: Object.keys(serviceMesh.dataPlane.networking.trafficPolicy).length > 0,
        },
        security: {
          status: 'healthy',
          authentication: serviceMesh.security.authentication.enabled,
          authorization: serviceMesh.security.authorization.enabled,
          tls: serviceMesh.security.encryption.atRest && serviceMesh.security.encryption.inTransit,
        },
      },
      lastChecked: new Date(),
      version: serviceMesh.version,
    };

    return health;
  }

  /**
   * Upgrade Service Mesh
   */
  private async upgradeServiceMesh(meshId: string, upgradeData: any): Promise<any> {
    const serviceMesh = this.serviceMeshes.get(meshId);

    if (!serviceMesh) {
      throw new Error(`Service mesh not found: ${meshId}`);
    }

    // Simular processo de upgrade
    const upgrade = {
      meshId,
      fromVersion: serviceMesh.version,
      toVersion: upgradeData.version || '1.1.0',
      strategy: upgradeData.strategy || 'rolling',
      backup: upgradeData.backup || false,
      status: 'upgrading',
      startedAt: new Date(),
      estimatedDuration: '5m',
      progress: 0,
    };

    // Simular progresso
    const progressInterval = setInterval(() => {
      upgrade.progress = Math.min(100, upgrade.progress + 20);

      if (upgrade.progress >= 100) {
        clearInterval(progressInterval);
        upgrade.status = 'completed';
        upgrade.completedAt = new Date();
        serviceMesh.version = upgrade.toVersion;
        serviceMesh.updatedAt = new Date();

        logger.info('Service mesh upgraded', {
          meshId,
          fromVersion: upgrade.fromVersion,
          toVersion: upgrade.toVersion,
          strategy: upgrade.strategy,
        });
      }
    }, 60000); // 1 minuto

    return upgrade;
  }

  /**
   * Inicializar Service Mesh
   */
  private initializeServiceMesh(): void {
    logger.info('Initializing service mesh service');

    // Configurar providers
    this.setupMeshProviders();

    // Configurar componentes
    this.setupMeshComponents();

    // Iniciar monitoramento
    this.startMeshMonitoring();
  }

  /**
   * Configurar Providers do Service Mesh
   */
  private setupMeshProviders(): void {
    // Configurar Istio, Linkerd, Consul, etc.
  }

  /**
   * Configurar Componentes do Service Mesh
   */
  private setupMeshComponents(): void {
    // Configurar control plane, data plane, etc.
  }

  /**
   * Iniciar Monitoramento do Service Mesh
   */
  private startMeshMonitoring(): void {
    logger.info('Starting service mesh monitoring');

    setInterval(async () => {
      await this.collectMeshMetrics();
    }, 30000); // A cada 30 segundos

    setInterval(async () => {
      await this.checkMeshHealth();
    }, 60000); // A cada minuto
  }

  /**
   * Coletar Métricas
   */
  private async collectMeshMetrics(): Promise<void> {
    // Coletar métricas de todos os service meshes
  }

  /**
   * Verificar Health
   */
  private async checkMeshHealth(): Promise<void> {
    // Verificar saúde de todos os service meshes
  }

  // Implementação dos middlewares
  private async handleSidecarInjection(request: any, reply: any): Promise<void> {
    // Implementar injeção automática de sidecar
  }

  private async handleTrafficRouting(request: any, reply: any): Promise<void> {
    // Implementar roteamento de tráfego
  }

  private async handleMeshSecurity(request: any, reply: any): Promise<void> {
    // Implementar verificação de segurança
  }

  private async handleMeshObservability(request: any, reply: any): Promise<void> {
    // Implementar coleta de observabilidade
  }

  // Verificação de requisições
  private isMeshRequest(request: any): boolean {
    return (
      request.url.startsWith('/service-mesh/') || request.url.startsWith('/admin/service-mesh/')
    );
  }
}

// Singleton instance
let serviceMeshServiceInstance: ServiceMeshService | null = null;

export function getServiceMeshService(server?: FastifyInstance): ServiceMeshService {
  if (!serviceMeshServiceInstance && server) {
    serviceMeshServiceInstance = new ServiceMeshService(server);
  }

  if (!serviceMeshServiceInstance) {
    throw new Error(
      'ServiceMeshService not initialized. Call getServiceMeshService(server) first.'
    );
  }

  return serviceMeshServiceInstance;
}
