#!/usr/bin/env node

/**
 * Simplified Real Analysis Script
 * Fetches actual documents and analyzes them
 */

const https = require('https');
const http = require('http');
const fs = require('fs');

// Top websites to analyze
const WEBSITES = [
  {
    id: "facebook",
    name: "Facebook",
    category: "Social Media",
    privacy: "https://www.facebook.com/policy.php",
    terms: "https://www.facebook.com/legal/terms"
  },
  {
    id: "google",
    name: "Google",
    category: "Technology",
    privacy: "https://policies.google.com/privacy",
    terms: "https://policies.google.com/terms"
  },
  {
    id: "amazon",
    name: "Amazon",
    category: "E-commerce",
    privacy: "https://www.amazon.com/gp/help/customer/display.html?nodeId=468496",
    terms: "https://www.amazon.com/gp/help/customer/display.html?nodeId=508088"
  },
  {
    id: "microsoft",
    name: "Microsoft",
    category: "Technology",
    privacy: "https://privacy.microsoft.com/en-us/privacystatement",
    terms: "https://www.microsoft.com/en-us/servicesagreement"
  },
  {
    id: "apple",
    name: "Apple",
    category: "Technology",
    privacy: "https://www.apple.com/legal/privacy/",
    terms: "https://www.apple.com/legal/internet-services/terms/site.html"
  }
];

// Fetch document from URL
function fetchDocument(url) {
  return new Promise((resolve, reject) => {
    console.log(`  Fetching: ${url}`);
    
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Handle redirect
        fetchDocument(res.headers.location).then(resolve).catch(reject);
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Extract text content (basic HTML stripping)
        const text = data
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        console.log(`    Fetched ${text.length} characters`);
        resolve(text);
      });
    }).on('error', (err) => {
      console.error(`    Failed to fetch: ${err.message}`);
      resolve(null);
    });
  });
}

// Analyze document for patterns
function analyzeDocument(content, docType) {
  if (!content || content.length < 100) {
    return { patterns: [], riskScore: 0, error: 'No content' };
  }
  
  const patterns = [];
  const problematicPatterns = [
    { 
      regex: /we may share your.{0,50}(personal )?information/gi, 
      type: 'data_sharing', 
      severity: 'high',
      description: 'Shares personal information'
    },
    { 
      regex: /third[- ]party/gi, 
      type: 'third_party_sharing', 
      severity: 'medium',
      description: 'Involves third parties'
    },
    { 
      regex: /automatic(ally)?.{0,20}renew/gi, 
      type: 'auto_renewal', 
      severity: 'medium',
      description: 'Has automatic renewal'
    },
    { 
      regex: /class action waiver/gi, 
      type: 'class_action_waiver', 
      severity: 'high',
      description: 'Waives class action rights'
    },
    { 
      regex: /binding arbitration/gi, 
      type: 'arbitration', 
      severity: 'high',
      description: 'Requires arbitration'
    },
    { 
      regex: /perpetual.{0,20}license/gi, 
      type: 'perpetual_license', 
      severity: 'high',
      description: 'Grants perpetual license'
    },
    { 
      regex: /no refund/gi, 
      type: 'no_refunds', 
      severity: 'medium',
      description: 'No refund policy'
    },
    { 
      regex: /(we are )?not (be )?responsible/gi, 
      type: 'liability_limitation', 
      severity: 'medium',
      description: 'Limits liability'
    },
    {
      regex: /change.{0,30}(these )?terms.{0,30}(at any time|without notice)/gi,
      type: 'unilateral_changes',
      severity: 'high',
      description: 'Can change terms without notice'
    },
    {
      regex: /(retain|keep).{0,30}(your )?data.{0,30}(indefinitely|forever)/gi,
      type: 'data_retention',
      severity: 'high',
      description: 'Retains data indefinitely'
    }
  ];
  
  // Search for patterns
  for (const pattern of problematicPatterns) {
    const matches = content.match(pattern.regex);
    if (matches && matches.length > 0) {
      const context = content.substring(
        Math.max(0, content.indexOf(matches[0]) - 50),
        Math.min(content.length, content.indexOf(matches[0]) + matches[0].length + 50)
      );
      
      patterns.push({
        type: pattern.type,
        severity: pattern.severity,
        description: pattern.description,
        count: matches.length,
        example: context.trim()
      });
    }
  }
  
  // Calculate risk score
  let riskScore = 50; // Base score
  patterns.forEach(p => {
    if (p.severity === 'high') riskScore += 10;
    else if (p.severity === 'medium') riskScore += 5;
  });
  riskScore = Math.min(riskScore, 100);
  
  return {
    patterns,
    riskScore,
    patternCount: patterns.length,
    analyzedLength: content.length
  };
}

