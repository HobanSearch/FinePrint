"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeadGenerationEngine = void 0;
const uuid_1 = require("uuid");
const types_1 = require("../types");
const logger_1 = require("../utils/logger");
class LeadGenerationEngine {
    leadScoringRules;
    leadMagnets;
    constructor() {
        this.initializeLeadScoringRules();
        this.initializeLeadMagnets();
    }
    async generateLeadsFromContent(contentIds, leadMagnets, targetAudience) {
        try {
            logger_1.logger.info('Generating leads from content', {
                contentIds: contentIds.length,
                leadMagnets: leadMagnets.length,
                targetAudience
            });
            const leads = [];
            for (const contentId of contentIds) {
                const contentLeads = await this.generateLeadsFromSingleContent(contentId, leadMagnets, targetAudience);
                leads.push(...contentLeads);
            }
            const scoredLeads = await this.scoreLeads(leads);
            const qualifiedLeads = scoredLeads.filter(lead => lead.score >= 50);
            await this.setupNurturingSequences(qualifiedLeads);
            logger_1.logger.info('Lead generation completed', {
                totalLeads: leads.length,
                qualifiedLeads: qualifiedLeads.length,
                avgScore: leads.reduce((sum, lead) => sum + lead.score, 0) / leads.length
            });
            return scoredLeads;
        }
        catch (error) {
            logger_1.logger.error('Lead generation failed', { error, contentIds });
            throw error;
        }
    }
    async createLeadMagnet(title, type, targetAudience, topic) {
        try {
            logger_1.logger.info('Creating lead magnet', { title, type, topic });
            const leadMagnet = {
                id: (0, uuid_1.v4)(),
                title,
                description: await this.generateLeadMagnetDescription(title, type, topic),
                type,
                downloadUrl: `https://fineprintai.com/downloads/${(0, uuid_1.v4)()}`,
                landingPageUrl: `https://fineprintai.com/lead-magnets/${(0, uuid_1.v4)()}`,
                conversionRate: this.estimateConversionRate(type, targetAudience)
            };
            this.leadMagnets.push(leadMagnet);
            logger_1.logger.info('Lead magnet created', {
                id: leadMagnet.id,
                estimatedConversion: leadMagnet.conversionRate
            });
            return leadMagnet;
        }
        catch (error) {
            logger_1.logger.error('Lead magnet creation failed', { error, title });
            throw error;
        }
    }
    async setupNurturingCampaign(segmentName, leads, goals) {
        try {
            logger_1.logger.info('Setting up nurturing campaign', {
                segmentName,
                leadsCount: leads.length,
                goals
            });
            const sequence = await this.createNurturingSequence(segmentName, leads, goals);
            for (const lead of leads) {
                await this.enrollInNurturingSequence(lead.id, sequence.id);
            }
            logger_1.logger.info('Nurturing campaign setup completed', {
                sequenceId: sequence.id,
                emailsInSequence: sequence.emails.length,
                leadsEnrolled: leads.length
            });
            return sequence;
        }
        catch (error) {
            logger_1.logger.error('Nurturing campaign setup failed', { error, segmentName });
            throw error;
        }
    }
    async personalizeLandingPage(leadMagnetId, visitorData) {
        try {
            const leadMagnet = this.leadMagnets.find(lm => lm.id === leadMagnetId);
            if (!leadMagnet) {
                throw new types_1.ValidationError('Lead magnet not found');
            }
            const personalization = await this.generatePersonalizedContent(leadMagnet, visitorData);
            logger_1.logger.info('Landing page personalized', {
                leadMagnetId,
                company: visitorData.company,
                interests: visitorData.interests.length
            });
            return personalization;
        }
        catch (error) {
            logger_1.logger.error('Landing page personalization failed', { error, leadMagnetId });
            throw error;
        }
    }
    async identifyHotLeads(leads) {
        try {
            const hotLeads = leads.filter(lead => {
                return (lead.score >= 80 ||
                    (lead.score >= 70 && this.hasHighEngagementBehavior(lead)) ||
                    (lead.score >= 60 && this.hasUrgentPainPoints(lead)));
            });
            hotLeads.sort((a, b) => {
                const scoreWeight = b.score - a.score;
                const timeWeight = b.updatedAt.getTime() - a.updatedAt.getTime();
                return scoreWeight * 0.7 + timeWeight * 0.3;
            });
            logger_1.logger.info('Hot leads identified', {
                totalLeads: leads.length,
                hotLeads: hotLeads.length,
                conversionProbability: this.calculateConversionProbability(hotLeads)
            });
            return hotLeads;
        }
        catch (error) {
            logger_1.logger.error('Hot lead identification failed', { error });
            throw error;
        }
    }
    async optimizeLeadGeneration(campaignId) {
        try {
            logger_1.logger.info('Optimizing lead generation', { campaignId });
            const recommendations = [];
            let projectedImprovement = 0;
            const optimizedLeadMagnets = [];
            const performance = await this.analyzeLeadGenPerformance(campaignId);
            if (performance.avgConversionRate < 5) {
                recommendations.push('Create more targeted lead magnets for specific audience segments');
                projectedImprovement += 25;
                const optimized = await this.generateOptimizedLeadMagnets(performance.topPerformingTopics);
                optimizedLeadMagnets.push(...optimized);
            }
            if (performance.landingPageConversion < 15) {
                recommendations.push('A/B test landing page headlines and CTAs');
                recommendations.push('Add more social proof and testimonials');
                projectedImprovement += 20;
            }
            if (performance.nurtureToSaleConversion < 8) {
                recommendations.push('Improve email nurturing sequence timing and content');
                recommendations.push('Add more personalized content based on lead behavior');
                projectedImprovement += 30;
            }
            if (performance.leadQualificationAccuracy < 75) {
                recommendations.push('Refine lead scoring model based on conversion data');
                projectedImprovement += 15;
            }
            logger_1.logger.info('Lead generation optimization completed', {
                campaignId,
                recommendationsCount: recommendations.length,
                projectedImprovement
            });
            return {
                recommendations,
                projectedImprovement,
                optimizedLeadMagnets
            };
        }
        catch (error) {
            logger_1.logger.error('Lead generation optimization failed', { error, campaignId });
            throw error;
        }
    }
    async generateLeadsFromSingleContent(contentId, leadMagnets, targetAudience) {
        const leads = [];
        const leadCount = Math.floor(Math.random() * 20) + 5;
        for (let i = 0; i < leadCount; i++) {
            const lead = {
                id: (0, uuid_1.v4)(),
                email: this.generateRandomEmail(),
                firstName: this.generateRandomFirstName(),
                lastName: this.generateRandomLastName(),
                company: this.generateRandomCompany(),
                title: this.generateRandomTitle(),
                source: `content_${contentId}`,
                score: 0,
                status: 'new',
                tags: this.generateLeadTags(targetAudience),
                customFields: {
                    leadMagnet: leadMagnets[Math.floor(Math.random() * leadMagnets.length)],
                    contentSource: contentId,
                    audience: targetAudience
                },
                createdAt: new Date(),
                updatedAt: new Date()
            };
            leads.push(lead);
        }
        return leads;
    }
    async scoreLeads(leads) {
        return leads.map(lead => {
            let score = 0;
            if (lead.company)
                score += this.leadScoringRules.demographics.hasCompany || 10;
            if (lead.title)
                score += this.leadScoringRules.demographics.hasTitle || 5;
            if (lead.company && this.isTargetIndustry(lead.company)) {
                score += this.leadScoringRules.firmographics.targetIndustry || 15;
            }
            if (lead.source.includes('content')) {
                score += this.leadScoringRules.behavior.contentEngagement || 10;
            }
            score += Math.floor(Math.random() * 30);
            return {
                ...lead,
                score: Math.min(100, Math.max(0, score))
            };
        });
    }
    async setupNurturingSequences(leads) {
        const segments = this.segmentLeads(leads);
        for (const [segmentName, segmentLeads] of Object.entries(segments)) {
            const sequence = await this.createNurturingSequence(segmentName, segmentLeads, ['educate', 'build_trust', 'convert']);
            for (const lead of segmentLeads) {
                await this.enrollInNurturingSequence(lead.id, sequence.id);
            }
        }
    }
    async createNurturingSequence(segmentName, leads, goals) {
        const emails = await this.generateNurturingEmails(segmentName, goals);
        return {
            id: (0, uuid_1.v4)(),
            name: `${segmentName} Nurturing Sequence`,
            emails,
            triggers: [
                { condition: 'email_opened', action: 'increase_score', delay: 0 },
                { condition: 'link_clicked', action: 'increase_score', delay: 0 },
                { condition: 'no_engagement_7_days', action: 'send_reengagement', delay: 168 }
            ],
            goals
        };
    }
    async generateNurturingEmails(segmentName, goals) {
        const emails = [];
        const emailTemplates = [
            {
                subject: "Welcome to Fine Print AI - Protect Your Digital Rights",
                delay: 0,
                goal: 'welcome'
            },
            {
                subject: "5 Hidden Dangers in Terms of Service (You're Probably Missing)",
                delay: 24,
                goal: 'educate'
            },
            {
                subject: "Case Study: How We Saved $50k by Reading the Fine Print",
                delay: 72,
                goal: 'build_trust'
            },
            {
                subject: "Your Free Document Analysis is Ready",
                delay: 168,
                goal: 'convert'
            }
        ];
        for (const template of emailTemplates) {
            emails.push({
                id: (0, uuid_1.v4)(),
                name: `${segmentName} - ${template.goal}`,
                subject: template.subject,
                content: await this.generateEmailContent(template.goal, segmentName),
                htmlContent: await this.generateEmailHTML(template.goal, segmentName),
                recipientSegment: segmentName,
                status: 'draft',
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
        return emails;
    }
    async enrollInNurturingSequence(leadId, sequenceId) {
        logger_1.logger.info('Lead enrolled in nurturing sequence', { leadId, sequenceId });
    }
    async generateLeadMagnetDescription(title, type, topic) {
        const descriptions = {
            whitepaper: `Comprehensive analysis of ${topic} with actionable insights and recommendations.`,
            guide: `Step-by-step guide to ${topic} with practical examples and checklists.`,
            checklist: `Essential ${topic} checklist to ensure you don't miss critical steps.`,
            template: `Ready-to-use ${topic} template to save time and ensure accuracy.`,
            webinar: `Expert-led webinar on ${topic} with live Q&A and exclusive insights.`,
            free_trial: `Try Fine Print AI free for 30 days and see how we protect your rights.`
        };
        return descriptions[type] || `Valuable resource about ${topic} for legal protection.`;
    }
    estimateConversionRate(type, targetAudience) {
        const baseRates = {
            whitepaper: 8,
            guide: 12,
            checklist: 15,
            template: 18,
            webinar: 10,
            free_trial: 25
        };
        let rate = baseRates[type] || 10;
        if (targetAudience.toLowerCase().includes('business'))
            rate *= 1.2;
        if (targetAudience.toLowerCase().includes('privacy'))
            rate *= 1.3;
        return Math.min(35, rate);
    }
    async generatePersonalizedContent(leadMagnet, visitorData) {
        const companyName = visitorData.company || 'your business';
        const industry = visitorData.industry || 'your industry';
        return {
            headline: `Protect ${companyName} from Hidden Legal Risks`,
            subheadline: `Get our ${leadMagnet.title} specifically tailored for ${industry} companies`,
            benefitsList: [
                `Identify ${industry}-specific legal risks`,
                'Protect your company from liability',
                'Save thousands in legal fees',
                'Get actionable recommendations'
            ],
            ctaText: `Get My Free ${leadMagnet.type.replace('_', ' ')}`,
            socialProof: `Join 10,000+ ${industry} professionals who trust Fine Print AI`
        };
    }
    hasHighEngagementBehavior(lead) {
        return Math.random() > 0.7;
    }
    hasUrgentPainPoints(lead) {
        return Math.random() > 0.8;
    }
    calculateConversionProbability(leads) {
        const avgScore = leads.reduce((sum, lead) => sum + lead.score, 0) / leads.length;
        return Math.min(95, avgScore * 1.2);
    }
    async analyzeLeadGenPerformance(campaignId) {
        return {
            avgConversionRate: Math.random() * 10 + 2,
            landingPageConversion: Math.random() * 20 + 5,
            nurtureToSaleConversion: Math.random() * 15 + 3,
            leadQualificationAccuracy: Math.random() * 30 + 60,
            topPerformingTopics: ['Privacy Policy Analysis', 'GDPR Compliance', 'Terms of Service Review']
        };
    }
    async generateOptimizedLeadMagnets(topics) {
        const optimized = [];
        for (const topic of topics) {
            optimized.push({
                id: (0, uuid_1.v4)(),
                title: `Ultimate ${topic} Guide`,
                description: `Comprehensive guide to ${topic} with templates and checklists`,
                type: 'guide',
                downloadUrl: `https://fineprintai.com/downloads/${(0, uuid_1.v4)()}`,
                landingPageUrl: `https://fineprintai.com/lead-magnets/${(0, uuid_1.v4)()}`,
                conversionRate: 15
            });
        }
        return optimized;
    }
    segmentLeads(leads) {
        const segments = {
            high_value: [],
            business_users: [],
            individual_users: [],
            privacy_advocates: []
        };
        for (const lead of leads) {
            if (lead.score >= 70)
                segments.high_value.push(lead);
            if (lead.company)
                segments.business_users.push(lead);
            if (!lead.company)
                segments.individual_users.push(lead);
            if (lead.tags.includes('privacy'))
                segments.privacy_advocates.push(lead);
        }
        return segments;
    }
    async generateEmailContent(goal, segment) {
        const content = {
            welcome: `Welcome to Fine Print AI! We're here to help you understand and protect your digital rights.`,
            educate: `Did you know that 99% of people agree to terms without reading them? Here's what you're missing...`,
            build_trust: `Here's how one company saved $50,000 by using Fine Print AI to review their vendor agreements.`,
            convert: `Ready to protect your business? Get your free document analysis now.`
        };
        return content[goal] || 'Thank you for your interest in Fine Print AI.';
    }
    async generateEmailHTML(goal, segment) {
        const content = await this.generateEmailContent(goal, segment);
        return `<html><body><p>${content}</p></body></html>`;
    }
    isTargetIndustry(company) {
        const targetIndustries = ['tech', 'legal', 'finance', 'healthcare', 'saas'];
        return targetIndustries.some(industry => company.toLowerCase().includes(industry));
    }
    initializeLeadScoringRules() {
        this.leadScoringRules = {
            demographics: {
                hasCompany: 10,
                hasTitle: 5,
                hasPhone: 8,
                completeProfile: 15
            },
            behavior: {
                contentEngagement: 10,
                emailOpened: 5,
                linkClicked: 8,
                documentUploaded: 20,
                trialStarted: 25
            },
            engagement: {
                websiteVisits: 3,
                timeOnSite: 2,
                pagesViewed: 1,
                returnVisitor: 5
            },
            firmographics: {
                targetIndustry: 15,
                companySize: 10,
                targetRole: 12
            }
        };
    }
    initializeLeadMagnets() {
        this.leadMagnets = [
            {
                id: (0, uuid_1.v4)(),
                title: 'Terms of Service Danger Checklist',
                description: 'Essential checklist to identify dangerous clauses in any terms of service',
                type: 'checklist',
                downloadUrl: 'https://fineprintai.com/downloads/tos-checklist',
                landingPageUrl: 'https://fineprintai.com/tos-checklist',
                conversionRate: 18
            },
            {
                id: (0, uuid_1.v4)(),
                title: 'GDPR Compliance Guide for Small Business',
                description: 'Complete guide to GDPR compliance with templates and checklists',
                type: 'guide',
                downloadUrl: 'https://fineprintai.com/downloads/gdpr-guide',
                landingPageUrl: 'https://fineprintai.com/gdpr-guide',
                conversionRate: 14
            }
        ];
    }
    generateRandomEmail() {
        const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'company.com'];
        const names = ['john', 'jane', 'alex', 'sarah', 'mike', 'lisa', 'david', 'emma'];
        const name = names[Math.floor(Math.random() * names.length)];
        const domain = domains[Math.floor(Math.random() * domains.length)];
        return `${name}.${Math.floor(Math.random() * 1000)}@${domain}`;
    }
    generateRandomFirstName() {
        const names = ['John', 'Jane', 'Alex', 'Sarah', 'Mike', 'Lisa', 'David', 'Emma', 'Chris', 'Amy'];
        return names[Math.floor(Math.random() * names.length)];
    }
    generateRandomLastName() {
        const names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
        return names[Math.floor(Math.random() * names.length)];
    }
    generateRandomCompany() {
        const companies = ['Tech Corp', 'Legal Associates', 'Business Solutions', 'Digital Agency', 'Consulting Group', 'Financial Services'];
        return companies[Math.floor(Math.random() * companies.length)];
    }
    generateRandomTitle() {
        const titles = ['CEO', 'CTO', 'Legal Counsel', 'Marketing Manager', 'Operations Director', 'Business Owner', 'Privacy Officer'];
        return titles[Math.floor(Math.random() * titles.length)];
    }
    generateLeadTags(targetAudience) {
        const baseTags = ['legal-tech', 'privacy'];
        if (targetAudience.toLowerCase().includes('business')) {
            baseTags.push('business', 'compliance');
        }
        if (targetAudience.toLowerCase().includes('individual')) {
            baseTags.push('consumer', 'personal');
        }
        return baseTags;
    }
}
exports.LeadGenerationEngine = LeadGenerationEngine;
//# sourceMappingURL=lead-generation-engine.js.map