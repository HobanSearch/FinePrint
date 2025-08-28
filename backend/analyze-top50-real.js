#!/usr/bin/env node

/**
 * Complete Top 50 Real Website Analysis
 * Fetches and analyzes actual privacy policies and terms of service
 * from the top 50 websites for LoRA training data
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Complete list of top 50 websites
const TOP_50_WEBSITES = [
  { id: "facebook", name: "Facebook", category: "Social Media", privacy: "https://www.facebook.com/policy.php", terms: "https://www.facebook.com/legal/terms" },
  { id: "google", name: "Google", category: "Technology", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms" },
  { id: "amazon", name: "Amazon", category: "E-commerce", privacy: "https://www.amazon.com/gp/help/customer/display.html?nodeId=468496", terms: "https://www.amazon.com/gp/help/customer/display.html?nodeId=508088" },
  { id: "youtube", name: "YouTube", category: "Video Streaming", privacy: "https://www.youtube.com/howyoutubeworks/our-commitments/protecting-user-data/", terms: "https://www.youtube.com/t/terms" },
  { id: "twitter", name: "Twitter/X", category: "Social Media", privacy: "https://twitter.com/en/privacy", terms: "https://twitter.com/en/tos" },
  { id: "instagram", name: "Instagram", category: "Social Media", privacy: "https://help.instagram.com/519522125107875", terms: "https://help.instagram.com/581066165581870" },
  { id: "netflix", name: "Netflix", category: "Video Streaming", privacy: "https://help.netflix.com/legal/privacy", terms: "https://help.netflix.com/legal/termsofuse" },
  { id: "microsoft", name: "Microsoft", category: "Technology", privacy: "https://privacy.microsoft.com/en-us/privacystatement", terms: "https://www.microsoft.com/en-us/servicesagreement" },
  { id: "apple", name: "Apple", category: "Technology", privacy: "https://www.apple.com/legal/privacy/", terms: "https://www.apple.com/legal/internet-services/terms/site.html" },
  { id: "linkedin", name: "LinkedIn", category: "Professional", privacy: "https://www.linkedin.com/legal/privacy-policy", terms: "https://www.linkedin.com/legal/user-agreement" },
  { id: "reddit", name: "Reddit", category: "Social Media", privacy: "https://www.reddit.com/policies/privacy-policy", terms: "https://www.redditinc.com/policies/user-agreement" },
  { id: "tiktok", name: "TikTok", category: "Social Media", privacy: "https://www.tiktok.com/legal/privacy-policy", terms: "https://www.tiktok.com/legal/terms-of-service" },
  { id: "spotify", name: "Spotify", category: "Music Streaming", privacy: "https://www.spotify.com/us/legal/privacy-policy/", terms: "https://www.spotify.com/us/legal/end-user-agreement/" },
  { id: "paypal", name: "PayPal", category: "Financial Services", privacy: "https://www.paypal.com/us/webapps/mpp/ua/privacy-full", terms: "https://www.paypal.com/us/webapps/mpp/ua/useragreement-full" },
  { id: "ebay", name: "eBay", category: "E-commerce", privacy: "https://www.ebay.com/help/policies/member-behaviour-policies/user-privacy-notice-privacy-policy", terms: "https://www.ebay.com/help/policies/member-behaviour-policies/user-agreement" },
  { id: "snapchat", name: "Snapchat", category: "Social Media", privacy: "https://snap.com/en-US/privacy/privacy-policy", terms: "https://snap.com/en-US/terms" },
  { id: "whatsapp", name: "WhatsApp", category: "Messaging", privacy: "https://www.whatsapp.com/legal/privacy-policy", terms: "https://www.whatsapp.com/legal/terms-of-service" },
  { id: "zoom", name: "Zoom", category: "Video Conferencing", privacy: "https://zoom.us/privacy", terms: "https://zoom.us/terms" },
  { id: "uber", name: "Uber", category: "Transportation", privacy: "https://www.uber.com/legal/en/document/?name=privacy-notice", terms: "https://www.uber.com/legal/en/document/?name=general-terms-of-use" },
  { id: "airbnb", name: "Airbnb", category: "Travel", privacy: "https://www.airbnb.com/help/article/2855/airbnb-privacy", terms: "https://www.airbnb.com/help/article/2908/terms-of-service" },
  { id: "pinterest", name: "Pinterest", category: "Social Media", privacy: "https://policy.pinterest.com/en/privacy-policy", terms: "https://policy.pinterest.com/en/terms-of-service" },
  { id: "discord", name: "Discord", category: "Communication", privacy: "https://discord.com/privacy", terms: "https://discord.com/terms" },
  { id: "twitch", name: "Twitch", category: "Video Streaming", privacy: "https://www.twitch.tv/p/legal/privacy-notice/", terms: "https://www.twitch.tv/p/legal/terms-of-service/" },
  { id: "adobe", name: "Adobe", category: "Software", privacy: "https://www.adobe.com/privacy/policy.html", terms: "https://www.adobe.com/legal/terms.html" },
  { id: "github", name: "GitHub", category: "Developer Tools", privacy: "https://docs.github.com/en/github/site-policy/github-privacy-statement", terms: "https://docs.github.com/en/github/site-policy/github-terms-of-service" },
  { id: "dropbox", name: "Dropbox", category: "Cloud Storage", privacy: "https://www.dropbox.com/privacy", terms: "https://www.dropbox.com/terms" },
  { id: "salesforce", name: "Salesforce", category: "Business Software", privacy: "https://www.salesforce.com/company/privacy/", terms: "https://www.salesforce.com/company/legal/agreements/" },
  { id: "slack", name: "Slack", category: "Communication", privacy: "https://slack.com/privacy-policy", terms: "https://slack.com/terms-of-service" },
  { id: "stripe", name: "Stripe", category: "Financial Services", privacy: "https://stripe.com/privacy", terms: "https://stripe.com/ssa" },
  { id: "shopify", name: "Shopify", category: "E-commerce", privacy: "https://www.shopify.com/legal/privacy", terms: "https://www.shopify.com/legal/terms" },
  { id: "oracle", name: "Oracle", category: "Enterprise Software", privacy: "https://www.oracle.com/legal/privacy/", terms: "https://www.oracle.com/legal/terms.html" },
  { id: "ibm", name: "IBM", category: "Enterprise Software", privacy: "https://www.ibm.com/privacy", terms: "https://www.ibm.com/legal" },
  { id: "doordash", name: "DoorDash", category: "Food Delivery", privacy: "https://help.doordash.com/legal/document?type=dx-privacy-policy", terms: "https://help.doordash.com/legal/document?type=consumer-terms-of-service" },
  { id: "grubhub", name: "Grubhub", category: "Food Delivery", privacy: "https://www.grubhub.com/legal/privacy-policy", terms: "https://www.grubhub.com/legal/terms-of-use" },
  { id: "lyft", name: "Lyft", category: "Transportation", privacy: "https://www.lyft.com/privacy", terms: "https://www.lyft.com/terms" },
  { id: "coinbase", name: "Coinbase", category: "Cryptocurrency", privacy: "https://www.coinbase.com/legal/privacy", terms: "https://www.coinbase.com/legal/user_agreement" },
  { id: "binance", name: "Binance", category: "Cryptocurrency", privacy: "https://www.binance.com/en/privacy", terms: "https://www.binance.com/en/terms" },
  { id: "robinhood", name: "Robinhood", category: "Financial Services", privacy: "https://robinhood.com/us/en/about/legal/privacy/", terms: "https://robinhood.com/us/en/about/legal/customer-agreement/" },
  { id: "venmo", name: "Venmo", category: "Financial Services", privacy: "https://venmo.com/legal/us-privacy-policy/", terms: "https://venmo.com/legal/us-user-agreement/" },
  { id: "cashapp", name: "Cash App", category: "Financial Services", privacy: "https://cash.app/legal/us/en-us/privacy", terms: "https://cash.app/legal/us/en-us/tos" },
  { id: "hulu", name: "Hulu", category: "Video Streaming", privacy: "https://www.hulu.com/privacy", terms: "https://www.hulu.com/terms" },
  { id: "hbomax", name: "HBO Max", category: "Video Streaming", privacy: "https://www.warnermediaprivacy.com/", terms: "https://www.hbomax.com/terms-of-use" },
  { id: "disney", name: "Disney+", category: "Video Streaming", privacy: "https://privacy.thewaltdisneycompany.com/en/", terms: "https://www.disneyplus.com/legal/subscriber-agreement" },
  { id: "peacock", name: "Peacock", category: "Video Streaming", privacy: "https://www.peacocktv.com/privacy", terms: "https://www.peacocktv.com/terms" },
  { id: "paramount", name: "Paramount+", category: "Video Streaming", privacy: "https://www.paramountplus.com/privacy-policy/", terms: "https://www.paramountplus.com/terms-of-use/" },
  { id: "walmart", name: "Walmart", category: "E-commerce", privacy: "https://corporate.walmart.com/privacy-security/walmart-privacy-policy", terms: "https://www.walmart.com/help/article/walmart-com-terms-of-use/3b75080af40340d6bbd596f116fae5a0" },
  { id: "target", name: "Target", category: "E-commerce", privacy: "https://www.target.com/c/target-privacy-policy/-/N-4sr7p", terms: "https://www.target.com/c/terms-conditions/-/N-4sr7l" },
  { id: "bestbuy", name: "Best Buy", category: "E-commerce", privacy: "https://www.bestbuy.com/site/privacy-policy/privacy-policy/pcmcat204400050062.c", terms: "https://www.bestbuy.com/site/help-topics/conditions-of-use/pcmcat204400050067.c" },
  { id: "homedepot", name: "Home Depot", category: "E-commerce", privacy: "https://www.homedepot.com/privacy/privacy-and-security-statement", terms: "https://www.homedepot.com/c/Terms_of_Use" },
  { id: "etsy", name: "Etsy", category: "E-commerce", privacy: "https://www.etsy.com/legal/privacy/", terms: "https://www.etsy.com/legal/terms-of-use/" }
];

// Progress tracking
let completed = 0;
let failed = 0;
const startTime = Date.now();

// Results storage
const results = [];
const failedSites = [];

// Enhanced pattern detection
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

// Fetch document with retries
function fetchDocument(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (retriesLeft) => {
      console.log(`    Fetching: ${url} (${3 - retriesLeft + 1}/${retries} attempts)`);
      
      const client = url.startsWith('https') ? https : http;
      
      const req = client.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 30000
      }, (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) {
          const redirectUrl = res.headers.location;
          console.log(`    Redirected to: ${redirectUrl}`);
          fetchDocument(redirectUrl, retriesLeft).then(resolve).catch(reject);
          return;
        }
        
        if (res.statusCode !== 200) {
          if (retriesLeft > 0) {
            setTimeout(() => attempt(retriesLeft - 1), 3000);
          } else {
            resolve(null);
          }
          return;
        }
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          // Extract text content
          const text = data
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
          
          if (text.length < 500) {
            console.log(`    Warning: Short content (${text.length} chars)`);
          } else {
            console.log(`    Success: Fetched ${text.length} characters`);
          }
          
          resolve(text);
        });
      });
      
      req.on('error', (err) => {
        console.error(`    Error: ${err.message}`);
        if (retriesLeft > 0) {
          setTimeout(() => attempt(retriesLeft - 1), 3000);
        } else {
          resolve(null);
        }
      });
      
      req.on('timeout', () => {
        console.error('    Error: Request timeout');
        req.destroy();
        if (retriesLeft > 0) {
          setTimeout(() => attempt(retriesLeft - 1), 3000);
        } else {
          resolve(null);
        }
      });
    };
    
    attempt(retries - 1);
  });
}

// Analyze document
function analyzeDocument(content, docType) {
  if (!content || content.length < 100) {
    return { patterns: [], riskScore: 0, error: 'Insufficient content' };
  }
  
  const patterns = [];
  const patternsSeen = new Set();
  
  // Search for patterns
  for (const pattern of PRIVACY_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (matches && matches.length > 0 && !patternsSeen.has(pattern.type)) {
      patternsSeen.add(pattern.type);
      
      // Get context around first match
      const firstMatch = matches[0];
      const matchIndex = content.indexOf(firstMatch);
      const contextStart = Math.max(0, matchIndex - 100);
      const contextEnd = Math.min(content.length, matchIndex + firstMatch.length + 100);
      const context = content.substring(contextStart, contextEnd).trim();
      
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
    analyzedLength: content.length,
    hasGDPR: patterns.some(p => p.type === 'gdpr_mentioned'),
    hasChildrenPolicy: patterns.some(p => p.type === 'children_policy')
  };
}

// Analyze a website
async function analyzeWebsite(website, index) {
  const progress = `[${index + 1}/${TOP_50_WEBSITES.length}]`;
  console.log(`\n${progress} 📊 Analyzing ${website.name} (${website.category})...`);
  
  const result = {
    id: website.id,
    name: website.name,
    category: website.category,
    timestamp: new Date().toISOString(),
    privacy: null,
    terms: null,
    combinedScore: 0,
    grade: 'F',
    realData: true,
    dataQuality: 'unknown'
  };
  
  try {
    // Analyze privacy policy
    if (website.privacy) {
      const content = await fetchDocument(website.privacy);
      if (content && content.length > 500) {
        result.privacy = analyzeDocument(content, 'privacy policy');
        result.privacy.url = website.privacy;
        result.privacy.fetchSuccess = true;
      } else {
        result.privacy = { fetchSuccess: false, error: 'Failed to fetch or insufficient content' };
      }
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Analyze terms of service
    if (website.terms) {
      const content = await fetchDocument(website.terms);
      if (content && content.length > 500) {
        result.terms = analyzeDocument(content, 'terms of service');
        result.terms.url = website.terms;
        result.terms.fetchSuccess = true;
      } else {
        result.terms = { fetchSuccess: false, error: 'Failed to fetch or insufficient content' };
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
    }
    
    console.log(`  ✅ Score: ${result.combinedScore}/100, Grade: ${result.grade}, Quality: ${result.dataQuality}`);
    if (result.privacy?.fetchSuccess) {
      console.log(`  📄 Privacy: ${result.privacy.patternCount} patterns found (${result.privacy.analyzedLength} chars)`);
    }
    if (result.terms?.fetchSuccess) {
      console.log(`  📄 Terms: ${result.terms.patternCount} patterns found (${result.terms.analyzedLength} chars)`);
    }
    
    completed++;
    results.push(result);
    
  } catch (error) {
    console.error(`  ❌ Failed to analyze ${website.name}: ${error.message}`);
    failed++;
    failedSites.push({ name: website.name, error: error.message });
    results.push(result);
  }
  
  // Save intermediate results every 10 sites
  if ((completed + failed) % 10 === 0) {
    saveResults(true);
  }
  
  return result;
}

// Save results
function saveResults(intermediate = false) {
  const filename = intermediate ? 'top50-real-analysis-intermediate.json' : 'top50-real-analysis-complete.json';
  
  const output = {
    metadata: {
      totalSites: TOP_50_WEBSITES.length,
      completed,
      failed,
      successRate: ((completed / (completed + failed)) * 100).toFixed(1) + '%',
      timestamp: new Date().toISOString(),
      duration: Math.round((Date.now() - startTime) / 1000) + ' seconds',
      dataType: 'REAL_WEBSITE_DATA'
    },
    summary: {
      gradeDistribution: {},
      categoryBreakdown: {},
      commonPatterns: {},
      dataQuality: {}
    },
    results: results.sort((a, b) => b.combinedScore - a.combinedScore),
    failedSites
  };
  
  // Calculate summary statistics
  results.forEach(r => {
    // Grade distribution
    output.summary.gradeDistribution[r.grade] = (output.summary.gradeDistribution[r.grade] || 0) + 1;
    
    // Category breakdown
    if (!output.summary.categoryBreakdown[r.category]) {
      output.summary.categoryBreakdown[r.category] = { count: 0, avgScore: 0, scores: [] };
    }
    output.summary.categoryBreakdown[r.category].count++;
    output.summary.categoryBreakdown[r.category].scores.push(r.combinedScore);
    
    // Common patterns
    [r.privacy?.patterns, r.terms?.patterns].forEach(patterns => {
      if (patterns) {
        patterns.forEach(p => {
          if (!output.summary.commonPatterns[p.type]) {
            output.summary.commonPatterns[p.type] = { count: 0, severity: p.severity, description: p.description };
          }
          output.summary.commonPatterns[p.type].count++;
        });
      }
    });
    
    // Data quality
    output.summary.dataQuality[r.dataQuality] = (output.summary.dataQuality[r.dataQuality] || 0) + 1;
  });
  
  // Calculate average scores by category
  Object.keys(output.summary.categoryBreakdown).forEach(cat => {
    const scores = output.summary.categoryBreakdown[cat].scores;
    output.summary.categoryBreakdown[cat].avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    delete output.summary.categoryBreakdown[cat].scores;
  });
  
  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
  
  if (!intermediate) {
    console.log(`\n📁 Final results saved to: ${filename}`);
  }
}

// Main function
async function main() {
  console.log('🚀 Complete Top 50 Website Privacy Analysis (Real Data)');
  console.log('=====================================================\n');
  console.log('This script fetches REAL privacy policies and terms of service');
  console.log('from all 50 major websites for accurate LoRA training data.\n');
  
  // Process websites with rate limiting
  for (let i = 0; i < TOP_50_WEBSITES.length; i++) {
    try {
      await analyzeWebsite(TOP_50_WEBSITES[i], i);
      
      // Rate limiting: 3-5 second delay between sites
      if (i < TOP_50_WEBSITES.length - 1) {
        const delay = 3000 + Math.random() * 2000;
        console.log(`  ⏱️  Waiting ${(delay/1000).toFixed(1)}s before next site...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
    } catch (error) {
      console.error(`Failed to analyze site ${i + 1}: ${error.message}`);
    }
  }
  
  // Save final results
  saveResults(false);
  
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  console.log('\n📊 Analysis Complete!');
  console.log('====================');
  console.log(`✅ Successfully analyzed: ${completed} websites`);
  console.log(`❌ Failed: ${failed} websites`);
  console.log(`⏱️  Total time: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  console.log(`📁 Results saved to: top50-real-analysis-complete.json`);
  
  // Show top 10 worst offenders
  console.log('\n🏆 Top 10 Privacy Offenders (Real Data):');
  results
    .filter(r => r.combinedScore > 0)
    .slice(0, 10)
    .forEach((site, i) => {
      console.log(`${i + 1}. ${site.name} (${site.category}) - Score: ${site.combinedScore}/100, Grade: ${site.grade}`);
      
      // Show worst patterns
      const allPatterns = [
        ...(site.privacy?.patterns || []),
        ...(site.terms?.patterns || [])
      ].filter(p => p.severity === 'high').slice(0, 2);
      
      allPatterns.forEach(p => {
        console.log(`   ⚠️  ${p.description} (${p.count} instances)`);
      });
    });
  
  // Show category analysis
  console.log('\n📈 Analysis by Category:');
  const summary = {};
  results.forEach(r => {
    if (!summary[r.category]) {
      summary[r.category] = { count: 0, totalScore: 0 };
    }
    summary[r.category].count++;
    summary[r.category].totalScore += r.combinedScore;
  });
  
  Object.entries(summary)
    .map(([cat, data]) => ({
      category: cat,
      avgScore: Math.round(data.totalScore / data.count),
      count: data.count
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .forEach(cat => {
      console.log(`  ${cat.category}: ${cat.avgScore}/100 average (${cat.count} sites)`);
    });
  
  console.log('\n💡 This is REAL data from actual websites!');
  console.log('🎯 Ready for LoRA fine-tuning with genuine privacy patterns.\n');
}

// Run the analysis
main().catch(console.error);