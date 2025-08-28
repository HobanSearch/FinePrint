-- Fine Print AI - Analytics System Database Schema
-- Migration 004: Analytics Infrastructure

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- =============================================================================
-- ANALYTICS EVENTS TABLES
-- =============================================================================

-- Main analytics events table
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_name VARCHAR(100) NOT NULL,
    properties JSONB DEFAULT '{}',
    context JSONB DEFAULT '{}',
    session_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics events
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_properties ON analytics_events USING GIN(properties);
CREATE INDEX IF NOT EXISTS idx_analytics_events_composite ON analytics_events(user_id, event_name, created_at);

-- Partition analytics_events by month for performance
-- This would be set up separately in production
-- ALTER TABLE analytics_events PARTITION BY RANGE (created_at);

-- =============================================================================
-- AI MODEL ANALYTICS TABLES
-- =============================================================================

-- AI model requests tracking
CREATE TABLE IF NOT EXISTS ai_model_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT true,
    error_type VARCHAR(100),
    confidence_score DECIMAL(3,2),
    input_length INTEGER,
    output_length INTEGER,
    cost_estimate DECIMAL(10,4),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for AI model requests
CREATE INDEX IF NOT EXISTS idx_ai_model_requests_model ON ai_model_requests(model_name, model_version);
CREATE INDEX IF NOT EXISTS idx_ai_model_requests_user_id ON ai_model_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_model_requests_timestamp ON ai_model_requests(timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_model_requests_success ON ai_model_requests(success);
CREATE INDEX IF NOT EXISTS idx_ai_model_requests_composite ON ai_model_requests(model_name, timestamp, success);

-- AI model sessions
CREATE TABLE IF NOT EXISTS ai_model_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    request_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_cost DECIMAL(10,4) DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for AI model sessions
CREATE INDEX IF NOT EXISTS idx_ai_model_sessions_session_id ON ai_model_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_model_sessions_model ON ai_model_sessions(model_name, model_version);
CREATE INDEX IF NOT EXISTS idx_ai_model_sessions_user_id ON ai_model_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_model_sessions_start_time ON ai_model_sessions(start_time);

-- AI model experiments (A/B testing)
CREATE TABLE IF NOT EXISTS ai_model_experiments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    models JSONB NOT NULL, -- Array of model names/versions
    traffic_split JSONB NOT NULL, -- Traffic allocation per model
    metrics JSONB NOT NULL, -- Metrics to track
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('draft', 'running', 'paused', 'completed')),
    results JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for AI experiments
CREATE INDEX IF NOT EXISTS idx_ai_experiments_status ON ai_model_experiments(status);
CREATE INDEX IF NOT EXISTS idx_ai_experiments_dates ON ai_model_experiments(start_date, end_date);

-- =============================================================================
-- FUNNEL ANALYSIS TABLES
-- =============================================================================

-- Funnel steps tracking
CREATE TABLE IF NOT EXISTS funnel_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    funnel_name VARCHAR(100) NOT NULL,
    step_name VARCHAR(100) NOT NULL,
    step_order INTEGER NOT NULL,
    properties JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, funnel_name, step_name)
);

-- Indexes for funnel steps
CREATE INDEX IF NOT EXISTS idx_funnel_steps_user_id ON funnel_steps(user_id);
CREATE INDEX IF NOT EXISTS idx_funnel_steps_funnel_name ON funnel_steps(funnel_name);
CREATE INDEX IF NOT EXISTS idx_funnel_steps_step_order ON funnel_steps(funnel_name, step_order);
CREATE INDEX IF NOT EXISTS idx_funnel_steps_created_at ON funnel_steps(created_at);

-- Funnel definitions
CREATE TABLE IF NOT EXISTS funnel_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    steps JSONB NOT NULL, -- Array of step definitions
    time_window_hours INTEGER DEFAULT 168, -- 7 days default
    conversion_goal VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- USER SEGMENTATION TABLES
-- =============================================================================

-- User segments
CREATE TABLE IF NOT EXISTS user_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    criteria JSONB NOT NULL,
    user_count INTEGER DEFAULT 0,
    avg_lifetime_value DECIMAL(10,2) DEFAULT 0,
    conversion_rate DECIMAL(5,4) DEFAULT 0,
    churn_rate DECIMAL(5,4) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User segment membership
