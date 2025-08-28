import { config } from '../config';
import { logger } from '../utils/logger';

export interface GrafanaDashboard {
  uid: string;
  title: string;
  tags: string[];
  timezone: string;
  panels: GrafanaPanel[];
  templating?: {
    list: GrafanaVariable[];
  };
  time?: {
    from: string;
    to: string;
  };
  refresh?: string;
}

export interface GrafanaPanel {
  id: number;
  title: string;
  type: 'graph' | 'stat' | 'gauge' | 'table' | 'heatmap' | 'alert-list' | 'logs';
  gridPos: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  targets: GrafanaTarget[];
  alert?: GrafanaAlert;
  options?: any;
  fieldConfig?: any;
}

export interface GrafanaTarget {
  expr: string;
  refId: string;
  legendFormat?: string;
  interval?: string;
}

export interface GrafanaAlert {
  name: string;
  conditions: any[];
  noDataState: string;
  executionErrorState: string;
  frequency: string;
  handler: number;
  notifications: any[];
}

export interface GrafanaVariable {
  name: string;
  type: string;
  query: string;
  regex?: string;
  multi?: boolean;
  includeAll?: boolean;
}

/**
 * Initialize Grafana dashboards for Fine Print AI monitoring
 */
export async function initializeGrafana(): Promise<void> {
  try {
    await createSystemOverviewDashboard();
    await createAIModelPerformanceDashboard();
    await createSLOComplianceDashboard();
    await createIncidentResponseDashboard();
    await createBusinessMetricsDashboard();
    await createCapacityPlanningDashboard();
    
    logger.info('Grafana dashboards initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Grafana dashboards', error);
    throw error;
  }
}

/**
 * System Overview Dashboard
 */
async function createSystemOverviewDashboard(): Promise<void> {
  const dashboard: GrafanaDashboard = {
    uid: 'fineprint-system-overview',
    title: 'Fine Print AI - System Overview',
    tags: ['fineprint', 'system', 'overview'],
    timezone: 'browser',
    refresh: '10s',
    time: {
      from: 'now-1h',
      to: 'now',
    },
    templating: {
      list: [
        {
          name: 'service',
          type: 'query',
          query: 'label_values(up, job)',
          multi: true,
          includeAll: true,
        },
        {
          name: 'instance',
          type: 'query',
          query: 'label_values(up{job=~"$service"}, instance)',
          multi: true,
          includeAll: true,
        },
      ],
    },
    panels: [
      // Row 1: Key Metrics
      {
        id: 1,
        title: 'Uptime',
        type: 'stat',
        gridPos: { x: 0, y: 0, w: 4, h: 4 },
        targets: [
          {
            expr: '(1 - (sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m])))) * 100',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percent',
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'red', value: 0 },
                { color: 'yellow', value: 99 },
                { color: 'green', value: 99.9 },
              ],
            },
          },
        },
      },
      {
        id: 2,
        title: 'Request Rate',
        type: 'stat',
        gridPos: { x: 4, y: 0, w: 4, h: 4 },
        targets: [
          {
            expr: 'sum(rate(http_requests_total[5m]))',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'reqps',
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: 0 },
                { color: 'yellow', value: 1000 },
                { color: 'red', value: 5000 },
              ],
            },
          },
        },
      },
      {
        id: 3,
        title: 'Error Rate',
        type: 'stat',
        gridPos: { x: 8, y: 0, w: 4, h: 4 },
        targets: [
          {
            expr: 'sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m])) * 100',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percent',
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: 0 },
                { color: 'yellow', value: 0.1 },
                { color: 'red', value: 1 },
              ],
            },
          },
        },
      },
      {
        id: 4,
        title: 'P95 Latency',
        type: 'stat',
        gridPos: { x: 12, y: 0, w: 4, h: 4 },
        targets: [
          {
            expr: 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'ms',
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: 0 },
                { color: 'yellow', value: 100 },
                { color: 'red', value: 200 },
              ],
            },
          },
        },
      },
      {
        id: 5,
        title: 'Active Users',
        type: 'stat',
        gridPos: { x: 16, y: 0, w: 4, h: 4 },
        targets: [
          {
            expr: 'sum(active_user_sessions)',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'short',
          },
        },
      },
      {
        id: 6,
        title: 'Documents/Hour',
        type: 'stat',
        gridPos: { x: 20, y: 0, w: 4, h: 4 },
        targets: [
          {
            expr: 'sum(rate(documents_processed_total[1h])) * 3600',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'short',
          },
        },
      },
      // Row 2: Request Metrics
      {
        id: 7,
        title: 'Request Rate by Service',
        type: 'graph',
        gridPos: { x: 0, y: 4, w: 12, h: 8 },
        targets: [
          {
            expr: 'sum(rate(http_requests_total[5m])) by (job)',
            refId: 'A',
            legendFormat: '{{job}}',
          },
        ],
      },
      {
        id: 8,
        title: 'Latency Distribution',
        type: 'heatmap',
        gridPos: { x: 12, y: 4, w: 12, h: 8 },
        targets: [
          {
            expr: 'sum(rate(http_request_duration_seconds_bucket[5m])) by (le)',
            refId: 'A',
          },
        ],
      },
      // Row 3: System Resources
      {
        id: 9,
        title: 'CPU Usage',
        type: 'graph',
        gridPos: { x: 0, y: 12, w: 8, h: 8 },
        targets: [
          {
            expr: 'instance:node_cpu_utilization:ratio * 100',
            refId: 'A',
            legendFormat: '{{instance}}',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percent',
            max: 100,
          },
        },
      },
      {
        id: 10,
        title: 'Memory Usage',
        type: 'graph',
        gridPos: { x: 8, y: 12, w: 8, h: 8 },
        targets: [
          {
            expr: 'instance:node_memory_utilization:ratio * 100',
            refId: 'A',
            legendFormat: '{{instance}}',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percent',
            max: 100,
          },
        },
      },
      {
        id: 11,
        title: 'Network I/O',
        type: 'graph',
        gridPos: { x: 16, y: 12, w: 8, h: 8 },
        targets: [
          {
            expr: 'rate(node_network_receive_bytes_total[5m])',
            refId: 'A',
            legendFormat: 'RX {{instance}}',
          },
          {
            expr: 'rate(node_network_transmit_bytes_total[5m])',
            refId: 'B',
            legendFormat: 'TX {{instance}}',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'Bps',
          },
        },
      },
    ],
  };

  await saveDashboard(dashboard);
}

