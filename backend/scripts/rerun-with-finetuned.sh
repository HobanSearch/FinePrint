#!/bin/bash

# Fine Print AI - Re-run Analysis with Fine-tuned Models
# This script re-analyzes the Top 50 websites using the improved models

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "🔄 Fine Print AI - Re-run Analysis with Fine-tuned Models"
echo "========================================================="

# Configuration
LORA_SERVICE_URL="${LORA_SERVICE_URL:-http://localhost:8006}"
PRIVACY_SCORING_URL="${PRIVACY_SCORING_URL:-http://localhost:3011}"
MODEL_NAME="${1:-privacy-analyzer-v1}"

# Function to check service health
check_services() {
    echo -e "\n${BLUE}Checking services...${NC}"
    
    services=(
        "$LORA_SERVICE_URL/health"
        "$PRIVACY_SCORING_URL/health"
    )
    
    for service in "${services[@]}"; do
        if curl -s "$service" > /dev/null 2>&1; then
            echo -e "✓ ${service%%/health*} is healthy"
        else
            echo -e "${RED}✗ ${service%%/health*} is not responding${NC}"
            exit 1
        fi
    done
}

# Function to set fine-tuned model as default
set_finetuned_model() {
    echo -e "\n${BLUE}Setting $MODEL_NAME as default for privacy analysis...${NC}"
    
    # Set for privacy_analysis domain
    response=$(curl -s -X PUT "$LORA_SERVICE_URL/api/models/domains/privacy_analysis/default" \
        -H "Content-Type: application/json" \
        -d "{\"adapterId\": \"$MODEL_NAME\"}")
    
    if echo "$response" | grep -q "error"; then
        echo -e "${RED}Failed to set model: $response${NC}"
        exit 1
    else
        echo -e "${GREEN}✓ Model set as default${NC}"
    fi
}

# Function to create A/B test
create_ab_test() {
    echo -e "\n${BLUE}Creating A/B test...${NC}"
    
    response=$(curl -s -X POST "$LORA_SERVICE_URL/api/monitoring/ab-tests" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"Fine-tuned Model vs Baseline\",
            \"domain\": \"privacy_analysis\",
            \"baselineModel\": \"phi-2\",
            \"challengerModels\": [\"$MODEL_NAME\"],
            \"trafficAllocation\": {
                \"baseline\": 50,
                \"challengers\": {
                    \"$MODEL_NAME\": 50
                }
            },
            \"config\": {
                \"minSampleSize\": 50,
                \"maxDuration\": 24,
                \"primaryMetric\": \"composite\",
                \"autoStop\": true,
                \"autoPromote\": false
            }
        }")
    
    TEST_ID=$(echo "$response" | jq -r '.testId')
    
    if [ "$TEST_ID" != "null" ]; then
        echo -e "${GREEN}✓ A/B test created: $TEST_ID${NC}"
    else
        echo -e "${YELLOW}⚠ Could not create A/B test${NC}"
    fi
}

# Function to trigger re-analysis
rerun_analysis() {
    echo -e "\n${BLUE}Triggering re-analysis of Top 50 websites...${NC}"
    
    response=$(curl -s -X POST "$PRIVACY_SCORING_URL/api/scores/analyze-all" \
        -H "Content-Type: application/json" \
        -d '{"forceRefresh": true}')
    
    job_count=$(echo "$response" | jq -r '.jobs | length')
    
    if [ "$job_count" -gt 0 ]; then
        echo -e "${GREEN}✓ Queued $job_count websites for re-analysis${NC}"
        echo "Estimated time: $(echo "$response" | jq -r '.estimatedTime')"
    else
        echo -e "${RED}Failed to queue analysis${NC}"
        exit 1
    fi
}

# Function to monitor progress
monitor_progress() {
    echo -e "\n${BLUE}Monitoring analysis progress...${NC}"
    echo "Press Ctrl+C to stop monitoring (analysis will continue in background)"
    
    while true; do
        status=$(curl -s "$PRIVACY_SCORING_URL/api/scores/status")
        completed=$(echo "$status" | jq -r '.completed // 0')
        total=$(echo "$status" | jq -r '.total // 50')
        active=$(echo "$status" | jq -r '.activeJobs // 0')
        queued=$(echo "$status" | jq -r '.queuedJobs // 0')
        
        echo -ne "\r📊 Progress: $completed/$total completed | $active active | $queued queued    "
        
        if [ "$completed" -eq "$total" ]; then
            echo -e "\n${GREEN}✅ Analysis complete!${NC}"
            break
        fi
        
        sleep 5
    done
}

