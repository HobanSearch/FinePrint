-- Development Seed Data for Fine Print AI
-- Comprehensive test data for development and testing

\echo 'Loading development seed data for Fine Print AI...'

-- =============================================================================
-- SAMPLE USERS
-- =============================================================================

-- Insert sample users across different subscription tiers
INSERT INTO users (
    id, email, email_verified, display_name, timezone, language,
    subscription_tier, status, privacy_settings, preferences, created_at
) VALUES 
-- Free tier users
('550e8400-e29b-41d4-a716-446655440001', 'john.doe@example.com', true, 'John Doe', 'America/New_York', 'en', 'free', 'active', 
 '{"analytics_sharing": false, "marketing_emails": false}', 
 '{"notifications": {"email": true, "browser": true}, "analysis_depth": "standard"}', 
 NOW() - INTERVAL '30 days'),

('550e8400-e29b-41d4-a716-446655440002', 'jane.smith@example.com', true, 'Jane Smith', 'Europe/London', 'en', 'free', 'active',
 '{"analytics_sharing": true, "marketing_emails": false}', 
 '{"notifications": {"email": true, "browser": false}, "analysis_depth": "standard"}', 
 NOW() - INTERVAL '25 days'),

-- Starter tier users
('550e8400-e29b-41d4-a716-446655440003', 'alice.johnson@example.com', true, 'Alice Johnson', 'America/Los_Angeles', 'en', 'starter', 'active',
 '{"analytics_sharing": false, "marketing_emails": true}', 
 '{"notifications": {"email": true, "browser": true}, "analysis_depth": "detailed"}', 
 NOW() - INTERVAL '20 days'),

('550e8400-e29b-41d4-a716-446655440004', 'bob.wilson@example.com', true, 'Bob Wilson', 'America/Chicago', 'en', 'starter', 'active',
 '{"analytics_sharing": true, "marketing_emails": true}', 
 '{"notifications": {"email": false, "browser": true}, "analysis_depth": "detailed"}', 
 NOW() - INTERVAL '15 days'),

-- Professional tier users
('550e8400-e29b-41d4-a716-446655440005', 'sarah.davis@company.com', true, 'Sarah Davis', 'Europe/Berlin', 'en', 'professional', 'active',
 '{"analytics_sharing": false, "marketing_emails": false}', 
 '{"notifications": {"email": true, "browser": true}, "analysis_depth": "comprehensive", "api_access": true}', 
 NOW() - INTERVAL '45 days'),

-- Team tier users
('550e8400-e29b-41d4-a716-446655440006', 'mike.brown@enterprise.com', true, 'Mike Brown', 'Asia/Tokyo', 'en', 'team', 'active',
 '{"analytics_sharing": true, "marketing_emails": false}', 
 '{"notifications": {"email": true, "browser": true}, "analysis_depth": "comprehensive", "team_features": true}', 
 NOW() - INTERVAL '60 days'),

-- Enterprise tier user  
('550e8400-e29b-41d4-a716-446655440007', 'lisa.chen@bigcorp.com', true, 'Lisa Chen', 'America/Denver', 'en', 'enterprise', 'active',
 '{"analytics_sharing": false, "marketing_emails": false}', 
 '{"notifications": {"email": true, "browser": true}, "analysis_depth": "comprehensive", "custom_patterns": true}', 
 NOW() - INTERVAL '90 days');

\echo 'Sample users created successfully'

-- =============================================================================
-- TEAMS AND MEMBERSHIPS
-- =============================================================================

-- Create sample teams
INSERT INTO teams (
    id, name, slug, description, owner_id, subscription_tier, max_members, created_at
) VALUES 
('660e8400-e29b-41d4-a716-446655440001', 'Enterprise Legal Team', 'enterprise-legal', 'Legal document review team for BigCorp', 
 '550e8400-e29b-41d4-a716-446655440007', 'enterprise', 20, NOW() - INTERVAL '90 days'),

