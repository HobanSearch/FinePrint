"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadScoringService = void 0;
const client_1 = require("@prisma/client");
const openai_1 = __importDefault(require("openai"));
const config_1 = require("../config");
class LeadScoringService {
    prisma;
    leadQueue;
    openai;
    constructor() {
        this.prisma = new client_1.PrismaClient();
        this.openai = new openai_1.default({ apiKey: config_1.config.openaiApiKey });
    }
    async initialize() {
        await this.loadScoringModel();
    }
    async createLead(data) {
        const score = await this.calculateInitialScore(data);
        const lead = await this.prisma.lead.create({
            data: {
                ...data,
                score,
                stage: 'new',
                probability: this.stageToProbability('new'),
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
        await this.queueLeadProcessing(lead.id);
        return lead;
    }
    async updateLead(id, updates) {
        const currentLead = await this.prisma.lead.findUnique({ where: { id } });
        if (!currentLead) {
            throw new Error('Lead not found');
        }
        let newScore = currentLead.score;
        if (this.shouldRecalculateScore(updates)) {
            newScore = await this.recalculateScore(id, updates);
        }
        const lead = await this.prisma.lead.update({
            where: { id },
            data: {
                ...updates,
                score: updates.score || newScore,
                probability: updates.stage ? this.stageToProbability(updates.stage) : currentLead.probability,
                updatedAt: new Date(),
            },
        });
        if (updates.stage && updates.stage !== currentLead.stage) {
            await this.handleStageChange(id, currentLead.stage, updates.stage);
        }
        return lead;
    }
    async calculateLeadScore(leadId) {
        const lead = await this.prisma.lead.findUnique({
            where: { id: leadId },
            include: {
                activities: true,
                opportunities: true,
                company: true,
            },
        });
        if (!lead) {
            throw new Error('Lead not found');
        }
        let score = 0;
        score += this.calculateDemographicScore(lead);
        score += this.calculateBehavioralScore(lead);
        score += this.calculateEngagementScore(lead);
        score += await this.calculateAIScore(lead);
        return Math.min(Math.max(score, 0), 100);
    }
    async calculateInitialScore(data) {
        let score = 0;
        if (data.company) {
            score += 15;
            if (this.isTargetIndustry(data.company)) {
                score += 10;
            }
        }
        if (data.title) {
            score += this.calculateTitleScore(data.title);
        }
        score += this.calculateSourceScore(data.source);
        const domain = data.email.split('@')[1];
        score += await this.calculateDomainScore(domain);
        return Math.min(score, 100);
    }
    calculateDemographicScore(lead) {
        let score = 0;
        if (lead.title) {
            const title = lead.title.toLowerCase();
            if (title.includes('cto') || title.includes('ceo') || title.includes('founder')) {
                score += 15;
            }
            else if (title.includes('vp') || title.includes('director')) {
                score += 12;
            }
            else if (title.includes('manager') || title.includes('head')) {
                score += 8;
            }
            else if (title.includes('lead') || title.includes('senior')) {
                score += 5;
            }
        }
        if (lead.company?.employeeCount) {
            if (lead.company.employeeCount > 500)
                score += 10;
            else if (lead.company.employeeCount > 100)
                score += 8;
            else if (lead.company.employeeCount > 50)
                score += 6;
            else if (lead.company.employeeCount > 10)
                score += 4;
        }
        return Math.min(score, 25);
    }
    calculateBehavioralScore(lead) {
        let score = 0;
        if (lead.websiteVisits) {
            score += Math.min(lead.websiteVisits * 2, 10);
        }
        if (lead.contentDownloads) {
            score += Math.min(lead.contentDownloads * 3, 10);
        }
        if (lead.demoRequested) {
            score += 15;
        }
        if (lead.pricingPageViews) {
            score += Math.min(lead.pricingPageViews * 5, 10);
        }
        return Math.min(score, 25);
    }
    calculateEngagementScore(lead) {
        let score = 0;
        if (lead.emailOpens) {
            score += Math.min(lead.emailOpens * 1, 5);
        }
        if (lead.emailClicks) {
            score += Math.min(lead.emailClicks * 2, 10);
        }
        if (lead.socialEngagement) {
            score += Math.min(lead.socialEngagement * 1, 5);
        }
        if (lead.avgResponseTime) {
            if (lead.avgResponseTime < 3600)
                score += 10;
            else if (lead.avgResponseTime < 86400)
                score += 7;
            else if (lead.avgResponseTime < 259200)
                score += 4;
        }
        return Math.min(score, 25);
    }
    async calculateAIScore(lead) {
        try {
            const prompt = `
        Analyze this lead and rate their quality from 0-25 based on:
        - Communication patterns
        - Stated needs/pain points
        - Budget indicators
        - Timeline urgency
        - Decision-making authority

        Lead data:
        - Title: ${lead.title || 'Unknown'}
        - Company: ${lead.company?.name || 'Unknown'}
        - Notes: ${lead.notes?.join(', ') || 'None'}
        - Stage: ${lead.stage}
        - Recent activities: ${lead.activities?.slice(0, 3).map((a) => a.description).join(', ') || 'None'}

        Return only a number between 0-25.
      `;
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 10,
            });
            const score = parseInt(response.choices[0]?.message?.content || '0');
            return Math.min(Math.max(score, 0), 25);
        }
        catch (error) {
            console.error('AI scoring error:', error);
            return 10;
        }
    }
    calculateTitleScore(title) {
        const titleLower = title.toLowerCase();
        if (titleLower.includes('cto') || titleLower.includes('ceo') || titleLower.includes('founder')) {
            return 20;
        }
        else if (titleLower.includes('vp') || titleLower.includes('director')) {
            return 15;
        }
        else if (titleLower.includes('manager') || titleLower.includes('head')) {
            return 10;
        }
        else if (titleLower.includes('lead') || titleLower.includes('senior')) {
            return 8;
        }
        return 5;
    }
    calculateSourceScore(source) {
        const scores = {
            referral: 20,
            organic: 15,
            website: 12,
            marketing: 10,
            cold_outreach: 5,
        };
        return scores[source] || 5;
    }
    async calculateDomainScore(domain) {
        const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
        if (freeProviders.includes(domain)) {
            return 0;
        }
        return 10;
    }
    isTargetIndustry(company) {
        const targetKeywords = [
            'technology', 'tech', 'software', 'saas', 'fintech', 'legal',
            'healthcare', 'startup', 'consulting', 'enterprise'
        ];
        const companyLower = company.toLowerCase();
        return targetKeywords.some(keyword => companyLower.includes(keyword));
    }
    stageToProbability(stage) {
        const probabilities = {
            new: 10,
            contacted: 20,
            qualified: 40,
            demo: 60,
            proposal: 75,
            negotiation: 85,
            closed_won: 100,
            closed_lost: 0,
        };
        return probabilities[stage] || 10;
    }
    shouldRecalculateScore(updates) {
        return !!(updates.stage ||
            updates.assignedTo ||
            updates.notes ||
            updates.estimatedValue);
    }
    async recalculateScore(leadId, updates) {
        return await this.calculateLeadScore(leadId);
    }
    async handleStageChange(leadId, oldStage, newStage) {
        await this.queueStageChangeActions(leadId, oldStage, newStage);
    }
    async queueLeadProcessing(leadId) {
        if (this.leadQueue) {
            await this.leadQueue.add('process-lead', { leadId });
        }
    }
    async queueStageChangeActions(leadId, oldStage, newStage) {
        if (this.leadQueue) {
            await this.leadQueue.add('stage-change', { leadId, oldStage, newStage });
        }
    }
    async loadScoringModel() {
        console.log('Lead scoring model loaded');
    }
    async getLeadsByScore(minScore = 70, limit = 50) {
        const leads = await this.prisma.lead.findMany({
            where: {
                score: {
                    gte: minScore,
                },
            },
            orderBy: {
                score: 'desc',
            },
            take: limit,
        });
        return leads;
    }
    async getHotLeads(limit = 20) {
        return await this.getLeadsByScore(80, limit);
    }
    async bulkScoreLeads(leadIds) {
        const results = [];
        for (const leadId of leadIds) {
            try {
                const score = await this.calculateLeadScore(leadId);
                await this.prisma.lead.update({
                    where: { id: leadId },
                    data: { score, updatedAt: new Date() },
                });
                results.push({ leadId, score });
            }
            catch (error) {
                console.error(`Failed to score lead ${leadId}:`, error);
                results.push({ leadId, score: 0 });
            }
        }
        return results;
    }
}
exports.LeadScoringService = LeadScoringService;
//# sourceMappingURL=lead-scoring-service.js.map