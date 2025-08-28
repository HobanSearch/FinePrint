# Fine Print AI - VPS Production Deployment Guide

## 📋 Table of Contents
1. [VPS Requirements](#vps-requirements)
2. [Initial Server Setup](#initial-server-setup)
3. [Deployment Process](#deployment-process)
4. [SSL Configuration](#ssl-configuration)
5. [Security Hardening](#security-hardening)
6. [Monitoring Setup](#monitoring-setup)
7. [Backup Strategy](#backup-strategy)
8. [Maintenance](#maintenance)
9. [Troubleshooting](#troubleshooting)
10. [Scaling Guide](#scaling-guide)

## 🖥️ VPS Requirements

### Minimum Specifications
- **CPU**: 8 cores (16 recommended for AI workloads)
- **RAM**: 32GB (64GB recommended)
- **Storage**: 500GB SSD (NVMe preferred)
- **OS**: Ubuntu 22.04 LTS
- **Network**: 1Gbps connection
- **IPv4**: Static public IP address

### Recommended Providers
- **DigitalOcean**: Droplet (CPU-Optimized 16vcpu/32GB)
- **Linode**: Dedicated CPU 32GB
- **Vultr**: High Frequency 8-core/32GB
- **Hetzner**: CCX33 or higher
- **AWS**: c5.4xlarge or m5.4xlarge

## 🚀 Initial Server Setup

### 1. Connect to Your VPS
```bash
ssh root@your-vps-ip
```

### 2. Update System
```bash
apt update && apt upgrade -y
apt install -y curl wget git vim htop net-tools software-properties-common
```

### 3. Create Non-Root User
```bash
adduser fineprintai
usermod -aG sudo fineprintai
```

### 4. Configure SSH Security
```bash
# Copy SSH keys
mkdir -p /home/fineprintai/.ssh
cp ~/.ssh/authorized_keys /home/fineprintai/.ssh/
chown -R fineprintai:fineprintai /home/fineprintai/.ssh
chmod 700 /home/fineprintai/.ssh
chmod 600 /home/fineprintai/.ssh/authorized_keys

# Edit SSH config
vim /etc/ssh/sshd_config
```

Add/modify these settings:
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowUsers fineprintai
```

Restart SSH:
```bash
systemctl restart sshd
```

### 5. Setup Firewall
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
```

### 6. Install Docker
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker fineprintai

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

### 7. Configure Swap (Important for AI workloads)
```bash
fallocate -l 16G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Optimize swappiness for database
echo 'vm.swappiness=10' >> /etc/sysctl.conf
sysctl -p
```

## 📦 Deployment Process

### 1. Clone Repository
```bash
su - fineprintai
git clone https://github.com/HobanSearch/FinePrint.git /opt/fineprintai
cd /opt/fineprintai
```

### 2. Configure Environment
```bash
cp deployment/vps/.env.production.example .env.production
vim .env.production
```

**Essential configurations to update:**
- `DOMAIN_NAME`: Your actual domain
- `DB_PASSWORD`: Strong database password
- `REDIS_PASSWORD`: Strong Redis password
- `JWT_SECRET`: Random 64-character string
- `JWT_REFRESH_SECRET`: Different random 64-character string
- Email settings (SMTP_*)
- Payment settings (STRIPE_*)

### 3. Run Deployment Script
```bash
sudo bash deployment/vps/scripts/deploy.sh
```

The script will:
- Check system requirements
- Set up directories
- Pull Docker images
- Build services
- Initialize database
- Start all services
- Configure monitoring

### 4. Manual Steps After Deployment

#### Configure DNS
Point your domain to the VPS IP:
```
A Record: @ -> YOUR_VPS_IP
A Record: www -> YOUR_VPS_IP
```

#### Verify Services
```bash
docker ps
curl http://localhost/api/health
```

## 🔒 SSL Configuration

### Option 1: Let's Encrypt (Recommended)
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

### Option 2: Cloudflare (with proxy)
1. Add your domain to Cloudflare
2. Set SSL/TLS mode to "Full (strict)"
3. Generate origin certificate in Cloudflare dashboard
4. Install certificate on server

## 🛡️ Security Hardening

### 1. Fail2ban Setup
```bash
sudo apt install fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo vim /etc/fail2ban/jail.local
```

Add custom jail for Fine Print AI:
```ini
[fineprintai]
enabled = true
port = 80,443
filter = fineprintai
logpath = /var/log/fineprintai/access.log
maxretry = 5
bantime = 3600
```

### 2. Security Headers
Already configured in Nginx, but verify:
- X-Frame-Options
- X-Content-Type-Options
- Content-Security-Policy
- Strict-Transport-Security

### 3. Database Security
```bash
# Restrict PostgreSQL connections
docker exec -it fineprintai-postgres psql -U postgres
ALTER USER fineprintai_user WITH ENCRYPTED PASSWORD 'your_secure_password';
REVOKE ALL ON DATABASE fineprintai FROM PUBLIC;
```

### 4. Regular Security Updates
```bash
# Create update script
cat > /usr/local/bin/security-updates.sh << 'EOF'
#!/bin/bash
apt update
apt upgrade -y
docker system prune -af
docker pull ollama/ollama:latest
docker-compose -f /opt/fineprintai/deployment/vps/docker-compose.production.yml pull
EOF

chmod +x /usr/local/bin/security-updates.sh

# Add to crontab
echo "0 3 * * 0 /usr/local/bin/security-updates.sh" | crontab -
```

## 📊 Monitoring Setup

### 1. Access Monitoring Dashboard
```
Grafana: https://yourdomain.com/grafana
Username: admin
Password: [from .env.production]
```

### 2. Configure Alerts
Create alerts for:
- High CPU usage (>80%)
- High memory usage (>90%)
- Disk space low (<10GB)
- Service down
- High error rate

### 3. External Monitoring
Set up external monitoring with:
- UptimeRobot
- Pingdom
- StatusCake

## 💾 Backup Strategy

### 1. Automated Backups
Already configured via deployment script. Runs daily at 2 AM.

### 2. Manual Backup
```bash
sudo /opt/fineprintai/deployment/vps/scripts/backup.sh
```

### 3. Restore Process
```bash
# Stop services
cd /opt/fineprintai
docker-compose -f deployment/vps/docker-compose.production.yml down

# Extract backup
tar xzf /var/backups/fineprintai/backup_20240101_020000.tar.gz

# Restore PostgreSQL
docker-compose -f deployment/vps/docker-compose.production.yml up -d postgres
docker exec -i fineprintai-postgres pg_restore -U fineprintai_user -d fineprintai < postgres.dump

# Restore Redis
docker cp redis.rdb fineprintai-redis:/data/dump.rdb
docker-compose -f deployment/vps/docker-compose.production.yml restart redis

# Start all services
docker-compose -f deployment/vps/docker-compose.production.yml up -d
```

## 🔧 Maintenance

### Daily Tasks
- Check service health
- Review error logs
- Monitor disk space

### Weekly Tasks
- Review security logs
- Check backup integrity
- Update Docker images

### Monthly Tasks
- Security updates
- Performance review
- Cost optimization

### Useful Commands
```bash
# View logs
docker-compose -f deployment/vps/docker-compose.production.yml logs -f [service]

# Restart service
docker-compose -f deployment/vps/docker-compose.production.yml restart [service]

# Scale service
docker-compose -f deployment/vps/docker-compose.production.yml up -d --scale api=3

# Database maintenance
docker exec fineprintai-postgres vacuumdb -U fineprintai_user -d fineprintai -z

# Clear Docker cache
docker system prune -af
```

## 🚨 Troubleshooting

### Service Won't Start
```bash
# Check logs
docker-compose -f deployment/vps/docker-compose.production.yml logs [service]

# Check resources
df -h
free -m
docker stats
```

### Database Connection Issues
```bash
# Test connection
docker exec -it fineprintai-postgres psql -U fineprintai_user -d fineprintai

# Check pg_hba.conf
docker exec -it fineprintai-postgres cat /var/lib/postgresql/data/pg_hba.conf
```

### High Memory Usage
```bash
# Check memory consumers
ps aux --sort=-%mem | head

# Restart memory-intensive services
docker-compose -f deployment/vps/docker-compose.production.yml restart ollama worker
```

### SSL Issues
```bash
# Test SSL
openssl s_client -connect yourdomain.com:443

# Renew certificate
sudo certbot renew --force-renewal
```

## 📈 Scaling Guide

### Vertical Scaling
1. Upgrade VPS plan
2. Increase Docker resource limits
3. Adjust PostgreSQL settings
4. Increase worker concurrency

### Horizontal Scaling
1. **Load Balancer**: Add HAProxy or use cloud LB
2. **Database Replica**: Set up read replicas
3. **Redis Cluster**: Configure Redis cluster mode
4. **CDN**: Use Cloudflare for static assets
5. **Multi-Region**: Deploy to multiple regions

### Performance Optimization
```bash
# Database optimization
docker exec fineprintai-postgres psql -U postgres -c "
  ALTER SYSTEM SET shared_buffers = '4GB';
  ALTER SYSTEM SET effective_cache_size = '12GB';
  ALTER SYSTEM SET maintenance_work_mem = '1GB';
  ALTER SYSTEM SET work_mem = '16MB';
"

# Redis optimization
docker exec fineprintai-redis redis-cli CONFIG SET maxmemory 4gb
docker exec fineprintai-redis redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Ollama optimization
docker exec fineprintai-ollama ollama run phi-2:2.7b --num-gpu 1
```

## 📞 Support

### Getting Help
- Check logs: `docker-compose logs [service]`
- GitHub Issues: https://github.com/HobanSearch/FinePrint/issues
- Documentation: `/docs` directory

### Emergency Recovery
```bash
# Full system backup
tar czf emergency-backup.tar.gz /opt/fineprintai

# Quick restore
docker-compose -f deployment/vps/docker-compose.production.yml down
docker-compose -f deployment/vps/docker-compose.production.yml up -d
```

---

## 🎯 Quick Deployment Checklist

- [ ] VPS meets minimum requirements
- [ ] Domain DNS configured
- [ ] SSH secured
- [ ] Firewall configured
- [ ] Docker installed
- [ ] Repository cloned
- [ ] Environment configured
- [ ] Deployment script executed
- [ ] SSL certificates installed
- [ ] Monitoring configured
- [ ] Backups scheduled
- [ ] Security hardened
- [ ] All services healthy
- [ ] Application accessible via HTTPS

---

**Last Updated**: 2025
**Version**: 1.0.0
**Status**: Production Ready