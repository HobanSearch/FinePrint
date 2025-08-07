# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fine Print AI is an autonomous, AI-powered platform that analyzes legal documents (Terms of Service, Privacy Policies, EULAs) to identify problematic clauses and provide actionable recommendations. Built with local LLMs for privacy and cost-efficiency.

## Project Structure

```
FinePrint/
├── PRD.md                    # Complete Product Requirements Document
├── AGENT_BRIEFS.md          # Sub-agent development specifications
├── TECH_STACK.md            # Complete technology stack documentation
├── BRAND_STRATEGY.md        # Brand & market positioning strategy
├── frontend/                # React application (Vite + TypeScript)
├── backend/                 # Node.js microservices (Fastify)
├── mobile/                  # React Native app (Expo)
├── extension/               # Browser extension (Plasmo)
├── infrastructure/          # Kubernetes, Docker, Terraform
├── docs/                    # Technical documentation
└── scripts/                 # Development and deployment scripts
```

## Technical Architecture

### Frontend Stack
- **Framework**: React 18.2 + TypeScript 5.0 + Vite 5.0
- **UI**: Tailwind CSS 3.4 + Radix UI + Framer Motion
- **State**: Zustand 4.4 + TanStack Query 5.0
- **Testing**: Vitest + React Testing Library + Playwright

### Backend Stack  
- **Runtime**: Node.js 20 LTS + Fastify 4.25 + TypeScript
- **Database**: PostgreSQL 16 + Prisma 5.7 + PgBouncer
- **Cache**: Redis 7.2 + ioredis
- **Queue**: BullMQ + Temporal workflow orchestration
- **Search**: Elasticsearch 8.11

### AI Infrastructure
- **Engine**: Ollama cluster with GPU support
- **Models**: Phi-2 (2.7B), Mistral (7B), Llama2 (13B), Mixtral (8x7B)
- **Vector DB**: Qdrant 1.7 for embeddings and semantic search
- **Deployment**: Kubernetes with auto-scaling

### Infrastructure & DevOps
- **Container**: Kubernetes 1.29 + Docker + Helm 3
- **CI/CD**: GitHub Actions + ArgoCD GitOps
- **API Gateway**: Kong + Auth0 + Rate limiting
- **Monitoring**: Prometheus + Grafana + Jaeger + Loki
- **Security**: Sealed Secrets + NGINX Ingress + ModSecurity WAF

See `TECH_STACK.md` for complete architecture details, scaling strategies, and cost optimization.

## Development Commands

```bash
# Project setup
npm run setup              # Initialize all services
docker-compose up          # Start development environment

# Frontend development
cd frontend
npm run dev               # Start dev server
npm run build             # Production build
npm run test              # Run tests

# Backend development
cd backend
npm run dev               # Start all microservices
npm run test              # Run test suite
npm run lint              # Code linting

# Full stack
npm run dev:full          # Start frontend + backend + AI services
npm run test:all          # Run all tests
npm run deploy:staging    # Deploy to staging environment
```

## Specialized Agent Usage

This project uses 18 specialized sub-agents for development. See `AGENT_BRIEFS.md` for complete specifications.

### Core Development Agents
- **UI/UX Design Agent**: Design system and components
- **Frontend Architecture Agent**: React application structure
- **Backend Architecture Agent**: Microservices and APIs
- **Database Architect Agent**: Schema and optimization
- **DevOps & Infrastructure Agent**: Kubernetes and CI/CD

### Business Operation Agents
- **Analytics Implementation Agent**: Product analytics setup  
- **Payment Integration Agent**: Stripe billing system
- **Email & Communication Agent**: Notification systems

### Specialized Agents
- **QA Automation Agent**: Testing frameworks
- **Security Engineer Agent**: Security implementation
- **Performance Engineer Agent**: Optimization
- **Legal Compliance Agent**: GDPR/CCPA features

## Key Development Principles

- **Privacy-First**: Local LLM processing, no data retention
- **Performance**: <5s document analysis, <200ms API responses
- **Accessibility**: WCAG 2.1 AA compliance
- **Security**: OWASP Top 10 mitigation, encryption at rest/transit
- **Scalability**: Microservices architecture with auto-scaling

## Pattern Detection Engine

Core AI functionality detects 50+ problematic patterns:
- Automatic renewals with difficult cancellation
- Broad data sharing permissions  
- Waiver of legal rights (class actions, jury trials)
- Hidden fees and charges
- Perpetual content licenses

## Agent Collaboration

Agents work together through:
- Shared TypeScript type definitions
- OpenAPI contract specifications
- Design tokens and component library
- Git-based documentation system
- Automated testing and CI/CD integration

## Development Guidelines

### Task Management and Code Quality
- Maintain comprehensive todo list items at all times
- Avoid losing track of previous tasks during planning
- Never use mock or example data
- Always create production-ready code to the best of our ability
- Utilize subagents for every task:
  * If no appropriate subagent exists, create a new agent with necessary capabilities
  * Create sub-sub agents to improve code production quality
- Conduct full review of all new code to ensure complete functionality
- Never simplify tests
- Track all root causes of issues
- For tests, always evaluate if more time is needed
- Prioritize full todo list tracking over conversation compacting

## Performance and Timeout Handling
- If we have a timeout issue after 2 minutes, increase the time out period to 5 minutes