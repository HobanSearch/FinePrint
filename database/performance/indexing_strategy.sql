-- Fine Print AI - Advanced Indexing Strategy
-- Performance optimization for millions of users
-- Designed for high-frequency queries and analytics

\echo 'Implementing advanced indexing strategy for Fine Print AI...'

-- =============================================================================
-- COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- =============================================================================

-- User authentication and session management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_status_tier 
ON users(email, status, subscription_tier) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_user_expires 
ON user_sessions(user_id, expires_at DESC) 
WHERE expires_at > NOW();

-- Document analysis workflow optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_user_type_monitoring 
ON documents(user_id, document_type, monitoring_enabled, created_at DESC) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_team_type_created 
ON documents(team_id, document_type, created_at DESC) 
WHERE team_id IS NOT NULL AND deleted_at IS NULL;

-- High-frequency analysis queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analyses_user_status_created 
ON document_analyses(user_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analyses_document_version_status 
ON document_analyses(document_id, version DESC, status) 
WHERE status IN ('completed', 'failed');

-- Finding analysis and reporting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_findings_analysis_severity_category 
ON analysis_findings(analysis_id, severity, category);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_findings_pattern_severity_created 
ON analysis_findings(pattern_id, severity, created_at DESC) 
WHERE pattern_id IS NOT NULL;

-- =============================================================================
-- PARTIAL INDEXES FOR SPECIFIC CONDITIONS
-- =============================================================================

-- Active monitoring documents only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_monitoring_next_check 
ON documents(next_monitor_at ASC, monitoring_frequency) 
WHERE monitoring_enabled = TRUE AND deleted_at IS NULL;

-- Failed analyses for retry processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analyses_failed_retry 
ON document_analyses(started_at, error_message) 
WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours';

-- Expired analyses for cleanup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analyses_expired_cleanup 
ON document_analyses(expires_at) 
WHERE expires_at < NOW() AND status != 'expired';

-- Unread notifications
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread 
ON notifications(user_id, created_at DESC) 
WHERE read_at IS NULL;

-- Active API keys
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_active_usage 
ON api_keys(user_id, usage_count, last_used_at DESC) 
WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW());

-- =============================================================================
-- FULL-TEXT SEARCH INDEXES
-- =============================================================================

-- Document title and description search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_title_search 
ON documents USING gin(to_tsvector('english', title));

-- Pattern library search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patterns_content_search 
ON pattern_library USING gin(
    to_tsvector('english', name || ' ' || description || ' ' || COALESCE(explanation, ''))
) WHERE is_active = TRUE;

-- Action template search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_templates_content_search 
ON action_templates USING gin(
    to_tsvector('english', name || ' ' || COALESCE(description, ''))
) WHERE is_active = TRUE;

-- Finding analysis search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_findings_text_search 
ON analysis_findings USING gin(
    to_tsvector('english', title || ' ' || description || ' ' || COALESCE(recommendation, ''))
);

-- =============================================================================
-- ARRAY AND JSONB INDEXES
-- =============================================================================

-- Pattern keywords search (GIN index for array operations)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patterns_keywords_gin 
ON pattern_library USING gin(pattern_keywords) 
WHERE is_active = TRUE;

-- User preferences search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_preferences_gin 
ON users USING gin(preferences) 
WHERE status = 'active';

-- Document source info search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_source_info_gin 
ON documents USING gin(source_info) 
WHERE source_info IS NOT NULL;

-- Analysis metadata search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analyses_metadata_gin 
ON document_analyses USING gin(analysis_metadata) 
WHERE analysis_metadata IS NOT NULL;

-- =============================================================================
-- TEMPORAL INDEXES FOR TIME-SERIES DATA
-- =============================================================================

-- API usage time-series analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_usage_time_series 
ON api_usage(created_at DESC, endpoint, status_code);

-- System metrics time-series
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_time_series 
ON system_metrics(metric_name, timestamp DESC, metric_value);

-- Document change tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_changes_time_series 
ON document_changes(document_id, detected_at DESC, change_type);

-- Audit log time-series with partitioning support
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_time_series 
ON audit_logs(created_at DESC, action, user_id);

-- =============================================================================
-- ANALYTICS AND REPORTING INDEXES
-- =============================================================================

-- Usage analytics aggregation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_analytics_date_tier 
ON usage_analytics(date DESC, subscription_tier);

-- User activity analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_activity_analysis 
ON users(subscription_tier, last_login_at DESC, login_count) 
WHERE status = 'active';

-- Document type analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_type_analytics 
ON documents(document_type, created_at DESC, user_id) 
WHERE deleted_at IS NULL;

-- Risk score distribution analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analyses_risk_distribution 
ON document_analyses(overall_risk_score, completed_at DESC) 
WHERE status = 'completed' AND overall_risk_score IS NOT NULL;

-- =============================================================================
-- MULTI-TENANT INDEXES
-- =============================================================================

-- Team-based document access
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_team_user_access 
ON documents(team_id, user_id, created_at DESC) 
WHERE team_id IS NOT NULL AND deleted_at IS NULL;

-- Team member permissions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_members_permissions 
ON team_members(team_id, role, joined_at DESC);

-- Team API key management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_team_management 
ON api_keys(team_id, is_active, created_at DESC) 
WHERE team_id IS NOT NULL;

-- =============================================================================
-- COVERING INDEXES FOR FREQUENT SELECT QUERIES
-- =============================================================================

-- User dashboard covering index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_dashboard_covering 
ON users(id, subscription_tier, status) 
INCLUDE (email, display_name, created_at) 
WHERE status = 'active' AND deleted_at IS NULL;

