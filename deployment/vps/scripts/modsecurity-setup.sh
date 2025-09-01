#!/bin/bash

#############################################
# Fine Print AI - ModSecurity WAF Setup
#############################################

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Functions
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root"
   exit 1
fi

print_info "Starting ModSecurity WAF setup..."

#############################################
# INSTALL MODSECURITY
#############################################

print_info "Installing ModSecurity and dependencies..."

# Install build dependencies
apt-get update
apt-get install -y \
    git \
    build-essential \
    libpcre3 \
    libpcre3-dev \
    libssl-dev \
    libtool \
    autoconf \
    apache2-dev \
    libxml2-dev \
    libcurl4-openssl-dev \
    libgeoip-dev \
    libyajl-dev \
    liblmdb-dev \
    libmaxminddb-dev \
    libfuzzy-dev \
    lua5.3-dev \
    pkg-config

# Clone and build ModSecurity
cd /tmp
if [ ! -d "ModSecurity" ]; then
    git clone --depth 1 -b v3/master --single-branch https://github.com/SpiderLabs/ModSecurity
fi

cd ModSecurity
git submodule init
git submodule update
./build.sh
./configure --with-yajl --with-geoip --with-lmdb --with-libxml --with-pcre --with-lua
make -j$(nproc)
make install

print_success "ModSecurity core installed"

#############################################
# INSTALL NGINX MODSECURITY CONNECTOR
#############################################

print_info "Installing ModSecurity-nginx connector..."

cd /tmp
if [ ! -d "ModSecurity-nginx" ]; then
    git clone --depth 1 https://github.com/SpiderLabs/ModSecurity-nginx.git
fi

# Get Nginx version
NGINX_VERSION=$(nginx -v 2>&1 | awk -F/ '{print $2}' | awk '{print $1}')

# Download Nginx source
cd /tmp
wget http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz
tar -xzvf nginx-${NGINX_VERSION}.tar.gz
cd nginx-${NGINX_VERSION}

# Configure with ModSecurity module
./configure --with-compat --add-dynamic-module=/tmp/ModSecurity-nginx
make modules
cp objs/ngx_http_modsecurity_module.so /usr/share/nginx/modules/

print_success "ModSecurity-nginx connector installed"

#############################################
# INSTALL OWASP CRS
#############################################

print_info "Installing OWASP Core Rule Set..."

# Create directories
mkdir -p /etc/nginx/modsecurity
mkdir -p /var/log/modsecurity
mkdir -p /var/cache/modsecurity

# Download OWASP CRS
cd /etc/nginx/modsecurity
if [ ! -d "owasp-crs" ]; then
    git clone https://github.com/coreruleset/coreruleset.git owasp-crs
fi

cd owasp-crs
cp crs-setup.conf.example crs-setup.conf

# Create main configuration
cat > /etc/nginx/modsecurity/main.conf << 'EOF'
# ModSecurity Main Configuration

# Include ModSecurity configuration
Include /opt/fineprintai/deployment/vps/config/modsecurity/modsecurity.conf

# Include OWASP CRS configuration
Include /etc/nginx/modsecurity/owasp-crs/crs-setup.conf

