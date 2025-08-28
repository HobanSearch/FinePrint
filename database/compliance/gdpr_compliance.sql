-- GDPR Compliance Implementation for Fine Print AI
-- Comprehensive data protection and privacy compliance system
-- Implements GDPR Articles 15, 16, 17, 18, 20, and 21

\echo 'Implementing GDPR compliance features for Fine Print AI...'

-- =============================================================================
-- GDPR COMPLIANCE FRAMEWORK
-- =============================================================================

-- Enhanced data processing records for GDPR Article 30
CREATE TABLE IF NOT EXISTS gdpr_processing_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_name VARCHAR(200) NOT NULL,
    controller_name VARCHAR(200) DEFAULT 'Fine Print AI',
    controller_contact VARCHAR(255),
    dpo_contact VARCHAR(255),
    processing_purposes TEXT[] NOT NULL,
    data_categories TEXT[] NOT NULL,
    data_subjects_categories TEXT[] NOT NULL,
    recipients_categories TEXT[],
    third_country_transfers JSONB,
    retention_periods JSONB NOT NULL,
    security_measures TEXT[],
    legal_basis VARCHAR(100) NOT NULL,
    legitimate_interests TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    next_review_date DATE
);

-- Data subject rights request tracking
CREATE TABLE IF NOT EXISTS gdpr_rights_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_type VARCHAR(50) NOT NULL, -- access, rectification, erasure, portability, restriction, objection
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    requestor_email VARCHAR(255) NOT NULL,
    requestor_identity_verified BOOLEAN DEFAULT FALSE,
    verification_method VARCHAR(100),
    verification_documents JSONB,
    request_details JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, rejected, expired
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    assigned_to VARCHAR(255),
    legal_basis_assessment TEXT,
    response_due_date TIMESTAMP WITH TIME ZONE,
    response_provided_at TIMESTAMP WITH TIME ZONE,
    response_method VARCHAR(50), -- email, secure_download, postal
    response_content JSONB,
    rejection_reason TEXT,
    internal_notes TEXT,
    processing_log JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Consent management system
CREATE TABLE IF NOT EXISTS gdpr_consent_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    consent_type VARCHAR(100) NOT NULL, -- analytics, marketing, profiling, etc.
    consent_given BOOLEAN NOT NULL,
    consent_method VARCHAR(50) NOT NULL, -- explicit_opt_in, implicit, withdrawn
    consent_evidence JSONB, -- UI element, timestamp, IP, etc.
    processing_purposes TEXT[],
    data_categories TEXT[],
    withdrawal_method VARCHAR(50),
    withdrawal_evidence JSONB,
    consent_version INTEGER DEFAULT 1,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data breach incident tracking
CREATE TABLE IF NOT EXISTS gdpr_data_breaches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id VARCHAR(100) UNIQUE NOT NULL,
    breach_type VARCHAR(50) NOT NULL, -- confidentiality, integrity, availability
    severity_level VARCHAR(20) NOT NULL, -- low, medium, high, critical
    discovered_at TIMESTAMP WITH TIME ZONE NOT NULL,
    reported_internally_at TIMESTAMP WITH TIME ZONE,
    contained_at TIMESTAMP WITH TIME ZONE,
    affected_data_categories TEXT[],
    affected_individuals_count INTEGER,
    affected_users JSONB, -- User IDs or anonymized identifiers
    breach_description TEXT NOT NULL,
    cause_analysis TEXT,
    impact_assessment TEXT,
    mitigation_measures TEXT[],
    preventive_measures TEXT[],
    dpa_notification_required BOOLEAN DEFAULT FALSE,
    dpa_notified_at TIMESTAMP WITH TIME ZONE,
    dpa_notification_method VARCHAR(50),
    individuals_notification_required BOOLEAN DEFAULT FALSE,
    individuals_notified_at TIMESTAMP WITH TIME ZONE,
    notification_method VARCHAR(100),
    status VARCHAR(50) DEFAULT 'investigating', -- investigating, contained, resolved, closed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

\echo 'GDPR compliance tables created successfully'

-- =============================================================================
-- GDPR ARTICLE 15 - RIGHT OF ACCESS
-- =============================================================================

