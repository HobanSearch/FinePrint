-- Fine Print AI - Billing System Database Schema
-- Migration 003: Complete billing system with Stripe integration
-- This migration adds all necessary tables for the billing service

-- =============================================================================
-- SUBSCRIPTION EXTENSIONS (add to existing users table)
-- =============================================================================

-- Add new columns to users table for billing
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS subscription_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_subscription_id ON users(subscription_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_expires_at ON users(subscription_expires_at);

-- =============================================================================
-- BILLING TABLES
-- =============================================================================

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_customer_id VARCHAR(255) NOT NULL,
    stripe_price_id VARCHAR(255) NOT NULL,
    tier subscription_tier NOT NULL DEFAULT 'free',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    canceled_at TIMESTAMPTZ,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    subscription_id VARCHAR(255),
    stripe_invoice_id VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    due_date TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    attempt_count INTEGER DEFAULT 0,
    next_payment_attempt TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment methods table
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stripe_payment_method_id VARCHAR(255) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    brand VARCHAR(50),
    last4 VARCHAR(4),
    expiry_month INTEGER,
    expiry_year INTEGER,
    is_default BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage records table
CREATE TABLE IF NOT EXISTS usage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    subscription_id VARCHAR(255),
    metric_type VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit VARCHAR(50) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revenue entries table for revenue recognition
CREATE TABLE IF NOT EXISTS revenue_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    recognized_amount DECIMAL(10,2) NOT NULL,
    deferred_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    recognition_date TIMESTAMPTZ NOT NULL,
    product_type VARCHAR(50) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tax calculations table
CREATE TABLE IF NOT EXISTS tax_calculations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    country VARCHAR(2) NOT NULL,
    region VARCHAR(50),
    postal_code VARCHAR(20),
    tax_rate DECIMAL(5,4) NOT NULL,
    tax_amount DECIMAL(10,2) NOT NULL,
    tax_type VARCHAR(50) NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'stripe_tax',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Refunds table
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    stripe_refund_id VARCHAR(255) UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    reason VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chargebacks table
CREATE TABLE IF NOT EXISTS chargebacks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    stripe_charge_id VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    reason VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    evidence JSONB,
    evidence_submitted_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dunning campaigns table
CREATE TABLE IF NOT EXISTS dunning_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    next_attempt_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dunning attempts table
CREATE TABLE IF NOT EXISTS dunning_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES dunning_campaigns(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    scheduled_at TIMESTAMPTZ NOT NULL,
    executed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing events table for webhook processing
CREATE TABLE IF NOT EXISTS billing_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    subscription_id VARCHAR(255),
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    data JSONB NOT NULL,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end);

-- Invoices indexes
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_id ON invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);

