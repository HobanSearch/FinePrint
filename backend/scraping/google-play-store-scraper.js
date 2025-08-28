#!/usr/bin/env node

/**
 * Google Play Store Scraper
 * Fetches top Android apps and their privacy information
 */

const fs = require('fs');
const StealthScraper = require('./stealth-scraper');

class GooglePlayStoreScraper {
  constructor() {
    this.baseUrl = 'https://play.google.com';
    this.categories = {
      'SOCIAL': 'Social',
      'FINANCE': 'Finance',
      'SHOPPING': 'Shopping',
      'ENTERTAINMENT': 'Entertainment',
      'PRODUCTIVITY': 'Productivity',
      'TOOLS': 'Tools',
      'HEALTH_AND_FITNESS': 'Health & Fitness',
      'PHOTOGRAPHY': 'Photography',
      'MUSIC_AND_AUDIO': 'Music & Audio',
      'GAME': 'Games'
    };
    this.scraper = null;
  }

  // Extract app IDs from category pages
  async scrapeTopAppsFromCategory(category, limit = 10) {
    if (!this.scraper) {
      this.scraper = new StealthScraper({
        headless: true,
        maxConcurrency: 1,
        rateLimit: 3000,
        timeout: 60000
      });
      await this.scraper.initialize();
    }
    
    const categoryUrl = `${this.baseUrl}/store/apps/category/${category}?hl=en_US`;
    console.log(`  🔍 Scraping category: ${this.categories[category] || category}`);
    
    try {
      const page = await this.scraper.createPage();
      await page.goto(categoryUrl, { waitUntil: 'networkidle2' });
      
      // Scroll to load more apps
      await this.scraper.autoScroll(page);
      
      // Extract app information
      const apps = await page.evaluate(() => {
        const appElements = document.querySelectorAll('a[href*="/store/apps/details"]');
        const appMap = new Map();
        
        appElements.forEach(element => {
          const href = element.getAttribute('href');
          const match = href.match(/id=([^&]+)/);
          if (match) {
            const appId = match[1];
            if (!appMap.has(appId)) {
              // Try to get app name
              const nameElement = element.querySelector('[itemprop="name"]') || 
                                element.querySelector('span') ||
                                element.querySelector('div');
              
              // Try to get developer name
              const devElement = element.parentElement?.querySelector('a[href*="/store/apps/dev"]') ||
                               element.parentElement?.querySelector('div > div > span');
              
              appMap.set(appId, {
                id: appId,
                name: nameElement?.textContent?.trim() || appId,
                developer: devElement?.textContent?.trim() || 'Unknown',
                url: `https://play.google.com/store/apps/details?id=${appId}`
              });
            }
          }
        });
        
        return Array.from(appMap.values());
      });
      
      await page.close();
      
      console.log(`    ✓ Found ${apps.length} apps`);
      return apps.slice(0, limit);
      
    } catch (error) {
      console.error(`    ✗ Error scraping category:`, error.message);
      return [];
    }
  }