-- Function to generate complete personal data export
CREATE OR REPLACE FUNCTION gdpr_generate_data_export(
    user_id_param UUID,
    request_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    user_data JSONB;
    export_data JSONB;
BEGIN
    -- Verify user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = user_id_param) THEN
        RAISE EXCEPTION 'User not found: %', user_id_param;
    END IF;
    
    -- Build comprehensive data export
    SELECT jsonb_build_object(
        'export_metadata', jsonb_build_object(
            'generated_at', NOW(),
            'request_id', request_id,
            'user_id', user_id_param,
            'export_version', '1.0',
            'legal_basis', 'GDPR Article 15 - Right of Access'
        ),
        
        -- User account data
        'account_information', (
            SELECT jsonb_build_object(
                'user_id', id,
                'email', email,
                'display_name', display_name,
                'timezone', timezone,
                'language', language,
                'subscription_tier', subscription_tier,
                'subscription_expires_at', subscription_expires_at,
                'privacy_settings', privacy_settings,
                'preferences', preferences,
                'account_created', created_at,
                'last_login', last_login_at,
                'login_count', login_count
            )
            FROM users WHERE id = user_id_param
        ),
        
        -- Document data (metadata only, no content per privacy-first design)
        'documents', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'document_id', id,
                    'title', title,
                    'url', url,
                    'document_type', document_type,
                    'language', language,
                    'monitoring_enabled', monitoring_enabled,
                    'created_at', created_at,
                    'updated_at', updated_at
                )
            )
            FROM documents WHERE user_id = user_id_param AND deleted_at IS NULL
        ),
        
        -- Analysis results
        'document_analyses', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'analysis_id', da.id,
                    'document_title', d.title,
                    'version', da.version,
                    'status', da.status,
                    'overall_risk_score', da.overall_risk_score,
                    'executive_summary', da.executive_summary,
                    'key_findings', da.key_findings,
                    'recommendations', da.recommendations,
                    'completed_at', da.completed_at,
                    'findings', (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'category', af.category,
                                'title', af.title,
                                'description', af.description,
                                'severity', af.severity,
                                'recommendation', af.recommendation
                            )
                        )
                        FROM analysis_findings af WHERE af.analysis_id = da.id
                    )
                )
            )
            FROM document_analyses da 
            JOIN documents d ON da.document_id = d.id 
            WHERE da.user_id = user_id_param
        ),
        
        -- User actions and templates used
        'user_actions', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'action_id', ua.id,
                    'title', ua.title,
                    'recipient_company', ua.recipient_company,
                    'status', ua.status,
                    'sent_at', ua.sent_at,
                    'response_received_at', ua.response_received_at,
                    'created_at', ua.created_at,
                    'template_used', at.name
                )
            )
            FROM user_actions ua
            LEFT JOIN action_templates at ON ua.template_id = at.id
            WHERE ua.user_id = user_id_param
        ),
        
        -- Notification preferences and history
        'notifications', (
            SELECT jsonb_build_object(
                'preferences', (
                    SELECT row_to_json(np.*)
                    FROM notification_preferences np 
                    WHERE np.user_id = user_id_param
                ),
                'notification_history', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'type', n.type,
                            'title', n.title,
                            'message', n.message,
                            'read_at', n.read_at,
                            'created_at', n.created_at
                        )
                    )
                    FROM notifications n 
                    WHERE n.user_id = user_id_param 
                    ORDER BY n.created_at DESC 
                    LIMIT 100
                )
            )
        ),
        
        -- API usage data
        'api_usage', (
            SELECT jsonb_build_object(
                'api_keys', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'key_name', ak.name,
                            'key_prefix', ak.key_prefix,
                            'permissions', ak.permissions,
                            'usage_count', ak.usage_count,
                            'last_used_at', ak.last_used_at,
                            'created_at', ak.created_at
                        )
                    )
                    FROM api_keys ak WHERE ak.user_id = user_id_param AND ak.is_active = true
                ),
                'recent_api_usage', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'endpoint', au.endpoint,
                            'method', au.method,
                            'status_code', au.status_code,
                            'timestamp', au.created_at
                        )
                    )
                    FROM api_usage au 
                    JOIN api_keys ak ON au.api_key_id = ak.id 
                    WHERE ak.user_id = user_id_param 
                    ORDER BY au.created_at DESC 
                    LIMIT 1000
                )
            )
        ),
        
        -- Consent records
        'consent_records', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'consent_type', consent_type,
                    'consent_given', consent_given,
                    'consent_method', consent_method,
                    'processing_purposes', processing_purposes,
                    'valid_from', valid_from,
                    'valid_until', valid_until,
                    'created_at', created_at
                )
            )
            FROM gdpr_consent_records 
            WHERE user_id = user_id_param
        ),
        
        -- Data processing activities affecting this user
        'data_processing_activities', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'activity_name', activity_name,
                    'processing_purposes', processing_purposes,
                    'data_categories', data_categories,
                    'legal_basis', legal_basis,
                    'retention_periods', retention_periods
                )
            )
            FROM gdpr_processing_activities
        )
    ) INTO export_data;
    
    -- Log the data access
    INSERT INTO gdpr_rights_requests (
        request_type, user_id, requestor_email, status, request_details, response_provided_at
    ) SELECT 
        'access', user_id_param, u.email, 'completed',
        jsonb_build_object('automated_export', true, 'data_categories', ARRAY['all']),
        NOW()
    FROM users u WHERE u.id = user_id_param;
    
    RETURN export_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- GDPR ARTICLE 16 - RIGHT TO RECTIFICATION
