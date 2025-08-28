/**
 * Fine Print AI - Website Targets Configuration
 * 
 * Defines popular websites and their legal document URLs for crawling
 * Includes selectors for content extraction and crawling schedules
 */

export interface WebsiteTarget {
  name: string;
  domain: string;
  category: string;
  termsUrl?: string;
  privacyUrl?: string;
  cookieUrl?: string;
  selectors?: {
    terms?: string;
    privacy?: string;
    cookie?: string;
  };
  crawlFrequency: 'daily' | 'weekly' | 'monthly';
  priority: 'high' | 'medium' | 'low';
  lastCrawled?: Date;
  isActive: boolean;
}

export class WebsiteTargets {
  private static targets: WebsiteTarget[] = [
    // Social Media
    {
      name: 'Facebook',
      domain: 'facebook.com',
      category: 'social_media',
      termsUrl: 'https://www.facebook.com/legal/terms',
      privacyUrl: 'https://www.facebook.com/privacy/policy',
      cookieUrl: 'https://www.facebook.com/policies/cookies',
      selectors: {
        terms: '[data-testid="page-content"]',
        privacy: '[data-testid="page-content"]',
        cookie: '[data-testid="page-content"]',
      },
      crawlFrequency: 'weekly',
      priority: 'high',
      isActive: true,
    },
    {
      name: 'Twitter',
      domain: 'twitter.com',
      category: 'social_media',
      termsUrl: 'https://twitter.com/en/tos',
      privacyUrl: 'https://twitter.com/en/privacy',
      cookieUrl: 'https://twitter.com/en/privacy#update',
      selectors: {
        terms: '.css-1dbjc4n[role="main"]',
        privacy: '.css-1dbjc4n[role="main"]',
      },
      crawlFrequency: 'weekly',
      priority: 'high',
      isActive: true,
    },
    {
      name: 'Instagram',
      domain: 'instagram.com',
      category: 'social_media',
      termsUrl: 'https://help.instagram.com/581066165581870',
      privacyUrl: 'https://privacycenter.instagram.com/policy',
      selectors: {
        terms: '[role="main"]',
        privacy: '[role="main"]',
      },
      crawlFrequency: 'weekly',
      priority: 'high',
      isActive: true,
    },
    {
      name: 'LinkedIn',
      domain: 'linkedin.com',
      category: 'social_media',
      termsUrl: 'https://www.linkedin.com/legal/user-agreement',
      privacyUrl: 'https://www.linkedin.com/legal/privacy-policy',
      cookieUrl: 'https://www.linkedin.com/legal/cookie-policy',
      selectors: {
        terms: '.legal-content',
        privacy: '.legal-content',
        cookie: '.legal-content',
      },
      crawlFrequency: 'weekly',
      priority: 'high',
      isActive: true,
    },
    {
      name: 'TikTok',
      domain: 'tiktok.com',
      category: 'social_media',
      termsUrl: 'https://www.tiktok.com/legal/page/us/terms-of-service/en',
      privacyUrl: 'https://www.tiktok.com/legal/page/us/privacy-policy/en',
      crawlFrequency: 'weekly',
      priority: 'high',
      isActive: true,
    },

    // Technology Companies
    {
      name: 'Google',
      domain: 'google.com',
      category: 'technology',
      termsUrl: 'https://policies.google.com/terms',
      privacyUrl: 'https://policies.google.com/privacy',
      selectors: {
        terms: '[role="article"]',
        privacy: '[role="article"]',
      },
      crawlFrequency: 'weekly',
      priority: 'high',
      isActive: true,
    },
    {
      name: 'Microsoft',
      domain: 'microsoft.com',
      category: 'technology',
      termsUrl: 'https://www.microsoft.com/en-us/servicesagreement',
      privacyUrl: 'https://privacy.microsoft.com/en-us/privacystatement',
      selectors: {
        terms: '.c-uhff-base-body',
        privacy: '.c-uhff-base-body',
      },
      crawlFrequency: 'weekly',
      priority: 'high',
      isActive: true,
    },
    {
      name: 'Apple',
      domain: 'apple.com',
      category: 'technology',
      termsUrl: 'https://www.apple.com/legal/internet-services/terms/site.html',
      privacyUrl: 'https://www.apple.com/privacy/privacy-policy/',
      selectors: {
        terms: '.main',
        privacy: '.main',
      },
      crawlFrequency: 'weekly',
      priority: 'high',
      isActive: true,
    },
    {
      name: 'Amazon',
      domain: 'amazon.com',
      category: 'ecommerce',
      termsUrl: 'https://www.amazon.com/gp/help/customer/display.html?nodeId=508088',
      privacyUrl: 'https://www.amazon.com/gp/help/customer/display.html?nodeId=468496',
      selectors: {
        terms: '#help-content',
        privacy: '#help-content',
      },
      crawlFrequency: 'weekly',
      priority: 'high',
      isActive: true,
    },

    // Streaming Services
    {
      name: 'Netflix',
      domain: 'netflix.com',
      category: 'streaming',
      termsUrl: 'https://help.netflix.com/legal/termsofuse',
      privacyUrl: 'https://help.netflix.com/legal/privacy',
      cookieUrl: 'https://help.netflix.com/legal/cookies',
      selectors: {
        terms: '.legal-content',
        privacy: '.legal-content',
        cookie: '.legal-content',
      },
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },
    {
      name: 'Spotify',
      domain: 'spotify.com',
      category: 'streaming',
      termsUrl: 'https://www.spotify.com/us/legal/end-user-agreement/',
      privacyUrl: 'https://www.spotify.com/us/legal/privacy-policy/',
      selectors: {
        terms: '.legal-content',
        privacy: '.legal-content',
      },
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },
    {
      name: 'YouTube',
      domain: 'youtube.com',
      category: 'streaming',
      termsUrl: 'https://www.youtube.com/t/terms',
      privacyUrl: 'https://policies.google.com/privacy',
      selectors: {
        terms: '.ytd-terms-of-service-renderer',
        privacy: '[role="article"]',
      },
      crawlFrequency: 'weekly',
      priority: 'high',
      isActive: true,
    },

    // E-commerce
    {
      name: 'eBay',
      domain: 'ebay.com',
      category: 'ecommerce',
      termsUrl: 'https://www.ebay.com/help/policies/member-behaviour-policies/user-agreement?id=4259',
      privacyUrl: 'https://www.ebay.com/help/policies/member-behaviour-policies/user-privacy-notice-privacy-policy?id=4260',
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },
    {
      name: 'Etsy',
      domain: 'etsy.com',
      category: 'ecommerce',
      termsUrl: 'https://www.etsy.com/legal/terms-of-use',
      privacyUrl: 'https://www.etsy.com/legal/privacy',
      cookieUrl: 'https://www.etsy.com/legal/cookies-and-tracking-technologies',
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },

    // Financial Services
    {
      name: 'PayPal',
      domain: 'paypal.com',
      category: 'financial',
      termsUrl: 'https://www.paypal.com/us/legalhub/useragreement-full',
      privacyUrl: 'https://www.paypal.com/us/legalhub/privacy-full',
      selectors: {
        terms: '.legal-content',
        privacy: '.legal-content',
      },
      crawlFrequency: 'weekly',
      priority: 'high',
      isActive: true,
    },
    {
      name: 'Stripe',
      domain: 'stripe.com',
      category: 'financial',
      termsUrl: 'https://stripe.com/legal/ssa',
      privacyUrl: 'https://stripe.com/privacy',
      selectors: {
        terms: '.legal-content',
        privacy: '.legal-content',
      },
      crawlFrequency: 'weekly',
      priority: 'high',
      isActive: true,
    },

    // Cloud Services
    {
      name: 'Dropbox',
      domain: 'dropbox.com',
      category: 'cloud_storage',
      termsUrl: 'https://www.dropbox.com/terms',
      privacyUrl: 'https://www.dropbox.com/privacy',
      cookieUrl: 'https://www.dropbox.com/cookies',
      selectors: {
        terms: '.legal-content',
        privacy: '.legal-content',
        cookie: '.legal-content',
      },
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },
    {
      name: 'OneDrive',
      domain: 'onedrive.live.com',
      category: 'cloud_storage',
      termsUrl: 'https://www.microsoft.com/en-us/servicesagreement',
      privacyUrl: 'https://privacy.microsoft.com/en-us/privacystatement',
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },

    // Communication
    {
      name: 'Zoom',
      domain: 'zoom.us',
      category: 'communication',
      termsUrl: 'https://zoom.us/terms',
      privacyUrl: 'https://zoom.us/privacy',
      selectors: {
        terms: '.legal-content',
        privacy: '.legal-content',
      },
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },
    {
      name: 'Slack',
      domain: 'slack.com',
      category: 'communication',
      termsUrl: 'https://slack.com/terms-of-service',
      privacyUrl: 'https://slack.com/privacy-policy',
      cookieUrl: 'https://slack.com/cookie-policy',
      selectors: {
        terms: '.legal-content',
        privacy: '.legal-content',
        cookie: '.legal-content',
      },
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },
    {
      name: 'Discord',
      domain: 'discord.com',
      category: 'communication',
      termsUrl: 'https://discord.com/terms',
      privacyUrl: 'https://discord.com/privacy',
      selectors: {
        terms: '.legal-content',
        privacy: '.legal-content',
      },
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },

    // News & Media
    {
      name: 'New York Times',
      domain: 'nytimes.com',
      category: 'news',
      termsUrl: 'https://help.nytimes.com/hc/en-us/articles/115014792127-Terms-of-service',
      privacyUrl: 'https://www.nytimes.com/privacy/privacy-policy',
      cookieUrl: 'https://www.nytimes.com/privacy/cookie-policy',
      crawlFrequency: 'monthly',
      priority: 'low',
      isActive: true,
    },
    {
      name: 'CNN',
      domain: 'cnn.com',
      category: 'news',
      termsUrl: 'https://www.cnn.com/terms',
      privacyUrl: 'https://www.cnn.com/privacy',
      crawlFrequency: 'monthly',
      priority: 'low',
      isActive: true,
    },

    // Gaming
    {
      name: 'Steam',
      domain: 'steampowered.com',
      category: 'gaming',
      termsUrl: 'https://store.steampowered.com/subscriber_agreement/',
      privacyUrl: 'https://store.steampowered.com/privacy_agreement/',
      selectors: {
        terms: '.legal_agreement_content',
        privacy: '.legal_agreement_content',
      },
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },
    {
      name: 'Epic Games',
      domain: 'epicgames.com',
      category: 'gaming',
      termsUrl: 'https://www.epicgames.com/site/en-US/tos',
      privacyUrl: 'https://www.epicgames.com/site/en-US/privacypolicy',
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },

    // Dating Apps
    {
      name: 'Tinder',
      domain: 'tinder.com',
      category: 'dating',
      termsUrl: 'https://policies.tinder.com/terms/intl/en',
      privacyUrl: 'https://policies.tinder.com/privacy/intl/en',
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },
    {
      name: 'Bumble',
      domain: 'bumble.com',
      category: 'dating',
      termsUrl: 'https://bumble.com/terms-and-conditions',
      privacyUrl: 'https://bumble.com/privacy',
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },

    // Ride Sharing
    {
      name: 'Uber',
      domain: 'uber.com',
      category: 'transportation',
      termsUrl: 'https://www.uber.com/legal/en/document/?name=general-terms-of-use',
      privacyUrl: 'https://www.uber.com/legal/en/document/?name=privacy-notice',
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },
    {
      name: 'Lyft',
      domain: 'lyft.com',
      category: 'transportation',
      termsUrl: 'https://www.lyft.com/terms',
      privacyUrl: 'https://www.lyft.com/privacy',
      crawlFrequency: 'monthly',
      priority: 'medium',
      isActive: true,
    },

    // Food Delivery
    {
      name: 'DoorDash',
      domain: 'doordash.com',
      category: 'food_delivery',
      termsUrl: 'https://help.doordash.com/consumers/s/terms-and-conditions',
      privacyUrl: 'https://help.doordash.com/consumers/s/privacy-policy',
      crawlFrequency: 'monthly',
      priority: 'low',
      isActive: true,
    },
    {
      name: 'Uber Eats',
      domain: 'ubereats.com',
      category: 'food_delivery',
      termsUrl: 'https://www.uber.com/legal/en/document/?name=eats-terms-of-use',
      privacyUrl: 'https://www.uber.com/legal/en/document/?name=privacy-notice',
      crawlFrequency: 'monthly',
      priority: 'low',
      isActive: true,
    },
  ];

