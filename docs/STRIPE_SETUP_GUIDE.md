# Stripe Payment Integration Setup Guide

## Overview

Fine Print AI uses Stripe for subscription billing, payment processing, and revenue management. This guide will walk you through setting up Stripe for your deployment.

## Prerequisites

- Stripe account (create at https://stripe.com)
- Domain name with SSL certificate
- Deployed Fine Print AI application

## Step 1: Stripe Account Setup

### 1.1 Create Stripe Account

1. Go to https://dashboard.stripe.com/register
2. Complete business verification
3. Enable production mode

### 1.2 Configure Business Settings

Navigate to Settings → Business settings:

- **Business details**: Add your company information
- **Customer emails**: Enable payment receipts
- **Branding**: Upload logo and set brand colors

## Step 2: Create Products and Prices

### 2.1 Navigate to Products

Go to https://dashboard.stripe.com/products

### 2.2 Create Subscription Products

Create the following products with their respective prices:

#### Starter Plan
- **Name**: Fine Print AI Starter
- **Description**: 20 analyses/month, 5 monitored docs
- **Pricing**:
  - Monthly: $9.00 (recurring)
  - Annual: $91.80 (recurring, billed yearly)
- **Features metadata**:
  ```json
  {
    "tier": "starter",
    "analyses_limit": "20",
    "monitored_docs": "5",
    "api_calls": "0"
  }
  ```

#### Professional Plan
- **Name**: Fine Print AI Professional
- **Description**: Unlimited analyses, 1000 API calls
- **Pricing**:
  - Monthly: $29.00 (recurring)
  - Annual: $295.80 (recurring, billed yearly)
- **Features metadata**:
  ```json
  {
    "tier": "professional",
    "analyses_limit": "unlimited",
    "monitored_docs": "unlimited",
    "api_calls": "1000"
  }
  ```

#### Team Plan
- **Name**: Fine Print AI Team
- **Description**: 5 team members, 10000 API calls
- **Pricing**:
  - Monthly: $99.00 (recurring)
  - Annual: $1009.80 (recurring, billed yearly)
- **Features metadata**:
  ```json
  {
    "tier": "team",
    "analyses_limit": "unlimited",
    "monitored_docs": "unlimited",
    "api_calls": "10000",
    "team_members": "5"
  }
  ```

### 2.3 Save Price IDs

After creating products, copy the price IDs:
- Click on each product
- Copy the price ID (starts with `price_`)
- Save these for environment configuration

## Step 3: Configure Webhooks

### 3.1 Create Webhook Endpoint

1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Enter endpoint URL: `https://your-domain.com/api/billing/webhooks`
4. Select events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.created`
   - `invoice.finalized`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_method.attached`
   - `payment_method.detached`
   - `charge.dispute.created`
   - `charge.refunded`

### 3.2 Save Webhook Secret

After creating the webhook:
1. Click on the webhook
2. Reveal the "Signing secret"
3. Copy it (starts with `whsec_`)
4. Save for environment configuration

## Step 4: Configure Tax Settings (Optional)

### 4.1 Enable Stripe Tax

1. Go to https://dashboard.stripe.com/settings/tax
2. Click "Activate Tax"
3. Configure tax registrations for your jurisdictions

### 4.2 Set Tax Behavior

In your product settings:
- Set tax behavior to "Inclusive" or "Exclusive"
- Configure tax codes for digital services

## Step 5: Setup Customer Portal

### 5.1 Configure Portal

1. Go to https://dashboard.stripe.com/settings/billing/portal
2. Configure features:
   - ✅ Update payment methods
   - ✅ View invoices
   - ✅ Cancel subscriptions
   - ✅ Update billing address
   - ✅ Switch plans

### 5.2 Customize Portal

- Add business information
- Set cancellation policy
- Configure proration behavior
- Add terms of service link

## Step 6: Environment Configuration

### 6.1 Backend Configuration

Add to `/opt/fineprintai/.env.production`:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_YOUR_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET

# Stripe Price IDs
STRIPE_PRICE_STARTER_MONTHLY=price_xxxxx
STRIPE_PRICE_STARTER_ANNUAL=price_xxxxx
STRIPE_PRICE_PROFESSIONAL_MONTHLY=price_xxxxx
STRIPE_PRICE_PROFESSIONAL_ANNUAL=price_xxxxx
STRIPE_PRICE_TEAM_MONTHLY=price_xxxxx
STRIPE_PRICE_TEAM_ANNUAL=price_xxxxx

# Optional
STRIPE_TAX_ENABLED=true
```

### 6.2 Frontend Configuration

Add to `apps/web/.env.production`:

```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_PUBLISHABLE_KEY
VITE_API_URL=https://your-domain.com/api
VITE_ENABLE_PAYMENTS=true
```

## Step 7: Test Configuration

### 7.1 Use Test Mode First

1. Switch to test mode in Stripe Dashboard
2. Use test API keys (start with `sk_test_` and `pk_test_`)
3. Test with Stripe test cards:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - 3D Secure: `4000 0025 0000 3155`

### 7.2 Test Scenarios

Test the following flows:
1. **New subscription**: Sign up for paid plan
2. **Payment update**: Change payment method
3. **Plan upgrade**: Move from Starter to Professional
4. **Plan downgrade**: Move from Professional to Starter
5. **Cancellation**: Cancel subscription
6. **Reactivation**: Reactivate canceled subscription
7. **Failed payment**: Test with declining card
8. **Webhook handling**: Verify webhook events are processed

### 7.3 Verify Database Updates

Check that the following are updated correctly:
- User subscription status
- Usage limits
- Invoice records
- Payment method storage

## Step 8: Go Live

### 8.1 Pre-launch Checklist

- [ ] All products and prices created
- [ ] Webhook endpoint configured and tested
- [ ] Environment variables set correctly
- [ ] SSL certificate active
- [ ] Customer portal configured
- [ ] Tax settings configured (if applicable)
- [ ] Test mode thoroughly tested
- [ ] Backup payment processing plan

### 8.2 Switch to Production

1. Update all test keys to live keys
2. Update webhook endpoint to use live endpoint
3. Test with real payment (small amount)
4. Monitor first few transactions closely

## Step 9: Monitoring and Maintenance

### 9.1 Regular Monitoring

- Check Stripe Dashboard daily for:
  - Failed payments
  - Disputes
  - Subscription changes
  - Revenue metrics

### 9.2 Setup Alerts

Configure email alerts for:
- Failed payments
- Disputes
- Large transactions
- Unusual activity

### 9.3 Monthly Tasks

- Review subscription metrics
- Analyze churn rate
- Update pricing if needed
- Export financial reports

## Troubleshooting

### Common Issues

#### Webhook Signature Verification Failed
```bash
# Verify webhook secret is correct
echo $STRIPE_WEBHOOK_SECRET

# Check request headers
curl -X POST https://your-domain.com/api/billing/webhooks \
  -H "Stripe-Signature: ..." \
  -d '{...}'
```

#### Payment Intents Not Completing
```javascript
// Ensure you're confirming the payment
const { error } = await stripe.confirmPayment({
  elements,
  confirmParams: {
    return_url: 'https://your-domain.com/success',
  },
});
```

#### Subscription Not Updating
```bash
# Check webhook logs in Stripe Dashboard
# Verify database connection
# Check application logs
docker logs fineprintai-api
```

## API Integration Examples

### Create Subscription (Backend)

```typescript
// backend/services/billing/src/services/subscription.service.ts
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: priceId }],
  payment_behavior: 'default_incomplete',
  payment_settings: {
    save_default_payment_method: 'on_subscription',
  },
  expand: ['latest_invoice.payment_intent'],
  metadata: {
    userId: user.id,
    tier: 'professional',
  },
});
```

### Handle Webhook (Backend)

```typescript
// backend/services/billing/src/routes/webhooks.ts
const sig = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(
  req.body,
  sig,
  process.env.STRIPE_WEBHOOK_SECRET
);

