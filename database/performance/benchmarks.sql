-- Fine Print AI - Performance Benchmarks & Optimization Queries
-- Comprehensive performance testing and optimization suite

\echo 'Setting up performance benchmarks for Fine Print AI...'

-- =============================================================================
-- BENCHMARK QUERIES FOR COMMON USER OPERATIONS
-- =============================================================================

-- Create performance test results table
CREATE TABLE IF NOT EXISTS performance_benchmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_name VARCHAR(100) NOT NULL,
    query_description TEXT NOT NULL,
    execution_time_ms DECIMAL(10,3) NOT NULL,
    rows_examined BIGINT,
    rows_returned BIGINT,
    index_used BOOLEAN DEFAULT TRUE,
    cpu_usage_percent DECIMAL(5,2),
    memory_usage_mb DECIMAL(10,2),
    query_plan_hash VARCHAR(64),
    test_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    database_size_mb DECIMAL(10,2),
    concurrent_connections INTEGER DEFAULT 1,
    test_parameters JSONB DEFAULT '{}'
);

-- Index for benchmark tracking
CREATE INDEX IF NOT EXISTS idx_benchmarks_test_timestamp ON performance_benchmarks(test_name, test_timestamp DESC);

-- =============================================================================
-- BENCHMARK TEST SUITE
-- =============================================================================

-- Function to run and record benchmark tests
CREATE OR REPLACE FUNCTION run_benchmark_test(
    test_name_param VARCHAR(100),
    test_query TEXT,
    test_description TEXT DEFAULT NULL,
    iterations INTEGER DEFAULT 5
)
RETURNS TABLE(
    avg_time_ms DECIMAL(10,3),
    min_time_ms DECIMAL(10,3),
    max_time_ms DECIMAL(10,3),
    std_dev_ms DECIMAL(10,3)
) AS $$
DECLARE
    start_time TIMESTAMP WITH TIME ZONE;
    end_time TIMESTAMP WITH TIME ZONE;
    execution_time DECIMAL(10,3);
    i INTEGER;
    times DECIMAL(10,3)[];
    avg_time DECIMAL(10,3);
    min_time DECIMAL(10,3);
    max_time DECIMAL(10,3);
    std_dev DECIMAL(10,3);
BEGIN
    -- Warm up query cache
    EXECUTE test_query;
    
    -- Run benchmark iterations
    FOR i IN 1..iterations LOOP
        start_time := clock_timestamp();
        EXECUTE test_query;
        end_time := clock_timestamp();
        
        execution_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
        times := array_append(times, execution_time);
        
        -- Record individual test result
        INSERT INTO performance_benchmarks (
            test_name, query_description, execution_time_ms, test_timestamp
        ) VALUES (
            test_name_param, COALESCE(test_description, test_query), execution_time, NOW()
        );
    END LOOP;
    
    -- Calculate statistics
    SELECT 
        AVG(t), MIN(t), MAX(t), STDDEV(t)
    INTO avg_time, min_time, max_time, std_dev
    FROM unnest(times) AS t;
    
    RETURN QUERY SELECT avg_time, min_time, max_time, std_dev;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- USER AUTHENTICATION BENCHMARKS
-- =============================================================================

\echo 'Running user authentication benchmarks...'

-- Test 1: User login by email
SELECT run_benchmark_test(
    'user_login_by_email',
    'SELECT id, email, password_hash, subscription_tier FROM users WHERE email = ''john.doe@example.com'' AND status = ''active''',
    'User authentication lookup by email address'
);

-- Test 2: Session validation
SELECT run_benchmark_test(
    'session_validation',
    'SELECT us.*, u.id as user_id, u.status FROM user_sessions us JOIN users u ON us.user_id = u.id WHERE us.session_token = ''sample_token'' AND us.expires_at > NOW()',
    'Session token validation with user status check'
);

-- Test 3: User dashboard data loading
SELECT run_benchmark_test(
    'user_dashboard_load',
    'SELECT * FROM user_dashboard WHERE id = ''550e8400-e29b-41d4-a716-446655440001''',
    'Complete user dashboard view loading'
);