  /**
   * Get all website targets
   */
  static getAllTargets(): WebsiteTarget[] {
    return this.targets.filter(target => target.isActive);
  }

  /**
   * Get targets by category
   */
  static getTargetsByCategory(category: string): WebsiteTarget[] {
    return this.targets.filter(target => target.category === category && target.isActive);
  }

  /**
   * Get targets by priority
   */
  static getTargetsByPriority(priority: 'high' | 'medium' | 'low'): WebsiteTarget[] {
    return this.targets.filter(target => target.priority === priority && target.isActive);
  }

  /**
   * Get specific target by name
   */
  static getTarget(name: string): WebsiteTarget | null {
    return this.targets.find(target => target.name.toLowerCase() === name.toLowerCase()) || null;
  }

  /**
   * Get targets due for crawling
   */
  static getTargetsDueForCrawling(): WebsiteTarget[] {
    const now = new Date();
    
    return this.targets.filter(target => {
      if (!target.isActive) return false;
      if (!target.lastCrawled) return true;

      const daysSinceLastCrawl = (now.getTime() - target.lastCrawled.getTime()) / (1000 * 60 * 60 * 24);
      
      switch (target.crawlFrequency) {
        case 'daily':
          return daysSinceLastCrawl >= 1;
        case 'weekly':
          return daysSinceLastCrawl >= 7;
        case 'monthly':
          return daysSinceLastCrawl >= 30;
        default:
          return false;
      }
    });
  }

