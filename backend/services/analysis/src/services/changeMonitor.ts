import { createServiceLogger } from '@fineprintai/shared-logger';
import { analysisCache, queueManager } from '@fineprintai/shared-cache';
import { PrismaClient } from '@prisma/client';
import { NotificationService } from '@fineprintai/notification';
import { WebSocketService } from '@fineprintai/websocket';
import { textProcessor } from './textProcessor';
import { unifiedAnalysisEngine } from './analysisEngine';
import crypto from 'crypto';
import fetch from 'node-fetch';
import cron from 'node-cron';

const logger = createServiceLogger('change-monitor');
const prisma = new PrismaClient();

export interface ChangeMonitorConfig {
  id: string;
  userId: string;
  teamId?: string;
  analysisId: string;
  url: string;
  
  // Monitoring settings
  enabled: boolean;
  checkInterval: number; // in seconds
  sensitivity: 'low' | 'medium' | 'high'; // how much change triggers alert
  
  // Alert settings
  alertTypes: ('email' | 'webhook' | 'websocket' | 'sms')[];
  webhookUrl?: string;
  emailRecipients?: string[];
  
  // Scheduling
  schedule?: string; // cron expression
  timezone?: string;
  
  // Content comparison settings
  ignoreMinorChanges?: boolean;
  keywordsToWatch?: string[];
  sectionsToWatch?: string[];
  
  createdAt: Date;
  updatedAt: Date;
  lastCheck?: Date;
  nextCheck?: Date;
  
  // Status
  status: 'active' | 'paused' | 'error' | 'disabled';
  errorMessage?: string;
  checksPerformed: number;
  changesDetected: number;
}

export interface ChangeDetectionResult {
  id: string;
  monitorId: string;
  detectedAt: Date;
  
  // Change details
  changeType: 'minor' | 'moderate' | 'major' | 'critical';
  changeScore: number; // 0-100
  affectedSections: string[];
  
  // Content comparison
  originalContent: string;
  newContent: string;
  contentHash: string;
  diffSummary: string;
  
  // Analysis comparison
  originalAnalysis?: {
    riskScore: number;
    keyFindings: string[];
  };
  newAnalysis?: {
    riskScore: number;
    keyFindings: string[];
  };
  analysisChanged: boolean;
  riskScoreChange: number;
  
  // Specific changes detected
  addedContent: string[];
  removedContent: string[];
  modifiedSections: Array<{
    section: string;
    originalText: string;
    newText: string;
  }>;
  
  // Keywords and patterns
  newRiskyPatterns: string[];
  removedRiskyPatterns: string[];
  
  // Metadata
  metadata: {
    contentLength: number;
    wordCount: number;
    checkDuration: number;
    userAgent: string;
  };
}

export interface MonitoringAlert {
  id: string;
  monitorId: string;
  changeId: string;
  alertType: 'email' | 'webhook' | 'websocket' | 'sms';
  
  // Alert content
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  // Delivery
  recipient?: string;
  deliveryStatus: 'pending' | 'sent' | 'failed' | 'delivered';
  sentAt?: Date;
  deliveredAt?: Date;
  errorMessage?: string;
  
  createdAt: Date;
}

export class ChangeMonitoringService {
  private notificationService?: NotificationService;
  private wsService?: WebSocketService;
  private activeMonitors = new Map<string, NodeJS.Timeout>();
  private cronJobs = new Map<string, cron.ScheduledTask>();

  constructor() {
    try {
      this.notificationService = new NotificationService();
      this.wsService = new WebSocketService();
    } catch (error) {
      logger.warn('Optional services not available', { error: error.message });
    }
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Change Monitoring Service');
    
    try {
      // Load existing active monitors
      await this.loadActiveMonitors();
      
      // Start cleanup job for old change records
      this.startCleanupJob();
      
      logger.info('Change Monitoring Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Change Monitoring Service', { error: error.message });
      throw error;
    }
  }