-- =============================================================================
-- DOCUMENT ANALYSIS BENCHMARKS
-- =============================================================================

\echo 'Running document analysis benchmarks...'

-- Test 4: Document list for user
SELECT run_benchmark_test(
    'user_documents_list',
    'SELECT d.*, da.overall_risk_score, da.completed_at FROM documents d LEFT JOIN document_analyses da ON d.id = da.document_id AND da.version = (SELECT MAX(version) FROM document_analyses WHERE document_id = d.id) WHERE d.user_id = ''550e8400-e29b-41d4-a716-446655440001'' AND d.deleted_at IS NULL ORDER BY d.created_at DESC LIMIT 20',
    'User document list with latest analysis data'
);

-- Test 5: Document analysis with findings
SELECT run_benchmark_test(
    'document_analysis_full',
    'SELECT da.*, array_agg(af.*) as findings FROM document_analyses da LEFT JOIN analysis_findings af ON da.id = af.analysis_id WHERE da.document_id = ''770e8400-e29b-41d4-a716-446655440001'' AND da.status = ''completed'' GROUP BY da.id ORDER BY da.version DESC LIMIT 1',
    'Complete document analysis with all findings'
);

-- Test 6: Pattern matching query
SELECT run_benchmark_test(
    'pattern_matching',
    'SELECT pl.*, COUNT(af.id) as usage_count FROM pattern_library pl LEFT JOIN analysis_findings af ON pl.id = af.pattern_id WHERE pl.is_active = true AND pl.category = ''data_collection'' GROUP BY pl.id ORDER BY usage_count DESC LIMIT 10',
    'Pattern library search with usage statistics'
);

-- =============================================================================
-- SEARCH AND FILTERING BENCHMARKS
-- =============================================================================

\echo 'Running search and filtering benchmarks...'

-- Test 7: Multi-filter document search
SELECT run_benchmark_test(
    'document_multi_filter',
    'SELECT d.*, da.overall_risk_score FROM documents d LEFT JOIN document_analyses da ON d.id = da.document_id WHERE d.document_type IN (''terms_of_service'', ''privacy_policy'') AND d.monitoring_enabled = true AND da.overall_risk_score > 70 AND d.created_at > NOW() - INTERVAL ''90 days'' ORDER BY da.overall_risk_score DESC LIMIT 50',
    'Complex multi-criteria document filtering'
);

-- Test 8: Full-text search on document titles
SELECT run_benchmark_test(
    'document_fulltext_search',
    'SELECT d.*, ts_rank(to_tsvector(''english'', d.title), plainto_tsquery(''english'', ''privacy policy'')) as rank FROM documents d WHERE to_tsvector(''english'', d.title) @@ plainto_tsquery(''english'', ''privacy policy'') ORDER BY rank DESC LIMIT 20',
    'Full-text search on document titles'
);

-- Test 9: Risk score aggregation
SELECT run_benchmark_test(
    'risk_score_aggregation',
    'SELECT document_type, AVG(overall_risk_score) as avg_risk, COUNT(*) as doc_count, MIN(overall_risk_score) as min_risk, MAX(overall_risk_score) as max_risk FROM document_analyses da JOIN documents d ON da.document_id = d.id WHERE da.status = ''completed'' AND da.completed_at > NOW() - INTERVAL ''30 days'' GROUP BY document_type ORDER BY avg_risk DESC',
    'Risk score aggregation by document type'
);

-- =============================================================================
-- TEAM AND COLLABORATION BENCHMARKS
-- =============================================================================

\echo 'Running team collaboration benchmarks...'

-- Test 10: Team document access
SELECT run_benchmark_test(
    'team_documents_access',
    'SELECT d.*, u.display_name as uploaded_by, da.overall_risk_score FROM documents d LEFT JOIN users u ON d.user_id = u.id LEFT JOIN document_analyses da ON d.id = da.document_id WHERE d.team_id = ''660e8400-e29b-41d4-a716-446655440001'' AND d.deleted_at IS NULL ORDER BY d.created_at DESC LIMIT 25',
    'Team document listing with uploader info'
);

