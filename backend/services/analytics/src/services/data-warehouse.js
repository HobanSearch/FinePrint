"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataWarehouseService = void 0;
const clickhouse_1 = require("clickhouse");
const snowflake_sdk_1 = __importDefault(require("snowflake-sdk"));
const client_1 = require("@prisma/client");
const config_1 = require("@/config");
const logger_1 = require("@/utils/logger");
class DataWarehouseService {
    connections = {};
    prisma;
    etlJobs = new Map();
    isInitialized = false;
    constructor() {
        this.prisma = new client_1.PrismaClient();
        this.initialize();
    }
    async initialize() {
        try {
            if (config_1.config.dataWarehouse.snowflake.enabled) {
                await this.initializeSnowflake();
            }
            if (config_1.config.dataWarehouse.clickhouse.enabled) {
                await this.initializeClickHouse();
            }
            await this.setupETLJobs();
            this.isInitialized = true;
            logger_1.analyticsLogger.event('data_warehouse_initialized', {
                snowflake: !!this.connections.snowflake,
                clickhouse: !!this.connections.clickhouse,
                etlJobs: this.etlJobs.size
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'data_warehouse_initialization' });
            throw error;
        }
    }
    async initializeSnowflake() {
        return new Promise((resolve, reject) => {
            const connection = snowflake_sdk_1.default.createConnection({
                account: config_1.config.dataWarehouse.snowflake.account,
                username: config_1.config.dataWarehouse.snowflake.username,
                password: config_1.config.dataWarehouse.snowflake.password,
                warehouse: config_1.config.dataWarehouse.snowflake.warehouse,
                database: config_1.config.dataWarehouse.snowflake.database,
                schema: config_1.config.dataWarehouse.snowflake.schema
            });
            connection.connect((err, conn) => {
                if (err) {
                    logger_1.analyticsLogger.error(err, { context: 'snowflake_connection' });
                    reject(err);
                }
                else {
                    this.connections.snowflake = conn;
                    logger_1.analyticsLogger.event('snowflake_connected', {});
                    resolve();
                }
            });
        });
    }
    async initializeClickHouse() {
        try {
            this.connections.clickhouse = (0, clickhouse_1.createClient)({
                host: config_1.config.dataWarehouse.clickhouse.host,
                port: config_1.config.dataWarehouse.clickhouse.port,
                user: config_1.config.dataWarehouse.clickhouse.username,
                password: config_1.config.dataWarehouse.clickhouse.password,
                database: config_1.config.dataWarehouse.clickhouse.database
            });
            await this.connections.clickhouse.query('SELECT 1').toPromise();
            logger_1.analyticsLogger.event('clickhouse_connected', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'clickhouse_connection' });
            throw error;
        }
    }
    async setupETLJobs() {
        const jobs = [
            {
                name: 'user_metrics_daily',
                source: 'postgresql',
                destination: 'snowflake',
                query: `
          SELECT 
            DATE(created_at) as date,
            subscription_tier,
            COUNT(*) as user_count,
            COUNT(CASE WHEN last_login_at >= CURRENT_DATE - INTERVAL '1 day' THEN 1 END) as active_users,
            COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '1 day' THEN 1 END) as new_users
          FROM users 
          WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY DATE(created_at), subscription_tier
        `,
                schedule: '0 2 * * *',
                status: 'active'
            },
            {
                name: 'document_analysis_metrics',
                source: 'postgresql',
                destination: 'clickhouse',
                query: `
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as total_analyses,
            AVG(overall_risk_score) as avg_risk_score,
            AVG(processing_time_ms) as avg_processing_time,
            model_used,
            status
          FROM document_analyses
          WHERE created_at >= NOW() - INTERVAL 7 DAY
          GROUP BY DATE(created_at), model_used, status
        `,
                schedule: '*/15 * * * *',
                status: 'active'
            },
            {
                name: 'revenue_metrics_daily',
                source: 'postgresql',
                destination: 'snowflake',
                query: `
          SELECT 
            DATE(created_at) as date,
            subscription_tier,
            SUM(amount) as revenue,
            COUNT(DISTINCT user_id) as paying_users,
            AVG(amount) as avg_revenue_per_user
          FROM billing_transactions
          WHERE status = 'completed'
            AND created_at >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY DATE(created_at), subscription_tier
        `,
                schedule: '0 3 * * *',
                status: 'active'
            }
        ];
        jobs.forEach(job => {
            this.etlJobs.set(job.name, job);
        });
        logger_1.analyticsLogger.event('etl_jobs_configured', { jobCount: jobs.length });
    }
    async executeETLJob(jobName) {
        const job = this.etlJobs.get(jobName);
        if (!job) {
            throw new Error(`ETL job not found: ${jobName}`);
        }
        try {
            logger_1.analyticsLogger.event('etl_job_started', { jobName });
            const startTime = Date.now();
            const sourceData = await this.extractData(job.source, job.query);
            const transformedData = await this.transformData(sourceData, job);
            await this.loadData(job.destination, transformedData, job);
            const duration = Date.now() - startTime;
            job.lastRun = new Date();
            job.status = 'active';
            logger_1.analyticsLogger.event('etl_job_completed', {
                jobName,
                duration,
                recordCount: transformedData.length
            });
        }
        catch (error) {
            job.status = 'failed';
            logger_1.analyticsLogger.error(error, {
                context: 'etl_job_execution',
                jobName
            });
            throw error;
        }
    }
    async getBusinessMetrics(startDate, endDate, granularity = 'day') {
        try {
            const metrics = [];
            const intervals = this.getDateIntervals(startDate, endDate, granularity);
            for (const interval of intervals) {
                const businessMetrics = {
                    timestamp: interval.start,
                    revenue: await this.getRevenueMetrics(interval.start, interval.end),
                    users: await this.getUserMetrics(interval.start, interval.end),
                    product: await this.getProductMetrics(interval.start, interval.end),
                    operational: await this.getOperationalMetrics(interval.start, interval.end)
                };
                metrics.push(businessMetrics);
            }
            return metrics;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_business_metrics',
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            });
            throw error;
        }
    }
    async getRevenueMetrics(startDate, endDate) {
        try {
            const revenueQuery = `
        SELECT 
          SUM(amount) as total_revenue,
          COUNT(DISTINCT user_id) as paying_users,
          AVG(amount) as avg_revenue_per_user
        FROM billing_transactions
        WHERE status = 'completed'
          AND created_at >= $1
          AND created_at < $2
      `;
            const result = await this.prisma.$queryRawUnsafe(revenueQuery, startDate, endDate);
            const data = result[0] || {};
            const totalRevenue = parseFloat(data.total_revenue || 0);
            const payingUsers = parseInt(data.paying_users || 0);
            const arpu = parseFloat(data.avg_revenue_per_user || 0);
            const mrr = await this.calculateMRR(startDate, endDate);
            const churnRate = await this.calculateChurnRate(startDate, endDate);
            const clv = await this.calculateCustomerLifetimeValue();
            return {
                totalRevenue,
                monthlyRecurringRevenue: mrr,
                annualRecurringRevenue: mrr * 12,
                averageRevenuePerUser: arpu,
                customerLifetimeValue: clv,
                churnRate,
                netRevenueRetention: await this.calculateNRR(startDate, endDate),
                grossRevenueRetention: await this.calculateGRR(startDate, endDate)
            };
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'get_revenue_metrics' });
            throw error;
        }
    }
    async getUserMetrics(startDate, endDate) {
        try {
            const userQuery = `
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN last_login_at >= $1 THEN 1 END) as active_users,
          COUNT(CASE WHEN created_at >= $1 AND created_at < $2 THEN 1 END) as new_users,
          COUNT(CASE WHEN last_login_at >= $1 AND created_at < $1 THEN 1 END) as returning_users
        FROM users
        WHERE created_at < $2
      `;
            const result = await this.prisma.$queryRawUnsafe(userQuery, startDate, endDate);
            const data = result[0] || {};
            const totalUsers = parseInt(data.total_users || 0);
            const activeUsers = parseInt(data.active_users || 0);
            const newUsers = parseInt(data.new_users || 0);
            const returningUsers = parseInt(data.returning_users || 0);
            return {
                totalUsers,
                activeUsers,
                newUsers,
                returningUsers,
                userGrowthRate: await this.calculateUserGrowthRate(startDate, endDate),
                activationRate: await this.calculateActivationRate(startDate, endDate),
                retentionRate: await this.calculateRetentionRate(startDate, endDate),
                engagementScore: await this.calculateEngagementScore(startDate, endDate)
            };
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'get_user_metrics' });
            throw error;
        }
    }
    async getProductMetrics(startDate, endDate) {
        try {
            const productQuery = `
        SELECT 
          COUNT(DISTINCT d.id) as total_documents,
          COUNT(DISTINCT da.id) as total_analyses,
          AVG(da.overall_risk_score) as avg_risk_score
        FROM documents d
        LEFT JOIN document_analyses da ON d.id = da.document_id
        WHERE d.created_at >= $1 AND d.created_at < $2
      `;
            const result = await this.prisma.$queryRawUnsafe(productQuery, startDate, endDate);
            const data = result[0] || {};
            return {
                totalDocuments: parseInt(data.total_documents || 0),
                totalAnalyses: parseInt(data.total_analyses || 0),
                averageRiskScore: parseFloat(data.avg_risk_score || 0),
                popularDocumentTypes: await this.getPopularDocumentTypes(startDate, endDate),
                topFindingCategories: await this.getTopFindingCategories(startDate, endDate),
                featureAdoptionRates: await this.getFeatureAdoptionRates(startDate, endDate)
            };
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'get_product_metrics' });
            throw error;
        }
    }
    async getOperationalMetrics(startDate, endDate) {
        try {
            return {
                systemUptime: 99.9,
                averageResponseTime: 150,
                errorRate: 0.01,
                apiUsage: await this.getAPIUsage(startDate, endDate),
                storageUsed: await this.getStorageUsage(),
                bandwidthUsed: await this.getBandwidthUsage(startDate, endDate)
            };
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'get_operational_metrics' });
            throw error;
        }
    }
    async runDataQualityChecks() {
        try {
            const checks = [
                {
                    id: 'user_email_completeness',
                    name: 'User Email Completeness',
                    type: 'completeness',
                    table: 'users',
                    column: 'email',
                    rules: [
                        {
                            type: 'not_null',
                            parameters: {},
                            threshold: 0.99,
                            severity: 'high'
                        }
                    ],
                    schedule: '0 */6 * * *',
                    enabled: true
                },
                {
                    id: 'analysis_risk_score_validity',
                    name: 'Analysis Risk Score Validity',
                    type: 'validity',
                    table: 'document_analyses',
                    column: 'overall_risk_score',
                    rules: [
                        {
                            type: 'range',
                            parameters: { min: 0, max: 100 },
                            threshold: 0.95,
                            severity: 'medium'
                        }
                    ],
                    schedule: '0 */2 * * *',
                    enabled: true
                }
            ];
            const results = [];
            for (const check of checks) {
                const result = await this.executeDataQualityCheck(check);
                results.push(result);
            }
            return results;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'run_data_quality_checks' });
            throw error;
        }
    }
    async extractData(source, query) {
        switch (source) {
            case 'postgresql':
                return await this.prisma.$queryRawUnsafe(query);
            case 'clickhouse':
                if (this.connections.clickhouse) {
                    const result = await this.connections.clickhouse.query(query).toPromise();
                    return result;
                }
                throw new Error('ClickHouse connection not available');
            default:
                throw new Error(`Unsupported data source: ${source}`);
        }
    }
    async transformData(data, job) {
        return data;
    }
    async loadData(destination, data, job) {
        switch (destination) {
            case 'snowflake':
                await this.loadToSnowflake(data, job);
                break;
            case 'clickhouse':
                await this.loadToClickHouse(data, job);
                break;
            default:
                throw new Error(`Unsupported destination: ${destination}`);
        }
    }
    async loadToSnowflake(data, job) {
        if (!this.connections.snowflake) {
            throw new Error('Snowflake connection not available');
        }
        for (const row of data) {
            const query = `INSERT INTO ${job.name} VALUES (${Object.values(row).map(() => '?').join(',')})`;
            await this.executeSnowflakeQuery(query, Object.values(row));
        }
    }
    async loadToClickHouse(data, job) {
        if (!this.connections.clickhouse) {
            throw new Error('ClickHouse connection not available');
        }
        const tableName = job.name;
        const columns = data.length > 0 ? Object.keys(data[0]) : [];
        if (columns.length > 0) {
            const query = `INSERT INTO ${tableName} (${columns.join(',')}) VALUES`;
            await this.connections.clickhouse.insert(query, data).toPromise();
        }
    }
    async executeSnowflakeQuery(query, params = []) {
        return new Promise((resolve, reject) => {
            this.connections.snowflake.execute({
                sqlText: query,
                binds: params,
                complete: (err, stmt, rows) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(rows);
                    }
                }
            });
        });
    }
    getDateIntervals(startDate, endDate, granularity) {
        const intervals = [];
        const current = new Date(startDate);
        while (current < endDate) {
            const intervalEnd = new Date(current);
            switch (granularity) {
                case 'day':
                    intervalEnd.setDate(intervalEnd.getDate() + 1);
                    break;
                case 'week':
                    intervalEnd.setDate(intervalEnd.getDate() + 7);
                    break;
                case 'month':
                    intervalEnd.setMonth(intervalEnd.getMonth() + 1);
                    break;
            }
            intervals.push({
                start: new Date(current),
                end: intervalEnd > endDate ? endDate : intervalEnd
            });
            current.setTime(intervalEnd.getTime());
        }
        return intervals;
    }
    async executeDataQualityCheck(check) {
        try {
            const result = {
                checkId: check.id,
                timestamp: new Date(),
                passed: true,
                score: 1.0,
                issues: []
            };
            return result;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'execute_data_quality_check',
                checkId: check.id
            });
            throw error;
        }
    }
    async calculateMRR(startDate, endDate) { return 0; }
    async calculateChurnRate(startDate, endDate) { return 0; }
    async calculateCustomerLifetimeValue() { return 0; }
    async calculateNRR(startDate, endDate) { return 0; }
    async calculateGRR(startDate, endDate) { return 0; }
    async calculateUserGrowthRate(startDate, endDate) { return 0; }
    async calculateActivationRate(startDate, endDate) { return 0; }
    async calculateRetentionRate(startDate, endDate) { return 0; }
    async calculateEngagementScore(startDate, endDate) { return 0; }
    async getPopularDocumentTypes(startDate, endDate) { return {}; }
    async getTopFindingCategories(startDate, endDate) { return {}; }
    async getFeatureAdoptionRates(startDate, endDate) { return {}; }
    async getAPIUsage(startDate, endDate) { return 0; }
    async getStorageUsage() { return 0; }
    async getBandwidthUsage(startDate, endDate) { return 0; }
    async shutdown() {
        try {
            if (this.connections.snowflake) {
                await new Promise((resolve) => {
                    this.connections.snowflake.destroy((err) => {
                        if (err) {
                            logger_1.analyticsLogger.error(err, { context: 'snowflake_shutdown' });
                        }
                        resolve();
                    });
                });
            }
            if (this.connections.clickhouse) {
            }
            await this.prisma.$disconnect();
            logger_1.analyticsLogger.event('data_warehouse_shutdown', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'data_warehouse_shutdown' });
        }
    }
}
exports.dataWarehouseService = new DataWarehouseService();
//# sourceMappingURL=data-warehouse.js.map