  // Scrape detailed app information
  async scrapeAppDetails(appId) {
    const appUrl = `${this.baseUrl}/store/apps/details?id=${appId}&hl=en_US`;
    console.log(`  📱 Scraping app details: ${appId}`);
    
    try {
      const page = await this.scraper.createPage();
      await page.goto(appUrl, { waitUntil: 'networkidle2' });
      
      // Wait for content to load
      await page.waitForSelector('h1', { timeout: 10000 });
      
      const appDetails = await page.evaluate(() => {
        const details = {
          name: '',
          developer: '',
          category: '',
          rating: 0,
          downloads: '',
          description: '',
          privacyPolicyUrl: null,
          dataSafety: {
            dataShared: [],
            dataCollected: [],
            securityPractices: []
          },
          permissions: []
        };
        
        // Get basic info
        const nameElement = document.querySelector('h1');
        details.name = nameElement?.textContent?.trim() || '';
        
        // Developer
        const devElement = document.querySelector('a[href*="/store/apps/dev"]');
        details.developer = devElement?.textContent?.trim() || '';
        
        // Category
        const categoryElement = document.querySelector('a[href*="/store/apps/category"]');
        details.category = categoryElement?.textContent?.trim() || '';
        
        // Rating
        const ratingElement = document.querySelector('[aria-label*="Rated"]');
        const ratingMatch = ratingElement?.getAttribute('aria-label')?.match(/(\d+\.?\d*)/);
        details.rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
        
        // Downloads
        const downloadElements = Array.from(document.querySelectorAll('div')).filter(el => 
          el.textContent.includes('Downloads') || el.textContent.includes('downloads')
        );
        if (downloadElements.length > 0) {
          const downloadText = downloadElements[0].textContent;
          const downloadMatch = downloadText.match(/(\d+[KMB+]?\+?)/);
          details.downloads = downloadMatch ? downloadMatch[1] : 'Unknown';
        }
        
        // Description
        const descElement = document.querySelector('[data-g-id="description"]');
        details.description = descElement?.textContent?.trim() || '';
        
        // Privacy Policy URL
        const privacyLink = Array.from(document.querySelectorAll('a')).find(a => 
          a.textContent.toLowerCase().includes('privacy policy')
        );
        details.privacyPolicyUrl = privacyLink?.href || null;
        
        // Data Safety Section
        const dataSafetySection = Array.from(document.querySelectorAll('section')).find(section =>
          section.textContent.includes('Data safety') || section.textContent.includes('Data privacy')
        );
        
        if (dataSafetySection) {
          // Data shared
          const sharedSection = dataSafetySection.textContent.match(/Data shared(.+?)(?:Data collected|Security practices|$)/s);
          if (sharedSection) {
            const items = sharedSection[1].match(/[A-Z][a-z]+(?:\s+[a-z]+)*/g);
            details.dataSafety.dataShared = items || [];
          }
          
          // Data collected
          const collectedSection = dataSafetySection.textContent.match(/Data collected(.+?)(?:Security practices|$)/s);
          if (collectedSection) {
            const items = collectedSection[1].match(/[A-Z][a-z]+(?:\s+[a-z]+)*/g);
            details.dataSafety.dataCollected = items || [];
          }
          
          // Security practices
          const practices = [];
          if (dataSafetySection.textContent.includes('encrypted in transit')) {
            practices.push('Data encrypted in transit');
          }
          if (dataSafetySection.textContent.includes('delete data')) {
            practices.push('Can request data deletion');
          }
          if (dataSafetySection.textContent.includes('independently verified')) {
            practices.push('Security practices verified');
          }
          details.dataSafety.securityPractices = practices;
        }
        
        // Permissions (if visible)
        const permissionElements = Array.from(document.querySelectorAll('li')).filter(li =>
          li.textContent.includes('permission') || li.parentElement?.textContent?.includes('Permissions')
        );
        details.permissions = permissionElements.map(el => el.textContent.trim());
        
        return details;
      });
      
      await page.close();
      return appDetails;
      
    } catch (error) {
      console.error(`    ✗ Error scraping app details:`, error.message);
      return null;
    }
  }

  // Analyze privacy policy
  async analyzePrivacyPolicy(url) {
    if (!url) return null;
    
    console.log(`    📄 Analyzing privacy policy...`);
    
    try {
      const result = await this.scraper.scrapeUrl(url, {
        extractContent: true,
        cookieConsent: true,
        scrollToBottom: true
      });
      
      if (!result.success || !result.content) {
        return null;
      }
      
      const text = result.content.text;
      
      // Android-specific privacy patterns
      const patterns = [
        { regex: /collect.{0,50}(location|gps|geolocation)/gi, type: 'location_collection', severity: 'high' },
        { regex: /access.{0,30}(contacts|calendar|photos|camera)/gi, type: 'sensitive_access', severity: 'high' },
        { regex: /android.{0,30}(permission|id|advertising)/gi, type: 'android_specific', severity: 'medium' },
        { regex: /google.{0,30}(analytics|adsense|admob)/gi, type: 'google_services', severity: 'medium' },
        { regex: /share.{0,50}advertis/gi, type: 'advertising_sharing', severity: 'high' },
        { regex: /sell.{0,30}(personal|your).{0,20}(data|information)/gi, type: 'data_sale', severity: 'high' },
        { regex: /third[- ]party.{0,30}sdk/gi, type: 'third_party_sdk', severity: 'medium' },
        { regex: /background.{0,30}(collection|tracking)/gi, type: 'background_tracking', severity: 'high' },
        { regex: /children|coppa|under.{0,10}13/gi, type: 'children_policy', severity: 'low' },
        { regex: /opt.{0,5}out|choice/gi, type: 'user_choice', severity: 'low' },
        { regex: /encrypt/gi, type: 'encryption', severity: 'low' },
        { regex: /gdpr|ccpa/gi, type: 'compliance', severity: 'low' }
      ];
      
      const foundPatterns = [];
      let riskScore = 40; // Base score for Android apps
      
      for (const pattern of patterns) {
        const matches = text.match(pattern.regex);
        if (matches && matches.length > 0) {
          foundPatterns.push({
            type: pattern.type,
            severity: pattern.severity,
            count: matches.length
          });
          
          if (pattern.severity === 'high') {
            riskScore += 12;
          } else if (pattern.severity === 'medium') {
            riskScore += 6;
          } else if (pattern.severity === 'low') {
            riskScore -= 3;
          }
        }
      }
      
      return {
        url,
        analyzedLength: text.length,
        patterns: foundPatterns,
        riskScore: Math.min(100, Math.max(0, riskScore))
      };
      
    } catch (error) {
      console.error(`      ✗ Error analyzing privacy policy:`, error.message);
      return null;
    }
  }