  /**
   * Update last crawled timestamp
   */
  static updateLastCrawled(name: string): void {
    const target = this.targets.find(t => t.name === name);
    if (target) {
      target.lastCrawled = new Date();
    }
  }

  /**
   * Get categories
   */
  static getCategories(): string[] {
    const categories = new Set(this.targets.map(target => target.category));
    return Array.from(categories).sort();
  }

  /**
   * Get website statistics
   */
  static getStatistics(): {
    total: number;
    active: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    byFrequency: Record<string, number>;
  } {
    const activeTargets = this.targets.filter(t => t.isActive);
    
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byFrequency: Record<string, number> = {};

    activeTargets.forEach(target => {
      byCategory[target.category] = (byCategory[target.category] || 0) + 1;
      byPriority[target.priority] = (byPriority[target.priority] || 0) + 1;
      byFrequency[target.crawlFrequency] = (byFrequency[target.crawlFrequency] || 0) + 1;
    });

    return {
      total: this.targets.length,
      active: activeTargets.length,
      byCategory,
      byPriority,
      byFrequency,
    };
  }

  /**
   * Add new target
   */
  static addTarget(target: WebsiteTarget): void {
    this.targets.push(target);
  }

  /**
   * Remove target
   */
  static removeTarget(name: string): boolean {
    const index = this.targets.findIndex(t => t.name === name);
    if (index >= 0) {
      this.targets.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Deactivate target
   */
  static deactivateTarget(name: string): boolean {
    const target = this.targets.find(t => t.name === name);
    if (target) {
      target.isActive = false;
      return true;
    }
    return false;
  }

  /**
   * Activate target
   */
  static activateTarget(name: string): boolean {
    const target = this.targets.find(t => t.name === name);
    if (target) {
      target.isActive = true;
      return true;
    }
    return false;
  }
}