// Analyze a website
async function analyzeWebsite(website) {
  console.log(`\n📊 Analyzing ${website.name}...`);
  
  const result = {
    id: website.id,
    name: website.name,
    category: website.category,
    timestamp: new Date().toISOString(),
    privacy: null,
    terms: null,
    combinedScore: 0,
    grade: 'F',
    realData: true
  };
  
  // Analyze privacy policy
  if (website.privacy) {
    const content = await fetchDocument(website.privacy);
    if (content) {
      result.privacy = analyzeDocument(content, 'privacy policy');
      result.privacy.url = website.privacy;
    }
  }
  
  // Analyze terms of service
  if (website.terms) {
    const content = await fetchDocument(website.terms);
    if (content) {
      result.terms = analyzeDocument(content, 'terms of service');
      result.terms.url = website.terms;
    }
  }
  
  // Calculate combined score
  const scores = [];
  if (result.privacy?.riskScore) scores.push(result.privacy.riskScore);
  if (result.terms?.riskScore) scores.push(result.terms.riskScore);
  
  if (scores.length > 0) {
    result.combinedScore = Math.round(scores.reduce((a, b) => a + b) / scores.length);
    
    // Assign grade
    if (result.combinedScore >= 90) result.grade = 'F';
    else if (result.combinedScore >= 80) result.grade = 'D';
    else if (result.combinedScore >= 70) result.grade = 'C';
    else if (result.combinedScore >= 60) result.grade = 'B';
    else result.grade = 'A';
  }
  
  console.log(`  ✅ Score: ${result.combinedScore}/100, Grade: ${result.grade}`);
  if (result.privacy) {
    console.log(`  📄 Privacy: ${result.privacy.patternCount} patterns found`);
  }
  if (result.terms) {
    console.log(`  📄 Terms: ${result.terms.patternCount} patterns found`);
  }
  
  return result;
}

// Main function
async function main() {
  console.log('🚀 Real Website Privacy Analysis');
  console.log('================================\n');
  console.log('This script fetches REAL privacy policies and terms of service.\n');
  
  const results = [];
  
  // Analyze each website
  for (const website of WEBSITES) {
    try {
      const result = await analyzeWebsite(website);
      results.push(result);
      
      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Failed to analyze ${website.name}:`, error.message);
    }
  }
  
  // Sort by score
  results.sort((a, b) => b.combinedScore - a.combinedScore);
  
  // Save results
  fs.writeFileSync('real-analysis-results.json', JSON.stringify(results, null, 2));
  
  console.log('\n📊 Analysis Complete!');
  console.log('====================');
  console.log(`✅ Analyzed ${results.length} websites with REAL data`);
  console.log(`📁 Results saved to: real-analysis-results.json`);
  
  console.log('\n🏆 Privacy Grades (Real Data):');
  results.forEach((site, i) => {
    console.log(`${i + 1}. ${site.name} - Score: ${site.combinedScore}/100, Grade: ${site.grade}`);
    if (site.privacy) {
      const topPatterns = site.privacy.patterns
        .filter(p => p.severity === 'high')
        .slice(0, 2);
      topPatterns.forEach(p => {
        console.log(`   ⚠️  ${p.description}`);
      });
    }
  });
  
  console.log('\n💡 This is REAL data from actual websites!');
  console.log('Use this for training your LoRA models.\n');
}

// Run the analysis
main().catch(console.error);