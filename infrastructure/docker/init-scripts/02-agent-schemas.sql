-- Fine Print AI - Autonomous Agent Database Schemas
-- This script creates database structures for all autonomous agents

-- ===============================
-- AGENT ORCHESTRATION SYSTEM
-- ===============================

-- Agent Registry Tables
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'offline',
    capabilities JSONB NOT NULL DEFAULT '[]',
    configuration JSONB NOT NULL DEFAULT '{}',
    health_data JSONB,
    metrics JSONB,
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow Definitions
CREATE TABLE IF NOT EXISTS workflow_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    definition JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow Executions
CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    workflow_version INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    triggered_by VARCHAR(255),
    trigger_data JSONB,
    variables JSONB,
    output JSONB,
    error_details TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Task Executions
CREATE TABLE IF NOT EXISTS task_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_execution_id UUID REFERENCES workflow_executions(id) ON DELETE CASCADE,
    task_id VARCHAR(255) NOT NULL,
    agent_id UUID REFERENCES agents(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    input JSONB,
    output JSONB,
    error_details TEXT,
    retry_count INTEGER DEFAULT 0,
    logs JSONB DEFAULT '[]',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent Communications
CREATE TABLE IF NOT EXISTS agent_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_agent_id UUID REFERENCES agents(id),
    to_agent_id UUID REFERENCES agents(id),
    message_type VARCHAR(100) NOT NULL,
    subject VARCHAR(255),
    payload JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    correlation_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- ===============================
-- DSPY FRAMEWORK
-- ===============================

-- DSPy Modules
CREATE TABLE IF NOT EXISTS dspy_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    module_type VARCHAR(100) NOT NULL,
    description TEXT,
    signature_definition JSONB NOT NULL,
    optimization_config JSONB,
    compiled_module JSONB,
    performance_metrics JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- DSPy Optimization Sessions
CREATE TABLE IF NOT EXISTS dspy_optimization_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID REFERENCES dspy_modules(id) ON DELETE CASCADE,
    optimizer_type VARCHAR(100) NOT NULL,
    training_config JSONB NOT NULL,
    training_data JSONB,
    validation_data JSONB,
    optimization_results JSONB,
    final_prompts JSONB,
    performance_improvement NUMERIC,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- DSPy Evaluation Metrics
CREATE TABLE IF NOT EXISTS dspy_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID REFERENCES dspy_modules(id) ON DELETE CASCADE,
    optimization_session_id UUID REFERENCES dspy_optimization_sessions(id),
    evaluation_type VARCHAR(100) NOT NULL,
    dataset_name VARCHAR(255),
    metrics JSONB NOT NULL,
    test_cases JSONB,
    evaluation_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Training Examples for DSPy modules
CREATE TABLE IF NOT EXISTS training_examples (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID REFERENCES dspy_modules(id) ON DELETE CASCADE,
    input_data JSONB NOT NULL,
    output_data JSONB NOT NULL,
    metadata JSONB,
    quality_score NUMERIC DEFAULT 1.0,
    is_validated BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- GATED LORA SYSTEM
-- ===============================

-- LoRA Adapters
CREATE TABLE IF NOT EXISTS lora_adapters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    base_model VARCHAR(255) NOT NULL,
    task_domain VARCHAR(100),
    adapter_config JSONB NOT NULL,
    training_config JSONB NOT NULL,
    adapter_weights JSONB,
    gating_weights JSONB,
    performance_metrics JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'training',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- LoRA Training Sessions
CREATE TABLE IF NOT EXISTS lora_training_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    adapter_id UUID REFERENCES lora_adapters(id) ON DELETE CASCADE,
    training_dataset JSONB NOT NULL,
    validation_dataset JSONB,
    hyperparameters JSONB NOT NULL,
    training_logs JSONB DEFAULT '[]',
    checkpoint_data JSONB,
    final_metrics JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- LoRA Router Decisions
CREATE TABLE IF NOT EXISTS lora_routing_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL,
    input_text TEXT NOT NULL,
    selected_adapters JSONB NOT NULL,
    router_confidence JSONB NOT NULL,
    execution_time_ms INTEGER,
    performance_metrics JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- KNOWLEDGE GRAPH SYSTEM
-- ===============================

-- Knowledge Entities (PostgreSQL cache for Neo4j data)
CREATE TABLE IF NOT EXISTS knowledge_entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    neo4j_id VARCHAR(255) UNIQUE NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}',
    embeddings VECTOR(1536), -- OpenAI embedding dimension
    importance_score NUMERIC DEFAULT 0.0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Knowledge Relationships
CREATE TABLE IF NOT EXISTS knowledge_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    neo4j_id VARCHAR(255) UNIQUE NOT NULL,
    from_entity_id UUID REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    to_entity_id UUID REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    relationship_type VARCHAR(100) NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}',
    strength NUMERIC DEFAULT 1.0,
    confidence NUMERIC DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Curriculum Learning Sessions
