#!/usr/bin/env node

/**
 * Re-analyze Failed Websites with Puppeteer
 * Uses stealth techniques to bypass bot detection
 */

const StealthScraper = require('./stealth-scraper');
const fs = require('fs');
const path = require('path');

// Failed websites from previous analysis
const FAILED_SITES = [
  { id: "reddit", name: "Reddit", category: "Social Media", privacy: "https://www.reddit.com/policies/privacy-policy", terms: "https://www.redditinc.com/policies/user-agreement" },
  { id: "tiktok", name: "TikTok", category: "Social Media", privacy: "https://www.tiktok.com/legal/privacy-policy", terms: "https://www.tiktok.com/legal/terms-of-service" },
  { id: "paypal", name: "PayPal", category: "Financial Services", privacy: "https://www.paypal.com/us/webapps/mpp/ua/privacy-full", terms: "https://www.paypal.com/us/webapps/mpp/ua/useragreement-full" },
  { id: "ebay", name: "eBay", category: "E-commerce", privacy: "https://www.ebay.com/help/policies/member-behaviour-policies/user-privacy-notice-privacy-policy", terms: "https://www.ebay.com/help/policies/member-behaviour-policies/user-agreement" },
  { id: "snapchat", name: "Snapchat", category: "Social Media", privacy: "https://snap.com/en-US/privacy/privacy-policy", terms: "https://snap.com/en-US/terms" },
  { id: "zoom", name: "Zoom", category: "Video Conferencing", privacy: "https://zoom.us/privacy", terms: "https://zoom.us/terms" },
  { id: "discord", name: "Discord", category: "Communication", privacy: "https://discord.com/privacy", terms: "https://discord.com/terms" },
  { id: "github", name: "GitHub", category: "Developer Tools", privacy: "https://docs.github.com/en/github/site-policy/github-privacy-statement", terms: "https://docs.github.com/en/github/site-policy/github-terms-of-service" },
  { id: "slack", name: "Slack", category: "Communication", privacy: "https://slack.com/privacy-policy", terms: "https://slack.com/terms-of-service" },
  { id: "binance", name: "Binance", category: "Cryptocurrency", privacy: "https://www.binance.com/en/privacy", terms: "https://www.binance.com/en/terms" },
  { id: "homedepot", name: "Home Depot", category: "E-commerce", privacy: "https://www.homedepot.com/privacy/privacy-and-security-statement", terms: "https://www.homedepot.com/c/Terms_of_Use" },
  { id: "etsy", name: "Etsy", category: "E-commerce", privacy: "https://www.etsy.com/legal/privacy/", terms: "https://www.etsy.com/legal/terms-of-use/" }
];

// Pattern detection (same as before)
const PRIVACY_PATTERNS = [
  { regex: /we may share your.{0,50}(personal )?information/gi, type: 'data_sharing', severity: 'high', description: 'Shares personal information' },
  { regex: /third[- ]party/gi, type: 'third_party_sharing', severity: 'medium', description: 'Involves third parties' },
  { regex: /automatic(ally)?.{0,20}renew/gi, type: 'auto_renewal', severity: 'medium', description: 'Has automatic renewal' },
  { regex: /class action waiver/gi, type: 'class_action_waiver', severity: 'high', description: 'Waives class action rights' },
  { regex: /binding arbitration/gi, type: 'arbitration', severity: 'high', description: 'Requires arbitration' },
  { regex: /perpetual.{0,20}license/gi, type: 'perpetual_license', severity: 'high', description: 'Grants perpetual license' },
  { regex: /no refund/gi, type: 'no_refunds', severity: 'medium', description: 'No refund policy' },
  { regex: /(we are )?not (be )?responsible/gi, type: 'liability_limitation', severity: 'medium', description: 'Limits liability' },
  { regex: /change.{0,30}(these )?terms.{0,30}(at any time|without notice)/gi, type: 'unilateral_changes', severity: 'high', description: 'Can change terms without notice' },
  { regex: /(retain|keep).{0,30}(your )?data.{0,30}(indefinitely|forever)/gi, type: 'data_retention', severity: 'high', description: 'Retains data indefinitely' },
  { regex: /sell.{0,30}personal.{0,20}(information|data)/gi, type: 'data_sale', severity: 'high', description: 'May sell personal data' },
  { regex: /cookies?.{0,30}track/gi, type: 'tracking_cookies', severity: 'medium', description: 'Uses tracking cookies' },
  { regex: /gdpr/gi, type: 'gdpr_mentioned', severity: 'low', description: 'Mentions GDPR compliance' },
  { regex: /children.{0,30}under.{0,10}(13|sixteen|18)/gi, type: 'children_policy', severity: 'low', description: 'Has children\'s privacy policy' }
];

