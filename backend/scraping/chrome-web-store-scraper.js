#!/usr/bin/env node

/**
 * Chrome Web Store Scraper
 * Fetches top browser extensions and their privacy information
 */

const fs = require('fs');
const StealthScraper = require('./stealth-scraper');

class ChromeWebStoreScraper {
  constructor() {
    this.baseUrl = 'https://chromewebstore.google.com';
    this.categories = {
      'ext/22-accessibility': 'Accessibility',
      'ext/10-blogging': 'Blogging',
      'ext/15-by-google': 'By Google',
      'ext/11-web-development': 'Developer Tools',
      'ext/14-fun': 'Fun',
      'ext/6-news': 'News & Weather',
      'ext/7-productivity': 'Productivity',
      'ext/38-search-tools': 'Search Tools',
      'ext/12-shopping': 'Shopping',
      'ext/1-communication': 'Social & Communication',
      'ext/13-sports': 'Sports'
    };
    this.scraper = null;
  }

  // Extract extension IDs from category pages
  async scrapeTopExtensionsFromCategory(categoryPath, limit = 10) {
    if (!this.scraper) {
      this.scraper = new StealthScraper({
        headless: true,
        maxConcurrency: 1,
        rateLimit: 3000,
        timeout: 60000
      });
      await this.scraper.initialize();
    }
    
    const categoryUrl = `${this.baseUrl}/category/${categoryPath}`;
    const categoryName = this.categories[categoryPath] || categoryPath;
    console.log(`  🔍 Scraping category: ${categoryName}`);
    
    try {
      const page = await this.scraper.createPage();
      await page.goto(categoryUrl, { waitUntil: 'networkidle2' });
      
      // Wait for extensions to load
      await page.waitForSelector('a[href*="/detail/"]', { timeout: 10000 });
      
      // Scroll to load more extensions
      await this.scraper.autoScroll(page);
      
      // Extract extension information
      const extensions = await page.evaluate(() => {
        const extensionElements = document.querySelectorAll('a[href*="/detail/"]');
        const extensionMap = new Map();
        
        extensionElements.forEach(element => {
          const href = element.getAttribute('href');
          const match = href.match(/\/detail\/([^\/\?]+)/);
          if (match) {
            const extensionId = match[1];
            if (!extensionMap.has(extensionId)) {
              // Get extension name
              const nameElement = element.querySelector('h3') || 
                                element.querySelector('[role="heading"]') ||
                                element.querySelector('div');
              
              // Get rating and user count
              const ratingElement = element.querySelector('[aria-label*="rating"]');
              const userElement = element.querySelector('[aria-label*="users"]');
              
              extensionMap.set(extensionId, {
                id: extensionId,
                name: nameElement?.textContent?.trim() || 'Unknown Extension',
                url: `https://chromewebstore.google.com/detail/${extensionId}`,
                rating: ratingElement?.getAttribute('aria-label') || '',
                users: userElement?.textContent?.trim() || ''
              });
            }
          }
        });
        
        return Array.from(extensionMap.values());
      });
      
      await page.close();
      
      console.log(`    ✓ Found ${extensions.length} extensions`);
      return extensions.slice(0, limit);
      
    } catch (error) {
      console.error(`    ✗ Error scraping category:`, error.message);
      return [];
    }
  }

