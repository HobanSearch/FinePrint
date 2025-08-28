"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.productAnalyticsService = void 0;
const mixpanel_1 = __importDefault(require("mixpanel"));
const amplitude_node_1 = require("amplitude-node");
const analytics_node_1 = require("@segment/analytics-node");
const config_1 = require("@/config");
const logger_1 = require("@/utils/logger");
const client_1 = require("@prisma/client");
class ProductAnalyticsService {
    mixpanel;
    amplitude;
    segment;
    prisma;
    isInitialized = false;
    constructor() {
        this.prisma = new client_1.PrismaClient();
        this.initialize();
    }
    async initialize() {
        try {
            if (config_1.config.productAnalytics.mixpanel.enabled && config_1.config.productAnalytics.mixpanel.token) {
                this.mixpanel = mixpanel_1.default.init(config_1.config.productAnalytics.mixpanel.token, {
                    host: config_1.config.productAnalytics.mixpanel.region === 'EU' ? 'api-eu.mixpanel.com' : 'api.mixpanel.com',
                    debug: config_1.config.nodeEnv !== 'production',
                    protocol: 'https'
                });
                logger_1.analyticsLogger.event('mixpanel_initialized', { region: config_1.config.productAnalytics.mixpanel.region });
            }
            if (config_1.config.productAnalytics.amplitude.enabled && config_1.config.productAnalytics.amplitude.apiKey) {
                this.amplitude = new amplitude_node_1.Amplitude(config_1.config.productAnalytics.amplitude.apiKey, {
                    debug: config_1.config.nodeEnv !== 'production',
                    serverName: 'fineprintai-analytics',
                    serverZone: 'US'
                });
                logger_1.analyticsLogger.event('amplitude_initialized', {});
            }
            if (config_1.config.productAnalytics.segment.enabled && config_1.config.productAnalytics.segment.writeKey) {
                this.segment = new analytics_node_1.Analytics({
                    writeKey: config_1.config.productAnalytics.segment.writeKey,
                    flushAt: 20,
                    flushInterval: 10000
                });
                logger_1.analyticsLogger.event('segment_initialized', {});
            }
            this.isInitialized = true;
            logger_1.analyticsLogger.event('product_analytics_initialized', {
                mixpanel: !!this.mixpanel,
                amplitude: !!this.amplitude,
                segment: !!this.segment
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'product_analytics_initialization' });
            throw error;
        }
    }
    async trackEvent(userId, eventName, properties = {}, context = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        try {
            const enrichedEvent = await this.enrichEvent(userId, eventName, properties, context);
            if (this.mixpanel) {
                await this.trackMixpanelEvent(userId, eventName, enrichedEvent);
            }
            if (this.amplitude) {
                await this.trackAmplitudeEvent(userId, eventName, enrichedEvent, context);
            }
            if (this.segment) {
                await this.trackSegmentEvent(userId, eventName, enrichedEvent, context);
            }
            await this.storeEventLocally(userId, eventName, enrichedEvent, context);
            logger_1.analyticsLogger.event('product_event_tracked', {
                eventName,
                userId: this.hashUserId(userId),
                propertiesCount: Object.keys(enrichedEvent).length
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'track_event',
                eventName,
                userId: this.hashUserId(userId)
            });
            throw error;
        }
    }
    async identifyUser(userId, properties, context = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        try {
            const safeProperties = this.sanitizeUserProperties(properties);
            if (this.mixpanel) {
                this.mixpanel.people.set(userId, safeProperties);
            }
            if (this.amplitude) {
                await this.amplitude.identify({
                    user_id: userId,
                    user_properties: safeProperties,
                    time: Date.now(),
                    ip: context.ip ? this.anonymizeIp(context.ip) : undefined,
                    platform: context.platform || 'web'
                });
            }
            if (this.segment) {
                this.segment.identify({
                    userId,
                    traits: safeProperties,
                    timestamp: new Date(),
                    context: {
                        ip: context.ip ? this.anonymizeIp(context.ip) : undefined,
                        userAgent: context.userAgent?.substring(0, 100),
                        page: context.page ? { url: context.page.url, title: context.page.title } : undefined
                    }
                });
            }
            logger_1.analyticsLogger.event('user_identified', {
                userId: this.hashUserId(userId),
                propertiesCount: Object.keys(safeProperties).length
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'identify_user',
                userId: this.hashUserId(userId)
            });
            throw error;
        }
    }
    async trackPageView(userId, page, properties = {}, context = {}) {
        const pageProperties = {
            ...properties,
            page_url: page.url,
            page_title: page.title,
            referrer: page.referrer,
            timestamp: new Date().toISOString()
        };
        await this.trackEvent(userId, 'Page Viewed', pageProperties, context);
        if (this.segment) {
            this.segment.page({
                userId,
                name: page.title,
                properties: pageProperties,
                timestamp: new Date(),
                context: {
                    ip: context.ip ? this.anonymizeIp(context.ip) : undefined,
                    userAgent: context.userAgent?.substring(0, 100),
                    page: { url: page.url, title: page.title, referrer: page.referrer }
                }
            });
        }
    }
    async trackFunnelStep(userId, funnelName, stepName, stepOrder, properties = {}, context = {}) {
        const funnelProperties = {
            ...properties,
            funnel_name: funnelName,
            funnel_step: stepName,
            funnel_step_order: stepOrder,
            timestamp: new Date().toISOString()
        };
        await this.trackEvent(userId, 'Funnel Step Completed', funnelProperties, context);
        await this.storeFunnelStep(userId, funnelName, stepName, stepOrder, funnelProperties);
    }
    async trackConversion(userId, conversionType, value, properties = {}, context = {}) {
        const conversionProperties = {
            ...properties,
            conversion_type: conversionType,
            conversion_value: value,
            timestamp: new Date().toISOString()
        };
        await this.trackEvent(userId, 'Conversion', conversionProperties, context);
        if (this.mixpanel && value) {
            this.mixpanel.people.track_charge(userId, value, {
                conversion_type: conversionType,
                time: new Date()
            });
        }
    }
    async trackEngagement(userId, feature, action, duration, properties = {}, context = {}) {
        const engagementProperties = {
            ...properties,
            feature,
            action,
            duration_seconds: duration,
            timestamp: new Date().toISOString()
        };
        await this.trackEvent(userId, 'Feature Engagement', engagementProperties, context);
    }
    async batchTrackEvents(events) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        try {
            const promises = events.map(event => this.trackEvent(event.userId, event.eventName, event.properties, event.context));
            await Promise.all(promises);
            logger_1.analyticsLogger.event('batch_events_tracked', {
                eventCount: events.length
            });
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'batch_track_events',
                eventCount: events.length
            });
            throw error;
        }
    }
    async getUserFunnelProgress(userId, funnelName) {
        try {
            const steps = await this.prisma.$queryRaw `
        SELECT 
          funnel_step as step_name,
          funnel_step_order as step_order,
          created_at as completed_at,
          properties
        FROM analytics_events 
        WHERE user_id = ${userId} 
          AND event_name = 'Funnel Step Completed'
          AND properties->>'funnel_name' = ${funnelName}
        ORDER BY funnel_step_order ASC
      `;
            return steps.map(step => ({
                stepName: step.step_name,
                stepOrder: step.step_order,
                completedAt: step.completed_at,
                properties: step.properties
            }));
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_user_funnel_progress',
                userId: this.hashUserId(userId),
                funnelName
            });
            throw error;
        }
    }
    async createCohort(definition) {
        try {
            const cohortUsers = [];
            logger_1.analyticsLogger.event('cohort_created', {
                cohortName: definition.name,
                userCount: cohortUsers.length
            });
            return cohortUsers;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'create_cohort',
                cohortName: definition.name
            });
            throw error;
        }
    }
    async trackMixpanelEvent(userId, eventName, properties) {
        if (!this.mixpanel)
            return;
        return new Promise((resolve, reject) => {
            this.mixpanel.track(eventName, {
                distinct_id: userId,
                ...properties,
                time: Date.now()
            }, (error) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async trackAmplitudeEvent(userId, eventName, properties, context) {
        if (!this.amplitude)
            return;
        await this.amplitude.track({
            user_id: userId,
            event_type: eventName,
            event_properties: properties,
            time: Date.now(),
            ip: context.ip ? this.anonymizeIp(context.ip) : undefined,
            platform: context.platform || 'web',
            user_agent: context.userAgent?.substring(0, 100)
        });
    }
    async trackSegmentEvent(userId, eventName, properties, context) {
        if (!this.segment)
            return;
        this.segment.track({
            userId,
            event: eventName,
            properties,
            timestamp: new Date(),
            context: {
                ip: context.ip ? this.anonymizeIp(context.ip) : undefined,
                userAgent: context.userAgent?.substring(0, 100),
                page: context.page ? {
                    url: context.page.url,
                    title: context.page.title
                } : undefined
            }
        });
    }
    async enrichEvent(userId, eventName, properties, context) {
        const enriched = {
            ...properties,
            timestamp: new Date().toISOString(),
            event_id: crypto.randomUUID(),
            session_id: context.sessionId,
            user_agent: context.userAgent?.substring(0, 100),
            platform: context.platform || 'web',
            page_url: context.page?.url,
            referrer: context.page?.referrer
        };
        try {
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { subscriptionTier: true }
            });
            if (user) {
                enriched.subscription_tier = user.subscriptionTier;
            }
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'enrich_event_user_lookup' });
        }
        return enriched;
    }
    async storeEventLocally(userId, eventName, properties, context) {
        try {
            await this.prisma.$executeRaw `
        INSERT INTO analytics_events (
          id, user_id, event_name, properties, context, created_at
        ) VALUES (
          ${crypto.randomUUID()},
          ${userId},
          ${eventName},
          ${JSON.stringify(properties)},
          ${JSON.stringify(context)},
          NOW()
        )
      `;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'store_event_locally' });
        }
    }
    async storeFunnelStep(userId, funnelName, stepName, stepOrder, properties) {
        try {
            await this.prisma.$executeRaw `
        INSERT INTO funnel_steps (
          id, user_id, funnel_name, step_name, step_order, properties, created_at
        ) VALUES (
          ${crypto.randomUUID()},
          ${userId},
          ${funnelName},
          ${stepName},
          ${stepOrder},
          ${JSON.stringify(properties)},
          NOW()
        )
        ON CONFLICT (user_id, funnel_name, step_name) 
        DO UPDATE SET 
          properties = ${JSON.stringify(properties)},
          created_at = NOW()
      `;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'store_funnel_step' });
        }
    }
    sanitizeUserProperties(properties) {
        const sanitized = { ...properties };
        delete sanitized.email;
        delete sanitized.phone;
        delete sanitized.firstName;
        delete sanitized.lastName;
        delete sanitized.address;
        return {
            subscription_tier: sanitized.subscriptionTier,
            created_at: sanitized.createdAt,
            timezone: sanitized.timezone,
            language: sanitized.language,
            user_type: sanitized.userType,
            plan_type: sanitized.planType
        };
    }
    anonymizeIp(ip) {
        if (ip.includes('.')) {
            return ip.split('.').slice(0, 3).join('.') + '.0';
        }
        else if (ip.includes(':')) {
            return ip.split(':').slice(0, 4).join(':') + '::';
        }
        return ip;
    }
    hashUserId(userId) {
        return Buffer.from(userId).toString('base64').substring(0, 8);
    }
    async flush() {
        try {
            if (this.segment) {
                await this.segment.closeAndFlush();
            }
            logger_1.analyticsLogger.event('analytics_flushed', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'flush_analytics' });
        }
    }
    async shutdown() {
        try {
            await this.flush();
            await this.prisma.$disconnect();
            logger_1.analyticsLogger.event('analytics_shutdown', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'shutdown_analytics' });
        }
    }
}
exports.productAnalyticsService = new ProductAnalyticsService();
//# sourceMappingURL=product-analytics.js.map