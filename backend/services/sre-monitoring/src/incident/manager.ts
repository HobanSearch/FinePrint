import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { logger } from '../utils/logger';
import PagerDuty from 'pagerduty';

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'closed';
  service: string;
  startTime: Date;
  acknowledgedTime?: Date;
  resolvedTime?: Date;
  closedTime?: Date;
  assignee?: string;
  team: string;
  impactedServices: string[];
  rootCause?: string;
  resolution?: string;
  postMortemRequired: boolean;
  postMortemUrl?: string;
  timeline: TimelineEvent[];
  runbookUrl?: string;
  pagerDutyIncidentId?: string;
  metrics: {
    errorRate?: number;
    latency?: number;
    availability?: number;
  };
  tags: string[];
}

export interface TimelineEvent {
  timestamp: Date;
  type: 'created' | 'acknowledged' | 'escalated' | 'updated' | 'resolved' | 'closed' | 'comment';
  author: string;
  description: string;
  metadata?: Record<string, any>;
}

export interface Runbook {
  id: string;
  title: string;
  service: string;
  alertType: string;
  steps: RunbookStep[];
  automationAvailable: boolean;
  estimatedTime: number; // in minutes
  requiredPermissions: string[];
  contactEscalation: string[];
}

export interface RunbookStep {
  order: number;
  title: string;
  description: string;
  command?: string;
  expectedOutcome: string;
  rollbackProcedure?: string;
  automatable: boolean;
}

export interface PostMortem {
  incidentId: string;
  title: string;
  summary: string;
  impact: {
    duration: number;
    usersAffected: number;
    revenueImpact?: number;
    sloViolations: string[];
  };
  timeline: TimelineEvent[];
  rootCause: {
    description: string;
    category: 'code' | 'configuration' | 'infrastructure' | 'dependency' | 'process' | 'human';
    contributingFactors: string[];
  };
  detection: {
    method: 'alert' | 'customer' | 'manual' | 'synthetic';
    timeToDetect: number;
    gaps: string[];
  };
  response: {
    whatWentWell: string[];
    whatWentWrong: string[];
    luckyBreaks: string[];
  };
  actionItems: ActionItem[];
  lessonsLearned: string[];
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  owner: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  dueDate: Date;
  status: 'pending' | 'in-progress' | 'completed';
  type: 'prevention' | 'detection' | 'response' | 'process';
}

/**
 * Incident Management System for Fine Print AI
 * Handles incident lifecycle, runbooks, and post-mortems
 */
export class IncidentManager extends EventEmitter {
  private incidents: Map<string, Incident>;
  private runbooks: Map<string, Runbook>;
  private postMortems: Map<string, PostMortem>;
  private pagerDutyClient?: any;
  private onCallSchedule: Map<string, string[]>;
  private escalationPolicies: Map<string, string[]>;

  constructor() {
    super();
    this.incidents = new Map();
    this.runbooks = new Map();
    this.postMortems = new Map();
    this.onCallSchedule = new Map();
    this.escalationPolicies = new Map();
    
    this.initializeRunbooks();
    this.initializeEscalationPolicies();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Incident Manager');
    
    // Initialize PagerDuty client if configured
    if (config.pagerduty.apiKey) {
      this.pagerDutyClient = new PagerDuty({
        apiKey: config.pagerduty.apiKey,
      });
    }
    
    // Load on-call schedule
    await this.loadOnCallSchedule();
    
    // Start incident monitoring
    this.startIncidentMonitoring();
    
    this.emit('initialized');
  }

