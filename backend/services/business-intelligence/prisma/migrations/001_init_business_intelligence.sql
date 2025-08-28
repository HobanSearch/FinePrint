-- CreateEnum
CREATE TYPE "Period" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "MetricCategory" AS ENUM ('SALES', 'MARKETING', 'CUSTOMER_SUCCESS', 'PRODUCT', 'FINANCE', 'OPERATIONS');
CREATE TYPE "PredictionType" AS ENUM ('CHURN', 'EXPANSION', 'REVENUE', 'CONVERSION', 'USAGE');
CREATE TYPE "EntityType" AS ENUM ('CUSTOMER', 'LEAD', 'OPPORTUNITY');
CREATE TYPE "CampaignType" AS ENUM ('EMAIL', 'SOCIAL', 'CONTENT', 'PAID_ADS', 'WEBINAR', 'CONFERENCE');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "InsightType" AS ENUM ('PERFORMANCE', 'OPTIMIZATION', 'PREDICTION', 'ANOMALY', 'CROSS_FUNCTIONAL', 'PREDICTIVE', 'COMPARATIVE', 'CAUSAL');
CREATE TYPE "Impact" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'REFERRAL', 'MARKETING', 'COLD_OUTREACH', 'ORGANIC');
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'DEMO', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');
CREATE TYPE "ScoreGrade" AS ENUM ('A', 'B', 'C', 'D');
CREATE TYPE "OpportunityStage" AS ENUM ('DISCOVERY', 'DEMO', 'PROPOSAL', 'NEGOTIATION', 'CONTRACT', 'CLOSED_WON', 'CLOSED_LOST');
CREATE TYPE "CustomerTier" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'TEAM', 'ENTERPRISE');
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "Trend" AS ENUM ('IMPROVING', 'STABLE', 'DECLINING');
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'URGENT');
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');
CREATE TYPE "TicketCategory" AS ENUM ('BUG', 'FEATURE_REQUEST', 'QUESTION', 'BILLING', 'INTEGRATION');
CREATE TYPE "ExpansionType" AS ENUM ('UPGRADE', 'ADD_SEATS', 'ADD_FEATURE', 'CROSS_SELL');
CREATE TYPE "ExpansionStatus" AS ENUM ('IDENTIFIED', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');
CREATE TYPE "ContactRole" AS ENUM ('DECISION_MAKER', 'INFLUENCER', 'USER', 'CHAMPION', 'BLOCKER');
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'DEMO', 'PROPOSAL', 'CONTRACT', 'FOLLOW_UP');
CREATE TYPE "DocumentType" AS ENUM ('PROPOSAL', 'CONTRACT', 'PRESENTATION', 'CASE_STUDY', 'WHITEPAPER', 'PRICING');
CREATE TYPE "ContractType" AS ENUM ('CUSTOMER_AGREEMENT', 'VENDOR_CONTRACT', 'PARTNERSHIP', 'EMPLOYMENT', 'NDA');
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'REVIEW', 'NEGOTIATION', 'APPROVED', 'SIGNED', 'ACTIVE', 'EXPIRED', 'TERMINATED');
CREATE TYPE "RiskCategory" AS ENUM ('LIABILITY', 'TERMINATION', 'INTELLECTUAL_PROPERTY', 'DATA_PRIVACY', 'FINANCIAL', 'REGULATORY');
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'MITIGATED', 'ACCEPTED', 'TRANSFERRED');
CREATE TYPE "TermType" AS ENUM ('PAYMENT', 'TERMINATION', 'LIABILITY', 'SLA', 'RENEWAL', 'INDEMNIFICATION');
CREATE TYPE "PartyType" AS ENUM ('COMPANY', 'INDIVIDUAL');
CREATE TYPE "PartyRole" AS ENUM ('CLIENT', 'VENDOR', 'PARTNER');
CREATE TYPE "Regulation" AS ENUM ('GDPR', 'CCPA', 'SOX', 'HIPAA', 'PCI_DSS', 'ISO_27001');
CREATE TYPE "ComplianceStatus" AS ENUM ('COMPLIANT', 'NON_COMPLIANT', 'UNDER_REVIEW', 'NOT_APPLICABLE');
CREATE TYPE "AutomationType" AS ENUM ('SALES', 'CUSTOMER_SUCCESS', 'MARKETING', 'SUPPORT');
CREATE TYPE "TriggerType" AS ENUM ('TIME_BASED', 'EVENT_BASED', 'METRIC_BASED');
CREATE TYPE "ConditionOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'CONTAINS', 'IN', 'NOT_IN');
CREATE TYPE "ActionType" AS ENUM ('SEND_EMAIL', 'CREATE_TASK', 'UPDATE_FIELD', 'CREATE_OPPORTUNITY', 'SEND_SLACK', 'WEBHOOK');
CREATE TYPE "Effort" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "ReportFormat" AS ENUM ('SUMMARY', 'DETAILED');

