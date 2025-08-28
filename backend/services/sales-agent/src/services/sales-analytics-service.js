"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalesAnalyticsService = void 0;
const client_1 = require("@prisma/client");
class SalesAnalyticsService {
    prisma;
    constructor() {
        this.prisma = new client_1.PrismaClient();
    }
    async getDashboardMetrics() {
        const [overview, pipeline, performance, trends] = await Promise.all([
            this.getOverviewMetrics(),
            this.getPipelineMetrics(),
            this.getPerformanceMetrics(),
            this.getTrendMetrics(),
        ]);
        return { overview, pipeline, performance, trends };
    }
    async getOverviewMetrics() {
        const currentMonth = new Date();
        currentMonth.setDate(1);
        const [totalLeads, qualifiedLeads, totalOpportunities, wonOpportunities, totalRevenue, avgDealSize,] = await Promise.all([
            this.prisma.lead.count(),
            this.prisma.lead.count({ where: { stage: { in: ['qualified', 'demo', 'proposal'] } } }),
            this.prisma.opportunity.count(),
            this.prisma.opportunity.count({ where: { stage: 'closed_won' } }),
            this.prisma.opportunity.aggregate({
                where: { stage: 'closed_won' },
                _sum: { value: true },
            }),
            this.prisma.opportunity.aggregate({
                where: { stage: 'closed_won' },
                _avg: { value: true },
            }),
        ]);
        return {
            total_leads: totalLeads,
            qualified_leads: qualifiedLeads,
            qualification_rate: totalLeads > 0 ? (qualifiedLeads / totalLeads * 100) : 0,
            total_opportunities: totalOpportunities,
            won_opportunities: wonOpportunities,
            win_rate: totalOpportunities > 0 ? (wonOpportunities / totalOpportunities * 100) : 0,
            total_revenue: totalRevenue._sum.value || 0,
            average_deal_size: avgDealSize._avg.value || 0,
        };
    }
    async getPipelineMetrics() {
        const pipelineByStage = await this.prisma.opportunity.groupBy({
            by: ['stage'],
            where: {
                stage: { notIn: ['closed_won', 'closed_lost'] },
            },
            _count: true,
            _sum: { value: true },
        });
        const weightedPipeline = await this.prisma.opportunity.findMany({
            where: {
                stage: { notIn: ['closed_won', 'closed_lost'] },
            },
            select: {
                value: true,
                probability: true,
            },
        });
        const totalWeightedValue = weightedPipeline.reduce((sum, opp) => sum + (opp.value * (opp.probability / 100)), 0);
        return {
            by_stage: pipelineByStage.map(stage => ({
                stage: stage.stage,
                count: stage._count,
                value: stage._sum.value || 0,
            })),
            total_pipeline_value: pipelineByStage.reduce((sum, stage) => sum + (stage._sum.value || 0), 0),
            weighted_pipeline_value: totalWeightedValue,
        };
    }
    async getPerformanceMetrics() {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [leadsThisMonth, opportunitiesThisMonth, revenueThisMonth, avgSalesCycle,] = await Promise.all([
            this.prisma.lead.count({
                where: { createdAt: { gte: thirtyDaysAgo } },
            }),
            this.prisma.opportunity.count({
                where: { createdAt: { gte: thirtyDaysAgo } },
            }),
            this.prisma.opportunity.aggregate({
                where: {
                    stage: 'closed_won',
                    actualCloseDate: { gte: thirtyDaysAgo },
                },
                _sum: { value: true },
            }),
            this.calculateAverageSalesCycle(),
        ]);
        return {
            leads_this_month: leadsThisMonth,
            opportunities_this_month: opportunitiesThisMonth,
            revenue_this_month: revenueThisMonth._sum.value || 0,
            average_sales_cycle: avgSalesCycle,
            conversion_rates: await this.getConversionRates(),
        };
    }
    async getTrendMetrics() {
        const last12Months = Array.from({ length: 12 }, (_, i) => {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            date.setDate(1);
            return date;
        }).reverse();
        const monthlyData = await Promise.all(last12Months.map(async (month) => {
            const nextMonth = new Date(month);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const [leads, revenue, opportunities] = await Promise.all([
                this.prisma.lead.count({
                    where: {
                        createdAt: {
                            gte: month,
                            lt: nextMonth,
                        },
                    },
                }),
                this.prisma.opportunity.aggregate({
                    where: {
                        stage: 'closed_won',
                        actualCloseDate: {
                            gte: month,
                            lt: nextMonth,
                        },
                    },
                    _sum: { value: true },
                }),
                this.prisma.opportunity.count({
                    where: {
                        createdAt: {
                            gte: month,
                            lt: nextMonth,
                        },
                    },
                }),
            ]);
            return {
                month: month.toISOString().slice(0, 7),
                leads: leads,
                revenue: revenue._sum.value || 0,
                opportunities: opportunities,
            };
        }));
        return {
            monthly_trends: monthlyData,
            growth_rates: this.calculateGrowthRates(monthlyData),
        };
    }
    async calculateAverageSalesCycle() {
        const closedOpportunities = await this.prisma.opportunity.findMany({
            where: {
                stage: 'closed_won',
                actualCloseDate: { not: null },
            },
            select: {
                createdAt: true,
                actualCloseDate: true,
            },
        });
        if (closedOpportunities.length === 0)
            return 0;
        const totalDays = closedOpportunities.reduce((sum, opp) => {
            const days = Math.floor((opp.actualCloseDate.getTime() - opp.createdAt.getTime()) / (24 * 60 * 60 * 1000));
            return sum + days;
        }, 0);
        return Math.round(totalDays / closedOpportunities.length);
    }
    async getConversionRates() {
        const stages = ['new', 'contacted', 'qualified', 'demo', 'proposal', 'negotiation'];
        const conversions = {};
        for (let i = 0; i < stages.length - 1; i++) {
            const currentStage = stages[i];
            const nextStage = stages[i + 1];
            const [currentCount, nextCount] = await Promise.all([
                this.prisma.lead.count({
                    where: { stage: { in: stages.slice(i) } },
                }),
                this.prisma.lead.count({
                    where: { stage: { in: stages.slice(i + 1) } },
                }),
            ]);
            conversions[`${currentStage}_to_${nextStage}`] =
                currentCount > 0 ? (nextCount / currentCount * 100) : 0;
        }
        return conversions;
    }
    calculateGrowthRates(monthlyData) {
        const growthRates = {
            leads: [],
            revenue: [],
            opportunities: [],
        };
        for (let i = 1; i < monthlyData.length; i++) {
            const current = monthlyData[i];
            const previous = monthlyData[i - 1];
            growthRates.leads.push({
                month: current.month,
                growth: previous.leads > 0 ? ((current.leads - previous.leads) / previous.leads * 100) : 0,
            });
            growthRates.revenue.push({
                month: current.month,
                growth: previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue * 100) : 0,
            });
            growthRates.opportunities.push({
                month: current.month,
                growth: previous.opportunities > 0 ? ((current.opportunities - previous.opportunities) / previous.opportunities * 100) : 0,
            });
        }
        return growthRates;
    }
    async getLeadSourceAnalysis() {
        const sourceData = await this.prisma.lead.groupBy({
            by: ['source'],
            _count: true,
            _avg: { score: true },
        });
        const sourceConversions = await Promise.all(sourceData.map(async (source) => {
            const qualified = await this.prisma.lead.count({
                where: {
                    source: source.source,
                    stage: { in: ['qualified', 'demo', 'proposal', 'negotiation', 'closed_won'] },
                },
            });
            return {
                source: source.source,
                total_leads: source._count,
                average_score: Math.round(source._avg.score || 0),
                qualified_leads: qualified,
                qualification_rate: source._count > 0 ? (qualified / source._count * 100) : 0,
            };
        }));
        return sourceConversions.sort((a, b) => b.qualification_rate - a.qualification_rate);
    }
    async getSalesRepPerformance() {
        const repData = await this.prisma.lead.groupBy({
            by: ['assignedTo'],
            where: { assignedTo: { not: null } },
            _count: true,
            _avg: { score: true },
        });
        const repPerformance = await Promise.all(repData.map(async (rep) => {
            const [qualified, opportunities, revenue] = await Promise.all([
                this.prisma.lead.count({
                    where: {
                        assignedTo: rep.assignedTo,
                        stage: { in: ['qualified', 'demo', 'proposal', 'negotiation', 'closed_won'] },
                    },
                }),
                this.prisma.opportunity.count({
                    where: {
                        lead: { assignedTo: rep.assignedTo },
                    },
                }),
                this.prisma.opportunity.aggregate({
                    where: {
                        lead: { assignedTo: rep.assignedTo },
                        stage: 'closed_won',
                    },
                    _sum: { value: true },
                }),
            ]);
            return {
                rep_id: rep.assignedTo,
                total_leads: rep._count,
                average_lead_score: Math.round(rep._avg.score || 0),
                qualified_leads: qualified,
                qualification_rate: rep._count > 0 ? (qualified / rep._count * 100) : 0,
                opportunities_created: opportunities,
                revenue_generated: revenue._sum.value || 0,
            };
        }));
        return repPerformance.sort((a, b) => b.revenue_generated - a.revenue_generated);
    }
    async getActivityAnalysis() {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const activityData = await this.prisma.activity.groupBy({
            by: ['type'],
            where: { createdAt: { gte: thirtyDaysAgo } },
            _count: true,
        });
        const activityEffectiveness = await Promise.all(activityData.map(async (activity) => {
            const effectiveActivities = await this.prisma.$queryRaw `
          SELECT COUNT(*) as effective_count
          FROM activities a
          JOIN leads l ON a.lead_id = l.id
          WHERE a.type = ${activity.type}
            AND a.created_at >= ${thirtyDaysAgo}
            AND EXISTS (
              SELECT 1 FROM activities a2 
              WHERE a2.lead_id = l.id 
                AND a2.created_at > a.created_at
                AND a2.outcome = 'positive'
            )
        `;
            return {
                activity_type: activity.type,
                total_activities: activity._count,
                effective_activities: effectiveActivities[0]?.effective_count || 0,
                effectiveness_rate: activity._count > 0
                    ? (effectiveActivities[0]?.effective_count || 0) / activity._count * 100
                    : 0,
            };
        }));
        return activityEffectiveness.sort((a, b) => b.effectiveness_rate - a.effectiveness_rate);
    }
    async generateInsights() {
        const insights = [];
        const metrics = await this.getDashboardMetrics();
        if (metrics.overview.qualification_rate < 20) {
            insights.push('Lead qualification rate is below average. Consider refining lead scoring criteria.');
        }
        if (metrics.overview.win_rate < 15) {
            insights.push('Win rate is low. Focus on better opportunity qualification and sales process optimization.');
        }
        const pipelineValue = metrics.pipeline.total_pipeline_value;
        const monthlyRevenue = metrics.performance.revenue_this_month;
        if (pipelineValue < monthlyRevenue * 3) {
            insights.push('Pipeline coverage is low. Increase prospecting activities to maintain revenue growth.');
        }
        const recentGrowth = metrics.trends.growth_rates.revenue.slice(-3);
        const avgGrowth = recentGrowth.reduce((sum, g) => sum + g.growth, 0) / recentGrowth.length;
        if (avgGrowth < 0) {
            insights.push('Revenue growth has been negative. Review sales strategy and market positioning.');
        }
        else if (avgGrowth > 20) {
            insights.push('Strong revenue growth detected. Consider scaling successful sales strategies.');
        }
        return insights;
    }
    async exportAnalyticsData(format = 'json') {
        const data = await this.getDashboardMetrics();
        if (format === 'csv') {
            return this.convertToCSV(data);
        }
        return data;
    }
    convertToCSV(data) {
        const headers = Object.keys(data.overview);
        const values = Object.values(data.overview);
        return [headers.join(','), values.join(',')].join('\n');
    }
}
exports.SalesAnalyticsService = SalesAnalyticsService;
//# sourceMappingURL=sales-analytics-service.js.map