#!/bin/bash

#############################################
# Fine Print AI - Cloudflare Security Setup
#############################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root"
   exit 1
fi

print_info "Starting Cloudflare Security Configuration..."

#############################################
# CLOUDFLARE CONFIGURATION GUIDE
#############################################

cat << 'EOF' > /opt/fineprintai/docs/CLOUDFLARE_SETUP.md
# Cloudflare Security Configuration for Fine Print AI

## Prerequisites
1. Domain added to Cloudflare
2. DNS records pointing to your Hetzner server
3. Cloudflare API token (for automation)

## Step 1: DNS Configuration

### Required DNS Records:
```
Type    Name    Content             Proxy   TTL
A       @       YOUR_HETZNER_IP     Yes     Auto
A       www     YOUR_HETZNER_IP     Yes     Auto
A       api     YOUR_HETZNER_IP     Yes     Auto
CNAME   _acme-challenge  YOUR_DOMAIN.com  No  Auto
```

## Step 2: SSL/TLS Configuration

1. Go to SSL/TLS → Overview
2. Set encryption mode to "Full (strict)"
3. Enable "Always Use HTTPS"
4. Enable "Automatic HTTPS Rewrites"
5. Minimum TLS Version: TLS 1.2

### Edge Certificates:
- Enable "Always Use HTTPS"
- Enable "Automatic HTTPS Rewrites"
- Enable "Opportunistic Encryption"

### Origin Certificates (Optional but Recommended):
1. Go to SSL/TLS → Origin Server
2. Create Certificate
3. Select domains
4. Certificate validity: 15 years
5. Download and install on your server

## Step 3: Firewall Rules

### Rule 1: Block Bad Countries
```
Expression: (ip.geoip.country in {"CN" "RU" "KP"})
Action: Block
```

### Rule 2: Challenge Suspicious Requests
```
Expression: (cf.threat_score gt 10)
Action: Managed Challenge
```

### Rule 3: Block Known Bots
```
Expression: (cf.client.bot) and not (cf.verified_bot)
Action: Block
```

### Rule 4: Rate Limiting for API
```
Expression: (http.request.uri.path contains "/api")
Action: Rate Limit (10 requests per 10 seconds)
```

### Rule 5: Block SQL Injection Attempts
```
Expression: (http.request.uri.query contains "union" and http.request.uri.query contains "select") or (http.request.uri.query contains "1=1") or (http.request.uri.query contains "' or '")
Action: Block
```

### Rule 6: Block XSS Attempts
```
Expression: (http.request.uri contains "<script") or (http.request.uri contains "javascript:") or (http.request.uri contains "onerror=")
Action: Block
```

## Step 4: Page Rules

### Rule 1: Cache Static Assets
```
URL: *fineprintai.com/*.{jpg,jpeg,png,gif,css,js,ico,woff,woff2}
Settings:
- Cache Level: Cache Everything
- Edge Cache TTL: 1 month
- Browser Cache TTL: 1 month
```

### Rule 2: API No Cache
```
URL: *fineprintai.com/api/*
Settings:
- Cache Level: Bypass
- Disable Performance
```

### Rule 3: Admin Protection
```
URL: *fineprintai.com/admin/*
Settings:
- Security Level: High
- Cache Level: Bypass
- Disable Apps
```

## Step 5: Security Settings

### Security → Settings:
- Security Level: Medium
- Challenge Passage: 30 minutes
- Browser Integrity Check: On
- Privacy Pass Support: On

### Security → Bots:
- Bot Fight Mode: On
- Verified Bots: Allow
- JavaScript Detections: On
- Hotlink Protection: On

### Security → DDoS:
- HTTP DDoS attack protection: High
- Adaptive DDoS Protection: On

## Step 6: Network Settings

### Network:
- WebSockets: On
- IP Geolocation: On
- Maximum Upload Size: 100MB
- True-Client-IP Header: On

## Step 7: Caching Configuration

### Caching → Configuration:
- Caching Level: Standard
- Browser Cache TTL: 4 hours
- Crawler Hints: On
- Always Online: On

