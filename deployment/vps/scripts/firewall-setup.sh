#!/bin/bash

#############################################
# Fine Print AI - Comprehensive Firewall Setup
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

# Configuration variables
SERVER_IP=$(ip addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -n1)
SSH_PORT="${SSH_PORT:-22}"
ADMIN_IP="${ADMIN_IP:-}"  # Set this to your admin IP for SSH access

print_info "Starting comprehensive firewall configuration..."
print_info "Server IP detected: $SERVER_IP"

#############################################
# INSTALL REQUIRED PACKAGES
#############################################

print_info "Installing firewall packages..."
apt-get update
apt-get install -y ufw fail2ban iptables-persistent ipset

#############################################
# BACKUP EXISTING RULES
#############################################

print_info "Backing up existing firewall rules..."
mkdir -p /opt/fineprintai/backups/firewall
iptables-save > /opt/fineprintai/backups/firewall/iptables-backup-$(date +%Y%m%d-%H%M%S).rules
if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
    ufw status numbered > /opt/fineprintai/backups/firewall/ufw-backup-$(date +%Y%m%d-%H%M%S).txt
fi

#############################################
# KERNEL HARDENING
#############################################

print_info "Applying kernel hardening parameters..."

cat > /etc/sysctl.d/99-fineprintai-security.conf << 'EOF'
# Fine Print AI Security Hardening

# IP Spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0

# Ignore send redirects
net.ipv4.conf.all.send_redirects = 0

# Disable source packet routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# Log Martians
net.ipv4.conf.all.log_martians = 1

# Ignore ICMP ping requests
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1

# Enable SYN cookies (DDoS protection)
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_syn_retries = 2
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_max_syn_backlog = 4096

# TCP optimization
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_keepalive_intvl = 15

# Increase system file descriptor limit
fs.file-max = 65535

# Increase network buffers
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_rmem = 4096 87380 8388608
net.ipv4.tcp_wmem = 4096 87380 8388608

# Protection against TIME-WAIT assassination
net.ipv4.tcp_rfc1337 = 1

# Disable IPv6 if not needed
#net.ipv6.conf.all.disable_ipv6 = 1
#net.ipv6.conf.default.disable_ipv6 = 1
#net.ipv6.conf.lo.disable_ipv6 = 1

# Increase conntrack table size
net.netfilter.nf_conntrack_max = 524288
net.nf_conntrack_max = 524288
EOF

sysctl -p /etc/sysctl.d/99-fineprintai-security.conf
print_success "Kernel parameters hardened"

#############################################
# CREATE IPSETS FOR BLOCKING
#############################################

print_info "Creating IP sets for blocking..."

# Create ipsets for different block categories
ipset create blacklist hash:ip hashsize 4096 maxelem 200000 2>/dev/null || ipset flush blacklist
ipset create whitelist hash:ip hashsize 1024 maxelem 10000 2>/dev/null || ipset flush whitelist
ipset create cloudflare hash:net hashsize 1024 maxelem 100 2>/dev/null || ipset flush cloudflare
ipset create ratelimit hash:ip timeout 3600 hashsize 4096 maxelem 100000 2>/dev/null || true

# Add Cloudflare IPs to whitelist
print_info "Adding Cloudflare IPs to whitelist..."
for ip in 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22; do
    ipset add cloudflare "$ip" 2>/dev/null || true
done

print_success "IP sets created"

#############################################
# CONFIGURE IPTABLES RULES
#############################################

print_info "Configuring iptables rules..."

# Flush existing rules (careful in production!)
iptables -F
iptables -X
iptables -Z

# Set default policies
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Drop invalid packets
iptables -A INPUT -m conntrack --ctstate INVALID -j DROP

# Allow established connections
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Whitelist trusted IPs
iptables -A INPUT -m set --match-set whitelist src -j ACCEPT

# Allow Cloudflare IPs
iptables -A INPUT -m set --match-set cloudflare src -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -m set --match-set cloudflare src -p tcp --dport 443 -j ACCEPT

# Drop blacklisted IPs
iptables -A INPUT -m set --match-set blacklist src -j DROP

