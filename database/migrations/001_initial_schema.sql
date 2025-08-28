-- Migration: 001_initial_schema.sql
-- Description: Initial database schema setup for Fine Print AI
-- Date: 2024-01-01
-- Author: Database Architect

-- This is the foundational migration that creates the complete database schema
-- All tables, indexes, functions, triggers, and initial data

\echo 'Creating initial Fine Print AI database schema...'

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

\echo 'Extensions created successfully'

-- Create enum types
CREATE TYPE subscription_tier AS ENUM ('free', 'starter', 'professional', 'team', 'enterprise');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted');
CREATE TYPE analysis_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'expired');
CREATE TYPE document_type AS ENUM ('terms_of_service', 'privacy_policy', 'eula', 'cookie_policy', 'data_processing_agreement', 'service_agreement', 'other');
CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE action_status AS ENUM ('draft', 'sent', 'delivered', 'responded', 'completed', 'failed');
CREATE TYPE notification_type AS ENUM ('analysis_complete', 'document_changed', 'subscription_update', 'action_required', 'system_alert');
CREATE TYPE alert_type AS ENUM ('document_change', 'new_risk', 'subscription_expiry', 'system_maintenance');
CREATE TYPE integration_type AS ENUM ('webhook', 'email', 'slack', 'teams', 'api');

\echo 'Enum types created successfully'

-- =============================================================================
-- CORE USER MANAGEMENT
-- =============================================================================

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255),
    display_name VARCHAR(100),
    avatar_url TEXT,
    timezone VARCHAR(50) DEFAULT 'UTC',
    language VARCHAR(10) DEFAULT 'en',
    subscription_tier subscription_tier DEFAULT 'free',
    subscription_id VARCHAR(255),
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    status user_status DEFAULT 'active',
    privacy_settings JSONB DEFAULT '{}',
    preferences JSONB DEFAULT '{}',
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- User sessions
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE,
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Teams
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    subscription_tier subscription_tier DEFAULT 'team',
    subscription_id VARCHAR(255),
    max_members INTEGER DEFAULT 5,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Team memberships
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',
    permissions JSONB DEFAULT '{}',
    invited_by UUID REFERENCES users(id),
    invited_at TIMESTAMP WITH TIME ZONE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

\echo 'User management tables created successfully'

-- =============================================================================
-- DOCUMENT ANALYSIS SYSTEM
-- =============================================================================

-- Documents metadata
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    url TEXT,
    document_type document_type NOT NULL,
    document_hash VARCHAR(64) UNIQUE NOT NULL,
    content_length INTEGER,
    language VARCHAR(10) DEFAULT 'en',
    source_info JSONB,
    monitoring_enabled BOOLEAN DEFAULT FALSE,
    monitoring_frequency INTEGER DEFAULT 86400,
    last_monitored_at TIMESTAMP WITH TIME ZONE,
    next_monitor_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Document analyses
CREATE TABLE document_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    status analysis_status DEFAULT 'pending',
    overall_risk_score INTEGER CHECK (overall_risk_score >= 0 AND overall_risk_score <= 100),
    processing_time_ms INTEGER,
    model_used VARCHAR(50),
    model_version VARCHAR(20),
    analysis_metadata JSONB,
    executive_summary TEXT,
    key_findings TEXT[],
    recommendations TEXT[],
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(document_id, version)
);

-- Pattern library
CREATE TABLE pattern_library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    pattern_regex TEXT,
    pattern_keywords TEXT[],
    severity severity_level NOT NULL,
    explanation TEXT,
    recommendation TEXT,
    legal_context TEXT,
    examples TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    is_custom BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analysis findings
CREATE TABLE analysis_findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id UUID NOT NULL REFERENCES document_analyses(id) ON DELETE CASCADE,
    pattern_id UUID REFERENCES pattern_library(id),
    category VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    severity severity_level NOT NULL,
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    text_excerpt TEXT,
    position_start INTEGER,
    position_end INTEGER,
    recommendation TEXT,
    impact_explanation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document changes
