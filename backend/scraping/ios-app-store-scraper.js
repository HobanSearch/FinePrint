#!/usr/bin/env node

/**
 * iOS App Store Scraper
 * Fetches top apps and their privacy information
 */

const https = require('https');
const fs = require('fs');
// const StealthScraper = require('./stealth-scraper');

class IOSAppStoreScraper {
  constructor() {
    this.baseUrl = 'https://itunes.apple.com';
    this.categories = {
      'social-networking': 6005,
      'finance': 6015,
      'shopping': 6024,
      'entertainment': 6016,
      'productivity': 6007,
      'utilities': 6002,
      'health-fitness': 6013,
      'photo-video': 6008,
      'music': 6011,
      'games': 6014
    };
    this.scraper = null;
  }

  // Fetch data from iTunes API
  async fetchJSON(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  // Search for top apps
  async searchTopApps(limit = 50) {
    console.log('🔍 Searching for top iOS apps...\n');
    
    const allApps = [];
    const appsPerCategory = Math.ceil(limit / Object.keys(this.categories).length);
    
    for (const [categoryName, categoryId] of Object.entries(this.categories)) {
      console.log(`📱 Fetching ${categoryName} apps...`);
      
      try {
        // Search for popular apps in category
        const searchUrl = `${this.baseUrl}/search?term=app&media=software&entity=software&genreId=${categoryId}&limit=${appsPerCategory}&country=us`;
        const searchResults = await this.fetchJSON(searchUrl);
        
        if (searchResults.results && searchResults.results.length > 0) {
          const categoryApps = searchResults.results.map(app => ({
            id: app.trackId,
            bundleId: app.bundleId,
            name: app.trackName,
            developer: app.artistName,
            category: categoryName,
            categoryId: categoryId,
            description: app.description,
            rating: app.averageUserRating,
            ratingCount: app.userRatingCount,
            price: app.price,
            privacyPolicyUrl: app.privacyPolicyUrl || null,
            sellerUrl: app.sellerUrl || null,
            supportUrl: app.supportUrl || null,
            appStoreUrl: app.trackViewUrl
          }));
          
          allApps.push(...categoryApps);
          console.log(`  ✓ Found ${categoryApps.length} apps`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`  ✗ Error fetching ${categoryName}:`, error.message);
      }
    }
    
    // Sort by rating count (popularity)
    allApps.sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0));
    
    return allApps.slice(0, limit);
  }

  // Lookup detailed app information
  async lookupApp(appId) {
    const url = `${this.baseUrl}/lookup?id=${appId}&country=us`;
    const result = await this.fetchJSON(url);
    return result.results?.[0] || null;
  }

  // Scrape privacy labels from App Store page
  async scrapePrivacyLabels(appStoreUrl) {
    if (!this.scraper) {
      this.scraper = new StealthScraper({
        headless: true,
        maxConcurrency: 1,
        rateLimit: 3000
      });
      await this.scraper.initialize();
    }
    
    console.log(`  🔍 Scraping privacy labels from: ${appStoreUrl}`);
    
    try {
      const result = await this.scraper.scrapeUrl(appStoreUrl, {
        waitForSelector: 'section',
        extractContent: false,
        screenshot: false
      });
      
      if (!result.success) {
        return null;
      }
      
      // Extract privacy information from the page
      const page = await this.scraper.createPage();
      await page.goto(appStoreUrl, { waitUntil: 'networkidle2' });
      
      const privacyData = await page.evaluate(() => {
        const privacySection = Array.from(document.querySelectorAll('section')).find(section => 
          section.textContent.includes('App Privacy') || 
          section.textContent.includes('Data Used to Track You')
        );
        
        if (!privacySection) return null;
        
        const data = {
          dataUsedToTrackYou: [],
          dataLinkedToYou: [],
          dataNotLinkedToYou: [],
          privacyDetails: []
        };
        
        // Extract privacy categories
        const categories = privacySection.querySelectorAll('dl, div[role="list"]');
        categories.forEach(cat => {
          const text = cat.textContent;
          if (text.includes('Data Used to Track You')) {
            const items = cat.querySelectorAll('dd, div[role="listitem"]');
            items.forEach(item => {
              if (item.textContent.trim()) {
                data.dataUsedToTrackYou.push(item.textContent.trim());
              }
            });
          } else if (text.includes('Data Linked to You')) {
            const items = cat.querySelectorAll('dd, div[role="listitem"]');
            items.forEach(item => {
              if (item.textContent.trim()) {
                data.dataLinkedToYou.push(item.textContent.trim());
              }
            });
          } else if (text.includes('Data Not Linked to You')) {
            const items = cat.querySelectorAll('dd, div[role="listitem"]');
            items.forEach(item => {
              if (item.textContent.trim()) {
                data.dataNotLinkedToYou.push(item.textContent.trim());
              }
            });
          }
        });
        
        // Get all privacy details text
        if (privacySection) {
          data.privacyDetails.push(privacySection.textContent.trim());
        }
        
        return data;
      });
      
      await page.close();
      return privacyData;
      
    } catch (error) {
      console.error(`    ✗ Error scraping privacy labels:`, error.message);
      return null;
    }
  }

