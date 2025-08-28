"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentDistributionEngine = void 0;
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const types_1 = require("../types");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
class ContentDistributionEngine {
    linkedInApiUrl = 'https://api.linkedin.com/v2';
    twitterApiUrl = 'https://api.twitter.com/2';
    facebookApiUrl = 'https://graph.facebook.com/v18.0';
    bufferApiUrl = 'https://api.bufferapp.com/1';
    hootsuiteDashUrl = 'https://platform.hootsuite.com/v1';
    constructor() { }
    async publishContent(content, platforms, options = {}) {
        try {
            logger_1.logger.info('Starting content distribution', {
                contentId: content.id,
                platforms,
                scheduled: !!options.scheduleTime
            });
            const results = [];
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
                }
                catch (error) {
                    logger_1.logger.error('Platform publishing failed', { platform, error });
                    results.push({
                        platform,
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
            const successCount = results.filter(r => r.success).length;
            logger_1.logger.info('Content distribution completed', {
                contentId: content.id,
                totalPlatforms: platforms.length,
                successCount,
                failureCount: platforms.length - successCount
            });
            return results;
        }
        catch (error) {
            logger_1.logger.error('Content distribution failed', { error, contentId: content.id });
            throw error;
        }
    }
    async scheduleContent(content, platforms, scheduleTime, options = {}) {
        try {
            logger_1.logger.info('Scheduling content', {
                contentId: content.id,
                platforms,
                scheduleTime,
                recurring: options.recurring
            });
            const results = [];
            for (const platform of platforms) {
                try {
                    const result = await this.scheduleToPlatform(content, platform, scheduleTime, options);
                    results.push(result);
                }
                catch (error) {
                    logger_1.logger.error('Platform scheduling failed', { platform, error });
                    results.push({
                        platform,
                        success: false,
                        error: error instanceof Error ? error.message : 'Scheduling failed'
                    });
                }
            }
            return results;
        }
        catch (error) {
            logger_1.logger.error('Content scheduling failed', { error });
            throw error;
        }
    }
    async publishToPlatform(content, platform, options) {
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
    async publishToLinkedIn(content, options) {
        try {
            if (!config_1.config.socialMedia.linkedin.clientId) {
                throw new types_1.ExternalAPIError('LinkedIn', 'API credentials not configured');
            }
            const adaptedContent = await this.adaptContentForLinkedIn(content);
            if (options.testMode) {
                return {
                    platform: 'linkedin',
                    success: true,
                    publishedId: `test_${(0, uuid_1.v4)()}`,
                    url: 'https://linkedin.com/test-post'
                };
            }
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
            const response = await axios_1.default.post(`${this.linkedInApiUrl}/ugcPosts`, postData, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0'
                }
            });
            return {
                platform: 'linkedin',
                success: true,
                publishedId: response.data.id,
                url: `https://linkedin.com/feed/update/${response.data.id}`
            };
        }
        catch (error) {
            logger_1.logger.error('LinkedIn publishing failed', { error });
            return {
                platform: 'linkedin',
                success: false,
                error: error instanceof Error ? error.message : 'LinkedIn API error'
            };
        }
    }
    async publishToTwitter(content, options) {
        try {
            if (!config_1.config.socialMedia.twitter.apiKey) {
                throw new types_1.ExternalAPIError('Twitter', 'API credentials not configured');
            }
            const adaptedContent = await this.adaptContentForTwitter(content);
            if (options.testMode) {
                return {
                    platform: 'twitter',
                    success: true,
                    publishedId: `test_${(0, uuid_1.v4)()}`,
                    url: 'https://twitter.com/test-tweet'
                };
            }
            const tweets = this.splitIntoTweets(adaptedContent.content);
            let previousTweetId;
            let firstTweetId;
            for (let i = 0; i < tweets.length; i++) {
                const tweetData = {
                    text: tweets[i]
                };
                if (previousTweetId) {
                    tweetData.reply = {
                        in_reply_to_tweet_id: previousTweetId
                    };
                }
                const response = await axios_1.default.post(`${this.twitterApiUrl}/tweets`, tweetData, {
                    headers: {
                        'Authorization': `Bearer ${await this.getTwitterBearerToken()}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (i === 0) {
                    firstTweetId = response.data.data.id;
                }
                previousTweetId = response.data.data.id;
            }
            return {
                platform: 'twitter',
                success: true,
                publishedId: firstTweetId,
                url: `https://twitter.com/fineprintai/status/${firstTweetId}`
            };
        }
        catch (error) {
            logger_1.logger.error('Twitter publishing failed', { error });
            return {
                platform: 'twitter',
                success: false,
                error: error instanceof Error ? error.message : 'Twitter API error'
            };
        }
    }
    async publishToFacebook(content, options) {
        try {
            if (!config_1.config.socialMedia.facebook.appId) {
                throw new types_1.ExternalAPIError('Facebook', 'API credentials not configured');
            }
            const adaptedContent = await this.adaptContentForFacebook(content);
            if (options.testMode) {
                return {
                    platform: 'facebook',
                    success: true,
                    publishedId: `test_${(0, uuid_1.v4)()}`,
                    url: 'https://facebook.com/test-post'
                };
            }
            const pageAccessToken = await this.getFacebookPageAccessToken();
            const pageId = await this.getFacebookPageId();
            const postData = {
                message: adaptedContent.content,
                published: true
            };
            const response = await axios_1.default.post(`${this.facebookApiUrl}/${pageId}/feed`, postData, {
                headers: {
                    'Authorization': `Bearer ${pageAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return {
                platform: 'facebook',
                success: true,
                publishedId: response.data.id,
                url: `https://facebook.com/${response.data.id}`
            };
        }
        catch (error) {
            logger_1.logger.error('Facebook publishing failed', { error });
            return {
                platform: 'facebook',
                success: false,
                error: error instanceof Error ? error.message : 'Facebook API error'
            };
        }
    }
    async publishToMedium(content, options) {
        try {
            const adaptedContent = await this.adaptContentForMedium(content);
            if (options.testMode) {
                return {
                    platform: 'medium',
                    success: true,
                    publishedId: `test_${(0, uuid_1.v4)()}`,
                    url: 'https://medium.com/@fineprintai/test-article'
                };
            }
            return {
                platform: 'medium',
                success: true,
                publishedId: (0, uuid_1.v4)(),
                url: `https://medium.com/@fineprintai/${content.id}`
            };
        }
        catch (error) {
            logger_1.logger.error('Medium publishing failed', { error });
            return {
                platform: 'medium',
                success: false,
                error: error instanceof Error ? error.message : 'Medium API error'
            };
        }
    }
    async sendEmailCampaign(content, options) {
        try {
            const adaptedContent = await this.adaptContentForEmail(content);
            if (options.testMode) {
                return {
                    platform: 'email',
                    success: true,
                    publishedId: `test_campaign_${(0, uuid_1.v4)()}`,
                    url: 'https://app.sendgrid.com/test-campaign'
                };
            }
            const response = await axios_1.default.post('https://api.sendgrid.com/v3/mail/send', {
                personalizations: [{
                        to: [{ email: 'subscribers@fineprintai.com' }]
                    }],
                from: { email: 'newsletter@fineprintai.com', name: 'Fine Print AI' },
                subject: adaptedContent.subject,
                content: [{
                        type: 'text/html',
                        value: adaptedContent.htmlContent
                    }]
            }, {
                headers: {
                    'Authorization': `Bearer ${config_1.config.email.sendgrid.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            return {
                platform: 'email',
                success: true,
                publishedId: (0, uuid_1.v4)(),
                url: 'https://app.sendgrid.com/campaigns'
            };
        }
        catch (error) {
            logger_1.logger.error('Email campaign failed', { error });
            return {
                platform: 'email',
                success: false,
                error: error instanceof Error ? error.message : 'Email API error'
            };
        }
    }
    async publishToBlog(content, options) {
        try {
            if (options.testMode) {
                return {
                    platform: 'blog',
                    success: true,
                    publishedId: `test_blog_${(0, uuid_1.v4)()}`,
                    url: 'https://fineprintai.com/blog/test-post'
                };
            }
            return {
                platform: 'blog',
                success: true,
                publishedId: content.id,
                url: `https://fineprintai.com/blog/${content.id}`
            };
        }
        catch (error) {
            logger_1.logger.error('Blog publishing failed', { error });
            return {
                platform: 'blog',
                success: false,
                error: error instanceof Error ? error.message : 'Blog API error'
            };
        }
    }
    async scheduleToPlatform(content, platform, scheduleTime, options) {
        try {
            const adaptedContent = await this.adaptContentForPlatform(content, platform);
            const bufferResult = await this.scheduleWithBuffer(adaptedContent, platform, scheduleTime);
            return {
                platform,
                success: true,
                publishedId: bufferResult.id,
                scheduledFor: scheduleTime,
                url: bufferResult.url
            };
        }
        catch (error) {
            logger_1.logger.error('Content scheduling failed', { platform, error });
            return {
                platform,
                success: false,
                error: error instanceof Error ? error.message : 'Scheduling failed'
            };
        }
    }
    async scheduleWithBuffer(content, platform, scheduleTime) {
        return {
            id: (0, uuid_1.v4)(),
            url: `https://buffer.com/publish/${platform}`
        };
    }
    async validateContentForPlatform(content, platform) {
        const errors = [];
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
    async adaptContentForLinkedIn(content) {
        let adaptedContent = content.content;
        adaptedContent = adaptedContent.replace(/^#\s+/gm, '');
        adaptedContent = adaptedContent.substring(0, 2800);
        if (content.callToAction) {
            adaptedContent += `\n\n${content.callToAction}`;
        }
        return {
            content: adaptedContent,
            hashtags: content.hashtags?.slice(0, 5) || []
        };
    }
    async adaptContentForTwitter(content) {
        let adaptedContent = content.content;
        adaptedContent = adaptedContent.replace(/^#\s+/gm, '');
        if (content.hashtags && adaptedContent.length < 200) {
            adaptedContent += ` ${content.hashtags.slice(0, 3).join(' ')}`;
        }
        return {
            content: adaptedContent,
            hashtags: content.hashtags?.slice(0, 3) || []
        };
    }
    async adaptContentForFacebook(content) {
        let adaptedContent = content.content;
        adaptedContent = adaptedContent.replace(/^#\s+/gm, '');
        adaptedContent = adaptedContent.substring(0, 1800);
        if (content.callToAction) {
            adaptedContent += `\n\n👉 ${content.callToAction}`;
        }
        return {
            content: adaptedContent,
            hashtags: content.hashtags?.slice(0, 5) || []
        };
    }
    async adaptContentForMedium(content) {
        return {
            title: content.title,
            content: content.content,
            tags: content.tags.slice(0, 5)
        };
    }
    async adaptContentForEmail(content) {
        const subject = content.title.length <= 50 ? content.title :
            content.title.substring(0, 47) + '...';
        const htmlContent = this.markdownToHtml(content.content);
        return {
            subject,
            content: content.content,
            htmlContent,
            segment: 'all_subscribers'
        };
    }
    async adaptContentForPlatform(content, platform) {
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
    splitIntoTweets(content) {
        const maxLength = 250;
        const tweets = [];
        if (content.length <= 280) {
            return [content];
        }
        const paragraphs = content.split('\n\n');
        let currentTweet = '';
        for (const paragraph of paragraphs) {
            if (currentTweet.length + paragraph.length + 2 <= maxLength) {
                currentTweet += (currentTweet ? '\n\n' : '') + paragraph;
            }
            else {
                if (currentTweet) {
                    tweets.push(currentTweet);
                    currentTweet = paragraph;
                }
                else {
                    const sentences = paragraph.split('. ');
                    for (const sentence of sentences) {
                        if (currentTweet.length + sentence.length + 2 <= maxLength) {
                            currentTweet += (currentTweet ? '. ' : '') + sentence;
                        }
                        else {
                            if (currentTweet)
                                tweets.push(currentTweet);
                            currentTweet = sentence;
                        }
                    }
                }
            }
        }
        if (currentTweet)
            tweets.push(currentTweet);
        if (tweets.length > 1) {
            tweets[0] += ' 🧵';
            for (let i = 1; i < tweets.length; i++) {
                tweets[i] = `${i + 1}/ ${tweets[i]}`;
            }
        }
        return tweets;
    }
    markdownToHtml(markdown) {
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
    async getLinkedInAccessToken() {
        return 'placeholder_token';
    }
    async getLinkedInPersonId() {
        return 'placeholder_person_id';
    }
    async getTwitterBearerToken() {
        return config_1.config.socialMedia.twitter.accessToken;
    }
    async getFacebookPageAccessToken() {
        return 'placeholder_page_token';
    }
    async getFacebookPageId() {
        return 'placeholder_page_id';
    }
}
exports.ContentDistributionEngine = ContentDistributionEngine;
//# sourceMappingURL=content-distribution-engine.js.map