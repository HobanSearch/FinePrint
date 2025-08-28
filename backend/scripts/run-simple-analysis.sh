#!/bin/bash

# Simplified Top 50 Analysis Runner
set -e

echo "🚀 Fine Print AI - Simple Analysis Runner"
echo "========================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Export environment variables
export DATABASE_URL="postgresql://postgres:password@localhost:5432/fineprintai"
export REDIS_URL="redis://localhost:6379"
export NEO4J_URL="bolt://localhost:7687"
export NEO4J_USER="neo4j"
export NEO4J_PASSWORD="fineprintai_neo4j_2024"
export OLLAMA_URL="http://localhost:11434"
export JWT_SECRET="development-secret-key"

# Check Docker services
echo -e "\n${BLUE}Checking Docker services...${NC}"
docker ps | grep -E "(postgres|redis|neo4j)" || {
    echo -e "${RED}Docker services not running. Please run: docker-compose up -d postgres redis neo4j${NC}"
    exit 1
}

# Run migrations
echo -e "\n${BLUE}Running database setup...${NC}"
cd services/privacy-scoring
npx prisma generate
npx prisma db push --skip-generate
cd ../..

# Start the privacy scoring service
echo -e "\n${BLUE}Starting Privacy Scoring Service...${NC}"
cd services/privacy-scoring
npm run dev &
PRIVACY_PID=$!
cd ../..

# Wait for service to start
echo "Waiting for service to start..."
sleep 10

# Check if service is running
if ! curl -s http://localhost:3007/health > /dev/null; then
    echo -e "${RED}Privacy Scoring Service failed to start${NC}"
    kill $PRIVACY_PID 2>/dev/null
    exit 1
fi

echo -e "${GREEN}✓ Privacy Scoring Service started${NC}"

# Trigger analysis
echo -e "\n${BLUE}Triggering Top 50 analysis...${NC}"

# Create a simple test to analyze just a few sites first
cat > /tmp/test-sites.json << 'EOF'
{
  "forceRefresh": true,
  "websites": [
    {
      "id": "facebook",
      "name": "Facebook",
      "category": "Social Media",
      "urls": {
        "privacy": "https://www.facebook.com/policy.php",
        "terms": "https://www.facebook.com/legal/terms"
      }
    },
    {
      "id": "google",
      "name": "Google",
      "category": "Technology",
      "urls": {
        "privacy": "https://policies.google.com/privacy",
        "terms": "https://policies.google.com/terms"
      }
    },
    {
      "id": "amazon",
      "name": "Amazon",
      "category": "E-commerce",
      "urls": {
        "privacy": "https://www.amazon.com/gp/help/customer/display.html?nodeId=468496",
        "terms": "https://www.amazon.com/gp/help/customer/display.html?nodeId=508088"
      }
    }
  ]
}
EOF

# Send the analysis request
echo "Sending analysis request..."
response=$(curl -s -X POST http://localhost:3007/api/scores/analyze-all \
    -H "Content-Type: application/json" \
    -d @/tmp/test-sites.json)

echo "Response: $response"

# Monitor progress
echo -e "\n${BLUE}Monitoring analysis progress...${NC}"
echo "Check status at: http://localhost:3007/api/scores/status"

# Function to check status
check_status() {
    local max_checks=60  # 10 minutes max
    local check_count=0
    
    while [ $check_count -lt $max_checks ]; do
        status=$(curl -s http://localhost:3007/api/scores/status 2>/dev/null || echo '{"error": "Failed to get status"}')
        echo "Status: $status"
        
        # Check if analysis is complete
        if echo "$status" | grep -q '"completed":3'; then
            echo -e "\n${GREEN}Analysis complete!${NC}"
            break
        fi
        
        sleep 10
        check_count=$((check_count + 1))
    done
}

check_status

# Get results
echo -e "\n${BLUE}Fetching analysis results...${NC}"
curl -s http://localhost:3007/api/scores | jq '.' > analysis-results.json || {
    curl -s http://localhost:3007/api/scores > analysis-results.json
}

echo -e "${GREEN}✅ Results saved to analysis-results.json${NC}"

# Cleanup
echo -e "\n${BLUE}Cleaning up...${NC}"
kill $PRIVACY_PID 2>/dev/null || true

echo -e "\n${GREEN}Analysis complete!${NC}"
echo "View results in: analysis-results.json"