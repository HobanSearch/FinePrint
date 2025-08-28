# Fine Print AI - Local Testing Guide

## 🚀 Quick Start

### Prerequisites
- Docker Desktop installed and running
- Node.js 20+ installed
- At least 8GB RAM available
- 20GB free disk space

### Starting the Complete System

```bash
# 1. Start all services
npm run start:all

# 2. Check system health
npm run health

# 3. Initialize AI models (if not already done)
npm run init:models
```

The system will be available at:
- **Main App**: http://localhost:3003
- **Admin Dashboard**: http://localhost:3003/admin
- **API**: http://localhost:8000
- **Temporal UI**: http://localhost:8088

## 🧪 Testing the AI Improvement System

### 1. Testing A/B Testing Flow

#### Start a Marketing A/B Test
```bash
# Start a marketing content optimization test
curl -X POST http://localhost:3020/experiments/marketing \
  -H "Content-Type: application/json" \
  -d '{
    "duration": 7,
    "variants": ["control", "personalized"]
  }'
```

#### Monitor the Test
1. Open Admin Dashboard: http://localhost:3003/admin/experiments
2. Watch real-time metrics update
3. View statistical significance calculations

#### Check Test Results
```bash
# Get active experiments
curl http://localhost:3020/experiments/active

# Get experiment history
curl http://localhost:3020/experiments/history
```

### 2. Testing Model Improvements

#### Trigger a Model Failure
```bash
# Simulate poor performance feedback
curl -X POST http://localhost:3040/feedback/explicit/rating \
  -H "Content-Type: application/json" \
  -d '{
    "contentId": "content_123",
    "rating": 1,
    "comment": "Poor quality content",
    "modelType": "marketing"
  }'
```

#### Watch Improvement Workflow
1. Open Temporal UI: http://localhost:8088
2. Navigate to "Workflows" tab
3. Watch the ModelImprovementWorkflow execute
4. See stages: Detection → Analysis → Retraining → Deployment

#### Verify Model Update
```bash
# Check agent performance
curl http://localhost:3001/agents/performance
```

### 3. Testing Content Optimization

#### Request Optimized Content
```bash
# Get optimized marketing content
curl http://localhost:3030/content/marketing/homepage

# Get personalized sales messaging
curl "http://localhost:3030/content/sales/messaging?segment=enterprise"
```

#### Test Personalization
```bash
# Test different user segments
for segment in startup smb enterprise; do
  echo "Testing segment: $segment"
  curl "http://localhost:3030/content/marketing/homepage?segment=$segment"
  echo ""
done
```

### 4. Testing Feedback Collection

#### Send Implicit Feedback
```bash
# Track a click event
curl -X POST http://localhost:3040/feedback/implicit/event \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "click",
    "elementId": "ai-headline",
    "modelVersion": "marketing-v3",
    "context": {
      "page": "homepage",
      "segment": "enterprise"
    }
  }'
```

#### Send Explicit Feedback
```bash
# Submit a rating
curl -X POST http://localhost:3040/feedback/explicit/rating \
  -H "Content-Type: application/json" \
  -d '{
    "contentId": "content_456",
    "rating": 5,
    "comment": "Excellent analysis",
    "modelType": "analytics"
  }'
```

## 📊 Testing Business Scenarios

### Scenario 1: Marketing Campaign Optimization

```bash
# 1. Start marketing experiment
curl -X POST http://localhost:3020/experiments/marketing \
  -d '{"duration": 1}'

# 2. Generate user interactions
for i in {1..100}; do
  curl -X POST http://localhost:3040/feedback/implicit/event \
    -H "Content-Type: application/json" \
    -d "{
      \"eventType\": \"click\",
      \"elementId\": \"cta-button\",
      \"modelVersion\": \"marketing-v$((RANDOM % 2 + 1))\",
      \"context\": {\"conversionValue\": $((RANDOM % 1000))}
    }"
done

# 3. Check results
curl http://localhost:3020/experiments/active
```

### Scenario 2: Sales Qualification Testing

```bash
# Test sales agent with different lead types
curl -X POST http://localhost:3001/agents/test \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sales",
    "prompt": "Qualify this lead: Enterprise company, 500 employees, interested in compliance features",
    "context": {
      "leadScore": 85,
      "industry": "finance"
    }
  }'
```

### Scenario 3: Support Quality Improvement

