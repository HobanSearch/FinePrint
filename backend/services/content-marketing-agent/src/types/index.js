"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalAPIError = exports.NotFoundError = exports.ValidationError = exports.ContentMarketingError = exports.LeadSchema = exports.EmailCampaignSchema = exports.KeywordDataSchema = exports.BrandVoiceConfigSchema = exports.AnalyticsDataSchema = exports.CampaignSchema = exports.ContentCalendarEntrySchema = exports.SEOAnalysisSchema = exports.GeneratedContentSchema = exports.ContentCreationRequestSchema = exports.CampaignTypeSchema = exports.ContentStatusSchema = exports.PlatformSchema = exports.ContentTypeSchema = void 0;
const zod_1 = require("zod");
exports.ContentTypeSchema = zod_1.z.enum([
    'blog_post',
    'social_media_post',
    'email_campaign',
    'video_script',
    'podcast_outline',
    'infographic_content',
    'case_study',
    'whitepaper',
    'press_release',
    'landing_page',
    'newsletter',
    'guide',
    'tutorial'
]);
exports.PlatformSchema = zod_1.z.enum([
    'linkedin',
    'twitter',
    'medium',
    'facebook',
    'instagram',
    'youtube',
    'tiktok',
    'reddit',
    'hackernews',
    'blog',
    'email',
    'website'
]);
exports.ContentStatusSchema = zod_1.z.enum([
    'draft',
    'review',
    'approved',
    'scheduled',
    'published',
    'archived'
]);
exports.CampaignTypeSchema = zod_1.z.enum([
    'awareness',
    'lead_generation',
    'product_launch',
    'education',
    'engagement',
    'conversion',
    'retention',
    'seasonal'
]);
exports.ContentCreationRequestSchema = zod_1.z.object({
    type: exports.ContentTypeSchema,
    topic: zod_1.z.string(),
    targetAudience: zod_1.z.string(),
    keywords: zod_1.z.array(zod_1.z.string()).optional(),
    tone: zod_1.z.enum(['professional', 'casual', 'authoritative', 'friendly', 'urgent']).optional(),
    length: zod_1.z.enum(['short', 'medium', 'long']).optional(),
    platform: exports.PlatformSchema.optional(),
    includeCallToAction: zod_1.z.boolean().optional(),
    brandVoiceLevel: zod_1.z.number().min(1).max(10).optional(),
    seoOptimized: zod_1.z.boolean().optional(),
    includeVisuals: zod_1.z.boolean().optional(),
    scheduledFor: zod_1.z.date().optional(),
    campaignId: zod_1.z.string().optional()
});
exports.GeneratedContentSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: exports.ContentTypeSchema,
    title: zod_1.z.string(),
    content: zod_1.z.string(),
    excerpt: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()),
    keywords: zod_1.z.array(zod_1.z.string()),
    platform: exports.PlatformSchema,
    status: exports.ContentStatusSchema,
    tone: zod_1.z.string(),
    wordCount: zod_1.z.number(),
    readingTime: zod_1.z.number(),
    seoScore: zod_1.z.number().min(0).max(100),
    engagementPrediction: zod_1.z.number().min(0).max(100),
    callToAction: zod_1.z.string().optional(),
    visualSuggestions: zod_1.z.array(zod_1.z.string()).optional(),
    hashtags: zod_1.z.array(zod_1.z.string()).optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
    publishedAt: zod_1.z.date().optional(),
    authorId: zod_1.z.string(),
    campaignId: zod_1.z.string().optional()
});
exports.SEOAnalysisSchema = zod_1.z.object({
    keywordDensity: zod_1.z.record(zod_1.z.number()),
    readabilityScore: zod_1.z.number(),
    metaDescription: zod_1.z.string(),
    metaTitle: zod_1.z.string(),
    headingStructure: zod_1.z.array(zod_1.z.object({
        level: zod_1.z.number(),
        text: zod_1.z.string()
    })),
    internalLinks: zod_1.z.array(zod_1.z.string()),
    externalLinks: zod_1.z.array(zod_1.z.string()),
    imageAltTags: zod_1.z.array(zod_1.z.string()),
    suggestions: zod_1.z.array(zod_1.z.string()),
    score: zod_1.z.number().min(0).max(100)
});
exports.ContentCalendarEntrySchema = zod_1.z.object({
    id: zod_1.z.string(),
    contentId: zod_1.z.string(),
    title: zod_1.z.string(),
    type: exports.ContentTypeSchema,
    platform: exports.PlatformSchema,
    scheduledDate: zod_1.z.date(),
    status: exports.ContentStatusSchema,
    priority: zod_1.z.enum(['low', 'medium', 'high', 'urgent']),
    campaignId: zod_1.z.string().optional(),
    assignedTo: zod_1.z.string().optional(),
    estimatedEngagement: zod_1.z.number().optional(),
    actualEngagement: zod_1.z.number().optional(),
    notes: zod_1.z.string().optional()
});
exports.CampaignSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    type: exports.CampaignTypeSchema,
    startDate: zod_1.z.date(),
    endDate: zod_1.z.date(),
    targetAudience: zod_1.z.string(),
    goals: zod_1.z.array(zod_1.z.string()),
    kpis: zod_1.z.record(zod_1.z.number()),
    budget: zod_1.z.number().optional(),
    status: zod_1.z.enum(['planning', 'active', 'paused', 'completed', 'cancelled']),
    contentIds: zod_1.z.array(zod_1.z.string()),
    platforms: zod_1.z.array(exports.PlatformSchema),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date()
});
exports.AnalyticsDataSchema = zod_1.z.object({
    contentId: zod_1.z.string(),
    platform: exports.PlatformSchema,
    date: zod_1.z.date(),
    impressions: zod_1.z.number(),
    clicks: zod_1.z.number(),
    shares: zod_1.z.number(),
    likes: zod_1.z.number(),
    comments: zod_1.z.number(),
    saves: zod_1.z.number(),
    engagementRate: zod_1.z.number(),
    clickThroughRate: zod_1.z.number(),
    conversionRate: zod_1.z.number(),
    leads: zod_1.z.number(),
    revenue: zod_1.z.number().optional(),
    cost: zod_1.z.number().optional(),
    roi: zod_1.z.number().optional()
});
exports.BrandVoiceConfigSchema = zod_1.z.object({
    archetype: zod_1.z.enum(['guardian', 'sage', 'hero', 'innocent', 'rebel', 'magician']),
    toneAttributes: zod_1.z.array(zod_1.z.string()),
    vocabulary: zod_1.z.object({
        preferred: zod_1.z.array(zod_1.z.string()),
        avoid: zod_1.z.array(zod_1.z.string())
    }),
    writingStyle: zod_1.z.object({
        sentenceLength: zod_1.z.enum(['short', 'medium', 'long', 'varied']),
        paragraphLength: zod_1.z.enum(['short', 'medium', 'long']),
        formalityLevel: zod_1.z.number().min(1).max(10),
        technicalLevel: zod_1.z.number().min(1).max(10)
    }),
    brandPersonality: zod_1.z.object({
        approachable: zod_1.z.number().min(1).max(10),
        intelligent: zod_1.z.number().min(1).max(10),
        protective: zod_1.z.number().min(1).max(10),
        clear: zod_1.z.number().min(1).max(10),
        empowering: zod_1.z.number().min(1).max(10)
    }),
    examples: zod_1.z.array(zod_1.z.string()),
    guidelines: zod_1.z.array(zod_1.z.string())
});
exports.KeywordDataSchema = zod_1.z.object({
    keyword: zod_1.z.string(),
    searchVolume: zod_1.z.number(),
    difficulty: zod_1.z.number().min(0).max(100),
    cpc: zod_1.z.number().optional(),
    competition: zod_1.z.enum(['low', 'medium', 'high']),
    trend: zod_1.z.enum(['rising', 'stable', 'declining']),
    relatedKeywords: zod_1.z.array(zod_1.z.string()),
    intent: zod_1.z.enum(['informational', 'commercial', 'transactional', 'navigational']),
    source: zod_1.z.enum(['google', 'ahrefs', 'semrush', 'ubersuggest'])
});
exports.EmailCampaignSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    subject: zod_1.z.string(),
    content: zod_1.z.string(),
    htmlContent: zod_1.z.string(),
    recipientSegment: zod_1.z.string(),
    scheduledFor: zod_1.z.date().optional(),
    status: zod_1.z.enum(['draft', 'scheduled', 'sent', 'cancelled']),
    analytics: zod_1.z.object({
        sent: zod_1.z.number(),
        delivered: zod_1.z.number(),
        opened: zod_1.z.number(),
        clicked: zod_1.z.number(),
        unsubscribed: zod_1.z.number(),
        bounced: zod_1.z.number(),
        openRate: zod_1.z.number(),
        clickRate: zod_1.z.number(),
        unsubscribeRate: zod_1.z.number()
    }).optional(),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date()
});
exports.LeadSchema = zod_1.z.object({
    id: zod_1.z.string(),
    email: zod_1.z.string(),
    firstName: zod_1.z.string().optional(),
    lastName: zod_1.z.string().optional(),
    company: zod_1.z.string().optional(),
    title: zod_1.z.string().optional(),
    source: zod_1.z.string(),
    campaign: zod_1.z.string().optional(),
    score: zod_1.z.number().min(0).max(100),
    status: zod_1.z.enum(['new', 'qualified', 'nurturing', 'converted', 'lost']),
    tags: zod_1.z.array(zod_1.z.string()),
    customFields: zod_1.z.record(zod_1.z.any()).optional(),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date()
});
class ContentMarketingError extends Error {
    code;
    statusCode;
    constructor(message, code, statusCode = 500) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'ContentMarketingError';
    }
}
exports.ContentMarketingError = ContentMarketingError;
class ValidationError extends ContentMarketingError {
    constructor(message) {
        super(message, 'VALIDATION_ERROR', 400);
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends ContentMarketingError {
    constructor(resource) {
        super(`${resource} not found`, 'NOT_FOUND', 404);
    }
}
exports.NotFoundError = NotFoundError;
class ExternalAPIError extends ContentMarketingError {
    constructor(service, message) {
        super(`${service} API error: ${message}`, 'EXTERNAL_API_ERROR', 502);
    }
}
exports.ExternalAPIError = ExternalAPIError;
//# sourceMappingURL=index.js.map