  async createMonitor(config: Omit<ChangeMonitorConfig, 'id' | 'createdAt' | 'updatedAt' | 'checksPerformed' | 'changesDetected'>): Promise<ChangeMonitorConfig> {
    const monitorId = crypto.randomUUID();
    
    logger.info('Creating change monitor', {
      monitorId,
      userId: config.userId,
      url: config.url,
      checkInterval: config.checkInterval
    });

    try {
      // Validate URL
      await this.validateUrl(config.url);

      // Create initial content hash
      const initialContent = await this.fetchContentSafely(config.url);
      const contentHash = crypto.createHash('sha256').update(initialContent).digest('hex');

      // Create monitor record
      const monitor = await prisma.documentChangeMonitor.create({
        data: {
          id: monitorId,
          userId: config.userId,
          teamId: config.teamId,
          analysisId: config.analysisId,
          url: config.url,
          enabled: config.enabled,
          checkInterval: config.checkInterval,
          sensitivity: config.sensitivity,
          alertTypes: config.alertTypes,
          webhookUrl: config.webhookUrl,
          emailRecipients: config.emailRecipients,
          schedule: config.schedule,
          timezone: config.timezone,
          ignoreMinorChanges: config.ignoreMinorChanges,
          keywordsToWatch: config.keywordsToWatch,
          sectionsToWatch: config.sectionsToWatch,
          status: 'active',
          checksPerformed: 0,
          changesDetected: 0,
          lastContentHash: contentHash,
          nextCheck: this.calculateNextCheck(config.checkInterval, config.schedule)
        }
      });

      // Start monitoring if enabled
      if (config.enabled) {
        await this.startMonitoring(monitorId, config);
      }

      const monitorConfig: ChangeMonitorConfig = {
        id: monitor.id,
        userId: monitor.userId,
        teamId: monitor.teamId,
        analysisId: monitor.analysisId,
        url: monitor.url,
        enabled: monitor.enabled,
        checkInterval: monitor.checkInterval,
        sensitivity: monitor.sensitivity as any,
        alertTypes: monitor.alertTypes as any,
        webhookUrl: monitor.webhookUrl,
        emailRecipients: monitor.emailRecipients as any,
        schedule: monitor.schedule,
        timezone: monitor.timezone,
        ignoreMinorChanges: monitor.ignoreMinorChanges,
        keywordsToWatch: monitor.keywordsToWatch as any,
        sectionsToWatch: monitor.sectionsToWatch as any,
        createdAt: monitor.createdAt,
        updatedAt: monitor.updatedAt,
        lastCheck: monitor.lastCheck,
        nextCheck: monitor.nextCheck,
        status: monitor.status as any,
        errorMessage: monitor.errorMessage,
        checksPerformed: monitor.checksPerformed,
        changesDetected: monitor.changesDetected
      };

      logger.info('Change monitor created successfully', { monitorId, url: config.url });
      return monitorConfig;

    } catch (error) {
      logger.error('Failed to create change monitor', {
        error: error.message,
        userId: config.userId,
        url: config.url
      });
      throw error;
    }
  }

  async getMonitor(monitorId: string, userId: string): Promise<ChangeMonitorConfig | null> {
    try {
      const monitor = await prisma.documentChangeMonitor.findFirst({
        where: {
          id: monitorId,
          userId
        }
      });

      if (!monitor) {
        return null;
      }

      return this.mapDatabaseToConfig(monitor);

    } catch (error) {
      logger.error('Failed to get monitor', { error: error.message, monitorId, userId });
      throw error;
    }
  }

  async updateMonitor(
    monitorId: string,
    userId: string,
    updates: Partial<ChangeMonitorConfig>
  ): Promise<ChangeMonitorConfig> {
    try {
      const monitor = await prisma.documentChangeMonitor.findFirst({
        where: { id: monitorId, userId }
      });

      if (!monitor) {
        throw new Error('Monitor not found');
      }

      // Update monitor
      const updatedMonitor = await prisma.documentChangeMonitor.update({
        where: { id: monitorId },
        data: {
          enabled: updates.enabled,
          checkInterval: updates.checkInterval,
          sensitivity: updates.sensitivity,
          alertTypes: updates.alertTypes,
          webhookUrl: updates.webhookUrl,
          emailRecipients: updates.emailRecipients,
          schedule: updates.schedule,
          timezone: updates.timezone,
          ignoreMinorChanges: updates.ignoreMinorChanges,
          keywordsToWatch: updates.keywordsToWatch,
          sectionsToWatch: updates.sectionsToWatch,
          nextCheck: updates.checkInterval ? 
            this.calculateNextCheck(updates.checkInterval, updates.schedule) : 
            undefined,
          updatedAt: new Date()
        }
      });

      // Restart monitoring with new settings
      await this.stopMonitoring(monitorId);
      if (updatedMonitor.enabled) {
        await this.startMonitoring(monitorId, this.mapDatabaseToConfig(updatedMonitor));
      }

      logger.info('Monitor updated successfully', { monitorId, updates: Object.keys(updates) });
      return this.mapDatabaseToConfig(updatedMonitor);

    } catch (error) {
      logger.error('Failed to update monitor', { error: error.message, monitorId, userId });
      throw error;
    }
  }