  // Calculate privacy score
  calculatePrivacyScore(appDetails, privacyAnalysis) {
    let score = 50; // Base score
    
    // Adjust based on data safety
    if (appDetails?.dataSafety) {
      score += appDetails.dataSafety.dataShared.length * 3;
      score += appDetails.dataSafety.dataCollected.length * 2;
      score -= appDetails.dataSafety.securityPractices.length * 5;
    }
    
    // Adjust based on permissions
    if (appDetails?.permissions) {
      const sensitivePermissions = appDetails.permissions.filter(p =>
        p.toLowerCase().includes('location') ||
        p.toLowerCase().includes('contacts') ||
        p.toLowerCase().includes('camera') ||
        p.toLowerCase().includes('microphone') ||
        p.toLowerCase().includes('storage')
      );
      score += sensitivePermissions.length * 5;
    }
    
    // Include privacy policy score
    if (privacyAnalysis?.riskScore) {
      score = (score + privacyAnalysis.riskScore) / 2;
    }
    
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  // Analyze a single app
  async analyzeApp(app) {
    console.log(`\n📱 Analyzing: ${app.name} (${app.id})`);
    
    const result = {
      id: app.id,
      name: app.name,
      developer: app.developer,
      url: app.url,
      timestamp: new Date().toISOString(),
      details: null,
      privacyPolicy: null,
      combinedScore: 0,
      grade: 'F'
    };
    
    try {
      // Get detailed app information
      result.details = await this.scrapeAppDetails(app.id);
      
      if (result.details) {
        // Update basic info with detailed data
        result.name = result.details.name || app.name;
        result.developer = result.details.developer || app.developer;
        result.category = result.details.category;
        result.rating = result.details.rating;
        result.downloads = result.details.downloads;
        
        // Analyze privacy policy if available
        if (result.details.privacyPolicyUrl) {
          result.privacyPolicy = await this.analyzePrivacyPolicy(result.details.privacyPolicyUrl);
        }
      }
      
      // Calculate combined score
      result.combinedScore = this.calculatePrivacyScore(result.details, result.privacyPolicy);
      
      // Assign grade
      if (result.combinedScore >= 80) result.grade = 'F';
      else if (result.combinedScore >= 70) result.grade = 'D';
      else if (result.combinedScore >= 60) result.grade = 'C';
      else if (result.combinedScore >= 50) result.grade = 'B';
      else result.grade = 'A';
      
      console.log(`  ✅ Score: ${result.combinedScore}/100, Grade: ${result.grade}`);
      
      if (result.details?.dataSafety?.dataShared?.length > 0) {
        console.log(`  📊 Shares: ${result.details.dataSafety.dataShared.slice(0, 3).join(', ')}`);
      }
      
    } catch (error) {
      console.error(`  ❌ Error analyzing app:`, error.message);
      result.error = error.message;
    }
    
    return result;
  }

  // Main analysis function
  async analyzeTopApps(limit = 50) {
    console.log('🚀 Google Play Store Privacy Analysis');
    console.log('=====================================\n');
    
    const startTime = Date.now();
    const results = [];
    
    try {
      // Initialize scraper
      this.scraper = new StealthScraper({
        headless: true,
        maxConcurrency: 1,
        rateLimit: 4000,
        timeout: 60000
      });
      await this.scraper.initialize();
      
      // Get apps from each category
      const allApps = [];
      const appsPerCategory = Math.ceil(limit / Object.keys(this.categories).length);
      
      for (const [categoryId, categoryName] of Object.entries(this.categories)) {
        console.log(`\n📂 Fetching ${categoryName} apps...`);
        const categoryApps = await this.scrapeTopAppsFromCategory(categoryId, appsPerCategory);
        
        categoryApps.forEach(app => {
          app.category = categoryName;
        });
        
        allApps.push(...categoryApps);
        
        // Rate limiting between categories
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      console.log(`\n📊 Total apps collected: ${allApps.length}`);
      
      // Analyze each app
      const appsToAnalyze = allApps.slice(0, limit);
      for (let i = 0; i < appsToAnalyze.length; i++) {
        const progress = `[${i + 1}/${appsToAnalyze.length}]`;
        console.log(`\n${progress} Processing app ${i + 1} of ${appsToAnalyze.length}`);
        
        const result = await this.analyzeApp(appsToAnalyze[i]);
        results.push(result);
        
        // Save intermediate results
        if ((i + 1) % 10 === 0) {
          this.saveResults(results, true);
        }
        
        // Rate limiting
        if (i < appsToAnalyze.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
    } finally {
      if (this.scraper) {
        await this.scraper.close();
      }
    }
    
    // Save final results
    this.saveResults(results, false);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log('\n📊 Analysis Complete!');
    console.log('====================');
    console.log(`✅ Analyzed ${results.length} Android apps`);
    console.log(`⏱️  Total time: ${Math.floor(duration / 60)}m ${duration % 60}s`);
    console.log(`📁 Results saved to: google-play-analysis.json`);
    
    return results;
  }

  // Save results to file
  saveResults(results, intermediate = false) {
    const filename = intermediate ? 'google-play-analysis-intermediate.json' : 'google-play-analysis.json';
    
    const output = {
      metadata: {
        platform: 'Google Play Store',
        totalApps: results.length,
        timestamp: new Date().toISOString(),
        categories: Object.values(this.categories)
      },
      summary: {
        gradeDistribution: {},
        categoryBreakdown: {},
        dataSafetyStats: {
          appsWithDataSharing: 0,
          appsWithDataCollection: 0,
          appsWithPrivacyPolicy: 0,
          appsWithEncryption: 0
        }
      },
      results: results.sort((a, b) => b.combinedScore - a.combinedScore)
    };
    
    // Calculate summary statistics
    results.forEach(app => {
      // Grade distribution
      output.summary.gradeDistribution[app.grade] = (output.summary.gradeDistribution[app.grade] || 0) + 1;
      
      // Category breakdown
      const category = app.category || 'Unknown';
      if (!output.summary.categoryBreakdown[category]) {
        output.summary.categoryBreakdown[category] = { count: 0, avgScore: 0, scores: [] };
      }
      output.summary.categoryBreakdown[category].count++;
      output.summary.categoryBreakdown[category].scores.push(app.combinedScore);
      
      // Data safety stats
      if (app.details?.dataSafety?.dataShared?.length > 0) {
        output.summary.dataSafetyStats.appsWithDataSharing++;
      }
      if (app.details?.dataSafety?.dataCollected?.length > 0) {
        output.summary.dataSafetyStats.appsWithDataCollection++;
      }
      if (app.details?.privacyPolicyUrl) {
        output.summary.dataSafetyStats.appsWithPrivacyPolicy++;
      }
      if (app.details?.dataSafety?.securityPractices?.includes('Data encrypted in transit')) {
        output.summary.dataSafetyStats.appsWithEncryption++;
      }
    });
    
    // Calculate average scores
    Object.keys(output.summary.categoryBreakdown).forEach(cat => {
      const scores = output.summary.categoryBreakdown[cat].scores;
      if (scores.length > 0) {
        output.summary.categoryBreakdown[cat].avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }
      delete output.summary.categoryBreakdown[cat].scores;
    });
    
    fs.writeFileSync(filename, JSON.stringify(output, null, 2));
    
    if (!intermediate) {
      // Show top privacy offenders
      console.log('\n🏆 Top 10 Android Privacy Offenders:');
      results.slice(0, 10).forEach((app, i) => {
        console.log(`${i + 1}. ${app.name} (${app.category || 'Unknown'}) - Score: ${app.combinedScore}/100, Grade: ${app.grade}`);
        if (app.details?.dataSafety?.dataShared?.length > 0) {
          console.log(`   ⚠️  Shares: ${app.details.dataSafety.dataShared.slice(0, 3).join(', ')}`);
        }
      });
    }
  }
}

// Run the scraper
if (require.main === module) {
  const scraper = new GooglePlayStoreScraper();
  scraper.analyzeTopApps(50).catch(console.error);
}

module.exports = GooglePlayStoreScraper;