# Include OWASP CRS rules
Include /etc/nginx/modsecurity/owasp-crs/rules/*.conf

# Include custom rules
Include /etc/nginx/modsecurity/custom-rules/*.conf
EOF

print_success "OWASP Core Rule Set installed"

#############################################
# CREATE CUSTOM RULES
#############################################

print_info "Creating custom Fine Print AI rules..."

mkdir -p /etc/nginx/modsecurity/custom-rules

# API Protection Rules
cat > /etc/nginx/modsecurity/custom-rules/api-protection.conf << 'EOF'
# Fine Print AI API Protection Rules

# Rate limiting for document analysis
SecRule REQUEST_URI "@beginsWith /api/analyze" \
    "id:2001,\
    phase:1,\
    pass,\
    nolog,\
    initcol:ip=%{REMOTE_ADDR},\
    setvar:ip.document_analysis_counter=+1,\
    expirevar:ip.document_analysis_counter=60"

SecRule IP:document_analysis_counter "@gt 10" \
    "id:2002,\
    phase:1,\
    block,\
    msg:'Document analysis rate limit exceeded',\
    tag:'rate-limit',\
    severity:'WARNING'"

# Validate document upload size
SecRule REQUEST_URI "@beginsWith /api/upload" \
    "id:2003,\
    phase:1,\
    chain,\
    msg:'Document too large',\
    tag:'validation',\
    severity:'WARNING'"
    SecRule REQUEST_HEADERS:Content-Length "@gt 104857600" \
        "block"

# Protect authentication endpoints
SecRule REQUEST_URI "@rx ^/api/(login|register|reset-password)" \
    "id:2004,\
    phase:1,\
    pass,\
    nolog,\
    initcol:ip=%{REMOTE_ADDR},\
    setvar:ip.auth_attempt_counter=+1,\
    expirevar:ip.auth_attempt_counter=300"

SecRule IP:auth_attempt_counter "@gt 5" \
    "id:2005,\
    phase:1,\
    block,\
    msg:'Too many authentication attempts',\
    tag:'brute-force',\
    severity:'CRITICAL'"

# JWT Token validation
SecRule REQUEST_HEADERS:Authorization "@rx ^Bearer\s+([A-Za-z0-9\-_]+\.){2}[A-Za-z0-9\-_]+" \
    "id:2006,\
    phase:1,\
    pass,\
    nolog,\
    msg:'Valid JWT format',\
    tag:'jwt-validation'"

SecRule REQUEST_URI "@beginsWith /api/" \
    "id:2007,\
    phase:1,\
    chain,\
    msg:'Missing authentication token',\
    tag:'authentication',\
    severity:'WARNING'"
    SecRule REQUEST_URI "!@rx ^/api/(login|register|health|docs)" \
        "chain"
        SecRule &REQUEST_HEADERS:Authorization "@eq 0" \
            "block"
EOF

# Document Analysis Rules
cat > /etc/nginx/modsecurity/custom-rules/document-security.conf << 'EOF'
# Fine Print AI Document Security Rules

# Block suspicious document names
SecRule FILES_NAMES \
    "@rx (\.\.|\||<|>|&|\$|\{|\}|\[|\]|`)" \
    "id:3001,\
    phase:2,\
    block,\
    msg:'Suspicious characters in filename',\
    tag:'file-security',\
    severity:'WARNING'"

# Validate document types
SecRule FILES \
    "@rx ^%PDF|^\\x89PNG|^\\xFF\\xD8\\xFF|^\\x47\\x49\\x46|^PK\\x03\\x04|^\\xD0\\xCF\\x11\\xE0|^\\x50\\x4B\\x03\\x04" \
    "id:3002,\
    phase:2,\
    pass,\
    nolog,\
    msg:'Valid document type',\
    tag:'file-validation'"

# Block executable content in documents
SecRule FILES \
    "@rx (<script|javascript:|onerror=|onclick=|<iframe|<embed|<object)" \
    "id:3003,\
    phase:2,\
    block,\
    msg:'Executable content in document',\
    tag:'malicious-document',\
    severity:'CRITICAL'"

# Limit concurrent uploads per IP
SecRule REQUEST_URI "@beginsWith /api/upload" \
    "id:3004,\
    phase:1,\
    pass,\
    nolog,\
    initcol:ip=%{REMOTE_ADDR},\
    setvar:ip.concurrent_uploads=+1,\
    expirevar:ip.concurrent_uploads=30"

SecRule IP:concurrent_uploads "@gt 3" \
    "id:3005,\
    phase:1,\
    block,\
    msg:'Too many concurrent uploads',\
    tag:'rate-limit',\
    severity:'WARNING'"
EOF

# AI Model Protection Rules
cat > /etc/nginx/modsecurity/custom-rules/ai-protection.conf << 'EOF'
# Fine Print AI Model Protection Rules

# Protect against prompt injection
SecRule ARGS|REQUEST_BODY \
    "@rx (ignore previous instructions|disregard above|new instructions:|system prompt:|admin mode|debug mode)" \
    "id:4001,\
    phase:2,\
    block,\
    msg:'Potential prompt injection attempt',\
    tag:'ai-security',\
    severity:'CRITICAL'"

# Block model extraction attempts
SecRule REQUEST_URI "@rx /(model|weights|checkpoint|embedding)" \
    "id:4002,\
    phase:1,\
    block,\
    msg:'Model extraction attempt',\
    tag:'model-security',\
    severity:'CRITICAL'"

# Validate analysis requests
SecRule REQUEST_URI "@beginsWith /api/analyze" \
    "id:4003,\
    phase:2,\
    chain,\
    msg:'Invalid analysis request format',\
    tag:'validation',\
    severity:'WARNING'"
    SecRule REQUEST_BODY "!@rx \{.*\"document\".*\}" \
        "block"

# Rate limit AI inference
SecRule REQUEST_URI "@rx /api/(analyze|summarize|extract)" \
    "id:4004,\
    phase:1,\
    pass,\
    nolog,\
    initcol:ip=%{REMOTE_ADDR},\
    setvar:ip.ai_request_counter=+1,\
    expirevar:ip.ai_request_counter=60"

SecRule IP:ai_request_counter "@gt 20" \
    "id:4005,\
    phase:1,\
    block,\
    msg:'AI request rate limit exceeded',\
    tag:'rate-limit',\
    severity:'WARNING'"
EOF

print_success "Custom rules created"

#############################################
# CONFIGURE GEOIP DATABASE
#############################################

print_info "Setting up GeoIP database..."

# Install GeoIP database
mkdir -p /usr/share/GeoIP
cd /usr/share/GeoIP

# Download GeoLite2 databases (requires MaxMind account)
cat > /opt/fineprintai/scripts/update-geoip.sh << 'EOF'
#!/bin/bash

# MaxMind GeoIP Update Script
# Sign up at https://www.maxmind.com/en/geolite2/signup

MAXMIND_LICENSE_KEY="${MAXMIND_LICENSE_KEY:-YOUR_LICENSE_KEY}"

if [[ "$MAXMIND_LICENSE_KEY" == "YOUR_LICENSE_KEY" ]]; then
    echo "Please set MAXMIND_LICENSE_KEY environment variable"
    exit 1
fi

# Download GeoLite2 databases
cd /usr/share/GeoIP

# City database
wget -O GeoLite2-City.tar.gz "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz"
tar -xzvf GeoLite2-City.tar.gz
mv GeoLite2-City_*/GeoLite2-City.mmdb .
rm -rf GeoLite2-City_* GeoLite2-City.tar.gz

