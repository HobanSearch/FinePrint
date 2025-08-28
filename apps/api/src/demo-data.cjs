// Demo data for Fine Print AI demonstrations

const sampleDocuments = {
  termsOfService: `
TERMS OF SERVICE

Last Updated: January 15, 2024

1. ACCEPTANCE OF TERMS
By accessing and using this service, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.

2. AUTOMATIC RENEWAL
This subscription will automatically renew at the end of each billing period unless you cancel at least 30 days before the renewal date. The renewal will be charged at the then-current subscription rate, which may be higher than your initial rate.

3. DATA COLLECTION AND SHARING  
We collect extensive personal information including browsing history, location data, contacts, and device information. This data may be shared with our partners, affiliates, and third-party service providers for marketing purposes. We may also sell aggregated user data to third parties without your explicit consent.

4. USER CONTENT LICENSE
By uploading content to our platform, you grant us a perpetual, irrevocable, worldwide, royalty-free license to use, modify, publicly perform, publicly display, reproduce, and distribute such content. This license continues even after you stop using our service.

5. DISPUTE RESOLUTION
You agree to resolve any disputes through binding arbitration and waive your right to participate in class-action lawsuits or jury trials. All arbitration proceedings will be conducted in our jurisdiction of choice, regardless of your location.

6. LIABILITY LIMITATIONS
Our total liability shall not exceed the amount you paid us in the last 12 months or $100, whichever is less. We are not liable for any indirect, incidental, special, consequential, or punitive damages.

7. UNILATERAL CHANGES
We reserve the right to modify these terms at any time without prior notice. Continued use of the service constitutes acceptance of the modified terms.

8. ACCOUNT TERMINATION
We may terminate your account at any time for any reason without notice. You will not be entitled to any refunds for unused portions of your subscription.
`,

  privacyPolicy: `
PRIVACY POLICY

Effective Date: January 1, 2024

1. INFORMATION WE COLLECT
We collect all information you provide, including name, email, phone number, payment information, and any content you create. We also automatically collect device information, IP addresses, browser type, pages visited, time spent on pages, and click patterns.

2. COOKIES AND TRACKING
We use cookies, web beacons, and other tracking technologies to monitor your activities across the web. We share this tracking data with advertising networks and analytics providers. You cannot opt out of essential tracking cookies.

3. THIRD-PARTY SHARING
We share your personal information with numerous third parties including:
- Advertising partners for targeted marketing
- Data brokers for commercial purposes  
- Government agencies upon request
- Any company that acquires our business

4. DATA RETENTION
We retain your personal information indefinitely, even after account deletion. Backups containing your data may persist in our systems permanently.

5. CHILDREN'S DATA
We knowingly collect information from users under 13 years of age with assumed parental consent through continued use of our service.

6. SECURITY
While we implement some security measures, we do not guarantee the security of your information. You acknowledge that you provide information at your own risk.

7. YOUR RIGHTS
You have limited rights regarding your personal information. We may deny requests to access, correct, or delete your data at our discretion.

8. CHANGES TO POLICY
We may update this policy at any time without notice. It is your responsibility to check for changes regularly.
`,

  neutralDocument: `
SOFTWARE LICENSE AGREEMENT

Version 1.0 - March 2024

1. GRANT OF LICENSE
This agreement grants you a non-exclusive, non-transferable license to use the software for personal or business purposes.

2. PERMITTED USE
You may install the software on up to 3 devices for your own use. You may make one backup copy for archival purposes.

3. RESTRICTIONS
You may not reverse engineer, decompile, or disassemble the software. You may not rent, lease, or lend the software.

4. SUPPORT
We provide email support during business hours (9 AM - 5 PM EST, Monday-Friday). Updates are provided quarterly.

5. WARRANTY
The software is provided with a 30-day money-back guarantee. After 30 days, the software is provided "as is" without warranty.

6. TERMINATION
This license is effective until terminated. You may terminate it at any time by destroying the software and all copies.
`
};

