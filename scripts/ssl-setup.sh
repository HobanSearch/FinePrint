#!/bin/bash

# SSL Certificate Setup Script for Fine Print AI
# This script sets up Let's Encrypt SSL certificates using Certbot

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Load environment variables
if [ -f ".env.production" ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
else
    print_error ".env.production file not found!"
    exit 1
fi

# Check if DOMAIN is set
if [ -z "$DOMAIN" ]; then
    print_error "DOMAIN variable is not set in .env.production"
    exit 1
fi

# Email for Let's Encrypt notifications
if [ -z "$SSL_EMAIL" ]; then
    SSL_EMAIL="admin@$DOMAIN"
    print_warning "SSL_EMAIL not set, using $SSL_EMAIL"
fi

print_status "========================================="
print_status "SSL Certificate Setup for $DOMAIN"
print_status "========================================="
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root for SSL certificate generation"
   exit 1
fi

# Method 1: Using Certbot with Docker
setup_certbot_docker() {
    print_status "Setting up SSL certificates using Certbot Docker..."
    
    # Create necessary directories
    mkdir -p nginx/ssl
    mkdir -p /etc/letsencrypt
    
    # Stop nginx if running to free port 80
    print_status "Stopping nginx temporarily..."
    docker-compose stop nginx 2>/dev/null || true
    
    # Run certbot in standalone mode
    print_status "Requesting SSL certificate from Let's Encrypt..."
    docker run -it --rm \
        -p 80:80 \
        -v /etc/letsencrypt:/etc/letsencrypt \
        -v /var/lib/letsencrypt:/var/lib/letsencrypt \
        certbot/certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email $SSL_EMAIL \
        -d $DOMAIN \
        -d www.$DOMAIN
    
    if [ $? -eq 0 ]; then
        print_status "✓ SSL certificate obtained successfully!"
        
        # Create symbolic links for nginx
        ln -sf /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/ssl/fullchain.pem
        ln -sf /etc/letsencrypt/live/$DOMAIN/privkey.pem nginx/ssl/privkey.pem
        
        # Start nginx again
        print_status "Starting nginx with SSL..."
        docker-compose up -d nginx
        
        return 0
    else
        print_error "Failed to obtain SSL certificate"
        return 1
    fi
}

# Method 2: Using Certbot installed on host
setup_certbot_host() {
    print_status "Setting up SSL certificates using host Certbot..."
    
    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        print_status "Installing Certbot..."
        apt-get update
        apt-get install -y certbot
    fi
    
    # Stop nginx if running
    print_status "Stopping nginx temporarily..."
    docker-compose stop nginx 2>/dev/null || true
    
    # Request certificate
    print_status "Requesting SSL certificate from Let's Encrypt..."
    certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email $SSL_EMAIL \
        -d $DOMAIN \
        -d www.$DOMAIN
    
    if [ $? -eq 0 ]; then
        print_status "✓ SSL certificate obtained successfully!"
        
        # Copy certificates to nginx directory
        mkdir -p nginx/ssl
        cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/ssl/
        cp /etc/letsencrypt/live/$DOMAIN/privkey.pem nginx/ssl/
        
        # Set proper permissions
        chmod 644 nginx/ssl/fullchain.pem
        chmod 600 nginx/ssl/privkey.pem
        
        # Start nginx again
        print_status "Starting nginx with SSL..."
        docker-compose up -d nginx
        
        return 0
    else
        print_error "Failed to obtain SSL certificate"
        return 1
    fi
}

# Method 3: Self-signed certificate (for testing)
setup_self_signed() {
    print_warning "Creating self-signed certificate for testing..."
    print_warning "This should only be used for development/testing!"
    
    mkdir -p nginx/ssl
    
    # Generate self-signed certificate
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/privkey.pem \
        -out nginx/ssl/fullchain.pem \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"
    
    if [ $? -eq 0 ]; then
        print_status "✓ Self-signed certificate created"
        chmod 644 nginx/ssl/fullchain.pem
        chmod 600 nginx/ssl/privkey.pem
        
        # Restart nginx
        docker-compose restart nginx
        
        return 0
    else
        print_error "Failed to create self-signed certificate"
        return 1
    fi
}

# Setup automatic renewal
setup_auto_renewal() {
    print_status "Setting up automatic certificate renewal..."
    
    # Create renewal script
    cat > /etc/cron.daily/certbot-renew << 'EOF'
#!/bin/bash
certbot renew --quiet --no-self-upgrade --post-hook "docker-compose -f /opt/fineprintai/docker-compose.yml restart nginx"
EOF
    
    chmod +x /etc/cron.daily/certbot-renew
    
    print_status "✓ Automatic renewal configured (runs daily)"
}

# Main execution
echo "Choose SSL setup method:"
echo "1) Let's Encrypt (Production)"
echo "2) Let's Encrypt (Staging/Testing)"
echo "3) Self-signed certificate (Development only)"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        print_status "Setting up Let's Encrypt production certificate..."
        if setup_certbot_docker; then
            setup_auto_renewal
            print_status "✓ SSL setup complete!"
        else
            print_error "SSL setup failed. Trying alternative method..."
            if setup_certbot_host; then
                setup_auto_renewal
                print_status "✓ SSL setup complete!"
            else
                print_error "All methods failed. Please check your domain DNS settings."
                exit 1
            fi
        fi
        ;;
    2)
        print_status "Setting up Let's Encrypt staging certificate..."
        # Add --staging flag for testing
        docker run -it --rm \
            -p 80:80 \
            -v /etc/letsencrypt:/etc/letsencrypt \
            certbot/certbot certonly \
            --standalone \
            --staging \
            --non-interactive \
            --agree-tos \
            --email $SSL_EMAIL \
            -d $DOMAIN \
            -d www.$DOMAIN
        
        if [ $? -eq 0 ]; then
            mkdir -p nginx/ssl
            ln -sf /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/ssl/fullchain.pem
            ln -sf /etc/letsencrypt/live/$DOMAIN/privkey.pem nginx/ssl/privkey.pem
            docker-compose up -d nginx
            print_status "✓ Staging SSL certificate setup complete!"
        else
            print_error "Failed to obtain staging certificate"
            exit 1
        fi
        ;;
    3)
        setup_self_signed
        ;;
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

# Test SSL configuration
echo ""
print_status "Testing SSL configuration..."

# Wait for nginx to be ready
sleep 5

# Test HTTPS connection
if curl -k https://localhost &>/dev/null; then
    print_status "✓ HTTPS is working on localhost"
else
    print_warning "⚠ Could not verify HTTPS on localhost"
fi

# Show certificate information
echo ""
print_status "Certificate information:"
openssl x509 -in nginx/ssl/fullchain.pem -noout -subject -dates 2>/dev/null || print_warning "Could not read certificate"

echo ""
print_status "========================================="
print_status "SSL Setup Complete!"
print_status "========================================="
print_status "Your site should now be accessible at:"
print_status "  https://$DOMAIN"
print_status "  https://www.$DOMAIN"
echo ""

if [ "$choice" == "3" ]; then
    print_warning "You are using a self-signed certificate."
    print_warning "Browsers will show a security warning."
    print_warning "This is normal for development environments."
else
    print_status "Certificate will auto-renew before expiration."
fi

print_status "Done!"