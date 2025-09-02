# Direct Docker Deployment Guide for Fine Print AI on Hetzner VPS

## Prerequisites Checklist

Before starting, ensure you have:
- [ ] Hetzner VPS with Ubuntu 22.04 LTS (minimum 4GB RAM, 2 CPU cores)
- [ ] Root SSH access to your server
- [ ] Domain name (fineprint.tech) with DNS access
- [ ] GitHub account with access to your Fine Print AI repository
- [ ] Stripe account (for payment processing)
- [ ] SendGrid account (for email services)
- [ ] Local terminal with SSH and Git client

## Step 1: Initial Server Setup and Security

### 1.1 Connect to Your Server
```bash
# From your local machine
ssh root@YOUR_SERVER_IP
```

### 1.2 Update System and Install Prerequisites
```bash
# Update package lists
apt update && apt upgrade -y

# Install essential packages
apt install -y curl wget git nano ufw fail2ban software-properties-common

# Install Docker
curl -fsSL https://get.docker.com | bash

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version
```

### 1.3 Configure Firewall
```bash
# Enable UFW firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8000/tcp  # Coolify dashboard
ufw --force enable

# Check status
ufw status
```

### 1.4 Create Non-Root User (Optional but Recommended)
```bash
# Create user
adduser fineprintadmin

# Add to sudo group
usermod -aG sudo fineprintadmin
usermod -aG docker fineprintadmin

# Switch to new user (optional)
# su - fineprintadmin
```

## Step 2: Clone Repository and Setup Project

### 2.1 Clone the Fine Print AI Repository
```bash
# Create application directory
mkdir -p /opt/fineprintai
cd /opt/fineprintai

# Clone your repository
git clone https://github.com/YOUR_USERNAME/FinePrint.git .
# OR if using SSH
git clone git@github.com:YOUR_USERNAME/FinePrint.git .

# Verify files are present
ls -la
```

### 2.2 Setup Environment Configuration
```bash
# Copy production environment template
cp .env.production .env.production.backup
nano .env.production

# Edit the file with your actual values:
# - Set your database password
# - Add JWT secrets (use: openssl rand -hex 32)
# - Add Stripe API keys
# - Add SendGrid API key
# - Save and exit (Ctrl+X, Y, Enter)
```

## Step 3: Configure DNS for fineprint.tech

### 3.1 Add DNS Records
In your domain registrar's DNS management panel, add:

```
Type    Name    Value               TTL
A       @       YOUR_SERVER_IP      300
A       www     YOUR_SERVER_IP      300
A       api     YOUR_SERVER_IP      300
A       admin   YOUR_SERVER_IP      300
```

### 3.2 Verify DNS Propagation
```bash
# From your server
dig fineprint.tech
dig www.fineprint.tech
dig api.fineprint.tech

# Should return your server IP
```

## Step 4: Make Scripts Executable

```bash
# Make all scripts executable
chmod +x scripts/*.sh
```

## Step 5: Run Initial Deployment

### 5.1 Run the Deployment Script
```bash
# Change to project directory
cd /opt/fineprintai

# Run deployment script
./scripts/deploy.sh
```

This script will:
- Check prerequisites
- Build Docker images
- Start all services
- Initialize the database
- Set up basic configuration

### 5.2 Monitor Deployment
```bash
# Watch logs during deployment
docker-compose logs -f

# Check service status
docker-compose ps
```

## Step 6: Configure Environment Variables

### 6.1 Generate Secure Secrets
```bash
# Generate secure passwords and keys
openssl rand -hex 32  # For JWT_SECRET
openssl rand -hex 32  # For JWT_REFRESH_SECRET
openssl rand -base64 32  # For database password
```

### 6.2 Update Production Environment
Edit `.env.production` with your actual values:

```bash
# Domain Configuration
DOMAIN=fineprint.tech
PUBLIC_URL=https://fineprint.tech
API_URL=https://api.fineprint.tech
ADMIN_URL=https://admin.fineprint.tech

# Database Configuration
DB_NAME=fineprintai
DB_USER=fineprintai_user
DB_PASSWORD=GENERATE_SECURE_PASSWORD_HERE
DB_HOST=postgres
DB_PORT=5432

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_MAX_MEMORY=1gb

# Security Keys (Generate using: openssl rand -hex 32)
JWT_SECRET=GENERATE_32_CHAR_SECRET_HERE
JWT_REFRESH_SECRET=GENERATE_32_CHAR_SECRET_HERE
ENCRYPTION_KEY=GENERATE_32_CHAR_SECRET_HERE

# Stripe Configuration (from Stripe Dashboard)
STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE

# Stripe Price IDs (create in Stripe Dashboard first)
STRIPE_PRICE_STARTER_MONTHLY=price_xxxxx
STRIPE_PRICE_STARTER_ANNUAL=price_xxxxx
STRIPE_PRICE_PROFESSIONAL_MONTHLY=price_xxxxx
STRIPE_PRICE_PROFESSIONAL_ANNUAL=price_xxxxx
STRIPE_PRICE_TEAM_MONTHLY=price_xxxxx
STRIPE_PRICE_TEAM_ANNUAL=price_xxxxx

# Email Configuration (SendGrid)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=YOUR_SENDGRID_API_KEY
SMTP_FROM=noreply@fineprint.tech

# Application Settings
NODE_ENV=production
LOG_LEVEL=info
RATE_LIMIT_MAX=1000
WORKER_CONCURRENCY=5

# AI Model Configuration
OLLAMA_HOST=http://ollama:11434
OLLAMA_MODELS=phi-2:2.7b,mistral:7b,llama2:13b

# Feature Flags
ENABLE_DOCUMENT_MONITORING=true
ENABLE_API_ACCESS=true
ENABLE_TEAM_FEATURES=true
ENABLE_ANALYTICS=true

# Optional: Monitoring
SENTRY_DSN=YOUR_SENTRY_DSN_IF_USING
PROMETHEUS_ENABLED=true
GRAFANA_ADMIN_PASSWORD=GENERATE_PASSWORD_HERE
```

### 6.2 Generate Secure Passwords
```bash
# Generate secure passwords/secrets
openssl rand -hex 32  # For JWT secrets
openssl rand -base64 32  # For database password
```

## Step 7: Setup SSL Certificates

### 7.1 Run SSL Setup Script
```bash
# Run the SSL setup script
./scripts/ssl-setup.sh

# Choose option 1 for Let's Encrypt production
# The script will:
# - Request certificates from Let's Encrypt
# - Configure nginx with SSL
# - Set up automatic renewal
```

### 7.2 Verify SSL is Working
```bash
# Test HTTPS connection
curl https://fineprint.tech

# Check certificate
openssl s_client -connect fineprint.tech:443 -servername fineprint.tech
```

## Step 8: Initialize Database

### 8.1 Run Database Migrations
```bash
# The deployment script should have done this, but verify:
docker-compose exec api npm run db:migrate

# Create admin user
docker-compose exec api npm run create:admin -- \
  --email=admin@fineprint.tech \
  --password=YOUR_SECURE_PASSWORD
```

### 8.2 Verify Database
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U fineprintai_user -d fineprintai

# Check tables
\dt

# Exit
\q
```

## Step 9: Download AI Models

### 9.1 Pull Required Models
```bash
# Run the model pull script
./scripts/pull-models.sh

# This will:
# - Download phi-2:2.7b (fast, for quick analysis)
# - Download mistral:7b (balanced)
# - Download llama2:13b (accurate, for detailed analysis)
# - Test each model
# - Show disk usage

# The process takes 10-30 minutes depending on internet speed
```

### 9.2 Verify Models
```bash
# Check installed models
docker exec fineprintai-ollama ollama list