/**
 * AI Model Performance Dashboard
 */
async function createAIModelPerformanceDashboard(): Promise<void> {
  const dashboard: GrafanaDashboard = {
    uid: 'fineprint-ai-models',
    title: 'Fine Print AI - Model Performance',
    tags: ['fineprint', 'ai', 'models'],
    timezone: 'browser',
    refresh: '10s',
    templating: {
      list: [
        {
          name: 'model_name',
          type: 'query',
          query: 'label_values(model_inference_latency_seconds_count, model_name)',
          multi: true,
          includeAll: true,
        },
        {
          name: 'model_version',
          type: 'query',
          query: 'label_values(model_inference_latency_seconds_count{model_name=~"$model_name"}, model_version)',
          multi: true,
          includeAll: true,
        },
      ],
    },
    panels: [
      {
        id: 1,
        title: 'Model Inference Rate',
        type: 'graph',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        targets: [
          {
            expr: 'sum(rate(model_inference_latency_seconds_count{model_name=~"$model_name"}[5m])) by (model_name)',
            refId: 'A',
            legendFormat: '{{model_name}}',
          },
        ],
      },
      {
        id: 2,
        title: 'Inference Latency P95',
        type: 'graph',
        gridPos: { x: 12, y: 0, w: 12, h: 8 },
        targets: [
          {
            expr: 'histogram_quantile(0.95, sum(rate(model_inference_latency_seconds_bucket{model_name=~"$model_name"}[5m])) by (le, model_name))',
            refId: 'A',
            legendFormat: '{{model_name}}',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 's',
          },
        },
      },
      {
        id: 3,
        title: 'Model Error Rate',
        type: 'graph',
        gridPos: { x: 0, y: 8, w: 12, h: 8 },
        targets: [
          {
            expr: 'sum(rate(model_inference_errors_total{model_name=~"$model_name"}[5m])) by (model_name, error_type)',
            refId: 'A',
            legendFormat: '{{model_name}} - {{error_type}}',
          },
        ],
      },
      {
        id: 4,
        title: 'GPU Utilization',
        type: 'gauge',
        gridPos: { x: 12, y: 8, w: 6, h: 8 },
        targets: [
          {
            expr: 'avg(gpu_utilization_percentage)',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percent',
            max: 100,
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: 0 },
                { color: 'yellow', value: 70 },
                { color: 'red', value: 90 },
              ],
            },
          },
        },
      },
      {
        id: 5,
        title: 'Model Memory Usage',
        type: 'graph',
        gridPos: { x: 18, y: 8, w: 6, h: 8 },
        targets: [
          {
            expr: 'sum(model_memory_usage_bytes{model_name=~"$model_name"}) by (model_name)',
            refId: 'A',
            legendFormat: '{{model_name}}',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'bytes',
          },
        },
      },
      {
        id: 6,
        title: 'Model Cache Hit Rate',
        type: 'graph',
        gridPos: { x: 0, y: 16, w: 12, h: 8 },
        targets: [
          {
            expr: 'model_cache_hit_rate{model_name=~"$model_name"}',
            refId: 'A',
            legendFormat: '{{model_name}}',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percentunit',
            max: 1,
          },
        },
      },
      {
        id: 7,
        title: 'Training Jobs',
        type: 'table',
        gridPos: { x: 12, y: 16, w: 12, h: 8 },
        targets: [
          {
            expr: 'training_job_queue_size',
            refId: 'A',
          },
        ],
      },
    ],
  };

  await saveDashboard(dashboard);
}

