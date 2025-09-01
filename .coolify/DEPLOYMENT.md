# Coolify Deployment Guide for Fine Print AI

## Prerequisites

- Hetzner server with Ubuntu 22.04 LTS
- Domain name pointing to your server
- Coolify installed on the server
- GitHub repository access

## Step 1: Install Coolify on Hetzner

```bash
# SSH into your Hetzner server
ssh root@your-server-ip

# Run the Coolify installation script
curl -fsSL https://get.coolify.io | bash

# The installer will provide you with the Coolify dashboard URL
# Usually: http://your-server-ip:8000
```

## Step 2: Initial Coolify Setup

1. Access Coolify dashboard at `http://your-server-ip:8000`
2. Create admin account
3. Configure server settings:
   - Enable automatic SSL with Let's Encrypt
   - Configure email for notifications
   - Set up backup schedule

## Step 3: Connect GitHub Repository

1. In Coolify dashboard, go to **Sources** → **Add New Source**
2. Select **GitHub**
3. Authenticate with GitHub (or use deploy key)
4. Select the Fine Print AI repository

## Step 4: Create New Application

1. Go to **Applications** → **Add New Application**
2. Select **Docker Compose** as deployment type
3. Choose your GitHub source
4. Configure:
   - **Name**: Fine Print AI
   - **Branch**: main
   - **Compose Path**: .coolify/docker-compose.yml
   - **Environment File**: .coolify/.env

## Step 5: Configure Environment Variables

1. Copy `.coolify/.env.example` to `.coolify/.env`
2. In Coolify dashboard, go to your application's **Environment** tab
3. Add all required environment variables:

```bash
# Essential Variables (MUST be configured)
DOMAIN=your-domain.com
DB_PASSWORD=generate-secure-password
JWT_SECRET=generate-32-char-secret
JWT_REFRESH_SECRET=generate-32-char-secret

# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_your_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret

# Email Configuration
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
SMTP_FROM=noreply@your-domain.com
```

## Step 6: Configure Domains

1. In application settings, go to **Domains** tab
2. Add your domains:
   - Primary: `your-domain.com`
   - API: `api.your-domain.com` (optional subdomain)
   - WebSocket: `ws.your-domain.com` (optional subdomain)
3. Enable **Force HTTPS**
4. Click **Generate SSL Certificate**

## Step 7: Configure Resources

1. Go to **Resources** tab
2. Set resource limits:
   - **CPU**: Min 2 cores, Max 8 cores
   - **Memory**: Min 4GB, Max 16GB
   - **Storage**: Allocate persistent volumes
3. Enable GPU if available (for Ollama AI models)

## Step 8: Deploy Application

1. Go to **Deployments** tab
2. Click **Deploy Now**
3. Monitor deployment logs
4. Wait for all health checks to pass

## Step 9: Initialize Database

After first deployment, run initialization:

```bash
# SSH into server
ssh root@your-server-ip

# Access the API container
docker exec -it fineprintai-api bash

# Run database migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed

# Exit container
exit
```

## Step 10: Download AI Models

```bash
# Access the Ollama container
docker exec -it fineprintai-ollama bash

# Pull required models
ollama pull phi-2:2.7b
ollama pull mistral:7b
ollama pull llama2:13b

# Verify models
ollama list

# Exit container
exit
```

## Step 11: Configure Stripe Webhooks

1. Log into Stripe Dashboard
2. Go to **Developers** → **Webhooks**
3. Add endpoint: `https://your-domain.com/api/billing/webhooks`
4. Select events:
   - `customer.subscription.*`
   - `invoice.*`
   - `payment_intent.*`
5. Copy webhook signing secret to Coolify environment

## Step 12: Set Up Monitoring

1. In Coolify, go to **Monitoring** tab
2. Enable:
   - Prometheus metrics
   - Grafana dashboards
   - Log aggregation with Loki
3. Configure alerts:
   - Email notifications
   - Slack/Discord webhooks (optional)

## Step 13: Configure Backups

1. Go to **Backups** tab
2. Set schedule: Daily at 2 AM
3. Configure retention: 30 days
4. Select volumes to backup:
   - postgres_data
   - qdrant_data
5. Optional: Configure S3 backup destination

## Step 14: Enable Auto-Deploy

1. Go to **Settings** → **GitHub Integration**
2. Enable **Auto Deploy on Push**
3. Select branch: `main`
4. Configure webhook secret

## Verification Checklist

- [ ] Application accessible at `https://your-domain.com`
- [ ] SSL certificate active and valid
- [ ] API health check passing: `https://your-domain.com/api/health`
- [ ] WebSocket connection working
- [ ] Database migrations completed
- [ ] AI models downloaded and accessible
- [ ] Stripe webhook configured and verified
- [ ] Monitoring dashboards accessible
- [ ] Backup schedule configured
- [ ] Auto-deploy from GitHub working

## Troubleshooting

### Application Not Starting

```bash
# Check logs in Coolify dashboard
# Or via SSH:
docker logs fineprintai-api
docker logs fineprintai-web
```

### Database Connection Issues

```bash
# Verify PostgreSQL is running
docker ps | grep postgres

# Check database logs
docker logs fineprintai-postgres

# Test connection
docker exec -it fineprintai-postgres psql -U fineprintai_user -d fineprintai
```

### SSL Certificate Issues

1. Verify DNS is pointing to server
2. Check Coolify SSL logs
3. Manually trigger certificate renewal in Coolify

### AI Model Issues

```bash
# Check Ollama status
docker logs fineprintai-ollama

# Verify models are loaded
docker exec fineprintai-ollama ollama list

# Test model inference
docker exec fineprintai-ollama ollama run phi-2:2.7b "Test prompt"
```

## Maintenance

### Update Application

```bash
# Coolify will auto-deploy on git push
git push origin main

# Or manually trigger in Coolify dashboard
```

### Scale Services

1. In Coolify, go to **Scaling** tab
2. Adjust replica count for services
3. Configure auto-scaling rules

### Monitor Performance

1. Access Grafana: `https://your-domain.com/grafana`
2. Default dashboards:
   - Application metrics
   - Database performance
   - AI model inference times
   - API response times

### Backup Restoration

```bash
# In Coolify dashboard
# Go to Backups → Select backup → Restore

# Or manually via SSH:
docker run --rm -v fineprintai_postgres_data:/data \
  -v /backups:/backup alpine \
  tar -xzf /backup/postgres_backup_2024MMDD.tar.gz -C /data
```

## Security Hardening

### Enable Firewall Rules

```bash
# Already configured in Coolify
# Additional rules via UFW:
ufw allow from 172.20.0.0/16 to any port 5432  # PostgreSQL internal only
ufw allow from 172.20.0.0/16 to any port 6379  # Redis internal only
```

### Configure Rate Limiting

Rate limiting is automatically configured via Coolify's built-in features.

### Enable ModSecurity WAF

ModSecurity is integrated with Coolify's Nginx proxy.

## Support

- **Coolify Documentation**: https://coolify.io/docs
- **Coolify Discord**: https://discord.gg/coolify
- **Fine Print AI Support**: support@fineprintai.com

## Next Steps

1. Configure custom email templates
2. Set up custom AI model fine-tuning
3. Implement additional security measures
4. Configure CDN for static assets
5. Set up staging environment