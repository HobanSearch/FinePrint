import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { chaosLogger as logger } from '../utils/logger';

export interface ChaosExperiment {
  id: string;
  name: string;
  description: string;
  type: 'network-delay' | 'network-loss' | 'pod-failure' | 'cpu-stress' | 'memory-stress' | 'disk-stress' | 'dns-failure';
  target: {
    service: string;
    namespace: string;
    selector: Record<string, string>;
    percentage: number; // Percentage of targets to affect
  };
  parameters: Record<string, any>;
  schedule?: string; // Cron expression
  duration: number; // in milliseconds
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled-back';
  hypothesis: string;
  expectedOutcome: string;
  actualOutcome?: string;
  startedAt?: Date;
  completedAt?: Date;
  metrics: {
    before: Record<string, number>;
    during: Record<string, number>;
    after: Record<string, number>;
  };
  rollbackPlan: string;
  approvedBy?: string;
  tags: string[];
}

export interface ExperimentResult {
  experimentId: string;
  success: boolean;
  hypothesisValidated: boolean;
  findings: string[];
  recommendations: string[];
  incidentsTriggered: string[];
  metricsImpact: {
    availability: number;
    latency: number;
    errorRate: number;
  };
}

export interface GameDay {
  id: string;
  name: string;
  description: string;
  scheduledDate: Date;
  experiments: string[]; // Experiment IDs
  participants: string[];
  objectives: string[];
  successCriteria: string[];
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  report?: GameDayReport;
}

export interface GameDayReport {
  summary: string;
  experimentsRun: number;
  incidentsCreated: number;
  mttr: number; // Mean time to recovery
  lessonsLearned: string[];
  actionItems: Array<{
    title: string;
    owner: string;
    priority: string;
    dueDate: Date;
  }>;
}

/**
 * Chaos Engineering System for Fine Print AI
 * Implements controlled failure injection and resilience testing
 */
export class ChaosEngineer extends EventEmitter {
  private experiments: Map<string, ChaosExperiment>;
  private experimentQueue: ChaosExperiment[];
  private activeExperiments: Set<string>;
  private gameDays: Map<string, GameDay>;
  private experimentHistory: Map<string, ExperimentResult>;
  private scheduleInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.experiments = new Map();
    this.experimentQueue = [];
    this.activeExperiments = new Set();
    this.gameDays = new Map();
    this.experimentHistory = new Map();
    