  // Analyze privacy policy content
  async analyzePrivacyPolicy(url) {
    if (!url) return null;
    
    console.log(`  📄 Analyzing privacy policy: ${url}`);
    
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
      
      // Privacy patterns specific to mobile apps
      const patterns = [
        { regex: /collect.{0,30}(device|location|contact|photo)/gi, type: 'data_collection', severity: 'high' },
        { regex: /share.{0,50}third.{0,20}part/gi, type: 'third_party_sharing', severity: 'high' },
        { regex: /advertis(ing|ers)/gi, type: 'advertising', severity: 'medium' },
        { regex: /track(ing)?.{0,30}(behavior|usage|activity)/gi, type: 'tracking', severity: 'high' },
        { regex: /sell.{0,30}(personal|your).{0,20}(data|information)/gi, type: 'data_sale', severity: 'high' },
        { regex: /children.{0,30}under.{0,10}(13|sixteen)/gi, type: 'children_policy', severity: 'low' },
        { regex: /opt.{0,5}out/gi, type: 'opt_out_available', severity: 'low' },
        { regex: /encryption/gi, type: 'encryption_mentioned', severity: 'low' },
        { regex: /gdpr|ccpa|privacy shield/gi, type: 'compliance_mentioned', severity: 'low' }
      ];
      
      const foundPatterns = [];
      let riskScore = 30; // Base score for apps
      
      for (const pattern of patterns) {
        const matches = text.match(pattern.regex);
        if (matches && matches.length > 0) {
          foundPatterns.push({
            type: pattern.type,
            severity: pattern.severity,
            count: matches.length
          });
          
          if (pattern.severity === 'high') {
            riskScore += 15;
          } else if (pattern.severity === 'medium') {
            riskScore += 8;
          } else if (pattern.severity === 'low') {
            riskScore -= 3; // Good patterns reduce score
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
      console.error(`    ✗ Error analyzing privacy policy:`, error.message);
      return null;
    }
  }

  // Analyze a single app
  async analyzeApp(app) {
    console.log(`\n📱 Analyzing: ${app.name} by ${app.developer}`);
    
    const result = {
      ...app,
      timestamp: new Date().toISOString(),
      privacyLabels: null,
      privacyPolicy: null,
      combinedScore: 0,
      grade: 'F'
    };
    
    try {
      // Get privacy labels from App Store
      if (app.appStoreUrl) {
        result.privacyLabels = await this.scrapePrivacyLabels(app.appStoreUrl);
      }
      
      // Analyze privacy policy
      if (app.privacyPolicyUrl) {
        result.privacyPolicy = await this.analyzePrivacyPolicy(app.privacyPolicyUrl);
      }
      
      // Calculate combined score
      let score = 50; // Base score
      
      // Adjust based on privacy labels
      if (result.privacyLabels) {
        score += result.privacyLabels.dataUsedToTrackYou.length * 5;
        score += result.privacyLabels.dataLinkedToYou.length * 3;
        score -= result.privacyLabels.dataNotLinkedToYou.length * 2;
      }
      
      // Include privacy policy score
      if (result.privacyPolicy) {
        score = (score + result.privacyPolicy.riskScore) / 2;
      }
      
      result.combinedScore = Math.min(100, Math.max(0, Math.round(score)));
      
      // Assign grade
      if (result.combinedScore >= 80) result.grade = 'F';
      else if (result.combinedScore >= 70) result.grade = 'D';
      else if (result.combinedScore >= 60) result.grade = 'C';
      else if (result.combinedScore >= 50) result.grade = 'B';
      else result.grade = 'A';
      
      console.log(`  ✅ Score: ${result.combinedScore}/100, Grade: ${result.grade}`);
      
    } catch (error) {
      console.error(`  ❌ Error analyzing app:`, error.message);
      result.error = error.message;
    }
    
    return result;
  }

  // Main analysis function
  async analyzeTopApps(limit = 50) {
    console.log('🚀 iOS App Store Privacy Analysis');
    console.log('=================================\n');
    
    const startTime = Date.now();
    const results = [];
    
    try {
      // Get top apps
      const topApps = await this.searchTopApps(limit);
      console.log(`\n📊 Found ${topApps.length} popular iOS apps to analyze\n`);
      
      // Initialize scraper for privacy label extraction
      this.scraper = new StealthScraper({
        headless: true,
        maxConcurrency: 1,
        rateLimit: 3000,
        timeout: 60000
      });
      await this.scraper.initialize();
      
      // Analyze each app
      for (let i = 0; i < topApps.length; i++) {
        const progress = `[${i + 1}/${topApps.length}]`;
        console.log(`\n${progress} Analyzing app ${i + 1} of ${topApps.length}`);
        
        const result = await this.analyzeApp(topApps[i]);
        results.push(result);
        
        // Save intermediate results every 10 apps
        if ((i + 1) % 10 === 0) {
          this.saveResults(results, true);
        }
        
        // Rate limiting
        if (i < topApps.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
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
    console.log(`✅ Analyzed ${results.length} iOS apps`);
    console.log(`⏱️  Total time: ${Math.floor(duration / 60)}m ${duration % 60}s`);
    console.log(`📁 Results saved to: ios-app-analysis.json`);
    
    return results;
  }

  // Save results to file
  saveResults(results, intermediate = false) {
    const filename = intermediate ? 'ios-app-analysis-intermediate.json' : 'ios-app-analysis.json';
    
    const output = {
      metadata: {
        platform: 'iOS App Store',
        totalApps: results.length,
        timestamp: new Date().toISOString(),
        categories: Object.keys(this.categories)
      },
      summary: {
        gradeDistribution: {},
        categoryBreakdown: {},
        privacyLabelStats: {
          appsWithTracking: 0,
          appsWithDataCollection: 0,
          appsWithPrivacyPolicy: 0
        }
      },
      results: results.sort((a, b) => b.combinedScore - a.combinedScore)
    };
    
    // Calculate summary statistics
    results.forEach(app => {
      // Grade distribution
      output.summary.gradeDistribution[app.grade] = (output.summary.gradeDistribution[app.grade] || 0) + 1;
      
      // Category breakdown
      if (!output.summary.categoryBreakdown[app.category]) {
        output.summary.categoryBreakdown[app.category] = { count: 0, avgScore: 0, scores: [] };
      }
      output.summary.categoryBreakdown[app.category].count++;
      output.summary.categoryBreakdown[app.category].scores.push(app.combinedScore);
      
      // Privacy label stats
      if (app.privacyLabels?.dataUsedToTrackYou?.length > 0) {
        output.summary.privacyLabelStats.appsWithTracking++;
      }
      if (app.privacyLabels?.dataLinkedToYou?.length > 0) {
        output.summary.privacyLabelStats.appsWithDataCollection++;
      }
      if (app.privacyPolicyUrl) {
        output.summary.privacyLabelStats.appsWithPrivacyPolicy++;
      }
    });
    
    // Calculate average scores
    Object.keys(output.summary.categoryBreakdown).forEach(cat => {
      const scores = output.summary.categoryBreakdown[cat].scores;
      output.summary.categoryBreakdown[cat].avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      delete output.summary.categoryBreakdown[cat].scores;
    });
    
    fs.writeFileSync(filename, JSON.stringify(output, null, 2));
    
    if (!intermediate) {
      // Show top privacy offenders
      console.log('\n🏆 Top 10 iOS Privacy Offenders:');
      results.slice(0, 10).forEach((app, i) => {
        console.log(`${i + 1}. ${app.name} (${app.category}) - Score: ${app.combinedScore}/100, Grade: ${app.grade}`);
        if (app.privacyLabels?.dataUsedToTrackYou?.length > 0) {
          console.log(`   ⚠️  Tracks: ${app.privacyLabels.dataUsedToTrackYou.slice(0, 3).join(', ')}`);
        }
      });
    }
  }
}

// Run the scraper
if (require.main === module) {
  const scraper = new IOSAppStoreScraper();
  scraper.analyzeTopApps(50).catch(console.error);
}

module.exports = IOSAppStoreScraper;