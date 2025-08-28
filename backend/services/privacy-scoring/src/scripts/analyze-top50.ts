#!/usr/bin/env tsx

/**
 * Fine Print AI - Enhanced Top 50 Website Analysis Script
 * This script fetches and analyzes privacy policies and terms of service
 * for the top 50 websites using local LLMs via Ollama
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { Ollama } from 'ollama';
import * as fs from 'fs/promises';
import * as path from 'path';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Initialize connections
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD
});

const prisma = new PrismaClient();
const ollama = new Ollama({
  host: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
});

// Top 50 websites configuration
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
  { id: "shopify", name: "Shopify", category: "E-commerce", privacy: "https://www.shopify.com/legal/privacy", terms: "https://www.shopify.com/legal/terms" }
];

// Problematic patterns with enhanced detection
const PROBLEMATIC_PATTERNS = [
  {
    id: 'data_sharing',
    regex: /we\s+(may|might|can|will)\s+share\s+your\s+(personal\s+)?information/gi,
    category: 'Privacy',
    severity: 'high',
    description: 'Broad data sharing permissions'
  },
  {
    id: 'third_party_sharing',
    regex: /share\s+.{0,50}third[- ]part(y|ies)/gi,
    category: 'Privacy',
    severity: 'high',
    description: 'Shares data with third parties'
  },
  {
    id: 'auto_renewal',
    regex: /automat(ic|ically)\s+renew/gi,
    category: 'Billing',
    severity: 'medium',
    description: 'Automatic renewal clause'
  },
  {
    id: 'class_action_waiver',
    regex: /waive\s+.{0,50}class\s+action|class\s+action\s+waiver/gi,
    category: 'Legal',
    severity: 'high',
    description: 'Waives class action rights'
  },
  {
    id: 'binding_arbitration',
    regex: /binding\s+arbitration|mandatory\s+arbitration/gi,
    category: 'Legal',
    severity: 'high',
    description: 'Requires binding arbitration'
  },
  {
    id: 'perpetual_license',
    regex: /perpetual\s+(and\s+)?irrevocable\s+license/gi,
    category: 'Content',
    severity: 'high',
    description: 'Grants perpetual license to content'
  },
  {
    id: 'no_refunds',
    regex: /no\s+refunds?|non[- ]refundable/gi,
    category: 'Billing',
    severity: 'medium',
    description: 'No refund policy'
  },
  {
    id: 'liability_limitation',
    regex: /limit(s|ation)?\s+.{0,50}liability|we\s+are\s+not\s+(liable|responsible)/gi,
    category: 'Legal',
    severity: 'medium',
    description: 'Limits company liability'
  },
  {
    id: 'unilateral_changes',
    regex: /change\s+.{0,50}terms\s+.{0,50}without\s+notice/gi,
    category: 'Terms',
    severity: 'high',
    description: 'Can change terms without notice'
  },
  {
    id: 'data_retention',
    regex: /retain\s+.{0,50}data\s+.{0,50}indefinitely/gi,
    category: 'Privacy',
    severity: 'high',
    description: 'Retains data indefinitely'
  }
];

/**
 * Fetch document content using axios and cheerio
 */
async function fetchDocumentContent(url: string): Promise<string | null> {
  const cacheKey = `doc:${url}`;
  
  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    logger.info(`Using cached content for ${url}`);
    return cached;
  }

  try {
    logger.info(`Fetching content from ${url}`);
    
    // Fetch with axios
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000,
      maxRedirects: 5
    });

    // Parse with Cheerio
    const $ = cheerio.load(response.data);
    
    // Remove script and style elements
    $('script').remove();
    $('style').remove();
    $('noscript').remove();
    
    // Try to find main content areas
    let content = '';
    
    // Common content selectors
    const contentSelectors = [
      'main', 
      'article', 
      '[role="main"]',
      '.content',
      '#content',
      '.policy-content',
      '.legal-content',
      '.terms-content',
      '.privacy-content'
    ];
    
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text().replace(/\s+/g, ' ').trim();
        if (content.length > 1000) {
          break;
        }
      }
    }
    
    // Fallback to body if no specific content found
    if (content.length < 1000) {
      content = $('body').text().replace(/\s+/g, ' ').trim();
    }
    
    if (content && content.length > 100) {
      // Cache for 24 hours
      await redis.setex(cacheKey, 86400, content);
      return content;
    }

    throw new Error('Failed to extract sufficient text content');
  } catch (error) {
    logger.error(`Failed to fetch ${url}: ${error.message}`);
    return null;
  }
}