/**
 * SLO Compliance Dashboard
 */
async function createSLOComplianceDashboard(): Promise<void> {
  const dashboard: GrafanaDashboard = {
    uid: 'fineprint-slo-compliance',
    title: 'Fine Print AI - SLO Compliance',
    tags: ['fineprint', 'slo', 'compliance'],
    timezone: 'browser',
    refresh: '30s',
    panels: [
      {
        id: 1,
        title: 'Overall SLO Compliance',
        type: 'stat',
        gridPos: { x: 0, y: 0, w: 6, h: 4 },
        targets: [
          {
            expr: 'avg(slo_compliance_percentage)',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percent',
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'red', value: 0 },
                { color: 'yellow', value: 99 },
                { color: 'green', value: 99.9 },
              ],
            },
          },
        },
      },
      {
        id: 2,
        title: 'Error Budget Remaining',
        type: 'gauge',
        gridPos: { x: 6, y: 0, w: 6, h: 4 },
        targets: [
          {
            expr: 'avg(error_budget_remaining_percentage)',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percent',
            max: 100,
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'red', value: 0 },
                { color: 'yellow', value: 20 },
                { color: 'green', value: 50 },
              ],
            },
          },
        },
      },
      {
        id: 3,
        title: 'Burn Rate (1h)',
        type: 'stat',
        gridPos: { x: 12, y: 0, w: 6, h: 4 },
        targets: [
          {
            expr: 'max(error_budget_burn_rate{window="1h"})',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'short',
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: 0 },
                { color: 'yellow', value: 10 },
                { color: 'red', value: 14.4 },
              ],
            },
          },
        },
      },
      {
        id: 4,
        title: 'Service Availability',
        type: 'table',
        gridPos: { x: 18, y: 0, w: 6, h: 4 },
        targets: [
          {
            expr: 'slo_compliance_percentage{slo_type="availability"}',
            refId: 'A',
          },
        ],
      },
      {
        id: 5,
        title: 'SLO Compliance by Service',
        type: 'graph',
        gridPos: { x: 0, y: 4, w: 12, h: 8 },
        targets: [
          {
            expr: 'slo_compliance_percentage',
            refId: 'A',
            legendFormat: '{{service}} - {{slo_type}}',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'percent',
            max: 100,
            min: 95,
          },
        },
      },
      {
        id: 6,
        title: 'Error Budget Burn Rate',
        type: 'graph',
        gridPos: { x: 12, y: 4, w: 12, h: 8 },
        targets: [
          {
            expr: 'error_budget_burn_rate',
            refId: 'A',
            legendFormat: '{{service}} - {{window}}',
          },
        ],
      },
      {
        id: 7,
        title: 'Multi-Window Burn Rate Alert',
        type: 'alert-list',
        gridPos: { x: 0, y: 12, w: 24, h: 8 },
        options: {
          showOptions: 'current',
          maxItems: 10,
          sortOrder: 1,
          dashboardTags: [],
          dashboardFilter: '',
          alertName: '',
          folderId: null,
          stateFilter: {
            ok: false,
            paused: false,
            no_data: false,
            exec_error: false,
            alerting: true,
          },
        },
        targets: [],
      },
    ],
  };

  await saveDashboard(dashboard);
}

/**
 * Save dashboard to Grafana
 */
