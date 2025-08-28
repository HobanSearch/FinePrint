import { EventEmitter } from 'events';
export interface MonitoringStack {
    id: string;
    name: string;
    cluster: string;
    namespace: string;
    status: 'deploying' | 'active' | 'updating' | 'failed' | 'terminating';
    components: MonitoringComponent[];
    configuration: MonitoringConfiguration;
    dashboards: Dashboard[];
    alerts: AlertRule[];
    slos: ServiceLevelObjective[];
    createdAt: Date;
    updatedAt: Date;
}
export interface MonitoringComponent {
    name: string;
    type: 'prometheus' | 'grafana' | 'alertmanager' | 'loki' | 'jaeger' | 'elasticsearch';
    version: string;
    status: 'deploying' | 'active' | 'failed';
    endpoint: string;
    configuration: Record<string, any>;
    resources: ComponentResources;
}
export interface ComponentResources {
    cpu: string;
    memory: string;
    storage: string;
    replicas: number;
}
export interface MonitoringConfiguration {
    retention: RetentionConfig;
    scraping: ScrapingConfig;
    alerting: AlertingConfig;
    logging: LoggingConfig;
    tracing: TracingConfig;
    security: SecurityConfig;
    performance: PerformanceConfig;
}
export interface RetentionConfig {
    metrics: string;
    logs: string;
    traces: string;
}
export interface ScrapingConfig {
    interval: string;
    timeout: string;
    targets: ScrapeTarget[];
    relabeling: RelabelConfig[];
}
export interface ScrapeTarget {
    job: string;
    targets: string[];
    path?: string;
    labels: Record<string, string>;
}
export interface RelabelConfig {
    sourceLabels: string[];
    separator?: string;
    targetLabel: string;
    regex?: string;
    replacement?: string;
    action: 'replace' | 'keep' | 'drop' | 'labelmap';
}
export interface AlertingConfig {
    enabled: boolean;
    groupWait: string;
    groupInterval: string;
    repeatInterval: string;
    receivers: AlertReceiver[];
    routes: AlertRoute[];
}
export interface AlertReceiver {
    name: string;
    type: 'slack' | 'email' | 'webhook' | 'pagerduty';
    configuration: Record<string, any>;
}
export interface AlertRoute {
    match: Record<string, string>;
    receiver: string;
    groupBy: string[];
    continue?: boolean;
}
export interface LoggingConfig {
    enabled: boolean;
    aggregation: 'loki' | 'elasticsearch' | 'fluentd';
    retention: string;
    parsing: LogParsingRule[];
}
export interface LogParsingRule {
    pattern: string;
    fields: Record<string, string>;
    labels: Record<string, string>;
}
export interface TracingConfig {
    enabled: boolean;
    backend: 'jaeger' | 'zipkin' | 'opentelemetry';
    samplingRate: number;
    retention: string;
}
export interface SecurityConfig {
    tls: boolean;
    authentication: 'none' | 'basic' | 'oauth' | 'oidc';
    authorization: 'none' | 'rbac';
    networkPolicies: boolean;
}
export interface PerformanceConfig {
    queryOptimization: boolean;
    caching: boolean;
    compression: boolean;
    federationConfig?: FederationConfig;
}
export interface FederationConfig {
    enabled: boolean;
    clusters: string[];
    queries: string[];
}
export interface Dashboard {
    id: string;
    name: string;
    category: 'infrastructure' | 'application' | 'business' | 'security';
    panels: DashboardPanel[];
    variables: DashboardVariable[];
    annotations: DashboardAnnotation[];
    tags: string[];
    description: string;
}
export interface DashboardPanel {
    id: string;
    title: string;
    type: 'graph' | 'singlestat' | 'table' | 'heatmap' | 'gauge' | 'text';
    queries: PanelQuery[];
    visualization: VisualizationConfig;
    thresholds?: Threshold[];
}
export interface PanelQuery {
    query: string;
    legend: string;
    refId: string;
    datasource: string;
}
export interface VisualizationConfig {
    displayMode: string;
    colorMode: string;
    unit: string;
    decimals?: number;
    min?: number;
    max?: number;
}
export interface Threshold {
    value: number;
    color: string;
    op: 'gt' | 'lt';
}
export interface DashboardVariable {
    name: string;
    type: 'query' | 'constant' | 'interval' | 'custom';
    query?: string;
    options: string[];
    current: string;
}
export interface DashboardAnnotation {
    name: string;
    datasource: string;
    query: string;
    enable: boolean;
}
export interface AlertRule {
    id: string;
    name: string;
    query: string;
    condition: AlertCondition;
    severity: 'critical' | 'warning' | 'info';
    frequency: string;
    timeout: string;
    labels: Record<string, string>;
    annotations: Record<string, string>;
    notifications: string[];
}
export interface AlertCondition {
    type: 'threshold' | 'no_data' | 'rate_of_change';
    operator: 'gt' | 'lt' | 'eq' | 'ne';
    value: number;
    duration: string;
}
export interface ServiceLevelObjective {
    id: string;
    name: string;
    service: string;
    description: string;
    objective: number;
    window: string;
    indicators: ServiceLevelIndicator[];
    alerting: SLOAlerting;
    budget: ErrorBudget;
}
export interface ServiceLevelIndicator {
    name: string;
    type: 'availability' | 'latency' | 'throughput' | 'error_rate';
    query: string;
    thresholds: SLIThreshold[];
}
export interface SLIThreshold {
    type: 'good' | 'bad';
    operator: 'gt' | 'lt' | 'eq';
    value: number;
}
export interface SLOAlerting {
    burnRateRules: BurnRateRule[];
    errorBudgetRules: ErrorBudgetRule[];
}
export interface BurnRateRule {
    window: string;
    burnRate: number;
    severity: 'critical' | 'warning';
}
export interface ErrorBudgetRule {
    remaining: number;
    severity: 'critical' | 'warning';
}
export interface ErrorBudget {
    remaining: number;
    consumed: number;
    total: number;
    burnRate: number;
    projectedDaysToExhaustion: number;
}
export interface MonitoringMetrics {
    systemHealth: SystemHealth;
    applicationMetrics: ApplicationMetrics;
    businessMetrics: BusinessMetrics;
    performanceMetrics: PerformanceMetrics;
}
export interface SystemHealth {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    networkTraffic: number;
    uptime: number;
    errorRate: number;
}
export interface ApplicationMetrics {
    requestRate: number;
    responseTime: number;
    errorCount: number;
    activeUsers: number;
    throughput: number;
}
export interface BusinessMetrics {
    documentsProcessed: number;
    revenue: number;
    userEngagement: number;
    conversionRate: number;
    churnRate: number;
}
export interface PerformanceMetrics {
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
    apdex: number;
    availability: number;
}
export interface Incident {
    id: string;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    status: 'open' | 'acknowledged' | 'investigating' | 'resolved';
    service: string;
    alertRule: string;
    startTime: Date;
    resolvedTime?: Date;
    assignee?: string;
    description: string;
    timeline: IncidentEvent[];
    postMortem?: PostMortem;
}
export interface IncidentEvent {
    timestamp: Date;
    type: 'created' | 'acknowledged' | 'escalated' | 'resolved' | 'comment';
    user: string;
    message: string;
}
export interface PostMortem {
    summary: string;
    rootCause: string;
    impact: string;
    resolution: string;
    preventionMeasures: string[];
    lessonsLearned: string[];
    actionItems: ActionItem[];
}
export interface ActionItem {
    description: string;
    assignee: string;
    dueDate: Date;
    status: 'open' | 'in_progress' | 'completed';
}
export declare class ObservabilityEngine extends EventEmitter {
    private readonly prometheusManager;
    private readonly grafanaManager;
    private readonly alertManager;
    private readonly logAggregator;
    private readonly tracingManager;
    private readonly metricsCollector;
    private readonly sloManager;
    private readonly anomalyDetector;
    private readonly monitoringStacks;
    private readonly incidents;
    private readonly register;
    constructor();
    deployMonitoringStack(name: string, cluster: string, namespace: string, configuration: MonitoringConfiguration): Promise<MonitoringStack>;
    createDashboard(stackId: string, dashboard: Omit<Dashboard, 'id'>): Promise<Dashboard>;
    createAlertRule(stackId: string, alertRule: Omit<AlertRule, 'id'>): Promise<AlertRule>;
    createSLO(stackId: string, slo: Omit<ServiceLevelObjective, 'id' | 'budget'>): Promise<ServiceLevelObjective>;
    getMonitoringMetrics(stackId: string): Promise<MonitoringMetrics>;
    executeQuery(stackId: string, query: string, datasource?: 'prometheus' | 'loki' | 'jaeger'): Promise<any>;
    setupAnomalyDetection(stackId: string, metrics: string[], sensitivity?: 'low' | 'medium' | 'high'): Promise<void>;
    createIncident(alertId: string, severity: 'critical' | 'high' | 'medium' | 'low', assignee?: string): Promise<Incident>;
    updateMonitoringStack(stackId: string, updates: Partial<MonitoringConfiguration>): Promise<MonitoringStack>;
    private generateDefaultDashboards;
    private generateDefaultAlertRules;
    private generateDefaultSLOs;
    private calculateErrorBudget;
    private updateComponent;
    private initializeMonitoring;
    private updateSLOBudgets;
    private performHealthChecks;
    private checkComponentHealth;
    getMonitoringStack(stackId: string): MonitoringStack | undefined;
    listMonitoringStacks(): MonitoringStack[];
    getIncident(incidentId: string): Incident | undefined;
    listIncidents(): Incident[];
    deleteMonitoringStack(stackId: string): Promise<void>;
    private deleteComponent;
}
//# sourceMappingURL=observability-engine.d.ts.map