-- Migration: 002_initial_seed_data.sql
-- Description: Initial seed data for Fine Print AI
-- Date: 2024-01-01
-- Author: Database Architect

\echo 'Inserting initial seed data...'

-- =============================================================================
-- PATTERN LIBRARY SEED DATA
-- =============================================================================

-- Insert core patterns for document analysis
INSERT INTO pattern_library (category, name, description, pattern_regex, pattern_keywords, severity, explanation, recommendation, legal_context, examples, is_active, is_custom, version) VALUES

-- Data Collection Patterns
('data_collection', 'Broad Data Collection', 'Overly broad data collection clauses', '(collect|gather|obtain).*(any|all|every).*(data|information)', ARRAY['collect all data', 'gather any information', 'obtain every detail'], 'high', 'This clause allows the service to collect an unlimited scope of personal data', 'Request specific data collection limitations', 'GDPR requires data minimization principles', ARRAY['We may collect any information you provide', 'All data you generate may be collected'], true, false, 1),

('data_collection', 'Automatic Data Collection', 'Hidden automatic data collection', '(automatically|passive|background).*(collect|track|monitor)', ARRAY['automatic collection', 'passive tracking', 'background monitoring'], 'medium', 'Data is collected without explicit user action', 'Ensure transparency about automatic collection', 'Users have right to know about data collection', ARRAY['We automatically collect usage data', 'Passive tracking of user behavior'], true, false, 1),

('data_collection', 'Third Party Data Sharing', 'Data shared with unnamed third parties', '(share|provide|disclose).*(third.party|partner|affiliate)', ARRAY['share with partners', 'third party disclosure', 'affiliate sharing'], 'critical', 'Your data may be shared with unknown third parties', 'Demand specific list of third parties', 'GDPR requires explicit consent for third party sharing', ARRAY['We may share data with our partners', 'Third parties may receive your information'], true, false, 1),

-- User Rights Patterns
('user_rights', 'Class Action Waiver', 'Waiver of class action lawsuit rights', '(waive|waiver|forfeit).*(class.action|collective)', ARRAY['class action waiver', 'no class action', 'waive collective rights'], 'critical', 'You cannot join class action lawsuits against the service', 'Consider services that preserve your legal rights', 'May limit your ability to seek legal remedy', ARRAY['You waive the right to participate in class actions', 'No collective legal proceedings allowed'], true, false, 1),

('user_rights', 'Arbitration Clause', 'Mandatory arbitration instead of court', '(arbitration|arbitrate).*(binding|mandatory|required)', ARRAY['mandatory arbitration', 'binding arbitration', 'no court'], 'high', 'Disputes must be resolved through arbitration, not courts', 'Look for arbitration opt-out provisions', 'Limits access to traditional legal system', ARRAY['All disputes subject to binding arbitration', 'Mandatory arbitration required'], true, false, 1),

('user_rights', 'Limited Liability', 'Service limits their liability for damages', '(limit|exclude|disclaim).*(liability|damages)', ARRAY['limited liability', 'no liability', 'exclude damages'], 'medium', 'Service may not be responsible for damages', 'Understand what damages are excluded', 'May limit compensation for service failures', ARRAY['We exclude all liability for damages', 'Limited liability for service interruptions'], true, false, 1),

-- Content and IP Patterns
('content_rights', 'Broad Content License', 'Overly broad license to user content', '(license|grant).*(perpetual|irrevocable|worldwide)', ARRAY['perpetual license', 'irrevocable rights', 'worldwide license'], 'high', 'Service gets extensive rights to your content', 'Ensure content licenses are limited and specific', 'You may lose control over your own content', ARRAY['You grant us a perpetual, irrevocable license', 'Worldwide rights to your content'], true, false, 1),

('content_rights', 'Content Modification Rights', 'Right to modify user content', '(modify|alter|edit|change).*(content|material)', ARRAY['modify content', 'alter materials', 'edit submissions'], 'medium', 'Service can change your content without permission', 'Look for content integrity protections', 'Your content may be modified without consent', ARRAY['We may modify your content', 'Right to alter user submissions'], true, false, 1),