/**
 * Analyze document with local LLM using Ollama
 */
async function analyzeWithLLM(content: string, documentType: string, websiteName: string) {
  const prompt = `
You are a legal document analyzer specializing in privacy policies and terms of service.

Analyze the following ${documentType} from ${websiteName} and identify:
1. Problematic clauses that could harm users
2. Hidden fees or charges
3. Data sharing practices
4. User rights limitations
5. Automatic renewals or subscriptions
6. Content ownership claims
7. Liability limitations
8. Dispute resolution restrictions

Document content:
${content.substring(0, 8000)}

Provide a structured analysis with:
- List of concerning findings
- Severity rating for each finding (high/medium/low)
- Brief explanation of why each finding is problematic
- Overall risk score (0-100)
`;

  try {
    const response = await ollama.generate({
      model: 'mistral:7b',
      prompt,
      stream: false
    });

    return response.response;
  } catch (error) {
    logger.error(`LLM analysis failed: ${error.message}`);
    return null;
  }
}

/**
 * Pattern-based analysis for reliability
 */
function performPatternAnalysis(content: string) {
  const findings = [];

  for (const pattern of PROBLEMATIC_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (matches) {
      findings.push({
        id: pattern.id,
        category: pattern.category,
        severity: pattern.severity,
        description: pattern.description,
        occurrences: matches.length,
        examples: matches.slice(0, 3)
      });
    }
  }

  return findings;
}

/**
 * Calculate risk score based on findings
 */
function calculateRiskScore(patternFindings: any[], llmAnalysis: string | null): number {
  let score = 0;

  // Pattern-based scoring
  patternFindings.forEach(finding => {
    if (finding.severity === 'high') {
      score += 15 * finding.occurrences;
    } else if (finding.severity === 'medium') {
      score += 8 * finding.occurrences;
    }
  });

  // LLM-based scoring (if available)
  if (llmAnalysis) {
    const highSeverityCount = (llmAnalysis.match(/high\s+severity/gi) || []).length;
    const mediumSeverityCount = (llmAnalysis.match(/medium\s+severity/gi) || []).length;
    score += highSeverityCount * 10 + mediumSeverityCount * 5;
  }

  return Math.min(score, 100);
}

/**
 * Main analysis function for a single website
 */
