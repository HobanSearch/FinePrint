"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userBehaviorAnalyticsService = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("@/utils/logger");
const product_analytics_1 = require("@/services/product-analytics");
class UserBehaviorAnalyticsService {
    prisma;
    predefinedFunnels = new Map();
    activeSegments = new Map();
    constructor() {
        this.prisma = new client_1.PrismaClient();
        this.initializeFunnels();
    }
    initializeFunnels() {
        const onboardingFunnel = {
            name: 'User Onboarding',
            description: 'User onboarding flow from signup to first document analysis',
            steps: [
                {
                    name: 'Signup',
                    order: 1,
                    eventName: 'User Registered',
                    conditions: []
                },
                {
                    name: 'Email Verification',
                    order: 2,
                    eventName: 'Email Verified',
                    conditions: []
                },
                {
                    name: 'First Login',
                    order: 3,
                    eventName: 'User Login',
                    conditions: []
                },
                {
                    name: 'First Document Upload',
                    order: 4,
                    eventName: 'Document Uploaded',
                    conditions: []
                },
                {
                    name: 'First Analysis',
                    order: 5,
                    eventName: 'Analysis Completed',
                    conditions: []
                }
            ],
            timeWindow: 168,
            conversionGoal: 'First Analysis'
        };
        const subscriptionFunnel = {
            name: 'Subscription Conversion',
            description: 'Free to paid subscription conversion funnel',
            steps: [
                {
                    name: 'Trial Started',
                    order: 1,
                    eventName: 'Trial Started',
                    conditions: []
                },
                {
                    name: 'Feature Used',
                    order: 2,
                    eventName: 'Feature Engagement',
                    conditions: [
                        { property: 'feature', operator: 'in', value: ['analysis', 'monitoring', 'actions'] }
                    ]
                },
                {
                    name: 'Pricing Page Viewed',
                    order: 3,
                    eventName: 'Page Viewed',
                    conditions: [
                        { property: 'page_url', operator: 'contains', value: '/pricing' }
                    ]
                },
                {
                    name: 'Subscription Selected',
                    order: 4,
                    eventName: 'Subscription Selected',
                    conditions: []
                },
                {
                    name: 'Payment Completed',
                    order: 5,
                    eventName: 'Conversion',
                    conditions: [
                        { property: 'conversion_type', operator: 'equals', value: 'subscription' }
                    ]
                }
            ],
            timeWindow: 336,
            conversionGoal: 'Payment Completed'
        };
        this.predefinedFunnels.set('onboarding', onboardingFunnel);
        this.predefinedFunnels.set('subscription', subscriptionFunnel);
    }
    async analyzeFunnel(funnelName, timeRange, segmentCriteria) {
        try {
            const funnel = this.predefinedFunnels.get(funnelName);
            if (!funnel) {
                throw new Error(`Funnel not found: ${funnelName}`);
            }
            const funnelUsers = await this.getFunnelUsers(funnel, timeRange, segmentCriteria);
            const stepAnalyses = [];
            let previousStepUsers = funnelUsers.length;
            for (const step of funnel.steps) {
                const stepUsers = await this.getStepUsers(funnel, step, timeRange, funnelUsers);
                const conversionRate = previousStepUsers > 0 ? stepUsers.length / previousStepUsers : 0;
                const dropOffRate = 1 - conversionRate;
                const avgTimeFromPrevious = await this.calculateAvgTimeBetweenSteps(funnel, step.order - 1, step.order, timeRange, stepUsers);
                stepAnalyses.push({
                    stepName: step.name,
                    stepOrder: step.order,
                    userCount: stepUsers.length,
                    conversionRate,
                    dropOffRate,
                    averageTimeFromPrevious: avgTimeFromPrevious
                });
                previousStepUsers = stepUsers.length;
            }
            const finalStepUsers = stepAnalyses[stepAnalyses.length - 1]?.userCount || 0;
            const overallConversionRate = funnelUsers.length > 0 ? finalStepUsers / funnelUsers.length : 0;
            const averageTimeToConvert = await this.calculateAverageTimeToConvert(funnel, timeRange, funnelUsers);
            const analysis = {
                funnelName,
                totalUsers: funnelUsers.length,
                steps: stepAnalyses,
                overallConversionRate,
                averageTimeToConvert
            };
            await product_analytics_1.productAnalyticsService.trackEvent('system', 'Funnel Analysis Completed', {
                funnel_name: funnelName,
                total_users: funnelUsers.length,
                overall_conversion_rate: overallConversionRate,
                time_range: `${timeRange.start.toISOString()}_${timeRange.end.toISOString()}`
            });
            return analysis;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'analyze_funnel',
                funnelName
            });
            throw error;
        }
    }
    async analyzeCohort(cohortDefinition, timeRange) {
        try {
            const cohortUsers = await this.getCohortUsers(cohortDefinition, timeRange);
            const retentionData = [];
            for (let period = 0; period < cohortDefinition.timeframe.periods; period++) {
                const periodStart = this.calculatePeriodStart(timeRange.start, period, cohortDefinition.timeframe.unit);
                const periodEnd = this.calculatePeriodEnd(periodStart, cohortDefinition.timeframe.unit);
                const activeUsersInPeriod = await this.getActiveUsersInPeriod(cohortUsers, periodStart, periodEnd);
                const retentionRate = cohortUsers.length > 0 ?
                    activeUsersInPeriod.length / cohortUsers.length : 0;
                retentionData.push({
                    period,
                    userCount: activeUsersInPeriod.length,
                    retentionRate
                });
            }
            const analysis = {
                cohortName: cohortDefinition.name,
                cohortSize: cohortUsers.length,
                timeframe: cohortDefinition.timeframe,
                retentionData
            };
            await product_analytics_1.productAnalyticsService.trackEvent('system', 'Cohort Analysis Completed', {
                cohort_name: cohortDefinition.name,
                cohort_size: cohortUsers.length,
                retention_periods: cohortDefinition.timeframe.periods
            });
            return analysis;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'analyze_cohort',
                cohortName: cohortDefinition.name
            });
            throw error;
        }
    }
    async analyzeUserJourneys(timeRange, segmentCriteria) {
        try {
            const sessions = await this.getUserSessions(timeRange, segmentCriteria);
            const journeys = [];
            for (const session of sessions) {
                const touchpoints = await this.getSessionTouchpoints(session.sessionId, timeRange);
                if (touchpoints.length === 0)
                    continue;
                const totalDuration = session.endTime ?
                    session.endTime.getTime() - session.startTime.getTime() : 0;
                const conversionPath = touchpoints
                    .filter(tp => tp.type === 'conversion')
                    .map(tp => tp.name);
                const dropOffPoint = await this.identifyDropOffPoint(touchpoints);
                journeys.push({
                    userId: session.userId,
                    sessionId: session.sessionId,
                    touchpoints,
                    totalDuration,
                    conversionPath,
                    dropOffPoint
                });
            }
            await product_analytics_1.productAnalyticsService.trackEvent('system', 'User Journey Analysis Completed', {
                session_count: sessions.length,
                journey_count: journeys.length,
                avg_touchpoints: journeys.reduce((sum, j) => sum + j.touchpoints.length, 0) / journeys.length,
                conversion_rate: journeys.filter(j => j.conversionPath.length > 0).length / journeys.length
            });
            return journeys;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'analyze_user_journeys'
            });
            throw error;
        }
    }
    async getFeatureAdoptionRates(features, timeRange) {
        try {
            const adoptionRates = {};
            const totalActiveUsers = await this.prisma.$queryRaw `
        SELECT COUNT(DISTINCT user_id) as count
        FROM analytics_events
        WHERE created_at >= ${timeRange.start}
          AND created_at <= ${timeRange.end}
      `;
            const totalUsers = Number(totalActiveUsers[0]?.count || 0);
            for (const feature of features) {
                const featureUsers = await this.prisma.$queryRaw `
          SELECT COUNT(DISTINCT user_id) as count
          FROM analytics_events
          WHERE event_name = 'Feature Engagement'
            AND properties->>'feature' = ${feature}
            AND created_at >= ${timeRange.start}
            AND created_at <= ${timeRange.end}
        `;
                const userCount = Number(featureUsers[0]?.count || 0);
                adoptionRates[feature] = totalUsers > 0 ? userCount / totalUsers : 0;
            }
            return adoptionRates;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_feature_adoption_rates',
                features
            });
            throw error;
        }
    }
    async createUserSegment(name, description, criteria) {
        try {
            const segmentId = crypto.randomUUID();
            const users = await this.getUsersMatchingCriteria(criteria);
            const avgLifetimeValue = await this.calculateAvgLifetimeValue(users);
            const conversionRate = await this.calculateSegmentConversionRate(users);
            const churnRate = await this.calculateSegmentChurnRate(users);
            const segment = {
                id: segmentId,
                name,
                description,
                criteria,
                userCount: users.length,
                avgLifetimeValue,
                conversionRate,
                churnRate
            };
            this.activeSegments.set(segmentId, segment);
            await this.storeUserSegment(segment);
            await product_analytics_1.productAnalyticsService.trackEvent('system', 'User Segment Created', {
                segment_id: segmentId,
                segment_name: name,
                user_count: users.length,
                criteria_count: criteria.length
            });
            return segmentId;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'create_user_segment',
                name
            });
            throw error;
        }
    }
    async getUserBehaviorPatterns(userId, timeRange) {
        try {
            const events = await this.prisma.$queryRaw `
        SELECT 
          event_name,
          properties,
          created_at,
          context
        FROM analytics_events
        WHERE user_id = ${userId}
          AND created_at >= ${timeRange.start}
          AND created_at <= ${timeRange.end}
        ORDER BY created_at ASC
      `;
            const patterns = {
                totalEvents: events.length,
                uniqueEvents: new Set(events.map((e) => e.event_name)).size,
                sessionCount: await this.getUserSessionCount(userId, timeRange),
                avgSessionDuration: await this.getAvgSessionDuration(userId, timeRange),
                mostUsedFeatures: await this.getMostUsedFeatures(userId, timeRange),
                conversionEvents: events.filter((e) => e.event_name === 'Conversion').length,
                lastActivity: events.length > 0 ? events[events.length - 1].created_at : null,
                activityTimeline: await this.getActivityTimeline(userId, timeRange),
                engagement_score: await this.calculateEngagementScore(userId, timeRange)
            };
            return patterns;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, {
                context: 'get_user_behavior_patterns',
                userId
            });
            throw error;
        }
    }
    async getFunnelUsers(funnel, timeRange, segmentCriteria) {
        const firstStep = funnel.steps[0];
        let query = `
      SELECT DISTINCT user_id
      FROM analytics_events
      WHERE event_name = $1
        AND created_at >= $2
        AND created_at <= $3
    `;
        const params = [firstStep.eventName, timeRange.start, timeRange.end];
        if (segmentCriteria && segmentCriteria.length > 0) {
        }
        const results = await this.prisma.$queryRawUnsafe(query, ...params);
        return results.map((r) => r.user_id);
    }
    async getStepUsers(funnel, step, timeRange, funnelUsers) {
        if (funnelUsers.length === 0)
            return [];
        let query = `
      SELECT DISTINCT user_id
      FROM analytics_events
      WHERE event_name = $1
        AND user_id = ANY($2::uuid[])
        AND created_at >= $3
        AND created_at <= $4
    `;
        if (step.conditions && step.conditions.length > 0) {
        }
        const results = await this.prisma.$queryRawUnsafe(query, step.eventName, funnelUsers, timeRange.start, timeRange.end);
        return results.map((r) => r.user_id);
    }
    async calculateAvgTimeBetweenSteps(funnel, prevStepOrder, currentStepOrder, timeRange, stepUsers) {
        if (prevStepOrder < 1 || stepUsers.length === 0)
            return 0;
        const prevStep = funnel.steps.find(s => s.order === prevStepOrder);
        const currentStep = funnel.steps.find(s => s.order === currentStepOrder);
        if (!prevStep || !currentStep)
            return 0;
        const durations = await this.prisma.$queryRaw `
      WITH step_times AS (
        SELECT 
          user_id,
          MIN(CASE WHEN event_name = ${prevStep.eventName} THEN created_at END) as prev_step_time,
          MIN(CASE WHEN event_name = ${currentStep.eventName} THEN created_at END) as current_step_time
        FROM analytics_events
        WHERE user_id = ANY(${stepUsers}::uuid[])
          AND event_name IN (${prevStep.eventName}, ${currentStep.eventName})
          AND created_at >= ${timeRange.start}
          AND created_at <= ${timeRange.end}
        GROUP BY user_id
        HAVING MIN(CASE WHEN event_name = ${prevStep.eventName} THEN created_at END) IS NOT NULL
           AND MIN(CASE WHEN event_name = ${currentStep.eventName} THEN created_at END) IS NOT NULL
      )
      SELECT AVG(EXTRACT(EPOCH FROM (current_step_time - prev_step_time)) * 1000) as avg_duration_ms
      FROM step_times
      WHERE current_step_time > prev_step_time
    `;
        return Number(durations[0]?.avg_duration_ms || 0);
    }
    async calculateAverageTimeToConvert(funnel, timeRange, funnelUsers) {
        const firstStep = funnel.steps[0];
        const lastStep = funnel.steps[funnel.steps.length - 1];
        const durations = await this.prisma.$queryRaw `
      WITH conversion_times AS (
        SELECT 
          user_id,
          MIN(CASE WHEN event_name = ${firstStep.eventName} THEN created_at END) as start_time,
          MIN(CASE WHEN event_name = ${lastStep.eventName} THEN created_at END) as end_time
        FROM analytics_events
        WHERE user_id = ANY(${funnelUsers}::uuid[])
          AND event_name IN (${firstStep.eventName}, ${lastStep.eventName})
          AND created_at >= ${timeRange.start}
          AND created_at <= ${timeRange.end}
        GROUP BY user_id
        HAVING MIN(CASE WHEN event_name = ${firstStep.eventName} THEN created_at END) IS NOT NULL
           AND MIN(CASE WHEN event_name = ${lastStep.eventName} THEN created_at END) IS NOT NULL
      )
      SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time)) * 1000) as avg_duration_ms
      FROM conversion_times
      WHERE end_time > start_time
    `;
        return Number(durations[0]?.avg_duration_ms || 0);
    }
    async getCohortUsers(cohortDefinition, timeRange) {
        if (cohortDefinition.criteria.eventName) {
            const results = await this.prisma.$queryRaw `
        SELECT DISTINCT user_id
        FROM analytics_events
        WHERE event_name = ${cohortDefinition.criteria.eventName}
          AND created_at >= ${timeRange.start}
          AND created_at <= ${timeRange.end}
      `;
            return results.map((r) => r.user_id);
        }
        return [];
    }
    calculatePeriodStart(baseDate, period, unit) {
        const date = new Date(baseDate);
        switch (unit) {
            case 'day':
                date.setDate(date.getDate() + period);
                break;
            case 'week':
                date.setDate(date.getDate() + (period * 7));
                break;
            case 'month':
                date.setMonth(date.getMonth() + period);
                break;
        }
        return date;
    }
    calculatePeriodEnd(startDate, unit) {
        const date = new Date(startDate);
        switch (unit) {
            case 'day':
                date.setDate(date.getDate() + 1);
                break;
            case 'week':
                date.setDate(date.getDate() + 7);
                break;
            case 'month':
                date.setMonth(date.getMonth() + 1);
                break;
        }
        return date;
    }
    async getActiveUsersInPeriod(cohortUsers, periodStart, periodEnd) {
        if (cohortUsers.length === 0)
            return [];
        const results = await this.prisma.$queryRaw `
      SELECT DISTINCT user_id
      FROM analytics_events
      WHERE user_id = ANY(${cohortUsers}::uuid[])
        AND created_at >= ${periodStart}
        AND created_at < ${periodEnd}
    `;
        return results.map((r) => r.user_id);
    }
    async getUserSessions(timeRange, segmentCriteria) {
        const sessions = await this.prisma.$queryRaw `
      SELECT DISTINCT
        context->>'sessionId' as session_id,
        user_id,
        MIN(created_at) as start_time,
        MAX(created_at) as end_time,
        COUNT(CASE WHEN event_name = 'Page Viewed' THEN 1 END) as page_views,
        COUNT(*) as events,
        COUNT(CASE WHEN event_name = 'Conversion' THEN 1 END) as conversion_events
      FROM analytics_events
      WHERE created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
        AND context->>'sessionId' IS NOT NULL
      GROUP BY context->>'sessionId', user_id
      HAVING COUNT(*) > 1
    `;
        return sessions.map((s) => ({
            sessionId: s.session_id,
            userId: s.user_id,
            startTime: s.start_time,
            endTime: s.end_time,
            pageViews: Number(s.page_views),
            events: Number(s.events),
            conversionEvents: Number(s.conversion_events),
            deviceType: 'unknown',
            browser: 'unknown',
            bounced: Number(s.page_views) <= 1
        }));
    }
    async getSessionTouchpoints(sessionId, timeRange) {
        const events = await this.prisma.$queryRaw `
      SELECT 
        event_name,
        properties,
        created_at,
        CASE 
          WHEN event_name = 'Page Viewed' THEN 'page_view'
          WHEN event_name = 'Conversion' THEN 'conversion'
          ELSE 'event'
        END as type
      FROM analytics_events
      WHERE context->>'sessionId' = ${sessionId}
        AND created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
      ORDER BY created_at ASC
    `;
        return events.map((e) => ({
            timestamp: e.created_at,
            type: e.type,
            name: e.event_name,
            properties: e.properties || {}
        }));
    }
    async identifyDropOffPoint(touchpoints) {
        if (touchpoints.length === 0)
            return undefined;
        const lastTouchpoint = touchpoints[touchpoints.length - 1];
        return lastTouchpoint.type !== 'conversion' ? lastTouchpoint.name : undefined;
    }
    async getUsersMatchingCriteria(criteria) {
        return [];
    }
    async calculateAvgLifetimeValue(users) {
        return 0;
    }
    async calculateSegmentConversionRate(users) {
        return 0;
    }
    async calculateSegmentChurnRate(users) {
        return 0;
    }
    async storeUserSegment(segment) {
        try {
            await this.prisma.$executeRaw `
        INSERT INTO user_segments (
          id, name, description, criteria, user_count, 
          avg_lifetime_value, conversion_rate, churn_rate
        ) VALUES (
          ${segment.id}, ${segment.name}, ${segment.description},
          ${JSON.stringify(segment.criteria)}, ${segment.userCount},
          ${segment.avgLifetimeValue}, ${segment.conversionRate}, ${segment.churnRate}
        )
      `;
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'store_user_segment' });
        }
    }
    async getUserSessionCount(userId, timeRange) {
        const result = await this.prisma.$queryRaw `
      SELECT COUNT(DISTINCT context->>'sessionId') as count
      FROM analytics_events
      WHERE user_id = ${userId}
        AND created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
        AND context->>'sessionId' IS NOT NULL
    `;
        return Number(result[0]?.count || 0);
    }
    async getAvgSessionDuration(userId, timeRange) {
        const result = await this.prisma.$queryRaw `
      SELECT AVG(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 1000) as avg_duration_ms
      FROM analytics_events
      WHERE user_id = ${userId}
        AND created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
        AND context->>'sessionId' IS NOT NULL
      GROUP BY context->>'sessionId'
      HAVING COUNT(*) > 1
    `;
        return Number(result[0]?.avg_duration_ms || 0);
    }
    async getMostUsedFeatures(userId, timeRange) {
        const results = await this.prisma.$queryRaw `
      SELECT 
        properties->>'feature' as feature,
        COUNT(*) as usage_count
      FROM analytics_events
      WHERE user_id = ${userId}
        AND event_name = 'Feature Engagement'
        AND created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
        AND properties->>'feature' IS NOT NULL
      GROUP BY properties->>'feature'
      ORDER BY usage_count DESC
      LIMIT 10
    `;
        return results.reduce((acc, row) => {
            if (row.feature) {
                acc[row.feature] = Number(row.usage_count);
            }
            return acc;
        }, {});
    }
    async getActivityTimeline(userId, timeRange) {
        const results = await this.prisma.$queryRaw `
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as event_count,
        COUNT(DISTINCT event_name) as unique_events
      FROM analytics_events
      WHERE user_id = ${userId}
        AND created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `;
        return results.map((row) => ({
            date: row.date,
            eventCount: Number(row.event_count),
            uniqueEvents: Number(row.unique_events)
        }));
    }
    async calculateEngagementScore(userId, timeRange) {
        const metrics = await this.prisma.$queryRaw `
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT DATE_TRUNC('day', created_at)) as active_days,
        COUNT(DISTINCT event_name) as unique_events,
        COUNT(CASE WHEN event_name = 'Feature Engagement' THEN 1 END) as feature_engagements
      FROM analytics_events
      WHERE user_id = ${userId}
        AND created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
    `;
        const data = metrics[0] || {};
        const totalEvents = Number(data.total_events || 0);
        const activeDays = Number(data.active_days || 0);
        const uniqueEvents = Number(data.unique_events || 0);
        const featureEngagements = Number(data.feature_engagements || 0);
        const score = Math.min((totalEvents * 0.3) +
            (activeDays * 5) +
            (uniqueEvents * 2) +
            (featureEngagements * 1.5), 100);
        return Math.round(score);
    }
    getPredefinedFunnels() {
        return Array.from(this.predefinedFunnels.values());
    }
    getActiveSegments() {
        return Array.from(this.activeSegments.values());
    }
    async shutdown() {
        try {
            await this.prisma.$disconnect();
            logger_1.analyticsLogger.event('user_behavior_analytics_shutdown', {});
        }
        catch (error) {
            logger_1.analyticsLogger.error(error, { context: 'user_behavior_shutdown' });
        }
    }
}
exports.userBehaviorAnalyticsService = new UserBehaviorAnalyticsService();
//# sourceMappingURL=user-behavior.js.map