# Country database
wget -O GeoLite2-Country.tar.gz "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz"
tar -xzvf GeoLite2-Country.tar.gz
mv GeoLite2-Country_*/GeoLite2-Country.mmdb .
rm -rf GeoLite2-Country_* GeoLite2-Country.tar.gz

echo "GeoIP databases updated"
EOF

chmod +x /opt/fineprintai/scripts/update-geoip.sh
print_warning "GeoIP database update script created (requires MaxMind license key)"

#############################################
# CREATE UNICODE MAPPING FILE
#############################################

print_info "Creating Unicode mapping file..."

cat > /etc/nginx/modsecurity/unicode.mapping << 'EOF'
20127 ansi_x3.4-1968 ansi_x3.4-1986 ascii cp367 csascii ibm367 iso-ir-6 iso646-us iso_646.irv:1991 us us-ascii
EOF

#############################################
# CREATE MODSECURITY TEST SCRIPT
#############################################

print_info "Creating ModSecurity test script..."

cat > /opt/fineprintai/scripts/test-modsecurity.sh << 'EOF'
#!/bin/bash

# ModSecurity WAF Test Script

echo "Testing ModSecurity WAF..."
echo "=========================="

# Test SQL Injection
echo -n "Testing SQL Injection protection... "
response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/api/test?id=1' OR '1'='1")
if [ "$response" = "403" ]; then
    echo "✓ Blocked"
else
    echo "✗ Not blocked (Response: $response)"
fi

# Test XSS
echo -n "Testing XSS protection... "
response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/api/test?name=<script>alert('xss')</script>")
if [ "$response" = "403" ]; then
    echo "✓ Blocked"
else
    echo "✗ Not blocked (Response: $response)"
fi

# Test Path Traversal
echo -n "Testing Path Traversal protection... "
response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/api/../../etc/passwd")
if [ "$response" = "403" ]; then
    echo "✓ Blocked"
else
    echo "✗ Not blocked (Response: $response)"
fi

# Test Command Injection
echo -n "Testing Command Injection protection... "
response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost/api/test" -d "cmd=ls -la /etc/")
if [ "$response" = "403" ]; then
    echo "✓ Blocked"
else
    echo "✗ Not blocked (Response: $response)"
fi

