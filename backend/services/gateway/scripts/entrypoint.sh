#!/bin/bash
set -e

echo "Starting Fine Print AI Gateway..."

# Function to wait for service
wait_for_service() {
    local service_host=$1
    local service_port=$2
    local service_name=$3
    
    echo "Waiting for $service_name to be ready..."
    while ! nc -z $service_host $service_port; do
        echo "Waiting for $service_name at $service_host:$service_port..."
        sleep 2
    done
    echo "$service_name is ready!"
}

# Function to validate Kong configuration
validate_kong_config() {
    echo "Validating Kong configuration..."
    
    if [ -f "/etc/kong/declarative/kong.yml" ]; then
        kong config parse /etc/kong/declarative/kong.yml
        if [ $? -eq 0 ]; then
            echo "Kong configuration is valid"
        else
            echo "Kong configuration validation failed"
            exit 1
        fi
    else
        echo "Kong configuration file not found"
        exit 1
    fi
}

# Function to setup SSL certificates if needed
setup_ssl_certs() {
    echo "Setting up SSL certificates..."
    
    if [ ! -f "/etc/kong/ssl/kong.crt" ] || [ ! -f "/etc/kong/ssl/kong.key" ]; then
        echo "Generating self-signed SSL certificates for development..."
        
        mkdir -p /etc/kong/ssl
        
        # Generate private key
        openssl genrsa -out /etc/kong/ssl/kong.key 2048
        
        # Generate certificate
        openssl req -new -x509 -key /etc/kong/ssl/kong.key \
            -out /etc/kong/ssl/kong.crt -days 365 \
            -subj "/C=US/ST=CA/L=SF/O=FinePrintAI/CN=*.fineprintai.com"
        
        # Set permissions
        chmod 600 /etc/kong/ssl/kong.key
        chmod 644 /etc/kong/ssl/kong.crt
        
        # Copy for admin SSL
        cp /etc/kong/ssl/kong.crt /etc/kong/ssl/admin.crt
        cp /etc/kong/ssl/kong.key /etc/kong/ssl/admin.key
        
        echo "SSL certificates generated"
    else
        echo "SSL certificates already exist"
    fi
}

# Function to start health check service
start_health_service() {
    echo "Starting health check service..."
    
    if [ -d "/opt/gateway-health" ]; then
        cd /opt/gateway-health
        
        # Start health service with PM2
        pm2 start index.js --name "gateway-health" \
            --max-memory-restart 512M \
            --restart-delay 3000 \
            --max-restarts 10 \
            --kill-timeout 5000
        
        echo "Health check service started"
    else
        echo "Health check service not found, skipping..."
    fi
}

# Function to perform preflight checks
preflight_checks() {
    echo "Performing preflight checks..."
    
    # Check required environment variables
    required_vars=("KONG_DATABASE" "KONG_DECLARATIVE_CONFIG")
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            echo "Required environment variable $var is not set"
            exit 1
        fi
    done
    
    # Check if Kong configuration file exists
    if [ ! -f "$KONG_DECLARATIVE_CONFIG" ]; then
        echo "Kong configuration file not found: $KONG_DECLARATIVE_CONFIG"
        exit 1
    fi
    
    # Check if custom plugins directory exists
    if [ ! -d "/opt/kong/plugins/custom" ]; then
        echo "Custom plugins directory not found, creating..."
        mkdir -p /opt/kong/plugins/custom
    fi
    
    echo "Preflight checks completed"
}

# Function to wait for dependencies
wait_for_dependencies() {
    echo "Waiting for dependencies..."
    
    # Wait for Redis if configured
    if [ -n "$KONG_REDIS_HOST" ]; then
        wait_for_service "$KONG_REDIS_HOST" "${KONG_REDIS_PORT:-6379}" "Redis"
    fi
    
    echo "All dependencies are ready"
}

# Function to setup monitoring
setup_monitoring() {
    echo "Setting up monitoring..."
    
    # Create directories for logs
    mkdir -p /var/log/kong
    
    # Setup log rotation
    cat > /etc/logrotate.d/kong << EOF
/var/log/kong/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    copytruncate
    notifempty
}
EOF
    
    echo "Monitoring setup completed"
}

# Function for graceful shutdown
graceful_shutdown() {
    echo "Received shutdown signal..."
    
    # Stop health service
    if command -v pm2 &> /dev/null; then
        pm2 stop all
        pm2 delete all
    fi
    
    # Stop Kong gracefully
    kong quit --wait=15
    
    echo "Graceful shutdown completed"
    exit 0
}

# Setup signal handlers
trap graceful_shutdown SIGTERM SIGINT

# Main execution flow
main() {
    echo "Fine Print AI Gateway starting..."
    echo "Environment: ${NODE_ENV:-development}"
    echo "Kong Version: $(kong version)"
    
    # Run preflight checks
    preflight_checks
    
    # Wait for dependencies
    wait_for_dependencies
    
    # Setup SSL certificates
    setup_ssl_certs
    
    # Validate Kong configuration
    validate_kong_config
    
    # Setup monitoring
    setup_monitoring
    
    # Start health check service
    start_health_service
    
    echo "Starting Kong Gateway..."
    
    # Execute the original command (Kong)
    exec "$@"
}

# Handle different execution modes
if [ "$1" = "kong" ]; then
    main "$@"
elif [ "$1" = "health-only" ]; then
    echo "Starting health service only..."
    start_health_service
    
    # Keep container running
    while true; do
        sleep 30
        if ! pm2 status gateway-health &> /dev/null; then
            echo "Health service stopped, restarting..."
            start_health_service
        fi
    done
elif [ "$1" = "validate" ]; then
    echo "Validating configuration only..."
    preflight_checks
    validate_kong_config
    echo "Configuration is valid"
    exit 0
else
    # Default behavior - run the command as-is
    exec "$@"
fi