const analysisFindings = {
  high: [
    {
      type: 'automatic_renewal',
      title: 'Automatic Renewal Clause',
      description: 'Service automatically renews with potential price increases and requires 30-day advance cancellation.',
      suggestion: 'Set calendar reminders well before renewal dates and consider services with easier cancellation policies.',
      severity: 'high'
    },
    {
      type: 'data_sharing',
      title: 'Broad Data Sharing Rights',
      description: 'Your personal data may be shared with third parties for marketing and can be sold without explicit consent.',
      suggestion: 'Review privacy settings and consider using privacy-focused alternatives.',
      severity: 'high'
    },
    {
      type: 'perpetual_license',
      title: 'Perpetual Content License',
      description: 'Company retains rights to your content forever, even after account deletion.',
      suggestion: 'Avoid uploading sensitive or proprietary content to this service.',
      severity: 'high'
    },
    {
      type: 'class_action_waiver',
      title: 'Class Action Waiver',
      description: 'You waive rights to class-action lawsuits and jury trials, limiting legal recourse.',
      suggestion: 'Consider the risks before agreeing, especially for high-value transactions.',
      severity: 'high'
    }
  ],
  medium: [
    {
      type: 'unilateral_changes',
      title: 'Unilateral Term Changes',
      description: 'Terms can be changed anytime without notice, and continued use implies acceptance.',
      suggestion: 'Regularly review terms of service for important changes.',
      severity: 'medium'
    },
    {
      type: 'jurisdiction',
      title: 'Unfavorable Jurisdiction',
      description: 'Disputes must be resolved in company\'s chosen jurisdiction, regardless of your location.',
      suggestion: 'Consider the cost and feasibility of legal action in distant jurisdictions.',
      severity: 'medium'
    },
    {
      type: 'data_retention',
      title: 'Indefinite Data Retention',
      description: 'Personal data is kept indefinitely, even after account deletion.',
      suggestion: 'Request data deletion explicitly and follow up on compliance.',
      severity: 'medium'
    }
  ],
  low: [
    {
      type: 'liability_limitation',
      title: 'Limited Liability',
      description: 'Company liability is capped at amount paid or $100, whichever is less.',
      suggestion: 'Understand the financial risks and consider insurance if needed.',
      severity: 'low'
    },
    {
      type: 'no_refunds',
      title: 'No Refund Policy',
      description: 'No refunds provided for unused subscription portions upon termination.',
      suggestion: 'Use services on month-to-month basis when possible.',
      severity: 'low'
    }
  ]
};

const generateAnalysis = (text, documentType = 'tos') => {
  // Simple heuristic analysis based on keywords
  const findings = [];
  const textLower = text.toLowerCase();
  
  // Check for problematic patterns
  if (textLower.includes('automatic') && textLower.includes('renew')) {
    findings.push({
      ...analysisFindings.high[0],
      clauseText: text.substring(text.indexOf('automatic'), text.indexOf('automatic') + 200),
      position: text.indexOf('automatic')
    });
  }
  
  if (textLower.includes('share') && (textLower.includes('third') || textLower.includes('partner'))) {
    findings.push({
      ...analysisFindings.high[1],
      clauseText: text.substring(text.indexOf('share'), text.indexOf('share') + 200),
      position: text.indexOf('share')
    });
  }
  
  if (textLower.includes('perpetual') || textLower.includes('irrevocable')) {
    findings.push({
      ...analysisFindings.high[2],
      clauseText: text.substring(text.indexOf('perpetual'), text.indexOf('perpetual') + 200),
      position: text.indexOf('perpetual')
    });
  }
  
  if (textLower.includes('class action') || textLower.includes('class-action')) {
    findings.push({
      ...analysisFindings.high[3],
      clauseText: text.substring(text.indexOf('class'), text.indexOf('class') + 200),
      position: text.indexOf('class')
    });
  }
  
  if (textLower.includes('modify') && textLower.includes('terms')) {
    findings.push({
      ...analysisFindings.medium[0],
      clauseText: text.substring(text.indexOf('modify'), text.indexOf('modify') + 200),
      position: text.indexOf('modify')
    });
  }
  
  if (textLower.includes('liability') && (textLower.includes('limit') || textLower.includes('exceed'))) {
    findings.push({
      ...analysisFindings.low[0],
      clauseText: text.substring(text.indexOf('liability'), text.indexOf('liability') + 200),
      position: text.indexOf('liability')
    });
  }
  
  // Calculate risk score based on findings
  let riskScore = 30; // Base score
  findings.forEach(finding => {
    if (finding.severity === 'high') riskScore += 15;
    if (finding.severity === 'medium') riskScore += 8;
    if (finding.severity === 'low') riskScore += 3;
  });
  riskScore = Math.min(100, riskScore);
  
  // Generate summary
  const highRiskCount = findings.filter(f => f.severity === 'high').length;
  const mediumRiskCount = findings.filter(f => f.severity === 'medium').length;
  let summary = `This ${documentType === 'privacy' ? 'privacy policy' : 'document'} `;
  
  if (riskScore >= 70) {
    summary += 'contains several concerning clauses that significantly favor the service provider. ';
  } else if (riskScore >= 50) {
    summary += 'has some problematic terms that you should be aware of. ';
  } else {
    summary += 'appears to be relatively fair with standard terms. ';
  }
  
  if (highRiskCount > 0) {
    summary += `Found ${highRiskCount} high-risk clause${highRiskCount > 1 ? 's' : ''} requiring immediate attention.`;
  }
  
  return {
    riskScore,
    totalClauses: Math.floor(text.length / 500), // Rough estimate
    problematicClauses: findings.length,
    findings: findings.map((f, i) => ({ ...f, id: `finding-${i+1}` })),
    recommendations: [
      highRiskCount > 2 ? 'Consider alternative services with more user-friendly terms' : '',
      findings.some(f => f.type === 'data_sharing') ? 'Review and adjust privacy settings immediately' : '',
      findings.some(f => f.type === 'automatic_renewal') ? 'Set calendar reminders for cancellation deadlines' : '',
      'Keep copies of the current terms for your records',
      'Consider consulting with legal counsel for high-value commitments'
    ].filter(r => r),
    summary
  };
};

module.exports = {
  sampleDocuments,
  analysisFindings,
  generateAnalysis
};