    this.initializeExperimentTemplates();
  }

  private initializeExperimentTemplates(): void {
    // Network Delay Experiment
    this.createExperimentTemplate({
      name: 'network-delay-api-gateway',
      description: 'Inject network delay to API Gateway',
      type: 'network-delay',
      target: {
        service: 'api-gateway',
        namespace: 'fineprint',
        selector: { app: 'api-gateway' },
        percentage: 50,
      },
      parameters: {
        delay: '100ms',
        jitter: '10ms',
        correlation: '25',
      },
      duration: 5 * 60 * 1000, // 5 minutes
      hypothesis: 'API Gateway can handle 100ms network delay without significant user impact',
      expectedOutcome: 'P95 latency increases but remains under 500ms SLO',
      rollbackPlan: 'Remove network delay rules from affected pods',
      tags: ['network', 'latency', 'api-gateway'],
    });

    // Pod Failure Experiment
    this.createExperimentTemplate({
      name: 'pod-failure-model-server',
      description: 'Randomly terminate model server pods',
      type: 'pod-failure',
      target: {
        service: 'model-management',
        namespace: 'fineprint',
        selector: { component: 'model-server' },
        percentage: 33,
      },
      parameters: {
        interval: '30s',
        force: true,
      },
      duration: 10 * 60 * 1000, // 10 minutes
      hypothesis: 'Model server can maintain availability with 33% pod failures',
      expectedOutcome: 'No user-facing errors, automatic pod recovery within 2 minutes',
      rollbackPlan: 'Scale deployment to restore pod count',
      tags: ['kubernetes', 'availability', 'model-server'],
    });

    // CPU Stress Experiment
    this.createExperimentTemplate({
      name: 'cpu-stress-learning-pipeline',
      description: 'Apply CPU stress to learning pipeline workers',
      type: 'cpu-stress',
      target: {
        service: 'learning-pipeline',
        namespace: 'fineprint',
        selector: { component: 'training-worker' },
        percentage: 25,
      },
      parameters: {
        workers: 2,
        load: 80, // 80% CPU
      },
      duration: 15 * 60 * 1000, // 15 minutes
      hypothesis: 'Learning pipeline can handle CPU stress without job failures',
      expectedOutcome: 'Jobs complete successfully with increased duration',
      rollbackPlan: 'Kill stress processes on affected pods',
      tags: ['resources', 'cpu', 'learning-pipeline'],
    });

    // Memory Stress Experiment
    this.createExperimentTemplate({
      name: 'memory-stress-cache',
      description: 'Apply memory pressure to Redis cache',
      type: 'memory-stress',
      target: {
        service: 'redis-cache',
        namespace: 'fineprint',
        selector: { app: 'redis' },
        percentage: 100,
      },
      parameters: {
        size: '1G',
        duration: '5m',
      },
      duration: 5 * 60 * 1000,
      hypothesis: 'Redis cache handles memory pressure with eviction policies',
      expectedOutcome: 'Cache hit rate decreases but no service failures',
      rollbackPlan: 'Restart Redis pods to clear memory',
      tags: ['resources', 'memory', 'cache'],
    });

    // DNS Failure Experiment
    this.createExperimentTemplate({
      name: 'dns-failure-external',
      description: 'Simulate DNS resolution failures for external services',
      type: 'dns-failure',
      target: {
        service: 'all',
        namespace: 'fineprint',
        selector: {},
        percentage: 100,
      },
      parameters: {
        domains: ['*.googleapis.com', '*.aws.com'],
        errorType: 'NXDOMAIN',
      },
      duration: 3 * 60 * 1000, // 3 minutes
      hypothesis: 'Services gracefully handle external DNS failures',
      expectedOutcome: 'Fallback to cached data or error messages',
      rollbackPlan: 'Remove DNS poison entries',
      tags: ['network', 'dns', 'external-dependencies'],
    });
  }

  private createExperimentTemplate(template: Omit<ChaosExperiment, 'id' | 'status' | 'metrics'>): void {
    const experiment: ChaosExperiment = {
      id: uuidv4(),
      ...template,
      status: 'pending',
      metrics: {
        before: {},
        during: {},
        after: {},
      },
    };
    
    this.experiments.set(experiment.name, experiment);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Chaos Engineer');
    
    // Start scheduled experiments if enabled
    if (config.chaos.enabled) {
      this.startScheduler();
    }
    
    this.emit('initialized');
  }

  private startScheduler(): void {
    this.scheduleInterval = setInterval(() => {
      this.runScheduledExperiments();
    }, 60000); // Check every minute
  }

  async runScheduledExperiments(): Promise<void> {
    if (config.chaos.dryRun) {
      logger.info('Chaos experiments in dry-run mode');
      return;
    }
    
    const now = new Date();
    const experiments = Array.from(this.experiments.values())
      .filter(exp => exp.schedule && exp.status === 'pending');
    
    for (const experiment of experiments) {
      if (this.shouldRunExperiment(experiment, now)) {
        await this.runExperiment(experiment.id);
      }
    }
  }

  private shouldRunExperiment(experiment: ChaosExperiment, now: Date): boolean {
    // In production, use cron expression parser
    // For now, run experiments based on configured interval
    const lastRun = experiment.completedAt;
    if (!lastRun) return true;
    
    const timeSinceLastRun = now.getTime() - lastRun.getTime();
    return timeSinceLastRun >= config.chaos.interval;
  }

  async runExperiment(experimentId: string): Promise<ExperimentResult> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }
    
    if (this.activeExperiments.size >= config.chaos.maxConcurrentExperiments) {
      logger.warn('Maximum concurrent experiments reached', {
        active: this.activeExperiments.size,
        max: config.chaos.maxConcurrentExperiments,
      });
      throw new Error('Maximum concurrent experiments reached');
    }
    
    logger.info(`Starting chaos experiment: ${experiment.name}`, { experiment });
    
    experiment.status = 'running';
    experiment.startedAt = new Date();
    this.activeExperiments.add(experimentId);
    
    // Collect baseline metrics
    experiment.metrics.before = await this.collectMetrics(experiment.target.service);
    
    try {
      // Inject failure
      await this.injectFailure(experiment);
      
      // Wait for experiment duration
      await new Promise(resolve => setTimeout(resolve, experiment.duration));
      
      // Collect metrics during experiment
      experiment.metrics.during = await this.collectMetrics(experiment.target.service);
      
      // Remove failure injection
      await this.removeFailure(experiment);
      
      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute
      
      // Collect post-experiment metrics
      experiment.metrics.after = await this.collectMetrics(experiment.target.service);
      
      // Analyze results
      const result = await this.analyzeExperiment(experiment);
      
      experiment.status = 'completed';
      experiment.completedAt = new Date();
      experiment.actualOutcome = result.findings.join('; ');
      
      this.experimentHistory.set(experimentId, result);
      
      logger.info(`Chaos experiment completed: ${experiment.name}`, { result });
      
      this.emit('experiment-completed', { experiment, result });
      
      return result;
      
    } catch (error) {
      logger.error(`Chaos experiment failed: ${experiment.name}`, error);
      
      experiment.status = 'failed';
      experiment.completedAt = new Date();
      
      // Attempt rollback
      if (config.chaos.rollbackOnFailure) {
        await this.rollbackExperiment(experiment);
      }
      
      const result: ExperimentResult = {
        experimentId,
        success: false,
        hypothesisValidated: false,
        findings: [`Experiment failed: ${error}`],
        recommendations: ['Review experiment parameters', 'Check target service health'],
        incidentsTriggered: [],
        metricsImpact: {
          availability: 0,
          latency: 0,
          errorRate: 0,
        },
      };
      
      this.emit('experiment-failed', { experiment, error });
      
      return result;
      
    } finally {
      this.activeExperiments.delete(experimentId);
    }
  }

  private async injectFailure(experiment: ChaosExperiment): Promise<void> {
    logger.info(`Injecting failure: ${experiment.type}`, {
      target: experiment.target,
      parameters: experiment.parameters,
    });
    
    switch (experiment.type) {
      case 'network-delay':
        await this.injectNetworkDelay(experiment);
        break;
      case 'network-loss':
        await this.injectNetworkLoss(experiment);
        break;
      case 'pod-failure':
        await this.injectPodFailure(experiment);
        break;
      case 'cpu-stress':
        await this.injectCPUStress(experiment);
        break;
      case 'memory-stress':
        await this.injectMemoryStress(experiment);
        break;
      case 'disk-stress':
        await this.injectDiskStress(experiment);
        break;
      case 'dns-failure':
        await this.injectDNSFailure(experiment);
        break;
    }
  }

  private async removeFailure(experiment: ChaosExperiment): Promise<void> {
    logger.info(`Removing failure injection: ${experiment.type}`, {
      target: experiment.target,
    });
    
    // In production, this would remove the actual failure injection
    // For now, simulate removal
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async injectNetworkDelay(experiment: ChaosExperiment): Promise<void> {
    // In production, use tc (traffic control) or service mesh
    const command = `tc qdisc add dev eth0 root netem delay ${experiment.parameters.delay}`;
    logger.info('Injecting network delay', { command });
  }

  private async injectNetworkLoss(experiment: ChaosExperiment): Promise<void> {
    const command = `tc qdisc add dev eth0 root netem loss ${experiment.parameters.lossPercentage}%`;
    logger.info('Injecting network loss', { command });
  }

  private async injectPodFailure(experiment: ChaosExperiment): Promise<void> {
    const command = `kubectl delete pods -n ${experiment.target.namespace} -l ${this.selectorToString(experiment.target.selector)} --force`;
    logger.info('Injecting pod failure', { command });
  }

  private async injectCPUStress(experiment: ChaosExperiment): Promise<void> {
    const command = `stress-ng --cpu ${experiment.parameters.workers} --cpu-load ${experiment.parameters.load}`;
    logger.info('Injecting CPU stress', { command });
  }

  private async injectMemoryStress(experiment: ChaosExperiment): Promise<void> {
    const command = `stress-ng --vm 1 --vm-bytes ${experiment.parameters.size} --timeout ${experiment.parameters.duration}`;
    logger.info('Injecting memory stress', { command });
  }

  private async injectDiskStress(experiment: ChaosExperiment): Promise<void> {
    const command = `stress-ng --hdd 1 --hdd-bytes ${experiment.parameters.size}`;
    logger.info('Injecting disk stress', { command });
  }

  private async injectDNSFailure(experiment: ChaosExperiment): Promise<void> {
    // In production, modify CoreDNS or use network policies
    logger.info('Injecting DNS failure', { domains: experiment.parameters.domains });
  }

  private selectorToString(selector: Record<string, string>): string {
    return Object.entries(selector)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
  }

  private async collectMetrics(service: string): Promise<Record<string, number>> {
    // In production, query Prometheus for actual metrics
    // For now, return simulated metrics
    return {
      availability: 0.95 + Math.random() * 0.05,
      latencyP95: 50 + Math.random() * 150,
      errorRate: Math.random() * 0.05,
      throughput: 100 + Math.random() * 50,
      cpuUsage: 30 + Math.random() * 50,
      memoryUsage: 40 + Math.random() * 40,
    };
  }

  private async analyzeExperiment(experiment: ChaosExperiment): Promise<ExperimentResult> {
    const metricsImpact = {
      availability: 
        ((experiment.metrics.during.availability || 1) / 
         (experiment.metrics.before.availability || 1) - 1) * 100,
      latency:
        ((experiment.metrics.during.latencyP95 || 0) - 
         (experiment.metrics.before.latencyP95 || 0)),
      errorRate:
        ((experiment.metrics.during.errorRate || 0) - 
         (experiment.metrics.before.errorRate || 0)) * 100,
    };
    
    const findings: string[] = [];
    const recommendations: string[] = [];
    
    // Analyze availability impact
    if (Math.abs(metricsImpact.availability) > 1) {
      findings.push(`Availability impacted by ${metricsImpact.availability.toFixed(2)}%`);
      if (metricsImpact.availability < -5) {
        recommendations.push('Improve redundancy and failover mechanisms');
      }
    }
    
    // Analyze latency impact
    if (metricsImpact.latency > 50) {
      findings.push(`Latency increased by ${metricsImpact.latency.toFixed(0)}ms`);
      recommendations.push('Optimize timeout and retry configurations');
    }
    
    // Analyze error rate impact
    if (metricsImpact.errorRate > 1) {
      findings.push(`Error rate increased by ${metricsImpact.errorRate.toFixed(2)}%`);
      recommendations.push('Improve error handling and circuit breakers');
    }
    
    // Check hypothesis validation
    const hypothesisValidated = this.validateHypothesis(experiment, metricsImpact);
    
    if (hypothesisValidated) {
      findings.push('Hypothesis validated: System behaved as expected');
    } else {
      findings.push('Hypothesis invalidated: System did not meet expectations');
      recommendations.push('Review and update resilience strategies');
    }
    
    // Check for triggered incidents
    const incidentsTriggered = this.checkTriggeredIncidents(experiment);
    
    return {
      experimentId: experiment.id,
      success: true,
      hypothesisValidated,
      findings,
      recommendations,
      incidentsTriggered,
      metricsImpact,
    };
  }

  private validateHypothesis(
    experiment: ChaosExperiment,
    metricsImpact: Record<string, number>
  ): boolean {
    // Simple validation based on impact thresholds
    // In production, use more sophisticated validation
    return Math.abs(metricsImpact.availability) < 5 &&
           metricsImpact.latency < 100 &&
           metricsImpact.errorRate < 5;
  }

  private checkTriggeredIncidents(experiment: ChaosExperiment): string[] {
    // In production, check with incident management system
    // For now, simulate based on metrics impact
    const incidents: string[] = [];
    
    if (experiment.metrics.during.errorRate > 0.05) {
      incidents.push('high-error-rate');
    }
    
    if (experiment.metrics.during.latencyP95 > 200) {
      incidents.push('high-latency');
    }
    
    if (experiment.metrics.during.availability < 0.95) {
      incidents.push('low-availability');
    }
    
    return incidents;
  }

  private async rollbackExperiment(experiment: ChaosExperiment): Promise<void> {
    logger.info(`Rolling back experiment: ${experiment.name}`);
    
    try {
      await this.removeFailure(experiment);
      experiment.status = 'rolled-back';
      
      this.emit('experiment-rolled-back', experiment);
    } catch (error) {
      logger.error(`Failed to rollback experiment: ${experiment.name}`, error);
    }
  }

  async createGameDay(params: {
    name: string;
    description: string;
    scheduledDate: Date;
    experiments: string[];
    participants: string[];
    objectives: string[];
    successCriteria: string[];
  }): Promise<GameDay> {
    const gameDay: GameDay = {
      id: uuidv4(),
      ...params,
      status: 'scheduled',
    };
    
    this.gameDays.set(gameDay.id, gameDay);
    
    logger.info(`Game day scheduled: ${gameDay.name}`, { gameDay });
    
    return gameDay;
  }

  async runGameDay(gameDayId: string): Promise<GameDayReport> {
    const gameDay = this.gameDays.get(gameDayId);
    if (!gameDay) {
      throw new Error(`Game day ${gameDayId} not found`);
    }
    
    logger.info(`Starting game day: ${gameDay.name}`);
    
    gameDay.status = 'in-progress';
    
    const results: ExperimentResult[] = [];
    const startTime = Date.now();
    let incidentsCreated = 0;
    const lessonsLearned: string[] = [];
    
    for (const experimentId of gameDay.experiments) {
      try {
        const result = await this.runExperiment(experimentId);
        results.push(result);
        incidentsCreated += result.incidentsTriggered.length;
        
        // Collect lessons learned
        if (!result.hypothesisValidated) {
          lessonsLearned.push(`${experimentId}: Hypothesis not validated`);
        }
        
        result.recommendations.forEach(rec => {
          if (!lessonsLearned.includes(rec)) {
            lessonsLearned.push(rec);
          }
        });
        
      } catch (error) {
        logger.error(`Game day experiment failed: ${experimentId}`, error);
      }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    const report: GameDayReport = {
      summary: `Ran ${results.length} experiments with ${results.filter(r => r.success).length} successes`,
      experimentsRun: results.length,
      incidentsCreated,
      mttr: duration / incidentsCreated || 0,
      lessonsLearned,
      actionItems: this.generateActionItems(results),
    };
    
    gameDay.status = 'completed';
    gameDay.report = report;
    
    logger.info(`Game day completed: ${gameDay.name}`, { report });
    
    return report;
  }

  private generateActionItems(results: ExperimentResult[]): Array<{
    title: string;
    owner: string;
    priority: string;
    dueDate: Date;
  }> {
    const actionItems: Array<{
      title: string;
      owner: string;
      priority: string;
      dueDate: Date;
    }> = [];
    
    const recommendations = new Set<string>();
    results.forEach(r => r.recommendations.forEach(rec => recommendations.add(rec)));
    
    recommendations.forEach(rec => {
      actionItems.push({
        title: rec,
        owner: 'platform-team',
        priority: rec.includes('Critical') ? 'P0' : 'P1',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
      });
    });
    
    return actionItems;
  }

  getExperiments(): ChaosExperiment[] {
    return Array.from(this.experiments.values());
  }

  getExperimentHistory(): ExperimentResult[] {
    return Array.from(this.experimentHistory.values());
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Chaos Engineer');
    
    if (this.scheduleInterval) {
      clearInterval(this.scheduleInterval);
    }
    
    // Rollback any active experiments
    for (const experimentId of this.activeExperiments) {
      const experiment = this.experiments.get(experimentId);
      if (experiment) {
        await this.rollbackExperiment(experiment);
      }
    }
    
    this.removeAllListeners();
  }
}