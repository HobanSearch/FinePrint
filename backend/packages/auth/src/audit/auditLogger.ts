import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { CacheManager } from '@fineprintai/cache';
import { createServiceLogger } from '@fineprintai/logger';
import {
  AuditConfig,
  AuditEvent,
  AuditEventType,
  AuditLevel,
  AuditActor,
  AuditResource,
  AuditContext,
  AuditQuery,
  AuditStats,
  AuditAnomaly,
  AuditAlert
} from './types';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const logger = createServiceLogger('audit-logger');

export class AuditLogger {
  private cache: CacheManager;
  private config: AuditConfig;
  private alerts: Map<string, AuditAlert> = new Map();
  private encryptionKey?: Buffer;

  constructor(cache: CacheManager, config: AuditConfig) {
    this.cache = cache;
    this.config = config;
    this.initializeEncryption();
    this.initializeAlerts();
  }

  /**
   * Initialize encryption if enabled
   */
  private initializeEncryption(): void {
    if (this.config.encryption.enabled && this.config.encryption.key) {
      this.encryptionKey = Buffer.from(this.config.encryption.key, 'hex');
      logger.info('Audit encryption initialized');
    }
  }

  /**
   * Initialize security alerts
   */
  private initializeAlerts(): void {
    const alertConfigs: Omit<AuditAlert, 'id' | 'lastTriggered' | 'triggerCount'>[] = [
      {
        name: 'Multiple Failed Logins',
        description: 'Multiple failed login attempts from same IP',
        condition: (events) => {
          const recentFailures = events.filter(e => 
            e.type === AuditEventType.LOGIN_FAILURE &&
            Date.now() - e.timestamp.getTime() < 300000 // Last 5 minutes
          );
          
          const ipGroups = recentFailures.reduce((acc, event) => {
            const ip = event.actor.ipAddress || 'unknown';
            acc[ip] = (acc[ip] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          return Object.values(ipGroups).some(count => count >= 5);
        },
        severity: 'high',
        cooldownPeriod: 300, // 5 minutes
        enabled: true
      },
      {
        name: 'Privilege Escalation',
        description: 'User permissions changed to admin level',
        condition: (events) => {
          return events.some(e => 
            e.type === AuditEventType.PERMISSIONS_CHANGED &&
            e.details?.newRole === 'admin' &&
            Date.now() - e.timestamp.getTime() < 60000 // Last minute
          );
        },
        severity: 'critical',
        cooldownPeriod: 0, // No cooldown for critical events
        enabled: true
      },
      {
        name: 'Unusual Login Location',
        description: 'Login from new geographic location',
        condition: (events) => {
          // This would need geolocation data
          return false; // Placeholder
        },
        severity: 'medium',
        cooldownPeriod: 3600, // 1 hour
        enabled: true
      },
      {
        name: 'Mass Token Revocation',
        description: 'Large number of tokens revoked in short time',
        condition: (events) => {
          const recentRevocations = events.filter(e => 
            e.type === AuditEventType.TOKEN_REVOKED &&
            Date.now() - e.timestamp.getTime() < 600000 // Last 10 minutes
          );
          
          return recentRevocations.length >= 10;
        },
        severity: 'high',
        cooldownPeriod: 600, // 10 minutes
        enabled: true
      },
      {
        name: 'MFA Bypass Attempt',
        description: 'Multiple MFA failures followed by successful login',
        condition: (events) => {
          const sortedEvents = events
            .filter(e => e.actor.id && Date.now() - e.timestamp.getTime() < 900000) // Last 15 minutes
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          
          // Look for pattern: multiple MFA failures then login success
          for (let i = 0; i < sortedEvents.length - 1; i++) {
            const mfaFailures = sortedEvents.slice(i, i + 5)
              .filter(e => e.type === AuditEventType.MFA_FAILURE);
            
            if (mfaFailures.length >= 3) {
              const subsequentLogin = sortedEvents.slice(i + 5)
                .find(e => e.type === AuditEventType.LOGIN_SUCCESS);
              
              if (subsequentLogin) {
                return true;
              }
            }
          }
          
          return false;
        },
        severity: 'critical',
        cooldownPeriod: 0,
        enabled: true
      }
    ];

    alertConfigs.forEach(config => {
      const alert: AuditAlert = {
        ...config,
        id: crypto.randomUUID(),
        triggerCount: 0
      };
      this.alerts.set(alert.id, alert);
    });

    logger.info('Audit alerts initialized', { count: this.alerts.size });
  }

  /**
   * Log audit event
   */
  async logEvent(
    type: AuditEventType,
    level: AuditLevel,
    actor: AuditActor,
    action: string,
    outcome: 'success' | 'failure' | 'pending',
    details: Record<string, any> = {},
    resource?: AuditResource,
    context?: Partial<AuditContext>
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Check if this level should be logged
      if (!this.config.levels.includes(level)) {
        return;
      }

      const event: AuditEvent = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        type,
        level,
        actor: this.sanitizeActor(actor),
        resource,
        action,
        outcome,
        details: this.sanitizeDetails(details),
        context: {
          service: 'fine-print-auth',
          version: '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          ...context
        },
        metadata: {
          encrypted: this.config.encryption.enabled,
          compressed: false, // Will be set during processing
          retention: new Date(Date.now() + (this.config.retention.days * 24 * 60 * 60 * 1000)),
          tags: this.generateTags(type, level, outcome)
        }
      };

      // Add hash for integrity
      event.metadata.hash = this.calculateHash(event);

      // Encrypt and/or compress if configured
      await this.processEvent(event);

      // Store the event
      await this.storeEvent(event);

      // Check for alerts
      await this.checkAlerts(event);

      // Forward to external systems if configured
      if (this.config.forwarding.enabled) {
        await this.forwardEvent(event);
      }

      logger.debug('Audit event logged', {
        id: event.id.substring(0, 8) + '...',
        type: event.type,
        level: event.level,
        outcome: event.outcome
      });
    } catch (error) {
      logger.error('Failed to log audit event', { error, type, level });
    }
  }

  /**
   * Query audit events
   */
  async queryEvents(query: AuditQuery): Promise<AuditEvent[]> {
    try {
      const events: AuditEvent[] = [];
      const keys = await this.getEventKeys(query);
      
      for (const key of keys.slice(query.offset || 0, (query.offset || 0) + (query.limit || 100))) {
        const event = await this.retrieveEvent(key);
        if (event && this.matchesQuery(event, query)) {
          events.push(event);
        }
      }

      // Sort results
      if (query.sortBy) {
        events.sort((a, b) => {
          let aVal: any, bVal: any;
          
          switch (query.sortBy) {
            case 'timestamp':
              aVal = a.timestamp.getTime();
              bVal = b.timestamp.getTime();
              break;
            case 'type':
              aVal = a.type;
              bVal = b.type;
              break;
            case 'level':
              aVal = a.level;
              bVal = b.level;
              break;
            default:
              return 0;
          }

          const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return query.sortOrder === 'desc' ? -comparison : comparison;
        });
      }

      return events;
    } catch (error) {
      logger.error('Failed to query audit events', { error, query });
      return [];
    }
  }

  /**
   * Get audit statistics
   */
  async getStats(): Promise<AuditStats> {
    try {
      const eventKeys = await this.cache.keys('audit:event:*');
      const events: AuditEvent[] = [];
      
      // Sample recent events for stats (last 1000)
      const recentKeys = eventKeys.slice(-1000);
      
      for (const key of recentKeys) {
        const event = await this.retrieveEvent(key);
        if (event) {
          events.push(event);
        }
      }

      const totalEvents = eventKeys.length;
      
      // Group by various dimensions
      const eventsByType = events.reduce((acc, event) => {
        acc[event.type] = (acc[event.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const eventsByLevel = events.reduce((acc, event) => {
        acc[event.level] = (acc[event.level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const eventsByOutcome = events.reduce((acc, event) => {
        acc[event.outcome] = (acc[event.outcome] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const eventsByActor = events.reduce((acc, event) => {
        const actorKey = event.actor.id || event.actor.ipAddress || 'anonymous';
        acc[actorKey] = (acc[actorKey] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Get recent events (last 20)
      const recentEvents = events
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 20);

      // Get risky events (failures and critical level)
      const topRiskyEvents = events
        .filter(e => e.outcome === 'failure' || e.level === AuditLevel.CRITICAL)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 10);

      // Detect anomalies
      const anomalies = await this.detectAnomalies(events);

      return {
        totalEvents,
        eventsByType,
        eventsByLevel,
        eventsByOutcome,
        eventsByActor,
        recentEvents,
        topRiskyEvents,
        anomalies
      };
    } catch (error) {
      logger.error('Failed to get audit stats', { error });
      return {
        totalEvents: 0,
        eventsByType: {},
        eventsByLevel: {},
        eventsByOutcome: {},
        eventsByActor: {},
        recentEvents: [],
        topRiskyEvents: [],
        anomalies: []
      };
    }
  }

  /**
   * Clean up old audit events
   */
  async cleanup(): Promise<number> {
    try {
      const now = new Date();
      const eventKeys = await this.cache.keys('audit:event:*');
      let deletedCount = 0;

      for (const key of eventKeys) {
        const event = await this.retrieveEvent(key);
        
        if (event && event.metadata.retention < now) {
          await this.cache.del(key);
          deletedCount++;
        }
      }

      // Also clean up by max entries limit
      if (eventKeys.length > this.config.retention.maxEntries) {
        const excess = eventKeys.length - this.config.retention.maxEntries;
        const oldestKeys = eventKeys.slice(0, excess);
        
        for (const key of oldestKeys) {
          await this.cache.del(key);
          deletedCount++;
        }
      }

      logger.info('Audit cleanup completed', { deletedCount });
      return deletedCount;
    } catch (error) {
      logger.error('Audit cleanup failed', { error });
      return 0;
    }
  }

  /**
   * Sanitize actor information
   */
  private sanitizeActor(actor: AuditActor): AuditActor {
    const sanitized = { ...actor };
    
    // Remove sensitive fields if configured
    this.config.sensitiveFields.forEach(field => {
      if (sanitized[field as keyof AuditActor]) {
        delete sanitized[field as keyof AuditActor];
      }
    });

    return sanitized;
  }

  /**
   * Sanitize event details
   */
  private sanitizeDetails(details: Record<string, any>): Record<string, any> {
    const sanitized = { ...details };
    
    // Remove sensitive fields
    this.config.sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    // Remove passwords, tokens, secrets
    const sensitivePatterns = [
      /password/i,
      /token/i,
      /secret/i,
      /key/i,
      /credential/i
    ];

    Object.keys(sanitized).forEach(key => {
      if (sensitivePatterns.some(pattern => pattern.test(key))) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Generate tags for event categorization
   */
  private generateTags(type: AuditEventType, level: AuditLevel, outcome: string): string[] {
    const tags: string[] = [];
    
    // Add category tags based on event type
    if (type.startsWith('auth.')) {
      tags.push('authentication');
    }
    if (type.startsWith('security.')) {
      tags.push('security');
    }
    if (type.startsWith('admin.')) {
      tags.push('administration');
    }
    if (type.startsWith('system.')) {
      tags.push('system');
    }

    // Add level tag
    tags.push(`level:${level}`);

    // Add outcome tag
    tags.push(`outcome:${outcome}`);

    // Add risk tags
    if (level === AuditLevel.CRITICAL || level === AuditLevel.ERROR) {
      tags.push('high-risk');
    }
    if (outcome === 'failure') {
      tags.push('failure');
    }

    return tags;
  }

  /**
   * Calculate hash for event integrity
   */
  private calculateHash(event: AuditEvent): string {
    const data = JSON.stringify({
      id: event.id,
      timestamp: event.timestamp,
      type: event.type,
      actor: event.actor,
      action: event.action,
      outcome: event.outcome,
      details: event.details
    });
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Process event (encrypt/compress)
   */
  private async processEvent(event: AuditEvent): Promise<void> {
    let data = JSON.stringify(event);

    // Compress if event is large
    if (data.length > 1024) { // 1KB threshold
      const compressed = await gzip(Buffer.from(data));
      event.details = { _compressed: compressed.toString('base64') };
      event.metadata.compressed = true;
    }

    // Encrypt if enabled
    if (this.config.encryption.enabled && this.encryptionKey) {
      const encrypted = this.encrypt(JSON.stringify(event.details));
      event.details = { _encrypted: encrypted };
      event.metadata.encrypted = true;
    }
  }

  /**
   * Store audit event
   */
  private async storeEvent(event: AuditEvent): Promise<void> {
    const key = `audit:event:${event.timestamp.getTime()}:${event.id}`;
    
    // Calculate TTL based on retention period
    const ttl = Math.floor((event.metadata.retention.getTime() - Date.now()) / 1000);
    
    await this.cache.set(key, event, ttl);

    // Add to indexes for querying
    await this.addToIndexes(event);
  }

  /**
   * Add event to indexes for efficient querying
   */
  private async addToIndexes(event: AuditEvent): Promise<void> {
    const timestamp = event.timestamp.getTime();
    
    // Type index
    await this.cache.sadd(`audit:index:type:${event.type}`, `${timestamp}:${event.id}`);
    
    // Level index
    await this.cache.sadd(`audit:index:level:${event.level}`, `${timestamp}:${event.id}`);
    
    // Actor index
    if (event.actor.id) {
      await this.cache.sadd(`audit:index:actor:${event.actor.id}`, `${timestamp}:${event.id}`);
    }
    
    // Resource index
    if (event.resource?.id) {
      await this.cache.sadd(`audit:index:resource:${event.resource.id}`, `${timestamp}:${event.id}`);
    }

    // Set TTL on indexes
    const indexTtl = this.config.retention.days * 24 * 60 * 60;
    await Promise.all([
      this.cache.expire(`audit:index:type:${event.type}`, indexTtl),
      this.cache.expire(`audit:index:level:${event.level}`, indexTtl),
      event.actor.id && this.cache.expire(`audit:index:actor:${event.actor.id}`, indexTtl),
      event.resource?.id && this.cache.expire(`audit:index:resource:${event.resource.id}`, indexTtl)
    ].filter(Boolean));
  }

  /**
   * Retrieve and process stored event
   */
  private async retrieveEvent(key: string): Promise<AuditEvent | null> {
    try {
      const event = await this.cache.get<AuditEvent>(key);
      if (!event) return null;

      // Decrypt if needed
      if (event.metadata.encrypted && event.details._encrypted) {
        const decrypted = this.decrypt(event.details._encrypted);
        event.details = JSON.parse(decrypted);
      }

      // Decompress if needed
      if (event.metadata.compressed && event.details._compressed) {
        const decompressed = await gunzip(Buffer.from(event.details._compressed, 'base64'));
        const originalEvent = JSON.parse(decompressed.toString());
        event.details = originalEvent.details;
      }

      return event;
    } catch (error) {
      logger.error('Failed to retrieve audit event', { error, key });
      return null;
    }
  }

  /**
   * Encrypt data
   */
  private encrypt(data: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    cipher.setAutoPadding(true);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt data
   */
  private decrypt(encryptedData: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    decipher.setAutoPadding(true);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Get event keys for query
   */
  private async getEventKeys(query: AuditQuery): Promise<string[]> {
    // Start with all event keys
    let keys = await this.cache.keys('audit:event:*');
    
    // Filter by time range if specified
    if (query.startDate || query.endDate) {
      keys = keys.filter(key => {
        const timestampStr = key.split(':')[2];
        const timestamp = parseInt(timestampStr);
        
        if (query.startDate && timestamp < query.startDate.getTime()) {
          return false;
        }
        if (query.endDate && timestamp > query.endDate.getTime()) {
          return false;
        }
        
        return true;
      });
    }

    return keys;
  }

  /**
   * Check if event matches query criteria
   */
  private matchesQuery(event: AuditEvent, query: AuditQuery): boolean {
    if (query.types && !query.types.includes(event.type)) {
      return false;
    }
    
    if (query.levels && !query.levels.includes(event.level)) {
      return false;
    }
    
    if (query.outcomes && !query.outcomes.includes(event.outcome)) {
      return false;
    }
    
    if (query.actorIds && event.actor.id && !query.actorIds.includes(event.actor.id)) {
      return false;
    }
    
    if (query.actorTypes && !query.actorTypes.includes(event.actor.type)) {
      return false;
    }
    
    if (query.resourceIds && event.resource?.id && !query.resourceIds.includes(event.resource.id)) {
      return false;
    }
    
    if (query.resourceTypes && event.resource?.type && !query.resourceTypes.includes(event.resource.type)) {
      return false;
    }
    
    if (query.ipAddresses && event.actor.ipAddress && !query.ipAddresses.includes(event.actor.ipAddress)) {
      return false;
    }

    return true;
  }

  /**
   * Check for alert conditions
   */
  private async checkAlerts(event: AuditEvent): Promise<void> {
    try {
      // Get recent events for pattern analysis
      const recentEvents = await this.queryEvents({
        startDate: new Date(Date.now() - 3600000), // Last hour
        limit: 1000
      });

      for (const alert of this.alerts.values()) {
        if (!alert.enabled) continue;

        // Check cooldown period
        if (alert.lastTriggered && 
            Date.now() - alert.lastTriggered.getTime() < alert.cooldownPeriod * 1000) {
          continue;
        }

        // Check condition
        if (alert.condition([...recentEvents, event])) {
          await this.triggerAlert(alert, event);
        }
      }
    } catch (error) {
      logger.error('Failed to check alerts', { error });
    }
  }

  /**
   * Trigger security alert
   */
  private async triggerAlert(alert: AuditAlert, triggeringEvent: AuditEvent): Promise<void> {
    try {
      alert.lastTriggered = new Date();
      alert.triggerCount++;

      const alertEvent: AuditEvent = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        type: AuditEventType.SUSPICIOUS_ACTIVITY,
        level: AuditLevel.CRITICAL,
        actor: {
          type: 'system',
          id: 'audit-system'
        },
        action: 'alert_triggered',
        outcome: 'success',
        details: {
          alertId: alert.id,
          alertName: alert.name,
          alertDescription: alert.description,
          severity: alert.severity,
          triggeringEventId: triggeringEvent.id,
          triggerCount: alert.triggerCount
        },
        context: {
          service: 'fine-print-audit',
          version: '1.0.0',
          environment: process.env.NODE_ENV || 'development'
        },
        metadata: {
          encrypted: false,
          compressed: false,
          retention: new Date(Date.now() + (this.config.retention.days * 24 * 60 * 60 * 1000)),
          tags: ['security', 'alert', `severity:${alert.severity}`]
        }
      };

      alertEvent.metadata.hash = this.calculateHash(alertEvent);
      await this.storeEvent(alertEvent);

      logger.error('Security alert triggered', {
        alertName: alert.name,
        severity: alert.severity,
        triggeringEvent: triggeringEvent.id
      });
    } catch (error) {
      logger.error('Failed to trigger alert', { error, alertId: alert.id });
    }
  }

  /**
   * Detect anomalies in audit events
   */
  private async detectAnomalies(events: AuditEvent[]): Promise<AuditAnomaly[]> {
    const anomalies: AuditAnomaly[] = [];

    try {
      // Detect unusual volume
      const hourlyVolume = this.calculateHourlyVolume(events);
      const avgVolume = hourlyVolume.reduce((sum, vol) => sum + vol, 0) / hourlyVolume.length;
      const stdDev = Math.sqrt(
        hourlyVolume.reduce((sum, vol) => sum + Math.pow(vol - avgVolume, 2), 0) / hourlyVolume.length
      );

      const currentVolume = hourlyVolume[hourlyVolume.length - 1];
      if (currentVolume > avgVolume + (2 * stdDev)) {
        anomalies.push({
          id: crypto.randomUUID(),
          type: 'unusual_volume',
          description: `Event volume (${currentVolume}) significantly higher than average (${avgVolume.toFixed(2)})`,
          severity: currentVolume > avgVolume + (3 * stdDev) ? 'critical' : 'medium',
          firstSeen: new Date(Date.now() - 3600000),
          lastSeen: new Date(),
          count: currentVolume,
          relatedEvents: events.slice(-currentVolume).map(e => e.id),
          context: { avgVolume, currentVolume, threshold: avgVolume + (2 * stdDev) }
        });
      }

      // Detect new locations (would need geolocation data)
      const uniqueIPs = new Set(events.map(e => e.actor.ipAddress).filter(Boolean));
      if (uniqueIPs.size > 50) { // Arbitrary threshold
        anomalies.push({
          id: crypto.randomUUID(),
          type: 'new_location',
          description: `Unusually high number of unique IP addresses (${uniqueIPs.size})`,
          severity: 'medium',
          firstSeen: new Date(Date.now() - 3600000),
          lastSeen: new Date(),
          count: uniqueIPs.size,
          relatedEvents: [],
          context: { uniqueIPs: uniqueIPs.size }
        });
      }

      // Detect failed attempt patterns
      const failedEvents = events.filter(e => e.outcome === 'failure');
      const failureRate = failedEvents.length / events.length;
      
      if (failureRate > 0.3) { // 30% failure rate threshold
        anomalies.push({
          id: crypto.randomUUID(),
          type: 'failed_attempts',
          description: `High failure rate detected (${(failureRate * 100).toFixed(1)}%)`,
          severity: failureRate > 0.5 ? 'high' : 'medium',
          firstSeen: new Date(Math.min(...failedEvents.map(e => e.timestamp.getTime()))),
          lastSeen: new Date(Math.max(...failedEvents.map(e => e.timestamp.getTime()))),
          count: failedEvents.length,
          relatedEvents: failedEvents.map(e => e.id),
          context: { failureRate, totalEvents: events.length, failedEvents: failedEvents.length }
        });
      }

    } catch (error) {
      logger.error('Failed to detect anomalies', { error });
    }

    return anomalies;
  }

  /**
   * Calculate hourly event volume
   */
  private calculateHourlyVolume(events: AuditEvent[]): number[] {
    const hours: Record<string, number> = {};
    
    events.forEach(event => {
      const hour = new Date(event.timestamp).toISOString().substring(0, 13); // YYYY-MM-DDTHH
      hours[hour] = (hours[hour] || 0) + 1;
    });

    return Object.values(hours);
  }

  /**
   * Forward event to external systems
   */
  private async forwardEvent(event: AuditEvent): Promise<void> {
    // Implementation would depend on external systems
    // This is a placeholder for webhook/API forwarding
    logger.debug('Event forwarding would happen here', { eventId: event.id });
  }
}