# Test Suspicious User-Agent
echo -n "Testing Suspicious User-Agent blocking... "
response=$(curl -s -o /dev/null -w "%{http_code}" -H "User-Agent: sqlmap/1.0" "http://localhost/api/test")
if [ "$response" = "403" ]; then
    echo "✓ Blocked"
else
    echo "✗ Not blocked (Response: $response)"
fi

echo ""
echo "Test complete. Check /var/log/modsecurity/modsec_audit.log for details."
EOF

chmod +x /opt/fineprintai/scripts/test-modsecurity.sh
print_success "ModSecurity test script created"

#############################################
# CREATE LOG ROTATION
#############################################

print_info "Setting up log rotation..."

cat > /etc/logrotate.d/modsecurity << 'EOF'
/var/log/modsecurity/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 640 www-data adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
    endscript
}
EOF

print_success "Log rotation configured"

#############################################
# CREATE MONITORING SCRIPT
#############################################

print_info "Creating ModSecurity monitoring script..."

cat > /opt/fineprintai/scripts/modsecurity-monitor.sh << 'EOF'
#!/bin/bash

# ModSecurity Monitoring Script

LOG_FILE="/var/log/modsecurity/modsec_audit.log"
ALERT_THRESHOLD=10

# Count blocked requests in last hour
blocked_count=$(grep -c "id.*phase.*block" "$LOG_FILE" 2>/dev/null || echo 0)

if [ "$blocked_count" -gt "$ALERT_THRESHOLD" ]; then
    echo "ALERT: High number of blocked requests: $blocked_count in last hour"
    
    # Top blocked IPs
    echo "Top blocked IPs:"
    grep "id.*phase.*block" "$LOG_FILE" | \
        grep -oP 'client: \K[0-9.]+' | \
        sort | uniq -c | sort -rn | head -5
    
    # Top triggered rules
    echo "Top triggered rules:"
    grep -oP 'id:\K[0-9]+' "$LOG_FILE" | \
        sort | uniq -c | sort -rn | head -5
fi

# Check for critical severity alerts
critical_count=$(grep -c "severity:CRITICAL" "$LOG_FILE" 2>/dev/null || echo 0)
if [ "$critical_count" -gt 0 ]; then
    echo "CRITICAL: $critical_count critical security events detected!"
fi
EOF

chmod +x /opt/fineprintai/scripts/modsecurity-monitor.sh

# Add to cron
echo "*/15 * * * * root /opt/fineprintai/scripts/modsecurity-monitor.sh >> /var/log/modsecurity-monitor.log 2>&1" > /etc/cron.d/modsecurity-monitor

print_success "ModSecurity monitoring configured"

#############################################
# SUMMARY
#############################################

print_success "ModSecurity WAF setup completed!"
echo ""
echo "Configuration Summary:"
echo "====================="
echo "✓ ModSecurity v3 installed"
echo "✓ OWASP Core Rule Set configured"
echo "✓ Custom Fine Print AI rules created"
echo "✓ API protection rules enabled"
echo "✓ Document security rules active"
echo "✓ AI model protection configured"
echo "✓ Monitoring and logging setup"
echo ""
echo "Important Files:"
echo "==============="
echo "• Main config: /etc/nginx/modsecurity/main.conf"
echo "• Custom rules: /etc/nginx/modsecurity/custom-rules/"
echo "• Audit log: /var/log/modsecurity/modsec_audit.log"
echo "• Test script: /opt/fineprintai/scripts/test-modsecurity.sh"
echo "• Monitor script: /opt/fineprintai/scripts/modsecurity-monitor.sh"
echo ""
echo "Next Steps:"
echo "==========="
echo "1. Update Nginx configuration to load ModSecurity module"
echo "2. Add to nginx.conf: load_module modules/ngx_http_modsecurity_module.so;"
echo "3. Enable in location blocks: modsecurity on; modsecurity_rules_file /etc/nginx/modsecurity/main.conf;"
echo "4. Test configuration: nginx -t"
echo "5. Reload Nginx: systemctl reload nginx"
echo "6. Run tests: /opt/fineprintai/scripts/test-modsecurity.sh"
echo ""
print_warning "Remember to test thoroughly in detection-only mode before enabling blocking!"
print_info "To enable detection-only mode, change SecRuleEngine to 'DetectionOnly' in modsecurity.conf"