// Analyze document content
function analyzeContent(text, docType) {
  if (!text || text.length < 100) {
    return { patterns: [], riskScore: 0, error: 'Insufficient content' };
  }
  
  const patterns = [];
  const patternsSeen = new Set();
  
  // Search for patterns
  for (const pattern of PRIVACY_PATTERNS) {
    const matches = text.match(pattern.regex);
    if (matches && matches.length > 0 && !patternsSeen.has(pattern.type)) {
      patternsSeen.add(pattern.type);
      
      // Get context around first match
      const firstMatch = matches[0];
      const matchIndex = text.indexOf(firstMatch);
      const contextStart = Math.max(0, matchIndex - 100);
      const contextEnd = Math.min(text.length, matchIndex + firstMatch.length + 100);
      const context = text.substring(contextStart, contextEnd).trim();
      
      patterns.push({
        type: pattern.type,
        severity: pattern.severity,
        description: pattern.description,
        count: matches.length,
        example: context,
        confidence: matches.length > 1 ? 'high' : 'medium'
      });
    }
  }
  
  // Calculate risk score
  let riskScore = 40; // Base score
  patterns.forEach(p => {
    if (p.severity === 'high') {
      riskScore += p.count > 5 ? 15 : 10;
    } else if (p.severity === 'medium') {
      riskScore += p.count > 10 ? 8 : 5;
    } else if (p.severity === 'low') {
      riskScore -= 2; // Good patterns reduce score
    }
  });
  
  // Normalize score
  riskScore = Math.max(0, Math.min(100, riskScore));
  
  return {
    patterns,
    riskScore,
    patternCount: patterns.length,
    analyzedLength: text.length,
    hasGDPR: patterns.some(p => p.type === 'gdpr_mentioned'),
    hasChildrenPolicy: patterns.some(p => p.type === 'children_policy')
  };
}