-- Test 11: Team member permissions check
SELECT run_benchmark_test(
    'team_permissions_check',
    'SELECT tm.role, tm.permissions, u.display_name, u.email FROM team_members tm JOIN users u ON tm.user_id = u.id WHERE tm.team_id = ''660e8400-e29b-41d4-a716-446655440001'' AND u.status = ''active''',
    'Team member permissions and details lookup'
);

-- =============================================================================
-- API AND INTEGRATION BENCHMARKS
-- =============================================================================

\echo 'Running API performance benchmarks...'

-- Test 12: API key validation
SELECT run_benchmark_test(
    'api_key_validation',
    'SELECT ak.*, u.subscription_tier, u.status FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ak.key_hash = ''$2b$10$rKzZtDfGwgVQ7z5vH3xJP.uZFq2hYmPx8wBcR5tEd9nH6aL1vM3sK'' AND ak.is_active = true AND (ak.expires_at IS NULL OR ak.expires_at > NOW())',
    'API key validation with user tier check'
);

-- Test 13: API usage analytics
SELECT run_benchmark_test(
    'api_usage_analytics',
    'SELECT endpoint, COUNT(*) as requests, AVG(response_time_ms) as avg_response_time, COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count FROM api_usage WHERE created_at > NOW() - INTERVAL ''24 hours'' GROUP BY endpoint ORDER BY requests DESC',
    'API usage analytics for last 24 hours'
);

-- =============================================================================
-- ANALYTICS AND REPORTING BENCHMARKS
-- =============================================================================

\echo 'Running analytics benchmarks...'

-- Test 14: Usage analytics aggregation
SELECT run_benchmark_test(
    'usage_analytics_daily',
    'SELECT subscription_tier, SUM(total_users) as users, SUM(total_analyses) as analyses, AVG(avg_risk_score) as risk_score FROM usage_analytics WHERE date > CURRENT_DATE - INTERVAL ''30 days'' GROUP BY subscription_tier ORDER BY users DESC',
    'Daily usage analytics aggregation by tier'
);

-- Test 15: System metrics time series
SELECT run_benchmark_test(
    'system_metrics_timeseries',
    'SELECT metric_name, AVG(metric_value) as avg_value, MIN(metric_value) as min_value, MAX(metric_value) as max_value FROM system_metrics WHERE timestamp > NOW() - INTERVAL ''24 hours'' AND metric_name IN (''active_users_daily'', ''documents_analyzed_daily'', ''api_requests_daily'') GROUP BY metric_name',
    'System metrics time series analysis'
);

-- =============================================================================
-- NOTIFICATION AND ALERT BENCHMARKS
-- =============================================================================

\echo 'Running notification system benchmarks...'

-- Test 16: Unread notifications
SELECT run_benchmark_test(
    'unread_notifications',
    'SELECT n.*, np.email_enabled, np.browser_enabled FROM notifications n JOIN notification_preferences np ON n.user_id = np.user_id WHERE n.user_id = ''550e8400-e29b-41d4-a716-446655440001'' AND n.read_at IS NULL AND (n.expires_at IS NULL OR n.expires_at > NOW()) ORDER BY n.created_at DESC LIMIT 10',
    'Unread notifications with user preferences'
);

-- Test 17: Alert processing
SELECT run_benchmark_test(
    'alert_processing',
    'SELECT a.*, d.title as document_title FROM alerts a LEFT JOIN documents d ON a.document_id = d.id WHERE a.acknowledged = false AND a.severity IN (''high'', ''critical'') ORDER BY a.created_at DESC LIMIT 20',
    'Unacknowledged high-priority alerts'
);

-- =============================================================================
-- MONITORING AND MAINTENANCE BENCHMARKS
-- =============================================================================

\echo 'Running maintenance operation benchmarks...'

-- Test 18: Document monitoring queue
SELECT run_benchmark_test(
    'monitoring_queue',
    'SELECT d.*, u.email, np.document_changes FROM documents d JOIN users u ON d.user_id = u.id LEFT JOIN notification_preferences np ON u.id = np.user_id WHERE d.monitoring_enabled = true AND d.next_monitor_at <= NOW() ORDER BY d.next_monitor_at ASC LIMIT 100',
    'Document monitoring queue processing'
);

