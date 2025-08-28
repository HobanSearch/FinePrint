-- Fine Print AI Database Initialization Script
-- This script creates the necessary database structures for development

-- Create database extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create basic tables for development
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    url VARCHAR(500),
    document_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    findings JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Change Detection System Tables
CREATE TABLE IF NOT EXISTS monitored_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    document_type VARCHAR(20) NOT NULL CHECK (document_type IN ('terms', 'privacy', 'cookie', 'eula')),
    title VARCHAR(500) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    current_hash VARCHAR(64) NOT NULL,
    current_content TEXT,
    last_checked TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    next_check TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    check_frequency_seconds INTEGER DEFAULT 86400,
    notification_enabled BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    check_count INTEGER DEFAULT 0,
    last_change_detected TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(url, user_id)
);

CREATE TABLE IF NOT EXISTS monitored_document_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES monitored_documents(id) ON DELETE CASCADE,
    change_type VARCHAR(50) NOT NULL,
    old_hash VARCHAR(64),
    new_hash VARCHAR(64) NOT NULL,
    old_content TEXT,
    new_content TEXT NOT NULL,
    change_summary TEXT NOT NULL,
    significance_score INTEGER CHECK (significance_score >= 0 AND significance_score <= 100),
    affected_sections TEXT[],
    change_details JSONB DEFAULT '{}',
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT false,
    notification_sent BOOLEAN DEFAULT false,
    processed_for_training BOOLEAN DEFAULT false
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_document_id ON analyses(document_id);
CREATE INDEX IF NOT EXISTS idx_analyses_risk_score ON analyses(risk_score);

-- Change Detection System indexes
CREATE INDEX IF NOT EXISTS idx_monitored_documents_user_id ON monitored_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_monitored_documents_domain ON monitored_documents(domain);
CREATE INDEX IF NOT EXISTS idx_monitored_documents_next_check ON monitored_documents(next_check);
CREATE INDEX IF NOT EXISTS idx_monitored_documents_is_active ON monitored_documents(is_active);
CREATE INDEX IF NOT EXISTS idx_monitored_document_changes_document_id ON monitored_document_changes(document_id);
CREATE INDEX IF NOT EXISTS idx_monitored_document_changes_detected_at ON monitored_document_changes(detected_at);
CREATE INDEX IF NOT EXISTS idx_monitored_document_changes_processed ON monitored_document_changes(processed);

-- Insert a test user for development
INSERT INTO users (email, password_hash) 
VALUES ('dev@fineprintai.com', crypt('password123', gen_salt('bf')))
ON CONFLICT (email) DO NOTHING;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;