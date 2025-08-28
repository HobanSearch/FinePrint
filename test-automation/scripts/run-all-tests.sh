#!/bin/bash

# Fine Print AI - Comprehensive Test Runner
# This script runs all tests in the correct order with proper setup and teardown

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
RESULTS_DIR="${PROJECT_ROOT}/test-results"
LOG_FILE="${RESULTS_DIR}/test-execution.log"

# Test flags
RUN_UNIT=true
RUN_INTEGRATION=true
RUN_E2E=true
RUN_PERFORMANCE=false
RUN_SECURITY=false
RUN_VISUAL=false
RUN_AI_VALIDATION=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --unit-only)
      RUN_INTEGRATION=false
      RUN_E2E=false
      RUN_PERFORMANCE=false
      RUN_SECURITY=false
      RUN_VISUAL=false
      RUN_AI_VALIDATION=false
      shift
      ;;
    --skip-unit)
      RUN_UNIT=false
      shift
      ;;
    --skip-integration)
      RUN_INTEGRATION=false
      shift
      ;;
    --skip-e2e)
      RUN_E2E=false
      shift
      ;;
    --with-performance)
      RUN_PERFORMANCE=true
      shift
      ;;
    --with-security)
      RUN_SECURITY=true
      shift
      ;;
    --with-visual)
      RUN_VISUAL=true
      shift
      ;;
    --skip-ai)
      RUN_AI_VALIDATION=false
      shift
      ;;
    --all)
      RUN_PERFORMANCE=true
      RUN_SECURITY=true
      RUN_VISUAL=true
      shift
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --unit-only       Run only unit tests"
      echo "  --skip-unit       Skip unit tests"
      echo "  --skip-integration Skip integration tests"
      echo "  --skip-e2e        Skip E2E tests"
      echo "  --with-performance Include performance tests"
      echo "  --with-security   Include security tests"
      echo "  --with-visual     Include visual regression tests"
      echo "  --skip-ai         Skip AI validation tests"
      echo "  --all             Run all test types"
      echo "  --help            Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

# Utility functions
log() {
  echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
  echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
  echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

run_test_suite() {
  local suite_name="$1"
  local test_command="$2"
  local required_services="$3"
  
  log "Starting $suite_name..."
  
  # Check if required services are running
  if [[ -n "$required_services" ]]; then
    check_services "$required_services"
  fi
  
  local start_time=$(date +%s)
  
  if eval "$test_command"; then
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    log_success "$suite_name completed successfully in ${duration}s"
    return 0
  else
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    log_error "$suite_name failed after ${duration}s"
    return 1
  fi
}

check_services() {
  local services="$1"
  
  for service in $services; do
    case $service in
      postgres)
        if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
          log_error "PostgreSQL is not running. Please start it with: docker-compose up -d postgres"
          exit 1
        fi
        ;;
      redis)
        if ! redis-cli ping >/dev/null 2>&1; then
          log_error "Redis is not running. Please start it with: docker-compose up -d redis"
          exit 1
        fi
        ;;
      ollama)
        if ! curl -f http://localhost:11434/api/tags >/dev/null 2>&1; then
          log_warning "Ollama is not running. AI validation tests will use mocks."
        fi
        ;;
    esac
  done
}

setup_test_environment() {
  log "Setting up test environment..."
  
  # Create results directory
  mkdir -p "$RESULTS_DIR"
  
  # Clear previous log
  > "$LOG_FILE"
  
  # Set test environment variables
  export NODE_ENV=test
  export DATABASE_URL="postgresql://test:test@localhost:5432/fineprintai_test"
  export REDIS_URL="redis://localhost:6379/1"
  export JWT_SECRET="test-jwt-secret-for-local-testing"
  export OLLAMA_BASE_URL="http://localhost:11434"
  
  # Navigate to project root
  cd "$PROJECT_ROOT"
  
  log_success "Test environment setup complete"
}

install_dependencies() {
  log "Installing dependencies..."
  
  # Install root dependencies
  if ! npm ci >/dev/null 2>&1; then
    log_error "Failed to install root dependencies"
    exit 1
  fi
  
  # Install backend dependencies
  cd "$PROJECT_ROOT/backend"
  if ! npm ci >/dev/null 2>&1; then
    log_error "Failed to install backend dependencies"
    exit 1
  fi
  
  # Install frontend dependencies
  cd "$PROJECT_ROOT/frontend"
  if ! npm ci >/dev/null 2>&1; then
    log_error "Failed to install frontend dependencies"
    exit 1
  fi
  
  cd "$PROJECT_ROOT"
  log_success "Dependencies installed successfully"
}

setup_databases() {
  log "Setting up test databases..."
  
  # Setup backend test database
  cd "$PROJECT_ROOT/backend"
  if ! npx prisma migrate deploy >/dev/null 2>&1; then
    log_warning "Database migration failed, attempting to create database..."
    createdb fineprintai_test 2>/dev/null || true
    npx prisma migrate deploy >/dev/null 2>&1 || log_warning "Migration still failed, tests may fail"
  fi
  
  # Clear Redis test databases
  redis-cli -n 1 FLUSHDB >/dev/null 2>&1 || log_warning "Could not clear Redis test DB"
  redis-cli -n 2 FLUSHDB >/dev/null 2>&1 || log_warning "Could not clear Redis integration test DB"
  
  cd "$PROJECT_ROOT"
  log_success "Test databases setup complete"
}

