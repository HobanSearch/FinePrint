# External Integrations Service

Comprehensive integration service for Fine Print AI that handles payment processing (Stripe), email communications (SendGrid), and social media platform integrations.

## Features

### Stripe Integration
- **Subscription Management**: Create, update, and cancel subscriptions
- **Payment Processing**: Handle one-time and recurring payments
- **Customer Management**: Create and manage customer profiles
- **Usage-Based Billing**: Track and bill for metered usage
- **Invoice Management**: Generate and retrieve invoices
- **Payment Methods**: Add and manage payment methods
- **Checkout Sessions**: Create hosted checkout experiences
- **Billing Portal**: Customer self-service portal
- **Webhook Processing**: Real-time event handling

### SendGrid Integration  
- **Transactional Emails**: Send templated emails with personalization
- **Email Campaigns**: Bulk email sending with scheduling
- **Template Management**: Create and manage email templates
- **Analytics Tracking**: Open rates, click rates, and engagement metrics
- **Bounce Handling**: Automatic bounce and unsubscribe management
- **Attachment Support**: Send files with emails
- **Scheduled Emails**: Queue emails for future delivery
- **Recurring Emails**: Set up automated email sequences

### Social Media Integration
- **Multi-Platform Support**: Twitter, LinkedIn, Facebook
- **Post Publishing**: Create and publish posts across platforms
- **Post Scheduling**: Schedule posts for optimal times
- **Campaign Management**: Coordinate multi-post campaigns
- **Analytics**: Track engagement, impressions, and growth
- **Content Suggestions**: AI-powered content recommendations
- **Mention Monitoring**: Track brand mentions and keywords
- **Profile Management**: Connect and manage multiple profiles

### Webhook Processing
- **Unified Handler**: Process webhooks from all integrated services
- **Signature Validation**: Secure webhook verification
- **Retry Logic**: Automatic retry for failed webhooks
- **Event Deduplication**: Prevent duplicate processing
- **Event History**: Track and query webhook events

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│               External Integrations Service                   │
├─────────────────────────────────────────────────────────────┤
│                         API Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Stripe  │  │  Email   │  │  Social  │  │ Webhooks │    │
│  │  Routes  │  │  Routes  │  │  Routes  │  │  Routes  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
├─────────────────────────────────────────────────────────────┤
│                      Service Layer                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Stripe  │  │ SendGrid │  │  Social  │  │ Webhook  │    │
│  │ Service  │  │ Service  │  │  Media   │  │Processor │    │
│  │          │  │          │  │ Service  │  │          │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
├─────────────────────────────────────────────────────────────┤
│                    External APIs                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Stripe  │  │ SendGrid │  │ Twitter  │  │ LinkedIn │    │
│  │   API    │  │   API    │  │   API    │  │   API    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Stripe Endpoints
- `POST /api/stripe/customers` - Create customer
- `GET /api/stripe/customers/:customerId` - Get customer
- `POST /api/stripe/subscriptions` - Create subscription
- `PATCH /api/stripe/subscriptions/:id` - Update subscription
- `DELETE /api/stripe/subscriptions/:id` - Cancel subscription
- `POST /api/stripe/customers/:id/payment-methods` - Add payment method
- `GET /api/stripe/customers/:id/payment-methods` - List payment methods
- `POST /api/stripe/usage` - Record usage
- `GET /api/stripe/customers/:id/invoices` - Get invoices
- `POST /api/stripe/checkout/sessions` - Create checkout session
- `POST /api/stripe/customers/:id/billing-portal` - Create portal session
- `GET /api/stripe/plans` - List subscription plans
- `GET /api/stripe/plans/:planId` - Get plan details

### Email Endpoints
- `POST /api/email/send` - Send email
- `POST /api/email/campaigns` - Create campaign
- `GET /api/email/campaigns/:id` - Get campaign
- `GET /api/email/analytics` - Get email analytics
- `GET /api/email/templates` - List templates
- `GET /api/email/templates/:id` - Get template
- `POST /api/email/templates` - Create template
- `POST /api/email/schedule/recurring` - Schedule recurring email
- `POST /api/email/test` - Send test email

### Social Media Endpoints
- `POST /api/social/profiles` - Connect profile
- `DELETE /api/social/profiles/:platform/:id` - Disconnect profile
- `GET /api/social/profiles` - List profiles
- `POST /api/social/posts` - Publish post
- `POST /api/social/posts/schedule` - Schedule post
- `POST /api/social/campaigns` - Create campaign
- `GET /api/social/analytics/:platform/:profileId` - Get analytics
- `POST /api/social/content/suggestions` - Generate content
- `POST /api/social/monitoring/mentions` - Monitor mentions