-- Test 19: Cleanup expired data
SELECT run_benchmark_test(
    'cleanup_expired_data',
    'SELECT COUNT(*) FROM document_analyses WHERE expires_at < NOW() AND status != ''expired''',
    'Identify expired analyses for cleanup'
);

-- =============================================================================
-- CONCURRENT USER SIMULATION BENCHMARKS
-- =============================================================================

\echo 'Running concurrent user simulation...'

-- Function to simulate concurrent user load
CREATE OR REPLACE FUNCTION simulate_concurrent_load(
    concurrent_users INTEGER DEFAULT 10,
    operations_per_user INTEGER DEFAULT 5
)
RETURNS TABLE(
    total_operations INTEGER,
    avg_response_time_ms DECIMAL(10,3),
    success_rate DECIMAL(5,4),
    peak_memory_mb DECIMAL(10,2)
) AS $$
DECLARE
    operation_queries TEXT[] := ARRAY[
        'SELECT * FROM user_dashboard WHERE id = ''550e8400-e29b-41d4-a716-446655440001''',
        'SELECT d.*, da.overall_risk_score FROM documents d LEFT JOIN document_analyses da ON d.id = da.document_id WHERE d.user_id = ''550e8400-e29b-41d4-a716-446655440001'' LIMIT 10',
        'SELECT * FROM notifications WHERE user_id = ''550e8400-e29b-41d4-a716-446655440001'' AND read_at IS NULL LIMIT 5',
        'SELECT * FROM pattern_library WHERE is_active = true AND category = ''data_collection'' LIMIT 10',
        'SELECT COUNT(*) FROM analysis_findings WHERE severity = ''high'''
    ];
    start_time TIMESTAMP WITH TIME ZONE;
    end_time TIMESTAMP WITH TIME ZONE;
    total_ops INTEGER := concurrent_users * operations_per_user;
    success_count INTEGER := 0;
    i INTEGER;
    j INTEGER;
    query_index INTEGER;
BEGIN
    start_time := clock_timestamp();
    
    -- Simulate concurrent operations
    FOR i IN 1..concurrent_users LOOP
        FOR j IN 1..operations_per_user LOOP
            query_index := (i + j) % array_length(operation_queries, 1) + 1;
            
            BEGIN
                EXECUTE operation_queries[query_index];
                success_count := success_count + 1;
            EXCEPTION WHEN others THEN
                -- Count failures but continue
                NULL;
            END;
        END LOOP;
    END LOOP;
    
    end_time := clock_timestamp();
    
    RETURN QUERY SELECT 
        total_ops,
        EXTRACT(EPOCH FROM (end_time - start_time)) * 1000 / total_ops,
        success_count::DECIMAL / total_ops,
        0.0::DECIMAL(10,2); -- Placeholder for memory usage
END;
$$ LANGUAGE plpgsql;

-- Run concurrent load test
SELECT * FROM simulate_concurrent_load(20, 10);

-- =============================================================================
-- PERFORMANCE ANALYSIS VIEWS
-- =============================================================================

-- Create views for performance analysis
CREATE OR REPLACE VIEW performance_summary AS
SELECT 
    test_name,
    COUNT(*) as test_runs,
    AVG(execution_time_ms) as avg_time_ms,
    MIN(execution_time_ms) as min_time_ms,
    MAX(execution_time_ms) as max_time_ms,
    STDDEV(execution_time_ms) as std_dev_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_time_ms) as median_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_time_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_time_ms) as p99_time_ms,
    MAX(test_timestamp) as last_run
FROM performance_benchmarks
WHERE test_timestamp > NOW() - INTERVAL '7 days'
GROUP BY test_name
ORDER BY avg_time_ms DESC;

-- Performance trends over time
CREATE OR REPLACE VIEW performance_trends AS
SELECT 
    test_name,
    DATE_TRUNC('hour', test_timestamp) as hour,
    AVG(execution_time_ms) as avg_time_ms,
    COUNT(*) as test_count