-- Termination and Changes Patterns
('service_terms', 'Unilateral Termination', 'Service can terminate without cause', '(terminate|suspend).*(any.time|without.cause|sole.discretion)', ARRAY['terminate anytime', 'without cause', 'sole discretion'], 'medium', 'Your account can be terminated at any time without reason', 'Look for fair termination policies', 'May lose access to service and data unexpectedly', ARRAY['We may terminate your account at any time', 'Termination at our sole discretion'], true, false, 1),

('service_terms', 'Terms Change Without Notice', 'Terms can be changed without user notification', '(change|modify|update).*(without.notice|any.time)', ARRAY['change without notice', 'modify anytime', 'update terms'], 'high', 'Terms can change without you being informed', 'Require notification of material changes', 'You may be bound by terms you never agreed to', ARRAY['Terms may change without notice', 'We can modify these terms at any time'], true, false, 1),

-- Privacy and Security Patterns
('privacy', 'Data Retention Indefinite', 'Data kept indefinitely without deletion timeline', '(retain|keep|store).*(indefinite|permanent|forever)', ARRAY['retain indefinitely', 'keep forever', 'permanent storage'], 'high', 'Your data may be kept forever', 'Request specific data retention periods', 'GDPR requires limited data retention', ARRAY['We retain data indefinitely', 'Permanent storage of information'], true, false, 1),

('privacy', 'Weak Security Standards', 'Vague or weak security commitments', '(reasonable|appropriate).*(security|measures)', ARRAY['reasonable security', 'appropriate measures', 'industry standard'], 'medium', 'Security commitments are vague and may be inadequate', 'Look for specific security standards (ISO 27001, SOC 2)', 'Weak security may expose your data to breaches', ARRAY['We use reasonable security measures', 'Appropriate security standards'], true, false, 1),

-- Financial Patterns
('financial', 'Automatic Renewal', 'Automatic subscription renewal without clear notice', '(automatic|auto).*(renew|renewal|bill)', ARRAY['auto renewal', 'automatic billing', 'renew automatically'], 'medium', 'Subscription renews automatically, potentially without notice', 'Ensure you can easily cancel before renewal', 'May result in unexpected charges', ARRAY['Your subscription will automatically renew', 'Auto-billing enabled by default'], true, false, 1),

('financial', 'Non-Refundable Fees', 'All fees are non-refundable', '(non.refundable|no.refund|final.sale)', ARRAY['non-refundable', 'no refunds', 'all sales final'], 'medium', 'You cannot get your money back even if service is unsatisfactory', 'Look for reasonable refund policies', 'May violate consumer protection laws in some jurisdictions', ARRAY['All fees are non-refundable', 'No refunds under any circumstances'], true, false, 1);

\echo 'Pattern library seeded successfully'

-- =============================================================================
-- ACTION TEMPLATES SEED DATA
-- =============================================================================

-- Insert common action templates
INSERT INTO action_templates (category, name, description, template_content, variables, legal_basis, applicable_regions, success_rate, is_active) VALUES

('opt_out', 'Arbitration Opt-Out Template', 'Template to opt out of binding arbitration clauses', 
'Subject: Opt-Out of Arbitration Agreement - {{user_name}}

Dear {{company_name}} Customer Service,

I am writing to formally opt out of the binding arbitration agreement in your Terms of Service, as permitted under the agreement.

My account details:
- Name: {{user_name}}
- Email: {{user_email}}
- Account ID: {{account_id}} (if applicable)

This notice is sent within the required time period from account creation. I prefer to retain my right to pursue legal remedies through the court system.

Please confirm receipt of this opt-out notice and update my account accordingly.

Sincerely,
{{user_name}}', 
'{"user_name": "Your full name", "user_email": "Your email address", "company_name": "Service provider name", "account_id": "Your account ID if available"}',
'Consumer protection rights', 
ARRAY['US', 'CA'], 
0.75, 
true),

