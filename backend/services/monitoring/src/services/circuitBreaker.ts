import { createServiceLogger } from '@fineprintai/shared-logger';
import CircuitBreaker from 'opossum';
import { EventEmitter } from 'events';
import pTimeout from 'p-timeout';

const logger = createServiceLogger('circuit-breaker-service');

interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
  name?: string;
  group?: string;
  allowWarmUp?: boolean;
  volumeThreshold?: number;
}

interface CircuitBreakerStats {
  name: string;
  state: 'OPEN' | 'HALF_OPEN' | 'CLOSED';
  failureCount: number;
  successCount: number;
  rejectionCount: number;
  failureRate: number;
  averageResponseTime: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
}

interface CircuitBreakerGroup {
  name: string;
  breakers: Map<string, CircuitBreaker>;
  stats: {
    totalBreakers: number;
    openBreakers: number;
    halfOpenBreakers: number;
    closedBreakers: number;
  };
}

class CircuitBreakerService extends EventEmitter {
  private breakers = new Map<string, CircuitBreaker>();
  private groups = new Map<string, CircuitBreakerGroup>();
  private initialized = false;
  private statsCollectionInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing circuit breaker service...');
    
    try {
      // Start stats collection
      this.startStatsCollection();
      
      this.initialized = true;
      logger.info('Circuit breaker service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize circuit breaker service', { error });
      throw error;
    }
  }

  createCircuitBreaker<T extends any[], R>(
    name: string,
    action: (...args: T) => Promise<R>,
    options: CircuitBreakerOptions = {}
  ): CircuitBreaker {
    if (this.breakers.has(name)) {
      logger.warn('Circuit breaker already exists, returning existing instance', { name });
      return this.breakers.get(name)!;
    }

    const defaultOptions = {
      timeout: 30000, // 30 seconds
      errorThresholdPercentage: 50, // 50% error rate threshold
      resetTimeout: 60000, // 1 minute
      rollingCountTimeout: 10000, // 10 seconds
      rollingCountBuckets: 10,
      volumeThreshold: 10, // Minimum number of requests
      allowWarmUp: true,
      name,
      ...options,
    };

    // Wrap the action with timeout if specified
    const wrappedAction = options.timeout 
      ? (...args: T) => pTimeout(action(...args), options.timeout!, `Circuit breaker timeout: ${name}`)
      : action;

    const breaker = new CircuitBreaker(wrappedAction, defaultOptions);

    // Add event listeners for monitoring
    this.setupBreakerEventListeners(breaker, name);

    // Store breaker
    this.breakers.set(name, breaker);

    // Add to group if specified
    if (options.group) {
      this.addBreakerToGroup(options.group, name, breaker);
    }

    logger.info('Created circuit breaker', {
      name,
      group: options.group,
      timeout: defaultOptions.timeout,
      errorThreshold: defaultOptions.errorThresholdPercentage,
    });

    return breaker;
  }

  async execute<T extends any[], R>(
    name: string,
    action: (...args: T) => Promise<R>,
    options: CircuitBreakerOptions = {}
  ): Promise<R> {
    let breaker = this.breakers.get(name);
    
    if (!breaker) {
      breaker = this.createCircuitBreaker(name, action, options);
    }

    try {
      const result = await breaker.fire(...([] as any as T));
      return result as R;
    } catch (error) {
      // Log circuit breaker specific errors
      if (error.message?.includes('Circuit breaker is OPEN')) {
        logger.warn('Circuit breaker is open, rejecting request', { name });
      } else if (error.message?.includes('timeout')) {
        logger.warn('Circuit breaker timeout', { name, timeout: options.timeout });
      }
      
      throw error;
    }
  }

  getCircuitBreaker(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAllCircuitBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  getBreakerStats(name: string): CircuitBreakerStats | undefined {
    const breaker = this.breakers.get(name);
    if (!breaker) return undefined;

    const stats = breaker.stats;
    const totalRequests = stats.successes + stats.failures;
    const failureRate = totalRequests > 0 ? (stats.failures / totalRequests) * 100 : 0;

    return {
      name,
      state: breaker.opened ? 'OPEN' : breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
      failureCount: stats.failures,
      successCount: stats.successes,
      rejectionCount: stats.fallbacks, // Opossum uses 'fallbacks' for rejections
      failureRate,
      averageResponseTime: stats.latencyMean,
      lastFailureTime: stats.failures > 0 ? new Date() : undefined,
      lastSuccessTime: stats.successes > 0 ? new Date() : undefined,
    };
  }

  getAllBreakerStats(): CircuitBreakerStats[] {
    return Array.from(this.breakers.keys())
      .map(name => this.getBreakerStats(name))
      .filter(stats => stats !== undefined) as CircuitBreakerStats[];
  }

  getGroupStats(groupName: string): CircuitBreakerGroup | undefined {
    return this.groups.get(groupName);
  }

  getAllGroupStats(): CircuitBreakerGroup[] {
    return Array.from(this.groups.values());
  }

  // Manual control methods
  openCircuitBreaker(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (!breaker) return false;

    breaker.open();
    logger.info('Manually opened circuit breaker', { name });
    return true;
  }

  closeCircuitBreaker(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (!breaker) return false;

    breaker.close();
    logger.info('Manually closed circuit breaker', { name });
    return true;
  }

  resetCircuitBreaker(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (!breaker) return false;

    breaker.clearCache();
    logger.info('Reset circuit breaker cache', { name });
    return true;
  }

  // Bulk operations
  openAllBreakersInGroup(groupName: string): number {
    const group = this.groups.get(groupName);
    if (!group) return 0;

    let openedCount = 0;
    for (const [name, breaker] of group.breakers) {
      breaker.open();
      openedCount++;
      logger.info('Opened circuit breaker in group', { name, group: groupName });
    }

    return openedCount;
  }

  closeAllBreakersInGroup(groupName: string): number {
    const group = this.groups.get(groupName);
    if (!group) return 0;

    let closedCount = 0;
    for (const [name, breaker] of group.breakers) {
      breaker.close();
      closedCount++;
      logger.info('Closed circuit breaker in group', { name, group: groupName });
    }

    return closedCount;
  }

  removeCircuitBreaker(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (!breaker) return false;

    // Remove from all groups
    for (const group of this.groups.values()) {
      group.breakers.delete(name);
      this.updateGroupStats(group);
    }

    // Remove event listeners
    breaker.removeAllListeners();

    this.breakers.delete(name);
    logger.info('Removed circuit breaker', { name });
    return true;
  }

  private setupBreakerEventListeners(breaker: CircuitBreaker, name: string): void {
    breaker.on('open', () => {
      logger.warn('Circuit breaker opened', { name });
      this.emit('breakerOpened', { name, breaker });
    });

    breaker.on('halfOpen', () => {
      logger.info('Circuit breaker half-opened', { name });
      this.emit('breakerHalfOpened', { name, breaker });
    });

    breaker.on('close', () => {
      logger.info('Circuit breaker closed', { name });
      this.emit('breakerClosed', { name, breaker });
    });

    breaker.on('success', (result, latency) => {
      logger.debug('Circuit breaker success', { name, latency });
      this.emit('breakerSuccess', { name, result, latency });
    });

    breaker.on('failure', (error, latency) => {
      logger.warn('Circuit breaker failure', { 
        name, 
        error: error.message,
        latency 
      });
      this.emit('breakerFailure', { name, error, latency });
    });

    breaker.on('reject', () => {
      logger.warn('Circuit breaker rejected request', { name });
      this.emit('breakerRejected', { name });
    });

    breaker.on('timeout', () => {
      logger.warn('Circuit breaker timeout', { name });
      this.emit('breakerTimeout', { name });
    });

    breaker.on('fallback', (result) => {
      logger.info('Circuit breaker fallback executed', { name });
      this.emit('breakerFallback', { name, result });
    });
  }

  private addBreakerToGroup(groupName: string, breakerName: string, breaker: CircuitBreaker): void {
    let group = this.groups.get(groupName);
    
    if (!group) {
      group = {
        name: groupName,
        breakers: new Map(),
        stats: {
          totalBreakers: 0,
          openBreakers: 0,
          halfOpenBreakers: 0,
          closedBreakers: 0,
        },
      };
      this.groups.set(groupName, group);
    }

    group.breakers.set(breakerName, breaker);
    this.updateGroupStats(group);

    logger.debug('Added circuit breaker to group', {
      breakerName,
      groupName,
      groupSize: group.breakers.size,
    });
  }

  private updateGroupStats(group: CircuitBreakerGroup): void {
    group.stats.totalBreakers = group.breakers.size;
    group.stats.openBreakers = 0;
    group.stats.halfOpenBreakers = 0;
    group.stats.closedBreakers = 0;

    for (const breaker of group.breakers.values()) {
      if (breaker.opened) {
        group.stats.openBreakers++;
      } else if (breaker.halfOpen) {
        group.stats.halfOpenBreakers++;
      } else {
        group.stats.closedBreakers++;
      }
    }
  }

  private startStatsCollection(): void {
    // Update group stats every 30 seconds
    this.statsCollectionInterval = setInterval(() => {
      for (const group of this.groups.values()) {
        this.updateGroupStats(group);
      }
    }, 30000);

    logger.debug('Started circuit breaker stats collection');
  }

  private stopStatsCollection(): void {
    if (this.statsCollectionInterval) {
      clearInterval(this.statsCollectionInterval);
      this.statsCollectionInterval = null;
    }
  }

  // Health check and diagnostics
  async healthCheck(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Circuit breaker service not initialized');
    }

    // Check if any critical breakers are open
    const criticalBreakers = ['database', 'external-api', 'llm-service'];
    const openCriticalBreakers = criticalBreakers.filter(name => {
      const breaker = this.breakers.get(name);
      return breaker && breaker.opened;
    });

    if (openCriticalBreakers.length > 0) {
      logger.warn('Critical circuit breakers are open', {
        openBreakers: openCriticalBreakers,
      });
    }

    // Log overall statistics
    const allStats = this.getAllBreakerStats();
    const openBreakers = allStats.filter(s => s.state === 'OPEN');
    
    logger.info('Circuit breaker health check completed', {
      totalBreakers: allStats.length,
      openBreakers: openBreakers.length,
      groups: this.groups.size,
    });
  }

  getHealthStatus(): {
    healthy: boolean;
    totalBreakers: number;
    openBreakers: number;
    halfOpenBreakers: number;
    groups: number;
    criticalBreakersOpen: string[];
  } {
    const allStats = this.getAllBreakerStats();
    const openBreakers = allStats.filter(s => s.state === 'OPEN');
    const halfOpenBreakers = allStats.filter(s => s.state === 'HALF_OPEN');
    
    // Check critical breakers
    const criticalBreakers = ['database', 'external-api', 'llm-service'];
    const criticalBreakersOpen = criticalBreakers.filter(name => {
      const breaker = this.breakers.get(name);
      return breaker && breaker.opened;
    });

    return {
      healthy: criticalBreakersOpen.length === 0,
      totalBreakers: allStats.length,
      openBreakers: openBreakers.length,
      halfOpenBreakers: halfOpenBreakers.length,
      groups: this.groups.size,
      criticalBreakersOpen,
    };
  }

  // Configuration management
  updateBreakerConfig(name: string, options: Partial<CircuitBreakerOptions>): boolean {
    const breaker = this.breakers.get(name);
    if (!breaker) return false;

    // Opossum doesn't support runtime config updates directly
    // We need to recreate the breaker with new options
    logger.warn('Circuit breaker config update requires recreation', { 
      name,
      note: 'Consider removing and recreating the breaker'
    });

    return false;
  }

  exportConfiguration(): Record<string, any> {
    const config: Record<string, any> = {};

    for (const [name, breaker] of this.breakers) {
      config[name] = {
        name,
        options: breaker.options,
        stats: this.getBreakerStats(name),
      };
    }

    return config;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down circuit breaker service...');
    
    this.stopStatsCollection();

    // Close all circuit breakers
    for (const [name, breaker] of this.breakers) {
      breaker.removeAllListeners();
      breaker.shutdown();
      logger.debug('Shut down circuit breaker', { name });
    }

    this.breakers.clear();
    this.groups.clear();
    this.removeAllListeners();
    this.initialized = false;
    
    logger.info('Circuit breaker service shutdown complete');
  }
}

export const circuitBreakerService = new CircuitBreakerService();