#!/bin/bash

# Fine Print AI - Local Environment Setup Script
# This script sets up the complete local development environment

set -e

echo "🚀 Fine Print AI - Local Environment Setup"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check prerequisites
echo -e "\n📋 Checking prerequisites..."

if ! command_exists docker; then
    print_error "Docker is not installed. Please install Docker Desktop."
    exit 1
else
    print_status "Docker found"
fi

if ! command_exists node; then
    print_error "Node.js is not installed. Please install Node.js 20+"
    exit 1
else
    NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        print_error "Node.js version must be 20 or higher. Current: $(node -v)"
        exit 1
    fi
    print_status "Node.js $(node -v) found"
fi

if ! command_exists python3; then
    print_error "Python 3 is not installed. Please install Python 3.11+"
    exit 1
else
    print_status "Python $(python3 --version) found"
fi

# Create necessary directories
echo -e "\n📁 Creating directory structure..."
mkdir -p data/{postgres,redis,neo4j,models}
mkdir -p logs
mkdir -p .env
print_status "Directories created"

# Create .env files if they don't exist
echo -e "\n🔐 Setting up environment files..."

# Create main .env file
if [ ! -f .env/local.env ]; then
    cat > .env/local.env << EOF
# Fine Print AI - Local Environment Configuration
NODE_ENV=development

# Service Ports
CONFIG_SERVICE_PORT=8001
MEMORY_SERVICE_PORT=8002
LOGGER_SERVICE_PORT=8003
AUTH_SERVICE_PORT=8004
DSPY_SERVICE_PORT=8005
LORA_SERVICE_PORT=8006
KNOWLEDGE_GRAPH_SERVICE_PORT=8007
AGENT_COORDINATION_SERVICE_PORT=8008
MEMORY_PERSISTENCE_SERVICE_PORT=8009
EXTERNAL_INTEGRATIONS_SERVICE_PORT=8010

# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=fineprintai
POSTGRES_USER=fineprintai
POSTGRES_PASSWORD=fineprintai_local_2024

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=fineprintai_redis_2024

# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=fineprintai_neo4j_2024

# JWT Configuration
JWT_SECRET=fineprintai_jwt_secret_local_development_2024
JWT_EXPIRATION=7d

# External Services (Mock for local)
STRIPE_SECRET_KEY=sk_test_mock_key
STRIPE_WEBHOOK_SECRET=whsec_test_mock
SENDGRID_API_KEY=SG.mock_key
FROM_EMAIL=noreply@fineprintai.local
FROM_NAME=Fine Print AI Local

# AI Model Configuration
OLLAMA_HOST=http://localhost:11434
MODEL_PATH=/models
DEFAULT_MODEL=phi-2

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
EOF
    print_status "Created .env/local.env"
else
    print_warning ".env/local.env already exists, skipping"
fi

