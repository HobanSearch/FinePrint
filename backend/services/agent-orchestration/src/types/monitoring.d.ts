import { AgentType } from './agent';
export declare enum AlertSeverity {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare enum AlertStatus {
    ACTIVE = "active",
    ACKNOWLEDGED = "acknowledged",
    RESOLVED = "resolved",
    SUPPRESSED = "suppressed"
}
export declare enum MetricType {
    COUNTER = "counter",
    GAUGE = "gauge",
    HISTOGRAM = "histogram",
    SUMMARY = "summary"
}
export interface SystemMetrics {
    timestamp: Date;
    orchestrator: {
        activeWorkflows: number;
        totalAgents: number;
        healthyAgents: number;
        unhealthyAgents: number;
        messageQueue: {
            size: number;
            processed: number;
            failed: number;
            throughput: number;
        };
        resources: {
            cpu: number;
            memory: number;
            storage: number;
            networkIO: number;
        };
    };
    agents: Array<{
        id: string;
        type: AgentType;
        status: string;
        metrics: {
            cpu: number;
            memory: number;
            activeTasks: number;
            throughput: number;
            errorRate: number;
            responseTime: number;
        };
    }>;
    workflows: Array<{
        id: string;
        status: string;
        duration: number;
        tasksTotal: number;
        tasksCompleted: number;
        tasksFailed: number;
    }>;
}
export interface MetricDefinition {
    name: string;
    type: MetricType;
    description: string;
    unit: string;
    labels: string[];
    aggregations: Array<'sum' | 'avg' | 'min' | 'max' | 'count'>;
    retention: number;
    exporters: string[];
}
export interface AlertRule {
    id: string;
    name: string;
    description: string;
    query: string;
    condition: string;
    severity: AlertSeverity;
    duration: number;
    enabled: boolean;
    tags: string[];
    annotations: Record<string, string>;
    notificationChannels: string[];
    escalationPolicy?: string;
    suppressionRules: SuppressionRule[];
    createdAt: Date;
    updatedAt: Date;
}
export interface SuppressionRule {
    condition: string;
    duration: number;
    reason: string;
}
export interface Alert {
    id: string;
    ruleId: string;
    status: AlertStatus;
    severity: AlertSeverity;
    summary: string;
    description: string;
    labels: Record<string, string>;
    annotations: Record<string, string>;
    startsAt: Date;
    endsAt?: Date;
    acknowledgedAt?: Date;
    acknowledgedBy?: string;
    resolvedAt?: Date;
    resolvedBy?: string;
    notificationsSent: NotificationRecord[];
    escalationLevel: number;
    metadata: Record<string, any>;
}
export interface NotificationRecord {
    id: string;
    alertId: string;
    channel: string;
    status: 'sent' | 'failed' | 'delivered' | 'acknowledged';
    sentAt: Date;
    deliveredAt?: Date;
    error?: string;
    metadata: Record<string, any>;
}
export interface Dashboard {
    id: string;
    name: string;
    description: string;
    category: string;
    panels: DashboardPanel[];
    variables: DashboardVariable[];
    timeRange: {
        from: string;
        to: string;
    };
    refreshInterval: string;
    tags: string[];
    isPublic: boolean;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface DashboardPanel {
    id: string;
    title: string;
    type: 'graph' | 'stat' | 'table' | 'heatmap' | 'gauge' | 'text' | 'logs';
    position: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    queries: PanelQuery[];
    options: Record<string, any>;
    thresholds?: Array<{
        value: number;
        color: string;
        operator: 'gt' | 'lt';
    }>;
}
export interface PanelQuery {
    query: string;
    legend: string;
    refId: string;
    datasource: string;
    interval?: string;
}
export interface DashboardVariable {
    name: string;
    type: 'query' | 'constant' | 'datasource' | 'interval';
    query?: string;
    options?: Array<{
        text: string;
        value: string;
    }>;
    current: {
        text: string;
        value: string;
    };
    multiSelect: boolean;
    includeAll: boolean;
}
export interface HealthCheck {
    id: string;
    name: string;
    type: 'http' | 'tcp' | 'grpc' | 'script';
    target: string;
    interval: number;
    timeout: number;
    retries: number;
    expectedStatus?: number;
    expectedResponse?: string;
    headers?: Record<string, string>;
    enabled: boolean;
    lastCheck?: Date;
    status: 'healthy' | 'unhealthy' | 'unknown';
    consecutiveFailures: number;
    metadata: Record<string, any>;
}
export interface ServiceLevelObjective {
    id: string;
    name: string;
    description: string;
    service: string;
    indicator: {
        type: 'availability' | 'latency' | 'error_rate' | 'throughput';
        query: string;
        threshold: number;
        unit: string;
    };
    objective: {
        target: number;
        period: string;
    };
    errorBudget: {
        remaining: number;
        burnRate: number;
        exhaustionDate?: Date;
    };
    alerting: {
        burnRateThreshold: number;
        lookbackWindow: string;
    };
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface PerformanceProfile {
    id: string;
    name: string;
    type: 'agent' | 'workflow' | 'system';
    targetId: string;
    baseline: PerformanceBaseline;
    currentMetrics: PerformanceSnapshot;
    trends: Array<{
        timestamp: Date;
        metrics: PerformanceSnapshot;
    }>;
    anomalies: PerformanceAnomaly[];
    recommendations: PerformanceRecommendation[];
    lastUpdated: Date;
}
export interface PerformanceBaseline {
    cpu: {
        avg: number;
        p95: number;
        p99: number;
    };
    memory: {
        avg: number;
        max: number;
    };
    responseTime: {
        avg: number;
        p95: number;
        p99: number;
    };
    throughput: {
        avg: number;
        max: number;
    };
    errorRate: {
        avg: number;
        max: number;
    };
    availability: {
        avg: number;
        min: number;
    };
}
export interface PerformanceSnapshot {
    timestamp: Date;
    cpu: number;
    memory: number;
    responseTime: number;
    throughput: number;
    errorRate: number;
    availability: number;
    customMetrics: Record<string, number>;
}
export interface PerformanceAnomaly {
    id: string;
    type: 'spike' | 'dip' | 'trend' | 'outlier';
    metric: string;
    severity: 'low' | 'medium' | 'high';
    detectedAt: Date;
    description: string;
    impact: string;
    possibleCauses: string[];
    resolved: boolean;
    resolvedAt?: Date;
}
export interface PerformanceRecommendation {
    id: string;
    type: 'scaling' | 'optimization' | 'configuration' | 'resource_allocation';
    priority: 'low' | 'medium' | 'high';
    description: string;
    expectedImpact: {
        performance: number;
        cost: number;
        reliability: number;
    };
    implementation: {
        complexity: 'low' | 'medium' | 'high';
        estimatedTime: string;
        risks: string[];
    };
    createdAt: Date;
    implementedAt?: Date;
}
export interface MonitoringConfiguration {
    id: string;
    name: string;
    targets: Array<{
        type: 'agent' | 'workflow' | 'resource' | 'system';
        id: string;
        metrics: string[];
    }>;
    collectors: Array<{
        type: 'prometheus' | 'grafana' | 'jaeger' | 'loki';
        config: Record<string, any>;
    }>;
    retention: {
        metrics: number;
        logs: number;
        traces: number;
    };
    alerting: {
        enabled: boolean;
        rules: string[];
        channels: string[];
    };
    exporters: Array<{
        type: 'datadog' | 'newrelic' | 'elasticsearch';
        config: Record<string, any>;
    }>;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=monitoring.d.ts.map