CREATE TABLE IF NOT EXISTS user_segment_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    segment_id UUID REFERENCES user_segments(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    UNIQUE(user_id, segment_id, joined_at)
);

-- Indexes for user segments
CREATE INDEX IF NOT EXISTS idx_user_segments_active ON user_segments(is_active);
CREATE INDEX IF NOT EXISTS idx_user_segment_memberships_user ON user_segment_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_segment_memberships_segment ON user_segment_memberships(segment_id);

-- =============================================================================
-- BUSINESS METRICS TABLES
-- =============================================================================

-- Business metrics aggregations
CREATE TABLE IF NOT EXISTS business_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_date DATE NOT NULL,
    metric_type VARCHAR(50) NOT NULL, -- 'daily', 'weekly', 'monthly'
    revenue_metrics JSONB DEFAULT '{}',
    user_metrics JSONB DEFAULT '{}',
    product_metrics JSONB DEFAULT '{}',
    operational_metrics JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(metric_date, metric_type)
);

-- Indexes for business metrics
CREATE INDEX IF NOT EXISTS idx_business_metrics_date ON business_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_business_metrics_type ON business_metrics(metric_type);

-- =============================================================================
-- DATA QUALITY TABLES
-- =============================================================================

-- Data quality checks
CREATE TABLE IF NOT EXISTS data_quality_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    check_type VARCHAR(50) NOT NULL, -- 'completeness', 'validity', 'consistency', etc.
    table_name VARCHAR(100) NOT NULL,
    column_name VARCHAR(100),
    rules JSONB NOT NULL,
    schedule VARCHAR(100), -- Cron expression
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Data quality results
CREATE TABLE IF NOT EXISTS data_quality_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    check_id UUID REFERENCES data_quality_checks(id) ON DELETE CASCADE,
    execution_time TIMESTAMPTZ DEFAULT NOW(),
    passed BOOLEAN NOT NULL,
    score DECIMAL(5,4) NOT NULL DEFAULT 0, -- 0.0 to 1.0
    issues JSONB DEFAULT '[]',
    affected_rows INTEGER DEFAULT 0,
    total_rows INTEGER DEFAULT 0,
    execution_duration_ms INTEGER DEFAULT 0
);

-- Indexes for data quality
CREATE INDEX IF NOT EXISTS idx_data_quality_checks_enabled ON data_quality_checks(enabled);
CREATE INDEX IF NOT EXISTS idx_data_quality_results_check_id ON data_quality_results(check_id);
CREATE INDEX IF NOT EXISTS idx_data_quality_results_execution_time ON data_quality_results(execution_time);

-- =============================================================================
-- PRIVACY AND CONSENT TABLES
-- =============================================================================

-- User consent records
CREATE TABLE IF NOT EXISTS user_consent_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(50) NOT NULL, -- 'analytics', 'marketing', 'functional', 'necessary'
    granted BOOLEAN NOT NULL,
    consent_source VARCHAR(100) NOT NULL, -- 'cookie_banner', 'preferences', 'api'
    ip_address INET,
    user_agent TEXT,
    consent_data JSONB DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for consent records
