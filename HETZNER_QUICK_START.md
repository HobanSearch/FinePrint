# Fine Print AI - Hetzner VPS Quick Start Guide

## 🚀 Quick Deployment Steps

### 1. Connect to Your Hetzner VPS
```bash
ssh root@YOUR_HETZNER_IP
```

### 2. Run Initial Setup
```bash
# Update system and install essentials
apt update && apt upgrade -y
apt install -y curl wget git docker.io docker-compose

# Start Docker
systemctl enable docker
systemctl start docker
```

### 3. Clone Your Repository
```bash
# Clone from GitHub
git clone https://github.com/HobanSearch/FinePrint.git /opt/fineprintai
cd /opt/fineprintai
```

### 4. Configure Environment
```bash
# Copy and edit production environment
cp deployment/vps/.env.production.example .env.production
nano .env.production
```

**Essential settings to update:**
- `DOMAIN_NAME=yourdomain.com` (or use IP initially)
- All passwords (DB_PASSWORD, REDIS_PASSWORD, etc.)
- JWT secrets (generate with: `openssl rand -hex 32`)
- Email settings if needed

### 5. Quick Deploy (Without Full Script)
```bash
cd /opt/fineprintai

# Build and start services
docker-compose -f deployment/vps/docker-compose.production.yml up -d

# Check status
docker ps
```

### 6. Verify Deployment
```bash
# Check if services are running
curl http://YOUR_HETZNER_IP/api/health

# View logs if needed
docker-compose -f deployment/vps/docker-compose.production.yml logs -f
```

## 🔐 Quick Security Setup

```bash
# Basic firewall
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

# Create non-root user (recommended)
adduser fineprintai
usermod -aG sudo,docker fineprintai
```

## 🌐 Access Your Application

After deployment:
- Web App: `http://YOUR_HETZNER_IP`
- API: `http://YOUR_HETZNER_IP/api`
- Health Check: `http://YOUR_HETZNER_IP/api/health`

## 📝 Next Steps

1. **Domain Setup** (if you have one):
   - Point A record to your Hetzner IP
   - Update DOMAIN_NAME in .env.production
   - Install SSL with Let's Encrypt

2. **SSL Certificate**:
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com
```

3. **Monitoring**:
   - Grafana: `http://YOUR_HETZNER_IP/grafana`
   - Default password in .env.production

## 🆘 Troubleshooting

If services don't start:
```bash
# Check logs
docker-compose -f deployment/vps/docker-compose.production.yml logs [service-name]

# Restart a specific service
docker-compose -f deployment/vps/docker-compose.production.yml restart [service-name]

# Stop everything
docker-compose -f deployment/vps/docker-compose.production.yml down

# Start fresh
docker-compose -f deployment/vps/docker-compose.production.yml up -d
```

## 💡 Tips for Hetzner

- Hetzner provides excellent network performance
- Consider their backup service for automated backups
- Use Hetzner Cloud Firewall for additional security
- Their support is responsive if you need help

## 🔄 Updating from GitHub

To get latest updates:
```bash
cd /opt/fineprintai
git pull origin main
docker-compose -f deployment/vps/docker-compose.production.yml down
docker-compose -f deployment/vps/docker-compose.production.yml build
docker-compose -f deployment/vps/docker-compose.production.yml up -d
```

---

**Ready to deploy!** Your complete Fine Print AI application is now on GitHub and ready to be deployed to your Hetzner VPS.