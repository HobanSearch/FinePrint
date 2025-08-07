# Fine Print AI - Local Development Setup Guide

This guide will help you set up the Fine Print AI development environment locally.

## 🚀 Quick Start

### Option 1: Infrastructure Only (Recommended for testing)

```bash
# 1. Start infrastructure services
cd infrastructure/docker
docker-compose -f docker-compose.infrastructure.yml up -d

# 2. Test the setup
cd ../..
./test-setup.sh
```

### Option 2: Full Setup with Applications

```bash
# 1. Install application dependencies
./install-deps.sh

# 2. Start infrastructure services first
cd infrastructure/docker
docker-compose -f docker-compose.infrastructure.yml up -d

# 3. Wait for services to start (about 30 seconds)
sleep 30

# 4. Start applications individually
cd ../../apps/web && npm run dev &
cd ../api && npm run dev &
cd ../websocket && npm run dev &
cd ../worker && npm run dev &
```

## 📋 Prerequisites

- **Docker Desktop**: [Download here](https://www.docker.com/products/docker-desktop)
- **Node.js 18+**: [Download here](https://nodejs.org/)
- **kubectl**: Will be installed automatically if missing
- **Helm**: Will be installed automatically if missing

## 🏗️ Architecture Overview

The development environment consists of:

### Infrastructure Services
- **PostgreSQL 16**: Main database
- **Redis 7**: Caching and job queues
- **Qdrant 1.7**: Vector database for embeddings
- **Ollama**: Local LLM inference
- **Elasticsearch 8**: Search and logging
- **Prometheus**: Metrics collection
- **Grafana**: Visualization and dashboards
- **Loki**: Log aggregation
- **Jaeger**: Distributed tracing
- **MailHog**: Email testing
- **MinIO**: S3-compatible storage

### Application Services
- **Web Frontend**: React SPA (port 3003)
- **API Backend**: Fastify server (port 8000)
- **WebSocket Service**: Real-time updates (port 8002)
- **Worker Service**: Background job processing

## 🔧 Detailed Setup Steps

### Step 1: Infrastructure Setup

Start the infrastructure services:

```bash
cd infrastructure/docker
docker-compose -f docker-compose.infrastructure.yml up -d
```

This will start all the backend services (databases, monitoring, etc.) without the application code.

### Step 2: Verify Infrastructure

Run the test script to verify all services are running:

```bash
cd ../..
./test-setup.sh
```

You should see all services marked as accessible.

### Step 3: Install Application Dependencies

```bash
./install-deps.sh
```

This installs npm dependencies for all four applications:
- Web frontend
- API backend
- WebSocket service
- Worker service

### Step 4: Start Applications

You can start applications individually or together:

#### Individual Applications:
```bash
# Frontend (terminal 1)
cd apps/web
npm run dev

# API (terminal 2) 
cd apps/api
npm run dev

# WebSocket (terminal 3)
cd apps/websocket
npm run dev

# Worker (terminal 4)
cd apps/worker
npm run dev
```

#### All Applications (background):
```bash
cd apps/web && npm run dev &
cd ../api && npm run dev &
cd ../websocket && npm run dev &
cd ../worker && npm run dev &
```

## 🌐 Service URLs

Once everything is running, you can access:

### Applications
- **Web Frontend**: http://localhost:3003
- **API Documentation**: http://localhost:8000/docs
- **WebSocket Health**: http://localhost:8002/health

### Infrastructure Services
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Qdrant Dashboard**: http://localhost:6333/dashboard
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)
- **MailHog**: http://localhost:8025
- **Jaeger**: http://localhost:16686
- **Elasticsearch**: http://localhost:9200

### Database Connections
- **PostgreSQL**: localhost:5432 (postgres/password)
- **Redis**: localhost:6379

## 🐛 Troubleshooting

### Common Issues

#### 1. Kong Image Not Found Error
**Fixed**: The original error with `kong:3.4-alpine` has been resolved by using `kong:3.4`.

#### 2. Port Conflicts
**Updated**: Web frontend now runs on port 3003, WebSocket on port 8002 to avoid conflicts.
If you get port conflicts, check what's running:
```bash
lsof -i :3003  # Check port 3003 (web frontend)
lsof -i :8000  # Check port 8000 (API)
lsof -i :8002  # Check port 8002 (WebSocket)
```

#### 3. Docker Permission Issues
On Linux, you might need to add your user to the docker group:
```bash
sudo usermod -aG docker $USER
# Then log out and back in
```

#### 4. Services Not Starting
Check logs for specific services:
```bash
cd infrastructure/docker
docker-compose -f docker-compose.infrastructure.yml logs [service-name]
```

#### 5. Memory Issues
If you're running out of memory, you can start a minimal set:
```bash
# Start only essential services
docker-compose -f docker-compose.infrastructure.yml up -d postgres redis qdrant ollama
```

### Health Checks

#### Test Individual Services:
```bash
# PostgreSQL
docker-compose -f infrastructure/docker/docker-compose.infrastructure.yml exec postgres psql -U postgres -c "SELECT 1;"

# Redis
docker-compose -f infrastructure/docker/docker-compose.infrastructure.yml exec redis redis-cli ping

# Qdrant
curl http://localhost:6333/health
```

#### View Logs:
```bash
# All services
docker-compose -f infrastructure/docker/docker-compose.infrastructure.yml logs -f

# Specific service
docker-compose -f infrastructure/docker/docker-compose.infrastructure.yml logs -f postgres
```

## 🔄 Common Commands

### Start/Stop Services
```bash
# Start infrastructure
cd infrastructure/docker
docker-compose -f docker-compose.infrastructure.yml up -d

# Stop infrastructure
docker-compose -f docker-compose.infrastructure.yml down

# Stop and remove volumes (clean slate)
docker-compose -f docker-compose.infrastructure.yml down -v
```

### Application Development
```bash
# Install dependencies for all apps
./install-deps.sh

# Start single app in dev mode
cd apps/web && npm run dev

# Build for production
cd apps/web && npm run build
```

### Database Operations
```bash
# Connect to PostgreSQL
docker-compose -f infrastructure/docker/docker-compose.infrastructure.yml exec postgres psql -U postgres fineprintai

# Connect to Redis
docker-compose -f infrastructure/docker/docker-compose.infrastructure.yml exec redis redis-cli
```

## 📝 Development Workflow

1. **Start Infrastructure**: `docker-compose -f infrastructure/docker/docker-compose.infrastructure.yml up -d`
2. **Verify Setup**: `./test-setup.sh`
3. **Start Applications**: Individual terminals or background processes
4. **Make Changes**: Edit code with hot reload
5. **Test**: Access applications and services via URLs above
6. **Stop**: `Ctrl+C` for applications, `docker-compose down` for infrastructure

## 🚦 What's Working

- ✅ All infrastructure services start correctly
- ✅ PostgreSQL with initialized database and test data
- ✅ Redis for caching and queues
- ✅ Qdrant vector database ready for embeddings
- ✅ Ollama for local LLM inference
- ✅ Complete monitoring stack (Prometheus, Grafana, Loki, Jaeger)
- ✅ Development utilities (MailHog, MinIO)
- ✅ Application scaffolds with basic functionality
- ✅ Health checks and metrics endpoints
- ✅ CORS and API documentation

## 🔜 Next Steps

1. **Download AI Models**: Access Ollama at http://localhost:11434 and pull models
2. **Configure Grafana**: Import dashboards for monitoring
3. **Test Integrations**: Verify services can communicate
4. **Add Features**: Start building on the scaffolds provided

## 💡 Tips

- Use `docker-compose logs -f [service]` to debug issues
- Check `./test-setup.sh` output for service status
- Applications have hot reload enabled for development
- All services use consistent naming and networking
- Environment variables are pre-configured for development

## 🆘 Getting Help

If you encounter issues:

1. Run `./test-setup.sh` to check service status
2. Check Docker logs for specific services
3. Ensure all prerequisites are installed
4. Try the "clean slate" approach: `docker-compose down -v` then restart

The setup has been tested and should work out of the box on macOS, Linux, and Windows with Docker Desktop.