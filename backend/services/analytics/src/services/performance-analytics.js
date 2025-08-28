"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.performanceAnalyticsService = void 0;
const client_1 = require("@prisma/client");
const ioredis_1 = require("ioredis");
const config_1 = require("@/config");
const logger_1 = require("@/utils/logger");
class PerformanceAnalyticsService {
    prisma;
    redis;
    isInitialized = false;
    alertingEnabled = true;
    performanceThresholds;
    constructor() {
        this.prisma = new client_1.PrismaClient();
        this.redis = new ioredis_1.Redis({
            host: config_1.config.redis.host,
            port: config_1.config.redis.port,
            password: config_1.config.redis.password,
            db: config_1.config.redis.performanceDb || 5
        });
        this.performanceThresholds = {
            web: {
                firstContentfulPaint: 1800,
                largestContentfulPaint: 2500,
                firstInputDelay: 100,
                cumulativeLayoutShift: 0.1,
                timeToInteractive: 3800,
                totalBlockingTime: 300
            },
            mobile: {
                appStartTime: 2000,
                frameDropRate: 5,
                memoryUsage: 200,
                batteryDrain: 10,
                networkRequests: 50
            },
            extension: {
                contentScriptInjection: 50,
                backgroundScriptMemory: 50,
                pageImpact: 100,
                analysisTime: 5000
            },
            api: {
                responseTime: 200,
                throughput: 1000,
                errorRate: 1,
                documentAnalysisTime: 5000
            }
        };
        this.initialize();
    }
    async initialize() {
        try {
            await this.redis.ping();
            this.isInitialized = true;
            this.startPerformanceMonitoring();
            logger_1.analyticsLogger.event('performance_analytics_initialized', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'performance_analytics_initialization' });
            throw error;
        }
    }
    async trackPerformanceMetric(metric) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        try {
            const redisKey = `perf:${metric.platform}:${metric.metricType}`;
            await this.redis.zadd(redisKey, Date.now(), JSON.stringify(metric));
            await this.redis.expire(redisKey, 86400);
            await this.storePerformanceMetric(metric);
            await this.checkPerformanceThresholds(metric);
            await this.updateRealtimeDashboard(metric);
            logger_1.analyticsLogger.event('performance_metric_tracked', {
                platform: metric.platform,
                metricType: metric.metricType,
                value: metric.value
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'track_performance_metric',
                platform: metric.platform,
                metricType: metric.metricType
            });
            throw error;
        }
    }
    async trackWebVitals(userId, metrics) {
        try {
            for (const metric of metrics) {
                const performanceMetric = {
                    id: crypto.randomUUID(),
                    userId,
                    platform: 'web',
                    metricType: metric.name,
                    value: metric.value,
                    timestamp: new Date(),
                    context: {
                        url: metric.url,
                        userAgent: metric.userAgent,
                        connection: metric.connection,
                        deviceType: metric.deviceType,
                        viewportSize: metric.viewportSize
                    }
                };
                await this.trackPerformanceMetric(performanceMetric);
            }
            const webVitalsScore = this.calculateWebVitalsScore(metrics);
            await this.trackPerformanceMetric({
                id: crypto.randomUUID(),
                userId,
                platform: 'web',
                metricType: 'web_vitals_score',
                value: webVitalsScore,
                timestamp: new Date(),
                context: { url: metrics[0]?.url }
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'track_web_vitals',
                userId: this.hashUserId(userId)
            });
            throw error;
        }
    }
    async trackMobilePerformance(userId, metrics) {
        try {
            const performanceMetrics = [
                {
                    id: crypto.randomUUID(),
                    userId,
                    platform: 'mobile',
                    metricType: 'app_start_time',
                    value: metrics.appStartTime,
                    timestamp: new Date(),
                    context: {
                        platform: metrics.platform,
                        osVersion: metrics.osVersion,
                        deviceModel: metrics.deviceModel
                    }
                },
                {
                    id: crypto.randomUUID(),
                    userId,
                    platform: 'mobile',
                    metricType: 'memory_usage',
                    value: metrics.memoryUsage,
                    timestamp: new Date(),
                    context: {
                        available: metrics.availableMemory,
                        totalMemory: metrics.totalMemory
                    }
                },
                {
                    id: crypto.randomUUID(),
                    userId,
                    platform: 'mobile',
                    metricType: 'battery_drain',
                    value: metrics.batteryDrain,
                    timestamp: new Date(),
                    context: {
                        batteryLevel: metrics.batteryLevel,
                        isCharging: metrics.isCharging
                    }
                },
                {
                    id: crypto.randomUUID(),
                    userId,
                    platform: 'mobile',
                    metricType: 'frame_drop_rate',
                    value: metrics.frameDropRate,
                    timestamp: new Date(),
                    context: { screen: metrics.screen }
                }
            ];
            for (const metric of performanceMetrics) {
                await this.trackPerformanceMetric(metric);
            }
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'track_mobile_performance',
                userId: this.hashUserId(userId)
            });
            throw error;
        }
    }
    async trackExtensionPerformance(userId, metrics) {
        try {
            const performanceMetrics = [
                {
                    id: crypto.randomUUID(),
                    userId,
                    platform: 'extension',
                    metricType: 'content_script_injection',
                    value: metrics.contentScriptInjectionTime,
                    timestamp: new Date(),
                    context: {
                        url: metrics.url,
                        browser: metrics.browser,
                        version: metrics.version
                    }
                },
                {
                    id: crypto.randomUUID(),
                    userId,
                    platform: 'extension',
                    metricType: 'background_memory',
                    value: metrics.backgroundScriptMemory,
                    timestamp: new Date(),
                    context: { tabsCount: metrics.activeTabsCount }
                },
                {
                    id: crypto.randomUUID(),
                    userId,
                    platform: 'extension',
                    metricType: 'page_impact',
                    value: metrics.pageLoadImpact,
                    timestamp: new Date(),
                    context: {
                        url: metrics.url,
                        pageSize: metrics.pageSize
                    }
                },
                {
                    id: crypto.randomUUID(),
                    userId,
                    platform: 'extension',
                    metricType: 'analysis_time',
                    value: metrics.analysisTime,
                    timestamp: new Date(),
                    context: {
                        documentType: metrics.documentType,
                        documentSize: metrics.documentSize
                    }
                }
            ];
            for (const metric of performanceMetrics) {
                await this.trackPerformanceMetric(metric);
            }
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'track_extension_performance',
                userId: this.hashUserId(userId)
            });
            throw error;
        }
    }
    async getPerformanceDashboard(platform, timeRange = '24h') {
        try {
            const timeRangeMs = this.parseTimeRange(timeRange);
            const since = new Date(Date.now() - timeRangeMs);
            const [metrics, alerts, regressions] = await Promise.all([
                this.getPerformanceMetrics(platform, since),
                this.getActiveAlerts(platform),
                this.getPerformanceRegressions(platform, since)
            ]);
            const dashboard = {
                platform,
                timeRange,
                summary: {
                    totalMetrics: metrics.length,
                    averagePerformance: this.calculateAveragePerformance(metrics),
                    alertsCount: alerts.length,
                    regressionsCount: regressions.length
                },
                metrics: this.groupMetricsByType(metrics),
                alerts,
                regressions,
                recommendations: await this.generatePerformanceRecommendations(platform, metrics),
                trends: this.calculatePerformanceTrends(metrics),
                budgetStatus: await this.checkPerformanceBudgets(platform)
            };
            return dashboard;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_performance_dashboard',
                platform
            });
            throw error;
        }
    }
    async generatePerformanceRecommendations(platform, metrics) {
        try {
            const recommendations = [];
            const metricsByType = this.groupMetricsByType(metrics);
            if (platform === 'web') {
                if (this.getAverageValue(metricsByType.largest_contentful_paint) > this.performanceThresholds.web.largestContentfulPaint) {
                    recommendations.push({
                        id: crypto.randomUUID(),
                        type: 'optimization',
                        priority: 'high',
                        title: 'Optimize Largest Contentful Paint',
                        description: 'LCP is above the 2.5s threshold. Consider optimizing images, critical CSS loading, and server response times.',
                        impact: 'high',
                        effort: 'medium',
                        actions: [
                            'Optimize and compress images',
                            'Implement critical CSS inlining',
                            'Use CDN for static assets',
                            'Optimize server response times'
                        ],
                        estimatedImprovement: '25-40% LCP reduction',
                        platform: 'web'
                    });
                }
                if (this.getAverageValue(metricsByType.first_input_delay) > this.performanceThresholds.web.firstInputDelay) {
                    recommendations.push({
                        id: crypto.randomUUID(),
                        type: 'optimization',
                        priority: 'high',
                        title: 'Reduce First Input Delay',
                        description: 'FID is above the 100ms threshold. Consider code splitting and reducing JavaScript execution time.',
                        impact: 'high',
                        effort: 'high',
                        actions: [
                            'Implement code splitting',
                            'Reduce JavaScript bundle size',
                            'Use web workers for heavy computations',
                            'Defer non-critical JavaScript'
                        ],
                        estimatedImprovement: '30-50% FID reduction',
                        platform: 'web'
                    });
                }
            }
            if (platform === 'mobile') {
                if (this.getAverageValue(metricsByType.app_start_time) > this.performanceThresholds.mobile.appStartTime) {
                    recommendations.push({
                        id: crypto.randomUUID(),
                        type: 'optimization',
                        priority: 'high',
                        title: 'Optimize App Start Time',
                        description: 'App start time is above the 2s threshold. Consider lazy loading and reducing initial bundle size.',
                        impact: 'high',
                        effort: 'medium',
                        actions: [
                            'Implement lazy loading for screens',
                            'Optimize initial bundle size',
                            'Use React.lazy for component loading',
                            'Minimize synchronous operations on startup'
                        ],
                        estimatedImprovement: '20-35% start time reduction',
                        platform: 'mobile'
                    });
                }
                if (this.getAverageValue(metricsByType.memory_usage) > this.performanceThresholds.mobile.memoryUsage) {
                    recommendations.push({
                        id: crypto.randomUUID(),
                        type: 'optimization',
                        priority: 'medium',
                        title: 'Optimize Memory Usage',
                        description: 'Memory usage is above the 200MB threshold. Consider implementing memory management strategies.',
                        impact: 'medium',
                        effort: 'medium',
                        actions: [
                            'Implement image caching with size limits',
                            'Use FlatList for large data sets',
                            'Clear unused data from memory',
                            'Optimize component re-renders'
                        ],
                        estimatedImprovement: '15-25% memory reduction',
                        platform: 'mobile'
                    });
                }
            }
            if (platform === 'extension') {
                if (this.getAverageValue(metricsByType.content_script_injection) > this.performanceThresholds.extension.contentScriptInjection) {
                    recommendations.push({
                        id: crypto.randomUUID(),
                        type: 'optimization',
                        priority: 'high',
                        title: 'Optimize Content Script Injection',
                        description: 'Content script injection time is above the 50ms threshold. Consider lazy injection and code optimization.',
                        impact: 'high',
                        effort: 'medium',
                        actions: [
                            'Implement lazy content script injection',
                            'Minimize content script bundle size',
                            'Use event-driven injection instead of always-on',
                            'Optimize DOM queries and manipulation'
                        ],
                        estimatedImprovement: '40-60% injection time reduction',
                        platform: 'extension'
                    });
                }
            }
            return recommendations;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'generate_performance_recommendations',
                platform
            });
            return [];
        }
    }
    async checkPerformanceBudgets(platform) {
        try {
            const budgets = [];
            const recentMetrics = await this.getPerformanceMetrics(platform, new Date(Date.now() - 86400000));
            const thresholds = this.performanceThresholds[platform];
            for (const [metricType, threshold] of Object.entries(thresholds)) {
                const metrics = recentMetrics.filter(m => m.metricType === metricType);
                if (metrics.length === 0)
                    continue;
                const averageValue = this.getAverageValue(metrics);
                const p95Value = this.getPercentileValue(metrics, 95);
                const isWithinBudget = p95Value <= threshold;
                budgets.push({
                    metricType,
                    threshold,
                    currentValue: averageValue,
                    p95Value,
                    isWithinBudget,
                    compliance: isWithinBudget ? 100 : Math.max(0, (1 - (p95Value - threshold) / threshold) * 100),
                    trend: this.calculateMetricTrend(metrics)
                });
            }
            return budgets;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'check_performance_budgets',
                platform
            });
            return [];
        }
    }
    async detectPerformanceRegressions(platform) {
        try {
            const regressions = [];
            const currentMetrics = await this.getPerformanceMetrics(platform, new Date(Date.now() - 86400000));
            const baselineMetrics = await this.getPerformanceMetrics(platform, new Date(Date.now() - 604800000), new Date(Date.now() - 86400000));
            const currentByType = this.groupMetricsByType(currentMetrics);
            const baselineByType = this.groupMetricsByType(baselineMetrics);
            for (const metricType of Object.keys(currentByType)) {
                if (!baselineByType[metricType])
                    continue;
                const currentAvg = this.getAverageValue(currentByType[metricType]);
                const baselineAvg = this.getAverageValue(baselineByType[metricType]);
                const regressionThreshold = 0.15;
                const change = (currentAvg - baselineAvg) / baselineAvg;
                if (change > regressionThreshold) {
                    regressions.push({
                        id: crypto.randomUUID(),
                        platform,
                        metricType,
                        baselineValue: baselineAvg,
                        currentValue: currentAvg,
                        regressionPercentage: change * 100,
                        detectedAt: new Date(),
                        severity: change > 0.3 ? 'high' : change > 0.2 ? 'medium' : 'low',
                        affectedUsers: currentByType[metricType].length,
                        possibleCauses: this.identifyPossibleCauses(metricType, change)
                    });
                }
            }
            for (const regression of regressions) {
                await this.storePerformanceRegression(regression);
            }
            return regressions;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'detect_performance_regressions',
                platform
            });
            return [];
        }
    }
    startPerformanceMonitoring() {
        setInterval(async () => {
            try {
                const platforms = ['web', 'mobile', 'extension', 'api'];
                for (const platform of platforms) {
                    await this.detectPerformanceRegressions(platform);
                }
            }
            catch (error) {
                logger_1.analyticsLogger.error(error, { context: 'automated_regression_detection' });
            }
        }, 3600000);
        setInterval(async () => {
            try {
                await this.updateRealtimeMetrics();
            }
            catch (error) {
                logger_1.analyticsLogger.error(error, { context: 'automated_realtime_metrics' });
            }
        }, 300000);
        logger_1.analyticsLogger.event('performance_monitoring_started', {});
    }
    async storePerformanceMetric(metric) {
        try {
            await this.prisma.$executeRaw `
        INSERT INTO performance_metrics (
          id, user_id, platform, metric_type, value, timestamp, context, created_at
        ) VALUES (
          ${metric.id},
          ${metric.userId},
          ${metric.platform},
          ${metric.metricType},
          ${metric.value},
          ${metric.timestamp.toISOString()},
          ${JSON.stringify(metric.context)},
          NOW()
        )
      `;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'store_performance_metric' });
        }
    }
    async checkPerformanceThresholds(metric) {
        const thresholds = this.performanceThresholds[metric.platform];
        if (!thresholds)
            return;
        const threshold = thresholds[metric.metricType];
        if (!threshold)
            return;
        if (metric.value > threshold) {
            const alert = {
                id: crypto.randomUUID(),
                platform: metric.platform,
                metricType: metric.metricType,
                threshold,
                actualValue: metric.value,
                severity: metric.value > threshold * 1.5 ? 'critical' : 'warning',
                createdAt: new Date(),
                userId: metric.userId,
                context: metric.context
            };
            await this.createPerformanceAlert(alert);
        }
    }
    async createPerformanceAlert(alert) {
        try {
            await this.prisma.$executeRaw `
        INSERT INTO performance_alerts (
          id, platform, metric_type, threshold, actual_value, severity, 
          user_id, context, created_at
        ) VALUES (
          ${alert.id},
          ${alert.platform},
          ${alert.metricType},
          ${alert.threshold},
          ${alert.actualValue},
          ${alert.severity},
          ${alert.userId},
          ${JSON.stringify(alert.context)},
          NOW()
        )
      `;
            await this.redis.publish('performance_alerts', JSON.stringify(alert));
            logger_1.analyticsLogger.event('performance_alert_created', {
                platform: alert.platform,
                metricType: alert.metricType,
                severity: alert.severity
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'create_performance_alert' });
        }
    }
    async updateRealtimeDashboard(metric) {
        try {
            const dashboardKey = `dashboard:performance:${metric.platform}`;
            const update = {
                metricType: metric.metricType,
                value: metric.value,
                timestamp: metric.timestamp.toISOString(),
                userId: this.hashUserId(metric.userId)
            };
            await this.redis.lpush(dashboardKey, JSON.stringify(update));
            await this.redis.ltrim(dashboardKey, 0, 999);
            await this.redis.expire(dashboardKey, 3600);
            await this.redis.publish(`dashboard:${metric.platform}`, JSON.stringify(update));
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'update_realtime_dashboard' });
        }
    }
    calculateWebVitalsScore(metrics) {
        let score = 0;
        let metricCount = 0;
        for (const metric of metrics) {
            let metricScore = 0;
            switch (metric.name) {
                case 'FCP':
                    metricScore = metric.value <= 1800 ? 100 : metric.value <= 3000 ? 75 : 0;
                    break;
                case 'LCP':
                    metricScore = metric.value <= 2500 ? 100 : metric.value <= 4000 ? 75 : 0;
                    break;
                case 'FID':
                    metricScore = metric.value <= 100 ? 100 : metric.value <= 300 ? 75 : 0;
                    break;
                case 'CLS':
                    metricScore = metric.value <= 0.1 ? 100 : metric.value <= 0.25 ? 75 : 0;
                    break;
            }
            score += metricScore;
            metricCount++;
        }
        return metricCount > 0 ? Math.round(score / metricCount) : 0;
    }
    parseTimeRange(timeRange) {
        const ranges = {
            '1h': 3600000,
            '24h': 86400000,
            '7d': 604800000,
            '30d': 2592000000
        };
        return ranges[timeRange] || 86400000;
    }
    async getPerformanceMetrics(platform, since, until) {
        const untilDate = until || new Date();
        const results = await this.prisma.$queryRaw `
      SELECT id, user_id, platform, metric_type, value, timestamp, context
      FROM performance_metrics 
      WHERE platform = ${platform}
        AND timestamp >= ${since.toISOString()}
        AND timestamp <= ${untilDate.toISOString()}
      ORDER BY timestamp DESC
      LIMIT 10000
    `;
        return results.map((row) => ({
            id: row.id,
            userId: row.user_id,
            platform: row.platform,
            metricType: row.metric_type,
            value: row.value,
            timestamp: new Date(row.timestamp),
            context: row.context
        }));
    }
    async getActiveAlerts(platform) {
        const results = await this.prisma.$queryRaw `
      SELECT id, platform, metric_type, threshold, actual_value, severity, 
             user_id, context, created_at
      FROM performance_alerts 
      WHERE platform = ${platform}
        AND created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
    `;
        return results.map((row) => ({
            id: row.id,
            platform: row.platform,
            metricType: row.metric_type,
            threshold: row.threshold,
            actualValue: row.actual_value,
            severity: row.severity,
            userId: row.user_id,
            context: row.context,
            createdAt: new Date(row.created_at)
        }));
    }
    async getPerformanceRegressions(platform, since) {
        const results = await this.prisma.$queryRaw `
      SELECT id, platform, metric_type, baseline_value, current_value, 
             regression_percentage, detected_at, severity, affected_users, possible_causes
      FROM performance_regressions 
      WHERE platform = ${platform}
        AND detected_at >= ${since.toISOString()}
      ORDER BY detected_at DESC
    `;
        return results.map((row) => ({
            id: row.id,
            platform: row.platform,
            metricType: row.metric_type,
            baselineValue: row.baseline_value,
            currentValue: row.current_value,
            regressionPercentage: row.regression_percentage,
            detectedAt: new Date(row.detected_at),
            severity: row.severity,
            affectedUsers: row.affected_users,
            possibleCauses: row.possible_causes
        }));
    }
    groupMetricsByType(metrics) {
        return metrics.reduce((acc, metric) => {
            if (!acc[metric.metricType]) {
                acc[metric.metricType] = [];
            }
            acc[metric.metricType].push(metric);
            return acc;
        }, {});
    }
    getAverageValue(metrics) {
        if (metrics.length === 0)
            return 0;
        return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
    }
    getPercentileValue(metrics, percentile) {
        if (metrics.length === 0)
            return 0;
        const sorted = metrics.map(m => m.value).sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index];
    }
    calculateAveragePerformance(metrics) {
        return this.getAverageValue(metrics);
    }
    calculatePerformanceTrends(metrics) {
        const metricsByType = this.groupMetricsByType(metrics);
        const trends = {};
        for (const [type, typeMetrics] of Object.entries(metricsByType)) {
            trends[type] = this.calculateMetricTrend(typeMetrics);
        }
        return trends;
    }
    calculateMetricTrend(metrics) {
        if (metrics.length < 10)
            return 'stable';
        const sorted = metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
        const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
        const firstAvg = this.getAverageValue(firstHalf);
        const secondAvg = this.getAverageValue(secondHalf);
        const change = (secondAvg - firstAvg) / firstAvg;
        if (change > 0.1)
            return 'degrading';
        if (change < -0.1)
            return 'improving';
        return 'stable';
    }
    identifyPossibleCauses(metricType, regressionPercentage) {
        const causes = {
            'largest_contentful_paint': [
                'Larger images or assets added',
                'Server response time increased',
                'CSS blocking rendering',
                'Network conditions degraded'
            ],
            'first_input_delay': [
                'JavaScript bundle size increased',
                'Heavy computations on main thread',
                'Third-party scripts blocking',
                'Unoptimized event handlers'
            ],
            'app_start_time': [
                'App bundle size increased',
                'Additional startup logic',
                'Device performance degraded',
                'Network dependency added'
            ],
            'memory_usage': [
                'Memory leaks introduced',
                'Larger data structures',
                'Images not being released',
                'Component cleanup issues'
            ]
        };
        return causes[metricType] || ['Unknown cause - investigate recent changes'];
    }
    async storePerformanceRegression(regression) {
        try {
            await this.prisma.$executeRaw `
        INSERT INTO performance_regressions (
          id, platform, metric_type, baseline_value, current_value, 
          regression_percentage, detected_at, severity, affected_users, possible_causes
        ) VALUES (
          ${regression.id},
          ${regression.platform},
          ${regression.metricType},
          ${regression.baselineValue},
          ${regression.currentValue},
          ${regression.regressionPercentage},
          ${regression.detectedAt.toISOString()},
          ${regression.severity},
          ${regression.affectedUsers},
          ${JSON.stringify(regression.possibleCauses)}
        )
      `;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'store_performance_regression' });
        }
    }
    async updateRealtimeMetrics() {
        try {
            const platforms = ['web', 'mobile', 'extension', 'api'];
            for (const platform of platforms) {
                const recentMetrics = await this.getPerformanceMetrics(platform, new Date(Date.now() - 300000));
                const summary = {
                    platform,
                    timestamp: new Date().toISOString(),
                    totalMetrics: recentMetrics.length,
                    averagePerformance: this.calculateAveragePerformance(recentMetrics),
                    metricsByType: this.groupMetricsByType(recentMetrics)
                };
                await this.redis.set(`realtime:performance:${platform}`, JSON.stringify(summary), 'EX', 300);
                await this.redis.publish(`realtime:performance`, JSON.stringify(summary));
            }
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'update_realtime_metrics' });
        }
    }
    hashUserId(userId) {
        return Buffer.from(userId).toString('base64').substring(0, 8);
    }
    async shutdown() {
        try {
            await this.prisma.$disconnect();
            await this.redis.quit();
            logger_1.analyticsLogger.event('performance_analytics_shutdown', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'shutdown_performance_analytics' });
        }
    }
}
exports.performanceAnalyticsService = new PerformanceAnalyticsService();
//# sourceMappingURL=performance-analytics.js.map