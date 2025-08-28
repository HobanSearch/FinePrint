// Advanced Bot Detection and CAPTCHA Integration
// Multi-layered bot detection with behavioral analysis and CAPTCHA challenges

import { FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import * as Redis from 'ioredis';
import { SecurityError, SecurityUtils } from '../index';

export interface BotDetectionConfig {
  enabled: boolean;
  strictMode: boolean;
  captchaProvider: 'recaptcha' | 'hcaptcha' | 'turnstile' | 'custom';
  captchaSecretKey: string;
  captchaSiteKey: string;
  suspiciousThreshold: number;
  blockThreshold: number;
  challengeThreshold: number;
  whitelistedUserAgents: string[];
  whitelistedIPs: string[];
  honeypotFields: string[];
}

export interface BotDetectionResult {
  isBot: boolean;
  confidence: number;
  reasons: string[];
  requiresCaptcha: boolean;
  shouldBlock: boolean;
  riskScore: number;
}

export interface BehaviorMetrics {
  requestCount: number;
  averageInterval: number;
  uniqueEndpoints: Set<string>;
  userAgentChanges: number;
  suspiciousPatterns: string[];
  humanBehaviorScore: number;
  firstSeen: number;
  lastSeen: number;
}

export interface CaptchaChallenge {
  challengeId: string;
  timestamp: number;
  ip: string;
  attempts: number;
  solved: boolean;
  expiresAt: number;
}

export class BotDetectionEngine {
  private config: BotDetectionConfig;
  private redis: Redis;
  private behaviorCache = new Map<string, BehaviorMetrics>();
  private captchaChallenges = new Map<string, CaptchaChallenge>();
  
  // Known bot patterns
  private readonly botPatterns = [
    // Common bots
    /bot/i, /crawler/i, /spider/i, /scraper/i, /harvester/i,
    // Security tools
    /sqlmap/i, /nikto/i, /burp/i, /nmap/i, /masscan/i, /zap/i,
    // Headless browsers
    /headless/i, /phantom/i, /selenium/i, /puppeteer/i,
    // Suspicious patterns
    /python/i, /curl/i, /wget/i, /http/i, /request/i,
    // Empty or minimal user agents
    /^$/i, /^mozilla\.0$/i, /^user-agent$/i
  ];
  
  // Legitimate bot patterns (allowed)
  private readonly legitimateBots = [
    /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i,
    /baiduspider/i, /yandexbot/i, /facebookexternalhit/i,
    /twitterbot/i, /linkedinbot/i, /discordbot/i,
    /telegrambot/i, /whatsapp/i, /slackbot/i
  ];
  
  // Suspicious IP ranges (simplified)
  private readonly suspiciousIPRanges = [
    // Cloud providers commonly used by bots
    '185.220.', '185.234.', '199.87.', '162.247.',
    // Known proxy/VPN ranges
    '107.174.', '192.99.', '162.251.'
  ];

  constructor(redis: Redis, config: Partial<BotDetectionConfig> = {}) {
    this.redis = redis;
    this.config = {
      enabled: true,
      strictMode: false,
      captchaProvider: 'recaptcha',
      captchaSecretKey: process.env.CAPTCHA_SECRET_KEY || '',
      captchaSiteKey: process.env.CAPTCHA_SITE_KEY || '',
      suspiciousThreshold: 60,
      blockThreshold: 80,
      challengeThreshold: 70,
      whitelistedUserAgents: [],
      whitelistedIPs: [],
      honeypotFields: ['website', 'company_url', 'referral_code'],
      ...config
    };
    
    // Start cleanup job
    this.startCleanupJob();
  }

  /**
   * Main bot detection middleware
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!this.config.enabled) {
        return;
      }

      const clientIP = SecurityUtils.extractClientIP(request);
      const userAgent = request.headers['user-agent'] || '';
      
      // Skip whitelisted IPs and user agents
      if (this.isWhitelisted(clientIP, userAgent)) {
        return;
      }

      try {
        // Perform bot detection analysis
        const result = await this.analyzeRequest(request);
        
        // Log suspicious activity
        if (result.confidence > this.config.suspiciousThreshold) {
          request.log.warn('Suspicious bot activity detected', {
            ip: clientIP,
            userAgent,
            confidence: result.confidence,
            reasons: result.reasons,
            riskScore: result.riskScore
          });
        }
        
        // Handle high-confidence bot detection
        if (result.shouldBlock) {
          await this.blockIP(clientIP, 'Bot detection: high confidence');
          throw new SecurityError('Request blocked due to bot detection', 'BOT_DETECTED', 403);
        }
        
        // Require CAPTCHA for suspicious requests
        if (result.requiresCaptcha) {
          await this.requireCaptchaChallenge(request, reply);
        }
        
        // Update behavior metrics
        await this.updateBehaviorMetrics(clientIP, userAgent, request);
        
        // Add bot detection headers for debugging
        if (process.env.NODE_ENV === 'development') {
          reply.header('X-Bot-Detection-Score', result.confidence.toString());
          reply.header('X-Bot-Detection-Reasons', result.reasons.join(', '));
        }
        
      } catch (error) {
        if (error instanceof SecurityError) {
          throw error;
        }
        
        // Log but don't block on detection errors
        request.log.error('Bot detection error', { error, ip: clientIP });
      }
    };
  }

  /**
   * Analyze request for bot indicators
   */
  private async analyzeRequest(request: FastifyRequest): Promise<BotDetectionResult> {
    const clientIP = SecurityUtils.extractClientIP(request);
    const userAgent = request.headers['user-agent'] || '';
    const referer = request.headers.referer || '';
    
    let confidence = 0;
    const reasons: string[] = [];
    
    // User agent analysis
    const uaAnalysis = this.analyzeUserAgent(userAgent);
    confidence += uaAnalysis.score;
    reasons.push(...uaAnalysis.reasons);
    
    // IP analysis
    const ipAnalysis = this.analyzeIP(clientIP);
    confidence += ipAnalysis.score;
    reasons.push(...ipAnalysis.reasons);
    
    // Request pattern analysis
    const patternAnalysis = await this.analyzeRequestPatterns(request);
    confidence += patternAnalysis.score;
    reasons.push(...patternAnalysis.reasons);
    
    // Behavioral analysis
    const behaviorAnalysis = await this.analyzeBehavior(clientIP, userAgent);
    confidence += behaviorAnalysis.score;
    reasons.push(...behaviorAnalysis.reasons);
    
    // Header analysis
    const headerAnalysis = this.analyzeHeaders(request.headers);
    confidence += headerAnalysis.score;
    reasons.push(...headerAnalysis.reasons);
    
    // Timing analysis
    const timingAnalysis = await this.analyzeRequestTiming(clientIP);
    confidence += timingAnalysis.score;
    reasons.push(...timingAnalysis.reasons);
    
    // Honeypot analysis (for POST requests)
    if (request.method === 'POST' && request.body) {
      const honeypotAnalysis = this.analyzeHoneypot(request.body as any);
      confidence += honeypotAnalysis.score;
      reasons.push(...honeypotAnalysis.reasons);
    }
    
    // Calculate final scores
    const riskScore = Math.min(confidence, 100);
    
    return {
      isBot: riskScore > this.config.suspiciousThreshold,
      confidence: riskScore,
      reasons: reasons.filter(r => r), // Remove empty reasons
      requiresCaptcha: riskScore > this.config.challengeThreshold,
      shouldBlock: riskScore > this.config.blockThreshold,
      riskScore
    };
  }

  /**
   * Analyze user agent for bot indicators
   */
  private analyzeUserAgent(userAgent: string): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    
    if (!userAgent) {
      score += 30;
      reasons.push('Missing user agent');
      return { score, reasons };
    }
    
    // Check for legitimate bots (lower score)
    if (this.legitimateBots.some(pattern => pattern.test(userAgent))) {
      score -= 20;
      reasons.push('Legitimate bot detected');
      return { score, reasons };
    }
    
    // Check for known bot patterns
    if (this.botPatterns.some(pattern => pattern.test(userAgent))) {
      score += 40;
      reasons.push('Bot pattern in user agent');
    }
    
    // Check for suspicious characteristics
    if (userAgent.length < 20) {
      score += 20;
      reasons.push('Suspiciously short user agent');
    }
    
    if (userAgent.length > 500) {
      score += 15;
      reasons.push('Suspiciously long user agent');
    }
    
    // Check for missing common browser components
    const hasWebKit = /webkit/i.test(userAgent);
    const hasGecko = /gecko/i.test(userAgent);
    const hasMozilla = /mozilla/i.test(userAgent);
    
    if (!hasWebKit && !hasGecko && !hasMozilla) {
      score += 25;
      reasons.push('Missing common browser identifiers');
    }
    
    // Check for programming language indicators
    const progLanguages = /python|java|perl|ruby|php|node/i;
    if (progLanguages.test(userAgent)) {
      score += 30;
      reasons.push('Programming language in user agent');
    }
    
    // Check for automation tools
    const automationTools = /selenium|webdriver|phantom|headless|puppeteer/i;
    if (automationTools.test(userAgent)) {
      score += 35;
      reasons.push('Automation tool detected');
    }
    
    return { score, reasons };
  }

  /**
   * Analyze IP address for suspicious indicators
   */
  private analyzeIP(ip: string): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    
    // Check suspicious IP ranges
    if (this.suspiciousIPRanges.some(range => ip.startsWith(range))) {
      score += 20;
      reasons.push('IP from suspicious range');
    }
    
    // Check for localhost/private IPs (might indicate testing/automation)
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      score += 10;
      reasons.push('Local/private IP address');
    }
    
    return { score, reasons };
  }

  /**
   * Analyze request patterns
   */
  private async analyzeRequestPatterns(request: FastifyRequest): Promise<{ score: number; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];
    
    // Check for suspicious paths
    const suspiciousPaths = [
      '/wp-admin', '/admin', '/.env', '/config', '/api/v1',
      '/robots.txt', '/sitemap.xml', '/.well-known'
    ];
    
    if (suspiciousPaths.some(path => request.url.includes(path))) {
      score += 15;
      reasons.push('Accessing suspicious paths');
    }
    
    // Check for rapid sequential requests
    const clientIP = SecurityUtils.extractClientIP(request);
    const recentRequests = await this.getRecentRequestCount(clientIP);
    
    if (recentRequests > 10) {
      score += 20;
      reasons.push('High request frequency');
    }
    
    // Check for unusual HTTP methods
    if (['TRACE', 'CONNECT', 'PATCH'].includes(request.method)) {
      score += 10;
      reasons.push('Unusual HTTP method');
    }
    
    return { score, reasons };
  }

  /**
   * Analyze behavioral patterns
   */
  private async analyzeBehavior(ip: string, userAgent: string): Promise<{ score: number; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];
    
    const key = `${ip}:${crypto.createHash('md5').update(userAgent).digest('hex').substring(0, 8)}`;
    const behavior = this.behaviorCache.get(key);
    
    if (!behavior) {
      return { score, reasons };
    }
    
    // Analyze request intervals
    if (behavior.averageInterval < 1000) { // Less than 1 second
      score += 25;
      reasons.push('Abnormally fast request intervals');
    }
    
    // Analyze endpoint diversity
    if (behavior.uniqueEndpoints.size === 1 && behavior.requestCount > 5) {
      score += 15;
      reasons.push('Repetitive endpoint access');
    }
    
    // Analyze user agent changes
    if (behavior.userAgentChanges > 3) {
      score += 20;
      reasons.push('Frequent user agent changes');
    }
    
    // Analyze human behavior score
    if (behavior.humanBehaviorScore < 30) {
      score += 30;
      reasons.push('Low human behavior indicators');
    }
    
    return { score, reasons };
  }

  /**
   * Analyze request headers
   */
  private analyzeHeaders(headers: any): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    
    // Check for missing common headers
    if (!headers.accept) {
      score += 15;
      reasons.push('Missing Accept header');
    }
    
    if (!headers['accept-language']) {
      score += 10;
      reasons.push('Missing Accept-Language header');
    }
    
    if (!headers['accept-encoding']) {
      score += 10;
      reasons.push('Missing Accept-Encoding header');
    }
    
    // Check for suspicious header values
    if (headers.accept === '*/*') {
      score += 10;
      reasons.push('Generic Accept header');
    }
    
    // Check for automation-specific headers
    const automationHeaders = [
      'x-requested-with', 'x-automated', 'x-robot', 'x-crawler'
    ];
    
    for (const header of automationHeaders) {
      if (headers[header]) {
        score += 20;
        reasons.push(`Automation header detected: ${header}`);
      }
    }
    
    // Check for missing referer on POST requests
    if (!headers.referer && headers['content-type']) {
      score += 15;
      reasons.push('Missing referer on form submission');
    }
    
    return { score, reasons };
  }

  /**
   * Analyze request timing patterns
   */
  private async analyzeRequestTiming(ip: string): Promise<{ score: number; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];
    
    const timingKey = `timing:${ip}`;
    const timestamps = await this.redis.lrange(timingKey, 0, -1);
    
    if (timestamps.length < 3) {
      return { score, reasons };
    }
    
    // Convert to numbers and sort
    const times = timestamps.map(Number).sort((a, b) => a - b);
    
    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < times.length; i++) {
      intervals.push(times[i] - times[i - 1]);
    }
    
    // Check for perfectly regular intervals (bot-like)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((acc, interval) => {
      return acc + Math.pow(interval - avgInterval, 2);
    }, 0) / intervals.length;
    
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = standardDeviation / avgInterval;
    
    // Low variation indicates bot-like behavior
    if (coefficientOfVariation < 0.1) {
      score += 25;
      reasons.push('Highly regular request timing');
    }
    
    // Very fast requests
    if (avgInterval < 500) {
      score += 20;
      reasons.push('Abnormally fast request rate');
    }
    
    return { score, reasons };
  }

  /**
   * Analyze honeypot fields
   */
  private analyzeHoneypot(body: any): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];
    
    if (!body || typeof body !== 'object') {
      return { score, reasons };
    }
    
    // Check if any honeypot fields are filled
    for (const field of this.config.honeypotFields) {
      if (body[field] && body[field].trim() !== '') {
        score += 50;
        reasons.push(`Honeypot field filled: ${field}`);
      }
    }
    
    return { score, reasons };
  }

  /**
   * Require CAPTCHA challenge
   */
  private async requireCaptchaChallenge(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const clientIP = SecurityUtils.extractClientIP(request);
    const challengeId = SecurityUtils.generateUUID();
    
    // Check if CAPTCHA token is provided
    const captchaToken = request.headers['x-captcha-token'] as string || 
                        (request.body as any)?.captchaToken;
    
    if (captchaToken) {
      const isValid = await this.verifyCaptcha(captchaToken, clientIP);
      if (isValid) {
        // CAPTCHA solved successfully
        await this.markCaptchaSolved(clientIP);
        return;
      }
    }
    
    // Create new challenge
    const challenge: CaptchaChallenge = {
      challengeId,
      timestamp: Date.now(),
      ip: clientIP,
      attempts: 0,
      solved: false,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    };
    
    this.captchaChallenges.set(challengeId, challenge);
    
    // Return CAPTCHA challenge response
    return reply.status(429).send({
      success: false,
      error: 'CAPTCHA_REQUIRED',
      message: 'Please complete the CAPTCHA challenge',
      data: {
        challengeId,
        siteKey: this.config.captchaSiteKey,
        provider: this.config.captchaProvider
      }
    });
  }

  /**
   * Verify CAPTCHA response
   */
  private async verifyCaptcha(token: string, ip: string): Promise<boolean> {
    try {
      let verificationUrl: string;
      let payload: any;
      
      switch (this.config.captchaProvider) {
        case 'recaptcha':
          verificationUrl = 'https://www.google.com/recaptcha/api/siteverify';
          payload = {
            secret: this.config.captchaSecretKey,
            response: token,
            remoteip: ip
          };
          break;
          
        case 'hcaptcha':
          verificationUrl = 'https://hcaptcha.com/siteverify';
          payload = {
            secret: this.config.captchaSecretKey,
            response: token,
            remoteip: ip
          };
          break;
          
        case 'turnstile':
          verificationUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
          payload = {
            secret: this.config.captchaSecretKey,
            response: token,
            remoteip: ip
          };
          break;
          
        default:
          return false;
      }
      
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(verificationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(payload)
      });
      
      const result = await response.json() as any;
      return result.success === true;
      
    } catch (error) {
      console.error('CAPTCHA verification error:', error);
      return false;
    }
  }

  /**
   * Mark CAPTCHA as solved for IP
   */
  private async markCaptchaSolved(ip: string): Promise<void> {
    const key = `captcha:solved:${ip}`;
    await this.redis.setex(key, 3600, Date.now().toString()); // Valid for 1 hour
  }

  /**
   * Check if IP has recently solved CAPTCHA
   */
  private async hasSolvedCaptcha(ip: string): Promise<boolean> {
    const key = `captcha:solved:${ip}`;
    const result = await this.redis.get(key);
    return result !== null;
  }

  /**
   * Block IP address
   */
  private async blockIP(ip: string, reason: string): Promise<void> {
    const key = `bot:blocked:${ip}`;
    await this.redis.setex(key, 3600, JSON.stringify({
      timestamp: Date.now(),
      reason
    }));
  }

  /**
   * Check if request is from whitelisted source
   */
  private isWhitelisted(ip: string, userAgent: string): boolean {
    return this.config.whitelistedIPs.includes(ip) ||
           this.config.whitelistedUserAgents.some(ua => userAgent.includes(ua));
  }

  /**
   * Update behavior metrics
   */
  private async updateBehaviorMetrics(
    ip: string, 
    userAgent: string, 
    request: FastifyRequest
  ): Promise<void> {
    const key = `${ip}:${crypto.createHash('md5').update(userAgent).digest('hex').substring(0, 8)}`;
    const now = Date.now();
    
    // Update in-memory cache
    let behavior = this.behaviorCache.get(key);
    if (!behavior) {
      behavior = {
        requestCount: 0,
        averageInterval: 0,
        uniqueEndpoints: new Set(),
        userAgentChanges: 0,
        suspiciousPatterns: [],
        humanBehaviorScore: 50,
        firstSeen: now,
        lastSeen: now
      };
    }
    
    behavior.requestCount++;
    behavior.uniqueEndpoints.add(request.url);
    behavior.lastSeen = now;
    
    // Calculate average interval
    const interval = now - behavior.lastSeen;
    behavior.averageInterval = (behavior.averageInterval + interval) / 2;
    
    this.behaviorCache.set(key, behavior);
    
    // Store timing data in Redis
    const timingKey = `timing:${ip}`;
    await this.redis.lpush(timingKey, now.toString());
    await this.redis.ltrim(timingKey, 0, 19); // Keep last 20 requests
    await this.redis.expire(timingKey, 3600); // Expire after 1 hour
  }

  /**
   * Get recent request count for IP
   */
  private async getRecentRequestCount(ip: string): Promise<number> {
    const key = `requests:${ip}`;
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  /**
   * Start cleanup job for expired data
   */
  private startCleanupJob(): void {
    setInterval(() => {
      const now = Date.now();
      
      // Clean up expired CAPTCHA challenges
      for (const [id, challenge] of this.captchaChallenges.entries()) {
        if (challenge.expiresAt < now) {
          this.captchaChallenges.delete(id);
        }
      }
      
      // Clean up old behavior metrics
      for (const [key, behavior] of this.behaviorCache.entries()) {
        if (now - behavior.lastSeen > 24 * 60 * 60 * 1000) { // 24 hours
          this.behaviorCache.delete(key);
        }
      }
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  /**
   * Get detection statistics
   */
  getStatistics() {
    return {
      totalBehaviorProfiles: this.behaviorCache.size,
      activeCaptchaChallenges: this.captchaChallenges.size,
      config: {
        enabled: this.config.enabled,
        strictMode: this.config.strictMode,
        captchaProvider: this.config.captchaProvider,
        thresholds: {
          suspicious: this.config.suspiciousThreshold,
          challenge: this.config.challengeThreshold,
          block: this.config.blockThreshold
        }
      }
    };
  }

  /**
   * Generate honeypot HTML fields
   */
  generateHoneypotHTML(): string {
    return this.config.honeypotFields.map(field => 
      `<input type="text" name="${field}" style="display:none !important;" tabindex="-1" autocomplete="off" />`
    ).join('\n');
  }

  /**
   * Create CAPTCHA verification middleware
   */
  createCaptchaMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const clientIP = SecurityUtils.extractClientIP(request);
      
      // Skip if recently solved CAPTCHA
      if (await this.hasSolvedCaptcha(clientIP)) {
        return;
      }
      
      // Check for CAPTCHA token
      const captchaToken = request.headers['x-captcha-token'] as string ||
                          (request.body as any)?.captchaToken;
      
      if (!captchaToken) {
        return reply.status(400).send({
          success: false,
          error: 'CAPTCHA_TOKEN_REQUIRED',
          message: 'CAPTCHA token is required for this request'
        });
      }
      
      const isValid = await this.verifyCaptcha(captchaToken, clientIP);
      if (!isValid) {
        return reply.status(400).send({
          success: false,
          error: 'CAPTCHA_VERIFICATION_FAILED',
          message: 'CAPTCHA verification failed'
        });
      }
      
      await this.markCaptchaSolved(clientIP);
    };
  }
}

// Export factory function
export function createBotDetection(
  redis: Redis, 
  config?: Partial<BotDetectionConfig>
): BotDetectionEngine {
  return new BotDetectionEngine(redis, config);
}