('660e8400-e29b-41d4-a716-446655440002', 'Startup Privacy Squad', 'startup-privacy', 'Privacy-focused document analysis for startup', 
 '550e8400-e29b-41d4-a716-446655440006', 'team', 5, NOW() - INTERVAL '60 days');

-- Add team members
INSERT INTO team_members (
    team_id, user_id, role, invited_by, joined_at
) VALUES 
-- Enterprise team members
('660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440007', 'owner', NULL, NOW() - INTERVAL '90 days'),
('660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440005', 'admin', '550e8400-e29b-41d4-a716-446655440007', NOW() - INTERVAL '85 days'),

-- Startup team members
('660e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440006', 'owner', NULL, NOW() - INTERVAL '60 days'),
('660e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440003', 'member', '550e8400-e29b-41d4-a716-446655440006', NOW() - INTERVAL '55 days');

\echo 'Teams and memberships created successfully'

-- =============================================================================
-- SAMPLE DOCUMENTS
-- =============================================================================

-- Insert sample documents for analysis
INSERT INTO documents (
    id, user_id, team_id, title, url, document_type, document_hash, content_length, 
    source_info, monitoring_enabled, monitoring_frequency, created_at
) VALUES 

-- Personal user documents
('770e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', NULL, 
 'Google Terms of Service', 'https://policies.google.com/terms', 'terms_of_service', 
 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456', 15420, 
 '{"source": "url_upload", "browser": "Chrome", "timestamp": "2024-01-15T10:30:00Z"}', 
 true, 86400, NOW() - INTERVAL '25 days'),

('770e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', NULL,
 'Facebook Privacy Policy', 'https://www.facebook.com/privacy/policy/', 'privacy_policy',
 'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567a', 22150,
 '{"source": "url_upload", "browser": "Chrome", "timestamp": "2024-01-16T14:20:00Z"}',
 true, 86400, NOW() - INTERVAL '24 days'),

('770e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440002', NULL,
 'Netflix Terms of Use', 'https://help.netflix.com/legal/termsofuse', 'terms_of_service',
 'c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567ab2', 18760,
 '{"source": "manual_upload", "file_type": "pdf", "timestamp": "2024-01-17T09:15:00Z"}',
 false, 86400, NOW() - INTERVAL '23 days'),

-- Professional user documents
('770e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440005', NULL,
 'Slack Terms of Service', 'https://slack.com/terms-of-service', 'terms_of_service',
 'd4e5f6789012345678901234567890abcdef1234567890abcdef1234567abc3', 21340,
 '{"source": "api_integration", "integration": "slack", "timestamp": "2024-01-10T16:45:00Z"}',
 true, 43200, NOW() - INTERVAL '40 days'),

('770e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440005', NULL,
 'Microsoft 365 Data Processing Agreement', 'https://www.microsoft.com/licensing/docs', 'data_processing_agreement',
 'e5f6789012345678901234567890abcdef1234567890abcdef1234567abcd4', 35200,
 '{"source": "manual_upload", "file_type": "docx", "timestamp": "2024-01-08T11:30:00Z"}',
 true, 604800, NOW() - INTERVAL '42 days'),

-- Team documents
('770e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440007', '660e8400-e29b-41d4-a716-446655440001',
 'Salesforce Service Agreement', 'https://www.salesforce.com/company/legal/', 'service_agreement',
 'f6789012345678901234567890abcdef1234567890abcdef1234567abcde5', 28900,
 '{"source": "team_upload", "uploaded_by": "lisa.chen@bigcorp.com", "timestamp": "2024-01-05T13:20:00Z"}',
 true, 259200, NOW() - INTERVAL '85 days'),

('770e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440006', '660e8400-e29b-41d4-a716-446655440002',
 'AWS Privacy Notice', 'https://aws.amazon.com/privacy/', 'privacy_policy',
 '6789012345678901234567890abcdef1234567890abcdef1234567abcdef6', 19850,
 '{"source": "browser_extension", "extension_version": "1.2.0", "timestamp": "2024-01-12T08:45:00Z"}',
 true, 86400, NOW() - INTERVAL '55 days');