  async deleteMonitor(monitorId: string, userId: string): Promise<boolean> {
    try {
      const monitor = await prisma.documentChangeMonitor.findFirst({
        where: { id: monitorId, userId }
      });

      if (!monitor) {
        return false;
      }

      // Stop monitoring
      await this.stopMonitoring(monitorId);

      // Soft delete monitor
      await prisma.documentChangeMonitor.update({
        where: { id: monitorId },
        data: {
          status: 'disabled',
          enabled: false,
          deletedAt: new Date()
        }
      });

      logger.info('Monitor deleted successfully', { monitorId, userId });
      return true;

    } catch (error) {
      logger.error('Failed to delete monitor', { error: error.message, monitorId, userId });
      throw error;
    }
  }

  async listUserMonitors(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      enabled?: boolean;
    } = {}
  ): Promise<{
    monitors: ChangeMonitorConfig[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const { page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;

      const where: any = {
        userId,
        deletedAt: null
      };

      if (options.status) where.status = options.status;
      if (options.enabled !== undefined) where.enabled = options.enabled;

      const [monitors, total] = await Promise.all([
        prisma.documentChangeMonitor.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.documentChangeMonitor.count({ where })
      ]);

      return {
        monitors: monitors.map(m => this.mapDatabaseToConfig(m)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      logger.error('Failed to list user monitors', { error: error.message, userId });
      throw error;
    }
  }

  async getChangeHistory(
    monitorId: string,
    userId: string,
    options: {
      page?: number;
      limit?: number;
      changeType?: string;
    } = {}
  ): Promise<{
    changes: ChangeDetectionResult[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      // Verify user owns the monitor
      const monitor = await prisma.documentChangeMonitor.findFirst({
        where: { id: monitorId, userId }
      });

      if (!monitor) {
        throw new Error('Monitor not found');
      }

      const { page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;

      const where: any = { monitorId };
      if (options.changeType) where.changeType = options.changeType;

      const [changes, total] = await Promise.all([
        prisma.documentChange.findMany({
          where,
          orderBy: { detectedAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.documentChange.count({ where })
      ]);

      return {
        changes: changes.map(c => this.mapDatabaseToChangeResult(c)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      logger.error('Failed to get change history', { error: error.message, monitorId, userId });
      throw error;
    }
  }

  async manualCheck(monitorId: string, userId: string): Promise<ChangeDetectionResult | null> {
    try {
      const monitor = await prisma.documentChangeMonitor.findFirst({
        where: { id: monitorId, userId }
      });

      if (!monitor) {
        throw new Error('Monitor not found');
      }

      logger.info('Performing manual check', { monitorId, url: monitor.url });

      const config = this.mapDatabaseToConfig(monitor);
      const result = await this.performCheck(config);

      if (result) {
        logger.info('Manual check detected changes', {
          monitorId,
          changeType: result.changeType,
          changeScore: result.changeScore
        });
      } else {
        logger.info('Manual check - no changes detected', { monitorId });
      }

      return result;

    } catch (error) {
      logger.error('Manual check failed', { error: error.message, monitorId, userId });
      throw error;
    }
  }

  private async startMonitoring(monitorId: string, config: ChangeMonitorConfig): Promise<void> {
    try {
      // Stop existing monitoring if any
      await this.stopMonitoring(monitorId);

      if (config.schedule) {
        // Use cron schedule
        const task = cron.schedule(config.schedule, async () => {
          await this.performScheduledCheck(monitorId);
        }, {
          scheduled: false,
          timezone: config.timezone || 'UTC'
        });
        
        task.start();
        this.cronJobs.set(monitorId, task);
        
        logger.info('Started cron monitoring', { monitorId, schedule: config.schedule });
      } else {
        // Use interval monitoring
        const interval = setInterval(async () => {
          await this.performScheduledCheck(monitorId);
        }, config.checkInterval * 1000);
        
        this.activeMonitors.set(monitorId, interval);
        
        logger.info('Started interval monitoring', { monitorId, interval: config.checkInterval });
      }

    } catch (error) {
      logger.error('Failed to start monitoring', { error: error.message, monitorId });
      throw error;
    }
  }

  private async stopMonitoring(monitorId: string): Promise<void> {
    // Stop interval monitoring
    const interval = this.activeMonitors.get(monitorId);
    if (interval) {
      clearInterval(interval);
      this.activeMonitors.delete(monitorId);
    }

    // Stop cron monitoring
    const cronJob = this.cronJobs.get(monitorId);
    if (cronJob) {
      cronJob.stop();
      cronJob.destroy();
      this.cronJobs.delete(monitorId);
    }

    logger.debug('Stopped monitoring', { monitorId });
  }

  private async performScheduledCheck(monitorId: string): Promise<void> {
    try {
      // Get latest monitor config
      const monitor = await prisma.documentChangeMonitor.findUnique({
        where: { id: monitorId }
      });

      if (!monitor || !monitor.enabled || monitor.status !== 'active') {
        logger.debug('Skipping check for inactive monitor', { monitorId });
        return;
      }

      const config = this.mapDatabaseToConfig(monitor);
      const result = await this.performCheck(config);

      // Update last check time
      await prisma.documentChangeMonitor.update({
        where: { id: monitorId },
        data: {
          lastCheck: new Date(),
          nextCheck: this.calculateNextCheck(config.checkInterval, config.schedule),
          checksPerformed: { increment: 1 },
          ...(result && { changesDetected: { increment: 1 } })
        }
      });

      if (result) {
        await this.sendAlerts(config, result);
      }

    } catch (error) {
      logger.error('Scheduled check failed', { error: error.message, monitorId });
      
      // Update monitor status to error
      await prisma.documentChangeMonitor.update({
        where: { id: monitorId },
        data: {
          status: 'error',
          errorMessage: error.message,
          lastCheck: new Date()
        }
      }).catch(() => {}); // Ignore update errors
    }
  }

  private async performCheck(config: ChangeMonitorConfig): Promise<ChangeDetectionResult | null> {
    const startTime = Date.now();
    
    try {
      // Fetch current content
      const currentContent = await this.fetchContentSafely(config.url);
      const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex');

      // Get last known content hash
      const monitor = await prisma.documentChangeMonitor.findUnique({
        where: { id: config.id },
        select: { lastContentHash: true }
      });

      const lastHash = monitor?.lastContentHash;

      // Quick hash comparison
      if (currentHash === lastHash) {
        return null; // No changes
      }

      // Get original content for detailed comparison
      const originalContent = await this.getOriginalContent(config);
      
      // Perform detailed change analysis
      const changeAnalysis = await this.analyzeChanges(
        originalContent,
        currentContent,
        config
      );

      // Skip if change is too minor and ignored
      if (config.ignoreMinorChanges && changeAnalysis.changeType === 'minor') {
        // Update hash but don't create change record
        await prisma.documentChangeMonitor.update({
          where: { id: config.id },
          data: { lastContentHash: currentHash }
        });
        return null;
      }

      // Create change record
      const changeResult: ChangeDetectionResult = {
        id: crypto.randomUUID(),
        monitorId: config.id,
        detectedAt: new Date(),
        changeType: changeAnalysis.changeType,
        changeScore: changeAnalysis.changeScore,
        affectedSections: changeAnalysis.affectedSections,
        originalContent: originalContent.substring(0, 10000), // Limit size
        newContent: currentContent.substring(0, 10000),
        contentHash: currentHash,
        diffSummary: changeAnalysis.diffSummary,
        originalAnalysis: changeAnalysis.originalAnalysis,
        newAnalysis: changeAnalysis.newAnalysis,
        analysisChanged: changeAnalysis.analysisChanged,
        riskScoreChange: changeAnalysis.riskScoreChange,
        addedContent: changeAnalysis.addedContent,
        removedContent: changeAnalysis.removedContent,
        modifiedSections: changeAnalysis.modifiedSections,
        newRiskyPatterns: changeAnalysis.newRiskyPatterns,
        removedRiskyPatterns: changeAnalysis.removedRiskyPatterns,
        metadata: {
          contentLength: currentContent.length,
          wordCount: currentContent.split(/\s+/).length,
          checkDuration: Date.now() - startTime,
          userAgent: 'FinePrintAI-Monitor/1.0'
        }
      };

      // Store change record
      await this.storeChangeRecord(changeResult);

      // Update monitor hash
      await prisma.documentChangeMonitor.update({
        where: { id: config.id },
        data: { lastContentHash: currentHash }
      });

      logger.info('Change detected and recorded', {
        monitorId: config.id,
        changeType: changeResult.changeType,
        changeScore: changeResult.changeScore
      });

      return changeResult;

    } catch (error) {
      logger.error('Check performance failed', {
        error: error.message,
        monitorId: config.id,
        url: config.url
      });
      throw error;
    }
  }

  private async analyzeChanges(
    originalContent: string,
    newContent: string,
    config: ChangeMonitorConfig
  ): Promise<any> {
    // Calculate basic change metrics
    const originalWords = originalContent.split(/\s+/);
    const newWords = newContent.split(/\s+/);
    
    const changeScore = this.calculateChangeScore(originalContent, newContent);
    const changeType = this.determineChangeType(changeScore, config.sensitivity);
    
    // Analyze specific changes
    const addedContent = this.findAddedContent(originalContent, newContent);
    const removedContent = this.findRemovedContent(originalContent, newContent);
    const modifiedSections = this.findModifiedSections(originalContent, newContent, config.sectionsToWatch);
    
    // Check for risky patterns
    const newRiskyPatterns = await this.findRiskyPatterns(newContent, config.keywordsToWatch);
    const originalRiskyPatterns = await this.findRiskyPatterns(originalContent, config.keywordsToWatch);
    const removedRiskyPatterns = originalRiskyPatterns.filter(p => !newRiskyPatterns.includes(p));
    const addedRiskyPatterns = newRiskyPatterns.filter(p => !originalRiskyPatterns.includes(p));
    
    // Generate diff summary
    const diffSummary = this.generateDiffSummary(addedContent, removedContent, modifiedSections.length);
    
    // Determine affected sections
    const affectedSections = this.identifyAffectedSections(modifiedSections, config.sectionsToWatch);
    
    // Compare analyses if available
    let originalAnalysis, newAnalysis, analysisChanged = false, riskScoreChange = 0;
    
    try {
      const [origAnalysis, newAnalysisResult] = await Promise.all([
        this.getAnalysisForContent(originalContent, config.userId),
        this.getAnalysisForContent(newContent, config.userId)
      ]);
      
      if (origAnalysis && newAnalysisResult) {
        originalAnalysis = {
          riskScore: origAnalysis.overallRiskScore || 0,
          keyFindings: origAnalysis.keyFindings || []
        };
        
        newAnalysis = {
          riskScore: newAnalysisResult.overallRiskScore || 0,
          keyFindings: newAnalysisResult.keyFindings || []
        };
        
        riskScoreChange = newAnalysis.riskScore - originalAnalysis.riskScore;
        analysisChanged = Math.abs(riskScoreChange) > 5; // 5% threshold
      }
    } catch (error) {
      logger.warn('Failed to compare analyses', { error: error.message });
    }

    return {
      changeType,
      changeScore,
      affectedSections,
      diffSummary,
      originalAnalysis,
      newAnalysis,
      analysisChanged,
      riskScoreChange,
      addedContent: addedContent.slice(0, 10), // Limit results
      removedContent: removedContent.slice(0, 10),
      modifiedSections: modifiedSections.slice(0, 5),
      newRiskyPatterns: addedRiskyPatterns,
      removedRiskyPatterns
    };
  }

  private calculateChangeScore(original: string, current: string): number {
    // Simple change score based on text similarity
    const originalWords = new Set(original.toLowerCase().split(/\s+/));
    const currentWords = new Set(current.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...originalWords].filter(word => currentWords.has(word)));
    const union = new Set([...originalWords, ...currentWords]);
    
    const similarity = intersection.size / union.size;
    return Math.round((1 - similarity) * 100);
  }

  private determineChangeType(changeScore: number, sensitivity: string): 'minor' | 'moderate' | 'major' | 'critical' {
    const thresholds = {
      low: { minor: 10, moderate: 25, major: 50 },
      medium: { minor: 5, moderate: 15, major: 35 },
      high: { minor: 2, moderate: 8, major: 20 }
    };
    
    const threshold = thresholds[sensitivity] || thresholds.medium;
    
    if (changeScore >= threshold.major) return 'critical';
    if (changeScore >= threshold.moderate) return 'major';
    if (changeScore >= threshold.minor) return 'moderate';
    return 'minor';
  }

  private findAddedContent(original: string, current: string): string[] {
    const originalSentences = original.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    const currentSentences = current.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    
    return currentSentences.filter(sentence => 
      !originalSentences.some(orig => this.areSimilar(orig, sentence, 0.8))
    );
  }

  private findRemovedContent(original: string, current: string): string[] {
    const originalSentences = original.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    const currentSentences = current.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    
    return originalSentences.filter(sentence => 
      !currentSentences.some(curr => this.areSimilar(curr, sentence, 0.8))
    );
  }

  private findModifiedSections(original: string, current: string, sectionsToWatch?: string[]): Array<{
    section: string;
    originalText: string;
    newText: string;
  }> {
    const modifications = [];
    
    if (!sectionsToWatch || sectionsToWatch.length === 0) {
      return modifications;
    }

    for (const section of sectionsToWatch) {
      const origSection = this.extractSection(original, section);
      const newSection = this.extractSection(current, section);
      
      if (origSection && newSection && origSection !== newSection) {
        modifications.push({
          section,
          originalText: origSection.substring(0, 500),
          newText: newSection.substring(0, 500)
        });
      }
    }

    return modifications;
  }

  private extractSection(content: string, sectionName: string): string | null {
    // Simple section extraction - could be enhanced with better parsing
    const regex = new RegExp(`${sectionName}[:\\s]*([\\s\\S]*?)(?=\\n\\n|\\n[A-Z][a-z]+:|$)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  }

  private async findRiskyPatterns(content: string, keywords?: string[]): Promise<string[]> {
    const riskyPatterns = [];
    const defaultRiskyKeywords = [
      'unlimited liability', 'no warranty', 'at your own risk',
      'may collect personal data', 'share with third parties',
      'automatic renewal', 'binding arbitration', 'class action waiver'
    ];
    
    const keywordsToCheck = [...(keywords || []), ...defaultRiskyKeywords];
    
    for (const keyword of keywordsToCheck) {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        riskyPatterns.push(keyword);
      }
    }
    
    return riskyPatterns;
  }

  private generateDiffSummary(added: string[], removed: string[], modifiedCount: number): string {
    const parts = [];
    
    if (added.length > 0) {
      parts.push(`${added.length} section(s) added`);
    }
    
    if (removed.length > 0) {
      parts.push(`${removed.length} section(s) removed`);
    }
    
    if (modifiedCount > 0) {
      parts.push(`${modifiedCount} section(s) modified`);
    }
    
    return parts.length > 0 ? parts.join(', ') : 'Minor text changes detected';
  }

  private identifyAffectedSections(modifiedSections: any[], sectionsToWatch?: string[]): string[] {
    const affected = modifiedSections.map(m => m.section);
    
    // Add general categories based on content analysis
    if (modifiedSections.some(m => m.section.toLowerCase().includes('privacy'))) {
      affected.push('Privacy Policy');
    }
    
    if (modifiedSections.some(m => m.section.toLowerCase().includes('terms'))) {
      affected.push('Terms of Service');
    }
    
    return [...new Set(affected)];
  }

  private areSimilar(text1: string, text2: string, threshold: number): boolean {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    const similarity = intersection.size / union.size;
    return similarity >= threshold;
  }

  private async getAnalysisForContent(content: string, userId: string): Promise<any> {
    try {
      // This would create a quick analysis - in practice you might cache or optimize this
      const analysisRequest = {
        content,
        userId,
        teamId: undefined,
        options: {
          modelPreference: 'speed' as const,
          includeEmbeddings: false
        }
      };
      
      const result = await unifiedAnalysisEngine.createAnalysis(analysisRequest);
      return result.results;
    } catch (error) {
      logger.warn('Failed to get analysis for content', { error: error.message });
      return null;
    }
  }

  private async sendAlerts(config: ChangeMonitorConfig, change: ChangeDetectionResult): Promise<void> {
    try {
      for (const alertType of config.alertTypes) {
        await this.sendAlert(config, change, alertType);
      }
    } catch (error) {
      logger.error('Failed to send alerts', { error: error.message, monitorId: config.id });
    }
  }

  private async sendAlert(
    config: ChangeMonitorConfig,
    change: ChangeDetectionResult,
    alertType: 'email' | 'webhook' | 'websocket' | 'sms'
  ): Promise<void> {
    const alertId = crypto.randomUUID();
    const priority = this.getAlertPriority(change.changeType);
    
    try {
      let deliveryStatus: 'pending' | 'sent' | 'failed' = 'pending';
      let errorMessage: string | undefined;

      switch (alertType) {
        case 'email':
          if (config.emailRecipients && config.emailRecipients.length > 0) {
            await this.sendEmailAlert(config, change);
            deliveryStatus = 'sent';
          }
          break;
          
        case 'webhook':
          if (config.webhookUrl) {
            await this.sendWebhookAlert(config, change);
            deliveryStatus = 'sent';
          }
          break;
          
        case 'websocket':
          if (this.wsService) {
            this.wsService.sendToUser(config.userId, 'document_change_detected', {
              monitorId: config.id,
              changeId: change.id,
              changeType: change.changeType,
              url: config.url,
              changeScore: change.changeScore
            });
            deliveryStatus = 'sent';
          }
          break;
          
        case 'sms':
          // SMS implementation would go here
          break;
      }

      // Store alert record
      await prisma.monitoringAlert.create({
        data: {
          id: alertId,
          monitorId: config.id,
          changeId: change.id,
          alertType,
          title: this.generateAlertTitle(change),
          message: this.generateAlertMessage(config, change),
          priority,
          deliveryStatus,
          errorMessage,
          sentAt: deliveryStatus === 'sent' ? new Date() : undefined
        }
      });

    } catch (error) {
      logger.error('Failed to send individual alert', {
        error: error.message,
        alertType,
        monitorId: config.id
      });
      
      // Store failed alert
      await prisma.monitoringAlert.create({
        data: {
          id: alertId,
          monitorId: config.id,
          changeId: change.id,
          alertType,
          title: this.generateAlertTitle(change),
          message: this.generateAlertMessage(config, change),
          priority,
          deliveryStatus: 'failed',
          errorMessage: error.message
        }
      });
    }
  }

  private async sendEmailAlert(config: ChangeMonitorConfig, change: ChangeDetectionResult): Promise<void> {
    if (!this.notificationService || !config.emailRecipients) return;

    const subject = `Document Change Alert: ${change.changeType.toUpperCase()} changes detected`;
    const body = this.generateEmailBody(config, change);

    for (const recipient of config.emailRecipients) {
      await this.notificationService.sendEmail({
        to: recipient,
        subject,
        body,
        priority: this.getAlertPriority(change.changeType)
      });
    }
  }

  private async sendWebhookAlert(config: ChangeMonitorConfig, change: ChangeDetectionResult): Promise<void> {
    if (!config.webhookUrl) return;

    const payload = {
      monitorId: config.id,
      changeId: change.id,
      url: config.url,
      changeType: change.changeType,
      changeScore: change.changeScore,
      detectedAt: change.detectedAt,
      diffSummary: change.diffSummary,
      affectedSections: change.affectedSections,
      riskScoreChange: change.riskScoreChange
    };

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FinePrintAI-Monitor/1.0'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed with status ${response.status}`);
    }
  }

  private getAlertPriority(changeType: string): 'low' | 'medium' | 'high' | 'critical' {
    const priorityMap = {
      minor: 'low' as const,
      moderate: 'medium' as const,
      major: 'high' as const,
      critical: 'critical' as const
    };
    
    return priorityMap[changeType] || 'medium';
  }

  private generateAlertTitle(change: ChangeDetectionResult): string {
    return `${change.changeType.toUpperCase()} document changes detected (${change.changeScore}% change)`;
  }

  private generateAlertMessage(config: ChangeMonitorConfig, change: ChangeDetectionResult): string {
    return `Document monitoring alert for ${config.url}\n\n` +
           `Change Type: ${change.changeType}\n` +
           `Change Score: ${change.changeScore}%\n` +
           `Affected Sections: ${change.affectedSections.join(', ')}\n` +
           `Summary: ${change.diffSummary}\n\n` +
           `View details: /dashboard/monitoring/${config.id}/changes/${change.id}`;
  }

  private generateEmailBody(config: ChangeMonitorConfig, change: ChangeDetectionResult): string {
    return `
    <h2>Document Change Alert</h2>
    <p>Changes have been detected in the document you're monitoring:</p>
    
    <h3>Change Details</h3>
    <ul>
      <li><strong>URL:</strong> ${config.url}</li>
      <li><strong>Change Type:</strong> ${change.changeType}</li>
      <li><strong>Change Score:</strong> ${change.changeScore}%</li>
      <li><strong>Detected At:</strong> ${change.detectedAt.toLocaleString()}</li>
    </ul>
    
    <h3>Summary</h3>
    <p>${change.diffSummary}</p>
    
    ${change.affectedSections.length > 0 ? `
    <h3>Affected Sections</h3>
    <ul>
      ${change.affectedSections.map(section => `<li>${section}</li>`).join('')}
    </ul>
    ` : ''}
    
    ${change.riskScoreChange !== 0 ? `
    <h3>Risk Score Change</h3>
    <p>The risk score has changed by ${change.riskScoreChange > 0 ? '+' : ''}${change.riskScoreChange}%</p>
    ` : ''}
    
    <p><a href="/dashboard/monitoring/${config.id}/changes/${change.id}">View Full Details</a></p>
    `;
  }

  private async storeChangeRecord(change: ChangeDetectionResult): Promise<void> {
    await prisma.documentChange.create({
      data: {
        id: change.id,
        monitorId: change.monitorId,
        detectedAt: change.detectedAt,
        changeType: change.changeType,
        changeScore: change.changeScore,
        affectedSections: change.affectedSections,
        contentHash: change.contentHash,
        diffSummary: change.diffSummary,
        analysisChanged: change.analysisChanged,
        riskScoreChange: change.riskScoreChange,
        changeData: {
          originalContent: change.originalContent.substring(0, 5000), // Limit size
          newContent: change.newContent.substring(0, 5000),
          addedContent: change.addedContent,
          removedContent: change.removedContent,
          modifiedSections: change.modifiedSections,
          newRiskyPatterns: change.newRiskyPatterns,
          removedRiskyPatterns: change.removedRiskyPatterns,
          metadata: change.metadata
        }
      }
    });
  }

  private async fetchContentSafely(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'FinePrintAI-Monitor/1.0'
        },
        timeout: 30000 // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      
      // Basic content extraction
      const extractionResult = await textProcessor.extractFromBuffer(
        Buffer.from(content, 'utf-8'),
        'fetched-content.html'
      );

      return extractionResult.content;

    } catch (error) {
      logger.error('Failed to fetch content safely', { error: error.message, url });
      throw error;
    }
  }

  private async getOriginalContent(config: ChangeMonitorConfig): Promise<string> {
    try {
      // Get the original analysis
      const analysis = await prisma.documentAnalysis.findUnique({
        where: { id: config.analysisId },
        include: { document: true }
      });

      if (analysis?.document?.content) {
        return analysis.document.content;
      }

      // Fallback: fetch current content
      return await this.fetchContentSafely(config.url);

    } catch (error) {
      logger.warn('Failed to get original content', { error: error.message, monitorId: config.id });
      return await this.fetchContentSafely(config.url);
    }
  }

  private async validateUrl(url: string): Promise<void> {
    try {
      const parsedUrl = new URL(url);
      
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported');
      }

      // Test fetch
      const response = await fetch(url, {
        method: 'HEAD',
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`URL is not accessible: ${response.status} ${response.statusText}`);
      }

    } catch (error) {
      throw new Error(`Invalid URL: ${error.message}`);
    }
  }

  private calculateNextCheck(intervalSeconds: number, schedule?: string): Date {
    const nextCheck = new Date();
    
    if (schedule) {
      // For cron schedules, this would need a proper cron parser
      // For now, default to 1 hour
      nextCheck.setHours(nextCheck.getHours() + 1);
    } else {
      nextCheck.setSeconds(nextCheck.getSeconds() + intervalSeconds);
    }
    
    return nextCheck;
  }

  private async loadActiveMonitors(): Promise<void> {
    try {
      const activeMonitors = await prisma.documentChangeMonitor.findMany({
        where: {
          enabled: true,
          status: 'active',
          deletedAt: null
        }
      });

      for (const monitor of activeMonitors) {
        const config = this.mapDatabaseToConfig(monitor);
        await this.startMonitoring(monitor.id, config);
      }

      logger.info('Loaded active monitors', { count: activeMonitors.length });

    } catch (error) {
      logger.error('Failed to load active monitors', { error: error.message });
    }
  }

  private startCleanupJob(): void {
    // Clean up old change records every day at 2 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const deleted = await prisma.documentChange.deleteMany({
          where: {
            detectedAt: { lt: thirtyDaysAgo }
          }
        });

        logger.info('Cleaned up old change records', { deletedCount: deleted.count });

      } catch (error) {
        logger.error('Cleanup job failed', { error: error.message });
      }
    });
  }

  private mapDatabaseToConfig(monitor: any): ChangeMonitorConfig {
    return {
      id: monitor.id,
      userId: monitor.userId,
      teamId: monitor.teamId,
      analysisId: monitor.analysisId,
      url: monitor.url,
      enabled: monitor.enabled,
      checkInterval: monitor.checkInterval,
      sensitivity: monitor.sensitivity,
      alertTypes: monitor.alertTypes || [],
      webhookUrl: monitor.webhookUrl,
      emailRecipients: monitor.emailRecipients || [],
      schedule: monitor.schedule,
      timezone: monitor.timezone,
      ignoreMinorChanges: monitor.ignoreMinorChanges,
      keywordsToWatch: monitor.keywordsToWatch || [],
      sectionsToWatch: monitor.sectionsToWatch || [],
      createdAt: monitor.createdAt,
      updatedAt: monitor.updatedAt,
      lastCheck: monitor.lastCheck,
      nextCheck: monitor.nextCheck,
      status: monitor.status,
      errorMessage: monitor.errorMessage,
      checksPerformed: monitor.checksPerformed,
      changesDetected: monitor.changesDetected
    };
  }

  private mapDatabaseToChangeResult(change: any): ChangeDetectionResult {
    const changeData = change.changeData || {};
    
    return {
      id: change.id,
      monitorId: change.monitorId,
      detectedAt: change.detectedAt,
      changeType: change.changeType,
      changeScore: change.changeScore,
      affectedSections: change.affectedSections || [],
      originalContent: changeData.originalContent || '',
      newContent: changeData.newContent || '',
      contentHash: change.contentHash,
      diffSummary: change.diffSummary,
      originalAnalysis: changeData.originalAnalysis,
      newAnalysis: changeData.newAnalysis,
      analysisChanged: change.analysisChanged,
      riskScoreChange: change.riskScoreChange,
      addedContent: changeData.addedContent || [],
      removedContent: changeData.removedContent || [],
      modifiedSections: changeData.modifiedSections || [],
      newRiskyPatterns: changeData.newRiskyPatterns || [],
      removedRiskyPatterns: changeData.removedRiskyPatterns || [],
      metadata: changeData.metadata || {}
    };
  }
}

// Singleton instance
export const changeMonitoringService = new ChangeMonitoringService();