# Rate limiting for SSH
iptables -A INPUT -p tcp --dport $SSH_PORT -m conntrack --ctstate NEW -m recent --set
iptables -A INPUT -p tcp --dport $SSH_PORT -m conntrack --ctstate NEW -m recent --update --seconds 60 --hitcount 4 -j DROP

# SSH access (restricted)
if [[ -n "$ADMIN_IP" ]]; then
    iptables -A INPUT -p tcp -s "$ADMIN_IP" --dport $SSH_PORT -j ACCEPT
else
    # Warning: This allows SSH from anywhere - consider restricting!
    iptables -A INPUT -p tcp --dport $SSH_PORT -m conntrack --ctstate NEW -m limit --limit 3/min --limit-burst 3 -j ACCEPT
fi

# HTTP/HTTPS from Cloudflare only (if using Cloudflare)
# Comment these out if not using Cloudflare
iptables -A INPUT -p tcp --dport 80 -m set --match-set cloudflare src -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -m set --match-set cloudflare src -j ACCEPT

# If not using Cloudflare, uncomment these:
# iptables -A INPUT -p tcp --dport 80 -m limit --limit 100/second --limit-burst 200 -j ACCEPT
# iptables -A INPUT -p tcp --dport 443 -m limit --limit 100/second --limit-burst 200 -j ACCEPT

# DDoS Protection Rules
# SYN flood protection
iptables -N syn_flood
iptables -A INPUT -p tcp --syn -j syn_flood
iptables -A syn_flood -m limit --limit 10/s --limit-burst 20 -j RETURN
iptables -A syn_flood -j DROP

# ICMP flood protection
iptables -A INPUT -p icmp -m limit --limit 1/s --limit-burst 1 -j ACCEPT
iptables -A INPUT -p icmp -j DROP

# Port scanning protection
iptables -N port_scanning
iptables -A port_scanning -p tcp --tcp-flags SYN,ACK,FIN,RST RST -m limit --limit 1/s --limit-burst 2 -j RETURN
iptables -A port_scanning -j DROP

# Invalid packet protection
iptables -A INPUT -p tcp --tcp-flags ALL NONE -j DROP
iptables -A INPUT -p tcp --tcp-flags ALL ALL -j DROP
iptables -A INPUT -p tcp --tcp-flags ALL SYN,RST -j DROP
iptables -A INPUT -p tcp --tcp-flags SYN,FIN SYN,FIN -j DROP
iptables -A INPUT -p tcp --tcp-flags SYN,RST SYN,RST -j DROP
iptables -A INPUT -p tcp --tcp-flags ALL SYN,RST,ACK,FIN,URG -j DROP
iptables -A INPUT -p tcp --tcp-flags ALL FIN,PSH,URG -j DROP
iptables -A INPUT -p tcp --tcp-flags ALL PSH,URG -j DROP

# Block common attack ports
iptables -A INPUT -p tcp -m multiport --dports 135,137,138,139,445,1433,1434 -j DROP
iptables -A INPUT -p udp -m multiport --dports 135,137,138,139,445,1433,1434 -j DROP

# Log dropped packets (be careful with log volume)
iptables -N LOGGING
iptables -A INPUT -j LOGGING
iptables -A LOGGING -m limit --limit 2/min -j LOG --log-prefix "IPTables-Dropped: " --log-level 4
iptables -A LOGGING -j DROP

# Save iptables rules
iptables-save > /etc/iptables/rules.v4
ip6tables-save > /etc/iptables/rules.v6

print_success "iptables rules configured"

#############################################
# CONFIGURE UFW (User Friendly Firewall)
#############################################

print_info "Configuring UFW..."

# Reset UFW to defaults
ufw --force disable
echo "y" | ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing
ufw default deny forward

# Allow SSH (rate limited)
if [[ -n "$ADMIN_IP" ]]; then
    ufw allow from "$ADMIN_IP" to any port "$SSH_PORT"
else
    ufw limit "$SSH_PORT"/tcp comment 'SSH rate limit'
fi

# Allow HTTP/HTTPS from Cloudflare
for ip in 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22; do
    ufw allow from "$ip" to any port 80 proto tcp comment 'Cloudflare HTTP'
    ufw allow from "$ip" to any port 443 proto tcp comment 'Cloudflare HTTPS'
done

# Enable UFW
ufw --force enable

print_success "UFW configured and enabled"

