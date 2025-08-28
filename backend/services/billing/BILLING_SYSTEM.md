# Fine Print AI - Complete Billing System

## Overview

This document describes the comprehensive billing system implementation for Fine Print AI, including Stripe integration, subscription management, usage-based billing, tax compliance, and revenue recognition.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Billing Service                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │Subscription │  │   Usage     │  │    Revenue      │  │
│  │ Management  │  │  Tracking   │  │ Recognition     │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │    Tax      │  │   Dunning   │  │   Refunds &     │  │
│  │Calculation  │  │ Management  │  │  Chargebacks    │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                  Stripe Integration                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  Webhooks   │  │  Payments   │  │   Customers     │  │
│  │  Handler    │  │ Processing  │  │   & Products    │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Pricing Tiers

### Tier Configuration

| Tier | Price | Analyses/Month | Monitoring | API Access | Team Size |
|------|-------|----------------|------------|------------|-----------|
| Free | $0 | 3 | ❌ | ❌ | 1 |
| Starter | $9 | 20 | 5 docs | ❌ | 1 |
| Professional | $29 | Unlimited | Unlimited | 1k calls | 1 |
| Team | $99 | Unlimited | Unlimited | 10k calls | 5 |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited | Unlimited |

### Usage-Based Billing

- **Analysis Overage**: $0.50 per additional analysis
- **API Overage**: $0.01 per additional API call
- **Additional Monitored Documents**: $1.00 per document/month
- **Additional Team Members**: $10.00 per member/month

## Core Services

### 1. Subscription Service

**Location**: `src/services/subscription.service.ts`

**Key Features**:
- Create subscriptions with Stripe integration
- Manage subscription lifecycle (create, update, cancel, reactivate)
- Handle trial periods and proration
- Usage limit enforcement
- Automatic tier transitions

**API Endpoints**:
```typescript
POST   /api/billing/subscription          // Create subscription
GET    /api/billing/subscription          // Get current subscription
PUT    /api/billing/subscription          // Update subscription
POST   /api/billing/subscription/cancel   // Cancel subscription
POST   /api/billing/subscription/reactivate // Reactivate subscription
```

### 2. Usage Service

**Location**: `src/services/usage.service.ts`

**Key Features**:
- Track usage by metric type (analyses, API calls, etc.)
- Calculate overage charges
- Generate usage reports
- Billing period management
- Usage analytics

**Usage Metrics**:
- `ANALYSES`: Document analysis count
- `API_CALLS`: API endpoint calls
- `MONITORED_DOCUMENTS`: Active document monitoring
- `TEAM_MEMBERS`: Team member count

### 3. Webhook Service

**Location**: `src/services/webhook.service.ts`

**Handled Events**:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `charge.dispute.created`
- Payment method changes

**Security**:
- Stripe signature verification
- Idempotency handling
- Event retry mechanism

### 4. Tax Service

**Location**: `src/services/tax.service.ts`

**Supported Providers**:
- Stripe Tax (primary)
- TaxJar (fallback)
- Avalara AvaTax (enterprise)

**Features**:
- Automatic tax calculation
- Tax nexus determination
- Multi-jurisdiction support
- Tax exemption handling
- Compliance reporting

### 5. Revenue Recognition Service

**Location**: `src/services/revenue.service.ts`

**Recognition Rules**:
- **Subscription Revenue**: Monthly recognition over contract period
- **Usage Revenue**: Immediate recognition upon service delivery
- **One-time Fees**: Immediate recognition

**Metrics**:
- ARR (Annual Recurring Revenue)
- MRR (Monthly Recurring Revenue)
- Churn rates
- LTV (Lifetime Value)
- Cohort analysis

### 6. Dunning Management Service

**Location**: `src/services/dunning.service.ts`

**Dunning Sequence**:
1. Day 1: Email reminder
2. Day 3: Payment retry + email
3. Day 7: Email reminder
4. Day 14: Payment retry + email
5. Day 21: Final notice
6. Day 30: Account suspension

**Features**:
- Automated retry logic
- Customizable sequences
- Success tracking
- Manual intervention options

### 7. Refunds & Chargebacks Service

**Location**: `src/services/refunds.service.ts`

**Refund Reasons**:
- `DUPLICATE`: Duplicate payment
- `FRAUDULENT`: Fraudulent transaction
- `REQUESTED_BY_CUSTOMER`: Customer request
- `EXPIRED_UNCAPTURED_CHARGE`: Expired authorization

**Chargeback Handling**:
- Automatic dispute tracking
- Evidence submission
- Win/loss tracking
- Risk monitoring

## Database Schema

### Core Tables

#### Subscriptions
```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    stripe_subscription_id VARCHAR(255) UNIQUE,
    tier subscription_tier,
    status VARCHAR(50),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    -- ... additional fields
);
```

#### Invoices
```sql
CREATE TABLE invoices (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    stripe_invoice_id VARCHAR(255) UNIQUE,
    total DECIMAL(10,2),
    status VARCHAR(50),
    due_date TIMESTAMPTZ,
    -- ... additional fields
);
```

#### Usage Records
```sql
CREATE TABLE usage_records (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    metric_type VARCHAR(50),
    quantity INTEGER,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    -- ... additional fields
);
```

### Analytics Views

```sql
-- Monthly Revenue View
CREATE VIEW revenue_analytics AS
SELECT 
    DATE_TRUNC('month', recognition_date) as month,
    product_type,
    SUM(recognized_amount) as total_revenue
FROM revenue_entries
GROUP BY month, product_type;

-- Subscription Analytics View
CREATE VIEW subscription_analytics AS
SELECT 
    tier,
    COUNT(*) FILTER (WHERE status = 'active') as active_count,
    COUNT(*) FILTER (WHERE canceled_at IS NOT NULL) as churned_count
FROM subscriptions
GROUP BY tier;
```