CREATE TABLE IF NOT EXISTS curriculum_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_name VARCHAR(255) NOT NULL,
    domain VARCHAR(100) NOT NULL,
    difficulty_progression JSONB NOT NULL,
    learning_objectives JSONB NOT NULL,
    training_data JSONB,
    performance_metrics JSONB,
    adaptation_history JSONB DEFAULT '[]',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- FULL-STACK DEVELOPMENT AGENT
-- ===============================

-- Code Generation Templates
CREATE TABLE IF NOT EXISTS code_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    template_type VARCHAR(100) NOT NULL, -- component, service, test, etc.
    framework VARCHAR(100), -- react, fastify, express, etc.
    template_content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    dependencies JSONB DEFAULT '[]',
    usage_count INTEGER DEFAULT 0,
    rating NUMERIC DEFAULT 0.0,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Architecture Decisions
CREATE TABLE IF NOT EXISTS architecture_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_context JSONB NOT NULL,
    decision_type VARCHAR(100) NOT NULL,
    options_considered JSONB NOT NULL,
    selected_option JSONB NOT NULL,
    reasoning TEXT NOT NULL,
    trade_offs TEXT,
    implementation_notes TEXT,
    validation_results JSONB,
    decision_quality_score NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Code Quality Assessments
CREATE TABLE IF NOT EXISTS code_quality_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID,
    file_path VARCHAR(500) NOT NULL,
    code_content TEXT NOT NULL,
    quality_metrics JSONB NOT NULL,
    issues_found JSONB DEFAULT '[]',
    suggestions JSONB DEFAULT '[]',
    overall_score NUMERIC NOT NULL,
    assessment_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- AI/ML ENGINEERING AGENT
-- ===============================

-- Model Registry
CREATE TABLE IF NOT EXISTS ml_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    model_type VARCHAR(100) NOT NULL,
    framework VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    model_metadata JSONB NOT NULL,
    performance_metrics JSONB,
    deployment_config JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'registered',
    model_path VARCHAR(500),
    checksum VARCHAR(255),
    size_bytes BIGINT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Model Training Jobs
CREATE TABLE IF NOT EXISTS ml_training_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID REFERENCES ml_models(id) ON DELETE CASCADE,
    job_name VARCHAR(255) NOT NULL,
    training_config JSONB NOT NULL,
    hyperparameters JSONB NOT NULL,
    dataset_config JSONB NOT NULL,
    resource_config JSONB,
    training_logs JSONB DEFAULT '[]',
    metrics_history JSONB DEFAULT '[]',
    checkpoint_paths JSONB DEFAULT '[]',
    final_metrics JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- A/B Testing Experiments
CREATE TABLE IF NOT EXISTS ab_test_experiments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    experiment_name VARCHAR(255) NOT NULL,
    description TEXT,
    model_a_id UUID REFERENCES ml_models(id),
    model_b_id UUID REFERENCES ml_models(id),
    traffic_split JSONB NOT NULL, -- {a: 50, b: 50}
    success_metrics JSONB NOT NULL,
    experiment_config JSONB NOT NULL,
    results JSONB,
    statistical_significance JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- DESIGN SYSTEM AGENT
-- ===============================