#############################################
# CONFIGURE FAIL2BAN
#############################################

print_info "Configuring fail2ban..."

# Create fail2ban directory
mkdir -p /etc/fail2ban/filter.d
mkdir -p /etc/fail2ban/jail.d

# Create custom fail2ban jail configuration
cat > /etc/fail2ban/jail.d/fineprintai.conf << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
destemail = admin@fineprintai.com
sender = fail2ban@fineprintai.com
action = %(action_mwl)s

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 7200

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 3600

[nginx-noscript]
enabled = true
port = http,https
filter = nginx-noscript
logpath = /var/log/nginx/access.log
maxretry = 2
bantime = 86400

[nginx-badbots]
enabled = true
port = http,https
filter = nginx-badbots
logpath = /var/log/nginx/access.log
maxretry = 1
bantime = 86400

[nginx-noproxy]
enabled = true
port = http,https
filter = nginx-noproxy
logpath = /var/log/nginx/error.log
maxretry = 2
bantime = 86400

[nginx-req-limit]
enabled = true
filter = nginx-req-limit
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 10
findtime = 60
bantime = 3600

[nginx-conn-limit]
enabled = true
filter = nginx-conn-limit
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 5
findtime = 60
bantime = 3600

[docker-api]
enabled = true
filter = docker-api
port = 8000,8001
logpath = /var/log/docker/*.log
maxretry = 5
bantime = 3600

[wordpress]
enabled = false
port = http,https
filter = wordpress
logpath = /var/log/nginx/access.log
maxretry = 3
bantime = 7200

[recidive]
enabled = true
filter = recidive
logpath = /var/log/fail2ban.log
action = %(action_mwl)s
bantime = 86400
maxretry = 3
EOF

# Create nginx-badbots filter
cat > /etc/fail2ban/filter.d/nginx-badbots.conf << 'EOF'
[Definition]
badbots = Googlebot-Image|Googlebot|bingbot|Baiduspider|wordpress|MJ12bot|AhrefsBot|SemrushBot|DotBot|PetalBot|Bytespider
failregex = ^<HOST> .* "(?:GET|POST|HEAD) .*HTTP.*" .* ".*(%(badbots)s).*"$
ignoreregex =
EOF

# Create nginx-noscript filter
cat > /etc/fail2ban/filter.d/nginx-noscript.conf << 'EOF'
[Definition]
failregex = ^<HOST> .* "(?:GET|POST|HEAD) .*/(?:scripts|cgi-bin|wp-admin|phpmyadmin).*HTTP.*" (?:404|403|500) .*$
ignoreregex =
EOF

# Create nginx-noproxy filter
cat > /etc/fail2ban/filter.d/nginx-noproxy.conf << 'EOF'
[Definition]
failregex = ^.*\[error\] \d+#\d+: \*\d+ access forbidden by rule, client: <HOST>.*$
ignoreregex =
EOF

# Create nginx-req-limit filter
cat > /etc/fail2ban/filter.d/nginx-req-limit.conf << 'EOF'
[Definition]
failregex = ^.*limiting requests, excess: [\d\.]+ by zone "(?:[\w]+)", client: <HOST>.*$
ignoreregex =
EOF

# Create nginx-conn-limit filter
cat > /etc/fail2ban/filter.d/nginx-conn-limit.conf << 'EOF'
[Definition]
failregex = ^.*limiting connections by zone "(?:[\w]+)", client: <HOST>.*$
ignoreregex =
EOF

# Create docker-api filter
cat > /etc/fail2ban/filter.d/docker-api.conf << 'EOF'
[Definition]
failregex = ^.*\[ERROR\].* client: <HOST>.*$
            ^.*401 Unauthorized.* <HOST>.*$
            ^.*403 Forbidden.* <HOST>.*$
ignoreregex =
EOF

# Restart fail2ban
systemctl restart fail2ban
systemctl enable fail2ban

print_success "fail2ban configured and started"

#############################################
# PORT KNOCKING SETUP (Optional)
#############################################

print_info "Setting up port knocking (optional)..."

cat > /opt/fineprintai/scripts/port-knocking.sh << 'EOF'
#!/bin/bash

# Port knocking configuration
# Knock sequence: 7000, 8000, 9000

# Install knockd
apt-get install -y knockd