# Main test execution
main() {
  local total_start_time=$(date +%s)
  local failed_suites=()
  local passed_suites=()
  
  log "🚀 Starting Fine Print AI comprehensive test suite..."
  log "Configuration: Unit=$RUN_UNIT, Integration=$RUN_INTEGRATION, E2E=$RUN_E2E, Performance=$RUN_PERFORMANCE, Security=$RUN_SECURITY, Visual=$RUN_VISUAL, AI=$RUN_AI_VALIDATION"
  
  # Setup
  setup_test_environment
  install_dependencies
  setup_databases
  
  # Run linting first
  log "Running code quality checks..."
  if ! npm run lint >/dev/null 2>&1; then
    log_error "Linting failed"
    failed_suites+=("Linting")
  else
    log_success "Linting passed"
    passed_suites+=("Linting")
  fi
  
  # Backend unit tests
  if [[ "$RUN_UNIT" == "true" ]]; then
    if run_test_suite "Backend Unit Tests" "cd backend && npm test" "postgres redis"; then
      passed_suites+=("Backend Unit Tests")
    else
      failed_suites+=("Backend Unit Tests")
    fi
  fi
  
  # Frontend unit tests
  if [[ "$RUN_UNIT" == "true" ]]; then
    if run_test_suite "Frontend Unit Tests" "cd frontend && npm run test:coverage" ""; then
      passed_suites+=("Frontend Unit Tests")
    else
      failed_suites+=("Frontend Unit Tests")
    fi
  fi
  
  # Integration tests
  if [[ "$RUN_INTEGRATION" == "true" ]]; then
    if run_test_suite "Integration Tests" "cd backend && npm run test:integration" "postgres redis"; then
      passed_suites+=("Integration Tests")
    else
      failed_suites+=("Integration Tests")
    fi
  fi
  
  # AI validation tests
  if [[ "$RUN_AI_VALIDATION" == "true" ]]; then
    if run_test_suite "AI Validation Tests" "cd backend && npm run test:ai" ""; then
      passed_suites+=("AI Validation Tests")
    else
      failed_suites+=("AI Validation Tests")
    fi
  fi
  
  # E2E tests
  if [[ "$RUN_E2E" == "true" ]]; then
    # Install Playwright if needed
    if ! npx playwright --version >/dev/null 2>&1; then
      log "Installing Playwright..."
      npx playwright install
    fi
    
    if run_test_suite "E2E Tests" "npx playwright test" "postgres redis"; then
      passed_suites+=("E2E Tests")
    else
      failed_suites+=("E2E Tests")
    fi
  fi
  
  # Performance tests
  if [[ "$RUN_PERFORMANCE" == "true" ]]; then
    if command -v k6 >/dev/null 2>&1; then
      # Start backend server for performance tests
      cd "$PROJECT_ROOT/backend"
      npm start &
      local server_pid=$!
      
      # Wait for server to start
      sleep 10
      
      cd "$PROJECT_ROOT"
      if run_test_suite "Performance Tests" "k6 run k6-tests/load-test.js" "postgres redis"; then
        passed_suites+=("Performance Tests")
      else
        failed_suites+=("Performance Tests")
      fi
      
      # Stop server
      kill $server_pid 2>/dev/null || true
    else
      log_warning "k6 not installed, skipping performance tests"
    fi
  fi
  
  # Security tests
  if [[ "$RUN_SECURITY" == "true" ]]; then
    if command -v trivy >/dev/null 2>&1; then
      if run_test_suite "Security Tests" "trivy fs --exit-code 1 --severity HIGH,CRITICAL ." ""; then
        passed_suites+=("Security Tests")
      else
        failed_suites+=("Security Tests")
      fi
    else
      log_warning "Trivy not installed, skipping security tests"
    fi
  fi
  
  # Visual regression tests
  if [[ "$RUN_VISUAL" == "true" ]]; then
    if run_test_suite "Visual Regression Tests" "npx playwright test --grep '@visual'" "postgres redis"; then
      passed_suites+=("Visual Regression Tests")
    else
      failed_suites+=("Visual Regression Tests")
    fi
  fi
  
  # Generate test report
  local total_end_time=$(date +%s)
  local total_duration=$((total_end_time - total_start_time))
  
  log "📊 Test Summary"
  log "=============="
  log "Total execution time: ${total_duration}s"
  log "Passed suites (${#passed_suites[@]}): ${passed_suites[*]}"
  
  if [[ ${#failed_suites[@]} -gt 0 ]]; then
    log_error "Failed suites (${#failed_suites[@]}): ${failed_suites[*]}"
    log_error "❌ Test suite completed with failures"
    
    # Generate failure report
    echo "# Test Failure Report" > "$RESULTS_DIR/failure-report.md"
    echo "Date: $(date)" >> "$RESULTS_DIR/failure-report.md"
    echo "" >> "$RESULTS_DIR/failure-report.md"
    echo "## Failed Test Suites" >> "$RESULTS_DIR/failure-report.md"
    for suite in "${failed_suites[@]}"; do
      echo "- $suite" >> "$RESULTS_DIR/failure-report.md"
    done
    
    exit 1
  else
    log_success "✅ All test suites completed successfully!"
    
    # Generate success report
    echo "# Test Success Report" > "$RESULTS_DIR/success-report.md"
    echo "Date: $(date)" >> "$RESULTS_DIR/success-report.md"
    echo "Total execution time: ${total_duration}s" >> "$RESULTS_DIR/success-report.md"
    echo "" >> "$RESULTS_DIR/success-report.md"
    echo "All ${#passed_suites[@]} test suites passed successfully." >> "$RESULTS_DIR/success-report.md"
    
    exit 0
  fi
}

# Trap to cleanup on exit
cleanup() {
  log "Cleaning up..."
  # Kill any background processes
  jobs -p | xargs -r kill 2>/dev/null || true
}

trap cleanup EXIT

# Run main function
main "$@"