## Step 8: Speed Optimization

### Speed → Optimization:
- Auto Minify: JavaScript, CSS, HTML
- Brotli: On
- Rocket Loader: On
- Mirage: On
- Polish: Lossy
- WebP: On

## Step 9: Analytics & Logs

### Analytics:
- Web Analytics: Enable
- Core Web Vitals: Enable

### Logs:
- Enable Logpush to your preferred destination
- Include firewall events

## Step 10: Workers (Optional Advanced)

Create a Worker for additional security:

```javascript
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Block specific user agents
  const userAgent = request.headers.get('User-Agent') || ''
  const blockedAgents = ['bot', 'crawler', 'spider', 'scraper']
  
  if (blockedAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
    return new Response('Forbidden', { status: 403 })
  }
  
  // Add security headers
  const response = await fetch(request)
  const newHeaders = new Headers(response.headers)
  
  newHeaders.set('X-Frame-Options', 'SAMEORIGIN')
  newHeaders.set('X-Content-Type-Options', 'nosniff')
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  })
}
```

## API Automation Script

Save this as cloudflare-api.sh:

```bash
#!/bin/bash

# Cloudflare API credentials
CF_EMAIL="your-email@example.com"
CF_API_KEY="your-global-api-key"
CF_ZONE_ID="your-zone-id"

# Function to update security level
update_security_level() {
    curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/settings/security_level" \
         -H "X-Auth-Email: $CF_EMAIL" \
         -H "X-Auth-Key: $CF_API_KEY" \
         -H "Content-Type: application/json" \
         --data '{"value":"medium"}'
}

# Function to enable Under Attack Mode
enable_under_attack() {
    curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/settings/security_level" \
         -H "X-Auth-Email: $CF_EMAIL" \
         -H "X-Auth-Key: $CF_API_KEY" \
         -H "Content-Type: application/json" \
         --data '{"value":"under_attack"}'
}

# Function to purge cache
purge_cache() {
    curl -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
         -H "X-Auth-Email: $CF_EMAIL" \
         -H "X-Auth-Key: $CF_API_KEY" \
         -H "Content-Type: application/json" \
         --data '{"purge_everything":true}'
}
```

## Monitoring & Alerts

1. Set up email notifications for:
   - DDoS attacks
   - Firewall events
   - Origin errors
   - SSL certificate expiration

2. Configure webhook notifications to your monitoring system

## Best Practices

1. **Regular Reviews**: Review firewall events weekly
2. **Update Rules**: Adjust rules based on attack patterns
3. **Monitor Analytics**: Track traffic patterns and anomalies
4. **Test Changes**: Use development mode for testing
5. **Backup Configuration**: Export your configuration regularly

## Troubleshooting

### Common Issues:

1. **SSL Errors**: Ensure SSL mode matches server configuration
2. **Redirect Loops**: Check "Always Use HTTPS" and server redirects
3. **Cache Issues**: Use Development Mode for testing
4. **Rate Limiting**: Adjust thresholds based on legitimate traffic

### Support Resources:

- Cloudflare Status: https://www.cloudflarestatus.com/
- Community: https://community.cloudflare.com/
- Documentation: https://developers.cloudflare.com/

EOF

print_success "Cloudflare setup guide created at /opt/fineprintai/docs/CLOUDFLARE_SETUP.md"

#############################################
# CLOUDFLARE API AUTOMATION SCRIPT
#############################################

cat << 'SCRIPT' > /opt/fineprintai/scripts/cloudflare-api.sh
#!/bin/bash

# Cloudflare API Configuration Script
# Update these with your actual values

CF_EMAIL="${CF_EMAIL:-your-email@example.com}"
CF_API_KEY="${CF_API_KEY:-your-api-key}"
CF_ZONE_ID="${CF_ZONE_ID:-your-zone-id}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if environment variables are set
if [[ "$CF_EMAIL" == "your-email@example.com" ]]; then
    echo -e "${RED}Please set CF_EMAIL, CF_API_KEY, and CF_ZONE_ID environment variables${NC}"
    exit 1