CREATE TABLE document_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    old_hash VARCHAR(64) NOT NULL,
    new_hash VARCHAR(64) NOT NULL,
    change_type VARCHAR(20) NOT NULL,
    change_summary TEXT,
    significant_changes TEXT[],
    risk_change INTEGER,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    analysis_triggered BOOLEAN DEFAULT FALSE
);

\echo 'Document analysis tables created successfully'

-- =============================================================================
-- ACTION CENTER & TEMPLATES
-- =============================================================================

-- Action templates
CREATE TABLE action_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    template_content TEXT NOT NULL,
    variables JSONB,
    legal_basis TEXT,
    applicable_regions TEXT[],
    success_rate DECIMAL(3,2),
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User actions
CREATE TABLE user_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    template_id UUID REFERENCES action_templates(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    recipient_email VARCHAR(255),
    recipient_company VARCHAR(100),
    generated_content TEXT NOT NULL,
    status action_status DEFAULT 'draft',
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    response_received_at TIMESTAMP WITH TIME ZONE,
    response_content TEXT,
    follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_date DATE,
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

\echo 'Action center tables created successfully'

-- =============================================================================
-- NOTIFICATIONS & ALERTS
-- =============================================================================

-- Notification preferences
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_enabled BOOLEAN DEFAULT TRUE,
    browser_enabled BOOLEAN DEFAULT TRUE,
    webhook_enabled BOOLEAN DEFAULT FALSE,
    webhook_url TEXT,
    analysis_complete BOOLEAN DEFAULT TRUE,
    document_changes BOOLEAN DEFAULT TRUE,
    high_risk_findings BOOLEAN DEFAULT TRUE,
    weekly_summary BOOLEAN DEFAULT TRUE,
    marketing_emails BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    read_at TIMESTAMP WITH TIME ZONE,
    action_url TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alerts
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    type alert_type NOT NULL,
    severity severity_level NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    data JSONB,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

\echo 'Notification tables created successfully'

-- =============================================================================
-- API & INTEGRATIONS
-- =============================================================================

-- API keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    permissions JSONB DEFAULT '{}',
    rate_limit INTEGER DEFAULT 1000,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API usage tracking
CREATE TABLE api_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint VARCHAR(100) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    request_size INTEGER,
    response_size INTEGER,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Integrations
CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    type integration_type NOT NULL,
    name VARCHAR(100) NOT NULL,
    configuration JSONB NOT NULL,
    credentials_encrypted TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

\echo 'API and integration tables created successfully'

-- =============================================================================
-- ANALYTICS & REPORTING
-- =============================================================================

-- Usage analytics
CREATE TABLE usage_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    subscription_tier subscription_tier,
    total_users INTEGER DEFAULT 0,
    total_analyses INTEGER DEFAULT 0,
    total_documents INTEGER DEFAULT 0,
    avg_risk_score DECIMAL(5,2),
    top_document_types JSONB,
    top_finding_categories JSONB,
    performance_metrics JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(date, subscription_tier)
);

-- System metrics
CREATE TABLE system_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(10,2) NOT NULL,
    tags JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

\echo 'Analytics tables created successfully'

-- =============================================================================
-- COMPLIANCE & AUDIT
-- =============================================================================

-- Data processing records
CREATE TABLE data_processing_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    processing_type VARCHAR(50) NOT NULL,
    legal_basis VARCHAR(50) NOT NULL,
    data_categories TEXT[],
    retention_period INTERVAL,
    third_parties TEXT[],
    cross_border_transfers BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data export requests
CREATE TABLE data_export_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_type VARCHAR(20) DEFAULT 'gdpr_export',
    status VARCHAR(20) DEFAULT 'pending',
    file_path TEXT,
    file_size INTEGER,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Data deletion requests