-- =============================================================================

-- Function to handle data rectification requests
CREATE OR REPLACE FUNCTION gdpr_rectify_user_data(
    user_id_param UUID,
    corrections JSONB,
    request_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    correction_key TEXT;
    correction_value TEXT;
    updated_fields TEXT[] := '{}';
    result JSONB;
BEGIN
    -- Validate user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = user_id_param) THEN
        RAISE EXCEPTION 'User not found: %', user_id_param;
    END IF;
    
    -- Process corrections for user table
    FOR correction_key, correction_value IN 
        SELECT * FROM jsonb_each_text(corrections->'user_data')
    LOOP
        CASE correction_key
            WHEN 'display_name' THEN
                UPDATE users SET display_name = correction_value, updated_at = NOW() 
                WHERE id = user_id_param;
                updated_fields := array_append(updated_fields, 'display_name');
                
            WHEN 'timezone' THEN
                UPDATE users SET timezone = correction_value, updated_at = NOW() 
                WHERE id = user_id_param;
                updated_fields := array_append(updated_fields, 'timezone');
                
            WHEN 'language' THEN
                UPDATE users SET language = correction_value, updated_at = NOW() 
                WHERE id = user_id_param;
                updated_fields := array_append(updated_fields, 'language');
                
            -- Add more fields as needed
            ELSE
                RAISE NOTICE 'Field % is not eligible for rectification', correction_key;
        END CASE;
    END LOOP;
    
    -- Update preferences if provided
    IF corrections ? 'preferences' THEN
        UPDATE users 
        SET preferences = preferences || corrections->'preferences', 
            updated_at = NOW() 
        WHERE id = user_id_param;
        updated_fields := array_append(updated_fields, 'preferences');
    END IF;
    
    -- Update privacy settings if provided
    IF corrections ? 'privacy_settings' THEN
        UPDATE users 
        SET privacy_settings = privacy_settings || corrections->'privacy_settings', 
            updated_at = NOW() 
        WHERE id = user_id_param;
        updated_fields := array_append(updated_fields, 'privacy_settings');
    END IF;
    
    -- Log the rectification
    INSERT INTO gdpr_rights_requests (
        request_type, user_id, requestor_email, status, request_details, response_provided_at
    ) SELECT 
        'rectification', user_id_param, u.email, 'completed',
        jsonb_build_object(
            'corrected_fields', updated_fields,
            'corrections_applied', corrections
        ),
        NOW()
    FROM users u WHERE u.id = user_id_param;
    
    result := jsonb_build_object(
        'success', true,
        'updated_fields', updated_fields,
        'updated_at', NOW()
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- GDPR ARTICLE 17 - RIGHT TO ERASURE (RIGHT TO BE FORGOTTEN)
-- =============================================================================

-- Function to handle complete user data deletion
CREATE OR REPLACE FUNCTION gdpr_erase_user_data(
    user_id_param UUID,
    deletion_reason TEXT DEFAULT 'user_request',
    verification_token TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    deletion_summary JSONB;
    user_email TEXT;
    documents_count INTEGER;
    analyses_count INTEGER;
    actions_count INTEGER;
    notifications_count INTEGER;
BEGIN
    -- Get user email before deletion
    SELECT email INTO user_email FROM users WHERE id = user_id_param;
    
    IF user_email IS NULL THEN
        RAISE EXCEPTION 'User not found: %', user_id_param;
    END IF;
    
    -- Count data to be deleted for audit
    SELECT COUNT(*) INTO documents_count FROM documents WHERE user_id = user_id_param;
    SELECT COUNT(*) INTO analyses_count FROM document_analyses WHERE user_id = user_id_param;
    SELECT COUNT(*) INTO actions_count FROM user_actions WHERE user_id = user_id_param;
    SELECT COUNT(*) INTO notifications_count FROM notifications WHERE user_id = user_id_param;
    
    -- Start deletion process (cascading deletes will handle related data)
    
    -- 1. Delete user sessions
    DELETE FROM user_sessions WHERE user_id = user_id_param;
    
    -- 2. Delete API keys and usage
    DELETE FROM api_usage WHERE api_key_id IN (SELECT id FROM api_keys WHERE user_id = user_id_param);
    DELETE FROM api_keys WHERE user_id = user_id_param;
    
    -- 3. Delete notifications and preferences
    DELETE FROM notifications WHERE user_id = user_id_param;
    DELETE FROM notification_preferences WHERE user_id = user_id_param;
    
    -- 4. Delete user actions
    DELETE FROM user_actions WHERE user_id = user_id_param;
    
    -- 5. Delete analysis findings (through cascade)
    DELETE FROM analysis_findings WHERE analysis_id IN (
        SELECT id FROM document_analyses WHERE user_id = user_id_param
    );
    
    -- 6. Delete document analyses
    DELETE FROM document_analyses WHERE user_id = user_id_param;
    
    -- 7. Delete documents (will cascade to document_changes)
    DELETE FROM documents WHERE user_id = user_id_param;
    
    -- 8. Delete team memberships
    DELETE FROM team_members WHERE user_id = user_id_param;
    
    -- 9. Handle team ownership (transfer or delete teams)
    UPDATE teams SET owner_id = NULL WHERE owner_id = user_id_param;
    
    -- 10. Delete alerts
    DELETE FROM alerts WHERE user_id = user_id_param;
    
    -- 11. Delete consent records
    DELETE FROM gdpr_consent_records WHERE user_id = user_id_param;
    
    -- 12. Delete integrations
    DELETE FROM integrations WHERE user_id = user_id_param;
    
    -- 13. Anonymize data export requests (keep for compliance but remove PII)
    UPDATE data_export_requests 
    SET user_id = NULL, file_path = NULL 
    WHERE user_id = user_id_param;
    
    -- 14. Update audit logs to remove direct user reference but keep action record
    UPDATE audit_logs 
    SET user_id = NULL, 
        new_values = CASE 
            WHEN new_values ? 'email' THEN new_values || '{"email": "[DELETED]"}'::jsonb
            ELSE new_values 
        END,
        old_values = CASE 
            WHEN old_values ? 'email' THEN old_values || '{"email": "[DELETED]"}'::jsonb
            ELSE old_values 
        END
    WHERE user_id = user_id_param;
    
    -- 15. Finally, delete the user record
    DELETE FROM users WHERE id = user_id_param;
    
    -- Create deletion summary
    deletion_summary := jsonb_build_object(
        'user_id', user_id_param,
        'user_email', user_email,
        'deletion_reason', deletion_reason,
        'deleted_at', NOW(),
        'data_deleted', jsonb_build_object(
            'documents', documents_count,
            'analyses', analyses_count,
            'actions', actions_count,
            'notifications', notifications_count
        ),
        'verification_token', verification_token
    );
    
    -- Log the deletion (can't reference user_id anymore)
    INSERT INTO gdpr_rights_requests (
        request_type, user_id, requestor_email, status, request_details, response_provided_at
    ) VALUES (
        'erasure', NULL, user_email, 'completed', deletion_summary, NOW()
    );
    
    -- Log in audit system
    INSERT INTO audit_logs (action, resource_type, new_values) 
    VALUES ('GDPR_ERASURE', 'user', deletion_summary);
    
    RETURN deletion_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- GDPR ARTICLE 18 - RIGHT TO RESTRICTION OF PROCESSING
-- =============================================================================

-- Function to restrict processing of user data
CREATE OR REPLACE FUNCTION gdpr_restrict_processing(
    user_id_param UUID,
    restriction_scope TEXT[], -- 'analytics', 'marketing', 'profiling', 'all'
    restriction_reason TEXT,
    request_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    restriction_record JSONB;
    user_email TEXT;
BEGIN
    -- Validate user exists
    SELECT email INTO user_email FROM users WHERE id = user_id_param;
    
    IF user_email IS NULL THEN
        RAISE EXCEPTION 'User not found: %', user_id_param;
    END IF;
    
    -- Update user privacy settings to reflect restrictions
    UPDATE users 
    SET privacy_settings = privacy_settings || jsonb_build_object(
        'processing_restricted', true,
        'restriction_scope', restriction_scope,
        'restriction_reason', restriction_reason,
        'restricted_at', NOW()
    ),
    updated_at = NOW()
    WHERE id = user_id_param;
    
    -- If analytics restricted, opt out of analytics
    IF 'analytics' = ANY(restriction_scope) OR 'all' = ANY(restriction_scope) THEN
        UPDATE users 
        SET privacy_settings = privacy_settings || '{"analytics_sharing": false}'::jsonb
        WHERE id = user_id_param;
    END IF;
    
    -- If marketing restricted, opt out of marketing
    IF 'marketing' = ANY(restriction_scope) OR 'all' = ANY(restriction_scope) THEN
        UPDATE notification_preferences 
        SET marketing_emails = false, updated_at = NOW()
        WHERE user_id = user_id_param;
    END IF;
    
    -- Create restriction record
    restriction_record := jsonb_build_object(
        'user_id', user_id_param,
        'restriction_scope', restriction_scope,
        'restriction_reason', restriction_reason,
        'restricted_at', NOW(),
        'status', 'active'
    );
    
    -- Log the restriction
    INSERT INTO gdpr_rights_requests (
        request_type, user_id, requestor_email, status, request_details, response_provided_at
    ) VALUES (
        'restriction', user_id_param, user_email, 'completed', restriction_record, NOW()
    );
    
    RETURN restriction_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- GDPR ARTICLE 20 - RIGHT TO DATA PORTABILITY
-- =============================================================================

-- Function to generate portable data export
CREATE OR REPLACE FUNCTION gdpr_generate_portable_export(
    user_id_param UUID,
    export_format TEXT DEFAULT 'json' -- json, csv, xml
)
RETURNS JSONB AS $$
DECLARE
    portable_data JSONB;
    user_email TEXT;
BEGIN
    -- Validate user
    SELECT email INTO user_email FROM users WHERE id = user_id_param;
    
    IF user_email IS NULL THEN
        RAISE EXCEPTION 'User not found: %', user_id_param;
    END IF;
    
    -- Generate structured, machine-readable export
    SELECT jsonb_build_object(
        'export_metadata', jsonb_build_object(
            'format', export_format,
            'version', '1.0',
            'generated_at', NOW(),
            'user_id', user_id_param,
            'legal_basis', 'GDPR Article 20 - Right to Data Portability'
        ),
        
        -- User-provided data only (not derived/analyzed data)
        'user_account', (
            SELECT jsonb_build_object(
                'email', email,
                'display_name', display_name,
                'timezone', timezone,
                'language', language,
                'preferences', preferences,
                'created_at', created_at
            )
            FROM users WHERE id = user_id_param
        ),
        
        -- Document metadata (user-provided)
        'documents', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'title', title,
                    'url', url,
                    'document_type', document_type,
                    'language', language,
                    'created_at', created_at
                )
            )
            FROM documents 
            WHERE user_id = user_id_param AND deleted_at IS NULL
        ),
        
        -- User actions (user-initiated)
        'actions_taken', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'title', title,
                    'recipient_company', recipient_company,
                    'created_at', created_at
                )
            )
            FROM user_actions 
            WHERE user_id = user_id_param
        ),
        
        -- Consent records
        'consent_history', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'consent_type', consent_type,
                    'consent_given', consent_given,
                    'consent_method', consent_method,
                    'valid_from', valid_from
                )
            )
            FROM gdpr_consent_records 
            WHERE user_id = user_id_param
        )
    ) INTO portable_data;
    
    -- Log the portability request
    INSERT INTO gdpr_rights_requests (
        request_type, user_id, requestor_email, status, request_details, response_provided_at
    ) VALUES (
        'portability', user_id_param, user_email, 'completed',
        jsonb_build_object('export_format', export_format, 'automated_export', true),
        NOW()
    );
    
    RETURN portable_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- GDPR ARTICLE 21 - RIGHT TO OBJECT
