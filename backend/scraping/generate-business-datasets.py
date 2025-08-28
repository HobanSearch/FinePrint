#!/usr/bin/env python3
"""
Generate training datasets for business agent models
Creates specialized datasets for Marketing, Sales, Customer Success, and Analytics agents
"""

import json
import random
from datetime import datetime, timedelta

class BusinessDatasetGenerator:
    """Generate training data for business agents"""
    
    def __init__(self):
        self.companies = ["TechCorp", "DataSoft", "CloudFlow", "SecureNet", "AnalyticsPro"]
        self.industries = ["SaaS", "FinTech", "Healthcare", "E-commerce", "Education"]
        
    def generate_marketing_dataset(self, num_examples=100):
        """Generate marketing agent training data"""
        examples = []
        
        # Email campaign examples
        for i in range(25):
            examples.append({
                "instruction": "Write a marketing email for Fine Print AI targeting legal teams",
                "input": f"Campaign: {random.choice(['Welcome', 'Feature Launch', 'Case Study', 'Webinar'])}. Industry: {random.choice(self.industries)}",
                "output": self._generate_marketing_email()
            })
        
        # Blog post outlines
        for i in range(25):
            examples.append({
                "instruction": "Create a blog post outline about privacy compliance",
                "input": f"Topic: {random.choice(['GDPR Compliance', 'Terms of Service Best Practices', 'Privacy Policy Updates', 'Data Protection'])}",
                "output": self._generate_blog_outline()
            })
        
        # Social media content
        for i in range(25):
            examples.append({
                "instruction": "Write social media posts promoting Fine Print AI",
                "input": f"Platform: {random.choice(['LinkedIn', 'Twitter', 'Facebook'])}. Focus: {random.choice(['Feature', 'Benefit', 'Case Study', 'News'])}",
                "output": self._generate_social_posts()
            })
        
        # SEO optimization
        for i in range(25):
            examples.append({
                "instruction": "Optimize this content for SEO",
                "input": f"Keywords: {', '.join(random.sample(['privacy policy', 'terms of service', 'legal AI', 'document analysis', 'compliance'], 3))}",
                "output": self._generate_seo_content()
            })
        
        return examples[:num_examples]
    
    def generate_sales_dataset(self, num_examples=100):
        """Generate sales agent training data"""
        examples = []
        
        # Lead qualification
        for i in range(25):
            company = random.choice(self.companies)
            examples.append({
                "instruction": "Qualify this lead for Fine Print AI",
                "input": f"Company: {company}, Size: {random.choice(['10-50', '50-200', '200-1000', '1000+'])} employees, Industry: {random.choice(self.industries)}",
                "output": self._generate_lead_qualification()
            })
        
        # Cold outreach
        for i in range(25):
            examples.append({
                "instruction": "Write a cold outreach email for Fine Print AI",
                "input": f"Target: {random.choice(['Legal Counsel', 'Compliance Officer', 'CTO', 'CEO'])} at {random.choice(self.industries)} company",
                "output": self._generate_cold_email()
            })
        
        # Proposal generation
        for i in range(25):
            examples.append({
                "instruction": "Create a sales proposal for Fine Print AI",
                "input": f"Client needs: {random.choice(['Automate contract review', 'Monitor ToS changes', 'Ensure GDPR compliance', 'Reduce legal costs'])}",
                "output": self._generate_proposal()
            })
        
        # Objection handling
        for i in range(25):
            examples.append({
                "instruction": "Handle this sales objection",
                "input": f"Objection: {random.choice(['Too expensive', 'We have in-house legal team', 'Concerned about AI accuracy', 'Need more features'])}",
                "output": self._generate_objection_response()
            })
        
        return examples[:num_examples]
    
    def generate_customer_success_dataset(self, num_examples=100):
        """Generate customer success agent training data"""
        examples = []
        
        # Support tickets
        for i in range(25):
            examples.append({
                "instruction": "Respond to this customer support ticket",
                "input": f"Issue: {random.choice(['Cannot upload document', 'Analysis taking too long', 'Unclear results', 'Integration problem'])}",
                "output": self._generate_support_response()
            })
        
        # Onboarding
        for i in range(25):
            examples.append({
                "instruction": "Create an onboarding sequence for new Fine Print AI user",
                "input": f"User type: {random.choice(['Individual', 'Small Business', 'Enterprise', 'Legal Team'])}",
                "output": self._generate_onboarding_sequence()
            })
        
        # Success metrics
        for i in range(25):
            examples.append({
                "instruction": "Analyze customer success metrics",
                "input": f"Metric: {random.choice(['Usage rate', 'Feature adoption', 'Support tickets', 'Satisfaction score'])}",
                "output": self._generate_success_analysis()
            })
        
        # Retention strategies
        for i in range(25):
            examples.append({
                "instruction": "Create retention strategy for at-risk customer",
                "input": f"Risk factor: {random.choice(['Low usage', 'Support complaints', 'Payment issues', 'Feature requests'])}",
                "output": self._generate_retention_strategy()
            })
        
        return examples[:num_examples]
    
    def generate_analytics_dataset(self, num_examples=100):
        """Generate analytics agent training data"""
        examples = []
        
        # Metric calculations
        for i in range(25):
            examples.append({
                "instruction": "Calculate this business metric",
                "input": f"Metric: {random.choice(['MRR', 'Churn rate', 'CAC', 'LTV', 'Conversion rate'])}",
                "output": self._generate_metric_calculation()
            })
        
        # Report generation
        for i in range(25):
            examples.append({
                "instruction": "Generate analytics report",
                "input": f"Report type: {random.choice(['Weekly performance', 'Monthly revenue', 'User engagement', 'Feature usage'])}",
                "output": self._generate_report()
            })
        
        # Trend analysis
        for i in range(25):
            examples.append({
                "instruction": "Analyze this trend in Fine Print AI usage",
                "input": f"Trend: {random.choice(['Increasing API calls', 'Declining engagement', 'Seasonal patterns', 'Geographic distribution'])}",
                "output": self._generate_trend_analysis()
            })
        
        # Predictive insights
        for i in range(25):
            examples.append({
                "instruction": "Provide predictive insights",
                "input": f"Predict: {random.choice(['Next month revenue', 'Churn risk', 'Feature adoption', 'Support volume'])}",
                "output": self._generate_prediction()
            })
        
        return examples[:num_examples]
    
    # Helper methods to generate realistic outputs
    def _generate_marketing_email(self):
        return """Subject: Protect Your Business from Hidden Legal Risks

Hi [Name],

Did you know that 91% of users accept terms without reading them? Fine Print AI instantly analyzes legal documents to identify problematic clauses and protect your rights.

Key Benefits:
• Instant analysis in under 5 seconds
• 50+ pattern detection for risky clauses
• GDPR-compliant and privacy-first
• Actionable recommendations

Start your free trial today and never miss hidden terms again.

Best regards,
Fine Print AI Team"""

    def _generate_blog_outline(self):
        return """Blog Post Outline: Understanding Privacy Policy Red Flags

1. Introduction
   - Statistics on unread policies
   - Importance of privacy awareness

2. Common Red Flags
   - Data sharing with third parties
   - Vague retention policies
   - Broad usage rights

3. How to Protect Yourself
   - Tools for analysis
   - Key questions to ask
   - Action steps

4. Fine Print AI Solution
   - Automated detection
   - Real-time monitoring
   - Compliance tracking

5. Conclusion & CTA"""

    def _generate_social_posts(self):
        return """LinkedIn Post:
🔍 Your terms of service could be hiding costly surprises. Fine Print AI analyzes legal documents in seconds, identifying risks before you click "Accept." 

Protect your business today → [link]

#LegalTech #Privacy #Compliance #AI"""

    def _generate_seo_content(self):
        return """Title: Privacy Policy Analyzer - AI-Powered Terms of Service Review | Fine Print AI

Meta Description: Instantly analyze privacy policies and terms of service with AI. Detect risky clauses, ensure compliance, and protect your rights. Try Fine Print AI free.

H1: AI-Powered Privacy Policy and Terms of Service Analysis

Content optimized for keywords: privacy policy analyzer, terms of service review, legal document AI, compliance automation"""

    def _generate_lead_qualification(self):
        return """Lead Score: 85/100

Qualification Summary:
• Company Size: Good fit (200+ employees)
• Industry: High compliance needs
• Pain Points: Manual contract review taking too long
• Budget: Aligned with Enterprise tier
• Decision Timeline: 30-60 days

Recommended Action: Schedule demo with legal team
Next Steps: Send case study and ROI calculator"""

    def _generate_cold_email(self):
        return """Subject: Reduce Legal Review Time by 90% at [Company]

Hi [Name],

I noticed [Company] is scaling rapidly. With growth comes more contracts and terms to review - a time-consuming process for your legal team.

Fine Print AI automates document analysis, helping companies like yours:
• Cut review time from hours to seconds
• Identify risky clauses instantly
• Monitor changes automatically

Worth a quick 15-minute call to explore how this could help [Company]?

Best,
[Your Name]"""

    def _generate_proposal(self):
        return """Fine Print AI Proposal - Executive Summary

Solution: Automated Legal Document Analysis Platform

Key Deliverables:
• Instant analysis of all legal documents
• Risk scoring and pattern detection
• Change monitoring and alerts
• Compliance tracking dashboard

Investment: $2,999/month (Enterprise)
Implementation: 2 weeks
ROI: 300% in first year through time savings

Success Metrics:
• 90% reduction in review time
• 100% document coverage
• Zero compliance violations"""

    def _generate_objection_response(self):
        return """I understand your concern about cost. Let me share how Fine Print AI actually saves money:

1. Time Savings: Reduces 4-hour reviews to 5 seconds
2. Risk Prevention: Catches issues before they become costly
3. Scale Efficiency: Handle 100x more documents without adding headcount

One client saved $200K in the first year. Can I show you their case study?"""

    def _generate_support_response(self):
        return """Thank you for reaching out. I understand you're having trouble uploading documents.

Quick Solution:
1. Ensure file is under 10MB
2. Supported formats: PDF, DOCX, TXT
3. Try clearing browser cache

If issue persists, I can:
• Schedule a screen share session
• Process the document manually
• Provide alternative upload method

Your success is our priority. How would you like to proceed?"""

    def _generate_onboarding_sequence(self):
        return """Day 1: Welcome & Setup
- Account configuration
- First document analysis
- Quick win demonstration

Day 3: Core Features
- Pattern detection training
- Alert configuration
- Integration setup

Day 7: Advanced Usage
- Bulk processing
- API introduction
- Custom workflows

Day 14: Success Review
- Usage analytics
- ROI assessment
- Optimization tips"""

    def _generate_success_analysis(self):
        return """Customer Success Analysis

Metric: Feature Adoption Rate
Current: 67% (above average)
Trend: +12% month-over-month

Key Insights:
• Document upload feature: 95% adoption
• Monitoring alerts: 45% adoption (opportunity)
• API integration: 23% adoption

Recommendations:
1. Webinar on monitoring setup
2. API documentation improvements
3. Success story sharing"""

    def _generate_retention_strategy(self):
        return """Retention Strategy - At-Risk Account

Risk Level: Medium
Primary Issue: Declining usage (down 40%)

Action Plan:
1. Executive Business Review (this week)
2. Re-training session on new features
3. Success milestone tracking
4. Consider tier adjustment

Incentives:
• 3-month discount for annual commit
• Priority support upgrade
• Custom feature development

Success Metric: Return to 80% usage within 30 days"""

    def _generate_metric_calculation(self):
        return """Monthly Recurring Revenue (MRR) Calculation

Current Month MRR: $47,250
• New MRR: +$5,400 (18 new customers)
• Expansion MRR: +$2,100 (7 upgrades)
• Churned MRR: -$1,750 (5 cancellations)
• Net MRR Growth: +$5,750 (+12.2%)

Breakdown by Tier:
• Starter: $9,000 (30 customers)
• Professional: $18,000 (30 customers)
• Enterprise: $20,250 (15 customers)"""

    def _generate_report(self):
        return """Weekly Performance Report - Fine Print AI

Period: Week 45, 2024

Highlights:
• Documents Analyzed: 15,234 (+18% WoW)
• New Users: 127 (+22% WoW)
• Avg Response Time: 3.2s (target: <5s) ✓
• Customer Satisfaction: 4.7/5.0

Key Achievements:
• Launched GDPR compliance module
• Reduced analysis time by 15%
• Onboarded 3 enterprise clients

Focus Areas:
• API performance optimization
• Support ticket backlog
• Feature adoption campaigns"""

    def _generate_trend_analysis(self):
        return """Trend Analysis: API Usage Patterns

Observation: 40% increase in API calls over 30 days

Contributing Factors:
• New enterprise client integrations
• Batch processing adoption
• Webhook implementation growth

Peak Usage:
• Tuesday-Thursday, 2-4 PM EST
• End-of-month compliance checks
• Quarterly review periods

Recommendations:
• Scale infrastructure for peaks
• Implement rate limiting tiers
• Optimize caching strategy"""

    def _generate_prediction(self):
        return """Predictive Analysis: Q4 Revenue Forecast

Prediction: $168,500 MRR by Dec 31
Confidence: 82%

Drivers:
• Current growth rate: 12% monthly
• Pipeline value: $45K
• Seasonal enterprise buying
• Churn risk: Low (2.1%)

Scenarios:
• Best case: $185K (15% growth)
• Expected: $168K (12% growth)
• Worst case: $155K (8% growth)

Action Items:
• Accelerate enterprise deals
• Launch holiday promotion
• Improve trial conversion"""