# Configure knockd
cat > /etc/knockd.conf << 'KNOCKD'
[options]
    UseSyslog

[openSSH]
    sequence    = 7000,8000,9000
    seq_timeout = 5
    command     = /sbin/iptables -A INPUT -s %IP% -p tcp --dport 22 -j ACCEPT
    tcpflags    = syn

[closeSSH]
    sequence    = 9000,8000,7000
    seq_timeout = 5
    command     = /sbin/iptables -D INPUT -s %IP% -p tcp --dport 22 -j ACCEPT
    tcpflags    = syn
KNOCKD

# Enable knockd
sed -i 's/START_KNOCKD=0/START_KNOCKD=1/' /etc/default/knockd

# Start knockd
systemctl restart knockd
systemctl enable knockd

echo "Port knocking configured!"
echo "To open SSH: knock -v SERVER_IP 7000 8000 9000"
echo "To close SSH: knock -v SERVER_IP 9000 8000 7000"
EOF

chmod +x /opt/fineprintai/scripts/port-knocking.sh
print_warning "Port knocking script created but not enabled by default"

#############################################
# HETZNER CLOUD FIREWALL (if applicable)
#############################################

print_info "Creating Hetzner Cloud Firewall configuration..."

cat > /opt/fineprintai/scripts/hetzner-firewall.sh << 'EOF'
#!/bin/bash

# Hetzner Cloud Firewall Configuration
# This requires Hetzner Cloud API token

HCLOUD_TOKEN="${HCLOUD_TOKEN:-your-token-here}"

if [[ "$HCLOUD_TOKEN" == "your-token-here" ]]; then
    echo "Please set HCLOUD_TOKEN environment variable"
    exit 1
fi

# Install hcloud CLI
curl -o /tmp/hcloud.tar.gz -L https://github.com/hetznercloud/cli/releases/latest/download/hcloud-linux-amd64.tar.gz
tar -xzf /tmp/hcloud.tar.gz -C /usr/local/bin
chmod +x /usr/local/bin/hcloud

# Configure hcloud
hcloud context create fineprintai
hcloud context use fineprintai

# Create firewall rules
hcloud firewall create --name fineprintai-firewall \
    --rules '[
        {
            "direction": "in",
            "port": "22",
            "protocol": "tcp",
            "source_ips": ["0.0.0.0/0"]
        },
        {
            "direction": "in",
            "port": "80",
            "protocol": "tcp",
            "source_ips": ["0.0.0.0/0"]
        },
        {
            "direction": "in",
            "port": "443",
            "protocol": "tcp",
            "source_ips": ["0.0.0.0/0"]
        }
    ]'

# Apply firewall to server
hcloud firewall apply-to-resource fineprintai-firewall --type server --server YOUR_SERVER_NAME

echo "Hetzner Cloud Firewall configured!"
EOF

chmod +x /opt/fineprintai/scripts/hetzner-firewall.sh
print_info "Hetzner firewall script created (requires API token to use)"

#############################################
# FIREWALL MONITORING SCRIPT
#############################################

print_info "Creating firewall monitoring script..."

cat > /opt/fineprintai/scripts/firewall-monitor.sh << 'EOF'
#!/bin/bash

# Firewall Monitoring Script

LOG_FILE="/var/log/firewall-monitor.log"
ALERT_THRESHOLD=100

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Check dropped packets
check_dropped_packets() {
    dropped=$(iptables -nvL | grep DROP | awk '{sum+=$1} END {print sum}')
    if [[ "$dropped" -gt "$ALERT_THRESHOLD" ]]; then
        log_message "ALERT: High number of dropped packets: $dropped"
        # Send alert (implement your alerting mechanism)
    fi
}

# Check fail2ban bans
check_fail2ban() {
    banned=$(fail2ban-client status | grep "Number of jail" | awk '{print $NF}')
    if [[ "$banned" -gt 0 ]]; then
        log_message "INFO: fail2ban has $banned active bans"
        # List banned IPs
        for jail in $(fail2ban-client status | grep "Jail list" | sed 's/.*://;s/,//g'); do
            banned_ips=$(fail2ban-client status "$jail" | grep "Banned IP" | sed 's/.*://')
            if [[ -n "$banned_ips" ]]; then
                log_message "Jail $jail banned IPs: $banned_ips"
            fi
        done
    fi
}