# Test a model manually
docker exec fineprintai-ollama ollama run phi-2:2.7b "Test legal clause analysis"
```

## Step 10: Configure Stripe

### 10.1 Create Products in Stripe Dashboard
1. Login to https://dashboard.stripe.com
2. Go to Products → Add Product
3. Create three products:

**Starter Plan**
- Name: Fine Print AI Starter
- Monthly: $9.00
- Annual: $91.80

**Professional Plan**  
- Name: Fine Print AI Professional
- Monthly: $29.00
- Annual: $295.80

**Team Plan**
- Name: Fine Print AI Team
- Monthly: $99.00
- Annual: $1009.80

### 10.2 Configure Webhook
1. Go to Developers → Webhooks
2. Add endpoint: `https://fineprint.tech/api/billing/webhooks`
3. Select events:
   - customer.subscription.*
   - invoice.*
   - payment_intent.*
4. Copy webhook signing secret to environment variables

### 10.3 Update Environment with Stripe IDs
```bash
# Edit your .env.production file
nano .env.production

# Update these with actual IDs from Stripe:
STRIPE_PRICE_STARTER_MONTHLY=price_xxxxx
STRIPE_PRICE_STARTER_ANNUAL=price_xxxxx
# etc...

# Restart API service to load new variables
docker-compose restart api
```

## Step 11: Configure Email Service

### 11.1 SendGrid Setup
1. Login to SendGrid
2. Create API Key: Settings → API Keys → Create
3. Verify domain: Settings → Sender Authentication
4. Add DNS records for domain verification

### 11.2 Update Email Configuration
```bash
# Edit environment file with SendGrid details
nano .env.production

# Update:
# SMTP_PASSWORD=YOUR_SENDGRID_API_KEY

# Restart API to apply changes
docker-compose restart api
```

## Step 12: Docker Management Commands

### 12.1 Useful Docker Commands
```bash
# View all running containers
docker-compose ps

# View logs for specific service
docker-compose logs -f api
docker-compose logs -f web

# Restart a service
docker-compose restart api

# Stop all services
docker-compose down

# Start all services
docker-compose up -d

# Remove all containers and volumes (WARNING: Data loss!)
docker-compose down -v

# Update images and restart
docker-compose pull
docker-compose up -d
```

### 12.2 Backup Management
```bash
# Manual backup of database
docker exec fineprintai-postgres pg_dump -U fineprintai_user fineprintai > backup_$(date +%Y%m%d).sql

# Restore database from backup
docker exec -i fineprintai-postgres psql -U fineprintai_user fineprintai < backup_20240101.sql
```

## Step 13: Final Verification

### 13.1 Test Application
1. **Frontend**: Navigate to https://fineprint.tech
- Should see landing page
- Test signup/login
- Upload test document

2. **API Health**: Check https://fineprint.tech/api/health
   ```json
   {
      "status": "healthy",
      "version": "1.0.0",
      "services": {
         "database": "connected",
         "redis": "connected",
         "ollama": "ready"
      }
   }
   ```

3. **WebSocket**: Test WebSocket connection
   ```bash
   # Test WebSocket from command line
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" https://fineprint.tech/ws
   ```

### 13.2 Test Core Features
- [ ] User registration and login
- [ ] Document upload and analysis
- [ ] Payment processing (test mode first)
- [ ] Email notifications
- [ ] API endpoints
- [ ] WebSocket connections

## Step 14: Setup Automatic Updates (Optional)

### 14.1 Create Update Script
```bash
cat > /opt/fineprintai/scripts/update.sh << 'EOF'
#!/bin/bash
cd /opt/fineprintai
git pull origin main
docker-compose build --no-cache
docker-compose up -d
docker-compose exec api npm run db:migrate
EOF

chmod +x /opt/fineprintai/scripts/update.sh
```

### 14.2 Setup Cron Job for Updates
```bash
# Add to crontab for weekly updates (optional)
crontab -e

# Add this line for weekly updates on Sunday at 3 AM
0 3 * * 0 /opt/fineprintai/scripts/update.sh >> /var/log/fineprintai-update.log 2>&1
```

