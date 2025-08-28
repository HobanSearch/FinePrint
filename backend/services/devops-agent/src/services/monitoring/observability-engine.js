"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservabilityEngine = void 0;
const events_1 = require("events");
const prometheus = __importStar(require("prom-client"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("@/utils/logger");
const prometheus_manager_1 = require("./prometheus-manager");
const grafana_manager_1 = require("./grafana-manager");
const alert_manager_1 = require("./alert-manager");
const log_aggregator_1 = require("./log-aggregator");
const tracing_manager_1 = require("./tracing-manager");
const metrics_collector_1 = require("./metrics-collector");
const slo_manager_1 = require("./slo-manager");
const anomaly_detector_1 = require("./anomaly-detector");
const logger = (0, logger_1.createContextLogger)('Observability-Engine');
class ObservabilityEngine extends events_1.EventEmitter {
    prometheusManager;
    grafanaManager;
    alertManager;
    logAggregator;
    tracingManager;
    metricsCollector;
    sloManager;
    anomalyDetector;
    monitoringStacks = new Map();
    incidents = new Map();
    register;
    constructor() {
        super();
        this.prometheusManager = new prometheus_manager_1.PrometheusManager();
        this.grafanaManager = new grafana_manager_1.GrafanaManager();
        this.alertManager = new alert_manager_1.AlertManager();
        this.logAggregator = new log_aggregator_1.LogAggregator();
        this.tracingManager = new tracing_manager_1.TracingManager();
        this.metricsCollector = new metrics_collector_1.MetricsCollector();
        this.sloManager = new slo_manager_1.SLOManager();
        this.anomalyDetector = new anomaly_detector_1.AnomalyDetector();
        this.register = new prometheus.Registry();
        prometheus.collectDefaultMetrics({ register: this.register });
        this.initializeMonitoring();
    }
    async deployMonitoringStack(name, cluster, namespace, configuration) {
        const stackId = `stack-${Date.now()}`;
        logger.info(`Deploying monitoring stack: ${name} to cluster: ${cluster}`);
        try {
            const stack = {
                id: stackId,
                name,
                cluster,
                namespace,
                status: 'deploying',
                components: [],
                configuration,
                dashboards: [],
                alerts: [],
                slos: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            this.monitoringStacks.set(stackId, stack);
            const prometheus = await this.prometheusManager.deploy(cluster, namespace, configuration);
            stack.components.push(prometheus);
            const grafana = await this.grafanaManager.deploy(cluster, namespace, configuration);
            stack.components.push(grafana);
            const alertmanager = await this.alertManager.deploy(cluster, namespace, configuration.alerting);
            stack.components.push(alertmanager);
            if (configuration.logging.enabled) {
                const logging = await this.logAggregator.deploy(cluster, namespace, configuration.logging);
                stack.components.push(logging);
            }
            if (configuration.tracing.enabled) {
                const tracing = await this.tracingManager.deploy(cluster, namespace, configuration.tracing);
                stack.components.push(tracing);
            }
            stack.dashboards = await this.generateDefaultDashboards();
            stack.alerts = await this.generateDefaultAlertRules();
            stack.slos = await this.generateDefaultSLOs();
            stack.status = 'active';
            stack.updatedAt = new Date();
            this.emit('monitoringStackDeployed', stack);
            logger.info(`Monitoring stack ${name} deployed successfully`);
            return stack;
        }
        catch (error) {
            logger.error(`Failed to deploy monitoring stack ${name}:`, error);
            throw error;
        }
    }
    async createDashboard(stackId, dashboard) {
        const stack = this.monitoringStacks.get(stackId);
        if (!stack) {
            throw new Error(`Monitoring stack not found: ${stackId}`);
        }
        const dashboardId = `dashboard-${Date.now()}`;
        const newDashboard = {
            id: dashboardId,
            ...dashboard,
        };
        logger.info(`Creating dashboard: ${dashboard.name}`);
        try {
            await this.grafanaManager.createDashboard(newDashboard);
            stack.dashboards.push(newDashboard);
            stack.updatedAt = new Date();
            this.emit('dashboardCreated', newDashboard);
            logger.info(`Dashboard ${dashboard.name} created successfully`);
            return newDashboard;
        }
        catch (error) {
            logger.error(`Failed to create dashboard ${dashboard.name}:`, error);
            throw error;
        }
    }
    async createAlertRule(stackId, alertRule) {
        const stack = this.monitoringStacks.get(stackId);
        if (!stack) {
            throw new Error(`Monitoring stack not found: ${stackId}`);
        }
        const alertId = `alert-${Date.now()}`;
        const newAlert = {
            id: alertId,
            ...alertRule,
        };
        logger.info(`Creating alert rule: ${alertRule.name}`);
        try {
            await this.prometheusManager.createAlertRule(newAlert);
            stack.alerts.push(newAlert);
            stack.updatedAt = new Date();
            this.emit('alertRuleCreated', newAlert);
            logger.info(`Alert rule ${alertRule.name} created successfully`);
            return newAlert;
        }
        catch (error) {
            logger.error(`Failed to create alert rule ${alertRule.name}:`, error);
            throw error;
        }
    }
    async createSLO(stackId, slo) {
        const stack = this.monitoringStacks.get(stackId);
        if (!stack) {
            throw new Error(`Monitoring stack not found: ${stackId}`);
        }
        const sloId = `slo-${Date.now()}`;
        const newSLO = {
            id: sloId,
            budget: this.calculateErrorBudget(slo.objective, slo.window),
            ...slo,
        };
        logger.info(`Creating SLO: ${slo.name}`);
        try {
            await this.sloManager.createSLO(newSLO);
            stack.slos.push(newSLO);
            stack.updatedAt = new Date();
            this.emit('sloCreated', newSLO);
            logger.info(`SLO ${slo.name} created successfully`);
            return newSLO;
        }
        catch (error) {
            logger.error(`Failed to create SLO ${slo.name}:`, error);
            throw error;
        }
    }
    async getMonitoringMetrics(stackId) {
        const stack = this.monitoringStacks.get(stackId);
        if (!stack) {
            throw new Error(`Monitoring stack not found: ${stackId}`);
        }
        try {
            const metrics = await this.metricsCollector.collectAllMetrics();
            return metrics;
        }
        catch (error) {
            logger.error('Failed to collect monitoring metrics:', error);
            throw error;
        }
    }
    async executeQuery(stackId, query, datasource = 'prometheus') {
        const stack = this.monitoringStacks.get(stackId);
        if (!stack) {
            throw new Error(`Monitoring stack not found: ${stackId}`);
        }
        try {
            switch (datasource) {
                case 'prometheus':
                    return await this.prometheusManager.executeQuery(query);
                case 'loki':
                    return await this.logAggregator.executeQuery(query);
                case 'jaeger':
                    return await this.tracingManager.executeQuery(query);
                default:
                    throw new Error(`Unsupported datasource: ${datasource}`);
            }
        }
        catch (error) {
            logger.error(`Failed to execute query: ${query}`, error);
            throw error;
        }
    }
    async setupAnomalyDetection(stackId, metrics, sensitivity = 'medium') {
        const stack = this.monitoringStacks.get(stackId);
        if (!stack) {
            throw new Error(`Monitoring stack not found: ${stackId}`);
        }
        logger.info(`Setting up anomaly detection for stack: ${stack.name}`);
        try {
            await this.anomalyDetector.setup(metrics, sensitivity);
            this.emit('anomalyDetectionConfigured', stack);
            logger.info(`Anomaly detection configured for stack ${stack.name}`);
        }
        catch (error) {
            logger.error(`Failed to setup anomaly detection:`, error);
            throw error;
        }
    }
    async createIncident(alertId, severity, assignee) {
        const incidentId = `incident-${Date.now()}`;
        const incident = {
            id: incidentId,
            title: `Incident from alert ${alertId}`,
            severity,
            status: 'open',
            service: 'unknown',
            alertRule: alertId,
            startTime: new Date(),
            assignee,
            description: 'Auto-generated incident from alert',
            timeline: [{
                    timestamp: new Date(),
                    type: 'created',
                    user: 'system',
                    message: 'Incident created from alert',
                }],
        };
        this.incidents.set(incidentId, incident);
        this.emit('incidentCreated', incident);
        logger.info(`Incident ${incidentId} created from alert ${alertId}`);
        return incident;
    }
    async updateMonitoringStack(stackId, updates) {
        const stack = this.monitoringStacks.get(stackId);
        if (!stack) {
            throw new Error(`Monitoring stack not found: ${stackId}`);
        }
        logger.info(`Updating monitoring stack: ${stack.name}`);
        try {
            stack.status = 'updating';
            stack.configuration = { ...stack.configuration, ...updates };
            for (const component of stack.components) {
                await this.updateComponent(component, updates);
            }
            stack.status = 'active';
            stack.updatedAt = new Date();
            this.emit('monitoringStackUpdated', stack);
            logger.info(`Monitoring stack ${stack.name} updated successfully`);
            return stack;
        }
        catch (error) {
            stack.status = 'failed';
            logger.error(`Failed to update monitoring stack ${stack.name}:`, error);
            throw error;
        }
    }
    async generateDefaultDashboards() {
        return [
            {
                id: 'infrastructure-overview',
                name: 'Infrastructure Overview',
                category: 'infrastructure',
                panels: [],
                variables: [],
                annotations: [],
                tags: ['infrastructure', 'overview'],
                description: 'High-level infrastructure metrics',
            },
            {
                id: 'application-performance',
                name: 'Application Performance',
                category: 'application',
                panels: [],
                variables: [],
                annotations: [],
                tags: ['application', 'performance'],
                description: 'Application performance metrics',
            },
            {
                id: 'business-metrics',
                name: 'Business Metrics',
                category: 'business',
                panels: [],
                variables: [],
                annotations: [],
                tags: ['business', 'kpi'],
                description: 'Key business metrics and KPIs',
            },
        ];
    }
    async generateDefaultAlertRules() {
        return [
            {
                id: 'high-cpu-usage',
                name: 'High CPU Usage',
                query: 'cpu_usage_percent > 80',
                condition: {
                    type: 'threshold',
                    operator: 'gt',
                    value: 80,
                    duration: '5m',
                },
                severity: 'warning',
                frequency: '1m',
                timeout: '5m',
                labels: { category: 'infrastructure' },
                annotations: { description: 'CPU usage is above 80%' },
                notifications: ['default'],
            },
            {
                id: 'service-down',
                name: 'Service Down',
                query: 'up == 0',
                condition: {
                    type: 'threshold',
                    operator: 'eq',
                    value: 0,
                    duration: '1m',
                },
                severity: 'critical',
                frequency: '30s',
                timeout: '1m',
                labels: { category: 'availability' },
                annotations: { description: 'Service is down' },
                notifications: ['critical'],
            },
        ];
    }
    async generateDefaultSLOs() {
        return [
            {
                id: 'api-availability',
                name: 'API Availability',
                service: 'api',
                description: 'API should be available 99.9% of the time',
                objective: 0.999,
                window: '30d',
                indicators: [{
                        name: 'availability',
                        type: 'availability',
                        query: 'up',
                        thresholds: [{
                                type: 'good',
                                operator: 'eq',
                                value: 1,
                            }],
                    }],
                alerting: {
                    burnRateRules: [{
                            window: '1h',
                            burnRate: 14.4,
                            severity: 'critical',
                        }],
                    errorBudgetRules: [{
                            remaining: 10,
                            severity: 'warning',
                        }],
                },
                budget: this.calculateErrorBudget(0.999, '30d'),
            },
        ];
    }
    calculateErrorBudget(objective, window) {
        const allowedFailureRate = 1 - objective;
        const totalBudget = allowedFailureRate * 100;
        return {
            remaining: totalBudget,
            consumed: 0,
            total: totalBudget,
            burnRate: 0,
            projectedDaysToExhaustion: 0,
        };
    }
    async updateComponent(component, updates) {
        logger.debug(`Updating component: ${component.name}`);
    }
    async initializeMonitoring() {
        await this.metricsCollector.start();
        await this.anomalyDetector.start();
        setInterval(async () => {
            await this.updateSLOBudgets();
        }, 60000);
        setInterval(async () => {
            await this.performHealthChecks();
        }, 30000);
    }
    async updateSLOBudgets() {
        for (const stack of this.monitoringStacks.values()) {
            for (const slo of stack.slos) {
                try {
                    slo.budget = await this.sloManager.calculateErrorBudget(slo);
                }
                catch (error) {
                    logger.error(`Failed to update SLO budget for ${slo.name}:`, error);
                }
            }
        }
    }
    async performHealthChecks() {
        for (const stack of this.monitoringStacks.values()) {
            for (const component of stack.components) {
                try {
                    const isHealthy = await this.checkComponentHealth(component);
                    if (!isHealthy) {
                        logger.warn(`Component ${component.name} is unhealthy`);
                    }
                }
                catch (error) {
                    logger.error(`Health check failed for ${component.name}:`, error);
                }
            }
        }
    }
    async checkComponentHealth(component) {
        try {
            const response = await axios_1.default.get(`${component.endpoint}/health`, {
                timeout: 5000,
            });
            return response.status === 200;
        }
        catch (error) {
            return false;
        }
    }
    getMonitoringStack(stackId) {
        return this.monitoringStacks.get(stackId);
    }
    listMonitoringStacks() {
        return Array.from(this.monitoringStacks.values());
    }
    getIncident(incidentId) {
        return this.incidents.get(incidentId);
    }
    listIncidents() {
        return Array.from(this.incidents.values());
    }
    async deleteMonitoringStack(stackId) {
        const stack = this.monitoringStacks.get(stackId);
        if (!stack) {
            throw new Error(`Monitoring stack not found: ${stackId}`);
        }
        logger.info(`Deleting monitoring stack: ${stack.name}`);
        try {
            stack.status = 'terminating';
            for (const component of stack.components) {
                await this.deleteComponent(component);
            }
            this.monitoringStacks.delete(stackId);
            this.emit('monitoringStackDeleted', stack);
            logger.info(`Monitoring stack ${stack.name} deleted successfully`);
        }
        catch (error) {
            logger.error(`Failed to delete monitoring stack ${stack.name}:`, error);
            throw error;
        }
    }
    async deleteComponent(component) {
        logger.debug(`Deleting component: ${component.name}`);
    }
}
exports.ObservabilityEngine = ObservabilityEngine;
//# sourceMappingURL=observability-engine.js.map