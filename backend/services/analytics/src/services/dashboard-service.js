"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardService = void 0;
const client_1 = require("@prisma/client");
const ioredis_1 = require("ioredis");
const config_1 = require("@/config");
const logger_1 = require("@/utils/logger");
class DashboardService {
    prisma;
    redis;
    config;
    updateTimer;
    activeConnections = new Map();
    isInitialized = false;
    constructor() {
        this.prisma = new client_1.PrismaClient();
        this.redis = new ioredis_1.Redis({
            host: config_1.config.redis.host,
            port: config_1.config.redis.port,
            password: config_1.config.redis.password,
            db: config_1.config.redis.dashboardDb || 7
        });
        this.config = {
            enableRealTimeUpdates: true,
            updateInterval: 5000,
            maxDataPoints: 1000,
            enableAlerts: true,
            cacheTimeout: 60
        };
        this.initialize();
    }
    async initialize() {
        try {
            await this.redis.ping();
            if (this.config.enableRealTimeUpdates) {
                this.startRealtimeUpdates();
            }
            await this.initializeDefaultDashboards();
            this.isInitialized = true;
            logger_1.analyticsLogger.event('dashboard_service_initialized', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'dashboard_service_initialization' });
            throw error;
        }
    }
    async createDashboard(name, description, widgets, isPublic = false, createdBy) {
        try {
            const dashboard = {
                id: crypto.randomUUID(),
                name,
                description,
                widgets,
                filters: [],
                isPublic,
                createdBy,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            await this.storeDashboard(dashboard);
            for (const widget of widgets) {
                await this.initializeWidgetData(dashboard.id, widget);
            }
            logger_1.analyticsLogger.event('dashboard_created', {
                dashboardId: dashboard.id,
                name,
                widgetCount: widgets.length
            });
            return dashboard;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'create_dashboard',
                name
            });
            throw error;
        }
    }
    async getDashboard(dashboardId, includeData = true) {
        try {
            const cached = await this.redis.get(`dashboard:${dashboardId}`);
            if (cached && !includeData) {
                return JSON.parse(cached);
            }
            const dashboard = await this.getDashboardFromDB(dashboardId);
            if (!dashboard) {
                return null;
            }
            if (includeData) {
                for (const widget of dashboard.widgets) {
                    widget.data = await this.getWidgetData(dashboardId, widget.id);
                }
            }
            await this.redis.setex(`dashboard:${dashboardId}`, this.config.cacheTimeout, JSON.stringify(dashboard));
            return dashboard;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_dashboard',
                dashboardId
            });
            throw error;
        }
    }
    async getExecutiveDashboard() {
        try {
            const dashboard = await this.getDashboard('executive-dashboard');
            if (!dashboard) {
                return await this.createExecutiveDashboard();
            }
            return dashboard;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'get_executive_dashboard' });
            throw error;
        }
    }
    async getOperationalDashboard() {
        try {
            const dashboard = await this.getDashboard('operational-dashboard');
            if (!dashboard) {
                return await this.createOperationalDashboard();
            }
            return dashboard;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'get_operational_dashboard' });
            throw error;
        }
    }
    async getRealtimePerformanceMetrics() {
        try {
            const metrics = {
                web: await this.getPlatformMetrics('web'),
                mobile: await this.getPlatformMetrics('mobile'),
                extension: await this.getPlatformMetrics('extension'),
                api: await this.getPlatformMetrics('api'),
                overall: await this.getOverallSystemMetrics()
            };
            return {
                timestamp: new Date(),
                platforms: metrics,
                alerts: await this.getActiveAlerts(),
                slaStatus: await this.getSLAStatus()
            };
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'get_realtime_performance_metrics' });
            throw error;
        }
    }
    async createMonitoringRule(name, platform, metricType, threshold, condition, severity, recipients) {
        try {
            const rule = {
                id: crypto.randomUUID(),
                name,
                platform,
                metricType,
                condition,
                threshold,
                severity,
                enabled: true,
                recipients,
                cooldownPeriod: 15,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            await this.storeMonitoringRule(rule);
            await this.startMonitoring(rule);
            logger_1.analyticsLogger.event('monitoring_rule_created', {
                ruleId: rule.id,
                name,
                platform,
                metricType
            });
            return rule;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'create_monitoring_rule',
                name
            });
            throw error;
        }
    }
    async createSLATarget(name, platform, metricType, target, tolerance, timeframe) {
        try {
            const slaTarget = {
                id: crypto.randomUUID(),
                name,
                platform,
                metricType,
                target,
                tolerance,
                timeframe,
                status: 'met',
                currentValue: 0,
                compliance: 100,
                lastUpdated: new Date()
            };
            await this.storeSLATarget(slaTarget);
            await this.startSLAMonitoring(slaTarget);
            logger_1.analyticsLogger.event('sla_target_created', {
                slaId: slaTarget.id,
                name,
                platform,
                target
            });
            return slaTarget;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'create_sla_target',
                name
            });
            throw error;
        }
    }
    async getPerformanceTrends(platform, metricType, timeRange) {
        try {
            const historicalData = await this.getHistoricalPerformanceData(platform, metricType, timeRange);
            const trend = this.calculateTrend(historicalData);
            const performanceTrend = {
                metricType,
                platform,
                trend: trend.direction,
                changePercentage: trend.changePercentage,
                timeRange,
                confidence: trend.confidence,
                factors: await this.identifyTrendFactors(platform, metricType, trend)
            };
            return performanceTrend;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_performance_trends',
                platform,
                metricType
            });
            throw error;
        }
    }
    subscribeToUpdates(dashboardId, callback) {
        const subscriptionId = crypto.randomUUID();
        this.activeConnections.set(subscriptionId, {
            dashboardId,
            callback,
            lastUpdate: new Date()
        });
        logger_1.analyticsLogger.event('dashboard_subscription_created', {
            subscriptionId,
            dashboardId
        });
        return subscriptionId;
    }
    unsubscribeFromUpdates(subscriptionId) {
        this.activeConnections.delete(subscriptionId);
        logger_1.analyticsLogger.event('dashboard_subscription_removed', {
            subscriptionId
        });
    }
    startRealtimeUpdates() {
        this.updateTimer = setInterval(async () => {
            try {
                await this.processRealtimeUpdates();
            }
            catch (error) {
                logger_1.analyticsLogger.error(error, { context: 'realtime_updates_processing' });
            }
        }, this.config.updateInterval);
        logger_1.analyticsLogger.event('realtime_updates_started', {});
    }
    async processRealtimeUpdates() {
        for (const [subscriptionId, connection] of this.activeConnections) {
            try {
                const dashboard = await this.getDashboard(connection.dashboardId, false);
                if (!dashboard)
                    continue;
                for (const widget of dashboard.widgets) {
                    const latestData = await this.getWidgetData(dashboard.id, widget.id);
                    const lastUpdateKey = `widget:${widget.id}:last_update`;
                    const lastUpdate = await this.redis.get(lastUpdateKey);
                    const currentHash = this.hashData(latestData);
                    if (lastUpdate !== currentHash) {
                        const update = {
                            dashboardId: dashboard.id,
                            widgetId: widget.id,
                            data: latestData,
                            timestamp: new Date()
                        };
                        connection.callback(update);
                        await this.redis.set(lastUpdateKey, currentHash);
                    }
                }
            }
            catch (error) {
                logger_1.analyticsLogger.error(error, {
                    context: 'process_subscription_update',
                    subscriptionId
                });
            }
        }
    }
    async initializeDefaultDashboards() {
        try {
            const executiveDashboard = await this.getDashboard('executive-dashboard');
            if (!executiveDashboard) {
                await this.createExecutiveDashboard();
            }
            const operationalDashboard = await this.getDashboard('operational-dashboard');
            if (!operationalDashboard) {
                await this.createOperationalDashboard();
            }
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'initialize_default_dashboards' });
        }
    }
    async createExecutiveDashboard() {
        const widgets = [
            {
                id: 'revenue-metric',
                type: 'metric_card',
                title: 'Monthly Recurring Revenue',
                size: { width: 4, height: 2 },
                position: { x: 0, y: 0 },
                configuration: {
                    metrics: ['mrr'],
                    dimensions: [],
                    filters: [],
                    timeRange: { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                    aggregation: 'sum',
                    visualization: { showTrendLine: true }
                },
                dataSource: { type: 'revenue_data' }
            },
            {
                id: 'active-users-chart',
                type: 'line_chart',
                title: 'Daily Active Users',
                size: { width: 8, height: 4 },
                position: { x: 4, y: 0 },
                configuration: {
                    metrics: ['active_users'],
                    dimensions: ['date'],
                    filters: [],
                    timeRange: { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                    aggregation: 'count',
                    visualization: { showTrendLine: true, showGrid: true }
                },
                dataSource: { type: 'user_metrics' }
            },
            {
                id: 'document-analysis-funnel',
                type: 'funnel',
                title: 'Document Analysis Funnel',
                size: { width: 6, height: 4 },
                position: { x: 0, y: 4 },
                configuration: {
                    metrics: ['funnel_conversion'],
                    dimensions: ['funnel_step'],
                    filters: [],
                    timeRange: { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), end: new Date() },
                    aggregation: 'count',
                    visualization: {}
                },
                dataSource: { type: 'analytics_events' }
            },
            {
                id: 'platform-usage-pie',
                type: 'pie_chart',
                title: 'Platform Usage Distribution',
                size: { width: 6, height: 4 },
                position: { x: 6, y: 4 },
                configuration: {
                    metrics: ['session_count'],
                    dimensions: ['platform'],
                    filters: [],
                    timeRange: { start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), end: new Date() },
                    aggregation: 'count',
                    visualization: { showLegend: true }
                },
                dataSource: { type: 'analytics_events' }
            }
        ];
        return await this.createDashboard('Executive Dashboard', 'High-level business metrics and KPIs', widgets, false, 'system');
    }
    async createOperationalDashboard() {
        const widgets = [
            {
                id: 'api-response-time',
                type: 'line_chart',
                title: 'API Response Time (p95)',
                size: { width: 6, height: 3 },
                position: { x: 0, y: 0 },
                configuration: {
                    metrics: ['api_response_time_p95'],
                    dimensions: ['timestamp'],
                    filters: [],
                    timeRange: { start: new Date(Date.now() - 2 * 60 * 60 * 1000), end: new Date() },
                    aggregation: 'avg',
                    visualization: { showTrendLine: true, showGrid: true }
                },
                dataSource: { type: 'custom_query', query: 'SELECT * FROM performance_metrics WHERE platform = \'api\'' }
            },
            {
                id: 'error-rate-metric',
                type: 'metric_card',
                title: 'Error Rate',
                size: { width: 3, height: 2 },
                position: { x: 6, y: 0 },
                configuration: {
                    metrics: ['error_rate'],
                    dimensions: [],
                    filters: [],
                    timeRange: { start: new Date(Date.now() - 60 * 60 * 1000), end: new Date() },
                    aggregation: 'avg',
                    visualization: {}
                },
                dataSource: { type: 'custom_query' }
            },
            {
                id: 'system-health-heatmap',
                type: 'heatmap',
                title: 'System Health by Service',
                size: { width: 9, height: 4 },
                position: { x: 0, y: 3 },
                configuration: {
                    metrics: ['health_score'],
                    dimensions: ['service', 'timestamp'],
                    filters: [],
                    timeRange: { start: new Date(Date.now() - 24 * 60 * 60 * 1000), end: new Date() },
                    aggregation: 'avg',
                    visualization: { colorScheme: ['green', 'yellow', 'red'] }
                },
                dataSource: { type: 'custom_query' }
            },
            {
                id: 'sla-compliance-table',
                type: 'table',
                title: 'SLA Compliance Status',
                size: { width: 12, height: 3 },
                position: { x: 0, y: 7 },
                configuration: {
                    metrics: ['sla_compliance'],
                    dimensions: ['sla_name', 'target', 'current_value', 'status'],
                    filters: [],
                    timeRange: { start: new Date(Date.now() - 24 * 60 * 60 * 1000), end: new Date() },
                    aggregation: 'avg',
                    visualization: {}
                },
                dataSource: { type: 'custom_query' }
            }
        ];
        return await this.createDashboard('Operational Dashboard', 'System performance and operational metrics', widgets, false, 'system');
    }
    async getPlatformMetrics(platform) {
        try {
            const realtimeKey = `realtime:performance:${platform}`;
            const cached = await this.redis.get(realtimeKey);
            if (cached) {
                return JSON.parse(cached);
            }
            return {
                platform,
                timestamp: new Date(),
                totalMetrics: 0,
                averagePerformance: 0,
                status: 'unknown'
            };
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'get_platform_metrics', platform });
            return null;
        }
    }
    async getOverallSystemMetrics() {
        return {
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            timestamp: new Date()
        };
    }
    async getActiveAlerts() {
        try {
            const alertsKey = 'active_alerts';
            const alerts = await this.redis.lrange(alertsKey, 0, -1);
            return alerts.map(alert => JSON.parse(alert));
        }
        catch (error) {
            return [];
        }
    }
    async getSLAStatus() {
        return [];
    }
    calculateTrend(data) {
        if (data.length < 2) {
            return { direction: 'stable', changePercentage: 0, confidence: 0 };
        }
        const firstValue = data[0].value;
        const lastValue = data[data.length - 1].value;
        const changePercentage = ((lastValue - firstValue) / firstValue) * 100;
        let direction = 'stable';
        if (Math.abs(changePercentage) > 5) {
            direction = changePercentage > 0 ? 'improving' : 'degrading';
        }
        return {
            direction,
            changePercentage: Math.abs(changePercentage),
            confidence: Math.min(data.length / 10, 1)
        };
    }
    hashData(data) {
        return Buffer.from(JSON.stringify(data)).toString('base64').substring(0, 16);
    }
    async storeDashboard(dashboard) {
    }
    async getDashboardFromDB(dashboardId) {
        return null;
    }
    async initializeWidgetData(dashboardId, widget) {
    }
    async getWidgetData(dashboardId, widgetId) {
        return {};
    }
    async storeMonitoringRule(rule) {
    }
    async startMonitoring(rule) {
    }
    async storeSLATarget(target) {
    }
    async startSLAMonitoring(target) {
    }
    async getHistoricalPerformanceData(platform, metricType, timeRange) {
        return [];
    }
    async identifyTrendFactors(platform, metricType, trend) {
        return [];
    }
    async shutdown() {
        try {
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
            }
            await this.prisma.$disconnect();
            await this.redis.quit();
            logger_1.analyticsLogger.event('dashboard_service_shutdown', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'shutdown_dashboard_service' });
        }
    }
}
exports.dashboardService = new DashboardService();
//# sourceMappingURL=dashboard-service.js.map