## Troubleshooting Guide

### Common Issues and Solutions

#### SSL Certificate Issues
```bash
# Manually trigger certificate renewal
docker exec coolify-proxy certbot renew --force-renewal

# Check certificate status
docker exec coolify-proxy certbot certificates
```

#### Database Connection Issues
```bash
# Check PostgreSQL logs
docker logs fineprintai-postgres

# Test connection
docker exec -it fineprintai-postgres psql -U fineprintai_user -d fineprintai
```

#### AI Model Not Responding
```bash
# Check Ollama status
docker logs fineprintai-ollama

# Restart Ollama service
docker restart fineprintai-ollama

# Re-pull models if needed
docker exec fineprintai-ollama ollama pull phi-2:2.7b
```

#### High Memory Usage
```bash
# Check memory usage
docker stats

# Restart specific service
docker restart fineprintai-api

# Clear Redis cache if needed
docker exec fineprintai-redis redis-cli FLUSHALL
```

## Maintenance Tasks

### Daily
- Check application health endpoint
- Monitor error logs in Coolify dashboard
- Review Stripe payment notifications

### Weekly
- Review security logs
- Check disk usage
- Test backup restoration (staging)

### Monthly
- Update dependencies
- Review and rotate API keys
- Performance analysis
- Security patches

## Security Hardening

### Additional Security Steps
```bash
# Disable root SSH (after creating admin user)
nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
systemctl restart sshd

# Setup Fail2ban
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
systemctl enable fail2ban
systemctl start fail2ban

# Enable unattended upgrades
apt install unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

## Support Resources

- **Docker Documentation**: https://docs.docker.com
- **Docker Compose Reference**: https://docs.docker.com/compose/
- **Fine Print AI Support**: support@fineprint.tech
- **GitHub Issues**: https://github.com/YOUR_USERNAME/FinePrint/issues

## Post-Deployment Checklist

- [ ] All Docker containers running (`docker-compose ps`)
- [ ] SSL certificates active (https://fineprint.tech works)
- [ ] DNS properly configured (A records pointing to server)
- [ ] Database initialized and migrations completed
- [ ] AI models downloaded (phi-2, mistral, llama2)
- [ ] Stripe products created and webhook configured
- [ ] SendGrid API key added and email working
- [ ] Admin account created
- [ ] Test document upload and analysis working
- [ ] WebSocket connections functioning
- [ ] Nginx reverse proxy routing correctly
- [ ] Environment variables properly set
- [ ] Backup strategy in place

## Next Steps

1. **Configure CDN** (Optional)
- Setup Cloudflare for static assets
- Configure caching rules

2. **Setup Staging Environment**
- Clone configuration
- Use staging.fineprint.tech subdomain

3. **Custom AI Model Training**
- Fine-tune models for specific use cases
- Deploy custom LoRA adapters

4. **Enhanced Monitoring**
- Setup external uptime monitoring
- Configure advanced Grafana dashboards

---

## Quick Start Summary

For experienced users, here's the quick deployment process:

```bash
# 1. SSH to server and clone repository
ssh root@YOUR_SERVER_IP
cd /opt && git clone https://github.com/YOUR_USERNAME/FinePrint.git fineprintai
cd fineprintai

# 2. Configure environment
cp .env.production .env.production.backup
nano .env.production  # Add your configuration

# 3. Make scripts executable
chmod +x scripts/*.sh

# 4. Run deployment
./scripts/deploy.sh

# 5. Setup SSL
./scripts/ssl-setup.sh

# 6. Pull AI models
./scripts/pull-models.sh

# 7. Verify deployment
docker-compose ps
curl https://fineprint.tech/api/health
```

**Deployment Support**: If you encounter any issues during deployment, please refer to the troubleshooting section or create an issue on GitHub.

**Estimated Total Deployment Time**: 1-2 hours (including model downloads)