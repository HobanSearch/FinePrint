import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { Customer, UsageMetrics, SupportTicket, CustomerHealthResponse, Prediction } from '@fineprintai/shared-types';

export class CustomerHealthMonitor {
  private prisma: PrismaClient;
  private openai: OpenAI;

  constructor() {
    this.prisma = new PrismaClient();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }

  async calculateHealthScore(customerId: string): Promise<CustomerHealthResponse> {
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

    // Update customer health score
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

  async predictChurnRisk(customerId: string): Promise<Prediction> {
    const customer = await this.getCustomerWithMetrics(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const features = await this.extractChurnFeatures(customer);
    const churnProbability = await this.calculateChurnProbability(features);
    const factors = this.identifyChurnFactors(features);
    
    const prediction: Prediction = {
      id: `churn_${customerId}_${Date.now()}`,
      type: 'churn',
      entityId: customerId,
      entityType: 'customer',
      prediction: churnProbability,
      confidence: this.calculateConfidence(features),
      factors,
      modelVersion: '1.0',
      createdAt: new Date(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };

    // Store prediction
    await this.storePrediction(prediction);

    return prediction;
  }

  async identifyExpansionOpportunities(customerId: string): Promise<any[]> {
    const customer = await this.getCustomerWithMetrics(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const opportunities = [];

    // Usage-based expansion
    if (this.isHighUsage(customer.usageMetrics)) {
      opportunities.push({
        type: 'upgrade',
        description: 'Customer showing high usage - ready for tier upgrade',
        estimatedValue: customer.mrr * 2,
        probability: 80,
        timeline: '30 days',
      });
    }

    // Feature adoption expansion
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

    // Team growth expansion
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

  async getCustomerInsights(customerId: string): Promise<any> {
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

  private async getCustomerWithMetrics(customerId: string): Promise<any> {
    return await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        primaryContact: true,
        usageMetrics: true,
        supportTickets: {
          where: {
            createdAt: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        expansionOpportunities: true,
      },
    });
  }

  private async calculateUsageFactor(customer: any): Promise<number> {
    const usage = customer.usageMetrics;
    if (!usage) return 0;

    let score = 0;

    // Document analysis frequency
    const expectedMonthlyAnalyses = this.getExpectedUsage(customer.tier);
    const usageRatio = usage.documentsAnalyzed / expectedMonthlyAnalyses;
    score += Math.min(usageRatio * 30, 30); // Max 30 points

    // Feature adoption
    const adoptedFeatures = Object.values(usage.featureAdoption).filter(Boolean).length;
    const totalFeatures = Object.keys(usage.featureAdoption).length;
    score += (adoptedFeatures / totalFeatures) * 20; // Max 20 points

    // Recency of usage
    if (usage.lastAnalysis) {
      const daysSinceLastUse = (Date.now() - new Date(usage.lastAnalysis).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceLastUse < 7) score += 15;
      else if (daysSinceLastUse < 30) score += 10;
      else if (daysSinceLastUse < 60) score += 5;
    }

    // API usage (if applicable)
    if (usage.apiCalls > 0) {
      score += Math.min(usage.apiCalls / 1000 * 10, 10); // Max 10 points
    }

    return Math.min(score, 75); // Max 75 points for usage
  }

  private async calculateEngagementFactor(customer: any): Promise<number> {
    let score = 0;

    // Login frequency
    if (customer.lastLogin) {
      const daysSinceLogin = (Date.now() - new Date(customer.lastLogin).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceLogin < 7) score += 20;
      else if (daysSinceLogin < 30) score += 15;
      else if (daysSinceLogin < 60) score += 10;
      else if (daysSinceLogin < 90) score += 5;
    }

    // Active users ratio
    const usage = customer.usageMetrics;
    if (usage && usage.activeUsers > 0) {
      // Assuming we track seat count somewhere
      const seatUtilization = usage.activeUsers / (usage.totalSeats || usage.activeUsers);
      score += seatUtilization * 15; // Max 15 points
    }

    // Time spent in app
    if (usage && usage.timeSpentInApp > 0) {
      const avgMinutesPerUser = usage.timeSpentInApp / Math.max(usage.activeUsers, 1);
      if (avgMinutesPerUser > 60) score += 10; // High engagement
      else if (avgMinutesPerUser > 30) score += 7;
      else if (avgMinutesPerUser > 15) score += 5;
    }

    return Math.min(score, 45); // Max 45 points for engagement
  }

  private async calculateSupportFactor(customer: any): Promise<number> {
    const tickets = customer.supportTickets || [];
    let score = 50; // Start with neutral score

    // Recent ticket volume
    const recentTickets = tickets.filter(t => 
      new Date(t.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );

    // Penalize high ticket volume
    if (recentTickets.length > 5) score -= 20;
    else if (recentTickets.length > 3) score -= 10;
    else if (recentTickets.length > 1) score -= 5;

    // Check for critical/high priority tickets
    const criticalTickets = recentTickets.filter(t => t.priority === 'critical' || t.priority === 'high');
    score -= criticalTickets.length * 10;

    // Check resolution satisfaction
    const resolvedTickets = tickets.filter(t => t.status === 'resolved' && t.satisfaction);
    if (resolvedTickets.length > 0) {
      const avgSatisfaction = resolvedTickets.reduce((sum, t) => sum + (t.satisfaction || 0), 0) / resolvedTickets.length;
      if (avgSatisfaction >= 4) score += 10;
      else if (avgSatisfaction >= 3) score += 5;
      else if (avgSatisfaction < 2) score -= 15;
    }

    // Check for escalations or unresolved tickets
    const oldOpenTickets = tickets.filter(t => 
      t.status === 'open' && 
      new Date(t.createdAt) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
    score -= oldOpenTickets.length * 5;

    return Math.max(0, Math.min(score, 50)); // 0-50 points for support
  }

  private async calculateBillingFactor(customer: any): Promise<number> {
    let score = 50; // Start neutral

    // Payment status
    const daysSinceRenewal = (Date.now() - new Date(customer.startDate).getTime()) / (24 * 60 * 60 * 1000);
    const daysUntilRenewal = (new Date(customer.renewalDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000);

    // Upcoming renewal risk
    if (daysUntilRenewal < 30) {
      score -= 10; // Renewal approaching
    }

    // Contract length indicates commitment
    const contractLength = (new Date(customer.renewalDate).getTime() - new Date(customer.startDate).getTime()) / (365 * 24 * 60 * 60 * 1000);
    if (contractLength >= 1) score += 10; // Annual contract
    else if (contractLength >= 0.5) score += 5; // 6+ month contract

    // Revenue trend (would need historical MRR data)
    // For now, check if they've upgraded
    if (customer.tier === 'enterprise') score += 15;
    else if (customer.tier === 'professional') score += 10;
    else if (customer.tier === 'team') score += 5;

    return Math.max(0, Math.min(score, 50)); // 0-50 points for billing
  }

  private calculateOverallHealth(factors: any): number {
    // Weighted average of all factors
    const weights = {
      usage: 0.35,
      engagement: 0.25,
      support: 0.20,
      billing: 0.20,
    };

    const totalScore = 
      factors.usage * weights.usage +
      factors.engagement * weights.engagement +
      factors.support * weights.support +
      factors.billing * weights.billing;

    // Convert to 0-100 scale
    return Math.round(totalScore);
  }

  private determineRiskLevel(healthScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (healthScore >= 80) return 'low';
    if (healthScore >= 60) return 'medium';
    if (healthScore >= 40) return 'high';
    return 'critical';
  }

  private async generateRecommendations(customer: any, factors: any): Promise<string[]> {
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

    // AI-enhanced recommendations
    const aiRecommendations = await this.getAIRecommendations(customer, factors);
    recommendations.push(...aiRecommendations);

    return recommendations;
  }

  private async calculateTrend(customerId: string): Promise<'improving' | 'stable' | 'declining'> {
    // Get historical health scores (would need to store these)
    // For now, return based on recent activity patterns
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { lastLogin: true, usageMetrics: true },
    });

    if (!customer) return 'stable';

    // Simple trend calculation based on recency
    if (customer.lastLogin && new Date(customer.lastLogin) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
      return 'improving';
    }

    if (!customer.lastLogin || new Date(customer.lastLogin) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
      return 'declining';
    }

    return 'stable';
  }

  private async extractChurnFeatures(customer: any): Promise<any> {
    return {
      daysAsCustomer: (Date.now() - new Date(customer.startDate).getTime()) / (24 * 60 * 60 * 1000),
      daysUntilRenewal: (new Date(customer.renewalDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      mrr: customer.mrr,
      tier: customer.tier,
      usageFrequency: customer.usageMetrics?.documentsAnalyzed || 0,
      lastLoginDays: customer.lastLogin ? (Date.now() - new Date(customer.lastLogin).getTime()) / (24 * 60 * 60 * 1000) : 999,
      supportTicketCount: customer.supportTickets?.length || 0,
      criticalTickets: customer.supportTickets?.filter((t: any) => t.priority === 'critical').length || 0,
      featureAdoptionRate: this.calculateFeatureAdoptionRate(customer.usageMetrics?.featureAdoption),
    };
  }

  private async calculateChurnProbability(features: any): Promise<number> {
    // Simple rule-based churn prediction
    let churnScore = 0;

    // Usage patterns
    if (features.lastLoginDays > 30) churnScore += 25;
    else if (features.lastLoginDays > 14) churnScore += 15;
    else if (features.lastLoginDays > 7) churnScore += 10;

    // Support issues
    if (features.criticalTickets > 2) churnScore += 20;
    else if (features.criticalTickets > 0) churnScore += 10;

    if (features.supportTicketCount > 5) churnScore += 15;

    // Usage frequency
    const expectedUsage = this.getExpectedUsage(features.tier);
    const usageRatio = features.usageFrequency / expectedUsage;
    if (usageRatio < 0.2) churnScore += 20;
    else if (usageRatio < 0.5) churnScore += 10;

    // Feature adoption
    if (features.featureAdoptionRate < 0.3) churnScore += 15;
    else if (features.featureAdoptionRate < 0.5) churnScore += 5;

    // Renewal proximity
    if (features.daysUntilRenewal < 30 && churnScore > 30) churnScore += 10;

    return Math.min(churnScore, 100) / 100; // Convert to probability 0-1
  }

  private calculateConfidence(features: any): number {
    // Confidence based on data completeness and recency
    let confidence = 0.5; // Base confidence

    if (features.lastLoginDays < 30) confidence += 0.2;
    if (features.usageFrequency > 0) confidence += 0.2;
    if (features.supportTicketCount >= 0) confidence += 0.1; // We have support data

    return Math.min(confidence, 1.0);
  }

  private identifyChurnFactors(features: any): any[] {
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

  private async storePrediction(prediction: Prediction): Promise<void> {
    // Store prediction in database for tracking accuracy
    await this.prisma.prediction.create({
      data: prediction,
    });
  }

  private getExpectedUsage(tier: string): number {
    const expectedUsage = {
      free: 3,
      starter: 20,
      professional: 100,
      team: 500,
      enterprise: 1000,
    };
    return expectedUsage[tier as keyof typeof expectedUsage] || 50;
  }

  private calculateFeatureAdoptionRate(featureAdoption: Record<string, boolean> = {}): number {
    const features = Object.values(featureAdoption);
    if (features.length === 0) return 0;
    
    const adoptedCount = features.filter(Boolean).length;
    return adoptedCount / features.length;
  }

  private isHighUsage(usage: any): boolean {
    if (!usage) return false;
    
    // Check if usage is significantly above tier limits
    const tier = usage.tier || 'professional';
    const expected = this.getExpectedUsage(tier);
    
    return usage.documentsAnalyzed > expected * 1.5;
  }

  private getUnadoptedFeatures(featureAdoption: Record<string, boolean> = {}): string[] {
    return Object.entries(featureAdoption)
      .filter(([_, adopted]) => !adopted)
      .map(([feature, _]) => feature);
  }

  private indicatesTeamGrowth(usage: any): boolean {
    if (!usage) return false;
    
    // Simple heuristics for team growth
    return usage.activeUsers > usage.weeklyActiveUsers * 1.2 || // Rapid user growth
           usage.monthlyActiveUsers > usage.activeUsers * 2; // Growing team
  }

  private async generateAIInsights(customer: any): Promise<any> {
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
    } catch (error) {
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

  private async getAIRecommendations(customer: any, factors: any): Promise<string[]> {
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
    } catch (error) {
      console.error('AI recommendations error:', error);
      return [];
    }
  }
}