-- Payment methods indexes
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe_id ON payment_methods(stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON payment_methods(user_id, is_default);

-- Usage records indexes
CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_metric_type ON usage_records(metric_type);
CREATE INDEX IF NOT EXISTS idx_usage_records_period ON usage_records(user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at);

-- Revenue entries indexes
CREATE INDEX IF NOT EXISTS idx_revenue_entries_user_id ON revenue_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_entries_invoice_id ON revenue_entries(invoice_id);
CREATE INDEX IF NOT EXISTS idx_revenue_entries_recognition_date ON revenue_entries(recognition_date);
CREATE INDEX IF NOT EXISTS idx_revenue_entries_product_type ON revenue_entries(product_type);

-- Tax calculations indexes
CREATE INDEX IF NOT EXISTS idx_tax_calculations_user_id ON tax_calculations(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_calculations_invoice_id ON tax_calculations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tax_calculations_country ON tax_calculations(country);
CREATE INDEX IF NOT EXISTS idx_tax_calculations_created_at ON tax_calculations(created_at);

-- Refunds indexes
CREATE INDEX IF NOT EXISTS idx_refunds_user_id ON refunds(user_id);
CREATE INDEX IF NOT EXISTS idx_refunds_invoice_id ON refunds(invoice_id);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_id ON refunds(stripe_refund_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON refunds(created_at);

-- Chargebacks indexes
CREATE INDEX IF NOT EXISTS idx_chargebacks_user_id ON chargebacks(user_id);
CREATE INDEX IF NOT EXISTS idx_chargebacks_invoice_id ON chargebacks(invoice_id);
CREATE INDEX IF NOT EXISTS idx_chargebacks_stripe_charge_id ON chargebacks(stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_chargebacks_status ON chargebacks(status);

-- Dunning campaigns indexes
CREATE INDEX IF NOT EXISTS idx_dunning_campaigns_user_id ON dunning_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_dunning_campaigns_invoice_id ON dunning_campaigns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_dunning_campaigns_status ON dunning_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_dunning_campaigns_next_attempt ON dunning_campaigns(next_attempt_at);

-- Dunning attempts indexes
CREATE INDEX IF NOT EXISTS idx_dunning_attempts_campaign_id ON dunning_attempts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_dunning_attempts_scheduled_at ON dunning_attempts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_dunning_attempts_status ON dunning_attempts(status);

-- Billing events indexes
CREATE INDEX IF NOT EXISTS idx_billing_events_user_id ON billing_events(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_event_type ON billing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_events_status ON billing_events(status);
CREATE INDEX IF NOT EXISTS idx_billing_events_next_retry ON billing_events(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_billing_events_created_at ON billing_events(created_at);

-- =============================================================================
-- TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at columns
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_revenue_entries_updated_at BEFORE UPDATE ON revenue_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refunds_updated_at BEFORE UPDATE ON refunds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chargebacks_updated_at BEFORE UPDATE ON chargebacks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dunning_campaigns_updated_at BEFORE UPDATE ON dunning_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_events_updated_at BEFORE UPDATE ON billing_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- VIEWS FOR ANALYTICS
-- =============================================================================

-- Subscription analytics view
CREATE OR REPLACE VIEW subscription_analytics AS
SELECT 
    DATE_TRUNC('month', created_at) as month,
    tier,
    COUNT(*) as new_subscriptions,
    COUNT(*) FILTER (WHERE status = 'active') as active_subscriptions,
    COUNT(*) FILTER (WHERE canceled_at IS NOT NULL) as canceled_subscriptions
FROM subscriptions
GROUP BY DATE_TRUNC('month', created_at), tier
ORDER BY month DESC, tier;

-- Revenue analytics view
CREATE OR REPLACE VIEW revenue_analytics AS
SELECT 
    DATE_TRUNC('month', recognition_date) as month,
    product_type,
    SUM(recognized_amount) as total_revenue,
    COUNT(*) as transaction_count,
    AVG(recognized_amount) as avg_transaction_value
FROM revenue_entries
GROUP BY DATE_TRUNC('month', recognition_date), product_type
ORDER BY month DESC, product_type;

-- Usage analytics view
CREATE OR REPLACE VIEW usage_analytics AS
SELECT 
    DATE_TRUNC('day', created_at) as date,
    metric_type,
    SUM(quantity) as total_usage,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(quantity) as avg_usage_per_user
FROM usage_records
GROUP BY DATE_TRUNC('day', created_at), metric_type
ORDER BY date DESC, metric_type;

-- Invoice status summary view
CREATE OR REPLACE VIEW invoice_status_summary AS
SELECT 
    status,
    COUNT(*) as count,
    SUM(total) as total_amount,
    AVG(total) as avg_amount,
    MIN(created_at) as oldest_invoice,
    MAX(created_at) as newest_invoice
FROM invoices
GROUP BY status
ORDER BY count DESC;

-- =============================================================================
-- CONSTRAINTS AND VALIDATION
-- =============================================================================

-- Add constraints for data integrity
ALTER TABLE subscriptions 
ADD CONSTRAINT chk_subscription_periods 
CHECK (current_period_start < current_period_end);

ALTER TABLE invoices 
ADD CONSTRAINT chk_invoice_amounts 
CHECK (total >= 0 AND subtotal >= 0 AND tax >= 0);

ALTER TABLE usage_records 
ADD CONSTRAINT chk_usage_quantity 
CHECK (quantity >= 0);

ALTER TABLE revenue_entries 
ADD CONSTRAINT chk_revenue_amounts 
CHECK (amount >= 0 AND recognized_amount >= 0 AND deferred_amount >= 0);

ALTER TABLE refunds 
ADD CONSTRAINT chk_refund_amount 
CHECK (amount > 0);

ALTER TABLE chargebacks 
ADD CONSTRAINT chk_chargeback_amount 
CHECK (amount > 0);

-- Unique constraints
ALTER TABLE payment_methods 
ADD CONSTRAINT unique_default_payment_method_per_user 
EXCLUDE (user_id WITH =) WHERE (is_default = true);

-- =============================================================================
-- INITIAL DATA AND SETTINGS
-- =============================================================================

-- Insert default billing settings
INSERT INTO system_settings (key, value, description) VALUES
('billing.trial_period_days', '14', 'Default trial period in days'),
('billing.grace_period_days', '3', 'Grace period for failed payments'),
('billing.dunning_max_attempts', '3', 'Maximum dunning attempts'),
('billing.tax_calculation_enabled', 'true', 'Enable automatic tax calculation'),
('billing.revenue_recognition_enabled', 'true', 'Enable revenue recognition')
ON CONFLICT (key) DO NOTHING;

-- Create indexes for frequently queried patterns
CREATE INDEX IF NOT EXISTS idx_subscriptions_active 
ON subscriptions(user_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_invoices_overdue 
ON invoices(due_date, status) WHERE status IN ('open', 'past_due');

CREATE INDEX IF NOT EXISTS idx_usage_current_month 
ON usage_records(user_id, metric_type) 
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE);

-- =============================================================================
-- STORED PROCEDURES FOR COMMON OPERATIONS
-- =============================================================================

-- Function to calculate MRR (Monthly Recurring Revenue)
CREATE OR REPLACE FUNCTION calculate_mrr(target_date DATE DEFAULT CURRENT_DATE)
RETURNS DECIMAL(12,2) AS $$
DECLARE
    mrr_total DECIMAL(12,2) := 0;
BEGIN
    -- Calculate MRR from active subscriptions
    SELECT COALESCE(SUM(
        CASE 
            WHEN s.tier = 'starter' THEN 9.00
            WHEN s.tier = 'professional' THEN 29.00
            WHEN s.tier = 'team' THEN 99.00
            ELSE 0
        END
    ), 0) INTO mrr_total
    FROM subscriptions s
    JOIN users u ON s.user_id = u.id
    WHERE s.status = 'active'
    AND s.created_at <= target_date
    AND (s.canceled_at IS NULL OR s.canceled_at > target_date)
    AND u.status = 'active';
    
    RETURN mrr_total;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate churn rate
CREATE OR REPLACE FUNCTION calculate_churn_rate(
    start_date DATE,
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    total_customers INTEGER := 0;
    churned_customers INTEGER := 0;
    churn_rate DECIMAL(5,2) := 0;
BEGIN
    -- Count total customers at start of period
    SELECT COUNT(*) INTO total_customers
    FROM subscriptions s
    WHERE s.status = 'active'
    AND s.created_at <= start_date;
    
    -- Count churned customers during period
    SELECT COUNT(*) INTO churned_customers
    FROM subscriptions s
    WHERE s.canceled_at BETWEEN start_date AND end_date;
    
    -- Calculate churn rate
    IF total_customers > 0 THEN
        churn_rate := (churned_customers::DECIMAL / total_customers::DECIMAL) * 100;
    END IF;
    
    RETURN churn_rate;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- MIGRATION COMPLETION
-- =============================================================================

-- Update migration tracking
INSERT INTO migrations (version, name, executed_at) 
VALUES (3, '003_billing_system', NOW())
ON CONFLICT (version) DO UPDATE SET 
    executed_at = NOW(),
    name = EXCLUDED.name;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Billing system migration completed successfully';
    RAISE NOTICE 'Added tables: subscriptions, invoices, payment_methods, usage_records, revenue_entries, tax_calculations, refunds, chargebacks, dunning_campaigns, dunning_attempts, billing_events';
    RAISE NOTICE 'Added views: subscription_analytics, revenue_analytics, usage_analytics, invoice_status_summary';
    RAISE NOTICE 'Added functions: calculate_mrr(), calculate_churn_rate()';
END $$;