CREATE INDEX IF NOT EXISTS idx_consent_records_user_id ON user_consent_records(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_type ON user_consent_records(consent_type);
CREATE INDEX IF NOT EXISTS idx_consent_records_created_at ON user_consent_records(created_at);

-- Data processing records (GDPR compliance)
CREATE TABLE IF NOT EXISTS data_processing_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_name VARCHAR(200) NOT NULL,
    purpose TEXT NOT NULL,
    legal_basis VARCHAR(100) NOT NULL,
    data_categories TEXT[] NOT NULL,
    data_subjects TEXT[] NOT NULL,
    recipients TEXT[] DEFAULT '{}',
    retention_period VARCHAR(100),
    security_measures TEXT,
    cross_border_transfers BOOLEAN DEFAULT false,
    transfer_safeguards TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SYSTEM PERFORMANCE TABLES
-- =============================================================================

-- System performance metrics
CREATE TABLE IF NOT EXISTS system_performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name VARCHAR(100) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(15,6) NOT NULL,
    metric_unit VARCHAR(20), -- 'ms', 'bytes', 'percent', 'count'
    tags JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance metrics
CREATE INDEX IF NOT EXISTS idx_performance_metrics_service ON system_performance_metrics(service_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_name ON system_performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp ON system_performance_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_composite ON system_performance_metrics(service_name, metric_name, timestamp);

-- API usage tracking (extends existing api_usage table)
ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS session_id VARCHAR(255);
ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS error_details JSONB;
ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN DEFAULT false;

-- Additional indexes for extended api_usage
CREATE INDEX IF NOT EXISTS idx_api_usage_request_id ON api_usage(request_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_session_id ON api_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_error_details ON api_usage USING GIN(error_details);

-- =============================================================================
-- REPORTING TABLES
-- =============================================================================

-- Automated reports
CREATE TABLE IF NOT EXISTS automated_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    report_type VARCHAR(50) NOT NULL, -- 'executive_summary', 'user_engagement', etc.
    configuration JSONB NOT NULL,
    schedule VARCHAR(100) NOT NULL, -- Cron expression
    recipients TEXT[] DEFAULT '{}',
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'failed')),
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Report executions
CREATE TABLE IF NOT EXISTS report_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES automated_reports(id) ON DELETE CASCADE,
    execution_start TIMESTAMPTZ DEFAULT NOW(),
    execution_end TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    result_data JSONB,
    error_message TEXT,
    file_path TEXT,
    file_size INTEGER,
    recipients_notified TEXT[] DEFAULT '{}'
);

-- Indexes for reports
CREATE INDEX IF NOT EXISTS idx_automated_reports_status ON automated_reports(status);
CREATE INDEX IF NOT EXISTS idx_automated_reports_next_run ON automated_reports(next_run_at);
CREATE INDEX IF NOT EXISTS idx_report_executions_report_id ON report_executions(report_id);
CREATE INDEX IF NOT EXISTS idx_report_executions_start ON report_executions(execution_start);

-- =============================================================================
-- VIEWS FOR ANALYTICS
-- =============================================================================

-- User activity summary view
CREATE OR REPLACE VIEW user_activity_summary AS
SELECT 
    u.id as user_id,
    u.email,
    u.subscription_tier,
    u.created_at as user_created_at,
    COUNT(DISTINCT ae.id) as total_events,
    COUNT(DISTINCT DATE_TRUNC('day', ae.created_at)) as active_days,
    COUNT(DISTINCT ae.event_name) as unique_events,
    MAX(ae.created_at) as last_activity,
    COUNT(CASE WHEN ae.event_name = 'Conversion' THEN 1 END) as conversion_count,
    COUNT(CASE WHEN ae.event_name = 'Feature Engagement' THEN 1 END) as feature_engagements
FROM users u
LEFT JOIN analytics_events ae ON u.id = ae.user_id
WHERE u.status = 'active'
GROUP BY u.id, u.email, u.subscription_tier, u.created_at;

-- AI model performance summary view
CREATE OR REPLACE VIEW ai_model_performance_summary AS
SELECT 
    model_name,
    model_version,
    DATE_TRUNC('day', timestamp) as date,
    COUNT(*) as total_requests,
    COUNT(CASE WHEN success = true THEN 1 END) as successful_requests,
    AVG(latency_ms) as avg_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency_ms,
    SUM(total_tokens) as total_tokens,
    SUM(cost_estimate) as total_cost,
    AVG(confidence_score) as avg_confidence,
    COUNT(DISTINCT user_id) as unique_users
FROM ai_model_requests
GROUP BY model_name, model_version, DATE_TRUNC('day', timestamp);

-- Daily business metrics view
CREATE OR REPLACE VIEW daily_business_metrics AS
SELECT 
    DATE_TRUNC('day', created_at) as date,
    COUNT(DISTINCT CASE WHEN created_at >= DATE_TRUNC('day', created_at) THEN id END) as new_users,
    COUNT(DISTINCT CASE WHEN last_login_at >= DATE_TRUNC('day', created_at) THEN id END) as active_users,
    COUNT(DISTINCT CASE WHEN subscription_tier != 'free' THEN id END) as paying_users,
    COUNT(DISTINCT CASE WHEN created_at >= DATE_TRUNC('day', created_at) AND subscription_tier != 'free' THEN id END) as new_paying_users