```bash
# 1. Start support quality test
curl -X POST http://localhost:3020/experiments/support \
  -d '{"duration": 1}'

# 2. Simulate support interactions
curl -X POST http://localhost:3001/agents/test \
  -H "Content-Type: application/json" \
  -d '{
    "type": "support",
    "prompt": "Customer is confused about privacy policy analysis features",
    "context": {
      "customerTier": "professional",
      "sentiment": "frustrated"
    }
  }'
```

## 🔍 Monitoring & Debugging

### View Service Logs
```bash
# All services
npm run logs

# AI services only
npm run logs:ai

# Specific service
docker-compose -f infrastructure/docker/docker-compose.yml logs -f digital-twin
```

### Check Service Health
```bash
# Run health dashboard
npm run health

# Check specific service
curl http://localhost:3020/health
```

### Database Queries
```bash
# Connect to PostgreSQL
docker exec -it fineprintai-postgres-1 psql -U postgres -d fineprintai

# Example queries
SELECT * FROM experiments ORDER BY created_at DESC LIMIT 5;
SELECT * FROM feedback_events WHERE model_type = 'marketing' LIMIT 10;
```

### View Metrics
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger Tracing**: http://localhost:16686

## 🎯 End-to-End Test Flow

### Complete Improvement Cycle Test

```bash
# 1. Start the system
npm run start:all

# 2. Wait for services to be ready
sleep 30
npm run health

# 3. Initialize models
npm run init:models

# 4. Run E2E tests
npm run test:e2e

# 5. Manual verification
# - Visit http://localhost:3003
# - Upload a test document
# - Check analysis results
# - Visit admin dashboard
# - Verify A/B tests are running
```

## 🛠️ Troubleshooting

### Services Not Starting
```bash
# Check Docker status
docker ps -a

# View service logs
docker-compose -f infrastructure/docker/docker-compose.yml logs [service-name]

# Restart specific service
docker-compose -f infrastructure/docker/docker-compose.yml restart [service-name]
```

### Models Not Loading
```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Manually pull models
docker exec fineprintai-ollama-1 ollama pull mistral:7b

# Re-initialize business models
npm run init:models
```

### Database Connection Issues
```bash
# Check PostgreSQL
docker exec fineprintai-postgres-1 pg_isready

# Reset database
docker-compose -f infrastructure/docker/docker-compose.yml down postgres
docker-compose -f infrastructure/docker/docker-compose.yml up -d postgres
```

### Port Conflicts
```bash
# Find process using port
lsof -i :3020

# Kill process
kill -9 [PID]
```

## 📝 Test Data

### Sample Documents
Place test documents in `backend/tests/fixtures/`:
- `terms-of-service.pdf` - Sample ToS document
- `privacy-policy.pdf` - Sample privacy policy
- `eula.pdf` - Sample EULA

### Test Users
Default test accounts:
- Admin: `admin@fineprintai.local` / `admin123`
- User: `test@fineprintai.local` / `test123`

## 🔄 Continuous Testing

### Watch Mode for Development
```bash
# Terminal 1: Infrastructure
npm run start:all

# Terminal 2: Frontend
npm run frontend:dev

# Terminal 3: Backend API
npm run api:dev

# Terminal 4: Health monitoring
watch -n 5 npm run health
```

### Automated Testing Loop
```bash
# Run tests every 5 minutes
while true; do
  npm run test:improvement
  sleep 300
done
```

## 📊 Performance Testing

### Load Testing
```bash
# Install k6
brew install k6

# Run load test
k6 run backend/tests/performance/load-test.js
```

### Stress Testing
```bash
# Generate high load
for i in {1..1000}; do
  curl -X POST http://localhost:3040/feedback/implicit/event \
    -H "Content-Type: application/json" \
    -d '{"eventType": "click"}' &
done
```

## 🎉 Success Indicators

Your system is working correctly when:
1. ✅ All services show "HEALTHY" in health dashboard
2. ✅ Admin dashboard shows active experiments
3. ✅ Content optimizer returns different variants
4. ✅ Temporal UI shows completed workflows
5. ✅ Grafana shows metrics flowing
6. ✅ Models respond to test prompts
7. ✅ Feedback events are being processed
8. ✅ A/B tests show statistical significance

## 💡 Tips

- Start with small experiment durations (1 day) for testing
- Use the admin dashboard to monitor everything
- Check Temporal UI for workflow failures
- Monitor logs for errors
- Use health dashboard frequently
- Test one component at a time when debugging

## 📚 Additional Resources

- [System Architecture](./ARCHITECTURE.md)
- [API Documentation](./API.md)
- [Admin Dashboard Guide](./ADMIN_GUIDE.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)