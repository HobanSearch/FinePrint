-- Fine Print AI - Design System Database Schema
-- Initialize design system specific tables

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Design Tokens table
CREATE TABLE IF NOT EXISTS design_tokens (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL CHECK (category IN ('color', 'typography', 'spacing', 'shadow', 'border', 'animation')),
    value JSONB NOT NULL,
    description TEXT,
    aliases JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Design Themes table
CREATE TABLE IF NOT EXISTS design_themes (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    variant VARCHAR(50) NOT NULL CHECK (variant IN ('light', 'dark', 'high-contrast', 'custom')),
    tokens JSONB NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Design Components table
CREATE TABLE IF NOT EXISTS design_components (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    variants JSONB DEFAULT '[]'::jsonb,
    props JSONB DEFAULT '{}'::jsonb,
    styles JSONB DEFAULT '{}'::jsonb,
    accessibility JSONB DEFAULT '{}'::jsonb,
    documentation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Design Systems table
CREATE TABLE IF NOT EXISTS design_systems (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    tokens JSONB DEFAULT '{}'::jsonb,
    themes JSONB DEFAULT '[]'::jsonb,
    components JSONB DEFAULT '[]'::jsonb,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- UX Events table for analytics
CREATE TABLE IF NOT EXISTS ux_events (
    id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('click', 'scroll', 'hover', 'focus', 'keypress', 'resize', 'navigation')),
    element JSONB NOT NULL,
    viewport JSONB NOT NULL,
    coordinates_x INTEGER,
    coordinates_y INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- UX Performance Metrics table
CREATE TABLE IF NOT EXISTS ux_performance_metrics (
    id VARCHAR(255) PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    metrics JSONB NOT NULL,
    url TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- A/B Tests table
CREATE TABLE IF NOT EXISTS ab_tests (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    hypothesis TEXT,
    status VARCHAR(50) NOT NULL CHECK (status IN ('draft', 'running', 'stopped', 'completed')),
    metric VARCHAR(100) NOT NULL,
    variants JSONB NOT NULL,
    target_audience JSONB NOT NULL,
    duration JSONB NOT NULL,
    significance JSONB NOT NULL,
    auto_winner JSONB,
    metrics JSONB NOT NULL,
    winner JSONB,
    stopped_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- A/B Test Assignments table
CREATE TABLE IF NOT EXISTS ab_test_assignments (
    id SERIAL PRIMARY KEY,
    test_id VARCHAR(255) NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
    variant_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(test_id, user_id)
);

-- A/B Test Events table
CREATE TABLE IF NOT EXISTS ab_test_events (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    test_id VARCHAR(255) NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
    variant_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('view', 'click', 'conversion', 'bounce')),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Figma Integration tables
CREATE TABLE IF NOT EXISTS figma_sync_records (
    file_key VARCHAR(255) PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    version VARCHAR(50),
    last_modified TIMESTAMP WITH TIME ZONE,
    tokens_count INTEGER DEFAULT 0,
    components_count INTEGER DEFAULT 0,
    assets_count INTEGER DEFAULT 0,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS figma_component_mappings (
    id VARCHAR(255) PRIMARY KEY,
    figma_component_key VARCHAR(255) NOT NULL,
    design_system_component_id VARCHAR(255) NOT NULL,
    prop_mappings JSONB DEFAULT '{}'::jsonb,
    style_mappings JSONB DEFAULT '{}'::jsonb,
    variant_mappings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(figma_component_key)
);

-- Generated Components table
CREATE TABLE IF NOT EXISTS generated_components (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    framework VARCHAR(50) NOT NULL CHECK (framework IN ('react', 'vue', 'angular', 'react-native')),
    type VARCHAR(50) NOT NULL,
    code TEXT NOT NULL,
    files JSONB DEFAULT '[]'::jsonb,
    dependencies JSONB DEFAULT '[]'::jsonb,
    props JSONB DEFAULT '{}'::jsonb,
    variants JSONB DEFAULT '[]'::jsonb,
    accessibility JSONB DEFAULT '{}'::jsonb,
    responsive JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_design_tokens_category ON design_tokens(category);
CREATE INDEX IF NOT EXISTS idx_design_tokens_name ON design_tokens USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_design_components_category ON design_components(category);
CREATE INDEX IF NOT EXISTS idx_design_components_name ON design_components USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ux_events_session_timestamp ON ux_events(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_ux_events_type_timestamp ON ux_events(event_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_ux_events_url_timestamp ON ux_events(url, timestamp);
CREATE INDEX IF NOT EXISTS idx_ux_events_coordinates ON ux_events(coordinates_x, coordinates_y) WHERE coordinates_x IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ux_performance_session ON ux_performance_metrics(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_ux_performance_url ON ux_performance_metrics(url, timestamp);

CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_test_assignments_user ON ab_test_assignments(user_id, test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_test_variant ON ab_test_events(test_id, variant_id, event_type);

CREATE INDEX IF NOT EXISTS idx_generated_components_framework ON generated_components(framework);
CREATE INDEX IF NOT EXISTS idx_generated_components_type ON generated_components(type);
CREATE INDEX IF NOT EXISTS idx_generated_components_name ON generated_components USING gin(name gin_trgm_ops);

-- Create update triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_design_tokens_updated_at BEFORE UPDATE ON design_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_design_themes_updated_at BEFORE UPDATE ON design_themes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_design_components_updated_at BEFORE UPDATE ON design_components FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_design_systems_updated_at BEFORE UPDATE ON design_systems FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ab_tests_updated_at BEFORE UPDATE ON ab_tests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_figma_component_mappings_updated_at BEFORE UPDATE ON figma_component_mappings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_generated_components_updated_at BEFORE UPDATE ON generated_components FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default design system data
INSERT INTO design_systems (id, name, version, tokens, themes, components, config) VALUES
('default', 'Fine Print AI Design System', '1.0.0', 
 '{"colors": {"guardian": {"500": "#2563eb"}, "sage": {"500": "#10b981"}}}',
 '["light", "dark"]',
 '["Button", "Card", "Badge"]',
 '{"platforms": ["web", "mobile", "extension"], "frameworks": ["react", "vue", "angular"]}'
) ON CONFLICT (id) DO NOTHING;

-- Insert sample design tokens
INSERT INTO design_tokens (id, name, category, value, description) VALUES
('color-guardian-500', 'color.guardian.500', 'color', '"#2563eb"', 'Primary guardian blue color'),
('color-sage-500', 'color.sage.500', 'color', '"#10b981"', 'Primary sage green color'),
('spacing-4', 'spacing.4', 'spacing', '"1rem"', 'Base spacing unit - 16px'),
('typography-sans', 'typography.fontFamily.sans', 'typography', '["Inter", "system-ui", "sans-serif"]', 'Sans-serif font stack')
ON CONFLICT (id) DO NOTHING;

-- Insert sample theme
INSERT INTO design_themes (id, name, variant, tokens) VALUES
('theme-light', 'Light Theme', 'light', 
 '{"colors": {"background": "#ffffff", "foreground": "#000000", "primary": "#2563eb"}}')
ON CONFLICT (id) DO NOTHING;

-- Create views for analytics
CREATE OR REPLACE VIEW daily_event_summary AS
SELECT 
    DATE(timestamp) as date,
    event_type,
    COUNT(*) as event_count,
    COUNT(DISTINCT session_id) as unique_sessions,
    COUNT(DISTINCT user_id) as unique_users
FROM ux_events 
GROUP BY DATE(timestamp), event_type
ORDER BY date DESC, event_type;

CREATE OR REPLACE VIEW ab_test_performance AS
SELECT 
    t.id as test_id,
    t.name as test_name,
    t.status,
    COUNT(DISTINCT a.user_id) as total_participants,
    COUNT(DISTINCT CASE WHEN e.event_type = 'conversion' THEN e.user_id END) as conversions,
    CASE 
        WHEN COUNT(DISTINCT a.user_id) > 0 
        THEN ROUND((COUNT(DISTINCT CASE WHEN e.event_type = 'conversion' THEN e.user_id END)::numeric / COUNT(DISTINCT a.user_id)::numeric) * 100, 2)
        ELSE 0 
    END as conversion_rate
FROM ab_tests t
LEFT JOIN ab_test_assignments a ON t.id = a.test_id
LEFT JOIN ab_test_events e ON t.id = e.test_id AND a.user_id = e.user_id
GROUP BY t.id, t.name, t.status;

-- Grant permissions (if needed for specific roles)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO design_system_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO design_system_user;

COMMIT;