switch (event.type) {
  case 'customer.subscription.updated':
    await handleSubscriptionUpdate(event.data.object);
    break;
  // Handle other events
}
```

### Payment Form (Frontend)

```tsx
// apps/web/src/components/PaymentForm.tsx
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

<Elements stripe={stripePromise} options={{ clientSecret }}>
  <PaymentElement />
</Elements>
```

## Security Best Practices

1. **Never expose secret keys**: Only use publishable keys in frontend
2. **Validate webhooks**: Always verify webhook signatures
3. **Use HTTPS**: All payment pages must use SSL
4. **PCI Compliance**: Use Stripe Elements, never handle raw card data
5. **Secure storage**: Encrypt sensitive data in database
6. **Rate limiting**: Implement rate limits on payment endpoints
7. **Monitoring**: Set up alerts for suspicious activity
8. **Testing**: Always test in Stripe test mode first

## Support Resources

- **Stripe Documentation**: https://stripe.com/docs
- **API Reference**: https://stripe.com/docs/api
- **Testing Cards**: https://stripe.com/docs/testing
- **Support**: https://support.stripe.com
- **Status**: https://status.stripe.com

## Compliance

Ensure compliance with:
- **PCI DSS**: Payment Card Industry Data Security Standard
- **GDPR**: General Data Protection Regulation
- **PSD2/SCA**: Strong Customer Authentication requirements
- **Tax regulations**: Local tax collection requirements

---

For additional help with Stripe integration, contact support@fineprintai.com