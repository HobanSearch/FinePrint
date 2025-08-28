-- Fine Print AI - Comprehensive Analytics System Migration
-- 
-- Creates all necessary tables for the complete analytics and performance monitoring system
-- including product analytics, performance tracking, AI insights, and dashboard management

-- =============================================================================
-- PERFORMANCE ANALYTICS TABLES
-- =============================================================================

-- Performance metrics for all platforms
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('web', 'mobile', 'extension', 'api')),
    metric_type VARCHAR(100) NOT NULL,
    value DECIMAL(15,6) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance alerts
CREATE TABLE IF NOT EXISTS performance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(20) NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    threshold DECIMAL(15,6) NOT NULL,
    actual_value DECIMAL(15,6) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    context JSONB,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance regressions
CREATE TABLE IF NOT EXISTS performance_regressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(20) NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    baseline_value DECIMAL(15,6) NOT NULL,
    current_value DECIMAL(15,6) NOT NULL,
    regression_percentage DECIMAL(8,4) NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    affected_users INTEGER DEFAULT 0,
    possible_causes TEXT[],
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- ADVANCED AI ANALYTICS TABLES
-- =============================================================================

-- Document analysis metrics
CREATE TABLE IF NOT EXISTS document_analysis_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID NOT NULL,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('tos', 'privacy', 'eula', 'other')),
    document_size INTEGER NOT NULL,
    analysis_time INTEGER NOT NULL, -- milliseconds
    risk_score DECIMAL(4,2) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 10),
    patterns_found INTEGER NOT NULL DEFAULT 0,
    accuracy DECIMAL(5,4) CHECK (accuracy >= 0 AND accuracy <= 1),
    platform VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI model performance metrics
CREATE TABLE IF NOT EXISTS model_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    inference_time INTEGER NOT NULL, -- milliseconds
    memory_usage BIGINT NOT NULL, -- bytes
    cpu_usage DECIMAL(5,2), -- percentage
    gpu_usage DECIMAL(5,2), -- percentage
    accuracy DECIMAL(5,4) CHECK (accuracy >= 0 AND accuracy <= 1),
    confidence DECIMAL(5,4) CHECK (confidence >= 0 AND confidence <= 1),
    batch_size INTEGER NOT NULL DEFAULT 1,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Predictive analytics events
CREATE TABLE IF NOT EXISTS predictive_analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prediction_type VARCHAR(50) NOT NULL CHECK (prediction_type IN ('churn', 'upsell', 'engagement', 'risk_tolerance')),
    prediction JSONB NOT NULL,
    confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    features JSONB NOT NULL,
    actual_outcome JSONB, -- For model validation
    accuracy_score DECIMAL(5,4), -- When actual outcome is known
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    validated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User behavior patterns
CREATE TABLE IF NOT EXISTS user_behavior_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern VARCHAR(100) NOT NULL,
    frequency INTEGER NOT NULL DEFAULT 1,
    last_occurrence TIMESTAMP WITH TIME ZONE NOT NULL,
    confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Feature adoption metrics
CREATE TABLE IF NOT EXISTS feature_adoption_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_name VARCHAR(100) NOT NULL,
    total_users INTEGER NOT NULL,
    adopted_users INTEGER NOT NULL,
    adoption_rate DECIMAL(5,4) NOT NULL CHECK (adoption_rate >= 0 AND adoption_rate <= 1),
    time_to_adoption INTEGER, -- days
    platform VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cross-platform metrics
CREATE TABLE IF NOT EXISTS cross_platform_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platforms VARCHAR(20)[] NOT NULL,
    primary_platform VARCHAR(20) NOT NULL,
    sync_frequency INTEGER NOT NULL DEFAULT 0, -- times per day
    cross_platform_actions INTEGER NOT NULL DEFAULT 0,
    preferred_features JSONB,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- AI MODEL TRACKING TABLES
-- =============================================================================

-- AI model requests (from existing ai-analytics.ts)
CREATE TABLE IF NOT EXISTS ai_model_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(100),
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL,
    success BOOLEAN NOT NULL DEFAULT true,
    error_type VARCHAR(100),
    confidence_score DECIMAL(5,4),
    cost_estimate DECIMAL(10,6),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI model sessions
