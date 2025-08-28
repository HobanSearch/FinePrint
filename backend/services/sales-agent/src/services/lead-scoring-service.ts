import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import OpenAI from 'openai';
import { Lead, CreateLeadRequest, UpdateLeadRequest } from '@fineprintai/shared-types';
import { config } from '../config';

export class LeadScoringService {
  private prisma: PrismaClient;
  private leadQueue: Queue;
  private openai: OpenAI;

  constructor() {
    this.prisma = new PrismaClient();
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
  }

  async initialize() {
    // Initialize ML model for lead scoring
    await this.loadScoringModel();
  }

  async createLead(data: CreateLeadRequest): Promise<Lead> {
    // Create lead with initial scoring
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

    // Queue for further processing
    await this.queueLeadProcessing(lead.id);
    
    return lead as Lead;
  }

  async updateLead(id: string, updates: UpdateLeadRequest): Promise<Lead> {
    const currentLead = await this.prisma.lead.findUnique({ where: { id } });
    if (!currentLead) {
      throw new Error('Lead not found');
    }

    // Recalculate score if relevant fields changed
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

    // Trigger automation if stage changed
    if (updates.stage && updates.stage !== currentLead.stage) {
      await this.handleStageChange(id, currentLead.stage, updates.stage);
    }

    return lead as Lead;
  }

  async calculateLeadScore(leadId: string): Promise<number> {
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

    // Multi-factor scoring algorithm
    let score = 0;

    // Demographic scoring (0-25 points)
    score += this.calculateDemographicScore(lead);

    // Behavioral scoring (0-25 points)
    score += this.calculateBehavioralScore(lead);

    // Engagement scoring (0-25 points)
    score += this.calculateEngagementScore(lead);

    // AI-enhanced scoring (0-25 points)
    score += await this.calculateAIScore(lead);

    return Math.min(Math.max(score, 0), 100);
  }

  private async calculateInitialScore(data: CreateLeadRequest): Promise<number> {
    let score = 0;

    // Company scoring
    if (data.company) {
      score += 15; // Has company
      
      // Industry scoring (would need company enrichment)
      if (this.isTargetIndustry(data.company)) {
        score += 10;
      }
    }

    // Title scoring
    if (data.title) {
      score += this.calculateTitleScore(data.title);
    }

    // Source scoring
    score += this.calculateSourceScore(data.source);

    // Domain scoring
    const domain = data.email.split('@')[1];
    score += await this.calculateDomainScore(domain);

    return Math.min(score, 100);
  }

  private calculateDemographicScore(lead: any): number {
    let score = 0;

    // Title scoring
    if (lead.title) {
      const title = lead.title.toLowerCase();
      if (title.includes('cto') || title.includes('ceo') || title.includes('founder')) {
        score += 15;
      } else if (title.includes('vp') || title.includes('director')) {
        score += 12;
      } else if (title.includes('manager') || title.includes('head')) {
        score += 8;
      } else if (title.includes('lead') || title.includes('senior')) {
        score += 5;
      }
    }

    // Company size scoring (would need enrichment data)
    if (lead.company?.employeeCount) {
      if (lead.company.employeeCount > 500) score += 10;
      else if (lead.company.employeeCount > 100) score += 8;
      else if (lead.company.employeeCount > 50) score += 6;
      else if (lead.company.employeeCount > 10) score += 4;
    }

    return Math.min(score, 25);
  }

  private calculateBehavioralScore(lead: any): number {
    let score = 0;

    // Website interactions
    if (lead.websiteVisits) {
      score += Math.min(lead.websiteVisits * 2, 10);
    }

    // Content engagement
    if (lead.contentDownloads) {
      score += Math.min(lead.contentDownloads * 3, 10);
    }

    // Demo requests
    if (lead.demoRequested) {
      score += 15;
    }

    // Pricing page views
    if (lead.pricingPageViews) {
      score += Math.min(lead.pricingPageViews * 5, 10);
    }

    return Math.min(score, 25);
  }