CREATE TABLE data_deletion_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_type VARCHAR(20) DEFAULT 'gdpr_deletion',
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    verification_token VARCHAR(255),
    verified_at TIMESTAMP WITH TIME ZONE,
    scheduled_for TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

\echo 'Compliance and audit tables created successfully'

-- Create indexes (done in next step to ensure all tables exist)
\echo 'Creating indexes for performance optimization...'

-- User indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status) WHERE status != 'deleted';
CREATE INDEX idx_users_subscription ON users(subscription_tier);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Session indexes
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

-- Document indexes
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_team_id ON documents(team_id);
CREATE INDEX idx_documents_hash ON documents(document_hash);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_monitoring ON documents(monitoring_enabled, next_monitor_at) WHERE monitoring_enabled = TRUE;
CREATE INDEX idx_documents_created_at ON documents(created_at);

-- Analysis indexes
CREATE INDEX idx_analyses_document_id ON document_analyses(document_id);
CREATE INDEX idx_analyses_user_id ON document_analyses(user_id);
CREATE INDEX idx_analyses_status ON document_analyses(status);
CREATE INDEX idx_analyses_created_at ON document_analyses(created_at);
CREATE INDEX idx_analyses_expires_at ON document_analyses(expires_at);

-- Finding indexes
CREATE INDEX idx_findings_analysis_id ON analysis_findings(analysis_id);
CREATE INDEX idx_findings_pattern_id ON analysis_findings(pattern_id);
CREATE INDEX idx_findings_severity ON analysis_findings(severity);
CREATE INDEX idx_findings_category ON analysis_findings(category);

-- Pattern indexes
CREATE INDEX idx_patterns_category ON pattern_library(category);
CREATE INDEX idx_patterns_severity ON pattern_library(severity);
CREATE INDEX idx_patterns_active ON pattern_library(is_active) WHERE is_active = TRUE;

-- Action indexes
CREATE INDEX idx_actions_user_id ON user_actions(user_id);
CREATE INDEX idx_actions_status ON user_actions(status);
CREATE INDEX idx_actions_template_id ON user_actions(template_id);
CREATE INDEX idx_actions_created_at ON user_actions(created_at);

-- Notification indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read_at);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- API usage indexes
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_usage_key_id ON api_usage(api_key_id);
CREATE INDEX idx_api_usage_created_at ON api_usage(created_at);

-- Analytics indexes
CREATE INDEX idx_usage_analytics_date ON usage_analytics(date);
CREATE INDEX idx_system_metrics_name_time ON system_metrics(metric_name, timestamp);

-- Audit indexes
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

\echo 'All indexes created successfully'

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

\echo 'Creating functions and triggers...'

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_patterns_updated_at BEFORE UPDATE ON pattern_library FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON action_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_actions_updated_at BEFORE UPDATE ON user_actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically set next monitoring time
CREATE OR REPLACE FUNCTION set_next_monitor_time()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.monitoring_enabled = TRUE AND (OLD IS NULL OR OLD.monitoring_enabled = FALSE OR OLD.monitoring_frequency != NEW.monitoring_frequency) THEN
        NEW.next_monitor_at = NOW() + (NEW.monitoring_frequency || ' seconds')::INTERVAL;
    ELSIF NEW.monitoring_enabled = FALSE THEN
        NEW.next_monitor_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_document_monitor_time BEFORE INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION set_next_monitor_time();

-- Function to create audit log entries
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    user_id_val UUID;
    action_val VARCHAR(100);