# Function to compare results
compare_results() {
    echo -e "\n${BLUE}Comparing model performance...${NC}"
    
    if [ -n "$TEST_ID" ]; then
        # Get A/B test results
        test_status=$(curl -s "$LORA_SERVICE_URL/api/monitoring/ab-tests/$TEST_ID")
        
        echo -e "\n${BLUE}A/B Test Results:${NC}"
        echo "$test_status" | jq '.metrics'
    fi
    
    # Get model metrics
    echo -e "\n${BLUE}Model Performance Metrics:${NC}"
    
    # Baseline
    baseline_metrics=$(curl -s "$LORA_SERVICE_URL/api/monitoring/metrics/phi-2")
    echo -e "\n${YELLOW}Baseline (phi-2):${NC}"
    echo "- Avg Response Time: $(echo "$baseline_metrics" | jq -r '.avgResponseTime')ms"
    echo "- Error Rate: $(echo "$baseline_metrics" | jq -r '.errorRate')"
    echo "- User Satisfaction: $(echo "$baseline_metrics" | jq -r '.userSatisfactionScore')"
    
    # Fine-tuned
    finetuned_metrics=$(curl -s "$LORA_SERVICE_URL/api/monitoring/metrics/$MODEL_NAME")
    echo -e "\n${YELLOW}Fine-tuned ($MODEL_NAME):${NC}"
    echo "- Avg Response Time: $(echo "$finetuned_metrics" | jq -r '.avgResponseTime')ms"
    echo "- Error Rate: $(echo "$finetuned_metrics" | jq -r '.errorRate')"
    echo "- User Satisfaction: $(echo "$finetuned_metrics" | jq -r '.userSatisfactionScore')"
    
    # Direct comparison
    echo -e "\n${BLUE}Direct Comparison:${NC}"
    comparison=$(curl -s -X POST "$LORA_SERVICE_URL/api/monitoring/metrics/compare" \
        -H "Content-Type: application/json" \
        -d "{
            \"baselineId\": \"phi-2\",
            \"challengerId\": \"$MODEL_NAME\"
        }")
    
    echo "$comparison" | jq '.'
}

# Function to export improved scores
export_scores() {
    echo -e "\n${BLUE}Exporting improved scores...${NC}"
    
    # Get all scores
    scores=$(curl -s "$PRIVACY_SCORING_URL/api/scores")
    
    # Save to file
    output_file="improved-scores-$(date +%Y%m%d-%H%M%S).json"
    echo "$scores" | jq '.' > "$output_file"
    
    echo -e "${GREEN}✓ Scores exported to: $output_file${NC}"
    
    # Show summary
    echo -e "\n${BLUE}Score Summary:${NC}"
    echo "$scores" | jq -r '.websites[] | "\(.name): \(.grade) (\(.score))"' | head -10
    echo "..."
}

# Main execution
main() {
    echo -e "${BLUE}Using model: $MODEL_NAME${NC}"
    
    # Check services
    check_services
    
    # Set fine-tuned model as default
    set_finetuned_model
    
    # Create A/B test (optional)
    echo -e "\n${YELLOW}Create A/B test? (y/n)${NC}"
    read -p "> " create_test
    if [ "$create_test" = "y" ]; then
        create_ab_test
    fi
    
    # Trigger re-analysis
    rerun_analysis
    
    # Monitor progress
    monitor_progress
    
    # Wait a bit for metrics to accumulate
    echo -e "\n${BLUE}Waiting for metrics to accumulate...${NC}"
    sleep 30
    
    # Compare results
    compare_results
    
    # Export scores
    export_scores
    
    echo -e "\n${GREEN}✅ Re-analysis complete!${NC}"
    echo -e "\n${BLUE}Key improvements to look for:${NC}"
    echo "1. More accurate pattern detection"
    echo "2. Better risk scoring calibration"
    echo "3. Improved explanation quality"
    echo "4. Domain-specific insights"
    echo "5. Reduced false positives"
    
    echo -e "\n${BLUE}Next steps:${NC}"
    echo "1. Review the exported scores"
    echo "2. Compare with baseline results"
    echo "3. Gather user feedback"
    echo "4. Iterate on model training"
}

# Run main function
main