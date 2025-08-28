export interface Lead {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    company?: string;
    title?: string;
    source: 'website' | 'referral' | 'marketing' | 'cold_outreach' | 'organic';
    score: number;
    stage: 'new' | 'contacted' | 'qualified' | 'demo' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
    assignedTo?: string;
    notes: string[];
    lastContact?: Date;
    nextFollowUp?: Date;
    estimatedValue: number;
    probability: number;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
}
export interface Opportunity {
    id: string;
    leadId: string;
    name: string;
    value: number;
    stage: 'discovery' | 'demo' | 'proposal' | 'negotiation' | 'contract' | 'closed_won' | 'closed_lost';
    probability: number;
    expectedCloseDate: Date;
    actualCloseDate?: Date;
    products: string[];
    competitorInfo?: string;
    decisionMakers: Contact[];
    activities: Activity[];
    documents: Document[];
    createdAt: Date;
    updatedAt: Date;
}
export interface Contact {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    title: string;
    company: string;
    phone?: string;
    role: 'decision_maker' | 'influencer' | 'user' | 'champion' | 'blocker';
    linkedinUrl?: string;
    notes: string[];
    lastContact?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export interface Activity {
    id: string;
    type: 'call' | 'email' | 'meeting' | 'demo' | 'proposal' | 'contract' | 'follow_up';
    subject: string;
    description: string;
    contactId?: string;
    leadId?: string;
    opportunityId?: string;
    scheduledAt?: Date;
    completedAt?: Date;
    outcome?: string;
    nextAction?: string;
    createdBy: string;
    createdAt: Date;
}
export interface Customer {
    id: string;
    companyName: string;
    primaryContact: Contact;
    tier: 'free' | 'starter' | 'professional' | 'team' | 'enterprise';
    mrr: number;
    arr: number;
    startDate: Date;
    renewalDate: Date;
    healthScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    lastLogin?: Date;
    usageMetrics: UsageMetrics;
    supportTickets: SupportTicket[];
    expansionOpportunities: ExpansionOpportunity[];
    csm?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface UsageMetrics {
    documentsAnalyzed: number;
    apiCalls: number;
    activeUsers: number;
    lastAnalysis?: Date;
    featureAdoption: Record<string, boolean>;
    timeSpentInApp: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
}
export interface SupportTicket {
    id: string;
    customerId: string;
    subject: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
    category: 'bug' | 'feature_request' | 'question' | 'billing' | 'integration';
    assignedTo?: string;
    resolution?: string;
    satisfaction?: number;
    timeToResolution?: number;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt?: Date;
}
export interface ExpansionOpportunity {
    id: string;
    customerId: string;
    type: 'upgrade' | 'add_seats' | 'add_feature' | 'cross_sell';
    description: string;
    estimatedValue: number;
    probability: number;
    identifiedAt: Date;
    targetCloseDate?: Date;
    status: 'identified' | 'contacted' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
}
export interface Contract {
    id: string;
    customerId?: string;
    title: string;
    type: 'customer_agreement' | 'vendor_contract' | 'partnership' | 'employment' | 'nda';
    status: 'draft' | 'review' | 'negotiation' | 'approved' | 'signed' | 'active' | 'expired' | 'terminated';
    content: string;
    riskScore: number;
    riskFactors: RiskFactor[];
    keyTerms: ContractTerm[];
    parties: ContractParty[];
    effectiveDate?: Date;
    expirationDate?: Date;
    autoRenewal: boolean;
    renewalNotice: number;
    complianceFlags: ComplianceFlag[];
    assignedLawyer?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface RiskFactor {
    id: string;
    category: 'liability' | 'termination' | 'intellectual_property' | 'data_privacy' | 'financial' | 'regulatory';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation: string;
    mitigation?: string;
    status: 'open' | 'mitigated' | 'accepted' | 'transferred';
}
export interface ContractTerm {
    id: string;
    type: 'payment' | 'termination' | 'liability' | 'sla' | 'renewal' | 'indemnification';
    clause: string;
    value?: string;
    unit?: string;
    effectiveDate?: Date;
    expirationDate?: Date;
}
export interface ContractParty {
    id: string;
    name: string;
    type: 'company' | 'individual';
    role: 'client' | 'vendor' | 'partner';
    signedAt?: Date;
    signedBy?: string;
}
export interface ComplianceFlag {
    id: string;
    regulation: 'GDPR' | 'CCPA' | 'SOX' | 'HIPAA' | 'PCI_DSS' | 'ISO_27001';
    requirement: string;
    status: 'compliant' | 'non_compliant' | 'under_review' | 'not_applicable';
    evidence?: string;
    lastReviewed: Date;
    nextReview: Date;
    assignedTo?: string;
}
export interface BusinessMetrics {
    id: string;
    metric: string;
    value: number;
    unit: string;
    period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    date: Date;
    source: string;
    category: 'sales' | 'marketing' | 'customer_success' | 'product' | 'finance' | 'operations';
    tags: string[];
}
export interface Prediction {
    id: string;
    type: 'churn' | 'expansion' | 'revenue' | 'conversion' | 'usage';
    entityId: string;
    entityType: 'customer' | 'lead' | 'opportunity';
    prediction: number;
    confidence: number;
    factors: PredictionFactor[];
    modelVersion: string;
    createdAt: Date;
    validUntil: Date;
}
export interface PredictionFactor {
    name: string;
    value: number;
    impact: number;
    description: string;
}
export interface Campaign {
    id: string;
    name: string;
    type: 'email' | 'social' | 'content' | 'paid_ads' | 'webinar' | 'conference';
    status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
    budget: number;
    spent: number;
    startDate: Date;
    endDate: Date;
    targetAudience: string[];
    goals: CampaignGoal[];
    metrics: CampaignMetrics;
    createdBy: string;
    createdAt: Date;
}
export interface CampaignGoal {
    metric: 'leads' | 'conversions' | 'revenue' | 'impressions' | 'clicks' | 'signups';
    target: number;
    achieved: number;
}
export interface CampaignMetrics {
    impressions: number;
    clicks: number;
    conversions: number;
    cost_per_click: number;
    cost_per_conversion: number;
    return_on_ad_spend: number;
    leads_generated: number;
    opportunities_created: number;
}
export interface AutomationRule {
    id: string;
    name: string;
    type: 'sales' | 'customer_success' | 'marketing' | 'support';
    trigger: AutomationTrigger;
    conditions: AutomationCondition[];
    actions: AutomationAction[];
    active: boolean;
    executionCount: number;
    lastExecuted?: Date;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface AutomationTrigger {
    type: 'time_based' | 'event_based' | 'metric_based';
    event?: string;
    schedule?: string;
    metric?: string;
    threshold?: number;
}
export interface AutomationCondition {
    field: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in' | 'not_in';
    value: any;
}
export interface AutomationAction {
    type: 'send_email' | 'create_task' | 'update_field' | 'create_opportunity' | 'send_slack' | 'webhook';
    config: Record<string, any>;
}
export interface Document {
    id: string;
    name: string;
    type: 'proposal' | 'contract' | 'presentation' | 'case_study' | 'whitepaper' | 'pricing';
    url: string;
    size: number;
    mimeType: string;
    tags: string[];
    sharedWith: string[];
    downloadCount: number;
    lastDownloaded?: Date;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface CreateLeadRequest {
    email: string;
    firstName: string;
    lastName: string;
    company?: string;
    title?: string;
    source: Lead['source'];
    notes?: string[];
}
export interface UpdateLeadRequest {
    score?: number;
    stage?: Lead['stage'];
    assignedTo?: string;
    notes?: string[];
    nextFollowUp?: Date;
    estimatedValue?: number;
    probability?: number;
    tags?: string[];
}
export interface CreateOpportunityRequest {
    leadId: string;
    name: string;
    value: number;
    expectedCloseDate: Date;
    products: string[];
    decisionMakers: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>[];
}
export interface CustomerHealthRequest {
    customerId: string;
    period: 'week' | 'month' | 'quarter';
}
export interface CustomerHealthResponse {
    healthScore: number;
    riskLevel: Customer['riskLevel'];
    factors: {
        usage: number;
        engagement: number;
        support: number;
        billing: number;
    };
    recommendations: string[];
    trend: 'improving' | 'stable' | 'declining';
}
export interface PredictionRequest {
    type: Prediction['type'];
    entityId: string;
    entityType: Prediction['entityType'];
    horizon: number;
}
export interface ContractAnalysisRequest {
    content: string;
    type: Contract['type'];
    parties: string[];
}
export interface ContractAnalysisResponse {
    riskScore: number;
    riskFactors: RiskFactor[];
    keyTerms: ContractTerm[];
    complianceFlags: ComplianceFlag[];
    recommendations: string[];
    summary: string;
}
export interface BusinessInsightRequest {
    metrics: string[];
    period: 'week' | 'month' | 'quarter' | 'year';
    filters?: Record<string, any>;
}
export interface BusinessInsightResponse {
    insights: {
        metric: string;
        value: number;
        change: number;
        trend: 'up' | 'down' | 'stable';
        significance: 'high' | 'medium' | 'low';
        explanation: string;
    }[];
    recommendations: string[];
    predictiveInsights: {
        forecast: number;
        confidence: number;
        factors: string[];
    }[];
}
export interface BusinessEvent {
    id: string;
    type: string;
    source: string;
    data: any;
    timestamp: Date;
    version: string;
}
export interface LeadCreatedEvent extends BusinessEvent {
    type: 'lead.created';
    data: Lead;
}
export interface OpportunityUpdatedEvent extends BusinessEvent {
    type: 'opportunity.updated';
    data: {
        opportunityId: string;
        changes: Partial<Opportunity>;
        previousStage?: Opportunity['stage'];
        newStage: Opportunity['stage'];
    };
}
export interface CustomerChurnRiskEvent extends BusinessEvent {
    type: 'customer.churn_risk';
    data: {
        customerId: string;
        riskLevel: Customer['riskLevel'];
        factors: string[];
        recommendation: string;
    };
}
export interface ContractRiskEvent extends BusinessEvent {
    type: 'contract.risk_identified';
    data: {
        contractId: string;
        riskFactor: RiskFactor;
        urgency: 'low' | 'medium' | 'high' | 'critical';
    };
}
export interface RevenueAlert extends BusinessEvent {
    type: 'revenue.alert';
    data: {
        type: 'target_missed' | 'opportunity_at_risk' | 'expansion_opportunity';
        amount: number;
        description: string;
        actionRequired: string;
    };
}
//# sourceMappingURL=business.d.ts.map