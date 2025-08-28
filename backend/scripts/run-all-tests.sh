#!/bin/bash

# Fine Print AI - Comprehensive Test Runner
# Executes all test suites and generates reports

set -e

echo "🧪 Fine Print AI - Comprehensive Test Suite"
echo "==========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
TEST_RESULTS=()

# Function to run a test suite
run_test_suite() {
    local NAME=$1
    local COMMAND=$2
    local START_TIME=$(date +%s)
    
    echo -e "\n${BLUE}Running $NAME...${NC}"
    echo "----------------------------------------"
    
    if eval "$COMMAND"; then
        local END_TIME=$(date +%s)
        local DURATION=$((END_TIME - START_TIME))
        echo -e "${GREEN}✅ $NAME passed (${DURATION}s)${NC}"
        TEST_RESULTS+=("✅ $NAME - PASSED (${DURATION}s)")
        ((PASSED_TESTS++))
    else
        local END_TIME=$(date +%s)
        local DURATION=$((END_TIME - START_TIME))
        echo -e "${RED}❌ $NAME failed (${DURATION}s)${NC}"
        TEST_RESULTS+=("❌ $NAME - FAILED (${DURATION}s)")
        ((FAILED_TESTS++))
    fi
    ((TOTAL_TESTS++))
}

# Create test reports directory
mkdir -p test-reports
REPORT_FILE="test-reports/test-run-$(date +%Y%m%d-%H%M%S).log"

# Redirect output to report file as well
exec > >(tee -a "$REPORT_FILE")
exec 2>&1

echo "Test run started at: $(date)"
echo "Environment: Local Development"
echo ""

# 1. Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"
./scripts/health-check.sh || {
    echo -e "${RED}Services are not healthy. Please run: npm run setup${NC}"
    exit 1
}

# 2. Unit Tests
echo -e "\n${YELLOW}🧩 Unit Tests${NC}"
echo "=============="

run_test_suite "Config Service Unit Tests" \
    "cd shared/config && npm test -- config-service.test.ts"

run_test_suite "Memory Service Unit Tests" \
    "cd shared/memory && npm test -- memory-service.test.ts"

run_test_suite "Logger Service Unit Tests" \
    "cd shared/logger && npm test"

run_test_suite "Auth Service Unit Tests" \
    "cd shared/auth && npm test"

# 3. Integration Tests
echo -e "\n${YELLOW}🔗 Integration Tests${NC}"
echo "===================="

run_test_suite "DSPy Service Integration Tests" \
    "cd services/dspy && npm test -- tests/integration/dspy-integration.test.ts"

run_test_suite "LoRA Service Integration Tests" \
    "cd services/lora && npm test -- tests/integration/lora-integration.test.ts"

run_test_suite "Knowledge Graph Integration Tests" \
    "cd services/knowledge-graph && npm test -- tests/integration/knowledge-graph-integration.test.ts"

run_test_suite "Agent Coordination Integration Tests" \
    "cd services/agent-coordination && npm test -- tests/integration"

run_test_suite "Memory Persistence Integration Tests" \
    "cd services/memory-persistence && npm test -- tests/integration"

run_test_suite "External Integrations Tests" \
    "cd services/external-integrations && npm test -- tests/integration"

# 4. End-to-End Tests
echo -e "\n${YELLOW}🚀 End-to-End Tests${NC}"
echo "==================="

run_test_suite "Autonomous Business Workflows E2E" \
    "npm test -- tests/e2e/autonomous-business-workflows.test.ts"

run_test_suite "Marketing Campaign E2E" \
    "npm test -- tests/e2e/marketing-campaign.test.ts"

run_test_suite "Sales Pipeline E2E" \
    "npm test -- tests/e2e/sales-pipeline.test.ts"

run_test_suite "Customer Support E2E" \
    "npm test -- tests/e2e/customer-support.test.ts"

# 5. Performance Tests (Quick)
echo -e "\n${YELLOW}⚡ Performance Tests (Quick)${NC}"
echo "==========================="

run_test_suite "API Performance Benchmark" \
    "k6 run --duration 30s --vus 10 tests/performance/api-benchmark.js"

run_test_suite "AI Inference Performance" \
    "k6 run --duration 30s --vus 5 tests/performance/ai-inference.js"

# 6. Security Tests
echo -e "\n${YELLOW}🔒 Security Tests${NC}"
echo "================="

run_test_suite "Authentication Tests" \
    "npm test -- tests/security/auth.test.ts"

run_test_suite "API Security Tests" \
    "npm test -- tests/security/api-security.test.ts"

# Generate test report
echo -e "\n${YELLOW}📊 Test Summary${NC}"
echo "==============="
echo "Total Tests Run: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo -e "Success Rate: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%"
echo ""
echo "Detailed Results:"
for result in "${TEST_RESULTS[@]}"; do
    echo "  $result"
done

# Generate JSON report
cat > test-reports/summary.json << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "local",
  "summary": {
    "total": $TOTAL_TESTS,
    "passed": $PASSED_TESTS,
    "failed": $FAILED_TESTS,
    "successRate": $(( PASSED_TESTS * 100 / TOTAL_TESTS ))
  },
  "results": [
$(printf '    "%s"' "${TEST_RESULTS[@]}" | sed 's/" "/",\n    "/g')
  ]
}
EOF

echo -e "\n📄 Full report saved to: $REPORT_FILE"
echo "📊 Summary saved to: test-reports/summary.json"

# Exit with appropriate code
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed${NC}"
    exit 1
fi