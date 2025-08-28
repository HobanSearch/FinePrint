import { z } from 'zod';

// Content Types
export const ContentTypeSchema = z.enum([
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
export type ContentType = z.infer<typeof ContentTypeSchema>;

// Platform Types
export const PlatformSchema = z.enum([
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
export type Platform = z.infer<typeof PlatformSchema>;

// Content Status
export const ContentStatusSchema = z.enum([
  'draft',
  'review',
  'approved',
  'scheduled',
  'published',
  'archived'
]);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

// Campaign Types
export const CampaignTypeSchema = z.enum([
  'awareness',
  'lead_generation',
  'product_launch',
  'education',
  'engagement',
  'conversion',
  'retention',
  'seasonal'
]);
export type CampaignType = z.infer<typeof CampaignTypeSchema>;

// Content Creation Request
export const ContentCreationRequestSchema = z.object({
  type: ContentTypeSchema,
  topic: z.string(),
  targetAudience: z.string(),
  keywords: z.array(z.string()).optional(),
  tone: z.enum(['professional', 'casual', 'authoritative', 'friendly', 'urgent']).optional(),
  length: z.enum(['short', 'medium', 'long']).optional(),
  platform: PlatformSchema.optional(),
  includeCallToAction: z.boolean().optional(),
  brandVoiceLevel: z.number().min(1).max(10).optional(),
  seoOptimized: z.boolean().optional(),
  includeVisuals: z.boolean().optional(),
  scheduledFor: z.date().optional(),
  campaignId: z.string().optional()
});
export type ContentCreationRequest = z.infer<typeof ContentCreationRequestSchema>;

// Generated Content
export const GeneratedContentSchema = z.object({
  id: z.string(),
  type: ContentTypeSchema,
  title: z.string(),
  content: z.string(),
  excerpt: z.string().optional(),
  tags: z.array(z.string()),
  keywords: z.array(z.string()),
  platform: PlatformSchema,
  status: ContentStatusSchema,
  tone: z.string(),
  wordCount: z.number(),
  readingTime: z.number(),
  seoScore: z.number().min(0).max(100),
  engagementPrediction: z.number().min(0).max(100),
  callToAction: z.string().optional(),
  visualSuggestions: z.array(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  publishedAt: z.date().optional(),
  authorId: z.string(),
  campaignId: z.string().optional()
});
export type GeneratedContent = z.infer<typeof GeneratedContentSchema>;

// SEO Analysis
export const SEOAnalysisSchema = z.object({
  keywordDensity: z.record(z.number()),
  readabilityScore: z.number(),
  metaDescription: z.string(),
  metaTitle: z.string(),
  headingStructure: z.array(z.object({
    level: z.number(),
    text: z.string()
  })),
  internalLinks: z.array(z.string()),
  externalLinks: z.array(z.string()),
  imageAltTags: z.array(z.string()),
  suggestions: z.array(z.string()),
  score: z.number().min(0).max(100)
});
export type SEOAnalysis = z.infer<typeof SEOAnalysisSchema>;

// Content Calendar Entry
export const ContentCalendarEntrySchema = z.object({
  id: z.string(),
  contentId: z.string(),
  title: z.string(),
  type: ContentTypeSchema,
  platform: PlatformSchema,
  scheduledDate: z.date(),
  status: ContentStatusSchema,
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  campaignId: z.string().optional(),
  assignedTo: z.string().optional(),
  estimatedEngagement: z.number().optional(),
  actualEngagement: z.number().optional(),
  notes: z.string().optional()
});
export type ContentCalendarEntry = z.infer<typeof ContentCalendarEntrySchema>;

// Campaign
export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: CampaignTypeSchema,
  startDate: z.date(),
  endDate: z.date(),
  targetAudience: z.string(),
  goals: z.array(z.string()),
  kpis: z.record(z.number()),
  budget: z.number().optional(),
  status: z.enum(['planning', 'active', 'paused', 'completed', 'cancelled']),
  contentIds: z.array(z.string()),
  platforms: z.array(PlatformSchema),
  createdAt: z.date(),
  updatedAt: z.date()
});
export type Campaign = z.infer<typeof CampaignSchema>;

// Analytics Data
export const AnalyticsDataSchema = z.object({
  contentId: z.string(),
  platform: PlatformSchema,
  date: z.date(),
  impressions: z.number(),
  clicks: z.number(),
  shares: z.number(),
  likes: z.number(),
  comments: z.number(),
  saves: z.number(),
  engagementRate: z.number(),
  clickThroughRate: z.number(),
  conversionRate: z.number(),
  leads: z.number(),
  revenue: z.number().optional(),
  cost: z.number().optional(),
  roi: z.number().optional()
});
export type AnalyticsData = z.infer<typeof AnalyticsDataSchema>;

// Brand Voice Configuration
export const BrandVoiceConfigSchema = z.object({
  archetype: z.enum(['guardian', 'sage', 'hero', 'innocent', 'rebel', 'magician']),
  toneAttributes: z.array(z.string()),
  vocabulary: z.object({
    preferred: z.array(z.string()),
    avoid: z.array(z.string())
  }),
  writingStyle: z.object({
    sentenceLength: z.enum(['short', 'medium', 'long', 'varied']),
    paragraphLength: z.enum(['short', 'medium', 'long']),
    formalityLevel: z.number().min(1).max(10),
    technicalLevel: z.number().min(1).max(10)
  }),
  brandPersonality: z.object({
    approachable: z.number().min(1).max(10),
    intelligent: z.number().min(1).max(10),
    protective: z.number().min(1).max(10),
    clear: z.number().min(1).max(10),
    empowering: z.number().min(1).max(10)
  }),
  examples: z.array(z.string()),
  guidelines: z.array(z.string())
});
export type BrandVoiceConfig = z.infer<typeof BrandVoiceConfigSchema>;

// Keyword Research
export const KeywordDataSchema = z.object({
  keyword: z.string(),
  searchVolume: z.number(),
  difficulty: z.number().min(0).max(100),
  cpc: z.number().optional(),
  competition: z.enum(['low', 'medium', 'high']),
  trend: z.enum(['rising', 'stable', 'declining']),
  relatedKeywords: z.array(z.string()),
  intent: z.enum(['informational', 'commercial', 'transactional', 'navigational']),
  source: z.enum(['google', 'ahrefs', 'semrush', 'ubersuggest'])
});
export type KeywordData = z.infer<typeof KeywordDataSchema>;

// Email Campaign
export const EmailCampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  content: z.string(),
  htmlContent: z.string(),
  recipientSegment: z.string(),
  scheduledFor: z.date().optional(),
  status: z.enum(['draft', 'scheduled', 'sent', 'cancelled']),
  analytics: z.object({
    sent: z.number(),
    delivered: z.number(),
    opened: z.number(),
    clicked: z.number(),
    unsubscribed: z.number(),
    bounced: z.number(),
    openRate: z.number(),
    clickRate: z.number(),
    unsubscribeRate: z.number()
  }).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});
export type EmailCampaign = z.infer<typeof EmailCampaignSchema>;

// Lead Generation
export const LeadSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  source: z.string(),
  campaign: z.string().optional(),
  score: z.number().min(0).max(100),
  status: z.enum(['new', 'qualified', 'nurturing', 'converted', 'lost']),
  tags: z.array(z.string()),
  customFields: z.record(z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});