fi

# Function to make API calls
cf_api() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [[ -n "$data" ]]; then
        curl -s -X "$method" "https://api.cloudflare.com/client/v4/$endpoint" \
             -H "X-Auth-Email: $CF_EMAIL" \
             -H "X-Auth-Key: $CF_API_KEY" \
             -H "Content-Type: application/json" \
             --data "$data"
    else
        curl -s -X "$method" "https://api.cloudflare.com/client/v4/$endpoint" \
             -H "X-Auth-Email: $CF_EMAIL" \
             -H "X-Auth-Key: $CF_API_KEY" \
             -H "Content-Type: application/json"
    fi
}

# Function to create firewall rules
create_firewall_rules() {
    echo "Creating firewall rules..."
    
    # Block bad countries
    cf_api "POST" "zones/$CF_ZONE_ID/firewall/rules" '{
        "filter": {
            "expression": "(ip.geoip.country in {\"CN\" \"RU\" \"KP\"})",
            "description": "Block high-risk countries"
        },
        "action": "block",
        "description": "Block high-risk countries"
    }'
    
    # Challenge suspicious requests
    cf_api "POST" "zones/$CF_ZONE_ID/firewall/rules" '{
        "filter": {
            "expression": "(cf.threat_score gt 10)",
            "description": "Challenge suspicious requests"
        },
        "action": "challenge",
        "description": "Challenge high threat score"
    }'
    
    # Rate limit API
    cf_api "POST" "zones/$CF_ZONE_ID/rate_limits" '{
        "match": {
            "request": {
                "url": "*fineprintai.com/api/*"
            }
        },
        "threshold": 10,
        "period": 10,
        "action": {
            "mode": "simulate",
            "timeout": 60
        },
        "description": "API rate limiting"
    }'
    
    echo -e "${GREEN}Firewall rules created${NC}"
}

# Function to configure security settings
configure_security() {
    echo "Configuring security settings..."
    
    # Set security level
    cf_api "PATCH" "zones/$CF_ZONE_ID/settings/security_level" '{"value":"medium"}'
    
    # Enable HTTPS
    cf_api "PATCH" "zones/$CF_ZONE_ID/settings/always_use_https" '{"value":"on"}'
    
    # Enable SSL strict mode
    cf_api "PATCH" "zones/$CF_ZONE_ID/settings/ssl" '{"value":"strict"}'
    
    # Enable TLS 1.3
    cf_api "PATCH" "zones/$CF_ZONE_ID/settings/tls_1_3" '{"value":"on"}'
    
    # Minimum TLS version
    cf_api "PATCH" "zones/$CF_ZONE_ID/settings/min_tls_version" '{"value":"1.2"}'
    
    # Enable HSTS
    cf_api "PATCH" "zones/$CF_ZONE_ID/settings/security_header" '{
        "value": {
            "strict_transport_security": {
                "enabled": true,
                "max_age": 31536000,
                "include_subdomains": true,
                "preload": true
            }
        }
    }'
    
    echo -e "${GREEN}Security settings configured${NC}"
}

# Function to create page rules
create_page_rules() {
    echo "Creating page rules..."
    
    # Cache static assets
    cf_api "POST" "zones/$CF_ZONE_ID/pagerules" '{
        "targets": [
            {
                "target": "url",
                "constraint": {
                    "operator": "matches",
                    "value": "*fineprintai.com/*.jpg"
                }
            }
        ],
        "actions": [
            {
                "id": "cache_level",
                "value": "cache_everything"
            },
            {
                "id": "edge_cache_ttl",
                "value": 2592000
            }
        ],
        "priority": 1,
        "status": "active"
    }'
    
    echo -e "${GREEN}Page rules created${NC}"
}

# Function to enable DDoS protection
enable_ddos_protection() {
    echo "Enabling DDoS protection..."
    
    # Enable DDoS protection
    cf_api "PATCH" "zones/$CF_ZONE_ID/settings/advanced_ddos" '{"value":"on"}'
    
    echo -e "${GREEN}DDoS protection enabled${NC}"
}