-- CreateTable
CREATE TABLE "business_metrics" (
    "id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "period" "Period" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "category" "MetricCategory" NOT NULL,
    "tags" TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "campaignId" TEXT,
    "leadId" TEXT,
    "customerId" TEXT,
    "ticketId" TEXT,

    CONSTRAINT "business_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictions" (
    "id" TEXT NOT NULL,
    "type" "PredictionType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "prediction" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "leadId" TEXT,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction_factors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "impact" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,

    CONSTRAINT "prediction_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL,
    "status" "CampaignStatus" NOT NULL,
    "budget" DOUBLE PRECISION NOT NULL,
    "spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "targetAudience" TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_goals" (
    "id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "achieved" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "campaignId" TEXT NOT NULL,

    CONSTRAINT "campaign_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_insights" (
    "id" TEXT NOT NULL,
    "type" "InsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impact" "Impact" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "actionItems" TEXT[],
    "campaignId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),

    CONSTRAINT "campaign_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "company" TEXT,
    "title" TEXT,
    "source" "LeadSource" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stage" "LeadStage" NOT NULL,
    "assignedTo" TEXT,
    "notes" TEXT[],
    "lastContact" TIMESTAMP(3),
    "nextFollowUp" TIMESTAMP(3),
    "estimatedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "probability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_scoring_history" (
    "id" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "demographicScore" DOUBLE PRECISION NOT NULL,
    "behavioralScore" DOUBLE PRECISION NOT NULL,
    "firmographicScore" DOUBLE PRECISION NOT NULL,
    "intentScore" DOUBLE PRECISION NOT NULL,
    "grade" "ScoreGrade" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL,
    "leadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_scoring_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "stage" "OpportunityStage" NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "expectedCloseDate" TIMESTAMP(3) NOT NULL,
    "actualCloseDate" TIMESTAMP(3),
    "products" TEXT[],
    "competitorInfo" TEXT,
    "winLossReason" TEXT,
    "leadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "primaryContactId" TEXT,
    "tier" "CustomerTier" NOT NULL,
    "mrr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "arr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "renewalDate" TIMESTAMP(3) NOT NULL,
    "healthScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "riskLevel" "RiskLevel" NOT NULL,
    "lastLogin" TIMESTAMP(3),
    "csmId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_health_history" (
    "id" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "usageScore" DOUBLE PRECISION NOT NULL,
    "engagementScore" DOUBLE PRECISION NOT NULL,
    "satisfactionScore" DOUBLE PRECISION NOT NULL,
    "businessScore" DOUBLE PRECISION NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "trend" "Trend" NOT NULL,
    "churnRisk" DOUBLE PRECISION NOT NULL,
    "recommendations" TEXT[],
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_health_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_metrics" (
    "id" TEXT NOT NULL,
    "documentsAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "apiCalls" INTEGER NOT NULL DEFAULT 0,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "featureAdoption" JSONB NOT NULL,
    "timeSpentInApp" INTEGER NOT NULL DEFAULT 0,
    "weeklyActiveUsers" INTEGER NOT NULL DEFAULT 0,
    "monthlyActiveUsers" INTEGER NOT NULL DEFAULT 0,
    "lastAnalysis" TIMESTAMP(3),
    "customerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "assignedTo" TEXT,
    "resolution" TEXT,
    "satisfaction" DOUBLE PRECISION,
    "timeToResolution" DOUBLE PRECISION,
    "sentiment" DOUBLE PRECISION,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expansion_opportunities" (
    "id" TEXT NOT NULL,
    "type" "ExpansionType" NOT NULL,
    "description" TEXT NOT NULL,
    "estimatedValue" DOUBLE PRECISION NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "identifiedAt" TIMESTAMP(3) NOT NULL,
    "targetCloseDate" TIMESTAMP(3),
    "status" "ExpansionStatus" NOT NULL,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "expansion_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "phone" TEXT,
    "role" "ContactRole" NOT NULL,
    "linkedinUrl" TEXT,
    "notes" TEXT[],
    "lastContact" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contactId" TEXT,
    "leadId" TEXT,
    "opportunityId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "nextAction" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tags" TEXT[],
    "sharedWith" TEXT[],
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloaded" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL,
    "content" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "effectiveDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "autoRenewal" BOOLEAN NOT NULL DEFAULT false,
    "renewalNotice" INTEGER NOT NULL DEFAULT 30,
    "assignedLawyer" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_factors" (
    "id" TEXT NOT NULL,
    "category" "RiskCategory" NOT NULL,
    "severity" "Severity" NOT NULL,
    "description" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "mitigation" TEXT,
    "status" "RiskStatus" NOT NULL,
    "contractId" TEXT NOT NULL,

    CONSTRAINT "risk_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_terms" (
    "id" TEXT NOT NULL,
    "type" "TermType" NOT NULL,
    "clause" TEXT NOT NULL,
    "value" TEXT,
    "unit" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "contractId" TEXT NOT NULL,

    CONSTRAINT "contract_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_parties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "role" "PartyRole" NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedBy" TEXT,
    "contractId" TEXT NOT NULL,

    CONSTRAINT "contract_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_flags" (
    "id" TEXT NOT NULL,
    "regulation" "Regulation" NOT NULL,
    "requirement" TEXT NOT NULL,
    "status" "ComplianceStatus" NOT NULL,
    "evidence" TEXT,
    "lastReviewed" TIMESTAMP(3) NOT NULL,
    "nextReview" TIMESTAMP(3) NOT NULL,
    "assignedTo" TEXT,
    "contractId" TEXT NOT NULL,

    CONSTRAINT "compliance_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AutomationType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "lastExecuted" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_triggers" (
    "id" TEXT NOT NULL,
    "type" "TriggerType" NOT NULL,
    "event" TEXT,
    "schedule" TEXT,
    "metric" TEXT,
    "threshold" DOUBLE PRECISION,
    "ruleId" TEXT NOT NULL,

    CONSTRAINT "automation_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_conditions" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" "ConditionOperator" NOT NULL,
    "value" JSONB NOT NULL,
    "ruleId" TEXT NOT NULL,

    CONSTRAINT "automation_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_actions" (
    "id" TEXT NOT NULL,
    "type" "ActionType" NOT NULL,
    "config" JSONB NOT NULL,
    "ruleId" TEXT NOT NULL,

    CONSTRAINT "automation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_insights" (
    "id" TEXT NOT NULL,
    "type" "InsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sources" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insight_impacts" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "magnitude" DOUBLE PRECISION NOT NULL,
    "timeframe" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,

    CONSTRAINT "insight_impacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insight_recommendations" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "expectedImpact" DOUBLE PRECISION NOT NULL,
    "effort" "Effort" NOT NULL,
    "owner" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,

    CONSTRAINT "insight_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_reports" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "summary" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "appendix" JSONB,
    "generatedBy" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "executive_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DocumentToOpportunity" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "business_metrics_metric_date_idx" ON "business_metrics"("metric", "date");
CREATE INDEX "business_metrics_category_period_idx" ON "business_metrics"("category", "period");
CREATE INDEX "business_metrics_source_createdAt_idx" ON "business_metrics"("source", "createdAt");

-- CreateIndex
CREATE INDEX "predictions_type_entityType_idx" ON "predictions"("type", "entityType");
CREATE INDEX "predictions_entityId_validUntil_idx" ON "predictions"("entityId", "validUntil");

-- CreateIndex
CREATE INDEX "campaigns_status_startDate_idx" ON "campaigns"("status", "startDate");
CREATE INDEX "campaigns_type_createdAt_idx" ON "campaigns"("type", "createdAt");

-- CreateIndex
CREATE INDEX "campaign_insights_type_impact_idx" ON "campaign_insights"("type", "impact");

-- CreateIndex
CREATE UNIQUE INDEX "leads_email_key" ON "leads"("email");
CREATE INDEX "leads_stage_score_idx" ON "leads"("stage", "score");
CREATE INDEX "leads_source_createdAt_idx" ON "leads"("source", "createdAt");
CREATE INDEX "leads_assignedTo_nextFollowUp_idx" ON "leads"("assignedTo", "nextFollowUp");

-- CreateIndex
CREATE INDEX "lead_scoring_history_leadId_createdAt_idx" ON "lead_scoring_history"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "opportunities_stage_expectedCloseDate_idx" ON "opportunities"("stage", "expectedCloseDate");
CREATE INDEX "opportunities_leadId_stage_idx" ON "opportunities"("leadId", "stage");

-- CreateIndex
CREATE INDEX "customers_tier_healthScore_idx" ON "customers"("tier", "healthScore");
CREATE INDEX "customers_riskLevel_renewalDate_idx" ON "customers"("riskLevel", "renewalDate");
CREATE INDEX "customers_csmId_healthScore_idx" ON "customers"("csmId", "healthScore");

-- CreateIndex
CREATE INDEX "customer_health_history_customerId_createdAt_idx" ON "customer_health_history"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "usage_metrics_customerId_date_idx" ON "usage_metrics"("customerId", "date");

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_idx" ON "support_tickets"("status", "priority");
CREATE INDEX "support_tickets_customerId_createdAt_idx" ON "support_tickets"("customerId", "createdAt");
CREATE INDEX "support_tickets_assignedTo_status_idx" ON "support_tickets"("assignedTo", "status");

-- CreateIndex
CREATE INDEX "expansion_opportunities_status_probability_idx" ON "expansion_opportunities"("status", "probability");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_email_key" ON "contacts"("email");
CREATE INDEX "contacts_company_role_idx" ON "contacts"("company", "role");

-- CreateIndex
CREATE INDEX "activities_type_scheduledAt_idx" ON "activities"("type", "scheduledAt");
CREATE INDEX "activities_createdBy_createdAt_idx" ON "activities"("createdBy", "createdAt");

-- CreateIndex
CREATE INDEX "documents_type_createdAt_idx" ON "documents"("type", "createdAt");

-- CreateIndex
CREATE INDEX "contracts_status_expirationDate_idx" ON "contracts"("status", "expirationDate");
CREATE INDEX "contracts_customerId_status_idx" ON "contracts"("customerId", "status");

-- CreateIndex
CREATE INDEX "automation_rules_type_active_idx" ON "automation_rules"("type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "automation_triggers_ruleId_key" ON "automation_triggers"("ruleId");

-- CreateIndex
CREATE INDEX "business_insights_type_confidence_idx" ON "business_insights"("type", "confidence");
CREATE INDEX "business_insights_createdAt_validUntil_idx" ON "business_insights"("createdAt", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "insight_impacts_insightId_key" ON "insight_impacts"("insightId");

-- CreateIndex
CREATE INDEX "executive_reports_period_generatedAt_idx" ON "executive_reports"("period", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "_DocumentToOpportunity_AB_unique" ON "_DocumentToOpportunity"("A", "B");
CREATE INDEX "_DocumentToOpportunity_B_index" ON "_DocumentToOpportunity"("B");

-- AddForeignKey
ALTER TABLE "business_metrics" ADD CONSTRAINT "business_metrics_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_metrics" ADD CONSTRAINT "business_metrics_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_metrics" ADD CONSTRAINT "business_metrics_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_metrics" ADD CONSTRAINT "business_metrics_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_factors" ADD CONSTRAINT "prediction_factors_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "predictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_goals" ADD CONSTRAINT "campaign_goals_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_insights" ADD CONSTRAINT "campaign_insights_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_scoring_history" ADD CONSTRAINT "lead_scoring_history_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_health_history" ADD CONSTRAINT "customer_health_history_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_metrics" ADD CONSTRAINT "usage_metrics_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expansion_opportunities" ADD CONSTRAINT "expansion_opportunities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_factors" ADD CONSTRAINT "risk_factors_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_terms" ADD CONSTRAINT "contract_terms_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_flags" ADD CONSTRAINT "compliance_flags_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_conditions" ADD CONSTRAINT "automation_conditions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_actions" ADD CONSTRAINT "automation_actions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_impacts" ADD CONSTRAINT "insight_impacts_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "business_insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_recommendations" ADD CONSTRAINT "insight_recommendations_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "business_insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DocumentToOpportunity" ADD CONSTRAINT "_DocumentToOpportunity_A_fkey" FOREIGN KEY ("A") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DocumentToOpportunity" ADD CONSTRAINT "_DocumentToOpportunity_B_fkey" FOREIGN KEY ("B") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;