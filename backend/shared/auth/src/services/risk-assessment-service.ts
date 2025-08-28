/**
 * Fine Print AI - Risk Assessment Service
 * Enterprise-grade behavioral analysis and threat detection for authentication security
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import * as geoip from 'geoip-lite';
import { LoggerService } from '../../logger/src/services/logger-service';
import { ConfigService } from '../../config/src/services/configuration';

export interface RiskAssessmentConfig {
  // Risk Scoring
  scoring: {
    baseScore: number; // base risk score (0-100)
    maxScore: number; // maximum risk score
    decayFactor: number; // risk decay over time
    aggregationWindow: number; // time window for aggregating risks (seconds)
    riskThresholds: {
      low: number;
      medium: number;
      high: number;
      critical: number;
    };
  };

  // Behavioral Analysis
  behavioral: {
    enabled: boolean;
    learningPeriod: number; // days to establish baseline
    deviationThreshold: number; // standard deviations for anomaly
    trackingMetrics: string[]; // metrics to track
    adaptiveLearning: boolean; // continuously update baseline
    profileRetentionDays: number; // how long to keep profiles
  };

  // Geolocation Analysis
  geolocation: {
    enabled: boolean;
    allowedCountries: string[]; // allowed country codes
    blockedCountries: string[]; // blocked country codes
    vpnDetection: boolean; // detect VPN/proxy usage
    impossibleTravelDetection: boolean; // detect impossible travel
    maxTravelSpeed: number; // km/h for impossible travel
    locationCacheHours: number; // cache location data
  };

  // Device Analysis
  device: {
    enabled: boolean;
    fingerprintingEnabled: boolean;
    newDevicePenalty: number; // risk increase for new devices
    deviceTrustDecay: number; // days until device trust decays
    jailbreakDetection: boolean; // detect jailbroken/rooted devices
    emulatorDetection: boolean; // detect emulators
    browserSecurityCheck: boolean; // check browser security
  };

  // Network Analysis
  network: {
    enabled: boolean;
    torDetection: boolean; // detect Tor usage
    proxyDetection: boolean; // detect proxy usage
    botnetDetection: boolean; // detect botnet IPs
    malwareDetection: boolean; // detect malware C&C IPs
    reputationCheck: boolean; // check IP reputation
    dnsAnalysis: boolean; // analyze DNS patterns
  };

  // Temporal Analysis
  temporal: {
    enabled: boolean;
    workingHoursOnly: boolean; // restrict to business hours
    workingHours: {
      start: number; // hour (0-23)
      end: number; // hour (0-23)
      timezone: string; // timezone
      weekendsAllowed: boolean;
    };
    velocityChecks: boolean; // check login velocity
    maxLoginRate: number; // max logins per minute
    suspiciousPatterns: boolean; // detect suspicious timing patterns
  };

  // Threat Intelligence
  threatIntel: {
    enabled: boolean;
    feeds: string[]; // threat intelligence feed URLs
    updateInterval: number; // hours between updates
    confidenceThreshold: number; // minimum confidence level
    cacheDuration: number; // hours to cache threat data
    falsePositiveReduction: boolean; // reduce false positives
  };

  // Machine Learning
  ml: {
    enabled: boolean;
    modelPath?: string; // path to ML model
    featureEngineering: boolean; // automatic feature engineering
    ensembleMethods: boolean; // use ensemble methods
    onlineLearning: boolean; // continuous learning
    batchSize: number; // batch size for training
    retrainInterval: number; // days between retraining
  };
}

export interface RiskAssessmentRequest {
  userId: string;
  email?: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string;
  isNewDevice: boolean;
  lastLoginAt?: Date;
  failedAttempts: number;
  location?: GeoLocation;
  sessionContext?: SessionContext;
  additionalContext?: Record<string, any>;
}

export interface DeviceInfo {
  deviceId: string;
  fingerprint: string;
  platform: string;
  os: string;
  browser: string;
  version: string;
  trusted: boolean;
  jailbroken?: boolean;
  emulator?: boolean;
  securityFeatures?: string[];
}

export interface GeoLocation {
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  accuracy?: number;
  vpn?: boolean;
  proxy?: boolean;
  tor?: boolean;
}

export interface SessionContext {
  previousSessions: number;
  averageSessionDuration: number;
  typicalLocations: string[];
  typicalDevices: string[];
  typicalTimeRanges: Array<{ start: number; end: number }>;
  recentFailures: number;
  recentSuccesses: number;
}

export interface RiskAssessmentResult {
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  blocked: boolean;
  factors: RiskFactor[];
  recommendations: string[];
  requiresAdditionalAuth: boolean;
  allowedMethods: string[];
  restrictions: Restriction[];
  confidence: number;
  modelVersion?: string;
  processingTime: number;
}

export interface RiskFactor {
  category: 'geolocation' | 'device' | 'behavioral' | 'network' | 'temporal' | 'threat_intel';
  type: string;
  description: string;
  score: number;
  weight: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  evidence?: Record<string, any>;
  mitigations?: string[];
}

export interface Restriction {
  type: 'mfa_required' | 'admin_approval' | 'time_limit' | 'location_restriction' | 'device_restriction';
  description: string;
  duration?: number; // seconds
  conditions?: Record<string, any>;
}

export interface UserBehaviorProfile {
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Login Patterns
  typicalLoginTimes: Array<{ hour: number; dayOfWeek: number; frequency: number }>;
  averageSessionDuration: number;
  loginFrequency: number; // logins per day
  
  // Location Patterns
  typicalLocations: Array<{
    country: string;
    region: string;
    city: string;
    frequency: number;
    lastSeen: Date;
  }>;
  homeLocation?: GeoLocation;
  
  // Device Patterns
  typicalDevices: Array<{
    deviceId: string;
    platform: string;
    os: string;
    browser: string;
    frequency: number;
    trustLevel: number;
    lastSeen: Date;
  }>;
  
  // Network Patterns
  typicalNetworks: Array<{
    ipRange: string;
    isp: string;
    frequency: number;
    lastSeen: Date;
  }>;
  
  // Behavioral Metrics
  metrics: {
    averageTypingSpeed?: number;
    mouseMovementPatterns?: any;
    navigationPatterns?: any;
    preferredFeatures?: string[];
    activityLevel: 'low' | 'medium' | 'high';
  };
  
  // Risk History
  riskHistory: Array<{
    date: Date;
    score: number;
    factors: string[];
  }>;
  
  // Adaptive Learning
  learningPhase: 'initial' | 'learning' | 'stable' | 'adapting';
  baselineEstablished: boolean;
  lastModelUpdate: Date;
}

export interface ThreatIntelligence {
  ipAddress: string;
  category: 'malware' | 'botnet' | 'phishing' | 'spam' | 'tor' | 'proxy' | 'scanner';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  source: string;
  description: string;
  firstSeen: Date;
  lastSeen: Date;
  indicators?: Record<string, any>;
}

export class RiskAssessmentService extends EventEmitter {
  private redis: Redis;
  private prisma: PrismaClient;
  private config: RiskAssessmentConfig;
  private logger: LoggerService;
  private configService: ConfigService;
  
  // Risk calculation cache
  private riskCache: Map<string, { result: RiskAssessmentResult; expiry: number }> = new Map();
  
  // User behavior profiles cache
  private profileCache: Map<string, { profile: UserBehaviorProfile; expiry: number }> = new Map();
  
  // Threat intelligence cache
  private threatIntelCache: Map<string, { intel: ThreatIntelligence; expiry: number }> = new Map();
  
  // Geolocation cache
  private geoCache: Map<string, { location: GeoLocation; expiry: number }> = new Map();

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    config: RiskAssessmentConfig,
    logger: LoggerService,
    configService: ConfigService
  ) {
    super();
    this.redis = redis;
    this.prisma = prisma;
    this.config = config;
    this.logger = logger;
    this.configService = configService;

    this.initializeRiskAssessment();
  }

  /**
   * Assess login risk for a user authentication attempt
   */
  async assessLoginRisk(request: RiskAssessmentRequest): Promise<RiskAssessmentResult> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(request);
      const cached = this.riskCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        return cached.result;
      }

      const riskFactors: RiskFactor[] = [];
      let totalScore = this.config.scoring.baseScore;

      // Geolocation Analysis
      if (this.config.geolocation.enabled) {
        const geoFactors = await this.analyzeGeolocation(request);
        riskFactors.push(...geoFactors);
        totalScore += geoFactors.reduce((sum, f) => sum + (f.score * f.weight), 0);
      }

      // Device Analysis
      if (this.config.device.enabled) {
        const deviceFactors = await this.analyzeDevice(request);
        riskFactors.push(...deviceFactors);
        totalScore += deviceFactors.reduce((sum, f) => sum + (f.score * f.weight), 0);
      }

      // Behavioral Analysis
      if (this.config.behavioral.enabled) {
        const behaviorFactors = await this.analyzeBehavior(request);
        riskFactors.push(...behaviorFactors);
        totalScore += behaviorFactors.reduce((sum, f) => sum + (f.score * f.weight), 0);
      }

      // Network Analysis
      if (this.config.network.enabled) {
        const networkFactors = await this.analyzeNetwork(request);
        riskFactors.push(...networkFactors);
        totalScore += networkFactors.reduce((sum, f) => sum + (f.score * f.weight), 0);
      }

      // Temporal Analysis
      if (this.config.temporal.enabled) {
        const temporalFactors = await this.analyzeTemporal(request);
        riskFactors.push(...temporalFactors);
        totalScore += temporalFactors.reduce((sum, f) => sum + (f.score * f.weight), 0);
      }

      // Threat Intelligence
      if (this.config.threatIntel.enabled) {
        const threatFactors = await this.analyzeThreatIntelligence(request);
        riskFactors.push(...threatFactors);
        totalScore += threatFactors.reduce((sum, f) => sum + (f.score * f.weight), 0);
      }

      // Machine Learning Analysis
      if (this.config.ml.enabled) {
        const mlScore = await this.getMachineLearningScore(request, riskFactors);
        totalScore = (totalScore + mlScore) / 2; // Blend traditional and ML scores
      }

      // Normalize score
      totalScore = Math.min(Math.max(totalScore, 0), this.config.scoring.maxScore);

      // Determine risk level
      const level = this.getRiskLevel(totalScore);
      
      // Determine if blocked
      const blocked = this.shouldBlockAccess(totalScore, riskFactors);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(riskFactors, level);
      
      // Determine additional auth requirements
      const requiresAdditionalAuth = this.requiresAdditionalAuth(totalScore, riskFactors);
      const allowedMethods = this.getAllowedAuthMethods(totalScore, riskFactors);
      
      // Generate restrictions
      const restrictions = this.generateRestrictions(riskFactors, level);
      
      // Calculate confidence
      const confidence = this.calculateConfidence(riskFactors);

      const result: RiskAssessmentResult = {
        score: totalScore,
        level,
        blocked,
        factors: riskFactors,
        recommendations,
        requiresAdditionalAuth,
        allowedMethods,
        restrictions,
        confidence,
        processingTime: Date.now() - startTime
      };

      // Cache result
      this.riskCache.set(cacheKey, {
        result,
        expiry: Date.now() + (this.config.scoring.aggregationWindow * 1000)
      });

      // Update user behavior profile
      if (this.config.behavioral.enabled) {
        await this.updateUserBehaviorProfile(request, result);
      }

      // Log risk assessment
      this.logger.info('Risk assessment completed', {
        userId: request.userId,
        riskScore: totalScore,
        riskLevel: level,
        blocked,
        factorCount: riskFactors.length,
        processingTime: result.processingTime
      });

      // Emit risk assessment event
      this.emit('riskAssessed', {
        userId: request.userId,
        result
      });

      return result;

    } catch (error) {
      this.logger.error('Risk assessment failed', {
        error: error.message,
        userId: request.userId
      });

      // Return high-risk result on error
      return {
        score: 90,
        level: 'high',
        blocked: true,
        factors: [{
          category: 'network',
          type: 'system_error',
          description: 'Risk assessment system error',
          score: 90,
          weight: 1,
          severity: 'high',
          confidence: 100
        }],
        recommendations: ['Manual review required due to system error'],
        requiresAdditionalAuth: true,
        allowedMethods: ['manual_approval'],
        restrictions: [],
        confidence: 0,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Analyze geolocation-based risk factors
   */
  private async analyzeGeolocation(request: RiskAssessmentRequest): Promise<RiskFactor[]> {
    const factors: RiskFactor[] = [];
    
    try {
      // Get enhanced geolocation data
      const location = await this.getEnhancedLocation(request.ipAddress);
      
      // Check blocked countries
      if (this.config.geolocation.blockedCountries.includes(location.country)) {
        factors.push({
          category: 'geolocation',
          type: 'blocked_country',
          description: `Login from blocked country: ${location.country}`,
          score: 80,
          weight: 1.0,
          severity: 'high',
          confidence: 95,
          evidence: { country: location.country },
          mitigations: ['Block access', 'Require admin approval']
        });
      }

      // Check allowed countries (if whitelist is configured)
      if (this.config.geolocation.allowedCountries.length > 0 && 
          !this.config.geolocation.allowedCountries.includes(location.country)) {
        factors.push({
          category: 'geolocation',
          type: 'non_whitelisted_country',
          description: `Login from non-whitelisted country: ${location.country}`,
          score: 60,
          weight: 0.8,
          severity: 'medium',
          confidence: 90,
          evidence: { country: location.country }
        });
      }

      // VPN/Proxy Detection
      if (this.config.geolocation.vpnDetection && (location.vpn || location.proxy)) {
        factors.push({
          category: 'geolocation',
          type: 'vpn_proxy_detected',
          description: `VPN/Proxy usage detected from ${location.country}`,
          score: 40,
          weight: 0.7,
          severity: 'medium',
          confidence: 85,
          evidence: { vpn: location.vpn, proxy: location.proxy },
          mitigations: ['Require additional verification']
        });
      }

      // Tor Detection
      if (location.tor) {
        factors.push({
          category: 'geolocation',
          type: 'tor_detected',
          description: 'Tor network usage detected',
          score: 70,
          weight: 0.9,
          severity: 'high',
          confidence: 95,
          evidence: { tor: true },
          mitigations: ['Block access', 'Require manual review']
        });
      }

      // Impossible Travel Detection
      if (this.config.geolocation.impossibleTravelDetection && request.lastLoginAt) {
        const profile = await this.getUserBehaviorProfile(request.userId);
        if (profile?.homeLocation) {
          const distance = this.calculateDistance(profile.homeLocation, location);
          const timeDiff = (Date.now() - request.lastLoginAt.getTime()) / (1000 * 60 * 60); // hours
          const speed = distance / timeDiff; // km/h

          if (speed > this.config.geolocation.maxTravelSpeed) {
            factors.push({
              category: 'geolocation',
              type: 'impossible_travel',
              description: `Impossible travel detected: ${speed.toFixed(1)} km/h`,
              score: 85,
              weight: 1.0,
              severity: 'critical',
              confidence: 90,
              evidence: { 
                distance, 
                timeDiff, 
                speed,
                from: profile.homeLocation,
                to: location
              },
              mitigations: ['Block access', 'Require manual verification']
            });
          }
        }
      }

      return factors;

    } catch (error) {
      this.logger.error('Geolocation analysis failed', { error: error.message });
      return [];
    }
  }

  /**
   * Analyze device-based risk factors
   */
  private async analyzeDevice(request: RiskAssessmentRequest): Promise<RiskFactor[]> {
    const factors: RiskFactor[] = [];
    
    try {
      // New device penalty
      if (request.isNewDevice) {
        factors.push({
          category: 'device',
          type: 'new_device',
          description: 'Login from new/unknown device',
          score: this.config.device.newDevicePenalty,
          weight: 0.8,
          severity: 'medium',
          confidence: 100,
          evidence: { deviceId: request.deviceInfo.deviceId },
          mitigations: ['Require MFA', 'Send notification to trusted devices']
        });
      }

      // Jailbreak/Root Detection
      if (this.config.device.jailbreakDetection && request.deviceInfo.jailbroken) {
        factors.push({
          category: 'device',
          type: 'jailbroken_device',
          description: 'Device appears to be jailbroken/rooted',
          score: 60,
          weight: 0.9,
          severity: 'high',
          confidence: 80,
          evidence: { jailbroken: true },
          mitigations: ['Block access', 'Require additional verification']
        });
      }

      // Emulator Detection
      if (this.config.device.emulatorDetection && request.deviceInfo.emulator) {
        factors.push({
          category: 'device',
          type: 'emulator_detected',
          description: 'Device appears to be an emulator',
          score: 70,
          weight: 0.9,
          severity: 'high',
          confidence: 85,
          evidence: { emulator: true },
          mitigations: ['Block access', 'Manual review required']
        });
      }

      // Browser Security Check
      if (this.config.device.browserSecurityCheck) {
        const browserRisk = await this.assessBrowserSecurity(request.userAgent);
        if (browserRisk.score > 0) {
          factors.push({
            category: 'device',
            type: 'browser_security',
            description: browserRisk.description,
            score: browserRisk.score,
            weight: 0.6,
            severity: browserRisk.severity,
            confidence: 75,
            evidence: browserRisk.evidence
          });
        }
      }

      return factors;

    } catch (error) {
      this.logger.error('Device analysis failed', { error: error.message });
      return [];
    }
  }

  /**
   * Analyze behavioral patterns
   */
  private async analyzeBehavior(request: RiskAssessmentRequest): Promise<RiskFactor[]> {
    const factors: RiskFactor[] = [];
    
    try {
      const profile = await this.getUserBehaviorProfile(request.userId);
      if (!profile || !profile.baselineEstablished) {
        // Not enough data for behavioral analysis
        return factors;
      }

      // Analyze login time patterns
      const currentHour = new Date().getHours();
      const currentDay = new Date().getDay();
      const isTypicalTime = profile.typicalLoginTimes.some(pattern => 
        Math.abs(pattern.hour - currentHour) <= 1 && pattern.dayOfWeek === currentDay
      );

      if (!isTypicalTime) {
        factors.push({
          category: 'behavioral',
          type: 'unusual_login_time',
          description: `Login at unusual time: ${currentHour}:00 on day ${currentDay}`,
          score: 30,
          weight: 0.5,
          severity: 'low',
          confidence: 70,
          evidence: { hour: currentHour, dayOfWeek: currentDay }
        });
      }

      // Analyze location patterns
      if (request.location) {
        const isTypicalLocation = profile.typicalLocations.some(loc => 
          loc.country === request.location!.country && loc.region === request.location!.region
        );

        if (!isTypicalLocation) {
          factors.push({
            category: 'behavioral',
            type: 'unusual_location',
            description: `Login from unusual location: ${request.location.city}, ${request.location.country}`,
            score: 40,
            weight: 0.7,
            severity: 'medium',
            confidence: 80,
            evidence: { location: request.location }
          });
        }
      }

      // Analyze device patterns
      const isTypicalDevice = profile.typicalDevices.some(device => 
        device.deviceId === request.deviceInfo.deviceId
      );

      if (!isTypicalDevice) {
        factors.push({
          category: 'behavioral',
          type: 'unusual_device',
          description: 'Login from device not in typical usage pattern',
          score: 35,
          weight: 0.6,
          severity: 'medium',
          confidence: 75,
          evidence: { deviceId: request.deviceInfo.deviceId }
        });
      }

      // Analyze recent failure patterns
      if (request.failedAttempts > 3) {
        factors.push({
          category: 'behavioral',
          type: 'recent_failures',
          description: `Multiple recent failed attempts: ${request.failedAttempts}`,
          score: Math.min(request.failedAttempts * 10, 80),
          weight: 0.9,
          severity: request.failedAttempts > 5 ? 'high' : 'medium',
          confidence: 95,
          evidence: { failedAttempts: request.failedAttempts }
        });
      }

      return factors;

    } catch (error) {
      this.logger.error('Behavioral analysis failed', { error: error.message });
      return [];
    }
  }

  // Helper methods (implementation would be more detailed in production)

  private generateCacheKey(request: RiskAssessmentRequest): string {
    return `risk:${request.userId}:${request.ipAddress}:${request.deviceInfo.deviceId}`;
  }

  private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= this.config.scoring.riskThresholds.critical) return 'critical';
    if (score >= this.config.scoring.riskThresholds.high) return 'high';
    if (score >= this.config.scoring.riskThresholds.medium) return 'medium';
    return 'low';
  }

  private shouldBlockAccess(score: number, factors: RiskFactor[]): boolean {
    return score >= this.config.scoring.riskThresholds.high ||
           factors.some(f => f.severity === 'critical');
  }

  private requiresAdditionalAuth(score: number, factors: RiskFactor[]): boolean {
    return score >= this.config.scoring.riskThresholds.medium;
  }

  private async getEnhancedLocation(ipAddress: string): Promise<GeoLocation> {
    // Implementation would get enhanced location data with VPN/proxy detection
    const geoData = geoip.lookup(ipAddress) || {
      country: 'Unknown',
      region: 'Unknown',
      city: 'Unknown',
      ll: [0, 0],
      timezone: 'UTC'
    };
    
    return {
      country: geoData.country,
      region: geoData.region,
      city: geoData.city,
      latitude: geoData.ll[0],
      longitude: geoData.ll[1],
      timezone: geoData.timezone
    };
  }

  private calculateDistance(loc1: GeoLocation, loc2: GeoLocation): number {
    // Implementation would calculate distance between two locations
    const R = 6371; // Earth's radius in km
    const dLat = (loc2.latitude - loc1.latitude) * Math.PI / 180;
    const dLon = (loc2.longitude - loc1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(loc1.latitude * Math.PI / 180) * Math.cos(loc2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private async getUserBehaviorProfile(userId: string): Promise<UserBehaviorProfile | null> {
    // Implementation would get user behavior profile
    return null;
  }

  private async assessBrowserSecurity(userAgent: string): Promise<any> {
    // Implementation would assess browser security
    return { score: 0, description: '', severity: 'low', evidence: {} };
  }

  private async analyzeNetwork(request: RiskAssessmentRequest): Promise<RiskFactor[]> {
    // Implementation would analyze network-based risks
    return [];
  }

  private async analyzeTemporal(request: RiskAssessmentRequest): Promise<RiskFactor[]> {
    // Implementation would analyze temporal patterns
    return [];
  }

  private async analyzeThreatIntelligence(request: RiskAssessmentRequest): Promise<RiskFactor[]> {
    // Implementation would check threat intelligence feeds
    return [];
  }

  private async getMachineLearningScore(request: RiskAssessmentRequest, factors: RiskFactor[]): Promise<number> {
    // Implementation would use ML model for risk scoring
    return 0;
  }

  private generateRecommendations(factors: RiskFactor[], level: string): string[] {
    // Implementation would generate risk-based recommendations
    return [];
  }

  private getAllowedAuthMethods(score: number, factors: RiskFactor[]): string[] {
    // Implementation would determine allowed auth methods based on risk
    return ['password', 'mfa'];
  }

  private generateRestrictions(factors: RiskFactor[], level: string): Restriction[] {
    // Implementation would generate restrictions based on risk
    return [];
  }

  private calculateConfidence(factors: RiskFactor[]): number {
    // Implementation would calculate confidence score
    return factors.length > 0 
      ? factors.reduce((sum, f) => sum + f.confidence, 0) / factors.length 
      : 100;
  }

  private async updateUserBehaviorProfile(request: RiskAssessmentRequest, result: RiskAssessmentResult): Promise<void> {
    // Implementation would update user behavior profile
  }

  private async initializeRiskAssessment(): Promise<void> {
    // Implementation would initialize risk assessment components
    this.logger.info('Risk assessment service initialized');
  }
}

export const createRiskAssessmentService = (
  redis: Redis,
  prisma: PrismaClient,
  config: RiskAssessmentConfig,
  logger: LoggerService,
  configService: ConfigService
) => {
  return new RiskAssessmentService(redis, prisma, config, logger, configService);
};