# Function to enable Under Attack Mode
enable_under_attack() {
    echo -e "${YELLOW}Enabling Under Attack Mode...${NC}"
    cf_api "PATCH" "zones/$CF_ZONE_ID/settings/security_level" '{"value":"under_attack"}'
    echo -e "${GREEN}Under Attack Mode enabled${NC}"
}

# Function to disable Under Attack Mode
disable_under_attack() {
    echo "Disabling Under Attack Mode..."
    cf_api "PATCH" "zones/$CF_ZONE_ID/settings/security_level" '{"value":"medium"}'
    echo -e "${GREEN}Under Attack Mode disabled${NC}"
}

# Function to purge cache
purge_cache() {
    echo "Purging cache..."
    cf_api "POST" "zones/$CF_ZONE_ID/purge_cache" '{"purge_everything":true}'
    echo -e "${GREEN}Cache purged${NC}"
}

# Function to get analytics
get_analytics() {
    echo "Fetching analytics..."
    cf_api "GET" "zones/$CF_ZONE_ID/analytics/dashboard"
}

# Main menu
case "${1:-}" in
    setup)
        create_firewall_rules
        configure_security
        create_page_rules
        enable_ddos_protection
        ;;
    under-attack)
        enable_under_attack
        ;;
    normal)
        disable_under_attack
        ;;
    purge)
        purge_cache
        ;;
    analytics)
        get_analytics
        ;;
    *)
        echo "Usage: $0 {setup|under-attack|normal|purge|analytics}"
        exit 1
        ;;
esac
SCRIPT

chmod +x /opt/fineprintai/scripts/cloudflare-api.sh
print_success "Cloudflare API script created at /opt/fineprintai/scripts/cloudflare-api.sh"

#############################################
# CLOUDFLARE IPS FOR NGINX WHITELIST
#############################################

print_info "Downloading Cloudflare IP ranges..."

# Create directory for Cloudflare IPs
mkdir -p /etc/nginx/cloudflare

# Download Cloudflare IPv4 ranges
curl -s https://www.cloudflare.com/ips-v4 > /etc/nginx/cloudflare/ips-v4.txt

# Download Cloudflare IPv6 ranges  
curl -s https://www.cloudflare.com/ips-v6 > /etc/nginx/cloudflare/ips-v6.txt

# Create Nginx include file for Cloudflare IPs
cat > /etc/nginx/cloudflare/cloudflare.conf << 'EOF'
# Cloudflare IP addresses
# IPv4
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;

# IPv6
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;

# Use the CF-Connecting-IP header for the real IP
real_ip_header CF-Connecting-IP;
EOF

print_success "Cloudflare IP configuration created"

#############################################
# CLOUDFLARE ORIGIN CERTIFICATE SETUP
#############################################

cat << 'EOF' > /opt/fineprintai/scripts/cloudflare-origin-cert.sh
#!/bin/bash

# Script to set up Cloudflare Origin Certificate

echo "Cloudflare Origin Certificate Setup"
echo "===================================="
echo ""
echo "1. Log in to Cloudflare Dashboard"
echo "2. Go to SSL/TLS > Origin Server"
echo "3. Click 'Create Certificate'"
echo "4. Select your domains"
echo "5. Choose certificate validity (15 years recommended)"
echo "6. Copy the Origin Certificate and Private Key"
echo ""
echo "Paste the Origin Certificate (press Ctrl+D when done):"

# Read certificate
cat > /etc/nginx/ssl/cloudflare-origin.crt

echo ""
echo "Paste the Private Key (press Ctrl+D when done):"

# Read private key
cat > /etc/nginx/ssl/cloudflare-origin.key

# Set proper permissions
chmod 600 /etc/nginx/ssl/cloudflare-origin.key
chmod 644 /etc/nginx/ssl/cloudflare-origin.crt

