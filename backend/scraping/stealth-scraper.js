#!/usr/bin/env node

/**
 * Puppeteer Stealth Scraper
 * Advanced web scraping with anti-detection measures
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const UserAgent = require('user-agents');
const PQueue = require('p-queue').default;

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

class StealthScraper {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== false,
      maxConcurrency: options.maxConcurrency || 3,
      rateLimit: options.rateLimit || 2000, // ms between requests
      retries: options.retries || 3,
      timeout: options.timeout || 30000,
      viewport: options.viewport || { width: 1920, height: 1080 },
      proxies: options.proxies || [],
      userAgentPool: this.createUserAgentPool(),
      ...options
    };
    
    this.queue = new PQueue({ 
      concurrency: this.options.maxConcurrency,
      interval: 1000,
      intervalCap: 5
    });
    
    this.browser = null;
    this.stats = {
      successful: 0,
      failed: 0,
      retried: 0
    };
  }

  createUserAgentPool() {
    // Generate diverse user agents
    const agents = [];
    for (let i = 0; i < 50; i++) {
      const userAgent = new UserAgent({ deviceCategory: 'desktop' });
      agents.push(userAgent.toString());
    }
    return agents;
  }

  getRandomUserAgent() {
    const index = Math.floor(Math.random() * this.options.userAgentPool.length);
    return this.options.userAgentPool[index];
  }

  getRandomProxy() {
    if (this.options.proxies.length === 0) return null;
    const index = Math.floor(Math.random() * this.options.proxies.length);
    return this.options.proxies[index];
  }

  async initialize() {
    const launchOptions = {
      headless: this.options.headless ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    };

    // Add proxy if available
    const proxy = this.getRandomProxy();
    if (proxy) {
      launchOptions.args.push(`--proxy-server=${proxy}`);
    }

    this.browser = await puppeteer.launch(launchOptions);
    console.log('🚀 Stealth browser initialized');
  }

  async createPage() {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser.newPage();
    
    // Set random user agent
    const userAgent = this.getRandomUserAgent();
    await page.setUserAgent(userAgent);
    
    // Set viewport
    await page.setViewport(this.options.viewport);
    
    // Additional stealth measures
    await page.evaluateOnNewDocument(() => {
      // Override navigator properties
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Override chrome property
      window.chrome = {
        runtime: {}
      };
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });

    return page;
  }

  async scrapeUrl(url, options = {}) {
    const {
      waitForSelector = null,
      extractContent = true,
      screenshot = false,
      cookieConsent = true,
      scrollToBottom = true
    } = options;

    return this.queue.add(async () => {
      let page = null;
      let attempts = 0;
      
      while (attempts < this.options.retries) {
        try {
          attempts++;
          
          // Rate limiting
          if (this.lastRequestTime) {
            const elapsed = Date.now() - this.lastRequestTime;
            if (elapsed < this.options.rateLimit) {
              await new Promise(resolve => setTimeout(resolve, this.options.rateLimit - elapsed));
            }
          }
          this.lastRequestTime = Date.now();

          console.log(`📄 Scraping: ${url} (attempt ${attempts}/${this.options.retries})`);
          
          page = await this.createPage();
          
          // Navigate with timeout
          await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: this.options.timeout
          });

          // Handle cookie consent if needed
          if (cookieConsent) {
            await this.handleCookieConsent(page);
          }

          // Wait for specific selector if provided
          if (waitForSelector) {
            await page.waitForSelector(waitForSelector, { timeout: 10000 });
          }

          // Scroll to bottom to trigger lazy loading
          if (scrollToBottom) {
            await this.autoScroll(page);
          }

          // Extract content
          let content = null;
          if (extractContent) {
            content = await page.evaluate(() => {
              // Remove scripts and styles
              const scripts = document.querySelectorAll('script, style');
              scripts.forEach(el => el.remove());
              
              // Get text content
              return {
                title: document.title,
                url: window.location.href,
                text: document.body.innerText,
                html: document.body.innerHTML
              };
            });
          }

          // Take screenshot if requested
          let screenshotPath = null;
          if (screenshot) {
            screenshotPath = `screenshots/${Date.now()}_${url.replace(/[^a-z0-9]/gi, '_')}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
          }

          await page.close();
          
          this.stats.successful++;
          
          return {
            success: true,
            url,
            content,
            screenshot: screenshotPath,
            attempts,
            timestamp: new Date().toISOString()
          };
          
        } catch (error) {
          console.error(`❌ Error scraping ${url} (attempt ${attempts}):`, error.message);
          
          if (page) {
            await page.close().catch(() => {});
          }
          
          if (attempts >= this.options.retries) {
            this.stats.failed++;
            return {
              success: false,
              url,
              error: error.message,
              attempts,
              timestamp: new Date().toISOString()
            };
          }
          
          this.stats.retried++;
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts)));
        }
      }
    });
  }

  async handleCookieConsent(page) {
    // Common cookie consent selectors
    const consentSelectors = [
      'button[id*="accept"]',
      'button[class*="accept"]',
      'button[class*="consent"]',
      'button[class*="agree"]',
      'button[aria-label*="accept"]',
      'button[aria-label*="consent"]',
      'a[id*="accept"]',
      'a[class*="accept"]',
      '.cookie-consent button',
      '#cookie-consent button',
      '[data-testid*="cookie-accept"]',
      '[data-testid*="consent-accept"]'
    ];

    for (const selector of consentSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await button.isIntersectingViewport();
          if (isVisible) {
            await button.click();
            console.log('  ✅ Handled cookie consent');
            await page.waitForTimeout(1000);
            return;
          }
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
  }

  async autoScroll(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }

  async extractPrivacyPolicy(page) {
    // Look for privacy policy content
    return await page.evaluate(() => {
      // Common privacy policy indicators
      const indicators = [
        'privacy policy',
        'privacy statement',
        'data protection',
        'personal information',
        'data collection',
        'information we collect',
        'how we use your data'
      ];
      
      const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
      const privacyHeading = headings.find(h => 
        indicators.some(indicator => 
          h.textContent.toLowerCase().includes(indicator)
        )
      );
      
      if (privacyHeading) {
        // Get parent container
        let container = privacyHeading.parentElement;
        while (container && container.children.length < 3) {
          container = container.parentElement;
        }
        
        if (container) {
          return {
            found: true,
            text: container.innerText,
            html: container.innerHTML
          };
        }
      }
      
      // Fallback: get main content
      const main = document.querySelector('main, article, [role="main"]');
      if (main) {
        return {
          found: false,
          text: main.innerText,
          html: main.innerHTML
        };
      }
      
      return {
        found: false,
        text: document.body.innerText,
        html: document.body.innerHTML
      };
    });
  }

  async scrapeMultiple(urls, options = {}) {
    const results = [];
    
    for (const url of urls) {
      const result = await this.scrapeUrl(url, options);
      results.push(result);
    }
    
    return results;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🛑 Browser closed');
    }
    
    console.log('📊 Scraping statistics:', this.stats);
  }
}

module.exports = StealthScraper;

// Example usage
if (require.main === module) {
  (async () => {
    const scraper = new StealthScraper({
      headless: true,
      maxConcurrency: 3,
      rateLimit: 2000
    });

    try {
      await scraper.initialize();
      
      // Test scraping
      const result = await scraper.scrapeUrl('https://example.com', {
        screenshot: true,
        extractContent: true
      });
      
      console.log('Result:', result);
      
    } finally {
      await scraper.close();
    }
  })();
}