-- Design Components
CREATE TABLE IF NOT EXISTS design_components (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    component_type VARCHAR(100) NOT NULL,
    category VARCHAR(100),
    framework VARCHAR(100) NOT NULL,
    component_code TEXT NOT NULL,
    styles_code TEXT,
    props_schema JSONB,
    variants JSONB DEFAULT '[]',
    examples JSONB DEFAULT '[]',
    accessibility_features JSONB DEFAULT '[]',
    usage_guidelines TEXT,
    design_tokens JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    version VARCHAR(50) DEFAULT '1.0.0',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Design Tokens
CREATE TABLE IF NOT EXISTS design_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    token_type VARCHAR(100) NOT NULL, -- color, typography, spacing, etc.
    category VARCHAR(100),
    value JSONB NOT NULL,
    semantic_meaning VARCHAR(255),
    usage_context JSONB DEFAULT '[]',
    relationships JSONB DEFAULT '[]',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Design System Generations
CREATE TABLE IF NOT EXISTS design_system_generations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_name VARCHAR(255) NOT NULL,
    brand_guidelines JSONB NOT NULL,
    requirements JSONB NOT NULL,
    generated_tokens JSONB NOT NULL,
    generated_components JSONB NOT NULL,
    theme_variations JSONB DEFAULT '[]',
    accessibility_compliance JSONB,
    generation_quality_score NUMERIC,
    feedback JSONB DEFAULT '[]',
    status VARCHAR(50) NOT NULL DEFAULT 'generated',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- BUSINESS AGENTS (SALES, MARKETING)
-- ===============================

-- Lead Scoring Models
CREATE TABLE IF NOT EXISTS lead_scoring_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_name VARCHAR(255) NOT NULL,
    scoring_criteria JSONB NOT NULL,
    weights JSONB NOT NULL,
    threshold_config JSONB NOT NULL,
    model_performance JSONB,
    training_data_size INTEGER,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lead Scores
CREATE TABLE IF NOT EXISTS lead_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    model_id UUID REFERENCES lead_scoring_models(id),
    raw_score NUMERIC NOT NULL,
    normalized_score INTEGER NOT NULL CHECK (normalized_score >= 0 AND normalized_score <= 100),
    score_factors JSONB NOT NULL,
    confidence_level NUMERIC,
    score_explanation TEXT,
    scored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Content Generation Tasks
CREATE TABLE IF NOT EXISTS content_generation_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL, -- blog_post, email, social_media, etc.
    target_audience JSONB NOT NULL,
    brand_voice JSONB NOT NULL,
    generation_parameters JSONB NOT NULL,
    generated_content TEXT,
    content_variations JSONB DEFAULT '[]',
    quality_metrics JSONB,
    approval_status VARCHAR(50) DEFAULT 'pending',
    feedback JSONB DEFAULT '[]',
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================
-- INDEXES FOR PERFORMANCE
-- ===============================

-- Agent Orchestration Indexes
CREATE INDEX IF NOT EXISTS idx_agents_type_status ON agents(type, status);
CREATE INDEX IF NOT EXISTS idx_agents_last_heartbeat ON agents(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_workflow_execution_id ON task_executions(workflow_execution_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_status ON task_executions(status);
CREATE INDEX IF NOT EXISTS idx_agent_messages_to_agent_status ON agent_messages(to_agent_id, status);

-- DSPy Indexes
CREATE INDEX IF NOT EXISTS idx_dspy_modules_type_status ON dspy_modules(module_type, status);
CREATE INDEX IF NOT EXISTS idx_dspy_optimization_sessions_module_id ON dspy_optimization_sessions(module_id);

-- LoRA Indexes
CREATE INDEX IF NOT EXISTS idx_lora_adapters_base_model ON lora_adapters(base_model);
CREATE INDEX IF NOT EXISTS idx_lora_adapters_task_domain ON lora_adapters(task_domain);
CREATE INDEX IF NOT EXISTS idx_lora_routing_decisions_request_id ON lora_routing_decisions(request_id);

-- Knowledge Graph Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_type ON knowledge_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_name ON knowledge_entities(name);
CREATE INDEX IF NOT EXISTS idx_knowledge_relationships_type ON knowledge_relationships(relationship_type);

-- ML Engineering Indexes
CREATE INDEX IF NOT EXISTS idx_ml_models_type_status ON ml_models(model_type, status);
CREATE INDEX IF NOT EXISTS idx_ml_training_jobs_model_id ON ml_training_jobs(model_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_experiments_status ON ab_test_experiments(status);

-- Design System Indexes
CREATE INDEX IF NOT EXISTS idx_design_components_type ON design_components(component_type);
CREATE INDEX IF NOT EXISTS idx_design_tokens_type ON design_tokens(token_type);

-- Business Agents Indexes
CREATE INDEX IF NOT EXISTS idx_lead_scores_user_id ON lead_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_normalized_score ON lead_scores(normalized_score);
CREATE INDEX IF NOT EXISTS idx_content_generation_tasks_type_status ON content_generation_tasks(content_type, status);

-- ===============================
-- SERVICE TRACKING SYSTEM
-- ===============================

-- Services table - Track websites/services for change monitoring
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL, -- Human-friendly service name (e.g., "GitHub", "Google")
    domain VARCHAR(255) NOT NULL, -- Domain (e.g., "github.com", "google.com")  
    url TEXT NOT NULL, -- Full URL to terms of service
    terms_hash VARCHAR(64), -- SHA256 hash of analyzed terms content
    last_analyzed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_changed TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    notification_enabled BOOLEAN DEFAULT true,
    risk_score INTEGER DEFAULT 0, -- Latest risk score (0-100)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Service changes table - Track when terms change
CREATE TABLE IF NOT EXISTS service_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    old_hash VARCHAR(64),
    new_hash VARCHAR(64),
    old_risk_score INTEGER,
    new_risk_score INTEGER,
    change_summary TEXT,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notified_at TIMESTAMP WITH TIME ZONE
);

-- Notifications table - Track user notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'service_change', 'high_risk_detected', etc.
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id);
CREATE INDEX IF NOT EXISTS idx_services_domain ON services(domain);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active);
CREATE INDEX IF NOT EXISTS idx_service_changes_service_id ON service_changes(service_id);
CREATE INDEX IF NOT EXISTS idx_service_changes_detected_at ON service_changes(detected_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- ===============================
-- GRANT PERMISSIONS
-- ===============================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;