  private initializeRunbooks(): void {
    // High Error Rate Runbook
    this.runbooks.set('high-error-rate', {
      id: 'high-error-rate',
      title: 'High Error Rate Response',
      service: 'all',
      alertType: 'error-rate',
      automationAvailable: true,
      estimatedTime: 15,
      requiredPermissions: ['logs:read', 'metrics:read', 'deployment:rollback'],
      contactEscalation: ['on-call-sre', 'team-lead', 'platform-director'],
      steps: [
        {
          order: 1,
          title: 'Acknowledge incident',
          description: 'Acknowledge the incident in PagerDuty to stop escalation',
          expectedOutcome: 'Incident acknowledged, escalation timer stopped',
          automatable: true,
        },
        {
          order: 2,
          title: 'Check error logs',
          description: 'Query recent error logs to identify error patterns',
          command: 'kubectl logs -n fineprint -l app=<service> --since=30m | grep ERROR',
          expectedOutcome: 'Error patterns identified',
          automatable: true,
        },
        {
          order: 3,
          title: 'Check recent deployments',
          description: 'Identify if errors correlate with recent deployment',
          command: 'kubectl rollout history -n fineprint deployment/<service>',
          expectedOutcome: 'Deployment correlation identified',
          automatable: true,
        },
        {
          order: 4,
          title: 'Check dependencies',
          description: 'Verify all dependent services are healthy',
          command: 'curl http://monitoring:9000/api/health/dependencies',
          expectedOutcome: 'All dependencies healthy or issue identified',
          automatable: true,
        },
        {
          order: 5,
          title: 'Rollback if necessary',
          description: 'If errors started after deployment, rollback to previous version',
          command: 'kubectl rollout undo -n fineprint deployment/<service>',
          expectedOutcome: 'Service rolled back to previous stable version',
          rollbackProcedure: 'kubectl rollout undo -n fineprint deployment/<service> --to-revision=<previous>',
          automatable: true,
        },
        {
          order: 6,
          title: 'Verify resolution',
          description: 'Confirm error rate has returned to normal',
          command: 'curl http://prometheus:9090/api/v1/query?query=rate(http_errors_total[5m])',
          expectedOutcome: 'Error rate below 0.1%',
          automatable: true,
        },
        {
          order: 7,
          title: 'Document findings',
          description: 'Update incident with root cause and resolution',
          expectedOutcome: 'Incident documentation complete',
          automatable: false,
        },
      ],
    });

    // Model Inference Failure Runbook
    this.runbooks.set('model-inference-failure', {
      id: 'model-inference-failure',
      title: 'Model Inference Failure Response',
      service: 'model-management',
      alertType: 'model-failure',
      automationAvailable: true,
      estimatedTime: 20,
      requiredPermissions: ['models:read', 'models:restart', 'gpu:access'],
      contactEscalation: ['ml-on-call', 'ml-team-lead', 'chief-scientist'],
      steps: [
        {
          order: 1,
          title: 'Check model health',
          description: 'Verify model loading and health status',
          command: 'curl http://model-management:8001/api/models/health',
          expectedOutcome: 'Model health status identified',
          automatable: true,
        },
        {
          order: 2,
          title: 'Check GPU resources',
          description: 'Verify GPU availability and utilization',
          command: 'nvidia-smi',
          expectedOutcome: 'GPU resources available and functional',
          automatable: true,
        },
        {
          order: 3,
          title: 'Check model memory',
          description: 'Verify model has sufficient memory',
          command: 'kubectl top pods -n fineprint -l component=model-server',
          expectedOutcome: 'Memory usage within limits',
          automatable: true,
        },
        {
          order: 4,
          title: 'Restart model server',
          description: 'Restart the model server pod if unhealthy',
          command: 'kubectl rollout restart -n fineprint deployment/model-server',
          expectedOutcome: 'Model server restarted successfully',
          automatable: true,
        },
        {
          order: 5,
          title: 'Fallback to backup model',
          description: 'Switch to backup model version if primary fails',
          command: 'curl -X POST http://model-management:8001/api/models/fallback',
          expectedOutcome: 'Switched to backup model',
          rollbackProcedure: 'curl -X POST http://model-management:8001/api/models/primary',
          automatable: true,
        },
        {
          order: 6,
          title: 'Clear model cache',
          description: 'Clear model cache if corruption suspected',
          command: 'redis-cli -n 1 FLUSHDB',
          expectedOutcome: 'Model cache cleared',
          automatable: true,
        },
      ],
    });

    // Database Connection Pool Exhaustion
    this.runbooks.set('db-pool-exhaustion', {
      id: 'db-pool-exhaustion',
      title: 'Database Connection Pool Exhaustion',
      service: 'database',
      alertType: 'connection-pool',
      automationAvailable: true,
      estimatedTime: 10,
      requiredPermissions: ['database:read', 'database:admin', 'pods:restart'],
      contactEscalation: ['database-on-call', 'platform-team'],
      steps: [
        {
          order: 1,
          title: 'Check connection pool status',
          description: 'Query current connection pool usage',
          command: 'psql -h postgres -U admin -c "SELECT * FROM pg_stat_activity;"',
          expectedOutcome: 'Active connections identified',
          automatable: true,
        },
        {
          order: 2,
          title: 'Identify long-running queries',
          description: 'Find queries running longer than 1 minute',
          command: 'psql -h postgres -U admin -c "SELECT * FROM pg_stat_activity WHERE state != \'idle\' AND query_start < now() - interval \'1 minute\';"',
          expectedOutcome: 'Long-running queries identified',
          automatable: true,
        },
        {
          order: 3,
          title: 'Kill problematic connections',
          description: 'Terminate long-running or idle connections',
          command: 'psql -h postgres -U admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = \'idle\' AND query_start < now() - interval \'5 minutes\';"',
          expectedOutcome: 'Idle connections terminated',
          automatable: true,
        },
        {
          order: 4,
          title: 'Increase pool size temporarily',
          description: 'Increase connection pool size if needed',
          command: 'kubectl set env -n fineprint deployment/api-gateway DB_POOL_SIZE=50',
          expectedOutcome: 'Pool size increased',
          rollbackProcedure: 'kubectl set env -n fineprint deployment/api-gateway DB_POOL_SIZE=20',
          automatable: true,
        },
        {
          order: 5,
          title: 'Restart affected services',
          description: 'Restart services with connection issues',
          command: 'kubectl rollout restart -n fineprint deployment/api-gateway',
          expectedOutcome: 'Services restarted with fresh connections',
          automatable: true,
        },
      ],
    });
  }

