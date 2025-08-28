import { EventEmitter } from 'events';
export interface KubernetesCluster {
    id: string;
    name: string;
    provider: 'eks' | 'gke' | 'aks' | 'self-managed';
    region: string;
    version: string;
    status: 'creating' | 'active' | 'updating' | 'deleting' | 'failed';
    nodeGroups: NodeGroup[];
    addons: ClusterAddon[];
    configuration: ClusterConfiguration;
    metrics: ClusterMetrics;
    createdAt: Date;
    updatedAt: Date;
}
export interface NodeGroup {
    id: string;
    name: string;
    instanceType: string;
    minSize: number;
    maxSize: number;
    desiredSize: number;
    spotInstances: boolean;
    taints: K8sTaint[];
    labels: Record<string, string>;
    userData?: string;
}
export interface K8sTaint {
    key: string;
    value: string;
    effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
}
export interface ClusterAddon {
    name: string;
    version: string;
    enabled: boolean;
    configuration: Record<string, any>;
}
export interface ClusterConfiguration {
    networking: NetworkConfiguration;
    security: SecurityConfiguration;
    monitoring: MonitoringConfiguration;
    storage: StorageConfiguration;
    autoscaling: AutoscalingConfiguration;
}
export interface NetworkConfiguration {
    cni: 'aws-vpc-cni' | 'calico' | 'cilium' | 'flannel';
    podCidr: string;
    serviceCidr: string;
    dnsProvider: 'coredns' | 'kube-dns';
    loadBalancer: 'aws-alb' | 'nginx' | 'istio' | 'traefik';
    networkPolicies: boolean;
}
export interface SecurityConfiguration {
    rbac: boolean;
    podSecurityStandards: 'restricted' | 'baseline' | 'privileged';
    networkPolicies: boolean;
    secretsEncryption: boolean;
    auditLogging: boolean;
    admissionControllers: string[];
}
export interface MonitoringConfiguration {
    prometheus: boolean;
    grafana: boolean;
    jaeger: boolean;
    fluentd: boolean;
    customMetrics: boolean;
}
export interface StorageConfiguration {
    defaultStorageClass: string;
    csiDrivers: string[];
    persistentVolumeReclaim: 'Retain' | 'Delete' | 'Recycle';
}
export interface AutoscalingConfiguration {
    clusterAutoscaler: boolean;
    hpa: boolean;
    vpa: boolean;
    customMetrics: string[];
    scalingPolicies: ScalingPolicy[];
}
export interface ScalingPolicy {
    metric: string;
    targetValue: number;
    scaleUpPeriod: number;
    scaleDownPeriod: number;
}
export interface ClusterMetrics {
    nodeCount: number;
    podCount: number;
    cpuUtilization: number;
    memoryUtilization: number;
    storageUtilization: number;
    networkTraffic: number;
    costPerHour: number;
}
export interface Application {
    id: string;
    name: string;
    namespace: string;
    cluster: string;
    status: 'pending' | 'deployed' | 'updating' | 'failed' | 'terminating';
    version: string;
    deploymentStrategy: 'rolling' | 'blue-green' | 'canary' | 'recreate';
    resources: KubernetesResource[];
    configuration: ApplicationConfiguration;
    health: ApplicationHealth;
    createdAt: Date;
    updatedAt: Date;
}
export interface KubernetesResource {
    id: string;
    name: string;
    kind: string;
    apiVersion: string;
    namespace: string;
    status: 'creating' | 'active' | 'updating' | 'deleting' | 'failed';
    spec: any;
    labels: Record<string, string>;
    annotations: Record<string, string>;
}
export interface ApplicationConfiguration {
    replicas: number;
    resources: ResourceRequirements;
    environment: Record<string, string>;
    secrets: string[];
    configMaps: string[];
    volumes: VolumeMount[];
    probes: ProbeConfiguration;
    security: ApplicationSecurity;
}
export interface ResourceRequirements {
    requests: {
        cpu: string;
        memory: string;
    };
    limits: {
        cpu: string;
        memory: string;
    };
}
export interface VolumeMount {
    name: string;
    mountPath: string;
    type: 'configMap' | 'secret' | 'pvc' | 'emptyDir';
    source: string;
}
export interface ProbeConfiguration {
    livenessProbe?: Probe;
    readinessProbe?: Probe;
    startupProbe?: Probe;
}
export interface Probe {
    type: 'http' | 'tcp' | 'exec';
    path?: string;
    port?: number;
    command?: string[];
    initialDelaySeconds: number;
    periodSeconds: number;
    timeoutSeconds: number;
    failureThreshold: number;
}
export interface ApplicationSecurity {
    runAsNonRoot: boolean;
    runAsUser?: number;
    securityContext: any;
    serviceAccountName?: string;
    podSecurityPolicy?: string;
}
export interface ApplicationHealth {
    status: 'healthy' | 'unhealthy' | 'warning' | 'unknown';
    readyReplicas: number;
    desiredReplicas: number;
    lastHealthCheck: Date;
    healthChecks: HealthCheckResult[];
}
export interface HealthCheckResult {
    type: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    timestamp: Date;
}
export interface DeploymentExecution {
    id: string;
    applicationId: string;
    version: string;
    strategy: string;
    status: 'pending' | 'in-progress' | 'success' | 'failed' | 'cancelled';
    startTime: Date;
    endTime?: Date;
    steps: DeploymentStep[];
    rollbackVersion?: string;
}
export interface DeploymentStep {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    startTime?: Date;
    endTime?: Date;
    logs: string[];
}
export declare class KubernetesOrchestrationEngine extends EventEmitter {
    private readonly kc;
    private readonly k8sApi;
    private readonly appsApi;
    private readonly networkingApi;
    private readonly rbacApi;
    private readonly metricsApi;
    private readonly helmManager;
    private readonly resourceManager;
    private readonly autoScaler;
    private readonly networkPolicyManager;
    private readonly securityPolicyManager;
    private readonly monitoringAgent;
    private readonly clusters;
    private readonly applications;
    private readonly deployments;
    constructor();
    createCluster(name: string, provider: 'eks' | 'gke' | 'aks' | 'self-managed', configuration: ClusterConfiguration): Promise<KubernetesCluster>;
    deployApplication(name: string, namespace: string, cluster: string, manifests: string[], configuration: ApplicationConfiguration, strategy?: 'rolling' | 'blue-green' | 'canary' | 'recreate'): Promise<Application>;
    scaleApplication(applicationId: string, replicas: number): Promise<void>;
    updateApplication(applicationId: string, manifests: string[], strategy?: 'rolling' | 'blue-green' | 'canary'): Promise<DeploymentExecution>;
    rollbackApplication(applicationId: string, targetVersion?: string): Promise<void>;
    deleteApplication(applicationId: string): Promise<void>;
    getClusterStatus(clusterId: string): Promise<KubernetesCluster | undefined>;
    getApplicationHealth(applicationId: string): Promise<ApplicationHealth | undefined>;
    listClusterResources(clusterId: string): Promise<KubernetesResource[]>;
    setupAutoScaling(applicationId: string, minReplicas: number, maxReplicas: number, targetCpuUtilization: number, customMetrics?: string[]): Promise<void>;
    private provisionCluster;
    private configureCluster;
    private installClusterAddons;
    private ensureNamespace;
    private createDeploymentExecution;
    private executeDeployment;
    private executeRollingDeployment;
    private executeBlueGreenDeployment;
    private executeCanaryDeployment;
    private executeRecreateDeployment;
    private deleteResource;
    private collectClusterMetrics;
    private checkApplicationHealth;
    private initializeClusterMetrics;
    private initializeApplicationHealth;
    private initializeMonitoring;
    private performHealthChecks;
    listClusters(): KubernetesCluster[];
    listApplications(clusterId?: string): Application[];
    getApplication(applicationId: string): Application | undefined;
    listDeployments(applicationId?: string): DeploymentExecution[];
    getDeployment(deploymentId: string): DeploymentExecution | undefined;
}
//# sourceMappingURL=orchestration-engine.d.ts.map