def main():
    generator = BusinessDatasetGenerator()
    
    # Generate datasets
    print("🚀 Generating Business Agent Training Datasets")
    print("=" * 50)
    
    # Marketing dataset
    print("\n📧 Generating Marketing Dataset...")
    marketing_data = generator.generate_marketing_dataset(100)
    with open("marketing-training-dataset.jsonl", "w") as f:
        for example in marketing_data:
            f.write(json.dumps(example) + "\n")
    print(f"  ✅ Created {len(marketing_data)} marketing examples")
    
    # Sales dataset
    print("\n💼 Generating Sales Dataset...")
    sales_data = generator.generate_sales_dataset(100)
    with open("sales-training-dataset.jsonl", "w") as f:
        for example in sales_data:
            f.write(json.dumps(example) + "\n")
    print(f"  ✅ Created {len(sales_data)} sales examples")
    
    # Customer Success dataset
    print("\n🤝 Generating Customer Success Dataset...")
    customer_data = generator.generate_customer_success_dataset(100)
    with open("customer-training-dataset.jsonl", "w") as f:
        for example in customer_data:
            f.write(json.dumps(example) + "\n")
    print(f"  ✅ Created {len(customer_data)} customer success examples")
    
    # Analytics dataset
    print("\n📊 Generating Analytics Dataset...")
    analytics_data = generator.generate_analytics_dataset(100)
    with open("analytics-training-dataset.jsonl", "w") as f:
        for example in analytics_data:
            f.write(json.dumps(example) + "\n")
    print(f"  ✅ Created {len(analytics_data)} analytics examples")
    
    print("\n" + "=" * 50)
    print("✅ All datasets generated successfully!")
    print("\nDatasets created:")
    print("  • marketing-training-dataset.jsonl")
    print("  • sales-training-dataset.jsonl")
    print("  • customer-training-dataset.jsonl")
    print("  • analytics-training-dataset.jsonl")
    
    total = len(marketing_data) + len(sales_data) + len(customer_data) + len(analytics_data)
    print(f"\nTotal training examples: {total}")

if __name__ == "__main__":
    main()