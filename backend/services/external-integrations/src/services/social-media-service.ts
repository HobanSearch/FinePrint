/**
 * Social Media Integration Service
 * Handles social media platform integrations for Fine Print AI
 */

import { EventEmitter } from 'events';
import { createServiceLogger } from '../logger';
import Redis from 'ioredis';
import axios from 'axios';
import { TwitterApi } from 'twitter-api-v2';
import crypto from 'crypto';

const logger = createServiceLogger('social-media-service');

export interface SocialProfile {
  platform: 'twitter' | 'linkedin' | 'facebook';
  profileId: string;
  profileName: string;
  profileUrl: string;
  followers?: number;
  verified?: boolean;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: Date;
  metadata?: Record<string, any>;
}

export interface SocialPost {
  id?: string;
  platform: 'twitter' | 'linkedin' | 'facebook';
  profileId: string;
  content: string;
  mediaUrls?: string[];
  link?: string;
  hashtags?: string[];
  mentions?: string[];
  scheduledTime?: Date;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  publishedAt?: Date;
  metrics?: {
    likes: number;
    shares: number;
    comments: number;
    impressions: number;
    clicks: number;
  };
  metadata?: Record<string, any>;
}

export interface SocialCampaign {
  id: string;
  name: string;
  description: string;
  posts: SocialPost[];
  startDate: Date;
  endDate?: Date;
  status: 'draft' | 'active' | 'completed' | 'paused';
  goals: {
    impressions?: number;
    engagement?: number;
    clicks?: number;
  };
  performance?: {
    totalImpressions: number;
    totalEngagement: number;
    totalClicks: number;
  };
  metadata?: Record<string, any>;
}

export interface ContentSuggestion {
  id: string;
  topic: string;
  content: string;
  platform: 'twitter' | 'linkedin' | 'facebook';
  suggestedHashtags: string[];
  suggestedTime?: Date;
  aiGenerated: boolean;
  score: number; // Relevance/quality score
  metadata?: Record<string, any>;
}

export interface SocialAnalytics {
  platform: 'twitter' | 'linkedin' | 'facebook';
  profileId: string;
  timeRange: {
    start: Date;
    end: Date;
  };
  metrics: {
    followers: number;
    followersGrowth: number;
    posts: number;
    impressions: number;
    engagement: number;
    engagementRate: number;
    clicks: number;
    shares: number;
  };
  topPosts: Array<{
    postId: string;
    content: string;
    engagement: number;
  }>;
  bestPostingTimes: Array<{
    dayOfWeek: number;
    hour: number;
    engagementRate: number;
  }>;
}

export class SocialMediaService extends EventEmitter {
  private redis: Redis;
  private initialized: boolean = false;
  private profiles: Map<string, SocialProfile> = new Map();
  private twitterClient?: TwitterApi;
  private postScheduler?: NodeJS.Timeout;

  // Platform configurations
  private readonly PLATFORM_CONFIGS = {
    twitter: {
      maxLength: 280,
      maxMedia: 4,
      maxHashtags: 10,
      apiVersion: 'v2',
    },
    linkedin: {
      maxLength: 3000,
      maxMedia: 9,
      maxHashtags: 30,
      apiVersion: 'v2',
    },
    facebook: {
      maxLength: 63206,
      maxMedia: 10,
      maxHashtags: 30,
      apiVersion: 'v18.0',
    },
  };

