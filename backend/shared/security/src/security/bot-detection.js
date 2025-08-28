"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotDetectionEngine = void 0;
exports.createBotDetection = createBotDetection;
const crypto = __importStar(require("crypto"));
const index_1 = require("../index");
class BotDetectionEngine {
    config;
    redis;
    behaviorCache = new Map();
    captchaChallenges = new Map();
    botPatterns = [
        /bot/i, /crawler/i, /spider/i, /scraper/i, /harvester/i,
        /sqlmap/i, /nikto/i, /burp/i, /nmap/i, /masscan/i, /zap/i,
        /headless/i, /phantom/i, /selenium/i, /puppeteer/i,
        /python/i, /curl/i, /wget/i, /http/i, /request/i,
        /^$/i, /^mozilla\.0$/i, /^user-agent$/i
    ];
    legitimateBots = [
        /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i,
        /baiduspider/i, /yandexbot/i, /facebookexternalhit/i,
        /twitterbot/i, /linkedinbot/i, /discordbot/i,
        /telegrambot/i, /whatsapp/i, /slackbot/i
    ];
    suspiciousIPRanges = [
        '185.220.', '185.234.', '199.87.', '162.247.',
        '107.174.', '192.99.', '162.251.'
    ];
    constructor(redis, config = {}) {
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
        this.startCleanupJob();
    }
    middleware() {
        return async (request, reply) => {
            if (!this.config.enabled) {
                return;
            }
            const clientIP = index_1.SecurityUtils.extractClientIP(request);
            const userAgent = request.headers['user-agent'] || '';
            if (this.isWhitelisted(clientIP, userAgent)) {
                return;
            }
            try {
                const result = await this.analyzeRequest(request);
                if (result.confidence > this.config.suspiciousThreshold) {
                    request.log.warn('Suspicious bot activity detected', {
                        ip: clientIP,
                        userAgent,
                        confidence: result.confidence,
                        reasons: result.reasons,
                        riskScore: result.riskScore
                    });
                }
                if (result.shouldBlock) {
                    await this.blockIP(clientIP, 'Bot detection: high confidence');
                    throw new index_1.SecurityError('Request blocked due to bot detection', 'BOT_DETECTED', 403);
                }
                if (result.requiresCaptcha) {
                    await this.requireCaptchaChallenge(request, reply);
                }
                await this.updateBehaviorMetrics(clientIP, userAgent, request);
                if (process.env.NODE_ENV === 'development') {
                    reply.header('X-Bot-Detection-Score', result.confidence.toString());
                    reply.header('X-Bot-Detection-Reasons', result.reasons.join(', '));
                }
            }
            catch (error) {
                if (error instanceof index_1.SecurityError) {
                    throw error;
                }
                request.log.error('Bot detection error', { error, ip: clientIP });
            }
        };
    }
    async analyzeRequest(request) {
        const clientIP = index_1.SecurityUtils.extractClientIP(request);
        const userAgent = request.headers['user-agent'] || '';
        const referer = request.headers.referer || '';
        let confidence = 0;
        const reasons = [];
        const uaAnalysis = this.analyzeUserAgent(userAgent);
        confidence += uaAnalysis.score;
        reasons.push(...uaAnalysis.reasons);
        const ipAnalysis = this.analyzeIP(clientIP);
        confidence += ipAnalysis.score;
        reasons.push(...ipAnalysis.reasons);
        const patternAnalysis = await this.analyzeRequestPatterns(request);
        confidence += patternAnalysis.score;
        reasons.push(...patternAnalysis.reasons);
        const behaviorAnalysis = await this.analyzeBehavior(clientIP, userAgent);
        confidence += behaviorAnalysis.score;
        reasons.push(...behaviorAnalysis.reasons);
        const headerAnalysis = this.analyzeHeaders(request.headers);
        confidence += headerAnalysis.score;
        reasons.push(...headerAnalysis.reasons);
        const timingAnalysis = await this.analyzeRequestTiming(clientIP);
        confidence += timingAnalysis.score;
        reasons.push(...timingAnalysis.reasons);
        if (request.method === 'POST' && request.body) {
            const honeypotAnalysis = this.analyzeHoneypot(request.body);
            confidence += honeypotAnalysis.score;
            reasons.push(...honeypotAnalysis.reasons);
        }
        const riskScore = Math.min(confidence, 100);
        return {
            isBot: riskScore > this.config.suspiciousThreshold,
            confidence: riskScore,
            reasons: reasons.filter(r => r),
            requiresCaptcha: riskScore > this.config.challengeThreshold,
            shouldBlock: riskScore > this.config.blockThreshold,
            riskScore
        };
    }
    analyzeUserAgent(userAgent) {
        let score = 0;
        const reasons = [];
        if (!userAgent) {
            score += 30;
            reasons.push('Missing user agent');
            return { score, reasons };
        }
        if (this.legitimateBots.some(pattern => pattern.test(userAgent))) {
            score -= 20;
            reasons.push('Legitimate bot detected');
            return { score, reasons };
        }
        if (this.botPatterns.some(pattern => pattern.test(userAgent))) {
            score += 40;
            reasons.push('Bot pattern in user agent');
        }
        if (userAgent.length < 20) {
            score += 20;
            reasons.push('Suspiciously short user agent');
        }
        if (userAgent.length > 500) {
            score += 15;
            reasons.push('Suspiciously long user agent');
        }
        const hasWebKit = /webkit/i.test(userAgent);
        const hasGecko = /gecko/i.test(userAgent);
        const hasMozilla = /mozilla/i.test(userAgent);
        if (!hasWebKit && !hasGecko && !hasMozilla) {
            score += 25;
            reasons.push('Missing common browser identifiers');
        }
        const progLanguages = /python|java|perl|ruby|php|node/i;
        if (progLanguages.test(userAgent)) {
            score += 30;
            reasons.push('Programming language in user agent');
        }
        const automationTools = /selenium|webdriver|phantom|headless|puppeteer/i;
        if (automationTools.test(userAgent)) {
            score += 35;
            reasons.push('Automation tool detected');
        }
        return { score, reasons };
    }
    analyzeIP(ip) {
        let score = 0;
        const reasons = [];
        if (this.suspiciousIPRanges.some(range => ip.startsWith(range))) {
            score += 20;
            reasons.push('IP from suspicious range');
        }
        if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            score += 10;
            reasons.push('Local/private IP address');
        }
        return { score, reasons };
    }
    async analyzeRequestPatterns(request) {
        let score = 0;
        const reasons = [];
        const suspiciousPaths = [
            '/wp-admin', '/admin', '/.env', '/config', '/api/v1',
            '/robots.txt', '/sitemap.xml', '/.well-known'
        ];
        if (suspiciousPaths.some(path => request.url.includes(path))) {
            score += 15;
            reasons.push('Accessing suspicious paths');
        }
        const clientIP = index_1.SecurityUtils.extractClientIP(request);
        const recentRequests = await this.getRecentRequestCount(clientIP);
        if (recentRequests > 10) {
            score += 20;
            reasons.push('High request frequency');
        }
        if (['TRACE', 'CONNECT', 'PATCH'].includes(request.method)) {
            score += 10;
            reasons.push('Unusual HTTP method');
        }
        return { score, reasons };
    }
    async analyzeBehavior(ip, userAgent) {
        let score = 0;
        const reasons = [];
        const key = `${ip}:${crypto.createHash('md5').update(userAgent).digest('hex').substring(0, 8)}`;
        const behavior = this.behaviorCache.get(key);
        if (!behavior) {
            return { score, reasons };
        }
        if (behavior.averageInterval < 1000) {
            score += 25;
            reasons.push('Abnormally fast request intervals');
        }
        if (behavior.uniqueEndpoints.size === 1 && behavior.requestCount > 5) {
            score += 15;
            reasons.push('Repetitive endpoint access');
        }
        if (behavior.userAgentChanges > 3) {
            score += 20;
            reasons.push('Frequent user agent changes');
        }
        if (behavior.humanBehaviorScore < 30) {
            score += 30;
            reasons.push('Low human behavior indicators');
        }
        return { score, reasons };
    }
    analyzeHeaders(headers) {
        let score = 0;
        const reasons = [];
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
        if (headers.accept === '*/*') {
            score += 10;
            reasons.push('Generic Accept header');
        }
        const automationHeaders = [
            'x-requested-with', 'x-automated', 'x-robot', 'x-crawler'
        ];
        for (const header of automationHeaders) {
            if (headers[header]) {
                score += 20;
                reasons.push(`Automation header detected: ${header}`);
            }
        }
        if (!headers.referer && headers['content-type']) {
            score += 15;
            reasons.push('Missing referer on form submission');
        }
        return { score, reasons };
    }
    async analyzeRequestTiming(ip) {
        let score = 0;
        const reasons = [];
        const timingKey = `timing:${ip}`;
        const timestamps = await this.redis.lrange(timingKey, 0, -1);
        if (timestamps.length < 3) {
            return { score, reasons };
        }
        const times = timestamps.map(Number).sort((a, b) => a - b);
        const intervals = [];
        for (let i = 1; i < times.length; i++) {
            intervals.push(times[i] - times[i - 1]);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((acc, interval) => {
            return acc + Math.pow(interval - avgInterval, 2);
        }, 0) / intervals.length;
        const standardDeviation = Math.sqrt(variance);
        const coefficientOfVariation = standardDeviation / avgInterval;
        if (coefficientOfVariation < 0.1) {
            score += 25;
            reasons.push('Highly regular request timing');
        }
        if (avgInterval < 500) {
            score += 20;
            reasons.push('Abnormally fast request rate');
        }
        return { score, reasons };
    }
    analyzeHoneypot(body) {
        let score = 0;
        const reasons = [];
        if (!body || typeof body !== 'object') {
            return { score, reasons };
        }
        for (const field of this.config.honeypotFields) {
            if (body[field] && body[field].trim() !== '') {
                score += 50;
                reasons.push(`Honeypot field filled: ${field}`);
            }
        }
        return { score, reasons };
    }
    async requireCaptchaChallenge(request, reply) {
        const clientIP = index_1.SecurityUtils.extractClientIP(request);
        const challengeId = index_1.SecurityUtils.generateUUID();
        const captchaToken = request.headers['x-captcha-token'] ||
            request.body?.captchaToken;
        if (captchaToken) {
            const isValid = await this.verifyCaptcha(captchaToken, clientIP);
            if (isValid) {
                await this.markCaptchaSolved(clientIP);
                return;
            }
        }
        const challenge = {
            challengeId,
            timestamp: Date.now(),
            ip: clientIP,
            attempts: 0,
            solved: false,
            expiresAt: Date.now() + 10 * 60 * 1000
        };
        this.captchaChallenges.set(challengeId, challenge);
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
    async verifyCaptcha(token, ip) {
        try {
            let verificationUrl;
            let payload;
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
            const result = await response.json();
            return result.success === true;
        }
        catch (error) {
            console.error('CAPTCHA verification error:', error);
            return false;
        }
    }
    async markCaptchaSolved(ip) {
        const key = `captcha:solved:${ip}`;
        await this.redis.setex(key, 3600, Date.now().toString());
    }
    async hasSolvedCaptcha(ip) {
        const key = `captcha:solved:${ip}`;
        const result = await this.redis.get(key);
        return result !== null;
    }
    async blockIP(ip, reason) {
        const key = `bot:blocked:${ip}`;
        await this.redis.setex(key, 3600, JSON.stringify({
            timestamp: Date.now(),
            reason
        }));
    }
    isWhitelisted(ip, userAgent) {
        return this.config.whitelistedIPs.includes(ip) ||
            this.config.whitelistedUserAgents.some(ua => userAgent.includes(ua));
    }
    async updateBehaviorMetrics(ip, userAgent, request) {
        const key = `${ip}:${crypto.createHash('md5').update(userAgent).digest('hex').substring(0, 8)}`;
        const now = Date.now();
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
        const interval = now - behavior.lastSeen;
        behavior.averageInterval = (behavior.averageInterval + interval) / 2;
        this.behaviorCache.set(key, behavior);
        const timingKey = `timing:${ip}`;
        await this.redis.lpush(timingKey, now.toString());
        await this.redis.ltrim(timingKey, 0, 19);
        await this.redis.expire(timingKey, 3600);
    }
    async getRecentRequestCount(ip) {
        const key = `requests:${ip}`;
        const count = await this.redis.get(key);
        return count ? parseInt(count, 10) : 0;
    }
    startCleanupJob() {
        setInterval(() => {
            const now = Date.now();
            for (const [id, challenge] of this.captchaChallenges.entries()) {
                if (challenge.expiresAt < now) {
                    this.captchaChallenges.delete(id);
                }
            }
            for (const [key, behavior] of this.behaviorCache.entries()) {
                if (now - behavior.lastSeen > 24 * 60 * 60 * 1000) {
                    this.behaviorCache.delete(key);
                }
            }
        }, 5 * 60 * 1000);
    }
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
    generateHoneypotHTML() {
        return this.config.honeypotFields.map(field => `<input type="text" name="${field}" style="display:none !important;" tabindex="-1" autocomplete="off" />`).join('\n');
    }
    createCaptchaMiddleware() {
        return async (request, reply) => {
            const clientIP = index_1.SecurityUtils.extractClientIP(request);
            if (await this.hasSolvedCaptcha(clientIP)) {
                return;
            }
            const captchaToken = request.headers['x-captcha-token'] ||
                request.body?.captchaToken;
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
exports.BotDetectionEngine = BotDetectionEngine;
function createBotDetection(redis, config) {
    return new BotDetectionEngine(redis, config);
}
//# sourceMappingURL=bot-detection.js.map