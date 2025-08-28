import dotenv from 'dotenv';
import { ContentMarketingConfig } from '../types';

dotenv.config();

const requiredEnvVars = [
  'DATABASE_URL',
  'REDIS_URL',
  'OPENAI_API_KEY',
  'SENDGRID_API_KEY'
];

// Validate required environment variables
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

export const config: ContentMarketingConfig = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4000')
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama2:13b'
  },
  database: {
    url: process.env.DATABASE_URL!
  },
  redis: {
    url: process.env.REDIS_URL!
  },
  socialMedia: {
    linkedin: {
      clientId: process.env.LINKEDIN_CLIENT_ID || '',
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET || ''
    },
    twitter: {
      apiKey: process.env.TWITTER_API_KEY || '',
      apiSecret: process.env.TWITTER_API_SECRET || '',
      accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
      accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || ''
    },
    facebook: {
      appId: process.env.FACEBOOK_APP_ID || '',
      appSecret: process.env.FACEBOOK_APP_SECRET || ''
    }
  },
  email: {
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY!
    },
    mailchimp: {
      apiKey: process.env.MAILCHIMP_API_KEY || '',
      serverPrefix: process.env.MAILCHIMP_SERVER_PREFIX || ''
    }
  },
  seo: {
    ahrefs: {
      apiKey: process.env.AHREFS_API_KEY || ''
    },
    semrush: {
      apiKey: process.env.SEMRUSH_API_KEY || ''
    }
  },
  analytics: {
    googleAnalytics: {
      propertyId: process.env.GA_PROPERTY_ID || '',
      credentialsPath: process.env.GA_CREDENTIALS_PATH || ''
    }
  },
  storage: {
    bucket: process.env.STORAGE_BUCKET || 'fineprintai-content',
    region: process.env.STORAGE_REGION || 'us-east-1'
  }
};

export const serverConfig = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  environment: process.env.NODE_ENV || 'development',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true
  },
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '15 minutes'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  }
};

export const brandVoiceDefaults = {
  archetype: 'guardian' as const,
  toneAttributes: [
    'clear',
    'protective', 
    'intelligent',
    'approachable',
    'empowering'
  ],
  vocabulary: {
    preferred: [
      'protect',
      'understand',
      'clarity',
      'transparency',
      'rights',
      'empower',
      'insight',
      'analyze',
      'discover',
      'reveal',
      'safeguard',
      'inform'
    ],
    avoid: [
      'utilize',
      'leverage',
      'synergy',
      'paradigm',
      'disrupt',
      'revolutionary',
      'game-changing',
      'solutions',
      'cutting-edge'
    ]
  },
  writingStyle: {
    sentenceLength: 'varied' as const,
    paragraphLength: 'medium' as const,
    formalityLevel: 7,
    technicalLevel: 6
  },
  brandPersonality: {
    approachable: 8,
    intelligent: 9,
    protective: 10,
    clear: 9,
    empowering: 8
  },
  guidelines: [
    'Use active voice whenever possible',
    'Explain legal concepts in plain English',
    'Focus on user benefits and protection',
    'Include specific, actionable advice',
    'Maintain professional but friendly tone',
    'Use "you" to address readers directly',
    'Avoid legal jargon without explanation',
    'Include concrete examples when helpful'
  ]
};

export const contentTemplates = {
  blog_post: {
    structure: [
      'compelling_headline',
      'hook_introduction',
      'main_points_with_examples',
      'actionable_takeaways',
      'clear_call_to_action'
    ],
    wordCount: {
      short: 800,
      medium: 1500,
      long: 2500
    }
  },
  social_media_post: {
    linkedin: {
      maxLength: 3000,
      structure: ['hook', 'value', 'cta'],
      hashtagLimit: 5
    },
    twitter: {
      maxLength: 280,
      structure: ['hook', 'value'],
      hashtagLimit: 3
    },
    facebook: {
      maxLength: 2000,
      structure: ['hook', 'story', 'cta'],
      hashtagLimit: 5
    }
  },
  email_campaign: {
    structure: [
      'subject_line',
      'preheader',
      'greeting',
      'value_proposition',
      'main_content',
      'call_to_action',
      'signature'
    ],
    subjectLineLength: 50
  }
};

export default config;