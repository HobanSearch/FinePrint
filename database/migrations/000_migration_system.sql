-- Migration: 000_migration_system.sql
-- Description: Set up migration tracking system
-- Date: 2024-01-01
-- Author: Database Architect

-- This migration creates the infrastructure needed to track schema migrations
-- It must be run before any other migrations

\echo 'Setting up migration tracking system...'

-- Create migrations table to track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT,
    checksum VARCHAR(64)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at);

-- Function to validate migration order
CREATE OR REPLACE FUNCTION validate_migration_order(new_version VARCHAR(50))
RETURNS BOOLEAN AS $$
DECLARE
    max_version VARCHAR(50);
BEGIN
    SELECT version INTO max_version 
    FROM schema_migrations 
    ORDER BY version DESC 
    LIMIT 1;
    
    IF max_version IS NULL THEN
        RETURN TRUE;  -- First migration
    END IF;
    
    RETURN new_version > max_version;
END;
$$ LANGUAGE plpgsql;

-- Function to record migration
CREATE OR REPLACE FUNCTION record_migration(
    migration_version VARCHAR(50), 
    migration_description TEXT DEFAULT NULL,
    migration_checksum VARCHAR(64) DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    IF NOT validate_migration_order(migration_version) THEN
        RAISE EXCEPTION 'Migration % is out of order. Latest migration is %', 
            migration_version, 
            (SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1);
    END IF;
    
    INSERT INTO schema_migrations (version, description, checksum, applied_at)
    VALUES (migration_version, migration_description, migration_checksum, NOW())
    ON CONFLICT (version) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Record this initial migration
SELECT record_migration('000', 'Set up migration tracking system');

\echo 'Migration tracking system setup completed successfully!'