CREATE TABLE IF NOT EXISTS ai_model_sessions (
    id VARCHAR(100) PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    request_count INTEGER NOT NULL DEFAULT 0,
    total_tokens BIGINT NOT NULL DEFAULT 0,
    total_cost DECIMAL(12,6) NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI model experiments
CREATE TABLE IF NOT EXISTS ai_model_experiments (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    models JSONB NOT NULL,
    traffic_split JSONB NOT NULL,
    metrics JSONB NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'running', 'paused', 'completed')),
    results JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- DASHBOARD AND MONITORING TABLES
-- =============================================================================

-- Dashboards
CREATE TABLE IF NOT EXISTS dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    widgets JSONB NOT NULL DEFAULT '[]'::jsonb,
    filters JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Monitoring rules
CREATE TABLE IF NOT EXISTS monitoring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    platform VARCHAR(20) NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    condition JSONB NOT NULL,
    threshold DECIMAL(15,6) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    recipients TEXT[] NOT NULL DEFAULT '{}',
    cooldown_period INTEGER NOT NULL DEFAULT 15, -- minutes
    last_triggered TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SLA targets
CREATE TABLE IF NOT EXISTS sla_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    platform VARCHAR(20) NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    target DECIMAL(15,6) NOT NULL,
    tolerance DECIMAL(5,2) NOT NULL, -- percentage
    timeframe VARCHAR(20) NOT NULL CHECK (timeframe IN ('daily', 'weekly', 'monthly')),
    status VARCHAR(20) NOT NULL DEFAULT 'met' CHECK (status IN ('met', 'at_risk', 'violated')),
    current_value DECIMAL(15,6) DEFAULT 0,
    compliance DECIMAL(5,2) DEFAULT 100, -- percentage
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Anomaly detection results
CREATE TABLE IF NOT EXISTS anomaly_detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(20) NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    anomaly_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    expected_value DECIMAL(15,6),
    actual_value DECIMAL(15,6) NOT NULL,
    confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    context JSONB,
    investigated BOOLEAN NOT NULL DEFAULT false,
    resolved BOOLEAN NOT NULL DEFAULT false,
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    investigated_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- EXTENDED ANALYTICS TABLES
-- =============================================================================

-- Funnel steps (enhanced from existing)
CREATE TABLE IF NOT EXISTS funnel_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    funnel_name VARCHAR(100) NOT NULL,
    step_name VARCHAR(100) NOT NULL,
    step_order INTEGER NOT NULL,
    properties JSONB,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, funnel_name, step_name)
);

-- A/B test results
CREATE TABLE IF NOT EXISTS ab_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metric VARCHAR(100) NOT NULL,
    value DECIMAL(15,6) NOT NULL,
    conversion BOOLEAN DEFAULT false,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data quality checks
CREATE TABLE IF NOT EXISTS data_quality_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_name VARCHAR(200) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    column_name VARCHAR(100),
    check_type VARCHAR(50) NOT NULL,
    rules JSONB NOT NULL,
    schedule VARCHAR(100), -- cron expression
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data quality results
CREATE TABLE IF NOT EXISTS data_quality_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id UUID NOT NULL REFERENCES data_quality_checks(id) ON DELETE CASCADE,
    passed BOOLEAN NOT NULL,
    score DECIMAL(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),
    issues JSONB,
    sample_data JSONB,
    run_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Compliance audit logs