echo "Origin certificate installed successfully!"
echo ""
echo "Update your Nginx configuration to use:"
echo "  ssl_certificate /etc/nginx/ssl/cloudflare-origin.crt;"
echo "  ssl_certificate_key /etc/nginx/ssl/cloudflare-origin.key;"
EOF

chmod +x /opt/fineprintai/scripts/cloudflare-origin-cert.sh
print_success "Cloudflare origin certificate script created"

#############################################
# CLOUDFLARE MONITORING SCRIPT
#############################################

cat << 'MONITOR' > /opt/fineprintai/scripts/cloudflare-monitor.sh
#!/bin/bash

# Cloudflare Monitoring Script
# Checks Cloudflare status and alerts on issues

CF_EMAIL="${CF_EMAIL:-your-email@example.com}"
CF_API_KEY="${CF_API_KEY:-your-api-key}"
CF_ZONE_ID="${CF_ZONE_ID:-your-zone-id}"

# Check zone status
check_zone_status() {
    response=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID" \
                    -H "X-Auth-Email: $CF_EMAIL" \
                    -H "X-Auth-Key: $CF_API_KEY" \
                    -H "Content-Type: application/json")
    
    status=$(echo "$response" | jq -r '.result.status')
    
    if [[ "$status" != "active" ]]; then
        echo "ALERT: Cloudflare zone is not active! Status: $status"
        # Send alert (implement your alerting mechanism here)
    fi
}

# Check for attacks
check_attacks() {
    response=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/analytics/dashboard?since=-1440&until=0" \
                    -H "X-Auth-Email: $CF_EMAIL" \
                    -H "X-Auth-Key: $CF_API_KEY" \
                    -H "Content-Type: application/json")
    
    threats=$(echo "$response" | jq -r '.result.totals.threats')
    
    if [[ "$threats" -gt 1000 ]]; then
        echo "ALERT: High threat activity detected! Threats in last 24h: $threats"
        # Consider enabling Under Attack Mode
    fi
}

# Check SSL certificate
check_ssl() {
    response=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/ssl/universal/settings" \
                    -H "X-Auth-Email: $CF_EMAIL" \
                    -H "X-Auth-Key: $CF_API_KEY" \
                    -H "Content-Type: application/json")
    
    enabled=$(echo "$response" | jq -r '.result.enabled')
    
    if [[ "$enabled" != "true" ]]; then
        echo "ALERT: Universal SSL is not enabled!"
    fi
}

# Run checks
check_zone_status
check_attacks
check_ssl
MONITOR

chmod +x /opt/fineprintai/scripts/cloudflare-monitor.sh
print_success "Cloudflare monitoring script created"

# Create cron job for monitoring
cat << 'EOF' > /etc/cron.d/cloudflare-monitor
# Cloudflare monitoring - runs every 5 minutes
*/5 * * * * root /opt/fineprintai/scripts/cloudflare-monitor.sh >> /var/log/cloudflare-monitor.log 2>&1
EOF

print_success "Cloudflare monitoring cron job created"

#############################################
# SUMMARY
#############################################

print_success "Cloudflare security setup completed!"
echo ""
echo "Next Steps:"
echo "1. Review the setup guide at /opt/fineprintai/docs/CLOUDFLARE_SETUP.md"
echo "2. Configure your Cloudflare account settings as described"
echo "3. Set environment variables for API access:"
echo "   export CF_EMAIL='your-email@example.com'"
echo "   export CF_API_KEY='your-api-key'"
echo "   export CF_ZONE_ID='your-zone-id'"
echo "4. Run: /opt/fineprintai/scripts/cloudflare-api.sh setup"
echo "5. Test your configuration thoroughly"
echo ""
echo "Important Files:"
echo "- Setup Guide: /opt/fineprintai/docs/CLOUDFLARE_SETUP.md"
echo "- API Script: /opt/fineprintai/scripts/cloudflare-api.sh"
echo "- Monitoring: /opt/fineprintai/scripts/cloudflare-monitor.sh"
echo "- Nginx CF IPs: /etc/nginx/cloudflare/cloudflare.conf"