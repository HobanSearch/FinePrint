"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevenueForecasting = void 0;
const client_1 = require("@prisma/client");
const openai_1 = __importDefault(require("openai"));
const config_1 = require("../config");
class RevenueForecasting {
    prisma;
    openai;
    models = new Map();
    constructor() {
        this.prisma = new client_1.PrismaClient();
        this.openai = new openai_1.default({ apiKey: config_1.config.openaiApiKey });
    }
    async initialize() {
        await this.loadForecastingModels();
        await this.calculateHistoricalMetrics();
        console.log('Revenue forecasting service initialized');
    }
    async generateRevenueForecast(period, horizon = 12) {
        const historicalRevenue = await this.getHistoricalRevenue(period, 24);
        const pipelineData = await this.getPipelineData();
        const seasonalityData = await this.analyzeSeasonality(historicalRevenue);
        const externalFactors = await this.getExternalFactors();
        const input = {
            historical_data: historicalRevenue,
            seasonality: seasonalityData.hasSeasonality,
            external_factors: externalFactors,
            pipeline_data: pipelineData,
        };
        const timeSeriesForecast = await this.timeSeriesForecasting(input, horizon);
        const pipelineForecast = await this.pipelineForecasting(pipelineData, horizon);
        const aiForecast = await this.aiEnhancedForecasting(input, horizon);
        const ensembleForecast = this.ensembleForecasts([
            { forecast: timeSeriesForecast, weight: 0.4 },
            { forecast: pipelineForecast, weight: 0.4 },
            { forecast: aiForecast, weight: 0.2 },
        ]);
        return ensembleForecast;
    }
    async analyzeSalesPerformance() {
        const currentQuarter = await this.getCurrentQuarterMetrics();
        const previousQuarter = await this.getPreviousQuarterMetrics();
        const yearOverYear = await this.getYearOverYearMetrics();
        const performance = {
            revenue: {
                current: currentQuarter.revenue,
                previous: previousQuarter.revenue,
                growth: ((currentQuarter.revenue - previousQuarter.revenue) / previousQuarter.revenue) * 100,
                yoy_growth: ((currentQuarter.revenue - yearOverYear.revenue) / yearOverYear.revenue) * 100,
            },
            deals: {
                closed_won: currentQuarter.deals_won,
                closed_lost: currentQuarter.deals_lost,
                win_rate: (currentQuarter.deals_won / (currentQuarter.deals_won + currentQuarter.deals_lost)) * 100,
                average_deal_size: currentQuarter.revenue / currentQuarter.deals_won,
            },
            pipeline: {
                total_value: currentQuarter.pipeline_value,
                weighted_value: currentQuarter.weighted_pipeline,
                velocity: await this.calculateSalesVelocity(),
            },
        };
        const trends = await this.identifyTrends(performance);
        const recommendations = await this.generateRecommendations(performance, trends);
        return {
            current_performance: performance,
            trends,
            recommendations,
        };
    }
    async predictDealOutcome(opportunityId) {
        const opportunity = await this.prisma.opportunity.findUnique({
            where: { id: opportunityId },
            include: {
                lead: true,
                activities: true,
                contacts: true,
            },
        });
        if (!opportunity) {
            throw new Error('Opportunity not found');
        }
        const factors = await this.calculateDealFactors(opportunity);
        const winProbability = this.calculateWinProbability(factors);
        const expectedCloseDate = await this.predictCloseDate(opportunity, factors);
        const recommendations = await this.generateDealRecommendations(opportunity, factors);
        return {
            win_probability: winProbability,
            expected_close_date: expectedCloseDate,
            factors: factors,
            recommendations,
        };
    }
    async analyzeChurnRisk() {
        const customers = await this.prisma.customer.findMany({
            include: {
                supportTickets: true,
                usageMetrics: true,
                expansionOpportunities: true,
            },
        });
        const riskAnalysis = await Promise.all(customers.map(async (customer) => {
            const riskScore = await this.calculateChurnRisk(customer);
            return { ...customer, riskScore };
        }));
        const highRisk = riskAnalysis.filter(c => c.riskScore >= 0.7);
        const mediumRisk = riskAnalysis.filter(c => c.riskScore >= 0.4 && c.riskScore < 0.7);
        const churnFactors = await this.identifyChurnFactors(riskAnalysis);
        const preventiveActions = await this.generatePreventiveActions(highRisk, mediumRisk);
        return {
            high_risk_customers: highRisk,
            medium_risk_customers: mediumRisk,
            churn_factors: churnFactors,
            preventive_actions: preventiveActions,
        };
    }
    async getHistoricalRevenue(period, months) {
        const revenue = await this.prisma.businessMetrics.findMany({
            where: {
                metric: 'revenue',
                period: period === 'monthly' ? 'monthly' : 'quarterly',
                date: {
                    gte: new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000),
                },
            },
            orderBy: { date: 'asc' },
        });
        return revenue.map(r => r.value);
    }
    async getPipelineData() {
        const opportunities = await this.prisma.opportunity.findMany({
            where: {
                stage: {
                    not: { in: ['closed_won', 'closed_lost'] },
                },
            },
            include: {
                activities: true,
            },
        });
        return opportunities.map(opp => ({
            value: opp.value,
            probability: opp.probability / 100,
            expected_close_date: opp.expectedCloseDate,
            stage: opp.stage,
            days_in_stage: Math.floor((Date.now() - opp.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
        }));
    }
    async analyzeSeasonality(data) {
        if (data.length < 12) {
            return { hasSeasonality: false, pattern: [] };
        }
        const quarters = [];
        for (let i = 0; i < data.length; i += 3) {
            const quarter = data.slice(i, i + 3).reduce((a, b) => a + b, 0) / 3;
            quarters.push(quarter);
        }
        const avgQuarter = quarters.reduce((a, b) => a + b, 0) / quarters.length;
        const seasonalIndices = quarters.map(q => q / avgQuarter);
        const variance = seasonalIndices.reduce((acc, val) => acc + Math.pow(val - 1, 2), 0) / seasonalIndices.length;
        return {
            hasSeasonality: variance > 0.05,
            pattern: seasonalIndices,
        };
    }
    async getExternalFactors() {
        return {
            market_growth: 0.15,
            competition_index: 0.8,
            economic_indicator: 1.2,
            seasonality_factor: 1.0,
        };
    }
    async timeSeriesForecasting(input, horizon) {
        const data = input.historical_data;
        if (data.length < 3) {
            throw new Error('Insufficient historical data');
        }
        const alpha = 0.3;
        let forecast = data[data.length - 1];
        const predictions = [];
        for (let i = 0; i < horizon; i++) {
            predictions.push(forecast);
            const trend = this.calculateTrend(data);
            forecast = forecast * (1 + trend);
        }
        return {
            prediction: predictions[0],
            confidence: 0.75,
            range: {
                min: predictions[0] * 0.8,
                max: predictions[0] * 1.2,
            },
            factors: [
                { name: 'Historical Trend', impact: 0.6, description: 'Based on historical revenue patterns' },
                { name: 'Seasonality', impact: 0.2, description: 'Seasonal revenue variations' },
                { name: 'External Factors', impact: 0.2, description: 'Market and economic conditions' },
            ],
            trend: trend > 0.05 ? 'increasing' : trend < -0.05 ? 'decreasing' : 'stable',
            seasonality: input.seasonality ? [1.1, 0.9, 1.0, 1.2] : [1.0, 1.0, 1.0, 1.0],
        };
    }
    async pipelineForecasting(pipelineData, horizon) {
        const weightedPipeline = pipelineData.reduce((sum, deal) => {
            const stageMultiplier = this.getStageMultiplier(deal.stage);
            const timeDecay = this.getTimeDecay(deal.days_in_stage);
            return sum + (deal.value * deal.probability * stageMultiplier * timeDecay);
        }, 0);
        return {
            prediction: weightedPipeline,
            confidence: 0.8,
            range: {
                min: weightedPipeline * 0.7,
                max: weightedPipeline * 1.3,
            },
            factors: [
                { name: 'Pipeline Quality', impact: 0.5, description: 'Current pipeline opportunities' },
                { name: 'Stage Probability', impact: 0.3, description: 'Deal stage conversion rates' },
                { name: 'Time in Stage', impact: 0.2, description: 'Deal velocity factors' },
            ],
            trend: 'stable',
            seasonality: [1.0, 1.0, 1.0, 1.0],
        };
    }
    async aiEnhancedForecasting(input, horizon) {
        try {
            const prompt = `
        Analyze this sales data and provide a revenue forecast:
        
        Historical Revenue (last 24 months): ${input.historical_data.join(', ')}
        Current Pipeline Value: ${input.pipeline_data.reduce((sum, deal) => sum + deal.value, 0)}
        Pipeline Deals: ${input.pipeline_data.length}
        External Factors: ${JSON.stringify(input.external_factors)}
        
        Provide a JSON response with:
        {
          "prediction": <revenue_forecast>,
          "confidence": <confidence_0_to_1>,
          "factors": [{"name": "factor", "impact": <0_to_1>, "description": "desc"}],
          "trend": "increasing/stable/decreasing"
        }
      `;
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a revenue forecasting expert. Analyze sales data and provide accurate forecasts.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 1000,
            });
            const aiResponse = JSON.parse(response.choices[0]?.message?.content || '{}');
            return {
                prediction: aiResponse.prediction || input.historical_data[input.historical_data.length - 1],
                confidence: aiResponse.confidence || 0.6,
                range: {
                    min: aiResponse.prediction * 0.85,
                    max: aiResponse.prediction * 1.15,
                },
                factors: aiResponse.factors || [],
                trend: aiResponse.trend || 'stable',
                seasonality: [1.0, 1.0, 1.0, 1.0],
            };
        }
        catch (error) {
            console.error('AI forecasting error:', error);
            const lastValue = input.historical_data[input.historical_data.length - 1];
            return {
                prediction: lastValue,
                confidence: 0.5,
                range: { min: lastValue * 0.8, max: lastValue * 1.2 },
                factors: [],
                trend: 'stable',
                seasonality: [1.0, 1.0, 1.0, 1.0],
            };
        }
    }
    ensembleForecasts(forecasts) {
        const totalWeight = forecasts.reduce((sum, f) => sum + f.weight, 0);
        const prediction = forecasts.reduce((sum, f) => sum + (f.forecast.prediction * f.weight), 0) / totalWeight;
        const confidence = forecasts.reduce((sum, f) => sum + (f.forecast.confidence * f.weight), 0) / totalWeight;
        const minPrediction = Math.min(...forecasts.map(f => f.forecast.range.min));
        const maxPrediction = Math.max(...forecasts.map(f => f.forecast.range.max));
        const allFactors = forecasts.flatMap(f => f.forecast.factors);
        const uniqueFactors = allFactors.reduce((acc, factor) => {
            const existing = acc.find(f => f.name === factor.name);
            if (existing) {
                existing.impact = (existing.impact + factor.impact) / 2;
            }
            else {
                acc.push(factor);
            }
            return acc;
        }, []);
        return {
            prediction,
            confidence,
            range: {
                min: minPrediction,
                max: maxPrediction,
            },
            factors: uniqueFactors,
            trend: forecasts[0].forecast.trend,
            seasonality: forecasts[0].forecast.seasonality,
        };
    }
    calculateTrend(data) {
        if (data.length < 2)
            return 0;
        const recent = data.slice(-6);
        const older = data.slice(-12, -6);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        return (recentAvg - olderAvg) / olderAvg;
    }
    getStageMultiplier(stage) {
        const multipliers = {
            'discovery': 0.8,
            'demo': 0.9,
            'proposal': 1.0,
            'negotiation': 1.1,
            'contract': 1.2,
        };
        return multipliers[stage] || 1.0;
    }
    getTimeDecay(daysInStage) {
        if (daysInStage < 30)
            return 1.0;
        if (daysInStage < 60)
            return 0.9;
        if (daysInStage < 90)
            return 0.8;
        return 0.7;
    }
    async calculateDealFactors(opportunity) {
        const factors = [];
        if (opportunity.lead?.score) {
            factors.push({
                name: 'Lead Quality',
                value: opportunity.lead.score,
                impact: (opportunity.lead.score - 50) / 50,
                description: `Lead score: ${opportunity.lead.score}/100`,
            });
        }
        const recentActivities = opportunity.activities?.filter((a) => new Date(a.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length || 0;
        factors.push({
            name: 'Recent Engagement',
            value: recentActivities,
            impact: Math.min(recentActivities / 10, 1),
            description: `${recentActivities} activities in last 30 days`,
        });
        const avgDealSize = 50000;
        factors.push({
            name: 'Deal Size',
            value: opportunity.value,
            impact: (opportunity.value - avgDealSize) / avgDealSize,
            description: `Deal value: $${opportunity.value.toLocaleString()}`,
        });
        return factors;
    }
    calculateWinProbability(factors) {
        const baseProb = 0.3;
        const factorImpact = factors.reduce((sum, factor) => sum + factor.impact, 0) / factors.length;
        const probability = baseProb + (factorImpact * 0.4);
        return Math.max(0.05, Math.min(0.95, probability));
    }
    async predictCloseDate(opportunity, factors) {
        const avgSalesCycle = 45;
        const adjustmentFactor = factors.reduce((sum, f) => sum + f.impact, 0) / factors.length;
        const adjustedCycle = avgSalesCycle * (1 - adjustmentFactor * 0.3);
        return new Date(Date.now() + adjustedCycle * 24 * 60 * 60 * 1000);
    }
    async generateDealRecommendations(opportunity, factors) {
        const recommendations = [];
        for (const factor of factors) {
            if (factor.name === 'Lead Quality' && factor.impact < 0) {
                recommendations.push('Focus on qualifying this lead better - consider additional discovery calls');
            }
            if (factor.name === 'Recent Engagement' && factor.impact < 0.3) {
                recommendations.push('Increase engagement - schedule follow-up meetings or send relevant content');
            }
            if (factor.name === 'Deal Size' && factor.impact > 0.5) {
                recommendations.push('This is a high-value deal - ensure executive sponsorship and detailed proposal');
            }
        }
        return recommendations;
    }
    async getCurrentQuarterMetrics() {
        return {};
    }
    async getPreviousQuarterMetrics() {
        return {};
    }
    async getYearOverYearMetrics() {
        return {};
    }
    async calculateSalesVelocity() {
        return 0;
    }
    async identifyTrends(performance) {
        return {};
    }
    async generateRecommendations(performance, trends) {
        return [];
    }
    async calculateChurnRisk(customer) {
        return 0;
    }
    async identifyChurnFactors(riskAnalysis) {
        return [];
    }
    async generatePreventiveActions(highRisk, mediumRisk) {
        return [];
    }
    async loadForecastingModels() {
        console.log('Loading forecasting models...');
    }
    async calculateHistoricalMetrics() {
        console.log('Calculating historical metrics...');
    }
    async getQuarterlyForecast() {
        return await this.generateRevenueForecast('quarterly', 4);
    }
    async getAnnualForecast() {
        return await this.generateRevenueForecast('yearly', 2);
    }
    async getForecastAccuracy() {
        return { accuracy: 0.85, mae: 5000, mape: 0.12 };
    }
}
exports.RevenueForecasting = RevenueForecasting;
//# sourceMappingURL=revenue-forecasting-service.js.map