('data_request', 'GDPR Data Access Request', 'Template for requesting personal data under GDPR Article 15', 
'Subject: Data Access Request Under GDPR Article 15 - {{user_name}}

Dear Data Protection Officer / Privacy Team,

I am writing to request access to my personal data that {{company_name}} processes, as provided for under Article 15 of the General Data Protection Regulation (GDPR).

My details:
- Name: {{user_name}}
- Email: {{user_email}}
- Account ID: {{account_id}} (if applicable)

Please provide:
1. Confirmation of whether you process my personal data
2. Categories of personal data processed
3. Purposes of processing
4. Categories of recipients who have received the data
5. Retention period for the data
6. A copy of my personal data in a structured, commonly used format

I understand you have 30 days to respond to this request under GDPR.

Best regards,
{{user_name}}',
'{"user_name": "Your full name", "user_email": "Your email address", "company_name": "Service provider name", "account_id": "Your account ID if available"}',
'GDPR Article 15 - Right of Access',
ARRAY['EU', 'UK'],
0.90,
true),

('data_request', 'CCPA Data Access Request', 'Template for requesting personal data under CCPA', 
'Subject: Consumer Request for Personal Information - {{user_name}}

Dear {{company_name}} Privacy Team,

I am a California resident making a request under the California Consumer Privacy Act (CCPA) to know what personal information you have collected about me.

My details:
- Name: {{user_name}}
- Email: {{user_email}}
- Account ID: {{account_id}} (if applicable)

I request disclosure of:
1. Categories of personal information collected
2. Categories of sources of personal information
3. Business purpose for collecting personal information
4. Categories of third parties with whom information is shared
5. The specific pieces of personal information collected

Please respond within 45 days as required by CCPA.

Thank you,
{{user_name}}',
'{"user_name": "Your full name", "user_email": "Your email address", "company_name": "Service provider name", "account_id": "Your account ID if available"}',
'CCPA Section 1798.110 - Right to Know',
ARRAY['US-CA'],
0.85,
true),

('deletion', 'GDPR Data Deletion Request', 'Template for requesting data deletion under GDPR Article 17', 
'Subject: Data Deletion Request Under GDPR Article 17 - {{user_name}}

Dear Data Protection Officer,

I am exercising my right to erasure under Article 17 of the GDPR and request that {{company_name}} delete all personal data related to me.

My details:
- Name: {{user_name}}
- Email: {{user_email}}
- Account ID: {{account_id}} (if applicable)

Grounds for erasure:
- The personal data is no longer necessary for the original purpose
- I withdraw my consent and there is no other legal ground for processing

Please confirm:
1. Complete deletion of my personal data
2. Notification to any third parties who received my data
3. Timeline for complete data removal

I understand you have 30 days to respond under GDPR.

Regards,
{{user_name}}',
'{"user_name": "Your full name", "user_email": "Your email address", "company_name": "Service provider name", "account_id": "Your account ID if available"}',
'GDPR Article 17 - Right to Erasure',
ARRAY['EU', 'UK'],
0.80,
true),

('cancellation', 'Subscription Cancellation', 'Template for canceling subscriptions with auto-renewal', 
'Subject: Immediate Cancellation Request - {{user_name}}

Dear {{company_name}} Customer Service,

I am requesting immediate cancellation of my subscription to prevent any future billing.

My account details:
- Name: {{user_name}}
- Email: {{user_email}}
- Account ID: {{account_id}}
- Subscription Type: {{subscription_type}}

Please:
1. Cancel my subscription immediately
2. Confirm no future charges will occur
3. Provide written confirmation of cancellation
4. Specify when service access will end

I expect this cancellation to be processed within 24 hours.

Thank you,
{{user_name}}',
'{"user_name": "Your full name", "user_email": "Your email address", "company_name": "Service provider name", "account_id": "Your account ID", "subscription_type": "Your subscription plan"}',
'Consumer right to cancel',
ARRAY['US', 'EU', 'UK', 'CA'],
0.95,
true);

\echo 'Action templates seeded successfully'

-- =============================================================================
-- SYSTEM CONFIGURATION DATA
-- =============================================================================

-- Insert system configuration
INSERT INTO system_metrics (metric_name, metric_value, tags) VALUES
('system_version', 1.0, '{"component": "database", "environment": "development"}'),
('schema_version', 1, '{"migration": "002"}'),
('pattern_count', (SELECT COUNT(*) FROM pattern_library), '{"category": "patterns"}'),
('template_count', (SELECT COUNT(*) FROM action_templates), '{"category": "templates"}');

\echo 'System configuration data inserted successfully'

-- Record migration completion
SELECT record_migration('002', 'Initial seed data for patterns and templates');

\echo 'Migration 002_initial_seed_data.sql completed successfully!'