FROM users
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date;

-- =============================================================================
-- FUNCTIONS FOR ANALYTICS
-- =============================================================================

-- Function to calculate user engagement score
CREATE OR REPLACE FUNCTION calculate_user_engagement_score(user_uuid UUID, start_date TIMESTAMPTZ, end_date TIMESTAMPTZ)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    total_events INTEGER;
    active_days INTEGER;
    unique_events INTEGER;
    feature_engagements INTEGER;
    engagement_score DECIMAL(5,2);
BEGIN
    SELECT 
        COUNT(*),
        COUNT(DISTINCT DATE_TRUNC('day', created_at)),
        COUNT(DISTINCT event_name),
        COUNT(CASE WHEN event_name = 'Feature Engagement' THEN 1 END)
    INTO total_events, active_days, unique_events, feature_engagements
    FROM analytics_events
    WHERE user_id = user_uuid 
      AND created_at >= start_date 
      AND created_at <= end_date;
    
    -- Calculate weighted engagement score (0-100)
    engagement_score := LEAST(
        (total_events * 0.3) +
        (active_days * 5) +
        (unique_events * 2) +
        (feature_engagements * 1.5),
        100
    );
    
    RETURN ROUND(engagement_score, 2);
END;
$$ LANGUAGE plpgsql;

-- Function to get funnel conversion rates
CREATE OR REPLACE FUNCTION get_funnel_conversion_rates(funnel_name_param VARCHAR, start_date TIMESTAMPTZ, end_date TIMESTAMPTZ)
RETURNS TABLE (
    step_name VARCHAR,
    step_order INTEGER,
    user_count BIGINT,
    conversion_rate DECIMAL(5,4)
) AS $$
BEGIN
    RETURN QUERY
    WITH funnel_users AS (
        SELECT DISTINCT user_id
        FROM funnel_steps
        WHERE funnel_name = funnel_name_param
          AND created_at >= start_date
          AND created_at <= end_date
    ),
    step_counts AS (
        SELECT 
            fs.step_name,
            fs.step_order,
            COUNT(DISTINCT fs.user_id) as users_at_step
        FROM funnel_steps fs
        INNER JOIN funnel_users fu ON fs.user_id = fu.user_id
        WHERE fs.funnel_name = funnel_name_param
          AND fs.created_at >= start_date
          AND fs.created_at <= end_date
        GROUP BY fs.step_name, fs.step_order
    ),
    total_users AS (
        SELECT COUNT(*) as total FROM funnel_users
    )
    SELECT 
        sc.step_name,
        sc.step_order,
        sc.users_at_step,
        CASE 
            WHEN tu.total > 0 THEN sc.users_at_step::DECIMAL / tu.total::DECIMAL
            ELSE 0
        END as conversion_rate
    FROM step_counts sc
    CROSS JOIN total_users tu
    ORDER BY sc.step_order;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS FOR ANALYTICS
-- =============================================================================

-- Trigger to update user segment membership counts
CREATE OR REPLACE FUNCTION update_segment_user_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE user_segments 
        SET user_count = user_count + 1, updated_at = NOW()
        WHERE id = NEW.segment_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE user_segments 
        SET user_count = user_count - 1, updated_at = NOW()
        WHERE id = OLD.segment_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to user segment memberships
DROP TRIGGER IF EXISTS trigger_update_segment_count ON user_segment_memberships;
CREATE TRIGGER trigger_update_segment_count
    AFTER INSERT OR DELETE ON user_segment_memberships
    FOR EACH ROW EXECUTE FUNCTION update_segment_user_count();

-- Trigger to automatically expire old analytics events
CREATE OR REPLACE FUNCTION cleanup_old_analytics_events()
RETURNS VOID AS $$
BEGIN
    -- Delete events older than data retention period
    DELETE FROM analytics_events 
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    -- Log cleanup
    INSERT INTO audit_logs (action, resource_type, new_values, created_at)
    VALUES ('analytics_cleanup', 'analytics_events', 
            jsonb_build_object('deleted_before', NOW() - INTERVAL '1 year'),
            NOW());