### Webhook Endpoints
- `POST /api/webhooks/stripe` - Stripe webhooks
- `POST /api/webhooks/sendgrid` - SendGrid webhooks
- `POST /api/webhooks/social/:platform` - Social media webhooks
- `POST /api/webhooks/custom/:source` - Custom webhooks
- `GET /api/webhooks/events` - List webhook events
- `POST /api/webhooks/events/:id/retry` - Retry webhook
- `GET /api/webhooks/statistics` - Get statistics

## Configuration

### Environment Variables

```bash
# Service Configuration
PORT=8010
HOST=0.0.0.0
NODE_ENV=production

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# SendGrid
SENDGRID_API_KEY=SG....
SENDGRID_WEBHOOK_SECRET=...
FROM_EMAIL=noreply@fineprintai.com
FROM_NAME=Fine Print AI
REPLY_TO_EMAIL=support@fineprintai.com

# Social Media - Twitter
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_SECRET=...

# Social Media - LinkedIn
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...

# Social Media - Facebook
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=...

# Authentication
JWT_SECRET=your-jwt-secret

# CORS
CORS_ORIGINS=http://localhost:3000,https://app.fineprintai.com
```

## Usage Examples

### Creating a Stripe Subscription

```typescript
const response = await fetch('/api/stripe/subscriptions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    customerId: 'user_123',
    planId: 'professional',
    paymentMethodId: 'pm_1234567890'
  })
});

const { subscription } = await response.json();
```

### Sending an Email

```typescript
const response = await fetch('/api/email/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    to: {
      email: 'user@example.com',
      name: 'John Doe'
    },
    templateId: 'welcome',
    variables: {
      userName: 'John',
      activationLink: 'https://app.fineprintai.com/activate',
      planName: 'Professional'
    }
  })
});

const { emailId } = await response.json();
```

### Publishing a Social Media Post

```typescript
const response = await fetch('/api/social/posts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    platform: 'twitter',
    profileId: 'profile_123',
    content: 'Check out our latest AI-powered legal document analysis!',
    hashtags: ['LegalTech', 'AI', 'FinePrintAI'],
    link: 'https://fineprintai.com/blog/latest'
  })
});

const { post } = await response.json();
```

## Subscription Plans

### Starter Plan - $29/month
- 100 documents per month
- 1,000 API calls
- 2 team members
- Basic risk analysis
- Email support

### Professional Plan - $99/month
- 500 documents per month
- 10,000 API calls
- 10 team members
- Advanced risk analysis
- Custom risk profiles
- Priority support
- API access

### Enterprise Plan - $499/month
- Unlimited documents
- Unlimited API calls
- Unlimited team members
- Custom AI models
- Dedicated support
- SLA guarantee
- On-premise deployment

## Email Templates

The service includes pre-built email templates:

1. **Welcome Email** - New user onboarding
2. **Document Analysis Complete** - Analysis results notification
3. **Subscription Renewal** - Billing reminders
4. **Risk Alert** - High-risk clause notifications
5. **Weekly Summary** - Usage and insights summary
6. **Team Invitation** - Invite team members
7. **Password Reset** - Security emails
8. **Trial Ending** - Conversion prompts

## Development

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Type checking
npm run typecheck
```

### Building

```bash
# Build for production
npm run build

# Start production server
npm run start
```

## Webhook Security

All incoming webhooks are validated using:

1. **Signature Verification**: HMAC-SHA256 signatures
2. **Timestamp Validation**: Prevent replay attacks
3. **Event Deduplication**: Prevent double processing
4. **IP Whitelisting**: Optional IP restrictions

## Rate Limiting

The service implements rate limiting:
- 100 requests per minute per IP (general)
- 1000 emails per hour per account
- 300 social posts per day per profile
- Webhook endpoints have higher limits

## Monitoring

Key metrics to monitor:
- Payment success/failure rates
- Email delivery rates
- Social media post success
- Webhook processing latency
- API response times

## Error Handling

The service implements comprehensive error handling:
- Automatic retries for transient failures
- Detailed error logging
- User-friendly error messages
- Webhook retry queues
- Circuit breakers for external APIs

## Security

- JWT authentication for all endpoints
- Role-based access control
- Secure credential storage
- Webhook signature validation
- Rate limiting and DDoS protection

## License

Copyright © 2024 Fine Print AI. All rights reserved.