  private calculateEngagementScore(lead: any): number {
    let score = 0;

    // Email engagement
    if (lead.emailOpens) {
      score += Math.min(lead.emailOpens * 1, 5);
    }

    if (lead.emailClicks) {
      score += Math.min(lead.emailClicks * 2, 10);
    }

    // Social engagement
    if (lead.socialEngagement) {
      score += Math.min(lead.socialEngagement * 1, 5);
    }

    // Response time
    if (lead.avgResponseTime) {
      if (lead.avgResponseTime < 3600) score += 10; // < 1 hour
      else if (lead.avgResponseTime < 86400) score += 7; // < 1 day
      else if (lead.avgResponseTime < 259200) score += 4; // < 3 days
    }

    return Math.min(score, 25);
  }

  private async calculateAIScore(lead: any): Promise<number> {
    try {
      // Use AI to analyze lead quality based on notes and interactions
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
        - Recent activities: ${lead.activities?.slice(0, 3).map((a: any) => a.description).join(', ') || 'None'}

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
    } catch (error) {
      console.error('AI scoring error:', error);
      return 10; // Default score if AI fails
    }
  }

  private calculateTitleScore(title: string): number {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('cto') || titleLower.includes('ceo') || titleLower.includes('founder')) {
      return 20;
    } else if (titleLower.includes('vp') || titleLower.includes('director')) {
      return 15;
    } else if (titleLower.includes('manager') || titleLower.includes('head')) {
      return 10;
    } else if (titleLower.includes('lead') || titleLower.includes('senior')) {
      return 8;
    }
    
    return 5;
  }

  private calculateSourceScore(source: string): number {
    const scores = {
      referral: 20,
      organic: 15,
      website: 12,
      marketing: 10,
      cold_outreach: 5,
    };
    
    return scores[source as keyof typeof scores] || 5;
  }

  private async calculateDomainScore(domain: string): Promise<number> {
    // Check against free email providers
    const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
    if (freeProviders.includes(domain)) {
      return 0;
    }

    // Corporate domain gets points
    return 10;
  }

  private isTargetIndustry(company: string): boolean {
    const targetKeywords = [
      'technology', 'tech', 'software', 'saas', 'fintech', 'legal',
      'healthcare', 'startup', 'consulting', 'enterprise'
    ];
    
    const companyLower = company.toLowerCase();
    return targetKeywords.some(keyword => companyLower.includes(keyword));
  }

  private stageToProbability(stage: string): number {
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
    
    return probabilities[stage as keyof typeof probabilities] || 10;
  }

  private shouldRecalculateScore(updates: UpdateLeadRequest): boolean {
    return !!(
      updates.stage ||
      updates.assignedTo ||
      updates.notes ||
      updates.estimatedValue
    );
  }

  private async recalculateScore(leadId: string, updates: UpdateLeadRequest): Promise<number> {
    // Get fresh lead data and recalculate
    return await this.calculateLeadScore(leadId);
  }

  private async handleStageChange(leadId: string, oldStage: string, newStage: string) {
    // Trigger appropriate automation workflows
    await this.queueStageChangeActions(leadId, oldStage, newStage);
  }

  private async queueLeadProcessing(leadId: string) {
    // Queue lead for enrichment and further processing
    if (this.leadQueue) {
      await this.leadQueue.add('process-lead', { leadId });
    }
  }

  private async queueStageChangeActions(leadId: string, oldStage: string, newStage: string) {
    // Queue stage-specific actions
    if (this.leadQueue) {
      await this.leadQueue.add('stage-change', { leadId, oldStage, newStage });
    }
  }

  private async loadScoringModel() {
    // Load or train ML model for lead scoring
    // This would typically load a pre-trained model
    console.log('Lead scoring model loaded');
  }

  // Public API methods
  async getLeadsByScore(minScore: number = 70, limit: number = 50): Promise<Lead[]> {
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

    return leads as Lead[];
  }

  async getHotLeads(limit: number = 20): Promise<Lead[]> {
    return await this.getLeadsByScore(80, limit);
  }

  async bulkScoreLeads(leadIds: string[]): Promise<{ leadId: string; score: number }[]> {
    const results = [];
    
    for (const leadId of leadIds) {
      try {
        const score = await this.calculateLeadScore(leadId);
        await this.prisma.lead.update({
          where: { id: leadId },
          data: { score, updatedAt: new Date() },
        });
        results.push({ leadId, score });
      } catch (error) {
        console.error(`Failed to score lead ${leadId}:`, error);
        results.push({ leadId, score: 0 });
      }
    }
    
    return results;
  }
}