  // Scrape detailed extension information
  async scrapeExtensionDetails(extensionId) {
    const extensionUrl = `${this.baseUrl}/detail/${extensionId}`;
    console.log(`  🧩 Scraping extension details: ${extensionId}`);
    
    try {
      const page = await this.scraper.createPage();
      await page.goto(extensionUrl, { waitUntil: 'networkidle2' });
      
      // Wait for content to load
      await page.waitForSelector('h1', { timeout: 10000 });
      
      const extensionDetails = await page.evaluate(() => {
        const details = {
          name: '',
          developer: '',
          category: '',
          rating: 0,
          ratingCount: 0,
          users: '',
          description: '',
          version: '',
          updatedDate: '',
          size: '',
          permissions: [],
          privacyPolicyUrl: null,
          website: null,
          dataHandling: {
            collectedData: [],
            notCollectedData: [],
            privacyPractices: []
          }
        };
        
        // Get basic info
        const nameElement = document.querySelector('h1');
        details.name = nameElement?.textContent?.trim() || '';
        
        // Developer
        const devElements = Array.from(document.querySelectorAll('a')).filter(a =>
          a.textContent.includes('offered by') || a.getAttribute('href')?.includes('developer')
        );
        if (devElements.length > 0) {
          details.developer = devElements[0].textContent.replace('offered by', '').trim();
        }
        
        // Rating
        const ratingElement = document.querySelector('[aria-label*="rating"]');
        if (ratingElement) {
          const ratingMatch = ratingElement.getAttribute('aria-label').match(/(\d+\.?\d*)/);
          details.rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
        }
        
        // Users
        const userElement = Array.from(document.querySelectorAll('div')).find(div =>
          div.textContent.includes('users')
        );
        if (userElement) {
          const userMatch = userElement.textContent.match(/([0-9,]+\+?)\s*users/);
          details.users = userMatch ? userMatch[1] : 'Unknown';
        }
        
        // Version and update date
        const versionElement = Array.from(document.querySelectorAll('div')).find(div =>
          div.textContent.includes('Version:')
        );
        if (versionElement) {
          const versionMatch = versionElement.textContent.match(/Version:\s*([^\s]+)/);
          details.version = versionMatch ? versionMatch[1] : '';
        }
        
        const dateElement = Array.from(document.querySelectorAll('div')).find(div =>
          div.textContent.includes('Updated:')
        );
        if (dateElement) {
          const dateMatch = dateElement.textContent.match(/Updated:\s*(.+)/);
          details.updatedDate = dateMatch ? dateMatch[1] : '';
        }
        
        // Description
        const descElement = document.querySelector('[itemprop="description"]') ||
                          Array.from(document.querySelectorAll('div')).find(div =>
                            div.textContent.length > 100 && 
                            !div.textContent.includes('Version:') &&
                            !div.textContent.includes('Updated:')
                          );
        details.description = descElement?.textContent?.trim() || '';
        
        // Permissions
        const permissionSection = Array.from(document.querySelectorAll('div')).find(div =>
          div.textContent.includes('This extension may') || 
          div.textContent.includes('permissions') ||
          div.textContent.includes('Site access')
        );
        
        if (permissionSection) {
          const permissionItems = permissionSection.querySelectorAll('li');
          details.permissions = Array.from(permissionItems).map(li => li.textContent.trim());
        }
        
        // Privacy practices section
        const privacySection = Array.from(document.querySelectorAll('section, div')).find(section =>
          section.textContent.includes('Privacy practices') ||
          section.textContent.includes('handles the following')
        );
        
        if (privacySection) {
          // Data collected
          const collectedMatch = privacySection.textContent.match(/This developer declares that your data is(.+?)(?:For example|Not)|handles the following:(.+?)(?:This developer|$)/s);
          if (collectedMatch) {
            const items = (collectedMatch[1] || collectedMatch[2]).match(/[•·]\s*([^•·\n]+)/g);
            if (items) {
              details.dataHandling.collectedData = items.map(item => 
                item.replace(/[•·]\s*/, '').trim()
              );
            }
          }
          
          // Privacy practices
          if (privacySection.textContent.includes('Not sold to third parties')) {
            details.dataHandling.privacyPractices.push('Not sold to third parties');
          }
          if (privacySection.textContent.includes('Not used for purposes unrelated')) {
            details.dataHandling.privacyPractices.push('Not used for unrelated purposes');
          }
          if (privacySection.textContent.includes('Not used to determine creditworthiness')) {
            details.dataHandling.privacyPractices.push('Not used for creditworthiness');
          }
        }
        
        // Privacy policy link
        const privacyLink = Array.from(document.querySelectorAll('a')).find(a =>
          a.textContent.toLowerCase().includes('privacy policy') ||
          a.textContent.toLowerCase().includes('privacy statement')
        );
        details.privacyPolicyUrl = privacyLink?.href || null;
        
        // Developer website
        const websiteLink = Array.from(document.querySelectorAll('a')).find(a =>
          a.textContent.toLowerCase().includes('website') ||
          a.textContent.toLowerCase().includes('support site')
        );
        details.website = websiteLink?.href || null;
        
        return details;
      });
      
      await page.close();
      return extensionDetails;
      
    } catch (error) {
      console.error(`    ✗ Error scraping extension details:`, error.message);
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
      
      // Extension-specific privacy patterns
      const patterns = [
        { regex: /collect.{0,50}(browsing|history|bookmarks|tabs)/gi, type: 'browsing_data_collection', severity: 'high' },
        { regex: /access.{0,30}all.{0,20}(websites|sites|tabs)/gi, type: 'all_sites_access', severity: 'high' },
        { regex: /read.{0,30}(modify|change).{0,30}data/gi, type: 'data_modification', severity: 'high' },
        { regex: /inject.{0,30}(script|code|content)/gi, type: 'code_injection', severity: 'high' },
        { regex: /track.{0,30}(activity|behavior|usage)/gi, type: 'activity_tracking', severity: 'high' },
        { regex: /share.{0,50}third.{0,20}part/gi, type: 'third_party_sharing', severity: 'high' },
        { regex: /advertis/gi, type: 'advertising', severity: 'medium' },
        { regex: /analytics/gi, type: 'analytics', severity: 'medium' },
        { regex: /cookies?/gi, type: 'cookies', severity: 'medium' },
        { regex: /sell.{0,30}data/gi, type: 'data_sale', severity: 'high' },
        { regex: /encrypt/gi, type: 'encryption', severity: 'low' },
        { regex: /open.{0,10}source/gi, type: 'open_source', severity: 'low' },
        { regex: /gdpr|ccpa/gi, type: 'compliance', severity: 'low' }
      ];
      
      const foundPatterns = [];
      let riskScore = 30; // Base score for extensions
      
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
            riskScore += 7;
          } else if (pattern.severity === 'low') {
            riskScore -= 5;
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
  calculatePrivacyScore(extensionDetails, privacyAnalysis) {
    let score = 40; // Base score
    
    // Adjust based on permissions
    if (extensionDetails?.permissions) {
      const dangerousPermissions = extensionDetails.permissions.filter(p =>
        p.toLowerCase().includes('all sites') ||
        p.toLowerCase().includes('all urls') ||
        p.toLowerCase().includes('browsing history') ||
        p.toLowerCase().includes('modify data') ||
        p.toLowerCase().includes('read data')
      );
      score += dangerousPermissions.length * 10;
      
      // Any permission adds some risk
      score += Math.min(extensionDetails.permissions.length * 2, 20);
    }
    
    // Adjust based on data handling
    if (extensionDetails?.dataHandling) {
      score += extensionDetails.dataHandling.collectedData.length * 5;
      score -= extensionDetails.dataHandling.privacyPractices.length * 5;
    }
    
    // Include privacy policy score
    if (privacyAnalysis?.riskScore) {
      score = (score + privacyAnalysis.riskScore) / 2;
    }
    
    // No privacy policy is a red flag
    if (!extensionDetails?.privacyPolicyUrl) {
      score += 10;
    }
    
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  // Analyze a single extension
  async analyzeExtension(extension) {
    console.log(`\n🧩 Analyzing: ${extension.name}`);
    
    const result = {
      id: extension.id,
      name: extension.name,
      url: extension.url,
      timestamp: new Date().toISOString(),
      details: null,
      privacyPolicy: null,
      combinedScore: 0,
      grade: 'F'
    };
    
    try {
      // Get detailed extension information
      result.details = await this.scrapeExtensionDetails(extension.id);
      
      if (result.details) {
        // Update basic info with detailed data
        result.name = result.details.name || extension.name;
        result.developer = result.details.developer;
        result.rating = result.details.rating;
        result.users = result.details.users;
        result.permissions = result.details.permissions;
        
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
      
      if (result.details?.permissions?.length > 0) {
        console.log(`  ⚠️  Permissions: ${result.details.permissions.slice(0, 2).join(', ')}`);
      }
      
    } catch (error) {
      console.error(`  ❌ Error analyzing extension:`, error.message);
      result.error = error.message;
    }
    
    return result;
  }

  // Main analysis function
  async analyzeTopExtensions(limit = 50) {
    console.log('🚀 Chrome Web Store Privacy Analysis');
    console.log('====================================\n');
    
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
      
      // Get extensions from each category
      const allExtensions = [];
      const extensionsPerCategory = Math.ceil(limit / Object.keys(this.categories).length);
      
      for (const [categoryPath, categoryName] of Object.entries(this.categories)) {
        console.log(`\n📂 Fetching ${categoryName} extensions...`);
        const categoryExtensions = await this.scrapeTopExtensionsFromCategory(categoryPath, extensionsPerCategory);
        
        categoryExtensions.forEach(ext => {
          ext.category = categoryName;
        });
        
        allExtensions.push(...categoryExtensions);
        
        // Rate limiting between categories
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      console.log(`\n📊 Total extensions collected: ${allExtensions.length}`);
      
      // Analyze each extension
      const extensionsToAnalyze = allExtensions.slice(0, limit);
      for (let i = 0; i < extensionsToAnalyze.length; i++) {
        const progress = `[${i + 1}/${extensionsToAnalyze.length}]`;
        console.log(`\n${progress} Processing extension ${i + 1} of ${extensionsToAnalyze.length}`);
        
        const result = await this.analyzeExtension(extensionsToAnalyze[i]);
        results.push(result);
        
        // Save intermediate results
        if ((i + 1) % 10 === 0) {
          this.saveResults(results, true);
        }
        
        // Rate limiting
        if (i < extensionsToAnalyze.length - 1) {
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
    console.log(`✅ Analyzed ${results.length} Chrome extensions`);
    console.log(`⏱️  Total time: ${Math.floor(duration / 60)}m ${duration % 60}s`);
    console.log(`📁 Results saved to: chrome-extensions-analysis.json`);
    
    return results;
  }

  // Save results to file
  saveResults(results, intermediate = false) {
    const filename = intermediate ? 'chrome-extensions-analysis-intermediate.json' : 'chrome-extensions-analysis.json';
    
    const output = {
      metadata: {
        platform: 'Chrome Web Store',
        totalExtensions: results.length,
        timestamp: new Date().toISOString(),
        categories: Object.values(this.categories)
      },
      summary: {
        gradeDistribution: {},
        categoryBreakdown: {},
        permissionStats: {
          extensionsWithAllSitesAccess: 0,
          extensionsWithDataCollection: 0,
          extensionsWithPrivacyPolicy: 0,
          avgPermissionsPerExtension: 0
        }
      },
      results: results.sort((a, b) => b.combinedScore - a.combinedScore)
    };
    
    // Calculate summary statistics
    let totalPermissions = 0;
    results.forEach(ext => {
      // Grade distribution
      output.summary.gradeDistribution[ext.grade] = (output.summary.gradeDistribution[ext.grade] || 0) + 1;
      
      // Category breakdown
      const category = ext.category || 'Unknown';
      if (!output.summary.categoryBreakdown[category]) {
        output.summary.categoryBreakdown[category] = { count: 0, avgScore: 0, scores: [] };
      }
      output.summary.categoryBreakdown[category].count++;
      output.summary.categoryBreakdown[category].scores.push(ext.combinedScore);
      
      // Permission stats
      if (ext.permissions?.length > 0) {
        totalPermissions += ext.permissions.length;
        
        const hasAllSitesAccess = ext.permissions.some(p =>
          p.toLowerCase().includes('all sites') ||
          p.toLowerCase().includes('all urls')
        );
        if (hasAllSitesAccess) {
          output.summary.permissionStats.extensionsWithAllSitesAccess++;
        }
      }
      
      if (ext.details?.dataHandling?.collectedData?.length > 0) {
        output.summary.permissionStats.extensionsWithDataCollection++;
      }
      
      if (ext.details?.privacyPolicyUrl) {
        output.summary.permissionStats.extensionsWithPrivacyPolicy++;
      }
    });
    
    // Calculate averages
    output.summary.permissionStats.avgPermissionsPerExtension = 
      results.length > 0 ? Math.round(totalPermissions / results.length * 10) / 10 : 0;
    
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
      console.log('\n🏆 Top 10 Chrome Extension Privacy Offenders:');
      results.slice(0, 10).forEach((ext, i) => {
        console.log(`${i + 1}. ${ext.name} (${ext.category || 'Unknown'}) - Score: ${ext.combinedScore}/100, Grade: ${ext.grade}`);
        if (ext.permissions?.length > 0) {
          const dangerous = ext.permissions.filter(p =>
            p.toLowerCase().includes('all sites') ||
            p.toLowerCase().includes('modify data')
          );
          if (dangerous.length > 0) {
            console.log(`   ⚠️  Dangerous: ${dangerous.slice(0, 2).join(', ')}`);
          }
        }
      });
    }
  }
}

// Run the scraper
if (require.main === module) {
  const scraper = new ChromeWebStoreScraper();
  scraper.analyzeTopExtensions(50).catch(console.error);
}

module.exports = ChromeWebStoreScraper;