BEGIN
    user_id_val := COALESCE(NEW.user_id, OLD.user_id);
    
    IF TG_OP = 'INSERT' THEN
        action_val := 'INSERT_' || TG_TABLE_NAME;
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values)
        VALUES (user_id_val, action_val, TG_TABLE_NAME, NEW.id, row_to_json(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        action_val := 'UPDATE_' || TG_TABLE_NAME;
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values)
        VALUES (user_id_val, action_val, TG_TABLE_NAME, NEW.id, row_to_json(OLD), row_to_json(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        action_val := 'DELETE_' || TG_TABLE_NAME;
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values)
        VALUES (user_id_val, action_val, TG_TABLE_NAME, OLD.id, row_to_json(OLD));
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Apply audit triggers to sensitive tables
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_documents AFTER INSERT OR UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION create_audit_log();
CREATE TRIGGER audit_user_actions AFTER INSERT OR UPDATE OR DELETE ON user_actions FOR EACH ROW EXECUTE FUNCTION create_audit_log();

\echo 'Functions and triggers created successfully'

-- =============================================================================
-- VIEWS
-- =============================================================================

\echo 'Creating views...'

-- User dashboard view
CREATE VIEW user_dashboard AS
SELECT 
    u.id,
    u.email,
    u.display_name,
    u.subscription_tier,
    COUNT(d.id) as total_documents,
    COUNT(da.id) as total_analyses,
    AVG(da.overall_risk_score) as avg_risk_score,
    COUNT(CASE WHEN d.monitoring_enabled THEN 1 END) as monitored_documents,
    COUNT(ua.id) as total_actions,
    MAX(da.completed_at) as last_analysis_at
FROM users u
LEFT JOIN documents d ON u.id = d.user_id AND d.deleted_at IS NULL
LEFT JOIN document_analyses da ON da.user_id = u.id AND da.status = 'completed'
LEFT JOIN user_actions ua ON ua.user_id = u.id
WHERE u.status = 'active' AND u.deleted_at IS NULL
GROUP BY u.id, u.email, u.display_name, u.subscription_tier;

-- Document summary view
CREATE VIEW document_summary AS
SELECT 
    d.id,
    d.title,
    d.document_type,
    d.url,
    d.monitoring_enabled,
    da.overall_risk_score,
    da.completed_at as last_analyzed_at,
    COUNT(af.id) as total_findings,
    COUNT(CASE WHEN af.severity = 'critical' THEN 1 END) as critical_findings,
    COUNT(CASE WHEN af.severity = 'high' THEN 1 END) as high_findings
FROM documents d
LEFT JOIN document_analyses da ON d.id = da.document_id AND da.version = (
    SELECT MAX(version) FROM document_analyses WHERE document_id = d.id AND status = 'completed'
)
LEFT JOIN analysis_findings af ON da.id = af.analysis_id
WHERE d.deleted_at IS NULL
GROUP BY d.id, d.title, d.document_type, d.url, d.monitoring_enabled, da.overall_risk_score, da.completed_at;

\echo 'Views created successfully'

-- =============================================================================
-- SECURITY SETUP
-- =============================================================================

\echo 'Setting up security...'

-- Create application roles
CREATE ROLE fineprintai_app;
CREATE ROLE fineprintai_worker;
CREATE ROLE fineprintai_readonly;

-- Grant permissions to application role
GRANT CONNECT ON DATABASE fineprintai TO fineprintai_app;
GRANT USAGE ON SCHEMA public TO fineprintai_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fineprintai_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fineprintai_app;

-- Grant permissions to worker role
GRANT CONNECT ON DATABASE fineprintai TO fineprintai_worker;
GRANT USAGE ON SCHEMA public TO fineprintai_worker;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO fineprintai_worker;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fineprintai_worker;

-- Grant read-only permissions
GRANT CONNECT ON DATABASE fineprintai TO fineprintai_readonly;
GRANT USAGE ON SCHEMA public TO fineprintai_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO fineprintai_readonly;

-- Set default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO fineprintai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO fineprintai_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO fineprintai_readonly;

\echo 'Security setup completed successfully'

-- Record migration completion
INSERT INTO schema_migrations (version, applied_at) VALUES ('001', NOW()) ON CONFLICT DO NOTHING;

\echo 'Migration 001_initial_schema.sql completed successfully!'