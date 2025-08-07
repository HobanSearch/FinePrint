#!/bin/bash

# Fine Print AI - Install Dependencies Script
# This script installs dependencies for all applications

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}📦 Fine Print AI - Installing Dependencies${NC}"
echo "=============================================="

# Function to print status messages
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Function to install app dependencies
install_app_deps() {
    local app_path="$1"
    local app_name="$2"
    
    if [ -d "$app_path" ] && [ -f "$app_path/package.json" ]; then
        print_info "Installing dependencies for $app_name..."
        cd "$app_path"
        npm install
        print_status "$app_name dependencies installed"
        cd "$SCRIPT_DIR"
    else
        print_error "$app_name directory or package.json not found at $app_path"
        return 1
    fi
}

# Install dependencies for all applications
print_info "Installing dependencies for all applications..."

# Frontend
install_app_deps "$SCRIPT_DIR/apps/web" "Web Frontend"

# API
install_app_deps "$SCRIPT_DIR/apps/api" "API Backend"

# WebSocket
install_app_deps "$SCRIPT_DIR/apps/websocket" "WebSocket Service"

# Worker
install_app_deps "$SCRIPT_DIR/apps/worker" "Worker Service"

print_status "All dependencies installed successfully!"

echo
echo -e "${GREEN}🎉 Dependencies Installation Complete!${NC}"
echo "======================================"
echo
echo -e "${GREEN}Next Steps:${NC}"
echo "1. Run: ./infrastructure/scripts/setup/dev-setup.sh"
echo "2. Or manually start services: cd infrastructure/docker && docker-compose up -d"
echo
echo -e "${YELLOW}Note:${NC} You can now uncomment the application services in docker-compose.yml"
echo