FROM performance_benchmarks
WHERE test_timestamp > NOW() - INTERVAL '24 hours'
GROUP BY test_name, DATE_TRUNC('hour', test_timestamp)
ORDER BY test_name, hour;

-- Slow query identification
CREATE OR REPLACE VIEW slow_queries AS
SELECT 
    test_name,
    query_description,
    execution_time_ms,
    test_timestamp,
    CASE 
        WHEN execution_time_ms > 5000 THEN 'CRITICAL'
        WHEN execution_time_ms > 1000 THEN 'HIGH'
        WHEN execution_time_ms > 500 THEN 'MEDIUM'
        ELSE 'LOW'
    END as performance_impact
FROM performance_benchmarks
WHERE execution_time_ms > 100
ORDER BY execution_time_ms DESC;

-- =============================================================================
-- INDEX EFFECTIVENESS ANALYSIS
-- =============================================================================

-- Function to analyze index usage for benchmarked queries
CREATE OR REPLACE FUNCTION analyze_index_effectiveness()
RETURNS TABLE(
    index_name TEXT,
    table_name TEXT,
    scans_count BIGINT,
    tuples_read BIGINT,
    tuples_fetched BIGINT,
    effectiveness_ratio DECIMAL(5,4)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.indexname::TEXT,
        i.tablename::TEXT,
        i.idx_scan,
        i.idx_tup_read,
        i.idx_tup_fetch,
        CASE 
            WHEN i.idx_tup_read > 0 
            THEN i.idx_tup_fetch::DECIMAL / i.idx_tup_read::DECIMAL
            ELSE 0::DECIMAL 
        END
    FROM pg_stat_user_indexes i
    WHERE i.schemaname = 'public'
    AND i.idx_scan > 0
    ORDER BY i.idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PERFORMANCE RECOMMENDATIONS
-- =============================================================================

-- Function to generate performance recommendations
CREATE OR REPLACE FUNCTION generate_performance_recommendations()
RETURNS TABLE(
    category TEXT,
    recommendation TEXT,
    priority TEXT,
    impact_level TEXT
) AS $$
BEGIN
    RETURN QUERY
    -- Slow query recommendations
    SELECT 
        'Query Performance'::TEXT,
        'Optimize ' || pb.test_name || ' - Average execution time: ' || ROUND(AVG(pb.execution_time_ms), 2) || 'ms'::TEXT,
        CASE 
            WHEN AVG(pb.execution_time_ms) > 2000 THEN 'HIGH'
            WHEN AVG(pb.execution_time_ms) > 500 THEN 'MEDIUM'
            ELSE 'LOW'
        END::TEXT,
        CASE 
            WHEN AVG(pb.execution_time_ms) > 2000 THEN 'CRITICAL'
            WHEN AVG(pb.execution_time_ms) > 1000 THEN 'HIGH'
            WHEN AVG(pb.execution_time_ms) > 500 THEN 'MEDIUM'
            ELSE 'LOW'
        END::TEXT
    FROM performance_benchmarks pb
    WHERE pb.test_timestamp > NOW() - INTERVAL '24 hours'
    GROUP BY pb.test_name
    HAVING AVG(pb.execution_time_ms) > 100
    
    UNION ALL
    
    -- Index usage recommendations
    SELECT 
        'Index Optimization'::TEXT,
        'Consider dropping unused index: ' || i.indexname::TEXT,
        'MEDIUM'::TEXT,
        'MEDIUM'::TEXT
    FROM pg_stat_user_indexes i
    WHERE i.schemaname = 'public'
    AND i.idx_scan = 0
    AND pg_relation_size(i.indexrelid) > 1024 * 1024 -- Larger than 1MB
    
    UNION ALL
    
    -- Table maintenance recommendations
    SELECT 
        'Table Maintenance'::TEXT,
        'Consider vacuuming table: ' || t.relname || ' (Dead tuple %: ' || 
        ROUND((t.n_dead_tup::DECIMAL / GREATEST(t.n_live_tup, 1)::DECIMAL) * 100, 2) || ')'::TEXT,
        'HIGH'::TEXT,
        'HIGH'::TEXT
    FROM pg_stat_user_tables t
    WHERE t.schemaname = 'public'
    AND t.n_dead_tup > 1000
    AND (t.n_dead_tup::DECIMAL / GREATEST(t.n_live_tup, 1)::DECIMAL) > 0.1;
    
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- BENCHMARK REPORTING
-- =============================================================================

-- Generate comprehensive benchmark report
CREATE OR REPLACE FUNCTION generate_benchmark_report()
RETURNS TABLE(
    report_section TEXT,
    metric_name TEXT,
    metric_value TEXT,
    benchmark_status TEXT
) AS $$
BEGIN
    RETURN QUERY
    -- Overall performance summary
    SELECT 
        'Overall Performance'::TEXT,
        'Average Query Time'::TEXT,
        ROUND(AVG(execution_time_ms), 2) || ' ms'::TEXT,
        CASE 
            WHEN AVG(execution_time_ms) < 100 THEN 'EXCELLENT'
            WHEN AVG(execution_time_ms) < 500 THEN 'GOOD'
            WHEN AVG(execution_time_ms) < 1000 THEN 'FAIR'
            ELSE 'NEEDS_IMPROVEMENT'
        END::TEXT
    FROM performance_benchmarks
    WHERE test_timestamp > NOW() - INTERVAL '24 hours'
    
    UNION ALL
    
    -- Top performing queries
    SELECT 
        'Best Performing Queries'::TEXT,
        pb.test_name::TEXT,
        ROUND(AVG(pb.execution_time_ms), 2) || ' ms'::TEXT,
        'GOOD'::TEXT
    FROM performance_benchmarks pb
    WHERE pb.test_timestamp > NOW() - INTERVAL '24 hours'
    GROUP BY pb.test_name
    ORDER BY AVG(pb.execution_time_ms) ASC
    LIMIT 3
    
    UNION ALL
    
    -- Slowest queries
    SELECT 
        'Slowest Queries'::TEXT,
        pb.test_name::TEXT,
        ROUND(AVG(pb.execution_time_ms), 2) || ' ms'::TEXT,
        'NEEDS_ATTENTION'::TEXT
    FROM performance_benchmarks pb
    WHERE pb.test_timestamp > NOW() - INTERVAL '24 hours'
    GROUP BY pb.test_name
    ORDER BY AVG(pb.execution_time_ms) DESC
    LIMIT 3;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- CLEANUP AND MAINTENANCE
-- =============================================================================

-- Function to clean up old benchmark data
CREATE OR REPLACE FUNCTION cleanup_benchmark_data(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM performance_benchmarks 
    WHERE test_timestamp < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Update statistics
    INSERT INTO system_metrics (metric_name, metric_value, tags) 
    VALUES ('benchmark_cleanup_count', deleted_count, '{"retention_days": ' || retention_days || '}');
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule automated benchmark runs (placeholder for cron setup)
-- This would typically be set up in a cron job or application scheduler

\echo 'Performance benchmark suite setup completed successfully!'

-- Final benchmark summary
SELECT 
    'BENCHMARK SUMMARY' as section,
    COUNT(DISTINCT test_name) as unique_tests,
    COUNT(*) as total_runs,
    ROUND(AVG(execution_time_ms), 2) as avg_time_ms,
    MIN(test_timestamp) as first_run,
    MAX(test_timestamp) as last_run
FROM performance_benchmarks;

-- Show performance summary
SELECT * FROM performance_summary;

-- Show performance recommendations
SELECT * FROM generate_performance_recommendations();

\echo ''
\echo '📊 Benchmark Results Summary:'
\echo '  - All core operations benchmarked'
\echo '  - Performance metrics collected'
\echo '  - Optimization recommendations generated'
\echo '  - Monitoring views created'
\echo ''
\echo '🔧 Next Steps:'
\echo '  1. Review slow queries and optimize'
\echo '  2. Monitor index effectiveness'
\echo '  3. Set up automated benchmark runs'
\echo '  4. Implement performance alerting'
\echo '  5. Regular performance review cycles'