# Create docker-compose.yml
echo -e "\n🐳 Creating Docker Compose configuration..."
cat > docker-compose.local.yml << 'EOF'
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    container_name: fineprintai-postgres
    environment:
      POSTGRES_DB: fineprintai
      POSTGRES_USER: fineprintai
      POSTGRES_PASSWORD: fineprintai_local_2024
    ports:
      - "5432:5432"
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fineprintai"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: fineprintai-redis
    command: redis-server --requirepass fineprintai_redis_2024
    ports:
      - "6379:6379"
    volumes:
      - ./data/redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Neo4j Graph Database
  neo4j:
    image: neo4j:5.15-community
    container_name: fineprintai-neo4j
    environment:
      NEO4J_AUTH: neo4j/fineprintai_neo4j_2024
      NEO4J_PLUGINS: '["apoc", "graph-data-science"]'
      NEO4J_dbms_memory_pagecache_size: 1G
      NEO4J_dbms_memory_heap_max__size: 1G
    ports:
      - "7474:7474"  # HTTP
      - "7687:7687"  # Bolt
    volumes:
      - ./data/neo4j:/data
    healthcheck:
      test: ["CMD", "cypher-shell", "-u", "neo4j", "-p", "fineprintai_neo4j_2024", "MATCH (n) RETURN count(n)"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Ollama for AI Models
  ollama:
    image: ollama/ollama:latest
    container_name: fineprintai-ollama
    ports:
      - "11434:11434"
    volumes:
      - ./data/models:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  # Monitoring - Prometheus
  prometheus:
    image: prom/prometheus:latest
    container_name: fineprintai-prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus:/etc/prometheus
      - prometheus_data:/prometheus

  # Monitoring - Grafana
  grafana:
    image: grafana/grafana:latest
    container_name: fineprintai-grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_USERS_ALLOW_SIGN_UP: false
    ports:
      - "3001:3000"
    volumes:
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./monitoring/grafana/datasources:/etc/grafana/provisioning/datasources
      - grafana_data:/var/lib/grafana

volumes:
  prometheus_data:
  grafana_data:

networks:
  default:
    name: fineprintai-network
EOF
print_status "Created docker-compose.local.yml"

# Create database initialization script
echo -e "\n💾 Creating database initialization scripts..."
mkdir -p scripts/db
cat > scripts/db/init-postgres.sql << 'EOF'
-- Fine Print AI PostgreSQL Initialization Script

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS config;
CREATE SCHEMA IF NOT EXISTS memory;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS business;

-- Config Service Tables
CREATE TABLE IF NOT EXISTS config.configurations (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    schema JSONB,
    environment VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config.feature_flags (
    name VARCHAR(255) PRIMARY KEY,
    enabled BOOLEAN DEFAULT false,
    config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Memory Service Tables
CREATE TABLE IF NOT EXISTS memory.memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    importance FLOAT DEFAULT 0.5
);

CREATE INDEX idx_memories_agent_created ON memory.memories(agent_id, created_at DESC);
CREATE INDEX idx_memories_embedding ON memory.memories USING ivfflat (embedding vector_cosine_ops);

-- Auth Service Tables
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    api_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth.api_keys (
    key VARCHAR(255) PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    name VARCHAR(255),
    permissions JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP,
    expires_at TIMESTAMP
);

-- Business Tables
CREATE TABLE IF NOT EXISTS business.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(255) UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    plan VARCHAR(50),
    mrr DECIMAL(10, 2),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business.interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES business.customers(id),
    type VARCHAR(50),
    channel VARCHAR(50),
    content JSONB,
    outcome JSONB,
    agent_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_interactions_customer ON business.interactions(customer_id, created_at DESC);
CREATE INDEX idx_customers_plan ON business.customers(plan);

-- Create update trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_configurations_updated_at BEFORE UPDATE ON config.configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON config.feature_flags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Insert default data
INSERT INTO config.configurations (key, value) VALUES
    ('api.timeout', '30000'::jsonb),
    ('api.rateLimit', '{"window": 60000, "max": 100}'::jsonb),
    ('system.version', '"1.0.0"'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO config.feature_flags (name, enabled, config) VALUES
    ('newUI', false, '{"rollout": 0}'::jsonb),
    ('aiAgents', true, '{"domains": ["marketing", "sales", "support"]}'::jsonb),
    ('advancedAnalytics', true, '{}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Create test user
INSERT INTO auth.users (email, name, role) VALUES
    ('admin@fineprintai.local', 'Admin User', 'admin'),
    ('test@fineprintai.local', 'Test User', 'user')
ON CONFLICT (email) DO NOTHING;
EOF
print_status "Created PostgreSQL initialization script"

# Create Neo4j initialization script
cat > scripts/db/init-neo4j.cypher << 'EOF'
// Fine Print AI Neo4j Initialization Script

// Create constraints
CREATE CONSTRAINT customer_id IF NOT EXISTS FOR (c:Customer) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT product_id IF NOT EXISTS FOR (p:Product) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT agent_id IF NOT EXISTS FOR (a:Agent) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT campaign_id IF NOT EXISTS FOR (m:Campaign) REQUIRE m.id IS UNIQUE;

// Create indexes
CREATE INDEX customer_email IF NOT EXISTS FOR (c:Customer) ON (c.email);
CREATE INDEX interaction_timestamp IF NOT EXISTS FOR (i:Interaction) ON (i.timestamp);
CREATE INDEX ticket_status IF NOT EXISTS FOR (t:Ticket) ON (t.status);

// Create sample data
MERGE (p1:Product {id: 'starter', name: 'Starter Plan', price: 29, features: ['basic_analysis', 'email_support']})
MERGE (p2:Product {id: 'professional', name: 'Professional Plan', price: 99, features: ['advanced_analysis', 'priority_support', 'api_access']})
MERGE (p3:Product {id: 'enterprise', name: 'Enterprise Plan', price: 499, features: ['custom_models', 'dedicated_support', 'sla']})

// Create sample agents
MERGE (a1:Agent {id: 'marketing_agent_001', type: 'marketing', model: 'mistral-7b'})
MERGE (a2:Agent {id: 'sales_agent_001', type: 'sales', model: 'llama2-13b'})
MERGE (a3:Agent {id: 'support_agent_001', type: 'support', model: 'phi-2'})

RETURN "Neo4j initialized successfully" as message;
EOF
print_status "Created Neo4j initialization script"

# Create monitoring configuration
echo -e "\n📊 Setting up monitoring configuration..."
mkdir -p monitoring/prometheus
cat > monitoring/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'fineprintai-services'
    static_configs:
      - targets:
        - 'host.docker.internal:8001'  # Config Service
        - 'host.docker.internal:8002'  # Memory Service
        - 'host.docker.internal:8003'  # Logger Service
        - 'host.docker.internal:8004'  # Auth Service
        - 'host.docker.internal:8005'  # DSPy Service
        - 'host.docker.internal:8006'  # LoRA Service
        - 'host.docker.internal:8007'  # Knowledge Graph
        - 'host.docker.internal:8008'  # Agent Coordination
        - 'host.docker.internal:8009'  # Memory Persistence
        - 'host.docker.internal:8010'  # External Integrations

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']

  - job_name: 'neo4j'
    static_configs:
      - targets: ['neo4j:2004']
EOF
print_status "Created Prometheus configuration"

# Create npm run scripts
echo -e "\n📦 Setting up npm scripts..."
cat > package.json << 'EOF'
{
  "name": "@fineprintai/backend",
  "version": "1.0.0",
  "description": "Fine Print AI - Autonomous Business Operations Platform",
  "scripts": {
    "setup": "./scripts/setup-local-env.sh",
    "docker:up": "docker-compose -f docker-compose.local.yml up -d",
    "docker:down": "docker-compose -f docker-compose.local.yml down",
    "docker:logs": "docker-compose -f docker-compose.local.yml logs -f",
    "db:init": "npm run db:init:postgres && npm run db:init:neo4j",
    "db:init:postgres": "docker exec -i fineprintai-postgres psql -U fineprintai -d fineprintai < scripts/db/init-postgres.sql",
    "db:init:neo4j": "docker exec -i fineprintai-neo4j cypher-shell -u neo4j -p fineprintai_neo4j_2024 < scripts/db/init-neo4j.cypher",
    "services:install": "npm run install:shared && npm run install:services",
    "install:shared": "cd shared && npm install",
    "install:services": "cd services && npm install",
    "build:all": "npm run build:shared && npm run build:services",
    "build:shared": "cd shared && npm run build",
    "build:services": "cd services && npm run build",
    "dev": "npm run dev:services",
    "dev:services": "concurrently -n config,memory,logger,auth,dspy,lora,graph,coord,persist,external -c cyan,green,yellow,blue,magenta,red,white,gray,orange,purple npm:dev:*",
    "dev:config": "cd shared/config && npm run dev",
    "dev:memory": "cd shared/memory && npm run dev",
    "dev:logger": "cd shared/logger && npm run dev",
    "dev:auth": "cd shared/auth && npm run dev",
    "dev:dspy": "cd services/dspy && npm run dev",
    "dev:lora": "cd services/lora && npm run dev",
    "dev:graph": "cd services/knowledge-graph && npm run dev",
    "dev:coord": "cd services/agent-coordination && npm run dev",
    "dev:persist": "cd services/memory-persistence && npm run dev",
    "dev:external": "cd services/external-integrations && npm run dev",
    "test": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:unit": "jest --testMatch='**/*.test.ts' --testPathIgnorePatterns='integration|e2e'",
    "test:integration": "jest --testMatch='**/integration/**/*.test.ts'",
    "test:e2e": "jest --testMatch='**/e2e/**/*.test.ts'",
    "test:load": "k6 run tests/performance/load-tests.ts",
    "health:check": "./scripts/health-check.sh",
    "logs": "docker-compose -f docker-compose.local.yml logs -f",
    "clean": "rm -rf node_modules data logs",
    "reset": "npm run docker:down && npm run clean && npm run setup"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "concurrently": "^8.2.0",
    "jest": "^29.5.0",
    "k6": "^0.47.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.0.0"
  }
}
EOF
print_status "Created package.json"

# Create health check script
cat > scripts/health-check.sh << 'EOF'
#!/bin/bash

echo "🏥 Checking service health..."
echo "============================="

SERVICES=(
    "Config:8001"
    "Memory:8002"
    "Logger:8003"
    "Auth:8004"
    "DSPy:8005"
    "LoRA:8006"
    "Knowledge Graph:8007"
    "Agent Coordination:8008"
    "Memory Persistence:8009"
    "External Integrations:8010"
)

ALL_HEALTHY=true

for SERVICE in "${SERVICES[@]}"; do
    IFS=':' read -r NAME PORT <<< "$SERVICE"
    if curl -sf "http://localhost:$PORT/health" > /dev/null; then
        echo "✅ $NAME (port $PORT) - Healthy"
    else
        echo "❌ $NAME (port $PORT) - Not responding"
        ALL_HEALTHY=false
    fi
done

echo ""
if $ALL_HEALTHY; then
    echo "✅ All services are healthy!"
    exit 0
else
    echo "❌ Some services are not healthy"
    exit 1
fi
EOF
chmod +x scripts/health-check.sh
print_status "Created health check script"

# Install npm dependencies
echo -e "\n📦 Installing npm dependencies..."
npm install
print_status "Dependencies installed"

# Start Docker services
echo -e "\n🐳 Starting Docker services..."
docker-compose -f docker-compose.local.yml up -d

# Wait for services to be ready
echo -e "\n⏳ Waiting for services to start..."
sleep 10

# Initialize databases
echo -e "\n💾 Initializing databases..."
npm run db:init
print_status "Databases initialized"

# Pull Ollama models
echo -e "\n🤖 Pulling AI models..."
docker exec fineprintai-ollama ollama pull phi
docker exec fineprintai-ollama ollama pull mistral
print_status "AI models pulled"

echo -e "\n✅ ${GREEN}Setup complete!${NC}"
echo -e "\n📋 Next steps:"
echo "1. Install service dependencies: npm run services:install"
echo "2. Build all services: npm run build:all"
echo "3. Start all services: npm run dev"
echo "4. Check health: npm run health:check"
echo "5. Run tests: npm run test"
echo ""
echo "📚 Documentation:"
echo "- System overview: backend/docs/AUTONOMOUS_AI_SYSTEM_INTEGRATION.md"
echo "- Quick start: backend/docs/DEVELOPER_QUICK_START.md"
echo ""
echo "🎯 Access points:"
echo "- Services: http://localhost:8001-8010"
echo "- Neo4j Browser: http://localhost:7474"
echo "- Grafana: http://localhost:3001 (admin/admin)"
echo "- Prometheus: http://localhost:9090"
EOF