  private initializeEscalationPolicies(): void {
    // Define escalation policies for different teams
    this.escalationPolicies.set('platform', [
      'platform-on-call',
      'platform-secondary',
      'platform-team-lead',
      'platform-director',
      'cto',
    ]);

    this.escalationPolicies.set('ml', [
      'ml-on-call',
      'ml-secondary',
      'ml-team-lead',
      'chief-scientist',
    ]);

    this.escalationPolicies.set('product', [
      'product-on-call',
      'product-manager',
      'product-director',
    ]);
  }

  private async loadOnCallSchedule(): Promise<void> {
    // In production, this would fetch from PagerDuty API
    // For now, use mock schedule
    const now = new Date();
    const hour = now.getHours();
    
    // Simulate different on-call based on time
    if (hour >= 9 && hour < 17) {
      this.onCallSchedule.set('platform', ['alice@fineprint.ai', 'bob@fineprint.ai']);
      this.onCallSchedule.set('ml', ['charlie@fineprint.ai']);
    } else {
      this.onCallSchedule.set('platform', ['david@fineprint.ai', 'eve@fineprint.ai']);
      this.onCallSchedule.set('ml', ['frank@fineprint.ai']);
    }
  }

  private startIncidentMonitoring(): void {
    // Check for auto-resolution every minute
    setInterval(() => {
      this.checkAutoResolution();
    }, 60000);

    // Update incident metrics every 30 seconds
    setInterval(() => {
      this.updateIncidentMetrics();
    }, 30000);

    // Check for stale incidents every 5 minutes
    setInterval(() => {
      this.checkStaleIncidents();
    }, 300000);
  }