End;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- INITIAL SEED DATA
-- =============================================================================

-- Insert default funnel definitions
INSERT INTO funnel_definitions (name, description, steps, time_window_hours, conversion_goal) VALUES
('user_onboarding', 'User onboarding flow from signup to first analysis', 
 '[
    {"name": "Signup", "order": 1, "eventName": "User Registered", "conditions": []},
    {"name": "Email Verification", "order": 2, "eventName": "Email Verified", "conditions": []},
    {"name": "First Login", "order": 3, "eventName": "User Login", "conditions": []},
    {"name": "First Document Upload", "order": 4, "eventName": "Document Uploaded", "conditions": []},
    {"name": "First Analysis", "order": 5, "eventName": "Analysis Completed", "conditions": []}
 ]'::jsonb, 
 168, 'First Analysis'),

('subscription_conversion', 'Free to paid subscription conversion', 
 '[
    {"name": "Trial Started", "order": 1, "eventName": "Trial Started", "conditions": []},
    {"name": "Feature Used", "order": 2, "eventName": "Feature Engagement", "conditions": [{"property": "feature", "operator": "in", "value": ["analysis", "monitoring", "actions"]}]},
    {"name": "Pricing Viewed", "order": 3, "eventName": "Page Viewed", "conditions": [{"property": "page_url", "operator": "contains", "value": "/pricing"}]},
    {"name": "Subscription Selected", "order": 4, "eventName": "Subscription Selected", "conditions": []},
    {"name": "Payment Completed", "order": 5, "eventName": "Conversion", "conditions": [{"property": "conversion_type", "operator": "equals", "value": "subscription"}]}
 ]'::jsonb,
 336, 'Payment Completed')
ON CONFLICT (name) DO NOTHING;

-- Insert default data quality checks
INSERT INTO data_quality_checks (name, description, check_type, table_name, column_name, rules, schedule, enabled) VALUES
('user_email_completeness', 'Check that all users have email addresses', 'completeness', 'users', 'email', 
 '[{"type": "not_null", "threshold": 0.99, "severity": "high"}]'::jsonb, '0 */6 * * *', true),

('analysis_risk_score_validity', 'Check that risk scores are within valid range', 'validity', 'document_analyses', 'overall_risk_score',
 '[{"type": "range", "parameters": {"min": 0, "max": 100}, "threshold": 0.95, "severity": "medium"}]'::jsonb, '0 */2 * * *', true),

('events_recent_activity', 'Check that analytics events are being generated', 'timeliness', 'analytics_events', 'created_at',
 '[{"type": "recency", "parameters": {"max_age_hours": 2}, "threshold": 1.0, "severity": "critical"}]'::jsonb, '*/30 * * * *', true)
ON CONFLICT (name) DO NOTHING;

-- Insert default automated reports
INSERT INTO automated_reports (name, description, report_type, configuration, schedule, recipients) VALUES
('Weekly Executive Summary', 'Weekly executive summary report', 'executive_summary',
 '{
    "timeRange": {"relative": {"amount": 7, "unit": "day"}},
    "metrics": ["user_growth", "revenue", "product_usage", "ai_performance"],
    "format": "pdf",
    "includeCharts": true
 }'::jsonb,
 '0 9 * * MON', '{"analytics@fineprintai.com"}'),

('Daily Operations Report', 'Daily operational metrics report', 'operational',
 '{
    "timeRange": {"relative": {"amount": 1, "unit": "day"}},
    "metrics": ["system_health", "error_rates", "performance", "usage"],
    "format": "html",
    "includeCharts": false
 }'::jsonb,
 '0 8 * * *', '{"ops@fineprintai.com"}')
ON CONFLICT (name) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_user_event_time 
ON analytics_events(user_id, event_name, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_model_requests_model_time 
ON ai_model_requests(model_name, model_version, timestamp DESC);

-- Update table statistics
ANALYZE analytics_events;
ANALYZE ai_model_requests;
ANALYZE funnel_steps;
ANALYZE user_segments;
ANALYZE business_metrics;

-- Grant permissions for analytics service
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO analytics_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO analytics_service;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO analytics_service;

COMMIT;