\echo 'Sample documents created successfully'

-- =============================================================================
-- DOCUMENT ANALYSES
-- =============================================================================

-- Insert sample document analyses
INSERT INTO document_analyses (
    id, document_id, user_id, version, status, overall_risk_score, processing_time_ms,
    model_used, model_version, executive_summary, key_findings, recommendations,
    started_at, completed_at, expires_at
) VALUES 

-- Google ToS Analysis
('880e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001',
 1, 'completed', 78, 3420, 'mistral-7b', '0.1.0',
 'This Terms of Service contains several concerning clauses including broad data collection rights, mandatory arbitration, and limited liability protections for Google.',
 ARRAY['Broad data collection permissions granted', 'Mandatory binding arbitration clause', 'Extensive content licensing rights', 'Unilateral termination rights', 'Limited liability for service interruptions'],
 ARRAY['Consider opting out of arbitration if possible', 'Review data sharing settings', 'Understand content licensing implications', 'Monitor for terms changes'],
 NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days' + INTERVAL '3.42 seconds', NOW() + INTERVAL '65 days'),

-- Facebook Privacy Policy Analysis  
('880e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001',
 1, 'completed', 85, 4180, 'mistral-7b', '0.1.0',
 'Facebook\'s privacy policy shows extensive data collection and sharing practices with third parties, posing significant privacy risks.',
 ARRAY['Extensive personal data collection', 'Broad third-party data sharing', 'Cross-platform tracking enabled', 'Indefinite data retention', 'Vague security commitments'],
 ARRAY['Adjust privacy settings to limit data collection', 'Disable cross-platform tracking', 'Request data deletion regularly', 'Consider alternative platforms'],
 NOW() - INTERVAL '24 days', NOW() - INTERVAL '24 days' + INTERVAL '4.18 seconds', NOW() + INTERVAL '66 days'),

-- Netflix ToS Analysis
('880e8400-e29b-41d4-a716-446655440003', '770e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440002',
 1, 'completed', 52, 2890, 'phi-2', '2.7b',
 'Netflix terms are relatively consumer-friendly with reasonable limitations and clear cancellation policies.',
 ARRAY['Geographic content restrictions', 'Account sharing limitations', 'Automatic renewal with easy cancellation', 'Standard liability limitations'],
 ARRAY['Understand geographic restrictions', 'Review account sharing policies', 'Set calendar reminders for subscription reviews'],
 NOW() - INTERVAL '23 days', NOW() - INTERVAL '23 days' + INTERVAL '2.89 seconds', NOW() + INTERVAL '67 days'),

-- Slack ToS Analysis (Professional)
('880e8400-e29b-41d4-a716-446655440004', '770e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440005',
 1, 'completed', 65, 5240, 'llama2-13b', '13b',
 'Slack\'s terms include standard business provisions but require attention to data residency and customer data handling.',
 ARRAY['Customer data processing rights', 'Data residency options limited', 'Third-party app integration risks', 'Compliance feature availability varies by plan'],
 ARRAY['Review data residency requirements', 'Audit third-party integrations', 'Ensure compliance plan alignment', 'Implement data governance policies'],
 NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days' + INTERVAL '5.24 seconds', NOW() + INTERVAL '50 days'),

-- Microsoft DPA Analysis (Professional)
('880e8400-e29b-41d4-a716-446655440005', '770e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440005',
 1, 'completed', 35, 7850, 'llama2-13b', '13b',
 'Microsoft\'s Data Processing Agreement provides strong privacy protections and GDPR compliance commitments.',
 ARRAY['Comprehensive GDPR compliance measures', 'Clear data processing purposes defined', 'Strong security commitments', 'Data subject rights supported'],
 ARRAY['Leverage available compliance tools', 'Configure data retention policies', 'Regular compliance reviews recommended'],
 NOW() - INTERVAL '42 days', NOW() - INTERVAL '42 days' + INTERVAL '7.85 seconds', NOW() + INTERVAL '48 days'),

-- Salesforce Agreement Analysis (Enterprise)
('880e8400-e29b-41d4-a716-446655440006', '770e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440007',
 1, 'completed', 58, 6720, 'mixtral-8x7b', '8x7b',
 'Salesforce service agreement contains standard enterprise provisions with some areas requiring negotiation.',
 ARRAY['Standard enterprise liability limitations', 'Data processing addendum required', 'Service level commitments defined', 'Customization and integration rights'],
 ARRAY['Negotiate liability caps where possible', 'Ensure DPA execution', 'Define critical SLA requirements', 'Plan for data portability'],
 NOW() - INTERVAL '85 days', NOW() - INTERVAL '85 days' + INTERVAL '6.72 seconds', NOW() + INTERVAL '5 days'),

-- AWS Privacy Notice Analysis (Team)
('880e8400-e29b-41d4-a716-446655440007', '770e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440006',
 1, 'completed', 42, 4560, 'mistral-7b', '0.1.0',
 'AWS privacy notice demonstrates strong privacy controls and transparency, with clear data handling practices.',
 ARRAY['Comprehensive privacy controls available', 'Clear data processing transparency', 'Strong security measures', 'Customer control over data location'],
 ARRAY['Configure privacy controls appropriately', 'Review data location settings', 'Implement least privilege access', 'Regular security assessments'],
 NOW() - INTERVAL '55 days', NOW() - INTERVAL '55 days' + INTERVAL '4.56 seconds', NOW() + INTERVAL '35 days');

\echo 'Sample document analyses created successfully'

-- =============================================================================
-- ANALYSIS FINDINGS
-- =============================================================================

-- Insert sample findings for the analyses above
INSERT INTO analysis_findings (
    analysis_id, pattern_id, category, title, description, severity, confidence_score,
    text_excerpt, recommendation, impact_explanation
) VALUES 

-- Google ToS Findings
('880e8400-e29b-41d4-a716-446655440001', 
 (SELECT id FROM pattern_library WHERE name = 'Broad Data Collection' LIMIT 1),
 'data_collection', 'Extensive Data Collection Rights',
 'Google reserves the right to collect a broad range of personal information including browsing history, location data, and usage patterns.',
 'high', 0.92,
 'We collect information about your activity in our services, which may include search terms, videos you watch, content and ads you view...',
 'Review and adjust your Google Account privacy settings to limit data collection where possible.',
 'This broad data collection can create detailed profiles for advertising and may be shared with third parties.'),

('880e8400-e29b-41d4-a716-446655440001',
 (SELECT id FROM pattern_library WHERE name = 'Class Action Waiver' LIMIT 1),
 'user_rights', 'Mandatory Arbitration Clause',
 'Users must resolve disputes through individual arbitration and waive rights to class action lawsuits.',
 'critical', 0.95,
 'You and Google agree to resolve any dispute, claim or controversy through binding arbitration or small claims court instead of courts of general jurisdiction.',
 'Look for arbitration opt-out provisions in the terms or contact Google to inquire about opting out.',
 'This limits your ability to join with other users in legal action and may make it more expensive to pursue claims.'),

-- Facebook Privacy Policy Findings
('880e8400-e29b-41d4-a716-446655440002',
 (SELECT id FROM pattern_library WHERE name = 'Third Party Data Sharing' LIMIT 1),
 'data_collection', 'Extensive Third-Party Sharing',
 'Facebook shares personal data with a wide network of partners, advertisers, and affiliated companies.',
 'critical', 0.89,
 'We share information with advertisers, measurement partners, and other partners who help us provide and improve our Products.',
 'Review and restrict third-party data sharing in your Facebook privacy settings.',
 'Your personal information may be used by numerous third parties for advertising and analytics purposes.'),

('880e8400-e29b-41d4-a716-446655440002',
 (SELECT id FROM pattern_library WHERE name = 'Data Retention Indefinite' LIMIT 1),
 'privacy', 'Indefinite Data Retention',
 'Facebook may retain user data indefinitely without clear deletion timelines.',
 'high', 0.87,
 'We store data until it is no longer necessary to provide our services and products, or until your account is deleted.',
 'Regularly review and delete unnecessary data from your Facebook account.',
 'Long-term data retention increases privacy risks and potential for data breaches.'),

-- Netflix ToS Findings
('880e8400-e29b-41d4-a716-446655440003',
 (SELECT id FROM pattern_library WHERE name = 'Automatic Renewal' LIMIT 1),
 'financial', 'Automatic Subscription Renewal',
 'Netflix subscriptions automatically renew unless cancelled before the billing cycle.',
 'medium', 0.91,
 'Your Netflix membership will continue until terminated. To use the Netflix service you must have Internet access and pay the applicable fees.',
 'Set calendar reminders to review your subscription before each billing cycle.',
 'Automatic renewal may result in unexpected charges if you forget to cancel.'),

-- Slack ToS Findings (fewer findings for business services)
('880e8400-e29b-41d4-a716-446655440004',
 (SELECT id FROM pattern_library WHERE name = 'Limited Liability' LIMIT 1),
 'user_rights', 'Service Liability Limitations',
 'Slack limits liability for service interruptions and data loss to the monthly subscription fee.',
 'medium', 0.83,
 'Slack\'s liability for any damages arising from or related to these Terms will not exceed the amount paid by Customer for the Services.',
 'Consider additional data backup and business continuity measures.',
 'Limited liability may not cover full business impact of service outages or data loss.');

\echo 'Sample analysis findings created successfully'

-- =============================================================================
-- USER ACTIONS AND TEMPLATES
-- =============================================================================

-- Insert sample user actions using templates
INSERT INTO user_actions (
    id, user_id, document_id, template_id, title, recipient_email, recipient_company,
    generated_content, status, sent_at, notes
) VALUES 

-- Arbitration opt-out for Google
('990e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440001',
 (SELECT id FROM action_templates WHERE name = 'Arbitration Opt-Out Template' LIMIT 1),
 'Opt-Out of Google Arbitration Agreement', 'legal-notices@google.com', 'Google LLC',
 'Subject: Opt-Out of Arbitration Agreement - John Doe

Dear Google Customer Service,

I am writing to formally opt out of the binding arbitration agreement in your Terms of Service, as permitted under the agreement.

My account details:
- Name: John Doe
- Email: john.doe@example.com
- Account ID: john.doe@gmail.com

This notice is sent within the required time period from account creation. I prefer to retain my right to pursue legal remedies through the court system.

Please confirm receipt of this opt-out notice and update my account accordingly.

Sincerely,
John Doe',
 'sent', NOW() - INTERVAL '20 days',
 'Sent after discovering arbitration clause in analysis'),

-- GDPR data request for Facebook  
('990e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440002',
 (SELECT id FROM action_templates WHERE name = 'GDPR Data Access Request' LIMIT 1),
 'GDPR Data Access Request - Facebook', 'privacy@facebook.com', 'Meta Platforms Inc.',
 'Subject: Data Access Request Under GDPR Article 15 - John Doe

Dear Data Protection Officer / Privacy Team,

I am writing to request access to my personal data that Meta Platforms Inc. processes, as provided for under Article 15 of the General Data Protection Regulation (GDPR).

My details:
- Name: John Doe
- Email: john.doe@example.com
- Account ID: john.doe@facebook.com

Please provide:
1. Confirmation of whether you process my personal data
2. Categories of personal data processed
3. Purposes of processing
4. Categories of recipients who have received the data
5. Retention period for the data
6. A copy of my personal data in a structured, commonly used format

I understand you have 30 days to respond to this request under GDPR.

Best regards,
John Doe',
 'delivered', NOW() - INTERVAL '18 days',
 'Requested after privacy policy analysis showed extensive data collection'),

-- Professional user action
('990e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440005', '770e8400-e29b-41d4-a716-446655440004',
 (SELECT id FROM action_templates WHERE name = 'Subscription Cancellation' LIMIT 1),
 'Slack Subscription Review', 'billing@slack.com', 'Slack Technologies',
 'Subject: Subscription Review Request - Sarah Davis

Dear Slack Customer Service,

I am writing to review our current Slack subscription and discuss potential plan optimization.

My account details:
- Name: Sarah Davis
- Email: sarah.davis@company.com
- Account ID: company-workspace
- Subscription Type: Business+ Plan

Please:
1. Provide current usage analytics
2. Recommend appropriate plan based on usage
3. Discuss any available discounts for annual commitments
4. Clarify data retention policies

Thank you,
Sarah Davis',
 'responded', NOW() - INTERVAL '35 days',
 'Slack responded with usage analytics and pricing options');

\echo 'Sample user actions created successfully'

-- =============================================================================
-- NOTIFICATIONS AND PREFERENCES
-- =============================================================================

-- Insert notification preferences for users
INSERT INTO notification_preferences (
    user_id, email_enabled, browser_enabled, webhook_enabled, analysis_complete,
    document_changes, high_risk_findings, weekly_summary, marketing_emails
) VALUES 
('550e8400-e29b-41d4-a716-446655440001', true, true, false, true, true, true, true, false),
('550e8400-e29b-41d4-a716-446655440002', true, false, false, true, true, true, false, false),
('550e8400-e29b-41d4-a716-446655440003', false, true, false, true, false, true, true, true),
('550e8400-e29b-41d4-a716-446655440004', true, true, false, true, true, true, true, true),
('550e8400-e29b-41d4-a716-446655440005', true, true, true, true, true, true, true, false),
('550e8400-e29b-41d4-a716-446655440006', true, true, false, true, true, true, true, false),
('550e8400-e29b-41d4-a716-446655440007', true, true, true, true, true, true, false, false);

-- Insert sample notifications
INSERT INTO notifications (
    user_id, type, title, message, data, read_at, action_url
) VALUES 
('550e8400-e29b-41d4-a716-446655440001', 'analysis_complete', 'Google Terms Analysis Complete',
 'Your analysis of Google Terms of Service has been completed. Risk score: 78/100',
 '{"document_id": "770e8400-e29b-41d4-a716-446655440001", "risk_score": 78}',
 NOW() - INTERVAL '24 days', '/analysis/880e8400-e29b-41d4-a716-446655440001'),

('550e8400-e29b-41d4-a716-446655440001', 'document_changed', 'Facebook Privacy Policy Updated',
 'The Facebook Privacy Policy you\'re monitoring has been updated. New analysis recommended.',
 '{"document_id": "770e8400-e29b-41d4-a716-446655440002", "change_type": "modified"}',
 NULL, '/documents/770e8400-e29b-41d4-a716-446655440002'),

('550e8400-e29b-41d4-a716-446655440005', 'action_required', 'High Risk Finding Requires Action',
 'Critical arbitration clause found in Slack Terms of Service. Consider taking action.',
 '{"finding_id": "critical_arbitration", "severity": "critical"}',
 NOW() - INTERVAL '35 days', '/action-center/templates');

\echo 'Notifications and preferences created successfully'

-- =============================================================================
-- API KEYS AND USAGE
-- =============================================================================

-- Insert sample API keys for professional+ users
INSERT INTO api_keys (
    id, user_id, team_id, name, key_hash, key_prefix, permissions, rate_limit, usage_count, last_used_at
) VALUES 
('aa0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440005', NULL,
 'Development API Key', '$2b$10$rKzZtDfGwgVQ7z5vH3xJP.uZFq2hYmPx8wBcR5tEd9nH6aL1vM3sK', 'fpai_dev_',
 '{"document_analysis": true, "monitoring": true, "webhooks": false}', 5000, 342, NOW() - INTERVAL '2 days'),

('aa0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440007', '660e8400-e29b-41d4-a716-446655440001',
 'Enterprise Integration Key', '$2b$10$tYfGvBnMkLpQw2x8zA5rT.yHj3iRmNx9kCeR6uFd0aI7nB2mO4tL', 'fpai_ent_',
 '{"document_analysis": true, "monitoring": true, "webhooks": true, "team_management": true}', 50000, 1847, NOW() - INTERVAL '1 hour');

-- Insert sample API usage data
INSERT INTO api_usage (
    api_key_id, endpoint, method, status_code, response_time_ms, ip_address, created_at
) VALUES 
('aa0e8400-e29b-41d4-a716-446655440001', '/api/v1/documents/analyze', 'POST', 200, 2340, '192.168.1.100', NOW() - INTERVAL '2 hours'),
('aa0e8400-e29b-41d4-a716-446655440001', '/api/v1/documents/list', 'GET', 200, 156, '192.168.1.100', NOW() - INTERVAL '3 hours'),
('aa0e8400-e29b-41d4-a716-446655440002', '/api/v1/team/documents', 'GET', 200, 234, '10.0.1.50', NOW() - INTERVAL '1 hour'),
('aa0e8400-e29b-41d4-a716-446655440002', '/api/v1/webhooks/configure', 'PUT', 200, 445, '10.0.1.50', NOW() - INTERVAL '6 hours');

\echo 'API keys and usage data created successfully'

-- =============================================================================
-- ANALYTICS DATA
-- =============================================================================

-- Insert sample usage analytics
INSERT INTO usage_analytics (
    date, subscription_tier, total_users, total_analyses, total_documents, avg_risk_score,
    top_document_types, top_finding_categories, performance_metrics
) VALUES 
-- Recent data
(CURRENT_DATE - INTERVAL '1 day', 'free', 15420, 2340, 8970, 67.5,
 '{"terms_of_service": 45, "privacy_policy": 32, "eula": 15, "other": 8}',
 '{"data_collection": 28, "user_rights": 24, "privacy": 20, "financial": 15, "content_rights": 13}',
 '{"avg_processing_time_ms": 3456, "success_rate": 0.987, "uptime": 0.999}'),

(CURRENT_DATE - INTERVAL '1 day', 'starter', 3240, 1890, 4567, 72.1,
 '{"terms_of_service": 42, "privacy_policy": 35, "service_agreement": 12, "other": 11}',
 '{"data_collection": 31, "user_rights": 26, "privacy": 18, "financial": 14, "content_rights": 11}',
 '{"avg_processing_time_ms": 2987, "success_rate": 0.993, "uptime": 0.999}'),

(CURRENT_DATE - INTERVAL '1 day', 'professional', 892, 1245, 2234, 65.8,
 '{"service_agreement": 35, "data_processing_agreement": 28, "terms_of_service": 22, "privacy_policy": 15}',
 '{"privacy": 30, "data_collection": 25, "user_rights": 20, "financial": 15, "service_terms": 10}',
 '{"avg_processing_time_ms": 4123, "success_rate": 0.996, "uptime": 0.999}'),

-- Historical trend data
(CURRENT_DATE - INTERVAL '7 days', 'free', 14890, 2156, 8234, 66.8, '{}', '{}', '{}'),
(CURRENT_DATE - INTERVAL '30 days', 'free', 12340, 1678, 6789, 64.2, '{}', '{}', '{}');

-- Insert system metrics
INSERT INTO system_metrics (metric_name, metric_value, tags, timestamp) VALUES 
('active_users_daily', 19552, '{"period": "24h"}', NOW() - INTERVAL '1 hour'),
('documents_analyzed_daily', 5475, '{"period": "24h"}', NOW() - INTERVAL '1 hour'),
('avg_analysis_time_ms', 3521, '{"model": "all"}', NOW() - INTERVAL '1 hour'),
('api_requests_daily', 12847, '{"period": "24h"}', NOW() - INTERVAL '1 hour'),
('vector_search_latency_ms', 45, '{"collection": "document_embeddings"}', NOW() - INTERVAL '1 hour'),
('database_connections_active', 23, '{"pool": "main"}', NOW() - INTERVAL '1 hour');

\echo 'Analytics data created successfully'

-- =============================================================================
-- DOCUMENT CHANGES FOR MONITORING
-- =============================================================================

-- Insert sample document changes to show monitoring functionality
INSERT INTO document_changes (
    document_id, old_hash, new_hash, change_type, change_summary, significant_changes, risk_change, detected_at
) VALUES 
('770e8400-e29b-41d4-a716-446655440002', 
 'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567a',
 'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567b',
 'modified', 'Facebook updated their privacy policy section on data sharing with third parties',
 ARRAY['Added new third-party data sharing categories', 'Expanded advertising partner network', 'Modified data retention periods'],
 5, NOW() - INTERVAL '3 days'),

('770e8400-e29b-41d4-a716-446655440001',
 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123457',
 'modified', 'Google Terms of Service updated liability and warranty sections',
 ARRAY['Strengthened liability limitations', 'Updated warranty disclaimers'],
 -2, NOW() - INTERVAL '10 days');

\echo 'Document change history created successfully'

-- =============================================================================
-- ALERTS
-- =============================================================================

-- Insert sample alerts
INSERT INTO alerts (
    user_id, document_id, type, severity, title, description, data, acknowledged
) VALUES 
('550e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440002',
 'document_change', 'high', 'High-Risk Change Detected',
 'Facebook Privacy Policy has been updated with new data sharing provisions that increase your privacy risk.',
 '{"risk_increase": 5, "new_categories": ["advertising_partners", "measurement_partners"]}', false),

('550e8400-e29b-41d4-a716-446655440005', NULL,
 'subscription_expiry', 'medium', 'Subscription Renewal Reminder',
 'Your Professional subscription will renew in 7 days. Review your usage and plan as needed.',
 '{"days_until_renewal": 7, "current_plan": "professional", "usage_percentage": 78}', true);

\echo 'Sample alerts created successfully'

-- =============================================================================
-- FINAL STATISTICS UPDATE
-- =============================================================================

-- Update usage counts in templates based on created actions
UPDATE action_templates 
SET usage_count = (
    SELECT COUNT(*) 
    FROM user_actions 
    WHERE template_id = action_templates.id
);

-- Update system metrics with current seed data counts
INSERT INTO system_metrics (metric_name, metric_value, tags) VALUES
('seed_users_created', (SELECT COUNT(*) FROM users), '{"type": "seed_data"}'),
('seed_documents_created', (SELECT COUNT(*) FROM documents), '{"type": "seed_data"}'),
('seed_analyses_created', (SELECT COUNT(*) FROM document_analyses), '{"type": "seed_data"}'),
('seed_findings_created', (SELECT COUNT(*) FROM analysis_findings), '{"type": "seed_data"}'),
('seed_actions_created', (SELECT COUNT(*) FROM user_actions), '{"type": "seed_data"}');

\echo 'Statistics updated successfully'

\echo '🎉 Development seed data loaded successfully!'
\echo ''
\echo '📊 Summary of created data:'
\echo '  - Users: 7 (across all subscription tiers)'
\echo '  - Teams: 2 with memberships'
\echo '  - Documents: 7 with monitoring enabled'
\echo '  - Analyses: 7 completed with findings'
\echo '  - User Actions: 3 from templates'
\echo '  - Notifications: 3 with different types'
\echo '  - API Keys: 2 for professional+ users'
\echo '  - Analytics: Historical usage data'
\echo '  - Alerts: 2 active alerts'
\echo ''
\echo '🔍 Test accounts:'
\echo '  - Free: john.doe@example.com, jane.smith@example.com'
\echo '  - Starter: alice.johnson@example.com, bob.wilson@example.com'
\echo '  - Professional: sarah.davis@company.com'
\echo '  - Team: mike.brown@enterprise.com'
\echo '  - Enterprise: lisa.chen@bigcorp.com'
\echo ''
\echo '💡 Use this data to test:'
\echo '  - User dashboard views'
\echo '  - Document analysis workflows'
\echo '  - Action center functionality'
\echo '  - Team collaboration features'
\echo '  - API integration scenarios'
\echo '  - Monitoring and alerting'