// Main analysis function
async function analyzeFai(sites) {
  const scraper = new StealthScraper({
    headless: true,
    maxConcurrency: 2,
    rateLimit: 3000,
    retries: 3,
    timeout: 60000
  });
  
  const results = [];
  const startTime = Date.now();
  
  try {
    await scraper.initialize();
    
    // Create screenshots directory
    try {
      fs.mkdirSync('screenshots', { recursive: true });
    } catch (e) {}
    
    console.log('🚀 Re-analyzing failed websites with Puppeteer stealth mode...\n');
    
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      const progress = `[${i + 1}/${sites.length}]`;
      
      console.log(`\n${progress} 📊 Analyzing ${site.name} (${site.category})...`);
      
      const result = {
        id: site.id,
        name: site.name,
        category: site.category,
        timestamp: new Date().toISOString(),
        privacy: null,
        terms: null,
        combinedScore: 0,
        grade: 'F',
        realData: true,
        dataQuality: 'unknown',
        scrapingMethod: 'puppeteer-stealth'
      };
      
      try {
        // Scrape privacy policy
        if (site.privacy) {
          console.log(`  📄 Fetching privacy policy...`);
          const privacyResult = await scraper.scrapeUrl(site.privacy, {
            screenshot: true,
            extractContent: true,
            cookieConsent: true,
            scrollToBottom: true
          });
          
          if (privacyResult.success && privacyResult.content) {
            const text = privacyResult.content.text;
            console.log(`    ✓ Scraped ${text.length} characters`);
            
            result.privacy = analyzeContent(text, 'privacy policy');
            result.privacy.url = site.privacy;
            result.privacy.fetchSuccess = true;
            result.privacy.screenshot = privacyResult.screenshot;
            
            // Extract privacy-specific content if available
            const page = await scraper.createPage();
            await page.goto(site.privacy, { waitUntil: 'networkidle2' });
            const privacyContent = await scraper.extractPrivacyPolicy(page);
            if (privacyContent.found) {
              console.log(`    ✓ Found dedicated privacy section`);
              const dedicatedAnalysis = analyzeContent(privacyContent.text, 'privacy policy');
              if (dedicatedAnalysis.patternCount > result.privacy.patternCount) {
                result.privacy = { ...dedicatedAnalysis, url: site.privacy, fetchSuccess: true };
              }
            }
            await page.close();
          } else {
            result.privacy = { 
              fetchSuccess: false, 
              error: privacyResult.error || 'Failed to extract content',
              attempts: privacyResult.attempts 
            };
          }
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Scrape terms of service
        if (site.terms) {
          console.log(`  📄 Fetching terms of service...`);
          const termsResult = await scraper.scrapeUrl(site.terms, {
            screenshot: true,
            extractContent: true,
            cookieConsent: true,
            scrollToBottom: true
          });
          
          if (termsResult.success && termsResult.content) {
            const text = termsResult.content.text;
            console.log(`    ✓ Scraped ${text.length} characters`);
            
            result.terms = analyzeContent(text, 'terms of service');
            result.terms.url = site.terms;
            result.terms.fetchSuccess = true;
            result.terms.screenshot = termsResult.screenshot;
          } else {
            result.terms = { 
              fetchSuccess: false, 
              error: termsResult.error || 'Failed to extract content',
              attempts: termsResult.attempts 
            };
          }
        }
        
        // Calculate combined score
        const scores = [];
        if (result.privacy?.riskScore !== undefined) scores.push(result.privacy.riskScore);
        if (result.terms?.riskScore !== undefined) scores.push(result.terms.riskScore);
        
        if (scores.length > 0) {
          result.combinedScore = Math.round(scores.reduce((a, b) => a + b) / scores.length);
          
          // Assign grade
          if (result.combinedScore >= 90) result.grade = 'F';
          else if (result.combinedScore >= 80) result.grade = 'D';
          else if (result.combinedScore >= 70) result.grade = 'C';
          else if (result.combinedScore >= 60) result.grade = 'B';
          else result.grade = 'A';
          
          // Assess data quality
          const totalPatterns = (result.privacy?.patternCount || 0) + (result.terms?.patternCount || 0);
          const totalLength = (result.privacy?.analyzedLength || 0) + (result.terms?.analyzedLength || 0);
          
          if (totalLength > 50000 && totalPatterns > 5) {
            result.dataQuality = 'excellent';
          } else if (totalLength > 20000 && totalPatterns > 2) {
            result.dataQuality = 'good';
          } else if (totalLength > 5000) {
            result.dataQuality = 'fair';
          } else {
            result.dataQuality = 'poor';
          }
          
          console.log(`  ✅ Score: ${result.combinedScore}/100, Grade: ${result.grade}, Quality: ${result.dataQuality}`);
        } else {
          console.log(`  ❌ Failed to analyze both documents`);
        }
        
      } catch (error) {
        console.error(`  ❌ Error analyzing ${site.name}:`, error.message);
        result.error = error.message;
      }
      
      results.push(result);
    }
    
  } finally {
    await scraper.close();
  }
  
  // Save results
  const duration = Math.round((Date.now() - startTime) / 1000);
  const successful = results.filter(r => r.combinedScore > 0).length;
  
  const output = {
    metadata: {
      totalSites: sites.length,
      successful,
      failed: sites.length - successful,
      successRate: ((successful / sites.length) * 100).toFixed(1) + '%',
      timestamp: new Date().toISOString(),
      duration: duration + ' seconds',
      scrapingMethod: 'puppeteer-stealth'
    },
    results: results.sort((a, b) => b.combinedScore - a.combinedScore)
  };
  
  fs.writeFileSync('failed-sites-reanalysis.json', JSON.stringify(output, null, 2));
  
  console.log('\n📊 Re-analysis Complete!');
  console.log('======================');
  console.log(`✅ Successfully analyzed: ${successful} websites`);
  console.log(`❌ Failed: ${sites.length - successful} websites`);
  console.log(`⏱️  Total time: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  console.log(`📁 Results saved to: failed-sites-reanalysis.json`);
  
  return output;
}

// Run the analysis
if (require.main === module) {
  analyzeFai(FAILED_SITES).catch(console.error);
}

module.exports = analyzeFai;