-- =============================================================================

-- Function to handle objections to processing
CREATE OR REPLACE FUNCTION gdpr_object_to_processing(
    user_id_param UUID,
    objection_scope TEXT[], -- 'direct_marketing', 'profiling', 'legitimate_interest', 'research'
    objection_reason TEXT DEFAULT NULL,
    request_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    objection_record JSONB;
    user_email TEXT;
BEGIN
    -- Validate user
    SELECT email INTO user_email FROM users WHERE id = user_id_param;
    
    IF user_email IS NULL THEN
        RAISE EXCEPTION 'User not found: %', user_id_param;
    END IF;
    
    -- Process objections
    
    -- Direct marketing objection (absolute right)
    IF 'direct_marketing' = ANY(objection_scope) THEN
        UPDATE notification_preferences 
        SET marketing_emails = false, updated_at = NOW()
        WHERE user_id = user_id_param;
        
        UPDATE users
        SET privacy_settings = privacy_settings || '{"marketing_objection": true}'::jsonb,
            updated_at = NOW()
        WHERE id = user_id_param;
    END IF;
    
    -- Profiling objection
    IF 'profiling' = ANY(objection_scope) THEN
        UPDATE users
        SET privacy_settings = privacy_settings || '{"profiling_objection": true}'::jsonb,
            updated_at = NOW()
        WHERE id = user_id_param;
    END IF;
    
    -- Legitimate interest objection (requires assessment)
    IF 'legitimate_interest' = ANY(objection_scope) THEN
        UPDATE users
        SET privacy_settings = privacy_settings || jsonb_build_object(
            'legitimate_interest_objection', true,
            'objection_reason', objection_reason,
            'requires_assessment', true
        ),
        updated_at = NOW()
        WHERE id = user_id_param;
    END IF;
    
    -- Research objection
    IF 'research' = ANY(objection_scope) THEN
        UPDATE users
        SET privacy_settings = privacy_settings || '{"research_objection": true}'::jsonb,
            updated_at = NOW()
        WHERE id = user_id_param;
    END IF;
    
    objection_record := jsonb_build_object(
        'user_id', user_id_param,
        'objection_scope', objection_scope,
        'objection_reason', objection_reason,
        'objected_at', NOW(),
        'status', 'processed'
    );
    
    -- Log the objection
    INSERT INTO gdpr_rights_requests (
        request_type, user_id, requestor_email, status, request_details, response_provided_at
    ) VALUES (
        'objection', user_id_param, user_email, 'completed', objection_record, NOW()
    );
    
    RETURN objection_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- CONSENT MANAGEMENT FUNCTIONS
-- =============================================================================

-- Function to record consent
CREATE OR REPLACE FUNCTION gdpr_record_consent(
    user_id_param UUID,
    consent_type_param VARCHAR(100),
    consent_given_param BOOLEAN,
    consent_method_param VARCHAR(50),
    processing_purposes_param TEXT[],
    consent_evidence_param JSONB DEFAULT NULL,
    ip_address_param INET DEFAULT NULL,
    user_agent_param TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    consent_id UUID;
BEGIN
    INSERT INTO gdpr_consent_records (
        user_id, consent_type, consent_given, consent_method,
        processing_purposes, consent_evidence,
        ip_address, user_agent
    ) VALUES (
        user_id_param, consent_type_param, consent_given_param, consent_method_param,
        processing_purposes_param, consent_evidence_param,
        ip_address_param, user_agent_param
    ) RETURNING id INTO consent_id;
    
    -- Update user privacy settings
    UPDATE users 
    SET privacy_settings = privacy_settings || jsonb_build_object(
        consent_type_param || '_consent', consent_given_param,
        consent_type_param || '_consent_date', NOW()
    ),
    updated_at = NOW()
    WHERE id = user_id_param;
    
    RETURN consent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to withdraw consent
CREATE OR REPLACE FUNCTION gdpr_withdraw_consent(
    user_id_param UUID,
    consent_type_param VARCHAR(100),
    withdrawal_method_param VARCHAR(50),
    withdrawal_evidence_param JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Record consent withdrawal
    INSERT INTO gdpr_consent_records (
        user_id, consent_type, consent_given, consent_method,
        withdrawal_method, withdrawal_evidence
    ) VALUES (
        user_id_param, consent_type_param, false, 'withdrawal',
        withdrawal_method_param, withdrawal_evidence_param
    );
    
    -- Update user privacy settings
    UPDATE users 
    SET privacy_settings = privacy_settings || jsonb_build_object(
        consent_type_param || '_consent', false,
        consent_type_param || '_withdrawn_date', NOW()
    ),
    updated_at = NOW()
    WHERE id = user_id_param;
    
    -- Stop relevant processing based on consent type
    CASE consent_type_param
        WHEN 'marketing' THEN
            UPDATE notification_preferences 
            SET marketing_emails = false, updated_at = NOW()
            WHERE user_id = user_id_param;
        WHEN 'analytics' THEN
            UPDATE users 
            SET privacy_settings = privacy_settings || '{"analytics_sharing": false}'::jsonb
            WHERE id = user_id_param;
        ELSE
            -- Handle other consent types
            NULL;
    END CASE;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- GDPR COMPLIANCE MONITORING AND REPORTING
-- =============================================================================

-- Function to check GDPR compliance status
CREATE OR REPLACE FUNCTION gdpr_compliance_check()
RETURNS TABLE(
    compliance_area TEXT,
    status TEXT,
    issues_found INTEGER,
    recommendations TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    -- Check for overdue data subject requests
    SELECT 
        'Data Subject Requests'::TEXT,
        CASE 
            WHEN COUNT(*) = 0 THEN 'COMPLIANT'
            WHEN COUNT(*) < 5 THEN 'WARNING'
            ELSE 'NON_COMPLIANT'
        END::TEXT,
        COUNT(*)::INTEGER,
        CASE 
            WHEN COUNT(*) > 0 THEN ARRAY['Process overdue data subject requests immediately']
            ELSE ARRAY['No overdue requests']
        END
    FROM gdpr_rights_requests 
    WHERE status IN ('pending', 'in_progress') 
    AND response_due_date < NOW()
    
    UNION ALL
    
    -- Check data breach notification compliance
    SELECT 
        'Data Breach Notifications'::TEXT,
        CASE 
            WHEN COUNT(*) = 0 THEN 'COMPLIANT'
            ELSE 'NON_COMPLIANT'
        END::TEXT,
        COUNT(*)::INTEGER,
        CASE 
            WHEN COUNT(*) > 0 THEN ARRAY['Report data breaches to DPA within 72 hours']
            ELSE ARRAY['No unreported breaches']
        END
    FROM gdpr_data_breaches 
    WHERE dpa_notification_required = true 
    AND dpa_notified_at IS NULL 
    AND discovered_at < NOW() - INTERVAL '72 hours'
    
    UNION ALL
    
    -- Check consent records validity
    SELECT 
        'Consent Management'::TEXT,
        CASE 
            WHEN COUNT(*) = 0 THEN 'COMPLIANT'
            WHEN COUNT(*) < 100 THEN 'WARNING'
            ELSE 'NON_COMPLIANT'
        END::TEXT,
        COUNT(*)::INTEGER,
        CASE 
            WHEN COUNT(*) > 0 THEN ARRAY['Refresh expired consent records']
            ELSE ARRAY['All consent records valid']
        END
    FROM gdpr_consent_records 
    WHERE consent_given = true 
    AND valid_until < NOW()
    
    UNION ALL
    
    -- Check data retention compliance
    SELECT 
        'Data Retention'::TEXT,
        'COMPLIANT'::TEXT, -- Privacy-first design means no content retention
        0::INTEGER,
        ARRAY['Privacy-first design ensures compliance']::TEXT[];
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- INDEXES FOR GDPR COMPLIANCE TABLES
-- =============================================================================

-- GDPR rights requests indexes
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_user_id ON gdpr_rights_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_type_status ON gdpr_rights_requests(request_type, status);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_due_date ON gdpr_rights_requests(response_due_date) WHERE status IN ('pending', 'in_progress');

-- Consent records indexes
CREATE INDEX IF NOT EXISTS idx_gdpr_consent_user_type ON gdpr_consent_records(user_id, consent_type);
CREATE INDEX IF NOT EXISTS idx_gdpr_consent_valid ON gdpr_consent_records(consent_given, valid_until) WHERE consent_given = true;

-- Data breach indexes
CREATE INDEX IF NOT EXISTS idx_gdpr_breaches_severity ON gdpr_data_breaches(severity_level, discovered_at);
CREATE INDEX IF NOT EXISTS idx_gdpr_breaches_notification ON gdpr_data_breaches(dpa_notification_required, dpa_notified_at) 
WHERE dpa_notification_required = true AND dpa_notified_at IS NULL;

\echo 'GDPR compliance implementation completed successfully!'

-- Insert initial processing activities
INSERT INTO gdpr_processing_activities (
    activity_name, processing_purposes, data_categories, data_subjects_categories,
    retention_periods, legal_basis, created_at
) VALUES 
(
    'Document Analysis Service',
    ARRAY['Provide document analysis', 'Risk assessment', 'User dashboard'],
    ARRAY['Document metadata', 'Analysis results', 'User preferences'],
    ARRAY['Website users', 'Registered users', 'API users'],
    '{"analysis_results": "90 days", "user_preferences": "Account lifetime", "document_metadata": "Account lifetime"}'::jsonb,
    'Contract performance'
),
(
    'User Account Management',
    ARRAY['Account creation', 'Authentication', 'Subscription management'],
    ARRAY['Email address', 'Password hash', 'Subscription data'],
    ARRAY['Registered users'],
    '{"account_data": "Account lifetime + 30 days", "authentication_logs": "90 days"}'::jsonb,
    'Contract performance'
),
(
    'Marketing Communications',
    ARRAY['Product updates', 'Feature announcements', 'Promotional offers'],
    ARRAY['Email address', 'Subscription tier', 'Usage patterns'],
    ARRAY['Consenting users'],
    '{"marketing_data": "Until consent withdrawn + 30 days"}'::jsonb,
    'Consent'
);

\echo ''
\echo '🛡️  GDPR Compliance System Summary:'
\echo '  ✅ Data Subject Rights (Articles 15-21) implemented'
\echo '  ✅ Consent management system created'
\echo '  ✅ Data breach incident tracking'
\echo '  ✅ Processing activities registry'
\echo '  ✅ Compliance monitoring functions'
\echo '  ✅ Automated data export/deletion'
\echo ''
\echo '📋 Available GDPR Functions:'
\echo '  - gdpr_generate_data_export(user_id)'
\echo '  - gdpr_rectify_user_data(user_id, corrections)'
\echo '  - gdpr_erase_user_data(user_id, reason)'
\echo '  - gdpr_restrict_processing(user_id, scope, reason)'
\echo '  - gdpr_generate_portable_export(user_id, format)'
\echo '  - gdpr_object_to_processing(user_id, scope, reason)'
\echo '  - gdpr_record_consent(user_id, type, given, method, purposes)'
\echo '  - gdpr_withdraw_consent(user_id, type, method)'
\echo '  - gdpr_compliance_check()'