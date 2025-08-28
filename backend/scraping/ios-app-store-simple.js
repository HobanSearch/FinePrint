#!/usr/bin/env node

/**
 * Simplified iOS App Store Scraper
 * Uses only iTunes API without Puppeteer dependencies
 */

const https = require('https');
const fs = require('fs');

class SimpleiOSAppStoreScraper {
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
            description: app.description?.substring(0, 500),
            rating: app.averageUserRating,
            ratingCount: app.userRatingCount,
            price: app.price,
            privacyPolicyUrl: app.privacyPolicyUrl || null,
            sellerUrl: app.sellerUrl || null,
            supportUrl: app.supportUrl || null,
            appStoreUrl: app.trackViewUrl,
            version: app.version,
            contentRating: app.contentAdvisoryRating,
            languages: app.languageCodesISO2A || []
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

  // Analyze privacy policy (simplified without web scraping)
  analyzeApp(app) {
    const result = {
      ...app,
      timestamp: new Date().toISOString(),
      privacyAnalysis: {
        hasPrivacyPolicy: !!app.privacyPolicyUrl,
        privacyPolicyUrl: app.privacyPolicyUrl,
        hasSellerUrl: !!app.sellerUrl,
        hasSupport: !!app.supportUrl
      },
      combinedScore: 50, // Base score
      grade: 'C'
    };
    
    // Simple scoring based on available data
    let score = 50;
    
    // Penalize apps without privacy policy
    if (!app.privacyPolicyUrl) {
      score += 20;
    }
    
    // Consider content rating
    if (app.contentRating === '17+' || app.contentRating === '12+') {
      score += 10;
    }
    
    // Popular apps might have more scrutiny
    if (app.ratingCount > 10000) {
      score -= 5;
    }
    
    // Finance and social apps typically collect more data
    if (app.category === 'finance' || app.category === 'social-networking') {
      score += 10;
    }
    
    result.combinedScore = Math.min(100, Math.max(0, score));
    
    // Assign grade
    if (result.combinedScore >= 80) result.grade = 'F';
    else if (result.combinedScore >= 70) result.grade = 'D';
    else if (result.combinedScore >= 60) result.grade = 'C';
    else if (result.combinedScore >= 50) result.grade = 'B';
    else result.grade = 'A';
    
    return result;
  }

  // Main analysis function
  async analyzeTopApps(limit = 50) {
    console.log('🚀 iOS App Store Privacy Analysis (Simplified)');
    console.log('=============================================\n');
    console.log('Note: This simplified version uses only iTunes API data\n');
    
    const startTime = Date.now();
    const results = [];
    
    try {
      // Get top apps
      const topApps = await this.searchTopApps(limit);
      console.log(`\n📊 Found ${topApps.length} popular iOS apps to analyze\n`);
      
      // Analyze each app
      for (let i = 0; i < topApps.length; i++) {
        const progress = `[${i + 1}/${topApps.length}]`;
        console.log(`${progress} Analyzing: ${topApps[i].name}`);
        
        const result = this.analyzeApp(topApps[i]);
        results.push(result);
        
        // Small delay
        if (i < topApps.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
    } catch (error) {
      console.error('Error during analysis:', error);
    }
    
    // Save results
    this.saveResults(results);
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log('\n📊 Analysis Complete!');
    console.log('====================');
    console.log(`✅ Analyzed ${results.length} iOS apps`);
    console.log(`⏱️  Total time: ${Math.floor(duration / 60)}m ${duration % 60}s`);
    console.log(`📁 Results saved to: ios-app-analysis-simple.json`);
    
    return results;
  }

  // Save results to file
  saveResults(results) {
    const output = {
      metadata: {
        platform: 'iOS App Store',
        analysisType: 'simplified',
        totalApps: results.length,
        timestamp: new Date().toISOString(),
        categories: Object.keys(this.categories),
        note: 'Simplified analysis using iTunes API data only'
      },
      summary: {
        gradeDistribution: {},
        categoryBreakdown: {},
        privacyPolicyStats: {
          appsWithPrivacyPolicy: 0,
          appsWithoutPrivacyPolicy: 0
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
      
      // Privacy policy stats
      if (app.privacyPolicyUrl) {
        output.summary.privacyPolicyStats.appsWithPrivacyPolicy++;
      } else {
        output.summary.privacyPolicyStats.appsWithoutPrivacyPolicy++;
      }
    });
    
    // Calculate average scores
    Object.keys(output.summary.categoryBreakdown).forEach(cat => {
      const scores = output.summary.categoryBreakdown[cat].scores;
      output.summary.categoryBreakdown[cat].avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      delete output.summary.categoryBreakdown[cat].scores;
    });
    
    fs.writeFileSync('ios-app-analysis-simple.json', JSON.stringify(output, null, 2));
    
    // Show top privacy concerns
    console.log('\n🏆 Apps without privacy policies:');
    const noPrivacy = results.filter(app => !app.privacyPolicyUrl).slice(0, 10);
    noPrivacy.forEach((app, i) => {
      console.log(`${i + 1}. ${app.name} (${app.category}) - ${app.developer}`);
    });
  }
}

// Run the scraper
if (require.main === module) {
  const scraper = new SimpleiOSAppStoreScraper();
  scraper.analyzeTopApps(50).catch(console.error);
}

module.exports = SimpleiOSAppStoreScraper;