# Check connection count
check_connections() {
    connections=$(netstat -an | grep ESTABLISHED | wc -l)
    if [[ "$connections" -gt 1000 ]]; then
        log_message "WARNING: High number of connections: $connections"
    fi
}

# Check for port scans
check_port_scans() {
    scans=$(grep "IPTables-Dropped:" /var/log/syslog | tail -100 | wc -l)
    if [[ "$scans" -gt 50 ]]; then
        log_message "WARNING: Possible port scan detected ($scans dropped packets in last 100 log entries)"
    fi
}

# Run checks
check_dropped_packets
check_fail2ban
check_connections
check_port_scans

# Report status
log_message "Firewall monitoring check completed"
EOF

chmod +x /opt/fineprintai/scripts/firewall-monitor.sh

# Create cron job for monitoring
cat > /etc/cron.d/firewall-monitor << 'EOF'
# Firewall monitoring - runs every 5 minutes
*/5 * * * * root /opt/fineprintai/scripts/firewall-monitor.sh
EOF

print_success "Firewall monitoring configured"

#############################################
# CREATE EMERGENCY DISABLE SCRIPT
#############################################

print_info "Creating emergency firewall disable script..."

cat > /opt/fineprintai/scripts/firewall-emergency-disable.sh << 'EOF'
#!/bin/bash

echo "EMERGENCY: Disabling all firewall rules!"
echo "This should only be used in emergency situations!"
echo ""
read -p "Are you sure? (type 'yes' to continue): " confirm

if [[ "$confirm" != "yes" ]]; then
    echo "Aborted."
    exit 1
fi

# Backup current rules
iptables-save > /opt/fineprintai/backups/firewall/emergency-backup-$(date +%Y%m%d-%H%M%S).rules

# Reset iptables
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
iptables -P INPUT ACCEPT
iptables -P FORWARD ACCEPT
iptables -P OUTPUT ACCEPT

# Disable UFW
ufw --force disable

# Stop fail2ban
systemctl stop fail2ban

echo "All firewall rules have been disabled!"
echo "WARNING: Your server is now unprotected!"
echo "To restore, run: /opt/fineprintai/scripts/firewall-setup.sh"
EOF

chmod +x /opt/fineprintai/scripts/firewall-emergency-disable.sh
print_warning "Emergency disable script created - use with extreme caution!"

#############################################
# SUMMARY
#############################################

print_success "Comprehensive firewall setup completed!"
echo ""
echo "Firewall Configuration Summary:"
echo "==============================="
echo "✓ Kernel hardening applied"
echo "✓ iptables rules configured"
echo "✓ UFW enabled with Cloudflare whitelist"
echo "✓ fail2ban configured with custom jails"
echo "✓ IP sets created for blocking"
echo "✓ DDoS protection rules active"
echo "✓ Monitoring scripts installed"
echo ""
echo "Current Status:"
echo "---------------"
ufw status numbered | head -10
echo ""
echo "fail2ban status:"
fail2ban-client status
echo ""
echo "Important Commands:"
echo "-------------------"
echo "View UFW status:        ufw status verbose"
echo "View iptables rules:    iptables -L -v -n"
echo "View fail2ban status:   fail2ban-client status"
echo "Check blocked IPs:      ipset list blacklist"
echo "Add IP to whitelist:    ipset add whitelist IP_ADDRESS"
echo "Block an IP:            ipset add blacklist IP_ADDRESS"
echo "Monitor firewall:       tail -f /var/log/firewall-monitor.log"
echo "Emergency disable:      /opt/fineprintai/scripts/firewall-emergency-disable.sh"
echo ""
echo "Configuration Files:"
echo "--------------------"
echo "UFW rules:           /etc/ufw/rules.*"
echo "fail2ban config:     /etc/fail2ban/jail.d/fineprintai.conf"
echo "Kernel parameters:   /etc/sysctl.d/99-fineprintai-security.conf"
echo "Monitoring script:   /opt/fineprintai/scripts/firewall-monitor.sh"
echo ""
print_warning "Remember to test your configuration and ensure legitimate traffic is not blocked!"
print_warning "If using SSH, make sure you can still connect before closing your current session!"