  async createIncident(params: {
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    service: string;
    impactedServices?: string[];
    runbookUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<Incident> {
    const incidentId = uuidv4();
    const team = this.getTeamForService(params.service);
    
    const incident: Incident = {
      id: incidentId,
      title: params.title,
      description: params.description,
      severity: params.severity,
      status: 'open',
      service: params.service,
      team,
      startTime: new Date(),
      impactedServices: params.impactedServices || [params.service],
      postMortemRequired: params.severity === 'critical',
      timeline: [
        {
          timestamp: new Date(),
          type: 'created',
          author: 'system',
          description: `Incident created: ${params.title}`,
          metadata: params.metadata,
        },
      ],
      runbookUrl: params.runbookUrl || this.getRunbookUrl(params.title),
      metrics: {},
      tags: this.generateTags(params),
    };

    this.incidents.set(incidentId, incident);

    // Create PagerDuty incident if critical
    if (params.severity === 'critical' && this.pagerDutyClient) {
      try {
        const pdIncident = await this.createPagerDutyIncident(incident);
        incident.pagerDutyIncidentId = pdIncident.id;
      } catch (error) {
        logger.error('Failed to create PagerDuty incident', error);
      }
    }

    // Notify relevant parties
    await this.notifyIncident(incident);

    // Start auto-remediation if available
    if (this.hasAutoRemediation(incident)) {
      await this.startAutoRemediation(incident);
    }

    this.emit('incident-created', incident);
    logger.info(`Incident created: ${incidentId}`, { incident });

    return incident;
  }

  async acknowledgeIncident(incidentId: string, acknowledgedBy: string): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    incident.status = 'acknowledged';
    incident.acknowledgedTime = new Date();
    incident.assignee = acknowledgedBy;
    
    incident.timeline.push({
      timestamp: new Date(),
      type: 'acknowledged',
      author: acknowledgedBy,
      description: `Incident acknowledged by ${acknowledgedBy}`,
    });

    // Update PagerDuty if applicable
    if (incident.pagerDutyIncidentId && this.pagerDutyClient) {
      await this.acknowledgePagerDutyIncident(incident.pagerDutyIncidentId);
    }

    this.emit('incident-acknowledged', incident);
    logger.info(`Incident acknowledged: ${incidentId}`, { acknowledgedBy });
  }

  async updateIncident(
    incidentId: string,
    update: {
      status?: 'investigating' | 'resolved' | 'closed';
      description?: string;
      rootCause?: string;
      resolution?: string;
      metadata?: Record<string, any>;
    },
    updatedBy: string
  ): Promise<void> {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    if (update.status) {
      incident.status = update.status;
      if (update.status === 'resolved') {
        incident.resolvedTime = new Date();
      } else if (update.status === 'closed') {
        incident.closedTime = new Date();
      }
    }

    if (update.rootCause) {
      incident.rootCause = update.rootCause;
    }

    if (update.resolution) {
      incident.resolution = update.resolution;
    }

    incident.timeline.push({
      timestamp: new Date(),
      type: 'updated',
      author: updatedBy,
      description: update.description || `Incident updated to ${update.status}`,
      metadata: update.metadata,
    });

    this.emit('incident-updated', incident);
    logger.info(`Incident updated: ${incidentId}`, { update, updatedBy });
  }

  async resolveIncident(
    incidentId: string,
    resolution: string,
    resolvedBy: string
  ): Promise<void> {
    await this.updateIncident(
      incidentId,
      {
        status: 'resolved',
        resolution,
      },
      resolvedBy
    );

    const incident = this.incidents.get(incidentId)!;
    
    // Calculate MTTR
    const mttr = incident.resolvedTime!.getTime() - incident.startTime.getTime();
    logger.info(`Incident resolved: ${incidentId}`, { mttr, resolution });

    // Close PagerDuty incident
    if (incident.pagerDutyIncidentId && this.pagerDutyClient) {
      await this.resolvePagerDutyIncident(incident.pagerDutyIncidentId);
    }

    // Schedule post-mortem if required
    if (incident.postMortemRequired) {
      await this.schedulePostMortem(incident);
    }

    this.emit('incident-resolved', incident);
  }

  async executeRunbook(incidentId: string, runbookId: string): Promise<void> {
    const incident = this.incidents.get(incidentId);
    const runbook = this.runbooks.get(runbookId);
    
    if (!incident || !runbook) {
      throw new Error('Incident or runbook not found');
    }

    logger.info(`Executing runbook ${runbookId} for incident ${incidentId}`);

    for (const step of runbook.steps) {
      if (step.automatable) {
        try {
          await this.executeRunbookStep(step, incident);
          
          incident.timeline.push({
            timestamp: new Date(),
            type: 'updated',
            author: 'automation',
            description: `Executed runbook step: ${step.title}`,
            metadata: { step: step.order, success: true },
          });
        } catch (error) {
          logger.error(`Failed to execute runbook step ${step.order}`, error);
          
          incident.timeline.push({
            timestamp: new Date(),
            type: 'updated',
            author: 'automation',
            description: `Failed to execute runbook step: ${step.title}`,
            metadata: { step: step.order, error: String(error) },
          });

          // Stop automation on failure
          break;
        }
      }
    }
  }

  private async executeRunbookStep(step: RunbookStep, incident: Incident): Promise<void> {
    // In production, this would execute actual commands
    // For now, simulate execution
    logger.info(`Executing step: ${step.title}`, { command: step.command });
    
    // Simulate command execution delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate success/failure (90% success rate)
    if (Math.random() > 0.9) {
      throw new Error(`Step failed: ${step.title}`);
    }
  }

  private getTeamForService(service: string): string {
    const teamMap: Record<string, string> = {
      'model-management': 'ml',
      'ab-testing': 'product',
      'learning-pipeline': 'ml',
      'api-gateway': 'platform',
      'database': 'platform',
      'cache': 'platform',
    };
    
    return teamMap[service] || 'platform';
  }

  private getRunbookUrl(title: string): string | undefined {
    // Match incident title to runbook
    if (title.toLowerCase().includes('error rate')) {
      return '/runbooks/high-error-rate';
    }
    if (title.toLowerCase().includes('model') || title.toLowerCase().includes('inference')) {
      return '/runbooks/model-inference-failure';
    }
    if (title.toLowerCase().includes('database') || title.toLowerCase().includes('connection')) {
      return '/runbooks/db-pool-exhaustion';
    }
    return undefined;
  }

  private generateTags(params: any): string[] {
    const tags: string[] = [params.severity, params.service];
    
    if (params.severity === 'critical') {
      tags.push('immediate-response');
    }
    
    if (params.service.includes('model') || params.service.includes('ai')) {
      tags.push('ml');
    }
    
    if (params.metadata?.customerImpact) {
      tags.push('customer-facing');
    }
    
    return tags;
  }

  private hasAutoRemediation(incident: Incident): boolean {
    return incident.runbookUrl !== undefined && 
           incident.severity !== 'critical'; // Don't auto-remediate critical incidents
  }

  private async startAutoRemediation(incident: Incident): Promise<void> {
    if (!incident.runbookUrl) return;
    
    const runbookId = incident.runbookUrl.split('/').pop();
    if (!runbookId) return;
    
    logger.info(`Starting auto-remediation for incident ${incident.id}`);
    
    // Execute runbook asynchronously
    this.executeRunbook(incident.id, runbookId).catch(error => {
      logger.error(`Auto-remediation failed for incident ${incident.id}`, error);
    });
  }

  private async notifyIncident(incident: Incident): Promise<void> {
    // Get on-call personnel
    const onCall = this.onCallSchedule.get(incident.team) || [];
    
    logger.info(`Notifying incident to on-call`, { 
      incident: incident.id, 
      team: incident.team,
      onCall 
    });
    
    // In production, this would send actual notifications
    // via Slack, email, SMS, etc.
  }

  private async checkAutoResolution(): Promise<void> {
    for (const [id, incident] of this.incidents.entries()) {
      if (incident.status === 'resolved' || incident.status === 'closed') {
        continue;
      }
      
      // Check if incident conditions have cleared
      const shouldAutoResolve = await this.checkIncidentConditions(incident);
      
      if (shouldAutoResolve) {
        await this.resolveIncident(
          id,
          'Auto-resolved: Conditions cleared',
          'automation'
        );
      }
    }
  }

  private async checkIncidentConditions(incident: Incident): Promise<boolean> {
    // In production, check actual metrics
    // For now, simulate auto-resolution after 30 minutes for non-critical
    if (incident.severity !== 'critical') {
      const duration = Date.now() - incident.startTime.getTime();
      return duration > 30 * 60 * 1000; // 30 minutes
    }
    return false;
  }

  private async updateIncidentMetrics(): Promise<void> {
    for (const incident of this.incidents.values()) {
      if (incident.status === 'closed') continue;
      
      // In production, fetch actual metrics
      incident.metrics = {
        errorRate: Math.random() * 0.05,
        latency: 50 + Math.random() * 200,
        availability: 0.95 + Math.random() * 0.05,
      };
    }
  }

  private async checkStaleIncidents(): Promise<void> {
    const now = Date.now();
    
    for (const incident of this.incidents.values()) {
      if (incident.status === 'open' || incident.status === 'acknowledged') {
        const age = now - incident.startTime.getTime();
        
        // Escalate if incident is older than escalation threshold
        const escalationThreshold = this.getEscalationThreshold(incident.severity);
        
        if (age > escalationThreshold) {
          await this.escalateIncident(incident);
        }
      }
    }
  }

  private getEscalationThreshold(severity: string): number {
    const thresholds: Record<string, number> = {
      critical: 5 * 60 * 1000, // 5 minutes
      high: 15 * 60 * 1000, // 15 minutes
      medium: 30 * 60 * 1000, // 30 minutes
      low: 60 * 60 * 1000, // 1 hour
    };
    
    return thresholds[severity] || 30 * 60 * 1000;
  }

  private async escalateIncident(incident: Incident): Promise<void> {
    const escalationPath = this.escalationPolicies.get(incident.team) || [];
    
    // Find next escalation level
    const currentIndex = escalationPath.findIndex(
      level => level === incident.assignee
    );
    
    const nextIndex = currentIndex + 1;
    if (nextIndex < escalationPath.length) {
      const nextLevel = escalationPath[nextIndex];
      
      logger.info(`Escalating incident ${incident.id} to ${nextLevel}`);
      
      incident.timeline.push({
        timestamp: new Date(),
        type: 'escalated',
        author: 'system',
        description: `Incident escalated to ${nextLevel}`,
      });
      
      this.emit('incident-escalated', incident);
    }
  }

  private async schedulePostMortem(incident: Incident): Promise<void> {
    logger.info(`Scheduling post-mortem for incident ${incident.id}`);
    
    // In production, this would create calendar invites, documents, etc.
    const postMortemDate = new Date();
    postMortemDate.setDate(postMortemDate.getDate() + 2); // 2 days later
    
    this.emit('postmortem-scheduled', {
      incident,
      scheduledDate: postMortemDate,
    });
  }

  // PagerDuty integration methods
  private async createPagerDutyIncident(incident: Incident): Promise<any> {
    // Mock PagerDuty incident creation
    return { id: `pd-${incident.id}` };
  }

  private async acknowledgePagerDutyIncident(pdIncidentId: string): Promise<void> {
    logger.info(`Acknowledging PagerDuty incident ${pdIncidentId}`);
  }

  private async resolvePagerDutyIncident(pdIncidentId: string): Promise<void> {
    logger.info(`Resolving PagerDuty incident ${pdIncidentId}`);
  }

  async getIncidents(filter?: {
    status?: string;
    severity?: string;
    service?: string;
    team?: string;
  }): Promise<Incident[]> {
    let incidents = Array.from(this.incidents.values());
    
    if (filter) {
      if (filter.status) {
        incidents = incidents.filter(i => i.status === filter.status);
      }
      if (filter.severity) {
        incidents = incidents.filter(i => i.severity === filter.severity);
      }
      if (filter.service) {
        incidents = incidents.filter(i => i.service === filter.service);
      }
      if (filter.team) {
        incidents = incidents.filter(i => i.team === filter.team);
      }
    }
    
    return incidents.sort((a, b) => 
      b.startTime.getTime() - a.startTime.getTime()
    );
  }

  async getIncidentMetrics(): Promise<{
    mttr: number;
    mtbf: number;
    incidentRate: number;
    resolutionRate: number;
  }> {
    const resolved = Array.from(this.incidents.values())
      .filter(i => i.status === 'resolved' || i.status === 'closed');
    
    // Calculate MTTR (Mean Time To Resolve)
    const mttrs = resolved
      .filter(i => i.resolvedTime)
      .map(i => i.resolvedTime!.getTime() - i.startTime.getTime());
    
    const mttr = mttrs.length > 0 
      ? mttrs.reduce((a, b) => a + b, 0) / mttrs.length 
      : 0;
    
    // Calculate MTBF (Mean Time Between Failures)
    const sortedIncidents = Array.from(this.incidents.values())
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    
    const gaps = [];
    for (let i = 1; i < sortedIncidents.length; i++) {
      gaps.push(
        sortedIncidents[i].startTime.getTime() - 
        sortedIncidents[i-1].startTime.getTime()
      );
    }
    
    const mtbf = gaps.length > 0
      ? gaps.reduce((a, b) => a + b, 0) / gaps.length
      : 0;
    
    // Calculate rates
    const total = this.incidents.size;
    const resolvedCount = resolved.length;
    
    return {
      mttr: mttr / 1000 / 60, // Convert to minutes
      mtbf: mtbf / 1000 / 60 / 60, // Convert to hours
      incidentRate: total / 30, // Per day (assuming 30 days of data)
      resolutionRate: total > 0 ? (resolvedCount / total) * 100 : 0,
    };
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Incident Manager');
    this.removeAllListeners();
  }
}