async function saveDashboard(dashboard: GrafanaDashboard): Promise<void> {
  try {
    const response = await fetch(`${config.grafana.url}/api/dashboards/db`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.grafana.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dashboard: dashboard,
        folderId: 0,
        overwrite: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save dashboard: ${response.statusText}`);
    }

    logger.info(`Dashboard ${dashboard.title} saved successfully`);
  } catch (error) {
    logger.error(`Failed to save dashboard ${dashboard.title}`, error);
    // Don't throw - dashboards can be imported manually
  }
}

/**
 * Create Incident Response Dashboard
 */
async function createIncidentResponseDashboard(): Promise<void> {
  const dashboard: GrafanaDashboard = {
    uid: 'fineprint-incident-response',
    title: 'Fine Print AI - Incident Response',
    tags: ['fineprint', 'incident', 'alerts'],
    timezone: 'browser',
    refresh: '10s',
    panels: [
      {
        id: 1,
        title: 'Active Incidents',
        type: 'stat',
        gridPos: { x: 0, y: 0, w: 6, h: 4 },
        targets: [
          {
            expr: 'count(ALERTS{alertstate="firing"})',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            thresholds: {
              mode: 'absolute',
              steps: [
                { color: 'green', value: 0 },
                { color: 'yellow', value: 1 },
                { color: 'red', value: 5 },
              ],
            },
          },
        },
      },
      {
        id: 2,
        title: 'MTTR (Last 7 Days)',
        type: 'stat',
        gridPos: { x: 6, y: 0, w: 6, h: 4 },
        targets: [
          {
            expr: 'avg(incident_resolution_time_seconds)',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 's',
          },
        },
      },
      {
        id: 3,
        title: 'Alert List',
        type: 'alert-list',
        gridPos: { x: 0, y: 4, w: 24, h: 12 },
        options: {
          showOptions: 'current',
          maxItems: 20,
        },
        targets: [],
      },
    ],
  };

  await saveDashboard(dashboard);
}

/**
 * Create Business Metrics Dashboard
 */
async function createBusinessMetricsDashboard(): Promise<void> {
  const dashboard: GrafanaDashboard = {
    uid: 'fineprint-business-metrics',
    title: 'Fine Print AI - Business Metrics',
    tags: ['fineprint', 'business', 'revenue'],
    timezone: 'browser',
    refresh: '1m',
    panels: [
      {
        id: 1,
        title: 'Documents Processed Today',
        type: 'stat',
        gridPos: { x: 0, y: 0, w: 6, h: 4 },
        targets: [
          {
            expr: 'sum(increase(documents_processed_total[1d]))',
            refId: 'A',
          },
        ],
      },
      {
        id: 2,
        title: 'Active Subscriptions',
        type: 'stat',
        gridPos: { x: 6, y: 0, w: 6, h: 4 },
        targets: [
          {
            expr: 'sum(subscription_revenue_usd)',
            refId: 'A',
          },
        ],
        fieldConfig: {
          defaults: {
            unit: 'currencyUSD',
          },
        },
      },
      {
        id: 3,
        title: 'Clauses Detected',
        type: 'graph',
        gridPos: { x: 0, y: 4, w: 24, h: 8 },
        targets: [
          {
            expr: 'sum(rate(clauses_detected_total[1h])) by (clause_type)',
            refId: 'A',
            legendFormat: '{{clause_type}}',
          },
        ],
      },
    ],
  };

  await saveDashboard(dashboard);
}

/**
 * Create Capacity Planning Dashboard
 */
async function createCapacityPlanningDashboard(): Promise<void> {
  const dashboard: GrafanaDashboard = {
    uid: 'fineprint-capacity-planning',
    title: 'Fine Print AI - Capacity Planning',
    tags: ['fineprint', 'capacity', 'scaling'],
    timezone: 'browser',
    refresh: '1m',
    panels: [
      {
        id: 1,
        title: 'Resource Utilization Forecast',
        type: 'graph',
        gridPos: { x: 0, y: 0, w: 24, h: 8 },
        targets: [
          {
            expr: 'predict_linear(instance:node_cpu_utilization:ratio[1h], 7*24*3600)',
            refId: 'A',
            legendFormat: 'CPU Forecast',
          },
          {
            expr: 'predict_linear(instance:node_memory_utilization:ratio[1h], 7*24*3600)',
            refId: 'B',
            legendFormat: 'Memory Forecast',
          },
        ],
      },
      {
        id: 2,
        title: 'Scaling Recommendations',
        type: 'table',
        gridPos: { x: 0, y: 8, w: 24, h: 8 },
        targets: [
          {
            expr: 'kube_deployment_status_replicas',
            refId: 'A',
          },
        ],
      },
    ],
  };

  await saveDashboard(dashboard);
}