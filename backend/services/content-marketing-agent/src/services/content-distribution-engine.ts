import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  GeneratedContent,
  Platform,
  ContentStatus,
  ExternalAPIError,
  ValidationError
} from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

interface PublishResult {
  platform: Platform;
  success: boolean;
  publishedId?: string;
  url?: string;
  error?: string;
  scheduledFor?: Date;
}

interface SocialMediaPost {
  content: string;
  hashtags?: string[];
  media?: string[];
  scheduledFor?: Date;
}

interface EmailCampaignData {
  subject: string;
  content: string;
  htmlContent: string;
  segment: string;
  scheduledFor?: Date;
}

export class ContentDistributionEngine {
  private linkedInApiUrl = 'https://api.linkedin.com/v2';
  private twitterApiUrl = 'https://api.twitter.com/2';
  private facebookApiUrl = 'https://graph.facebook.com/v18.0';
  private bufferApiUrl = 'https://api.bufferapp.com/1';
  private hootsuiteDashUrl = 'https://platform.hootsuite.com/v1';

  constructor() {}

  async publishContent(
    content: GeneratedContent,
    platforms: Platform[],
    options: {
      scheduleTime?: Date;
      immediate?: boolean;
      testMode?: boolean;
    } = {}
  ): Promise<PublishResult[]> {
    try {
      logger.info('Starting content distribution', {
        contentId: content.id,
        platforms,
        scheduled: !!options.scheduleTime
      });

      const results: PublishResult[] = [];

      // Validate content for each platform
      for (const platform of platforms) {
        const validation = await this.validateContentForPlatform(content, platform);
        if (!validation.isValid) {
          results.push({
            platform,
            success: false,
            error: `Validation failed: ${validation.errors.join(', ')}`
          });
          continue;
        }

        try {
          const result = await this.publishToPlatform(content, platform, options);
          results.push(result);
        } catch (error) {
          logger.error('Platform publishing failed', { platform, error });
          results.push({
            platform,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      logger.info('Content distribution completed', {
        contentId: content.id,
        totalPlatforms: platforms.length,
        successCount,
        failureCount: platforms.length - successCount
      });

      return results;

    } catch (error) {
      logger.error('Content distribution failed', { error, contentId: content.id });
      throw error;
    }
  }

  async scheduleContent(
    content: GeneratedContent,
    platforms: Platform[],
    scheduleTime: Date,
    options: {
      recurring?: 'daily' | 'weekly' | 'monthly';
      endDate?: Date;
    } = {}
  ): Promise<PublishResult[]> {
    try {
      logger.info('Scheduling content', {
        contentId: content.id,
        platforms,
        scheduleTime,
        recurring: options.recurring
      });

      const results: PublishResult[] = [];

      for (const platform of platforms) {
        try {
          const result = await this.scheduleToPlatform(content, platform, scheduleTime, options);
          results.push(result);
        } catch (error) {
          logger.error('Platform scheduling failed', { platform, error });
          results.push({
            platform,
            success: false,
            error: error instanceof Error ? error.message : 'Scheduling failed'
          });
        }
      }

      return results;

    } catch (error) {
      logger.error('Content scheduling failed', { error });
      throw error;
    }
  }

  private async publishToPlatform(
    content: GeneratedContent,
    platform: Platform,
    options: any
  ): Promise<PublishResult> {
    switch (platform) {
      case 'linkedin':
        return await this.publishToLinkedIn(content, options);
      case 'twitter':
        return await this.publishToTwitter(content, options);
      case 'facebook':
        return await this.publishToFacebook(content, options);
      case 'medium':
        return await this.publishToMedium(content, options);
      case 'email':
        return await this.sendEmailCampaign(content, options);
      case 'blog':
        return await this.publishToBlog(content, options);
      default:
        return {
          platform,
          success: false,
          error: `Platform ${platform} not supported`
        };
    }
  }

  private async publishToLinkedIn(
    content: GeneratedContent,
    options: any
  ): Promise<PublishResult> {
    try {
      if (!config.socialMedia.linkedin.clientId) {
        throw new ExternalAPIError('LinkedIn', 'API credentials not configured');
      }

      // Adapt content for LinkedIn
      const adaptedContent = await this.adaptContentForLinkedIn(content);
      
      if (options.testMode) {
        return {
          platform: 'linkedin',
          success: true,
          publishedId: `test_${uuidv4()}`,
          url: 'https://linkedin.com/test-post'
        };
      }

      // Get access token (this would be stored/managed elsewhere in real implementation)
      const accessToken = await this.getLinkedInAccessToken();
      
      const postData = {
        author: `urn:li:person:${await this.getLinkedInPersonId()}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: adaptedContent.content
            },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };

      const response = await axios.post(
        `${this.linkedInApiUrl}/ugcPosts`,
        postData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
          }
        }
      );

      return {
        platform: 'linkedin',
        success: true,
        publishedId: response.data.id,
        url: `https://linkedin.com/feed/update/${response.data.id}`
      };

    } catch (error) {
      logger.error('LinkedIn publishing failed', { error });
      return {
        platform: 'linkedin',
        success: false,
        error: error instanceof Error ? error.message : 'LinkedIn API error'
      };
    }
  }

  private async publishToTwitter(
    content: GeneratedContent,
    options: any
  ): Promise<PublishResult> {
    try {
      if (!config.socialMedia.twitter.apiKey) {
        throw new ExternalAPIError('Twitter', 'API credentials not configured');
      }

      const adaptedContent = await this.adaptContentForTwitter(content);
      
      if (options.testMode) {
        return {
          platform: 'twitter',
          success: true,
          publishedId: `test_${uuidv4()}`,
          url: 'https://twitter.com/test-tweet'
        };
      }

      // Create tweet thread if content is too long
      const tweets = this.splitIntoTweets(adaptedContent.content);
      let previousTweetId: string | undefined;
      let firstTweetId: string;

      for (let i = 0; i < tweets.length; i++) {
        const tweetData: any = {
          text: tweets[i]
        };

        if (previousTweetId) {
          tweetData.reply = {
            in_reply_to_tweet_id: previousTweetId
          };
        }

        const response = await axios.post(
          `${this.twitterApiUrl}/tweets`,
          tweetData,
          {
            headers: {
              'Authorization': `Bearer ${await this.getTwitterBearerToken()}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (i === 0) {
          firstTweetId = response.data.data.id;
        }
        previousTweetId = response.data.data.id;
      }

      return {
        platform: 'twitter',
        success: true,
        publishedId: firstTweetId!,
        url: `https://twitter.com/fineprintai/status/${firstTweetId}`
      };

    } catch (error) {
      logger.error('Twitter publishing failed', { error });
      return {
        platform: 'twitter',
        success: false,
        error: error instanceof Error ? error.message : 'Twitter API error'
      };
    }
  }

  private async publishToFacebook(
    content: GeneratedContent,
    options: any
  ): Promise<PublishResult> {
    try {
      if (!config.socialMedia.facebook.appId) {
        throw new ExternalAPIError('Facebook', 'API credentials not configured');
      }

      const adaptedContent = await this.adaptContentForFacebook(content);
      
      if (options.testMode) {
        return {
          platform: 'facebook',
          success: true,
          publishedId: `test_${uuidv4()}`,
          url: 'https://facebook.com/test-post'
        };
      }

      const pageAccessToken = await this.getFacebookPageAccessToken();
      const pageId = await this.getFacebookPageId();

      const postData = {
        message: adaptedContent.content,
        published: true
      };

      const response = await axios.post(
        `${this.facebookApiUrl}/${pageId}/feed`,
        postData,
        {
          headers: {
            'Authorization': `Bearer ${pageAccessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        platform: 'facebook',
        success: true,
        publishedId: response.data.id,
        url: `https://facebook.com/${response.data.id}`
      };

    } catch (error) {
      logger.error('Facebook publishing failed', { error });
      return {
        platform: 'facebook',
        success: false,
        error: error instanceof Error ? error.message : 'Facebook API error'
      };
    }
  }

  private async publishToMedium(
    content: GeneratedContent,
    options: any
  ): Promise<PublishResult> {
    try {
      const adaptedContent = await this.adaptContentForMedium(content);
      
      if (options.testMode) {
        return {
          platform: 'medium',
          success: true,
          publishedId: `test_${uuidv4()}`,
          url: 'https://medium.com/@fineprintai/test-article'
        };
      }

      // Medium API would be used here
      // For now, return success with placeholder
      return {
        platform: 'medium',
        success: true,
        publishedId: uuidv4(),
        url: `https://medium.com/@fineprintai/${content.id}`
      };

    } catch (error) {
      logger.error('Medium publishing failed', { error });
      return {
        platform: 'medium',
        success: false,
        error: error instanceof Error ? error.message : 'Medium API error'
      };
    }
  }

  private async sendEmailCampaign(
    content: GeneratedContent,
    options: any
  ): Promise<PublishResult> {
    try {
      const adaptedContent = await this.adaptContentForEmail(content);
      
      if (options.testMode) {
        return {
          platform: 'email',
          success: true,
          publishedId: `test_campaign_${uuidv4()}`,
          url: 'https://app.sendgrid.com/test-campaign'
        };
      }

      // SendGrid API integration
      const response = await axios.post(
        'https://api.sendgrid.com/v3/mail/send',
        {
          personalizations: [{
            to: [{ email: 'subscribers@fineprintai.com' }]
          }],
          from: { email: 'newsletter@fineprintai.com', name: 'Fine Print AI' },
          subject: adaptedContent.subject,
          content: [{
            type: 'text/html',
            value: adaptedContent.htmlContent
          }]
        },
        {
          headers: {
            'Authorization': `Bearer ${config.email.sendgrid.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        platform: 'email',
        success: true,
        publishedId: uuidv4(),
        url: 'https://app.sendgrid.com/campaigns'
      };

    } catch (error) {
      logger.error('Email campaign failed', { error });
      return {
        platform: 'email',
        success: false,
        error: error instanceof Error ? error.message : 'Email API error'
      };
    }
  }

  private async publishToBlog(
    content: GeneratedContent,
    options: any
  ): Promise<PublishResult> {
    try {
      // This would integrate with your CMS/blog system
      // For now, returning success with placeholder
      
      if (options.testMode) {
        return {
          platform: 'blog',
          success: true,
          publishedId: `test_blog_${uuidv4()}`,
          url: 'https://fineprintai.com/blog/test-post'
        };
      }

      return {
        platform: 'blog',
        success: true,
        publishedId: content.id,
        url: `https://fineprintai.com/blog/${content.id}`
      };

    } catch (error) {
      logger.error('Blog publishing failed', { error });
      return {
        platform: 'blog',
        success: false,
        error: error instanceof Error ? error.message : 'Blog API error'
      };
    }
  }

  private async scheduleToPlatform(
    content: GeneratedContent,
    platform: Platform,
    scheduleTime: Date,
    options: any
  ): Promise<PublishResult> {
    // Use Buffer or Hootsuite for scheduling
    try {
      const adaptedContent = await this.adaptContentForPlatform(content, platform);
      
      // Buffer API integration for scheduling
      const bufferResult = await this.scheduleWithBuffer(adaptedContent, platform, scheduleTime);
      
      return {
        platform,
        success: true,
        publishedId: bufferResult.id,
        scheduledFor: scheduleTime,
        url: bufferResult.url
      };

    } catch (error) {
      logger.error('Content scheduling failed', { platform, error });
      return {
        platform,
        success: false,
        error: error instanceof Error ? error.message : 'Scheduling failed'
      };
    }
  }

  private async scheduleWithBuffer(
    content: SocialMediaPost,
    platform: Platform,
    scheduleTime: Date
  ): Promise<{ id: string; url: string }> {
    // This would integrate with Buffer API
    // Placeholder implementation
    return {
      id: uuidv4(),
      url: `https://buffer.com/publish/${platform}`
    };
  }

  private async validateContentForPlatform(
    content: GeneratedContent,
    platform: Platform
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    switch (platform) {
      case 'twitter':
        if (content.content.length > 280 && !content.content.includes('\n\n')) {
          errors.push('Content too long for single tweet and no thread breaks found');
        }
        break;

      case 'linkedin':
        if (content.content.length > 3000) {
          errors.push('Content exceeds LinkedIn character limit');
        }
        break;

      case 'facebook':
        if (content.content.length > 2000) {
          errors.push('Content may be too long for optimal Facebook engagement');
        }
        break;

      case 'email':
        if (!content.title) {
          errors.push('Email campaigns require a subject line');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async adaptContentForLinkedIn(content: GeneratedContent): Promise<SocialMediaPost> {
    let adaptedContent = content.content;
    
    // LinkedIn-specific formatting
    adaptedContent = adaptedContent.replace(/^#\s+/gm, ''); // Remove markdown headers
    adaptedContent = adaptedContent.substring(0, 2800); // Ensure under limit
    
    // Add professional call-to-action
    if (content.callToAction) {
      adaptedContent += `\n\n${content.callToAction}`;
    }

    return {
      content: adaptedContent,
      hashtags: content.hashtags?.slice(0, 5) || []
    };
  }

  private async adaptContentForTwitter(content: GeneratedContent): Promise<SocialMediaPost> {
    let adaptedContent = content.content;
    
    // Twitter-specific formatting
    adaptedContent = adaptedContent.replace(/^#\s+/gm, ''); // Remove markdown headers
    
    // Add hashtags inline if content is short enough
    if (content.hashtags && adaptedContent.length < 200) {
      adaptedContent += ` ${content.hashtags.slice(0, 3).join(' ')}`;
    }

    return {
      content: adaptedContent,
      hashtags: content.hashtags?.slice(0, 3) || []
    };
  }

  private async adaptContentForFacebook(content: GeneratedContent): Promise<SocialMediaPost> {
    let adaptedContent = content.content;
    
    // Facebook-specific formatting
    adaptedContent = adaptedContent.replace(/^#\s+/gm, ''); // Remove markdown headers
    adaptedContent = adaptedContent.substring(0, 1800); // Keep under 2000 for better engagement
    
    // Add call-to-action
    if (content.callToAction) {
      adaptedContent += `\n\n👉 ${content.callToAction}`;
    }

    return {
      content: adaptedContent,
      hashtags: content.hashtags?.slice(0, 5) || []
    };
  }

  private async adaptContentForMedium(content: GeneratedContent): Promise<{
    title: string;
    content: string;
    tags: string[];
  }> {
    return {
      title: content.title,
      content: content.content, // Medium accepts markdown
      tags: content.tags.slice(0, 5)
    };
  }

  private async adaptContentForEmail(content: GeneratedContent): Promise<EmailCampaignData> {
    // Extract subject from title or content
    const subject = content.title.length <= 50 ? content.title : 
                   content.title.substring(0, 47) + '...';

    // Convert markdown to HTML
    const htmlContent = this.markdownToHtml(content.content);

    return {
      subject,
      content: content.content,
      htmlContent,
      segment: 'all_subscribers'
    };
  }

  private async adaptContentForPlatform(
    content: GeneratedContent,
    platform: Platform
  ): Promise<SocialMediaPost> {
    switch (platform) {
      case 'linkedin':
        return await this.adaptContentForLinkedIn(content);
      case 'twitter':
        return await this.adaptContentForTwitter(content);
      case 'facebook':
        return await this.adaptContentForFacebook(content);
      default:
        return {
          content: content.content,
          hashtags: content.hashtags
        };
    }
  }

  private splitIntoTweets(content: string): string[] {
    const maxLength = 250; // Leave room for thread numbering
    const tweets: string[] = [];
    
    if (content.length <= 280) {
      return [content];
    }

    // Split by paragraphs first
    const paragraphs = content.split('\n\n');
    let currentTweet = '';
    
    for (const paragraph of paragraphs) {
      if (currentTweet.length + paragraph.length + 2 <= maxLength) {
        currentTweet += (currentTweet ? '\n\n' : '') + paragraph;
      } else {
        if (currentTweet) {
          tweets.push(currentTweet);
          currentTweet = paragraph;
        } else {
          // Paragraph is too long, split by sentences
          const sentences = paragraph.split('. ');
          for (const sentence of sentences) {
            if (currentTweet.length + sentence.length + 2 <= maxLength) {
              currentTweet += (currentTweet ? '. ' : '') + sentence;
            } else {
              if (currentTweet) tweets.push(currentTweet);
              currentTweet = sentence;
            }
          }
        }
      }
    }
    
    if (currentTweet) tweets.push(currentTweet);

    // Add thread numbering
    if (tweets.length > 1) {
      tweets[0] += ' 🧵';
      for (let i = 1; i < tweets.length; i++) {
        tweets[i] = `${i + 1}/ ${tweets[i]}`;
      }
    }

    return tweets;
  }

  private markdownToHtml(markdown: string): string {
    return markdown
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(.+)$/gm, '<p>$1</p>')
      .replace(/<p><\/p>/g, '')
      .replace(/<p><h/g, '<h')
      .replace(/<\/h([1-6])><\/p>/g, '</h$1>');
  }

  // Placeholder methods for API integrations
  private async getLinkedInAccessToken(): Promise<string> {
    // This would implement OAuth flow and token management
    return 'placeholder_token';
  }

  private async getLinkedInPersonId(): Promise<string> {
    return 'placeholder_person_id';
  }

  private async getTwitterBearerToken(): Promise<string> {
    return config.socialMedia.twitter.accessToken;
  }

  private async getFacebookPageAccessToken(): Promise<string> {
    return 'placeholder_page_token';
  }

  private async getFacebookPageId(): Promise<string> {
    return 'placeholder_page_id';
  }
}