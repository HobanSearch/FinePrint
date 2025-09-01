# Fine Print AI Security Setup Documentation

## 🔒 Complete Security Implementation Guide

This guide provides comprehensive instructions for securing your Fine Print AI deployment on Hetzner VPS with Nginx and Cloudflare protection.

---

## Table of Contents

1. [Security Architecture Overview](#security-architecture-overview)
2. [Quick Setup](#quick-setup)
3. [Detailed Configuration](#detailed-configuration)
4. [Security Layers](#security-layers)
5. [Monitoring & Alerting](#monitoring--alerting)
6. [Incident Response](#incident-response)
7. [Maintenance & Updates](#maintenance--updates)
8. [Security Checklist](#security-checklist)
9. [Troubleshooting](#troubleshooting)

---

## Security Architecture Overview

```
Internet → Cloudflare → Hetzner Firewall → UFW → iptables → Nginx + ModSecurity → Application
                ↓                                                    ↓
           DDoS Protection                                    fail2ban + AIDE
                ↓                                                    ↓
           Rate Limiting                                     Security Monitoring
```

### Key Components

- **Cloudflare**: DDoS protection, WAF, SSL/TLS termination
- **Hetzner Firewall**: Cloud-level network filtering
- **UFW/iptables**: Host-based firewall
- **Nginx**: Reverse proxy with security headers
- **ModSecurity**: Web Application Firewall (WAF)
- **fail2ban**: Intrusion prevention
- **AIDE**: File integrity monitoring
- **ClamAV**: Antivirus scanning
- **Prometheus/Grafana**: Security monitoring

---

## Quick Setup

### Prerequisites

- Fresh Ubuntu 22.04 LTS on Hetzner VPS
- Root or sudo access
- Domain name configured with Cloudflare
- At least 4GB RAM and 2 CPU cores

### One-Command Setup

```bash
# Clone repository and run complete security setup
git clone https://github.com/HobanSearch/FinePrint.git /opt/fineprintai
cd /opt/fineprintai
chmod +x deployment/vps/scripts/*.sh

# Run all security scripts in order
./deployment/vps/scripts/security-setup.sh
./deployment/vps/scripts/firewall-setup.sh
./deployment/vps/scripts/cloudflare-setup.sh
./deployment/vps/scripts/modsecurity-setup.sh
```

---

## Detailed Configuration

### 1. Initial Server Hardening

```bash
# Run the main security hardening script
/opt/fineprintai/deployment/vps/scripts/security-setup.sh
```

This script performs:
- System updates and kernel hardening
- User account security
- SSH hardening (key-only authentication)
- File system security
- Automatic security updates
- Intrusion detection setup

### 2. Firewall Configuration

```bash
# Configure comprehensive firewall rules
/opt/fineprintai/deployment/vps/scripts/firewall-setup.sh
```

Features:
- UFW with Cloudflare IP whitelisting
- iptables DDoS protection
- fail2ban integration
- Rate limiting
- Port scanning protection

### 3. Cloudflare Setup

```bash
# Configure Cloudflare security
/opt/fineprintai/deployment/vps/scripts/cloudflare-setup.sh

# Set your Cloudflare credentials
export CF_EMAIL="your-email@example.com"
export CF_API_KEY="your-api-key"
export CF_ZONE_ID="your-zone-id"

# Apply Cloudflare configuration
/opt/fineprintai/scripts/cloudflare-api.sh setup
```

Cloudflare Configuration:
- SSL/TLS: Full (strict)
- Security Level: Medium
- Firewall Rules: Country blocking, bot protection
- DDoS Protection: Enabled
- Rate Limiting: API endpoints

### 4. Nginx Security

```bash
# Replace default nginx config with hardened version
cp /opt/fineprintai/deployment/vps/config/nginx-secure.conf /etc/nginx/nginx.conf

# Generate DH parameters for SSL
openssl dhparam -out /etc/nginx/ssl/dhparam.pem 4096

# Test and reload
nginx -t
systemctl reload nginx
```

### 5. ModSecurity WAF

```bash
# Install and configure ModSecurity
/opt/fineprintai/deployment/vps/scripts/modsecurity-setup.sh

# Add to nginx.conf
echo "load_module modules/ngx_http_modsecurity_module.so;" >> /etc/nginx/nginx.conf

# Test WAF
/opt/fineprintai/scripts/test-modsecurity.sh
```

### 6. SSL Certificate Setup

```bash
# Install Let's Encrypt certificate
certbot --nginx -d fineprintai.com -d www.fineprintai.com \
  --email admin@fineprintai.com \
  --agree-tos \
  --no-eff-email \
  --redirect
```

---

## Security Layers

### Layer 1: Network Security (Cloudflare)

**Configuration:**
1. Log into Cloudflare Dashboard
2. Navigate to your domain
3. Apply these settings:

```yaml
SSL/TLS:
  Mode: Full (strict)
  Edge Certificates: On
  Always Use HTTPS: On
  Minimum TLS Version: 1.2
  Automatic HTTPS Rewrites: On

Firewall:
  Security Level: Medium
  Bot Fight Mode: On
  Challenge Passage: 30 minutes
  Browser Integrity Check: On

Rules:
  - Block countries: CN, RU, KP
  - Challenge threat score > 10
  - Rate limit /api/* to 10 req/10s
```

### Layer 2: Host Firewall (UFW/iptables)

**Active Rules:**
```bash
# View current rules
ufw status verbose
iptables -L -v -n

# Key protections:
- SSH: Rate limited to 3 attempts/minute
- HTTP/HTTPS: Only from Cloudflare IPs
- DDoS: SYN cookies, connection limits
- Scanning: Port scan detection and blocking
```

### Layer 3: Web Application Firewall (ModSecurity)

**Protection Against:**
- SQL Injection
- Cross-Site Scripting (XSS)
- Remote File Inclusion
- Command Injection
- Protocol violations
- Session fixation
- Scanner detection

**Custom Rules for Fine Print AI:**
- Document upload validation
- API rate limiting
- JWT token validation
- Prompt injection protection

### Layer 4: Application Security

**Implemented Measures:**
- Security headers (HSTS, CSP, X-Frame-Options)
- Rate limiting per endpoint
- Input validation
- Output encoding
- Secure session management
- CORS configuration

---

## Monitoring & Alerting

### Security Dashboard

```bash
# View real-time security status
security-status

# Output includes:
- Firewall status and blocked IPs
- fail2ban jail status
- SSH configuration
- Recent auth failures
- System resources
- Security updates
```

### Prometheus Alerts

Active security alerts:
- High SSH authentication failures
- DDoS attack detection
- ModSecurity critical events
- SSL certificate expiration
- File integrity violations
- Malware detection
- Brute force attempts

### Log Locations

```bash
# Security logs
/var/log/auth.log           # Authentication events
/var/log/ufw.log            # Firewall blocks
/var/log/fail2ban.log       # Banned IPs
/var/log/modsecurity/*.log  # WAF events
/var/log/nginx/access.log   # Web access
/var/log/nginx/error.log    # Web errors
/var/log/aide/aide.log      # File changes
/var/log/clamav/*.log       # Virus scans
```

### Grafana Dashboards

Access at: `https://your-domain/grafana`

Available dashboards:
- Security Overview
- Firewall Activity
- ModSecurity Events
- Authentication Metrics
- System Resources

---

## Incident Response

### Detecting an Attack

**Indicators:**
```bash
# Check for active attacks
fail2ban-client status
netstat -an | grep -c ESTABLISHED
tail -f /var/log/nginx/access.log | grep -E "403|429"
grep "CRITICAL" /var/log/modsecurity/modsec_audit.log
```

### Response Procedures

#### 1. DDoS Attack

```bash
# Enable Cloudflare Under Attack Mode
/opt/fineprintai/scripts/cloudflare-api.sh under-attack

# Block attacking IPs locally
ipset add blacklist ATTACKER_IP
ufw insert 1 deny from ATTACKER_IP

# Monitor impact
watch -n 1 'netstat -an | grep -c :443'
```

#### 2. Brute Force Attack

```bash
# Check fail2ban status
fail2ban-client status sshd
fail2ban-client status nginx-auth

# Manually ban IP
fail2ban-client set sshd banip ATTACKER_IP

# Increase ban time
fail2ban-client set sshd bantime 86400
```

#### 3. Compromised System

```bash
# Isolate system
ufw default deny incoming
docker stop $(docker ps -q)

# Preserve evidence
tar -czf /backup/evidence-$(date +%Y%m%d).tar.gz /var/log/

# Check for changes
aide --check
rkhunter --check
chkrootkit

# Review audit logs
ausearch -m execve
last -f /var/log/wtmp
```

### Emergency Contacts

```yaml
Hetzner Support:
  URL: https://www.hetzner.com/support
  Phone: +49 (0)9831 505-0

Cloudflare Support:
  URL: https://support.cloudflare.com
  Status: https://www.cloudflarestatus.com

Security Team:
  Email: security@fineprintai.com
  PagerDuty: [Your PagerDuty]
```

---

## Maintenance & Updates

### Daily Tasks

```bash
# Morning security check
security-status

# Review overnight events
journalctl -u fail2ban --since "yesterday" | grep Ban
grep "$(date +%Y-%m-%d)" /var/log/modsecurity/modsec_audit.log | grep -c "id:"
```

### Weekly Tasks

```bash
# Update security signatures
freshclam                    # ClamAV virus definitions
/opt/fineprintai/scripts/update-geoip.sh  # GeoIP database

# Run security scans
clamscan -r /var/www/        # Virus scan
lynis audit system           # Security audit

# Review logs
zgrep "403\|429" /var/log/nginx/access.log.*.gz | wc -l
```

### Monthly Tasks

```bash
# Update AIDE database
aide --update
mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db

# Full system scan
rkhunter --update
rkhunter --check --skip-keypress

# Review and update rules
vim /etc/fail2ban/jail.d/fineprintai.conf
vim /etc/nginx/modsecurity/custom-rules/

# Certificate check
certbot certificates
```

### Security Updates

```bash
# Check for updates
apt update
apt list --upgradable | grep -i security

# Apply security updates only
apt-get -s upgrade | grep -i security
apt-get install <security-packages>

# Or enable automatic security updates
dpkg-reconfigure unattended-upgrades
```

---

## Security Checklist

### Initial Setup ✅

- [ ] System updated and hardened
- [ ] Non-root admin user created
- [ ] SSH key authentication configured
- [ ] Root login disabled
- [ ] Firewall configured and enabled
- [ ] fail2ban active with custom jails
- [ ] ModSecurity WAF installed
- [ ] SSL certificates installed
- [ ] Cloudflare protection enabled
- [ ] Monitoring configured

### Ongoing Security 🔄

- [ ] Daily: Check security dashboard
- [ ] Daily: Review authentication logs
- [ ] Weekly: Update security definitions
- [ ] Weekly: Run vulnerability scans
- [ ] Monthly: Update AIDE database
- [ ] Monthly: Review firewall rules
- [ ] Monthly: Test incident response
- [ ] Quarterly: Security audit
- [ ] Yearly: Penetration testing

### Compliance Requirements 📋

- [ ] GDPR: Data encryption at rest and in transit
- [ ] GDPR: Access logs and audit trails
- [ ] GDPR: Data deletion capabilities
- [ ] PCI DSS: Firewall configuration
- [ ] PCI DSS: Access control measures
- [ ] PCI DSS: Regular security testing
- [ ] OWASP: Top 10 protections implemented
- [ ] ISO 27001: Security documentation
- [ ] SOC 2: Monitoring and alerting

---

## Troubleshooting

### Common Issues

#### 1. Locked Out of Server

```bash
# If fail2ban banned your IP
# Connect via console (Hetzner)
fail2ban-client set sshd unbanip YOUR_IP

# If firewall blocking
ufw allow from YOUR_IP
```

#### 2. High False Positive Rate (ModSecurity)

```bash
# Switch to detection mode
sed -i 's/SecRuleEngine On/SecRuleEngine DetectionOnly/' \
  /etc/nginx/modsecurity/modsecurity.conf

# Review blocked requests
grep "id:" /var/log/modsecurity/modsec_audit.log | \
  grep -o "id:[0-9]*" | sort | uniq -c | sort -rn

# Disable specific rule
SecRuleRemoveById 1234
```

#### 3. Performance Issues

```bash
# Check resource usage
htop
iostat -x 1
netstat -an | grep -c ESTABLISHED

# Optimize ModSecurity
# Reduce paranoia level
sed -i 's/tx.paranoia_level=2/tx.paranoia_level=1/' \
  /etc/nginx/modsecurity/modsecurity.conf

# Adjust rate limiting
vim /etc/nginx/nginx.conf  # Increase burst values
```

#### 4. SSL Certificate Issues

```bash
# Test certificate
openssl s_client -connect fineprintai.com:443 -servername fineprintai.com

# Renew manually
certbot renew --force-renewal

# Check auto-renewal
systemctl status certbot.timer
```

### Debug Commands

```bash
# Test firewall rules
nmap -sT YOUR_SERVER_IP

# Test ModSecurity
curl "http://localhost/?test=<script>alert('xss')</script>"

# Check fail2ban
fail2ban-regex /var/log/auth.log /etc/fail2ban/filter.d/sshd.conf

# Monitor real-time attacks
tail -f /var/log/nginx/access.log | grep -E "403|429"
```

---

## Advanced Security Features

### 1. Port Knocking (Optional)

```bash
# Enable port knocking for SSH
/opt/fineprintai/scripts/port-knocking.sh

# Usage:
knock SERVER_IP 7000 8000 9000  # Open SSH
ssh user@SERVER_IP
knock SERVER_IP 9000 8000 7000  # Close SSH
```

### 2. Two-Factor Authentication

```bash
# Setup 2FA for user
/opt/fineprintai/scripts/setup-2fa.sh username

# Scan QR code with authenticator app
# Test login with 2FA token
```

### 3. Honeypot Setup

```bash
# Install honeypot to detect attackers
apt-get install cowrie

# Configure decoy services
# Monitors and logs attack attempts
```

### 4. Security Scanning

```bash
# Run comprehensive security scan
lynis audit system --quick

# Check for vulnerabilities
nikto -h localhost

# Test WAF effectiveness
wafw00f https://fineprintai.com
```

---

## Security Best Practices

### Do's ✅

1. **Regular Updates**: Apply security patches immediately
2. **Strong Passwords**: Use password manager, enforce complexity
3. **Least Privilege**: Grant minimum required permissions
4. **Defense in Depth**: Multiple security layers
5. **Monitoring**: Watch logs and alerts continuously
6. **Backups**: Regular encrypted backups off-site
7. **Documentation**: Keep security procedures updated
8. **Testing**: Regular security audits and pen tests
9. **Training**: Security awareness for all team members
10. **Incident Plan**: Have response procedures ready

### Don'ts ❌

1. **Never** disable security features for convenience
2. **Never** ignore security alerts or warnings
3. **Never** use default passwords or settings
4. **Never** expose services directly to internet
5. **Never** trust user input without validation
6. **Never** store secrets in code or configs
7. **Never** skip security updates
8. **Never** assume you're not a target
9. **Never** test in production
10. **Never** forget to monitor after deployment

---

## Conclusion

Your Fine Print AI deployment now has enterprise-grade security with:

- **Multi-layer protection**: Cloudflare → Firewall → WAF → Application
- **Active monitoring**: Real-time alerts and dashboards
- **Automated responses**: fail2ban, rate limiting, DDoS protection
- **Compliance ready**: GDPR, PCI DSS, OWASP standards
- **Incident prepared**: Response procedures and emergency contacts

Remember: Security is an ongoing process, not a one-time setup. Regular monitoring, updates, and testing are essential to maintain a secure environment.

For additional support or security concerns, contact: security@fineprintai.com

---

*Last Updated: 2024*
*Version: 1.0*
*Classification: Public*