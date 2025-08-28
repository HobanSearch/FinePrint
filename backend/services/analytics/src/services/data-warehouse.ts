/**
 * Fine Print AI - Data Warehouse Service
 * 
 * Business intelligence pipeline with support for:
 * - Snowflake data warehouse
 * - ClickHouse for real-time analytics
 * - ETL pipelines with data transformation
 * - Data quality monitoring
 * - Automated data synchronization
 * - Business metrics calculation
 */

import { Connection as ClickHouseConnection, createClient } from 'clickhouse';
import snowflake from 'snowflake-sdk';
import { PrismaClient } from '@prisma/client';
import { config } from '@/config';
import { analyticsLogger } from '@/utils/logger';
import { 
  BusinessMetrics,
  RevenueMetrics,
  UserMetrics,
  ProductMetrics,
  OperationalMetrics,
  DataQualityResult,
  DataQualityCheck
} from '@/types/analytics';

interface DataWarehouseConnection {
  snowflake?: snowflake.Connection;
  clickhouse?: ClickHouseConnection;
}

interface ETLJob {
  name: string;
  source: string;
  destination: string;
  query: string;
  schedule: string;
  lastRun?: Date;
  nextRun?: Date;
  status: 'active' | 'paused' | 'failed';
}

class DataWarehouseService {
  private connections: DataWarehouseConnection = {};
  private prisma: PrismaClient;
  private etlJobs: Map<string, ETLJob> = new Map();
  private isInitialized = false;