## API Documentation

### Authentication

All billing endpoints require JWT authentication:

```http
Authorization: Bearer <jwt_token>
```

### Rate Limiting

- Standard endpoints: 100 requests/15min per user
- Webhook endpoints: 1000 requests/min per IP
- Admin endpoints: 500 requests/15min per admin

### Example Requests

#### Create Subscription
```http
POST /api/billing/subscription
Content-Type: application/json

{
  "tier": "professional",
  "paymentMethodId": "pm_1234567890",
  "trialDays": 14,
  "couponCode": "SAVE20"
}
```

#### Get Usage Data
```http
GET /api/billing/usage/current

Response:
{
  "success": true,
  "data": {
    "analyses": 45,
    "apiCalls": 250,
    "monitoredDocuments": 12,
    "limits": {
      "analyses": -1,
      "apiCalls": 1000,
      "monitoredDocuments": -1
    }
  }
}
```

#### Process Webhook
```http
POST /webhooks/stripe
Content-Type: application/json
Stripe-Signature: t=1234567890,v1=signature

{
  "id": "evt_1234567890",
  "type": "invoice.payment_succeeded",
  "data": {
    "object": {
      "id": "in_1234567890",
      "customer": "cus_1234567890",
      "status": "paid"
    }
  }
}
```

## Security & Compliance

### PCI Compliance

- **No card data storage**: All payment methods stored in Stripe
- **Secure token usage**: Only Stripe tokens and IDs stored
- **Webhook verification**: All webhooks cryptographically verified
- **Audit logging**: All payment operations logged

### Data Protection

- **Encryption at rest**: Sensitive data encrypted in database
- **Encryption in transit**: TLS 1.2+ for all communications
- **Access controls**: Role-based access to billing data
- **Data retention**: Configurable retention policies

### Financial Controls

- **Reconciliation**: Daily Stripe reconciliation
- **Fraud detection**: Automated risk scoring
- **Refund policies**: Defined refund approval workflows
- **Revenue recognition**: GAAP-compliant recognition rules

## Testing

### Test Coverage

The billing system includes comprehensive tests:

- **Unit Tests**: Service layer testing with mocks
- **Integration Tests**: API endpoint testing
- **Webhook Tests**: Stripe webhook simulation
- **Edge Cases**: Error handling and recovery

### Test Configuration

```typescript
// Test environment setup
process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_...';
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
```

### Running Tests

```bash
# Run all billing tests
npm test

# Run specific test suite
npm test -- subscription.service.test.ts

# Run tests with coverage
npm run test:coverage
```

## Monitoring & Alerting

### Key Metrics

1. **Financial Metrics**:
   - MRR/ARR growth
   - Churn rate
   - Payment success rate
   - Refund rate

2. **Operational Metrics**:
   - Webhook processing time
   - Failed payment recovery rate
   - Dunning campaign success rate
   - Tax calculation accuracy

3. **System Metrics**:
   - API response times
   - Error rates
   - Database performance
   - Queue processing times

### Alerts

- **Critical**: Payment processing failures
- **Warning**: High churn rate, failed webhooks
- **Info**: Subscription changes, usage limits

## Deployment

### Environment Variables

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Database
DATABASE_URL=postgresql://user:pass@host/db

# Redis
REDIS_URL=redis://host:6379

# Tax Services (optional)
TAXJAR_API_KEY=...
AVATAX_API_KEY=...

# Email
SENDGRID_API_KEY=SG....

# Security
JWT_SECRET=...
ENCRYPTION_KEY=...
```

### Docker Deployment

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

USER node
EXPOSE 3003

CMD ["node", "dist/index.js"]
```

### Health Checks

```bash
# Health endpoint
curl http://localhost:3003/health

# Detailed health check
curl http://localhost:3003/health/detailed
```

## Troubleshooting

### Common Issues

1. **Webhook Failures**:
   - Check Stripe signature verification
   - Verify webhook endpoint configuration
   - Review error logs for processing failures

2. **Payment Failures**:
   - Insufficient funds
   - Expired payment methods
   - International card restrictions

3. **Tax Calculation Errors**:
   - Invalid customer address
   - Service provider API limits
   - Unsupported jurisdictions

### Debug Tools

```bash
# View recent billing events
curl -H "Authorization: Bearer $JWT" \
  http://localhost:3003/api/billing/events?limit=50

# Check subscription status
curl -H "Authorization: Bearer $JWT" \
  http://localhost:3003/api/billing/subscription

# Retry failed webhooks
curl -X POST -H "Authorization: Bearer $ADMIN_JWT" \
  http://localhost:3003/admin/webhooks/retry
```

## Support & Maintenance

### Regular Tasks

1. **Daily**:
   - Process dunning campaigns
   - Reconcile Stripe transactions
   - Monitor failed payments

2. **Weekly**:
   - Review churn analytics
   - Process refund requests
   - Update tax rates

3. **Monthly**:
   - Generate revenue reports
   - Process revenue recognition
   - Review subscription metrics

### Backup & Recovery

- **Database backups**: Daily automated backups
- **Configuration backups**: Version-controlled settings
- **Disaster recovery**: Multi-region deployment ready

---

## Contributing

See the main project [CONTRIBUTING.md](../../../CONTRIBUTING.md) for guidelines on contributing to the billing system.

## License

This billing system is part of Fine Print AI and is subject to the project's license terms.