-- Document summary covering index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_summary_covering 
ON documents(id, user_id, document_type) 
INCLUDE (title, url, monitoring_enabled, created_at) 
WHERE deleted_at IS NULL;

-- Analysis results covering index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analyses_results_covering 
ON document_analyses(document_id, version, status) 
INCLUDE (overall_risk_score, completed_at, executive_summary) 
WHERE status = 'completed';

-- =============================================================================
-- EXPRESSION INDEXES FOR CALCULATED VALUES
-- =============================================================================

-- Document age calculation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_age_days 
ON documents((EXTRACT(EPOCH FROM (NOW() - created_at))/86400)) 
WHERE deleted_at IS NULL;

-- User account age
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_account_age 
ON users((EXTRACT(EPOCH FROM (NOW() - created_at))/86400)) 
WHERE status = 'active';

-- Analysis processing time efficiency
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analyses_processing_efficiency 
ON document_analyses((processing_time_ms / GREATEST(1, content_length))) 
WHERE status = 'completed' AND processing_time_ms IS NOT NULL;

-- =============================================================================
-- SPECIALIZED INDEXES FOR COMPLIANCE
-- =============================================================================

-- GDPR data subject requests
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gdpr_data_requests 
ON data_export_requests(user_id, status, requested_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gdpr_deletion_requests 
ON data_deletion_requests(user_id, status, created_at DESC);

-- Audit trail for compliance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_compliance 
ON audit_logs(user_id, action, created_at DESC) 
WHERE action LIKE '%_users' OR action LIKE '%_documents';

-- Data processing records
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_data_processing_compliance 
ON data_processing_records(user_id, processing_type, created_at DESC);

-- =============================================================================
-- MAINTENANCE INDEXES
-- =============================================================================

-- Cleanup expired data
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cleanup_expired_sessions 
ON user_sessions(expires_at) 
WHERE expires_at < NOW();

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cleanup_expired_notifications 
ON notifications(expires_at) 
WHERE expires_at IS NOT NULL AND expires_at < NOW();

-- Monitor index usage and bloat
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maintenance_large_tables 
ON pg_stat_user_tables(schemaname, relname, n_tup_ins, n_tup_upd, n_tup_del);

-- =============================================================================
-- INDEX MONITORING QUERIES
-- =============================================================================

-- Create view to monitor index usage
CREATE OR REPLACE VIEW index_usage_stats AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan,
    CASE 
        WHEN idx_scan = 0 THEN 'UNUSED'
        WHEN idx_scan < 100 THEN 'LOW_USAGE'
        WHEN idx_scan < 1000 THEN 'MODERATE_USAGE'
        ELSE 'HIGH_USAGE'
    END as usage_category,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Create view to monitor table statistics
CREATE OR REPLACE VIEW table_maintenance_stats AS
SELECT 
    schemaname,
    relname as table_name,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    CASE 
        WHEN n_live_tup > 0 
        THEN ROUND((n_dead_tup::float / n_live_tup::float) * 100, 2)
        ELSE 0 
    END as dead_tuple_percent,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze,
    pg_size_pretty(pg_total_relation_size(oid)) as total_size
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY dead_tuple_percent DESC;

\echo 'Advanced indexing strategy implemented successfully!'

-- =============================================================================
-- MAINTENANCE PROCEDURES
-- =============================================================================

-- Function to analyze index effectiveness
CREATE OR REPLACE FUNCTION analyze_index_effectiveness(
    min_scans INTEGER DEFAULT 100,
    min_size_mb INTEGER DEFAULT 10
)
RETURNS TABLE(
    index_name TEXT,
    table_name TEXT,
    scans BIGINT,
    size_mb NUMERIC,
    recommendation TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.indexname::TEXT,
        i.tablename::TEXT,
        i.idx_scan,
        ROUND(pg_relation_size(i.indexrelid) / (1024.0 * 1024.0), 2) as size_mb,
        CASE 
            WHEN i.idx_scan = 0 AND pg_relation_size(i.indexrelid) > min_size_mb * 1024 * 1024 
            THEN 'CONSIDER DROPPING - Never used and large'
            WHEN i.idx_scan < min_scans AND pg_relation_size(i.indexrelid) > min_size_mb * 1024 * 1024 
            THEN 'REVIEW USAGE - Low usage for size'
            WHEN i.idx_scan > 10000 
            THEN 'WELL USED - Keep and monitor'
            ELSE 'MONITOR - Normal usage'
        END::TEXT
    FROM pg_stat_user_indexes i
    WHERE i.schemaname = 'public'
    ORDER BY i.idx_scan ASC, pg_relation_size(i.indexrelid) DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to recommend missing indexes based on slow queries
CREATE OR REPLACE FUNCTION recommend_missing_indexes()
RETURNS TABLE(
    query_text TEXT,
    calls BIGINT,
    avg_time_ms NUMERIC,
    recommendation TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.query,
        s.calls,
        ROUND((s.total_time / s.calls)::NUMERIC, 2) as avg_time_ms,
        'Consider adding index based on WHERE clauses and JOIN conditions'::TEXT
    FROM pg_stat_statements s
    WHERE s.calls > 100 
    AND (s.total_time / s.calls) > 100  -- Queries taking more than 100ms on average
    AND s.query ILIKE '%WHERE%'
    ORDER BY (s.total_time / s.calls) DESC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql;

\echo 'Index monitoring and maintenance procedures created successfully!'

-- Record performance optimization completion
INSERT INTO system_metrics (metric_name, metric_value, tags) VALUES
('indexes_created', (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'), '{"category": "performance", "type": "indexing"}'),
('index_strategy_version', 1.0, '{"component": "database", "optimization": "indexing"}');

\echo 'Indexing strategy implementation completed successfully!'