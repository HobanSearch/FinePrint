#!/usr/bin/env ts-node

/**
 * Real Top 50 Website Analysis Script
 * This fetches actual privacy policies and terms of service documents
 * and analyzes them using the Fine Print AI pipeline
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

const prisma = new PrismaClient();

// Top 50 websites with their document URLs
const TOP_50_WEBSITES = [
  {
    id: "facebook",
    name: "Facebook",
    category: "Social Media",
    urls: {
      privacy: "https://www.facebook.com/policy.php",
      terms: "https://www.facebook.com/legal/terms"
    }
  },
  {
    id: "google",
    name: "Google",
    category: "Technology",
    urls: {
      privacy: "https://policies.google.com/privacy",
      terms: "https://policies.google.com/terms"
    }
  },
  {
    id: "amazon",
    name: "Amazon",
    category: "E-commerce",
    urls: {
      privacy: "https://www.amazon.com/gp/help/customer/display.html?nodeId=468496",
      terms: "https://www.amazon.com/gp/help/customer/display.html?nodeId=508088"
    }
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "Video Streaming",
    urls: {
      privacy: "https://www.youtube.com/howyoutubeworks/our-commitments/protecting-user-data/",
      terms: "https://www.youtube.com/t/terms"
    }
  },
  {
    id: "twitter",
    name: "Twitter/X",
    category: "Social Media",
    urls: {
      privacy: "https://twitter.com/en/privacy",
      terms: "https://twitter.com/en/tos"
    }
  },
  {
    id: "microsoft",
    name: "Microsoft",
    category: "Technology",
    urls: {
      privacy: "https://privacy.microsoft.com/en-us/privacystatement",
      terms: "https://www.microsoft.com/en-us/servicesagreement"
    }
  },
  {
    id: "apple",
    name: "Apple",
    category: "Technology",
    urls: {
      privacy: "https://www.apple.com/legal/privacy/",
      terms: "https://www.apple.com/legal/internet-services/terms/site.html"
    }
  },
  {
    id: "netflix",
    name: "Netflix",
    category: "Video Streaming",
    urls: {
      privacy: "https://help.netflix.com/legal/privacy",
      terms: "https://help.netflix.com/legal/termsofuse"
    }
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "Professional",
    urls: {
      privacy: "https://www.linkedin.com/legal/privacy-policy",
      terms: "https://www.linkedin.com/legal/user-agreement"
    }
  },
  {
    id: "instagram",
    name: "Instagram",
    category: "Social Media",
    urls: {
      privacy: "https://help.instagram.com/519522125107875",
      terms: "https://help.instagram.com/581066165581870"
    }
  }
  // Add more websites as needed
];

// Fetch document content from URL
async function fetchDocument(url: string): Promise<string | null> {
  console.log(`  Fetching: ${url}`);
  
  try {
    // Try simple HTTP fetch first
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    
    // Remove scripts and styles
    $('script').remove();
    $('style').remove();
    
    // Get text content
    const content = $('body').text().replace(/\s+/g, ' ').trim();
    
    if (content.length > 1000) {
      return content;
    }
  } catch (error) {
    console.log(`  Simple fetch failed, trying with browser...`);
  }
  
  // Fallback to browser-based fetching for dynamic content
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    // Get text content
    const content = await page.evaluate(() => {
      return document.body.innerText;
    });
    
    await browser.close();
    return content;
  } catch (error) {
    console.error(`  Failed to fetch ${url}:`, error.message);
    if (browser) await browser.close();
    return null;
  }
}

// Analyze document using Ollama
async function analyzeWithAI(content: string, docType: string): Promise<any> {
  const prompt = `Analyze this ${docType} and identify problematic patterns. Look for:
- Data sharing with third parties
- Automatic renewals
- Arbitration clauses
- Class action waivers
- Perpetual licenses
- No refund policies
- Liability limitations
- Unilateral term changes
- Data retention policies

Provide a JSON response with:
{
  "patterns": [{"type": "pattern_name", "severity": "high/medium/low", "description": "explanation", "quote": "relevant text"}],
  "riskScore": 0-100,
  "summary": "brief summary",
  "keyFindings": ["finding1", "finding2"]
}`;

  try {
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'phi',
      prompt: `${prompt}\n\nDocument:\n${content.substring(0, 8000)}`,
      format: 'json',
      stream: false
    });
    
    return JSON.parse(response.data.response);
  } catch (error) {
    console.error('AI analysis failed:', error.message);
    return null;
  }
}

// Pattern-based analysis fallback
function patternAnalysis(content: string) {
  const patterns = [];
  const problematicPatterns = [
    { regex: /we may share your.{0,50}information/gi, type: 'data_sharing', severity: 'high' },
    { regex: /third[- ]party/gi, type: 'third_party_sharing', severity: 'medium' },
    { regex: /automatic.{0,20}renew/gi, type: 'auto_renewal', severity: 'medium' },
    { regex: /class action waiver/gi, type: 'legal_waiver', severity: 'high' },
    { regex: /binding arbitration/gi, type: 'arbitration', severity: 'high' },
    { regex: /perpetual.{0,20}license/gi, type: 'perpetual_license', severity: 'high' },
    { regex: /no refund/gi, type: 'no_refunds', severity: 'medium' },
    { regex: /not responsible/gi, type: 'liability_limitation', severity: 'medium' },
    { regex: /modify.{0,30}terms.{0,30}without notice/gi, type: 'unilateral_changes', severity: 'high' },
    { regex: /retain.{0,30}data.{0,30}indefinitely/gi, type: 'data_retention', severity: 'high' }
  ];
  
  for (const pattern of problematicPatterns) {
    const matches = content.match(pattern.regex);
    if (matches) {
      patterns.push({
        type: pattern.type,
        severity: pattern.severity,
        description: `Found ${matches.length} instances`,
        quote: matches[0].substring(0, 200)
      });
    }
  }
  
  const riskScore = Math.min(50 + patterns.filter(p => p.severity === 'high').length * 10 + 
                              patterns.filter(p => p.severity === 'medium').length * 5, 100);
  
  return { patterns, riskScore };
}

// Main analysis function
async function analyzeWebsite(website: any) {
  console.log(`\nAnalyzing ${website.name}...`);
  
  const results = {
    id: website.id,
    websiteName: website.name,
    category: website.category,
    privacyAnalysis: null,
    termsAnalysis: null,
    combinedScore: 0,
    grade: 'F',
    timestamp: new Date().toISOString()
  };
  
  // Fetch and analyze privacy policy
  if (website.urls.privacy) {
    const privacyContent = await fetchDocument(website.urls.privacy);
    if (privacyContent) {
      console.log(`  Analyzing privacy policy (${privacyContent.length} chars)...`);
      
      // Try AI analysis first
      let analysis = await analyzeWithAI(privacyContent, 'privacy policy');
      
      // Fallback to pattern analysis
      if (!analysis) {
        analysis = patternAnalysis(privacyContent);
      }
      
      results.privacyAnalysis = analysis;
    }
  }
  
  // Fetch and analyze terms of service
  if (website.urls.terms) {
    const termsContent = await fetchDocument(website.urls.terms);
    if (termsContent) {
      console.log(`  Analyzing terms of service (${termsContent.length} chars)...`);
      
      // Try AI analysis first
      let analysis = await analyzeWithAI(termsContent, 'terms of service');
      
      // Fallback to pattern analysis
      if (!analysis) {
        analysis = patternAnalysis(termsContent);
      }
      
      results.termsAnalysis = analysis;
    }
  }
  
  // Calculate combined score
  const scores = [];
  if (results.privacyAnalysis?.riskScore) scores.push(results.privacyAnalysis.riskScore);
  if (results.termsAnalysis?.riskScore) scores.push(results.termsAnalysis.riskScore);
  
  if (scores.length > 0) {
    results.combinedScore = Math.round(scores.reduce((a, b) => a + b) / scores.length);
    
    // Calculate grade
    if (results.combinedScore >= 90) results.grade = 'F';
    else if (results.combinedScore >= 80) results.grade = 'D';
    else if (results.combinedScore >= 70) results.grade = 'C';
    else if (results.combinedScore >= 60) results.grade = 'B';
    else results.grade = 'A';
  }
  
  console.log(`  Result: Score ${results.combinedScore}/100, Grade ${results.grade}`);
  
  return results;
}

// Main execution
async function main() {
  console.log('🚀 Starting Real Top 50 Website Analysis');
  console.log('=====================================\n');
  
  const results = [];
  const batchSize = 3; // Process 3 websites at a time
  
  // Process in batches to avoid overwhelming the system
  for (let i = 0; i < TOP_50_WEBSITES.length; i += batchSize) {
    const batch = TOP_50_WEBSITES.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(analyzeWebsite));
    results.push(...batchResults);
    
    // Save intermediate results
    await prisma.$executeRaw`
      INSERT INTO analysis_results (data, created_at)
      VALUES (${JSON.stringify(results)}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
    `;
  }
  
  // Sort by score
  results.sort((a, b) => b.combinedScore - a.combinedScore);
  
  // Save final results
  const fs = require('fs');
  fs.writeFileSync('real-top50-analysis.json', JSON.stringify(results, null, 2));
  
  console.log('\n✅ Analysis Complete!');
  console.log(`📊 Analyzed ${results.length} websites with real data`);
  console.log(`📁 Results saved to: real-top50-analysis.json`);
  
  // Show summary
  console.log('\n🏆 Top 5 Worst Privacy Offenders (Real Data):');
  results.slice(0, 5).forEach((site, i) => {
    console.log(`${i + 1}. ${site.websiteName} - Score: ${site.combinedScore}/100, Grade: ${site.grade}`);
  });
  
  await prisma.$disconnect();
}

// Run the analysis
main().catch(console.error);