export type Lead = z.infer<typeof LeadSchema>;

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ContentCreationResponse extends ApiResponse {
  data: GeneratedContent;
}

export interface ContentListResponse extends ApiResponse {
  data: GeneratedContent[];
}

export interface CampaignResponse extends ApiResponse {
  data: Campaign;
}

export interface AnalyticsResponse extends ApiResponse {
  data: AnalyticsData[];
}

// Configuration Types
export interface ContentMarketingConfig {
  openai: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };
  ollama: {
    baseUrl: string;
    model: string;
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  socialMedia: {
    linkedin: {
      clientId: string;
      clientSecret: string;
    };
    twitter: {
      apiKey: string;
      apiSecret: string;
      accessToken: string;
      accessTokenSecret: string;
    };
    facebook: {
      appId: string;
      appSecret: string;
    };
  };
  email: {
    sendgrid: {
      apiKey: string;
    };
    mailchimp: {
      apiKey: string;
      serverPrefix: string;
    };
  };
  seo: {
    ahrefs: {
      apiKey: string;
    };
    semrush: {
      apiKey: string;
    };
  };
  analytics: {
    googleAnalytics: {
      propertyId: string;
      credentialsPath: string;
    };
  };
  storage: {
    bucket: string;
    region: string;
  };
}

// Error Types
export class ContentMarketingError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'ContentMarketingError';
  }
}

export class ValidationError extends ContentMarketingError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class NotFoundError extends ContentMarketingError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class ExternalAPIError extends ContentMarketingError {
  constructor(service: string, message: string) {
    super(`${service} API error: ${message}`, 'EXTERNAL_API_ERROR', 502);
  }
}