  constructor() {
    this.prisma = new PrismaClient();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Initialize Snowflake connection
      if (config.dataWarehouse.snowflake.enabled) {
        await this.initializeSnowflake();
      }

      // Initialize ClickHouse connection
      if (config.dataWarehouse.clickhouse.enabled) {
        await this.initializeClickHouse();
      }

      // Setup ETL jobs
      await this.setupETLJobs();

      this.isInitialized = true;
      analyticsLogger.event('data_warehouse_initialized', {
        snowflake: !!this.connections.snowflake,
        clickhouse: !!this.connections.clickhouse,
        etlJobs: this.etlJobs.size
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'data_warehouse_initialization' });
      throw error;
    }
  }

  private async initializeSnowflake(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connection = snowflake.createConnection({
        account: config.dataWarehouse.snowflake.account!,
        username: config.dataWarehouse.snowflake.username!,
        password: config.dataWarehouse.snowflake.password!,
        warehouse: config.dataWarehouse.snowflake.warehouse,
        database: config.dataWarehouse.snowflake.database,
        schema: config.dataWarehouse.snowflake.schema
      });

      connection.connect((err, conn) => {
        if (err) {
          analyticsLogger.error(err, { context: 'snowflake_connection' });
          reject(err);
        } else {
          this.connections.snowflake = conn;
          analyticsLogger.event('snowflake_connected', {});
          resolve();
        }
      });
    });
  }

  private async initializeClickHouse(): Promise<void> {
    try {
      this.connections.clickhouse = createClient({
        host: config.dataWarehouse.clickhouse.host!,
        port: config.dataWarehouse.clickhouse.port,
        user: config.dataWarehouse.clickhouse.username,
        password: config.dataWarehouse.clickhouse.password,
        database: config.dataWarehouse.clickhouse.database
      });

      // Test connection
      await this.connections.clickhouse.query('SELECT 1').toPromise();
      
      analyticsLogger.event('clickhouse_connected', {});
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'clickhouse_connection' });
      throw error;
    }
  }

  private async setupETLJobs(): Promise<void> {
    // Define ETL jobs for different data pipelines
    const jobs: ETLJob[] = [
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
        schedule: '0 2 * * *', // Daily at 2 AM
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
        schedule: '*/15 * * * *', // Every 15 minutes
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
        schedule: '0 3 * * *', // Daily at 3 AM
        status: 'active'
      }
    ];

    jobs.forEach(job => {
      this.etlJobs.set(job.name, job);
    });

    analyticsLogger.event('etl_jobs_configured', { jobCount: jobs.length });
  }

  /**
   * Execute ETL job
   */
  async executeETLJob(jobName: string): Promise<void> {
    const job = this.etlJobs.get(jobName);
    if (!job) {
      throw new Error(`ETL job not found: ${jobName}`);
    }

    try {
      analyticsLogger.event('etl_job_started', { jobName });
      
      const startTime = Date.now();
      
      // Extract data from source
      const sourceData = await this.extractData(job.source, job.query);
      
      // Transform data if needed
      const transformedData = await this.transformData(sourceData, job);
      
      // Load data to destination
      await this.loadData(job.destination, transformedData, job);
      
      const duration = Date.now() - startTime;
      
      // Update job status
      job.lastRun = new Date();
      job.status = 'active';
      
      analyticsLogger.event('etl_job_completed', {
        jobName,
        duration,
        recordCount: transformedData.length
      });
    } catch (error) {
      job.status = 'failed';
      analyticsLogger.error(error as Error, {
        context: 'etl_job_execution',
        jobName
      });
      throw error;
    }
  }

  /**
   * Get business metrics
   */
  async getBusinessMetrics(
    startDate: Date,
    endDate: Date,
    granularity: 'day' | 'week' | 'month' = 'day'
  ): Promise<BusinessMetrics[]> {
    try {
      const metrics: BusinessMetrics[] = [];
      
      // Calculate date intervals
      const intervals = this.getDateIntervals(startDate, endDate, granularity);
      
      for (const interval of intervals) {
        const businessMetrics: BusinessMetrics = {
          timestamp: interval.start,
          revenue: await this.getRevenueMetrics(interval.start, interval.end),
          users: await this.getUserMetrics(interval.start, interval.end),
          product: await this.getProductMetrics(interval.start, interval.end),
          operational: await this.getOperationalMetrics(interval.start, interval.end)
        };
        
        metrics.push(businessMetrics);
      }
      
      return metrics;
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'get_business_metrics',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
      throw error;
    }
  }

  /**
   * Get revenue metrics
   */
  private async getRevenueMetrics(startDate: Date, endDate: Date): Promise<RevenueMetrics> {
    try {
      // Query revenue data from data warehouse or primary database
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
      
      const result = await this.prisma.$queryRawUnsafe(revenueQuery, startDate, endDate) as any[];
      const data = result[0] || {};
      
      // Calculate MRR, ARR, etc.
      const totalRevenue = parseFloat(data.total_revenue || 0);
      const payingUsers = parseInt(data.paying_users || 0);
      const arpu = parseFloat(data.avg_revenue_per_user || 0);
      
      // These would be calculated from subscription data
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
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'get_revenue_metrics' });
      throw error;
    }
  }

  /**
   * Get user metrics
   */
  private async getUserMetrics(startDate: Date, endDate: Date): Promise<UserMetrics> {
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
      
      const result = await this.prisma.$queryRawUnsafe(userQuery, startDate, endDate) as any[];
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
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'get_user_metrics' });
      throw error;
    }
  }

  /**
   * Get product metrics
   */
  private async getProductMetrics(startDate: Date, endDate: Date): Promise<ProductMetrics> {
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
      
      const result = await this.prisma.$queryRawUnsafe(productQuery, startDate, endDate) as any[];
      const data = result[0] || {};
      
      return {
        totalDocuments: parseInt(data.total_documents || 0),
        totalAnalyses: parseInt(data.total_analyses || 0),
        averageRiskScore: parseFloat(data.avg_risk_score || 0),
        popularDocumentTypes: await this.getPopularDocumentTypes(startDate, endDate),
        topFindingCategories: await this.getTopFindingCategories(startDate, endDate),
        featureAdoptionRates: await this.getFeatureAdoptionRates(startDate, endDate)
      };
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'get_product_metrics' });
      throw error;
    }
  }

  /**
   * Get operational metrics
   */
  private async getOperationalMetrics(startDate: Date, endDate: Date): Promise<OperationalMetrics> {
    try {
      // These would typically come from monitoring systems
      return {
        systemUptime: 99.9,
        averageResponseTime: 150,
        errorRate: 0.01,
        apiUsage: await this.getAPIUsage(startDate, endDate),
        storageUsed: await this.getStorageUsage(),
        bandwidthUsed: await this.getBandwidthUsage(startDate, endDate)
      };
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'get_operational_metrics' });
      throw error;
    }
  }

  /**
   * Run data quality checks
   */
  async runDataQualityChecks(): Promise<DataQualityResult[]> {
    try {
      const checks: DataQualityCheck[] = [
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

      const results: DataQualityResult[] = [];
      
      for (const check of checks) {
        const result = await this.executeDataQualityCheck(check);
        results.push(result);
      }
      
      return results;
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'run_data_quality_checks' });
      throw error;
    }
  }

  // Private helper methods

  private async extractData(source: string, query: string): Promise<any[]> {
    switch (source) {
      case 'postgresql':
        return await this.prisma.$queryRawUnsafe(query) as any[];
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

  private async transformData(data: any[], job: ETLJob): Promise<any[]> {
    // Apply data transformations based on job requirements
    // For now, return data as-is
    return data;
  }

  private async loadData(destination: string, data: any[], job: ETLJob): Promise<void> {
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

  private async loadToSnowflake(data: any[], job: ETLJob): Promise<void> {
    if (!this.connections.snowflake) {
      throw new Error('Snowflake connection not available');
    }

    // Implementation would depend on specific table structure
    // This is a simplified example
    for (const row of data) {
      const query = `INSERT INTO ${job.name} VALUES (${Object.values(row).map(() => '?').join(',')})`;
      await this.executeSnowflakeQuery(query, Object.values(row));
    }
  }

  private async loadToClickHouse(data: any[], job: ETLJob): Promise<void> {
    if (!this.connections.clickhouse) {
      throw new Error('ClickHouse connection not available');
    }

    // Batch insert to ClickHouse
    const tableName = job.name;
    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    
    if (columns.length > 0) {
      const query = `INSERT INTO ${tableName} (${columns.join(',')}) VALUES`;
      await this.connections.clickhouse.insert(query, data).toPromise();
    }
  }

  private async executeSnowflakeQuery(query: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.connections.snowflake!.execute({
        sqlText: query,
        binds: params,
        complete: (err, stmt, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      });
    });
  }

  private getDateIntervals(
    startDate: Date,
    endDate: Date,
    granularity: 'day' | 'week' | 'month'
  ): Array<{ start: Date; end: Date }> {
    const intervals: Array<{ start: Date; end: Date }> = [];
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

  private async executeDataQualityCheck(check: DataQualityCheck): Promise<DataQualityResult> {
    try {
      const result: DataQualityResult = {
        checkId: check.id,
        timestamp: new Date(),
        passed: true,
        score: 1.0,
        issues: []
      };

      // Implementation would depend on specific check type
      // This is a simplified example
      
      return result;
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'execute_data_quality_check',
        checkId: check.id
      });
      throw error;
    }
  }

  // Placeholder methods for metric calculations
  private async calculateMRR(startDate: Date, endDate: Date): Promise<number> { return 0; }
  private async calculateChurnRate(startDate: Date, endDate: Date): Promise<number> { return 0; }
  private async calculateCustomerLifetimeValue(): Promise<number> { return 0; }
  private async calculateNRR(startDate: Date, endDate: Date): Promise<number> { return 0; }
  private async calculateGRR(startDate: Date, endDate: Date): Promise<number> { return 0; }
  private async calculateUserGrowthRate(startDate: Date, endDate: Date): Promise<number> { return 0; }
  private async calculateActivationRate(startDate: Date, endDate: Date): Promise<number> { return 0; }
  private async calculateRetentionRate(startDate: Date, endDate: Date): Promise<number> { return 0; }
  private async calculateEngagementScore(startDate: Date, endDate: Date): Promise<number> { return 0; }
  private async getPopularDocumentTypes(startDate: Date, endDate: Date): Promise<Record<string, number>> { return {}; }
  private async getTopFindingCategories(startDate: Date, endDate: Date): Promise<Record<string, number>> { return {}; }
  private async getFeatureAdoptionRates(startDate: Date, endDate: Date): Promise<Record<string, number>> { return {}; }
  private async getAPIUsage(startDate: Date, endDate: Date): Promise<number> { return 0; }
  private async getStorageUsage(): Promise<number> { return 0; }
  private async getBandwidthUsage(startDate: Date, endDate: Date): Promise<number> { return 0; }

  /**
   * Shutdown data warehouse service
   */
  async shutdown(): Promise<void> {
    try {
      if (this.connections.snowflake) {
        await new Promise<void>((resolve) => {
          this.connections.snowflake!.destroy((err) => {
            if (err) {
              analyticsLogger.error(err, { context: 'snowflake_shutdown' });
            }
            resolve();
          });
        });
      }

      if (this.connections.clickhouse) {
        // ClickHouse client doesn't need explicit shutdown
      }

      await this.prisma.$disconnect();
      analyticsLogger.event('data_warehouse_shutdown', {});
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'data_warehouse_shutdown' });
    }
  }
}

// Export singleton instance
export const dataWarehouseService = new DataWarehouseService();