  constructor() {
    super();

    // Initialize Redis for caching and scheduling
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 8, // Dedicated DB for social media
    });

    // Initialize Twitter client if credentials available
    if (process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET) {
      this.twitterClient = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
      });
    }
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Social Media Service...');

      // Test Redis connection
      await this.redis.ping();

      // Load saved profiles
      await this.loadProfiles();

      // Start post scheduler
      this.startPostScheduler();

      this.initialized = true;
      logger.info('Social Media Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Social Media Service', { error });
      throw error;
    }
  }

  /**
   * Connect a social media profile
   */
  async connectProfile(profile: SocialProfile): Promise<void> {
    try {
      // Validate tokens
      await this.validateProfileTokens(profile);

      // Store profile
      this.profiles.set(`${profile.platform}:${profile.profileId}`, profile);
      
      // Save to Redis
      await this.redis.setex(
        `profile:${profile.platform}:${profile.profileId}`,
        86400 * 30, // 30 days
        JSON.stringify(profile)
      );

      logger.info('Social profile connected', {
        platform: profile.platform,
        profileId: profile.profileId,
      });

      this.emit('profile:connected', profile);
    } catch (error) {
      logger.error('Failed to connect profile', { error, profile });
      throw error;
    }
  }

  /**
   * Disconnect a social media profile
   */
  async disconnectProfile(platform: string, profileId: string): Promise<void> {
    try {
      const key = `${platform}:${profileId}`;
      this.profiles.delete(key);
      
      await this.redis.del(`profile:${platform}:${profileId}`);

      logger.info('Social profile disconnected', { platform, profileId });

      this.emit('profile:disconnected', { platform, profileId });
    } catch (error) {
      logger.error('Failed to disconnect profile', { error, platform, profileId });
      throw error;
    }
  }

  /**
   * Create and publish a social post
   */
  async publishPost(post: SocialPost): Promise<SocialPost> {
    try {
      // Validate post
      this.validatePost(post);

      // Generate post ID
      if (!post.id) {
        post.id = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Get profile
      const profile = this.profiles.get(`${post.platform}:${post.profileId}`);
      if (!profile) {
        throw new Error('Profile not found');
      }

      // Publish based on platform
      let publishedPost: any;
      switch (post.platform) {
        case 'twitter':
          publishedPost = await this.publishToTwitter(post, profile);
          break;
        case 'linkedin':
          publishedPost = await this.publishToLinkedIn(post, profile);
          break;
        case 'facebook':
          publishedPost = await this.publishToFacebook(post, profile);
          break;
        default:
          throw new Error(`Unsupported platform: ${post.platform}`);
      }

      // Update post status
      post.status = 'published';
      post.publishedAt = new Date();

      // Store post
      await this.redis.setex(
        `post:${post.id}`,
        86400 * 30, // 30 days
        JSON.stringify(post)
      );

      logger.info('Post published', {
        postId: post.id,
        platform: post.platform,
      });

      this.emit('post:published', post);

      return post;
    } catch (error) {
      logger.error('Failed to publish post', { error, post });
      post.status = 'failed';
      throw error;
    }
  }

  /**
   * Schedule a post for later
   */
  async schedulePost(post: SocialPost): Promise<SocialPost> {
    try {
      if (!post.scheduledTime || post.scheduledTime <= new Date()) {
        throw new Error('Invalid scheduled time');
      }

      // Validate post
      this.validatePost(post);

      // Generate post ID
      if (!post.id) {
        post.id = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      post.status = 'scheduled';

      // Store in Redis with expiry at scheduled time
      const ttl = Math.floor((post.scheduledTime.getTime() - Date.now()) / 1000);
      await this.redis.setex(
        `scheduled:${post.id}`,
        ttl + 3600, // Add 1 hour buffer
        JSON.stringify(post)
      );

      // Add to scheduled set
      await this.redis.zadd(
        'scheduled_posts',
        post.scheduledTime.getTime(),
        post.id
      );

      logger.info('Post scheduled', {
        postId: post.id,
        platform: post.platform,
        scheduledTime: post.scheduledTime,
      });

      this.emit('post:scheduled', post);

      return post;
    } catch (error) {
      logger.error('Failed to schedule post', { error, post });
      throw error;
    }
  }

  /**
   * Create a social media campaign
   */
  async createCampaign(
    campaign: Omit<SocialCampaign, 'id' | 'performance'>
  ): Promise<SocialCampaign> {
    try {
      const campaignId = `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const fullCampaign: SocialCampaign = {
        ...campaign,
        id: campaignId,
        performance: {
          totalImpressions: 0,
          totalEngagement: 0,
          totalClicks: 0,
        },
      };

      // Schedule all posts in the campaign
      for (const post of fullCampaign.posts) {
        if (post.scheduledTime) {
          await this.schedulePost(post);
        }
      }

      // Store campaign
      await this.redis.setex(
        `campaign:${campaignId}`,
        86400 * 90, // 90 days
        JSON.stringify(fullCampaign)
      );

      logger.info('Campaign created', {
        campaignId,
        postCount: fullCampaign.posts.length,
      });

      this.emit('campaign:created', fullCampaign);

      return fullCampaign;
    } catch (error) {
      logger.error('Failed to create campaign', { error, campaign });
      throw error;
    }
  }

  /**
   * Get analytics for a social profile
   */
  async getAnalytics(
    platform: string,
    profileId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<SocialAnalytics> {
    try {
      const profile = this.profiles.get(`${platform}:${profileId}`);
      if (!profile) {
        throw new Error('Profile not found');
      }

      // Get analytics based on platform
      let analytics: any;
      switch (platform) {
        case 'twitter':
          analytics = await this.getTwitterAnalytics(profile, timeRange);
          break;
        case 'linkedin':
          analytics = await this.getLinkedInAnalytics(profile, timeRange);
          break;
        case 'facebook':
          analytics = await this.getFacebookAnalytics(profile, timeRange);
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      // Calculate best posting times
      const bestPostingTimes = await this.calculateBestPostingTimes(
        platform,
        profileId,
        timeRange
      );

      const result: SocialAnalytics = {
        platform: platform as any,
        profileId,
        timeRange,
        metrics: analytics.metrics,
        topPosts: analytics.topPosts,
        bestPostingTimes,
      };

      // Cache analytics
      await this.redis.setex(
        `analytics:${platform}:${profileId}:${timeRange.start.getTime()}-${timeRange.end.getTime()}`,
        3600, // 1 hour
        JSON.stringify(result)
      );

      return result;
    } catch (error) {
      logger.error('Failed to get analytics', { error, platform, profileId });
      throw error;
    }
  }

  /**
   * Generate content suggestions using AI
   */
  async generateContentSuggestions(
    platform: string,
    topic: string,
    count: number = 5
  ): Promise<ContentSuggestion[]> {
    try {
      // This would integrate with the AI services to generate content
      // For now, return mock suggestions
      const suggestions: ContentSuggestion[] = [];

      for (let i = 0; i < count; i++) {
        suggestions.push({
          id: `suggestion_${Date.now()}_${i}`,
          topic,
          content: `AI-generated content about ${topic} for ${platform}`,
          platform: platform as any,
          suggestedHashtags: this.generateHashtags(topic),
          suggestedTime: this.suggestOptimalPostingTime(platform),
          aiGenerated: true,
          score: Math.random() * 100,
          metadata: {
            generatedAt: new Date(),
          },
        });
      }

      logger.info('Content suggestions generated', {
        platform,
        topic,
        count: suggestions.length,
      });

      return suggestions;
    } catch (error) {
      logger.error('Failed to generate content suggestions', { error });
      throw error;
    }
  }

  /**
   * Monitor mentions and engage
   */
  async monitorMentions(
    platform: string,
    profileId: string,
    keywords: string[]
  ): Promise<void> {
    try {
      const profile = this.profiles.get(`${platform}:${profileId}`);
      if (!profile) {
        throw new Error('Profile not found');
      }

      // Set up monitoring based on platform
      switch (platform) {
        case 'twitter':
          await this.monitorTwitterMentions(profile, keywords);
          break;
        case 'linkedin':
          await this.monitorLinkedInMentions(profile, keywords);
          break;
        case 'facebook':
          await this.monitorFacebookMentions(profile, keywords);
          break;
      }

      logger.info('Mention monitoring started', {
        platform,
        profileId,
        keywords,
      });
    } catch (error) {
      logger.error('Failed to monitor mentions', { error });
      throw error;
    }
  }

  // Private helper methods

  private async validateProfileTokens(profile: SocialProfile): Promise<void> {
    // Validate tokens with the respective platform
    switch (profile.platform) {
      case 'twitter':
        if (this.twitterClient && profile.accessToken) {
          const client = new TwitterApi(profile.accessToken);
          await client.v2.me();
        }
        break;
      case 'linkedin':
        if (profile.accessToken) {
          await axios.get('https://api.linkedin.com/v2/me', {
            headers: {
              Authorization: `Bearer ${profile.accessToken}`,
            },
          });
        }
        break;
      case 'facebook':
        if (profile.accessToken) {
          await axios.get(`https://graph.facebook.com/v18.0/me?access_token=${profile.accessToken}`);
        }
        break;
    }
  }

  private validatePost(post: SocialPost): void {
    const config = this.PLATFORM_CONFIGS[post.platform];
    
    if (!config) {
      throw new Error(`Unsupported platform: ${post.platform}`);
    }

    if (post.content.length > config.maxLength) {
      throw new Error(`Content exceeds maximum length of ${config.maxLength} characters`);
    }

    if (post.mediaUrls && post.mediaUrls.length > config.maxMedia) {
      throw new Error(`Too many media files. Maximum allowed: ${config.maxMedia}`);
    }

    if (post.hashtags && post.hashtags.length > config.maxHashtags) {
      throw new Error(`Too many hashtags. Maximum allowed: ${config.maxHashtags}`);
    }
  }

  private async publishToTwitter(
    post: SocialPost,
    profile: SocialProfile
  ): Promise<any> {
    if (!this.twitterClient || !profile.accessToken) {
      throw new Error('Twitter client not configured');
    }

    const client = new TwitterApi(profile.accessToken);
    
    const tweetData: any = {
      text: this.formatPostContent(post),
    };

    // Add media if provided
    if (post.mediaUrls && post.mediaUrls.length > 0) {
      const mediaIds = await Promise.all(
        post.mediaUrls.map(url => this.uploadTwitterMedia(client, url))
      );
      tweetData.media = { media_ids: mediaIds };
    }

    const tweet = await client.v2.tweet(tweetData);
    
    return tweet;
  }

  private async publishToLinkedIn(
    post: SocialPost,
    profile: SocialProfile
  ): Promise<any> {
    if (!profile.accessToken) {
      throw new Error('LinkedIn access token not available');
    }

    const shareData = {
      author: `urn:li:person:${profile.profileId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: this.formatPostContent(post),
          },
          shareMediaCategory: post.mediaUrls ? 'IMAGE' : 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      shareData,
      {
        headers: {
          Authorization: `Bearer ${profile.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }

  private async publishToFacebook(
    post: SocialPost,
    profile: SocialProfile
  ): Promise<any> {
    if (!profile.accessToken) {
      throw new Error('Facebook access token not available');
    }

    const postData: any = {
      message: this.formatPostContent(post),
      access_token: profile.accessToken,
    };

    if (post.link) {
      postData.link = post.link;
    }

    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${profile.profileId}/feed`,
      postData
    );

    return response.data;
  }

  private formatPostContent(post: SocialPost): string {
    let content = post.content;

    // Add hashtags
    if (post.hashtags && post.hashtags.length > 0) {
      content += '\n\n' + post.hashtags.map(tag => `#${tag}`).join(' ');
    }

    // Add mentions
    if (post.mentions && post.mentions.length > 0) {
      content = post.mentions.map(mention => `@${mention}`).join(' ') + ' ' + content;
    }

    return content;
  }

  private async uploadTwitterMedia(client: TwitterApi, url: string): Promise<string> {
    // Download media
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // Upload to Twitter
    const mediaId = await client.v1.uploadMedia(buffer, {
      mimeType: response.headers['content-type'],
    });

    return mediaId;
  }

  private async loadProfiles(): Promise<void> {
    const keys = await this.redis.keys('profile:*');
    
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const profile = JSON.parse(data) as SocialProfile;
        profile.tokenExpiry = profile.tokenExpiry 
          ? new Date(profile.tokenExpiry) 
          : undefined;
        
        this.profiles.set(`${profile.platform}:${profile.profileId}`, profile);
      }
    }

    logger.info('Loaded social profiles', { count: this.profiles.size });
  }

  private startPostScheduler(): void {
    // Check for scheduled posts every minute
    this.postScheduler = setInterval(async () => {
      try {
        const now = Date.now();
        const posts = await this.redis.zrangebyscore(
          'scheduled_posts',
          '-inf',
          now
        );

        for (const postId of posts) {
          const postData = await this.redis.get(`scheduled:${postId}`);
          if (postData) {
            const post = JSON.parse(postData) as SocialPost;
            post.scheduledTime = new Date(post.scheduledTime!);
            
            await this.publishPost(post);
            
            // Remove from scheduled
            await this.redis.zrem('scheduled_posts', postId);
            await this.redis.del(`scheduled:${postId}`);
          }
        }
      } catch (error) {
        logger.error('Post scheduler error', { error });
      }
    }, 60000); // Every minute
  }

  private async getTwitterAnalytics(
    profile: SocialProfile,
    timeRange: { start: Date; end: Date }
  ): Promise<any> {
    // This would use Twitter Analytics API
    // Returning mock data for now
    return {
      metrics: {
        followers: profile.followers || 0,
        followersGrowth: Math.random() * 100,
        posts: Math.floor(Math.random() * 50),
        impressions: Math.floor(Math.random() * 10000),
        engagement: Math.floor(Math.random() * 1000),
        engagementRate: Math.random() * 10,
        clicks: Math.floor(Math.random() * 500),
        shares: Math.floor(Math.random() * 200),
      },
      topPosts: [],
    };
  }

  private async getLinkedInAnalytics(
    profile: SocialProfile,
    timeRange: { start: Date; end: Date }
  ): Promise<any> {
    // This would use LinkedIn Analytics API
    return {
      metrics: {
        followers: profile.followers || 0,
        followersGrowth: Math.random() * 100,
        posts: Math.floor(Math.random() * 30),
        impressions: Math.floor(Math.random() * 5000),
        engagement: Math.floor(Math.random() * 500),
        engagementRate: Math.random() * 8,
        clicks: Math.floor(Math.random() * 300),
        shares: Math.floor(Math.random() * 100),
      },
      topPosts: [],
    };
  }

  private async getFacebookAnalytics(
    profile: SocialProfile,
    timeRange: { start: Date; end: Date }
  ): Promise<any> {
    // This would use Facebook Insights API
    return {
      metrics: {
        followers: profile.followers || 0,
        followersGrowth: Math.random() * 100,
        posts: Math.floor(Math.random() * 40),
        impressions: Math.floor(Math.random() * 8000),
        engagement: Math.floor(Math.random() * 800),
        engagementRate: Math.random() * 12,
        clicks: Math.floor(Math.random() * 400),
        shares: Math.floor(Math.random() * 150),
      },
      topPosts: [],
    };
  }

  private async calculateBestPostingTimes(
    platform: string,
    profileId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<SocialAnalytics['bestPostingTimes']> {
    // This would analyze historical engagement data
    // Returning common optimal times for now
    return [
      { dayOfWeek: 1, hour: 9, engagementRate: 8.5 },
      { dayOfWeek: 2, hour: 12, engagementRate: 9.2 },
      { dayOfWeek: 3, hour: 17, engagementRate: 10.1 },
      { dayOfWeek: 4, hour: 19, engagementRate: 11.3 },
      { dayOfWeek: 5, hour: 14, engagementRate: 9.8 },
    ];
  }

  private generateHashtags(topic: string): string[] {
    // This would use AI to generate relevant hashtags
    const baseHashtags = ['FinePrintAI', 'LegalTech', 'AI'];
    const topicWords = topic.split(' ').filter(word => word.length > 4);
    return [...baseHashtags, ...topicWords.map(word => word.charAt(0).toUpperCase() + word.slice(1))];
  }

  private suggestOptimalPostingTime(platform: string): Date {
    // Suggest a time within the next week during optimal hours
    const now = new Date();
    const daysToAdd = Math.floor(Math.random() * 7) + 1;
    const optimalHours = [9, 12, 17, 19]; // Common optimal posting hours
    const hour = optimalHours[Math.floor(Math.random() * optimalHours.length)];
    
    now.setDate(now.getDate() + daysToAdd);
    now.setHours(hour, 0, 0, 0);
    
    return now;
  }

  private async monitorTwitterMentions(
    profile: SocialProfile,
    keywords: string[]
  ): Promise<void> {
    // Set up Twitter streaming for mentions
    // This would use Twitter Streaming API
    logger.info('Twitter mention monitoring setup', { profileId: profile.profileId });
  }

  private async monitorLinkedInMentions(
    profile: SocialProfile,
    keywords: string[]
  ): Promise<void> {
    // Set up LinkedIn monitoring
    logger.info('LinkedIn mention monitoring setup', { profileId: profile.profileId });
  }

  private async monitorFacebookMentions(
    profile: SocialProfile,
    keywords: string[]
  ): Promise<void> {
    // Set up Facebook monitoring
    logger.info('Facebook mention monitoring setup', { profileId: profile.profileId });
  }

  /**
   * Get connected profiles
   */
  getProfiles(): SocialProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Get profile by platform and ID
   */
  getProfile(platform: string, profileId: string): SocialProfile | undefined {
    return this.profiles.get(`${platform}:${profileId}`);
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.postScheduler) {
      clearInterval(this.postScheduler);
    }
    
    this.redis.disconnect();
    logger.info('Social Media Service shutdown complete');
  }
}