CREATE TABLE IF NOT EXISTS compliance_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    details JSONB NOT NULL,
    ip_address INET,
    user_agent TEXT,
    compliance_flags JSONB,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_performance_metrics_platform_type_time 
    ON performance_metrics(platform, metric_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_user_time 
    ON performance_metrics(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_timestamp 
    ON performance_metrics(timestamp DESC);

-- Document analysis metrics indexes
CREATE INDEX IF NOT EXISTS idx_doc_analysis_user_time 
    ON document_analysis_metrics(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_doc_analysis_type_time 
    ON document_analysis_metrics(document_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_doc_analysis_platform_time 
    ON document_analysis_metrics(platform, timestamp DESC);

-- AI model requests indexes
CREATE INDEX IF NOT EXISTS idx_ai_requests_model_time 
    ON ai_model_requests(model_name, model_version, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_requests_user_time 
    ON ai_model_requests(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_requests_session 
    ON ai_model_requests(session_id);

-- Predictive analytics indexes
CREATE INDEX IF NOT EXISTS idx_predictive_user_type_time 
    ON predictive_analytics_events(user_id, prediction_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_predictive_type_time 
    ON predictive_analytics_events(prediction_type, timestamp DESC);

-- User behavior patterns indexes
CREATE INDEX IF NOT EXISTS idx_behavior_user_pattern 
    ON user_behavior_patterns(user_id, pattern);
CREATE INDEX IF NOT EXISTS idx_behavior_pattern_freq 
    ON user_behavior_patterns(pattern, frequency DESC);

-- Performance alerts indexes
CREATE INDEX IF NOT EXISTS idx_perf_alerts_platform_severity 
    ON performance_alerts(platform, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_alerts_unresolved 
    ON performance_alerts(created_at DESC) WHERE resolved_at IS NULL;

-- Monitoring rules indexes
CREATE INDEX IF NOT EXISTS idx_monitoring_platform_enabled 
    ON monitoring_rules(platform, enabled);
CREATE INDEX IF NOT EXISTS idx_monitoring_enabled_updated 
    ON monitoring_rules(enabled, updated_at DESC);

-- Dashboard indexes
CREATE INDEX IF NOT EXISTS idx_dashboards_public_updated 
    ON dashboards(is_public, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboards_created_by 
    ON dashboards(created_by, updated_at DESC);

-- Funnel steps indexes
CREATE INDEX IF NOT EXISTS idx_funnel_user_funnel_order 
    ON funnel_steps(user_id, funnel_name, step_order);
CREATE INDEX IF NOT EXISTS idx_funnel_name_time 
    ON funnel_steps(funnel_name, completed_at DESC);

-- Anomaly detections indexes
CREATE INDEX IF NOT EXISTS idx_anomaly_platform_type_time 
    ON anomaly_detections(platform, metric_type, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_unresolved 
    ON anomaly_detections(detected_at DESC) WHERE resolved = false;

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- Real-time performance summary view
CREATE OR REPLACE VIEW performance_summary_realtime AS
SELECT 
    platform,
    metric_type,
    COUNT(*) as total_metrics,
    AVG(value) as avg_value,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY value) as median_value,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95_value,
    MIN(timestamp) as earliest_metric,
    MAX(timestamp) as latest_metric
FROM performance_metrics 
WHERE timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY platform, metric_type;

-- User engagement summary view
CREATE OR REPLACE VIEW user_engagement_summary AS
SELECT 
    u.id as user_id,
    u.email,
    u.subscription_tier,
    COUNT(DISTINCT DATE(pm.timestamp)) as active_days_last_30,
    COUNT(pm.id) as total_actions_last_30,
    AVG(CASE WHEN dam.risk_score IS NOT NULL THEN dam.risk_score END) as avg_risk_tolerance,
    COUNT(dam.id) as documents_analyzed_last_30,
    MAX(pm.timestamp) as last_activity
FROM users u
LEFT JOIN performance_metrics pm ON u.id = pm.user_id 
    AND pm.timestamp >= NOW() - INTERVAL '30 days'
LEFT JOIN document_analysis_metrics dam ON u.id = dam.user_id 
    AND dam.timestamp >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.email, u.subscription_tier;

-- Platform performance comparison view
CREATE OR REPLACE VIEW platform_performance_comparison AS
SELECT 
    platform,
    DATE_TRUNC('day', timestamp) as day,
    COUNT(*) as daily_metrics,
    AVG(CASE WHEN metric_type LIKE '%response_time%' THEN value END) as avg_response_time,
    AVG(CASE WHEN metric_type LIKE '%error_rate%' THEN value END) as avg_error_rate,
    COUNT(DISTINCT user_id) as unique_users
FROM performance_metrics 
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY platform, DATE_TRUNC('day', timestamp)
ORDER BY platform, day;

-- Document analysis insights view
CREATE OR REPLACE VIEW document_analysis_insights AS
SELECT 
    document_type,
    platform,
    DATE_TRUNC('day', timestamp) as day,
    COUNT(*) as total_analyses,
    AVG(analysis_time) as avg_analysis_time_ms,
    AVG(risk_score) as avg_risk_score,
    AVG(patterns_found) as avg_patterns_found,
    COUNT(DISTINCT user_id) as unique_users
FROM document_analysis_metrics
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY document_type, platform, DATE_TRUNC('day', timestamp)
ORDER BY document_type, platform, day;

-- =============================================================================
-- FUNCTIONS FOR ANALYTICS CALCULATIONS
-- =============================================================================

-- Function to calculate user churn risk
CREATE OR REPLACE FUNCTION calculate_churn_risk(user_uuid UUID)
RETURNS DECIMAL(5,4) AS $$
DECLARE
    days_since_last_activity INTEGER;
    avg_weekly_activity DECIMAL;
    churn_risk DECIMAL(5,4);
BEGIN
    -- Days since last activity
    SELECT EXTRACT(DAYS FROM NOW() - MAX(timestamp))::INTEGER
    INTO days_since_last_activity
    FROM performance_metrics 
    WHERE user_id = user_uuid;
    
    -- Average weekly activity over last 4 weeks
    SELECT AVG(weekly_count)
    INTO avg_weekly_activity
    FROM (
        SELECT COUNT(*) as weekly_count
        FROM performance_metrics 
        WHERE user_id = user_uuid 
            AND timestamp >= NOW() - INTERVAL '4 weeks'
        GROUP BY DATE_TRUNC('week', timestamp)
    ) weekly_activity;
    
    -- Simple churn risk calculation
    churn_risk := CASE 
        WHEN days_since_last_activity > 14 THEN 0.9
        WHEN days_since_last_activity > 7 THEN 0.6
        WHEN avg_weekly_activity < 1 THEN 0.4
        ELSE 0.1
    END;
    
    RETURN churn_risk;
END;
$$ LANGUAGE plpgsql;

-- Function to get platform health score
CREATE OR REPLACE FUNCTION get_platform_health_score(platform_name VARCHAR)
RETURNS DECIMAL(5,4) AS $$
DECLARE
    avg_response_time DECIMAL;
    error_rate DECIMAL;
    health_score DECIMAL(5,4);
BEGIN
    -- Get average response time and error rate for last hour
    SELECT 
        AVG(CASE WHEN metric_type LIKE '%response_time%' THEN value END),
        AVG(CASE WHEN metric_type LIKE '%error_rate%' THEN value END)
    INTO avg_response_time, error_rate
    FROM performance_metrics 
    WHERE platform = platform_name 
        AND timestamp >= NOW() - INTERVAL '1 hour';
    
    -- Calculate health score (simplified)
    health_score := CASE 
        WHEN error_rate > 0.05 THEN 0.3  -- High error rate
        WHEN avg_response_time > 1000 THEN 0.6  -- Slow response
        WHEN avg_response_time > 500 THEN 0.8   -- Moderate response
        ELSE 0.95  -- Good health
    END;
    
    RETURN COALESCE(health_score, 0.5);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS FOR AUTOMATED UPDATES
-- =============================================================================

-- Update user behavior patterns automatically
CREATE OR REPLACE FUNCTION update_user_behavior_patterns()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert or update behavior pattern
    INSERT INTO user_behavior_patterns (
        user_id, 
        pattern, 
        frequency, 
        last_occurrence, 
        confidence,
        context
    ) VALUES (
        NEW.user_id,
        CONCAT(NEW.platform, '_', NEW.metric_type),
        1,
        NEW.timestamp,
        0.5,
        NEW.context
    )
    ON CONFLICT (user_id, pattern) 
    DO UPDATE SET 
        frequency = user_behavior_patterns.frequency + 1,
        last_occurrence = NEW.timestamp,
        confidence = LEAST(user_behavior_patterns.confidence + 0.1, 1.0),
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update behavior patterns on performance metrics insert
CREATE TRIGGER update_behavior_patterns_trigger
    AFTER INSERT ON performance_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_user_behavior_patterns();

-- =============================================================================
-- INITIAL DATA AND CONFIGURATION
-- =============================================================================

-- Insert default monitoring rules
INSERT INTO monitoring_rules (id, name, platform, metric_type, condition, threshold, severity, recipients) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'API Response Time Alert', 'api', 'response_time', '{"operator": "greater_than", "aggregation": "p95", "timeWindow": 300}', 200, 'high', ARRAY['devops@fineprintai.com']),
('550e8400-e29b-41d4-a716-446655440002', 'Error Rate Alert', 'web', 'error_rate', '{"operator": "greater_than", "aggregation": "avg", "timeWindow": 300}', 0.05, 'critical', ARRAY['devops@fineprintai.com']),
('550e8400-e29b-41d4-a716-446655440003', 'Mobile App Start Time', 'mobile', 'app_start_time', '{"operator": "greater_than", "aggregation": "avg", "timeWindow": 600}', 3000, 'medium', ARRAY['mobile-team@fineprintai.com']),
('550e8400-e29b-41d4-a716-446655440004', 'Extension Memory Usage', 'extension', 'background_memory', '{"operator": "greater_than", "aggregation": "avg", "timeWindow": 900}', 100, 'medium', ARRAY['extension-team@fineprintai.com'])
ON CONFLICT (id) DO NOTHING;

-- Insert default SLA targets
INSERT INTO sla_targets (id, name, platform, metric_type, target, tolerance, timeframe) VALUES
('660e8400-e29b-41d4-a716-446655440001', 'API Response Time SLA', 'api', 'response_time_p95', 200, 10, 'daily'),
('660e8400-e29b-41d4-a716-446655440002', 'Web App Availability SLA', 'web', 'uptime', 99.9, 1, 'monthly'),
('660e8400-e29b-41d4-a716-446655440003', 'Document Analysis Speed SLA', 'api', 'document_analysis_time', 5000, 20, 'daily'),
('660e8400-e29b-41d4-a716-446655440004', 'Mobile App Performance SLA', 'mobile', 'app_start_time', 2000, 15, 'weekly')
ON CONFLICT (id) DO NOTHING;

-- Insert default data quality checks
INSERT INTO data_quality_checks (check_name, table_name, check_type, rules, schedule, enabled) VALUES
('Performance Metrics Completeness', 'performance_metrics', 'completeness', '{"required_fields": ["user_id", "platform", "metric_type", "value"], "threshold": 0.95}', '0 0 * * *', true),
('Document Analysis Accuracy Check', 'document_analysis_metrics', 'validity', '{"field": "risk_score", "min": 0, "max": 10}', '0 6 * * *', true),
('User Behavior Pattern Consistency', 'user_behavior_patterns', 'consistency', '{"field": "confidence", "min": 0, "max": 1}', '0 12 * * *', true)
ON CONFLICT DO NOTHING;

-- Create default dashboards (will be handled by the dashboard service)

-- =============================================================================
-- CLEANUP AND MAINTENANCE
-- =============================================================================

-- Create a cleanup function for old analytics data
CREATE OR REPLACE FUNCTION cleanup_old_analytics_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Delete performance metrics older than 90 days
    DELETE FROM performance_metrics 
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete resolved alerts older than 30 days
    DELETE FROM performance_alerts 
    WHERE resolved_at IS NOT NULL 
        AND resolved_at < NOW() - INTERVAL '30 days';
    
    -- Delete old model requests older than 60 days
    DELETE FROM ai_model_requests 
    WHERE created_at < NOW() - INTERVAL '60 days';
    
    -- Archive old document analysis metrics (move to archive table if needed)
    -- For now, just keep them as they're valuable for long-term analysis
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup to run daily (would be set up in cron or scheduler)
-- This is just a placeholder comment for the actual implementation

COMMIT;

-- Add helpful comments
COMMENT ON TABLE performance_metrics IS 'Real-time performance metrics from all Fine Print AI platforms';
COMMENT ON TABLE document_analysis_metrics IS 'Detailed metrics for each document analysis performed';
COMMENT ON TABLE predictive_analytics_events IS 'Machine learning predictions and their validation results';
COMMENT ON TABLE user_behavior_patterns IS 'Identified patterns in user behavior across platforms';
COMMENT ON TABLE monitoring_rules IS 'Automated monitoring rules for system health and performance';
COMMENT ON TABLE sla_targets IS 'Service Level Agreement targets and compliance tracking';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Fine Print AI Comprehensive Analytics System migration completed successfully!';
    RAISE NOTICE 'Created % tables with indexes, views, functions, and triggers', 
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%performance%' OR table_name LIKE '%analytics%' OR table_name LIKE '%dashboard%' OR table_name LIKE '%monitoring%');
END $$;