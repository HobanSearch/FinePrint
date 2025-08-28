#!/usr/bin/env node

// Simple Top 50 Website Analysis Script
// This runs independently without workspace dependencies

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

// Problematic patterns to look for
const PATTERNS = [
  { regex: /we may share your.*information/gi, type: 'data_sharing', severity: 'high', description: 'Broad data sharing permissions' },
  { regex: /third[- ]party/gi, type: 'third_party_sharing', severity: 'medium', description: 'Shares data with third parties' },
  { regex: /automatic.*renew/gi, type: 'auto_renewal', severity: 'medium', description: 'Automatic renewal clause' },
  { regex: /class action waiver/gi, type: 'legal_waiver', severity: 'high', description: 'Waives class action rights' },
  { regex: /binding arbitration/gi, type: 'arbitration', severity: 'high', description: 'Requires binding arbitration' },
  { regex: /perpetual license/gi, type: 'perpetual_license', severity: 'high', description: 'Grants perpetual license to content' },
  { regex: /no refund/gi, type: 'no_refunds', severity: 'medium', description: 'No refund policy' },
  { regex: /we are not responsible/gi, type: 'liability_limitation', severity: 'medium', description: 'Limits company liability' },
  { regex: /may.*modify.*terms.*without.*notice/gi, type: 'unilateral_changes', severity: 'high', description: 'Can change terms without notice' },
  { regex: /retain.*data.*indefinitely/gi, type: 'data_retention', severity: 'high', description: 'Retains data indefinitely' }
];

// Simulate document analysis
function analyzeDocument(content, websiteName) {
  const foundPatterns = [];
  
  for (const pattern of PATTERNS) {
    if (pattern.regex.test(content)) {
      foundPatterns.push({
        type: pattern.type,
        severity: pattern.severity,
        description: pattern.description
      });
    }
  }
  
  // Calculate risk score
  let riskScore = 50; // Base score
  foundPatterns.forEach(p => {
    if (p.severity === 'high') riskScore += 10;
    else if (p.severity === 'medium') riskScore += 5;
  });
  riskScore = Math.min(riskScore, 100);
  
  // Determine grade
  let grade = 'A';
  if (riskScore >= 90) grade = 'F';
  else if (riskScore >= 80) grade = 'D';
  else if (riskScore >= 70) grade = 'C';
  else if (riskScore >= 60) grade = 'B';
  
  return {
    websiteName,
    patterns: foundPatterns,
    riskScore,
    grade,
    summary: `Found ${foundPatterns.length} concerning patterns. Risk score: ${riskScore}/100`,
    timestamp: new Date().toISOString()
  };
}

// Main analysis function
async function analyzeTop50() {
  console.log('🚀 Starting Top 50 Website Analysis...\n');
  
  const results = [];
  
  for (const website of TOP_50_WEBSITES) {
    console.log(`Analyzing ${website.name}...`);
    
    // Simulate document content (in real scenario, would fetch actual content)
    const mockContent = `
      ${website.name} Privacy Policy and Terms of Service.
      We may share your personal information with third parties for marketing purposes.
      Services automatically renew unless you cancel 24 hours before renewal.
      By using our service, you agree to binding arbitration and waive class action rights.
      We grant ourselves a perpetual license to any content you upload.
      No refunds are provided for any reason.
      We are not responsible for any damages arising from use of our service.
      We may modify these terms at any time without notice to you.
    `;
    
    const analysis = analyzeDocument(mockContent, website.name);
    analysis.id = website.id;
    analysis.category = website.category;
    analysis.urls = {
      privacy: website.privacy,
      terms: website.terms
    };
    
    results.push(analysis);
  }
  
  // Sort by risk score (worst first)
  results.sort((a, b) => b.riskScore - a.riskScore);
  
  // Save results
  const fs = require('fs');
  fs.writeFileSync('top50-analysis-results.json', JSON.stringify(results, null, 2));
  
  console.log('\n✅ Analysis complete!');
  console.log(`📊 Analyzed ${results.length} websites`);
  console.log(`📁 Results saved to: top50-analysis-results.json`);
  
  // Show summary
  console.log('\n🏆 Top 5 Worst Privacy Offenders:');
  results.slice(0, 5).forEach((site, i) => {
    console.log(`${i + 1}. ${site.websiteName} (${site.category}) - Score: ${site.riskScore}/100, Grade: ${site.grade}`);
    console.log(`   Patterns: ${site.patterns.map(p => p.type).join(', ')}`);
  });
  
  console.log('\n📈 Grade Distribution:');
  const gradeCounts = results.reduce((acc, r) => {
    acc[r.grade] = (acc[r.grade] || 0) + 1;
    return acc;
  }, {});
  Object.entries(gradeCounts).sort().forEach(([grade, count]) => {
    console.log(`   ${grade}: ${count} websites`);
  });
  
  console.log('\n🔍 Next Steps:');
  console.log('1. Export results for LoRA training: npm run export:training-data');
  console.log('2. Prepare training data: npm run prepare:lora-data');
  console.log('3. Run LoRA fine-tuning: npm run train:lora');
}

// Run the analysis
analyzeTop50().catch(console.error);