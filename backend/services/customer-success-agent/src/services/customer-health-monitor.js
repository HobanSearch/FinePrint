"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerHealthMonitor = void 0;
const client_1 = require("@prisma/client");
const openai_1 = __importDefault(require("openai"));
class CustomerHealthMonitor {
    prisma;
    openai;
    constructor() {
        this.prisma = new client_1.PrismaClient();
        this.openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY || '' });
    }
    async calculateHealthScore(customerId) {
        const customer = await this.getCustomerWithMetrics(customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }
        const factors = {
            usage: await this.calculateUsageFactor(customer),
            engagement: await this.calculateEngagementFactor(customer),
            support: await this.calculateSupportFactor(customer),
            billing: await this.calculateBillingFactor(customer),
        };
        const healthScore = this.calculateOverallHealth(factors);
        const riskLevel = this.determineRiskLevel(healthScore);
        const recommendations = await this.generateRecommendations(customer, factors);
        const trend = await this.calculateTrend(customerId);
        await this.prisma.customer.update({
            where: { id: customerId },
            data: {
                healthScore,
                riskLevel,
                updatedAt: new Date(),
            },
        });
        return {
            healthScore,
            riskLevel,
            factors,
            recommendations,
            trend,
        };
    }
    async predictChurnRisk(customerId) {
        const customer = await this.getCustomerWithMetrics(customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }
        const features = await this.extractChurnFeatures(customer);
        const churnProbability = await this.calculateChurnProbability(features);
        const factors = this.identifyChurnFactors(features);
        const prediction = {
            id: `churn_${customerId}_${Date.now()}`,
            type: 'churn',
            entityId: customerId,
            entityType: 'customer',
            prediction: churnProbability,
            confidence: this.calculateConfidence(features),
            factors,
            modelVersion: '1.0',
            createdAt: new Date(),
            validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        };
        await this.storePrediction(prediction);
        return prediction;
    }
    async identifyExpansionOpportunities(customerId) {
        const customer = await this.getCustomerWithMetrics(customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }
        const opportunities = [];
        if (this.isHighUsage(customer.usageMetrics)) {
            opportunities.push({
                type: 'upgrade',
                description: 'Customer showing high usage - ready for tier upgrade',
                estimatedValue: customer.mrr * 2,
                probability: 80,
                timeline: '30 days',
            });
        }
        const unadoptedFeatures = this.getUnadoptedFeatures(customer.usageMetrics.featureAdoption);
        if (unadoptedFeatures.length > 0) {
            opportunities.push({
                type: 'add_feature',
                description: `Expand to unused features: ${unadoptedFeatures.join(', ')}`,
                estimatedValue: unadoptedFeatures.length * 1000,
                probability: 60,
                timeline: '60 days',
            });
        }
        if (this.indicatesTeamGrowth(customer.usageMetrics)) {
            opportunities.push({
                type: 'add_seats',
                description: 'Team growth indicators suggest need for additional seats',
                estimatedValue: customer.mrr * 0.5,
                probability: 70,
                timeline: '45 days',
            });
        }
        return opportunities;
    }
    async getCustomerInsights(customerId) {
        const customer = await this.getCustomerWithMetrics(customerId);
        if (!customer) {
            throw new Error('Customer not found');
        }
        const insights = await this.generateAIInsights(customer);
        return {
            customer_summary: insights.summary,
            key_behaviors: insights.behaviors,
            success_indicators: insights.successIndicators,
            risk_factors: insights.riskFactors,
            recommendations: insights.recommendations,
            next_actions: insights.nextActions,
        };
    }
    async getCustomerWithMetrics(customerId) {
        return await this.prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                primaryContact: true,
                usageMetrics: true,
                supportTickets: {
                    where: {
                        createdAt: {
                            gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
                expansionOpportunities: true,
            },
        });
    }
    async calculateUsageFactor(customer) {
        const usage = customer.usageMetrics;
        if (!usage)
            return 0;
        let score = 0;
        const expectedMonthlyAnalyses = this.getExpectedUsage(customer.tier);
        const usageRatio = usage.documentsAnalyzed / expectedMonthlyAnalyses;
        score += Math.min(usageRatio * 30, 30);
        const adoptedFeatures = Object.values(usage.featureAdoption).filter(Boolean).length;
        const totalFeatures = Object.keys(usage.featureAdoption).length;
        score += (adoptedFeatures / totalFeatures) * 20;
        if (usage.lastAnalysis) {
            const daysSinceLastUse = (Date.now() - new Date(usage.lastAnalysis).getTime()) / (24 * 60 * 60 * 1000);
            if (daysSinceLastUse < 7)
                score += 15;
            else if (daysSinceLastUse < 30)
                score += 10;
            else if (daysSinceLastUse < 60)
                score += 5;
        }
        if (usage.apiCalls > 0) {
            score += Math.min(usage.apiCalls / 1000 * 10, 10);
        }
        return Math.min(score, 75);
    }
    async calculateEngagementFactor(customer) {
        let score = 0;
        if (customer.lastLogin) {
            const daysSinceLogin = (Date.now() - new Date(customer.lastLogin).getTime()) / (24 * 60 * 60 * 1000);
            if (daysSinceLogin < 7)
                score += 20;
            else if (daysSinceLogin < 30)
                score += 15;
            else if (daysSinceLogin < 60)
                score += 10;
            else if (daysSinceLogin < 90)
                score += 5;
        }
        const usage = customer.usageMetrics;
        if (usage && usage.activeUsers > 0) {
            const seatUtilization = usage.activeUsers / (usage.totalSeats || usage.activeUsers);
            score += seatUtilization * 15;
        }
        if (usage && usage.timeSpentInApp > 0) {
            const avgMinutesPerUser = usage.timeSpentInApp / Math.max(usage.activeUsers, 1);
            if (avgMinutesPerUser > 60)
                score += 10;
            else if (avgMinutesPerUser > 30)
                score += 7;
            else if (avgMinutesPerUser > 15)
                score += 5;
        }
        return Math.min(score, 45);
    }
    async calculateSupportFactor(customer) {
        const tickets = customer.supportTickets || [];
        let score = 50;
        const recentTickets = tickets.filter(t => new Date(t.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
        if (recentTickets.length > 5)
            score -= 20;
        else if (recentTickets.length > 3)
            score -= 10;
        else if (recentTickets.length > 1)
            score -= 5;
        const criticalTickets = recentTickets.filter(t => t.priority === 'critical' || t.priority === 'high');
        score -= criticalTickets.length * 10;
        const resolvedTickets = tickets.filter(t => t.status === 'resolved' && t.satisfaction);
        if (resolvedTickets.length > 0) {
            const avgSatisfaction = resolvedTickets.reduce((sum, t) => sum + (t.satisfaction || 0), 0) / resolvedTickets.length;
            if (avgSatisfaction >= 4)
                score += 10;
            else if (avgSatisfaction >= 3)
                score += 5;
            else if (avgSatisfaction < 2)
                score -= 15;
        }
        const oldOpenTickets = tickets.filter(t => t.status === 'open' &&
            new Date(t.createdAt) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
        score -= oldOpenTickets.length * 5;
        return Math.max(0, Math.min(score, 50));
    }
    async calculateBillingFactor(customer) {
        let score = 50;
        const daysSinceRenewal = (Date.now() - new Date(customer.startDate).getTime()) / (24 * 60 * 60 * 1000);
        const daysUntilRenewal = (new Date(customer.renewalDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        if (daysUntilRenewal < 30) {
            score -= 10;
        }
        const contractLength = (new Date(customer.renewalDate).getTime() - new Date(customer.startDate).getTime()) / (365 * 24 * 60 * 60 * 1000);
        if (contractLength >= 1)
            score += 10;
        else if (contractLength >= 0.5)
            score += 5;
        if (customer.tier === 'enterprise')
            score += 15;
        else if (customer.tier === 'professional')
            score += 10;
        else if (customer.tier === 'team')
            score += 5;
        return Math.max(0, Math.min(score, 50));
    }
    calculateOverallHealth(factors) {
        const weights = {
            usage: 0.35,
            engagement: 0.25,
            support: 0.20,
            billing: 0.20,
        };
        const totalScore = factors.usage * weights.usage +
            factors.engagement * weights.engagement +
            factors.support * weights.support +
            factors.billing * weights.billing;
        return Math.round(totalScore);
    }
    determineRiskLevel(healthScore) {
        if (healthScore >= 80)
            return 'low';
        if (healthScore >= 60)
            return 'medium';
        if (healthScore >= 40)
            return 'high';
        return 'critical';
    }
    async generateRecommendations(customer, factors) {
        const recommendations = [];
        if (factors.usage < 20) {
            recommendations.push('Schedule usage review call to understand barriers to adoption');
            recommendations.push('Provide additional training on key features');
        }
        if (factors.engagement < 15) {
            recommendations.push('Increase touchpoints with key stakeholders');
            recommendations.push('Review onboarding process and provide refresher training');
        }
        if (factors.support < 30) {
            recommendations.push('Proactive support outreach to address ongoing issues');
            recommendations.push('Executive escalation for critical issues');
        }
        if (factors.billing < 30) {
            recommendations.push('Early renewal discussion to address concerns');
            recommendations.push('Value demonstration session');
        }
        const aiRecommendations = await this.getAIRecommendations(customer, factors);
        recommendations.push(...aiRecommendations);
        return recommendations;
    }
    async calculateTrend(customerId) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: { lastLogin: true, usageMetrics: true },
        });
        if (!customer)
            return 'stable';
        if (customer.lastLogin && new Date(customer.lastLogin) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
            return 'improving';
        }
        if (!customer.lastLogin || new Date(customer.lastLogin) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
            return 'declining';
        }
        return 'stable';
    }
    async extractChurnFeatures(customer) {
        return {
            daysAsCustomer: (Date.now() - new Date(customer.startDate).getTime()) / (24 * 60 * 60 * 1000),
            daysUntilRenewal: (new Date(customer.renewalDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
            mrr: customer.mrr,
            tier: customer.tier,
            usageFrequency: customer.usageMetrics?.documentsAnalyzed || 0,
            lastLoginDays: customer.lastLogin ? (Date.now() - new Date(customer.lastLogin).getTime()) / (24 * 60 * 60 * 1000) : 999,
            supportTicketCount: customer.supportTickets?.length || 0,
            criticalTickets: customer.supportTickets?.filter((t) => t.priority === 'critical').length || 0,
            featureAdoptionRate: this.calculateFeatureAdoptionRate(customer.usageMetrics?.featureAdoption),
        };
    }
    async calculateChurnProbability(features) {
        let churnScore = 0;
        if (features.lastLoginDays > 30)
            churnScore += 25;
        else if (features.lastLoginDays > 14)
            churnScore += 15;
        else if (features.lastLoginDays > 7)
            churnScore += 10;
        if (features.criticalTickets > 2)
            churnScore += 20;
        else if (features.criticalTickets > 0)
            churnScore += 10;
        if (features.supportTicketCount > 5)
            churnScore += 15;
        const expectedUsage = this.getExpectedUsage(features.tier);
        const usageRatio = features.usageFrequency / expectedUsage;
        if (usageRatio < 0.2)
            churnScore += 20;
        else if (usageRatio < 0.5)
            churnScore += 10;
        if (features.featureAdoptionRate < 0.3)
            churnScore += 15;
        else if (features.featureAdoptionRate < 0.5)
            churnScore += 5;
        if (features.daysUntilRenewal < 30 && churnScore > 30)
            churnScore += 10;
        return Math.min(churnScore, 100) / 100;
    }
    calculateConfidence(features) {
        let confidence = 0.5;
        if (features.lastLoginDays < 30)
            confidence += 0.2;
        if (features.usageFrequency > 0)
            confidence += 0.2;
        if (features.supportTicketCount >= 0)
            confidence += 0.1;
        return Math.min(confidence, 1.0);
    }
    identifyChurnFactors(features) {
        const factors = [];
        if (features.lastLoginDays > 30) {
            factors.push({
                name: 'Low Engagement',
                value: features.lastLoginDays,
                impact: -0.25,
                description: `${Math.round(features.lastLoginDays)} days since last login`,
            });
        }
        if (features.criticalTickets > 0) {
            factors.push({
                name: 'Critical Support Issues',
                value: features.criticalTickets,
                impact: -0.20,
                description: `${features.criticalTickets} critical support tickets`,
            });
        }
        const expectedUsage = this.getExpectedUsage(features.tier);
        const usageRatio = features.usageFrequency / expectedUsage;
        if (usageRatio < 0.5) {
            factors.push({
                name: 'Low Usage',
                value: usageRatio,
                impact: -0.15,
                description: `Using ${Math.round(usageRatio * 100)}% of expected capacity`,
            });
        }
        if (features.featureAdoptionRate < 0.5) {
            factors.push({
                name: 'Low Feature Adoption',
                value: features.featureAdoptionRate,
                impact: -0.10,
                description: `Only using ${Math.round(features.featureAdoptionRate * 100)}% of available features`,
            });
        }
        return factors;
    }
    async storePrediction(prediction) {
        await this.prisma.prediction.create({
            data: prediction,
        });
    }
    getExpectedUsage(tier) {
        const expectedUsage = {
            free: 3,
            starter: 20,
            professional: 100,
            team: 500,
            enterprise: 1000,
        };
        return expectedUsage[tier] || 50;
    }
    calculateFeatureAdoptionRate(featureAdoption = {}) {
        const features = Object.values(featureAdoption);
        if (features.length === 0)
            return 0;
        const adoptedCount = features.filter(Boolean).length;
        return adoptedCount / features.length;
    }
    isHighUsage(usage) {
        if (!usage)
            return false;
        const tier = usage.tier || 'professional';
        const expected = this.getExpectedUsage(tier);
        return usage.documentsAnalyzed > expected * 1.5;
    }
    getUnadoptedFeatures(featureAdoption = {}) {
        return Object.entries(featureAdoption)
            .filter(([_, adopted]) => !adopted)
            .map(([feature, _]) => feature);
    }
    indicatesTeamGrowth(usage) {
        if (!usage)
            return false;
        return usage.activeUsers > usage.weeklyActiveUsers * 1.2 ||
            usage.monthlyActiveUsers > usage.activeUsers * 2;
    }
    async generateAIInsights(customer) {
        try {
            const prompt = `
        Analyze this customer data and provide insights:
        
        Customer: ${customer.companyName}
        Tier: ${customer.tier}
        MRR: $${customer.mrr}
        Health Score: ${customer.healthScore}
        Days as Customer: ${Math.floor((Date.now() - new Date(customer.startDate).getTime()) / (24 * 60 * 60 * 1000))}
        Last Login: ${customer.lastLogin ? new Date(customer.lastLogin).toLocaleDateString() : 'Never'}
        
        Usage Metrics:
        - Documents Analyzed: ${customer.usageMetrics?.documentsAnalyzed || 0}
        - Active Users: ${customer.usageMetrics?.activeUsers || 0}
        - Feature Adoption: ${Math.round(this.calculateFeatureAdoptionRate(customer.usageMetrics?.featureAdoption) * 100)}%
        
        Recent Support Tickets: ${customer.supportTickets?.length || 0}
        
        Provide insights in JSON format:
        {
          "summary": "Brief customer summary",
          "behaviors": ["key behavior 1", "key behavior 2"],
          "successIndicators": ["positive sign 1", "positive sign 2"],
          "riskFactors": ["risk 1", "risk 2"],
          "recommendations": ["action 1", "action 2"],
          "nextActions": ["immediate action 1", "immediate action 2"]
        }
      `;
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 1000,
            });
            return JSON.parse(response.choices[0]?.message?.content || '{}');
        }
        catch (error) {
            console.error('AI insights generation error:', error);
            return {
                summary: 'Unable to generate AI insights at this time',
                behaviors: [],
                successIndicators: [],
                riskFactors: [],
                recommendations: [],
                nextActions: [],
            };
        }
    }
    async getAIRecommendations(customer, factors) {
        try {
            const prompt = `
        Based on these customer health factors, provide 2-3 specific actionable recommendations:
        
        Customer: ${customer.companyName}
        Usage Factor: ${factors.usage}/75
        Engagement Factor: ${factors.engagement}/45
        Support Factor: ${factors.support}/50
        Billing Factor: ${factors.billing}/50
        
        Focus on practical actions a Customer Success Manager can take.
        Return as a JSON array of strings.
      `;
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.6,
                max_tokens: 300,
            });
            const content = response.choices[0]?.message?.content || '[]';
            return JSON.parse(content);
        }
        catch (error) {
            console.error('AI recommendations error:', error);
            return [];
        }
    }
}
exports.CustomerHealthMonitor = CustomerHealthMonitor;
//# sourceMappingURL=customer-health-monitor.js.map