async function analyzeWebsite(website: any) {
  logger.info(`Analyzing ${website.name}...`);

  const results = {
    id: website.id,
    name: website.name,
    category: website.category,
    timestamp: new Date().toISOString(),
    privacyPolicy: null as any,
    termsOfService: null as any,
    overallScore: 0,
    overallGrade: 'A',
    summary: ''
  };

  // Analyze Privacy Policy
  if (website.privacy) {
    const privacyContent = await fetchDocumentContent(website.privacy);
    if (privacyContent) {
      const patternFindings = performPatternAnalysis(privacyContent);
      const llmAnalysis = await analyzeWithLLM(privacyContent, 'privacy policy', website.name);
      
      results.privacyPolicy = {
        url: website.privacy,
        patternFindings,
        llmAnalysis,
        contentLength: privacyContent.length,
        score: calculateRiskScore(patternFindings, llmAnalysis)
      };
    }
  }

  // Analyze Terms of Service
  if (website.terms) {
    const termsContent = await fetchDocumentContent(website.terms);
    if (termsContent) {
      const patternFindings = performPatternAnalysis(termsContent);
      const llmAnalysis = await analyzeWithLLM(termsContent, 'terms of service', website.name);
      
      results.termsOfService = {
        url: website.terms,
        patternFindings,
        llmAnalysis,
        contentLength: termsContent.length,
        score: calculateRiskScore(patternFindings, llmAnalysis)
      };
    }
  }

  // Calculate overall score
  const privacyScore = results.privacyPolicy?.score || 0;
  const termsScore = results.termsOfService?.score || 0;
  results.overallScore = Math.round((privacyScore + termsScore) / 2);

  // Determine grade
  if (results.overallScore >= 80) results.overallGrade = 'F';
  else if (results.overallScore >= 60) results.overallGrade = 'D';
  else if (results.overallScore >= 40) results.overallGrade = 'C';
  else if (results.overallScore >= 20) results.overallGrade = 'B';
  else results.overallGrade = 'A';

  // Generate summary
  const totalFindings = 
    (results.privacyPolicy?.patternFindings?.length || 0) + 
    (results.termsOfService?.patternFindings?.length || 0);
  
  results.summary = `${website.name} scored ${results.overallScore}/100 (Grade: ${results.overallGrade}) with ${totalFindings} concerning patterns detected.`;

  // Save to database
  try {
    await prisma.websiteAnalysis.create({
      data: {
        websiteId: website.id,
        websiteName: website.name,
        category: website.category,
        overallScore: results.overallScore,
        overallGrade: results.overallGrade,
        analysisData: results,
        createdAt: new Date()
      }
    });
  } catch (dbError) {
    logger.error(`Failed to save to database: ${dbError.message}`);
  }

  return results;
}

/**
 * Main execution function
 */
async function main() {
  logger.info('Starting Fine Print AI Top 50 Website Analysis');

  const results = [];
  const outputDir = path.join(process.cwd(), 'analysis-results');
  await fs.mkdir(outputDir, { recursive: true });

  // Process websites in batches to avoid overwhelming the system
  const batchSize = 5;
  for (let i = 0; i < TOP_50_WEBSITES.length; i += batchSize) {
    const batch = TOP_50_WEBSITES.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(website => analyzeWebsite(website))
    );
    results.push(...batchResults);
    
    // Progress update
    logger.info(`Completed ${Math.min(i + batchSize, TOP_50_WEBSITES.length)}/${TOP_50_WEBSITES.length} websites`);
  }

  // Sort by risk score (worst first)
  results.sort((a, b) => b.overallScore - a.overallScore);

  // Save results
  const outputPath = path.join(outputDir, 'top50-analysis-results.json');
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2));

  // Generate summary report
  const report = {
    timestamp: new Date().toISOString(),
    totalWebsites: results.length,
    averageScore: Math.round(results.reduce((sum, r) => sum + r.overallScore, 0) / results.length),
    gradeDistribution: results.reduce((dist, r) => {
      dist[r.overallGrade] = (dist[r.overallGrade] || 0) + 1;
      return dist;
    }, {} as Record<string, number>),
    worstOffenders: results.slice(0, 10).map(r => ({
      name: r.name,
      score: r.overallScore,
      grade: r.overallGrade
    })),
    categoryAnalysis: results.reduce((cats, r) => {
      if (!cats[r.category]) {
        cats[r.category] = { count: 0, totalScore: 0 };
      }
      cats[r.category].count++;
      cats[r.category].totalScore += r.overallScore;
      return cats;
    }, {} as Record<string, any>)
  };

  // Calculate average scores by category
  Object.keys(report.categoryAnalysis).forEach(cat => {
    report.categoryAnalysis[cat].averageScore = 
      Math.round(report.categoryAnalysis[cat].totalScore / report.categoryAnalysis[cat].count);
  });

  const reportPath = path.join(outputDir, 'analysis-summary-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  logger.info('Analysis complete!');
  logger.info(`Results saved to: ${outputPath}`);
  logger.info(`Summary report: ${reportPath}`);

  // Cleanup
  await redis.quit();
  await prisma.$disconnect();
}

// Run the analysis
main().catch(error => {
  logger.error('Analysis failed:', error);
  process.exit(1);
});